import { createHash } from 'node:crypto';

const localCounters = new Map();

function env(name) {
  return String(process.env[name] || '').trim();
}

function redisConfig() {
  return {
    url: env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL'),
    token: env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN')
  };
}

function requestIp(req) {
  const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = String(value || req.headers['x-real-ip'] || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 64);

  return ip || 'unknown';
}

function rateLimitKey(req, scope, windowSeconds) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const identity = createHash('sha256')
    .update(`${scope}:${requestIp(req)}`)
    .digest('hex')
    .slice(0, 32);

  return `ratelimit:${scope}:${bucket}:${identity}`;
}

function localRateLimit(key, limit, windowSeconds) {
  const now = Date.now();
  const current = localCounters.get(key);
  const next = current && current.expiresAt > now
    ? { count: current.count + 1, expiresAt: current.expiresAt }
    : { count: 1, expiresAt: now + windowSeconds * 1000 };

  localCounters.set(key, next);

  if (localCounters.size > 5000) {
    for (const [storedKey, value] of localCounters) {
      if (value.expiresAt <= now) localCounters.delete(storedKey);
    }
  }

  return {
    allowed: next.count <= limit,
    remaining: Math.max(limit - next.count, 0),
    retryAfter: Math.max(Math.ceil((next.expiresAt - now) / 1000), 1)
  };
}

async function redisRateLimit(key, limit, windowSeconds) {
  const { url, token } = redisConfig();
  if (!url || !token) return null;

  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds * 2]
    ])
  });

  if (!response.ok) {
    throw new Error(`Rate-limit storage returned ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.some((item) => item.error)) {
    throw new Error('Rate-limit storage returned an invalid response');
  }

  const count = Number(payload[0]?.result) || 0;
  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    retryAfter: windowSeconds
  };
}

export async function checkRateLimit(req, { scope, limit, windowSeconds }) {
  const key = rateLimitKey(req, scope, windowSeconds);

  try {
    return await redisRateLimit(key, limit, windowSeconds)
      || localRateLimit(key, limit, windowSeconds);
  } catch (error) {
    console.error('Rate-limit storage error:', error.message);
    return localRateLimit(key, limit, windowSeconds);
  }
}

export function applyRateLimitHeaders(res, result, limit) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
  }
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanText(value, maxLength, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';

  const withoutControls = value.replace(
    multiline
      ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
      : /[\u0000-\u001F\u007F]/g,
    ''
  );

  const normalized = multiline
    ? withoutControls.replace(/\r\n?/g, '\n').trim()
    : withoutControls.replace(/\s+/g, ' ').trim();

  return normalized.slice(0, maxLength);
}

export function exceedsLength(value, maxLength) {
  return typeof value === 'string' && value.length > maxLength;
}
