const crypto = require('node:crypto');

const COOKIE_NAME = 'byabot_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret(config) {
  return config.panelPassword || '';
}

function createSession(config) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  const signature = crypto.createHmac('sha256', getSecret(config)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isValidSession(config, value) {
  if (!value || !getSecret(config)) return false;
  const [expiresAt, signature] = value.split('.');
  if (!expiresAt || !signature || Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;

  const expected = crypto.createHmac('sha256', getSecret(config)).update(expiresAt).digest('base64url');
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function getCookie(request) {
  const cookies = request.headers.cookie || '';
  const match = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : '';
}

function requireAdmin(config, request, response, next) {
  if (!isValidSession(config, getCookie(request))) {
    return response.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function setSessionCookie(response, session) {
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(session)}; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict; Path=/`);
}

module.exports = { createSession, isValidSession, getCookie, requireAdmin, setSessionCookie };