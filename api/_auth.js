import crypto from 'node:crypto';

export const AUTH_COOKIE_NAME = 'aigf4_gate';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAppPassword() {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error('Missing APP_PASSWORD on server.');
  }

  return password;
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET on server.');
  }

  return secret;
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = value;
      return cookies;
    }, {});
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildCookie(value, req, maxAgeSeconds) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isSecure = process.env.VERCEL === '1' || forwardedProto.includes('https');

  return [
    `${AUTH_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    isSecure ? 'Secure' : '',
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function createSignedSessionToken(secret) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    }),
    'utf8',
  ).toString('base64url');

  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

function verifySignedSessionToken(token, secret) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = sign(payload, secret);
  if (!safeCompare(signature, expectedSignature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded?.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function isAuthenticatedRequest(req) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) {
      return false;
    }

    return verifySignedSessionToken(token, getSessionSecret());
  } catch {
    return false;
  }
}

export function requireAuthenticatedRequest(req, res) {
  if (isAuthenticatedRequest(req)) {
    return true;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export function setAuthenticatedSession(req, res) {
  const token = createSignedSessionToken(getSessionSecret());
  res.setHeader('Set-Cookie', buildCookie(token, req, SESSION_MAX_AGE_SECONDS));
}

export function clearAuthenticatedSession(req, res) {
  res.setHeader('Set-Cookie', buildCookie('', req, 0));
}

export function validatePassword(candidate) {
  return safeCompare(String(candidate || ''), getAppPassword());
}
