import { recordEvent } from './_analytics.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  cleanText,
  isPlainObject
} from './_security.js';

const ALLOWED_EVENTS = new Set(['pageview']);
const TRACK_LIMIT = 60;
const TRACK_WINDOW_SECONDS = 60;
const MAX_BODY_BYTES = 2_000;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,80}$/;
const SOURCE_LABELS = new Set([
  'Прямой переход',
  'Внутренний переход',
  'Другой источник'
]);

function normalizeId(value) {
  const result = cleanText(value, 80);
  return ID_PATTERN.test(result) ? result : '';
}

function normalizePath(value) {
  const path = cleanText(value, 160);
  if (!path.startsWith('/')) return '/';

  try {
    return new URL(path, 'https://tajcode-lab.ru').pathname.slice(0, 160) || '/';
  } catch {
    return '/';
  }
}

function normalizeSource(value) {
  const source = cleanText(value, 100);
  if (SOURCE_LABELS.has(source)) return source;

  const hostname = source
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');

  return /^[a-z0-9.-]{1,100}$/.test(hostname) && hostname.includes('.')
    ? hostname
    : 'Другой источник';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }

  const rateLimit = await checkRateLimit(req, {
    scope: 'track',
    limit: TRACK_LIMIT,
    windowSeconds: TRACK_WINDOW_SECONDS
  });
  applyRateLimitHeaders(res, rateLimit, TRACK_LIMIT);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Too many analytics events'
    });
  }

  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const input = req.body;
    if (!ALLOWED_EVENTS.has(input.event)) {
      return res.status(400).json({ success: false, error: 'Unsupported event' });
    }

    await recordEvent({
      event: input.event,
      visitorId: normalizeId(input.visitorId),
      sessionId: normalizeId(input.sessionId),
      path: normalizePath(input.path),
      source: normalizeSource(input.source)
    });
    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Analytics tracking error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: 'Analytics event was not stored'
    });
  }
}
