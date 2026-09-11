const config = require('./config');

const API_URL = (config.storage.apiUrl || 'https://apifile.netlify.app').replace(/\/$/, '');
const ROOT = '/byabot';
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

let token;
let tokenExpiresAt = 0;

function apiPath(path) {
  return path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

function storagePath(name) {
  const normalized = `/${String(name).replace(/^\/+/, '')}`;
  return normalized === ROOT || normalized.startsWith(`${ROOT}/`)
    ? normalized
    : `${ROOT}${normalized}`;
}

function decodeTokenExpiration(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) || 0;
  } catch {
    return 0;
  }
}

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: '*/*' },
    body: JSON.stringify({
      username: config.storage.username,
      password: config.storage.password
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data?.token) {
    throw new Error(`Falha no login do armazenamento (${response.status})`);
  }

  token = body.data.token;
  tokenExpiresAt = decodeTokenExpiration(token);
  return token;
}

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (!token || !tokenExpiresAt || tokenExpiresAt - now <= TOKEN_REFRESH_MARGIN_SECONDS) {
    await login();
  }
  return token;
}

async function request(path, options = {}, retry = true) {
  const authToken = await getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      accept: '*/*',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
      authorization: `Bearer ${authToken}`
    }
  });

  if (response.status === 401 && retry) {
    token = undefined;
    tokenExpiresAt = 0;
    return request(path, options, false);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Erro no armazenamento (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body?.data ?? body;
}

async function ensureRootFolder() {
  return ensureFolder(ROOT);
}

async function ensureFolder(path) {
  try {
    await request('/api/folders/', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  } catch (error) {
    if (!error.message.includes('(400)')) throw error;
  }
}

async function readFile(name) {
  const path = storagePath(name);
  const result = await request(`/api/files/${apiPath(path)}`);
  if (typeof result === 'string') return result;
  if (typeof result?.content === 'string') return result.content;
  return result;
}

async function writeFile(name, content) {
  const path = storagePath(name);
  try {
    return await request(`/api/files/${apiPath(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  } catch (error) {
    if (!error.message.includes('(404)')) throw error;
    return request('/api/files/', {
      method: 'POST',
      body: JSON.stringify({ path, content })
    });
  }
}

async function listFolder(path = ROOT) {
  if (path === ROOT) return request('/api/folders/');
  return request(`/api/folders/${apiPath(path)}`);
}

module.exports = { ensureRootFolder, ensureFolder, listFolder, readFile, writeFile };