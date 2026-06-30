import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'taj_admin_session';

function env(name) {
  return String(process.env[name] || '').trim();
}

function adminUser() {
  return env('ADMIN_USERNAME') || 'admin';
}

function adminPassword() {
  return env('ADMIN_PASSWORD') || env('DASHBOARD_KEY');
}

function sessionSecret() {
  return env('TELEGRAM_WEBHOOK_SECRET') || env('DASHBOARD_KEY');
}

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest();
  const rightHash = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sessionValue() {
  const secret = sessionSecret();
  const password = adminPassword();
  if (!secret || !password) return '';

  return createHmac('sha256', secret)
    .update(`taj-admin:${adminUser()}:${password}`)
    .digest('hex');
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  const result = {};
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) continue;
    result[rawName] = decodeURIComponent(rawValue.join('=') || '');
  }
  return result;
}

function basicCredentials(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export function hasAdminSession(req) {
  const expected = sessionValue();
  const received = parseCookies(req)[COOKIE_NAME];
  return Boolean(expected && received && safeEqual(received, expected));
}

export function verifyAdminBasicAuth(req) {
  const expectedUser = adminUser();
  const expectedPassword = adminPassword();
  const credentials = basicCredentials(req);

  return Boolean(
    expectedPassword
    && credentials
    && safeEqual(credentials.user, expectedUser)
    && safeEqual(credentials.password, expectedPassword)
  );
}

export function setAdminSessionCookie(res) {
  const value = sessionValue();
  if (!value) return;

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 12}`
  );
}

export function clearAdminSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export function requireAdminPage(req, res) {
  if (!adminPassword()) {
    res.status(503).send('Admin password is not configured');
    return false;
  }

  if (hasAdminSession(req)) return true;

  if (verifyAdminBasicAuth(req)) {
    setAdminSessionCookie(res);
    return true;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="TAJCODE LAB Admin", charset="UTF-8"');
  res.status(401).send('Authentication required');
  return false;
}
