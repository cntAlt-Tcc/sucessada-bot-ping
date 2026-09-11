const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const config = require('./config');
const { copyPath, deleteFile, deleteFolder, ensureFolder, ensureRootFolder, getStorageRoot, listFolder, movePath, movePathAt, readFile, readFileAt, uploadFile, writeFile, writeFileAt, setStorageRoot } = require('./storage');
const { loadRemoteBot, getLoadedBot, getRemoteBotFile } = require('./remote-bot');
const { clear, event: logEvent, getEntries, getSummary, install: installLogger } = require('./logger');
const { createSession, getCookie, isValidSession, requireAdmin, setSessionCookie } = require('./admin');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 10 * 1024 * 1024 } });
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
installLogger();
app.use((request, response, next) => {
  const requestId = request.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  request.requestId = requestId;
  const startedAt = Date.now();
  response.setHeader('x-request-id', requestId);
  response.on('finish', () => {
    if (request.path.startsWith('/api/')) {
      logEvent(response.statusCode >= 400 ? 'warn' : 'info', 'http_request', `${request.method} ${request.path} ${response.statusCode}`, { requestId, meta: { durationMs: Date.now() - startedAt } });
    }
  });
  next();
});

const SOURCE_FILES = [{ id: 'bot', label: 'Bot Discord', file: 'src/bot.js' }];
const DEFAULT_BOT_NAME = 'byabot';
let botName = DEFAULT_BOT_NAME;
let SOURCE_ROOT = '/byabot/source';

function validBotName(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9_-]{0,39})$/i.test(value);
}

function setBotName(value) {
  botName = value.toLowerCase();
  setStorageRoot(`/${botName}`);
  SOURCE_ROOT = `/${botName}/source`;
}

async function loadBotIdentity() {
  let identity;
  try {
    identity = JSON.parse(await readFileAt('/byabot/botname.json'));
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      identity = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'botname.json'), 'utf8'));
    } catch {
      identity = { name: DEFAULT_BOT_NAME };
    }
    await writeFileAt('/byabot/botname.json', JSON.stringify(identity, null, 2));
  }
  if (!validBotName(identity?.name)) throw new Error('botname.json inválido');
  setBotName(identity.name);
  await ensureRootFolder();
  await ensureFolder(SOURCE_ROOT);
  await writeFile('botname.json', JSON.stringify({ name: botName }, null, 2));
}

function getSourceFile(id) {
  return SOURCE_FILES.find(item => item.id === id);
}

function sourcePath(value = '') {
  const normalized = `/${String(value).replace(/^\/+/, '')}`;
  if (normalized.includes('..') || !(normalized === SOURCE_ROOT || normalized.startsWith(`${SOURCE_ROOT}/`)) || !/^\/[\w-]+\/source(?:\/[\w.-]+)*$/.test(normalized)) {
    throw new Error('invalid_source_path');
  }
  return normalized;
}

function sourceRelative(value) {
  return sourcePath(value).replace(`${SOURCE_ROOT}/`, '').replace(SOURCE_ROOT, '');
}

async function ensureSourceParents(relative) {
  const parts = relative.split('/');
  parts.pop();
  let current = SOURCE_ROOT;
  for (const part of parts) {
    current += `/${part}`;
    await ensureFolder(current);
  }
}

function treeItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.children)) return data.children;
  return [];
}

async function readSourceTree(folder = SOURCE_ROOT) {
  const data = await listFolder(folder);
  const items = [];
  for (const item of treeItems(data)) {
    const name = typeof item === 'string' ? item : item.name || item.path;
    if (!name) continue;
    const type = item.type || item.kind || (item.children ? 'folder' : 'file');
    const path = name.startsWith('/') ? name : `${folder}/${name}`;
    if (type === 'folder' || type === 'directory') {
      items.push({ name, path, type: 'folder', children: await readSourceTree(path) });
    } else {
      items.push({ name, path, type: 'file' });
    }
  }
  return items;
}

async function seedSourceFile(source) {
  try {
    return await readFile(getRemoteBotFile());
  } catch (error) {
    if (error.status !== 404) throw error;
    const content = await fs.readFile(path.join(__dirname, '..', source.file), 'utf8');
    await writeFile(`${SOURCE_ROOT}/${source.file}`, content);
    return content;
  }
}

let startupPromise;

async function startServices() {
  if (!startupPromise) {
    logEvent('info', 'startup_begin', 'Inicialização do serviço iniciada', { stage: 'startup' });
    startupPromise = (async () => {
      try {
        logEvent('info', 'config_validate_start', 'Validando configuração', { stage: 'config' });
        config.validateConfig();
        logEvent('info', 'config_validate_ok', 'Configuração válida', { stage: 'config' });
        logEvent('info', 'storage_connect_start', 'Conectando à API File', { stage: 'storage' });
        await loadBotIdentity();
        await ensureFolder(`${SOURCE_ROOT}/src`);
        logEvent('info', 'storage_connect_ok', 'API File disponível', { stage: 'storage' });
      } catch (error) {
        error.startupStep = 'storage';
        logEvent('error', 'startup_failed', 'Falha na etapa de armazenamento', { stage: 'storage', code: `STORAGE_${error.status || 'UNAVAILABLE'}`, error });
        throw error;
      }

      let bot;
      try {
        logEvent('info', 'remote_source_load_start', `Carregando ${getRemoteBotFile()}`, { stage: 'remote_source' });
        bot = await loadRemoteBot();
        logEvent('info', 'discord_login_start', 'Conectando ao Gateway Discord', { stage: 'discord' });
        await bot.startBot();
        logEvent('info', 'discord_login_ok', 'Bot conectado ao Discord', { stage: 'discord', meta: bot.getStatus() });
      } catch (error) {
        error.startupStep = 'discord';
        logEvent('error', 'startup_failed', 'Falha na inicialização do Discord', { stage: 'discord', code: error.message === 'Used disallowed intents' ? 'DISALLOWED_INTENTS' : 'DISCORD_LOGIN_FAILED', error });
        throw error;
      }

      await writeFile('runtime.json', JSON.stringify({ lastStartedAt: new Date().toISOString(), bot: getLoadedBot().getStatus() }, null, 2));
      logEvent('info', 'startup_complete', 'Serviço iniciado com sucesso', { stage: 'runtime' });
    })().catch(error => {
      startupPromise = undefined;
      throw error;
    });
  }
  await startupPromise;
}

app.get('/', (_request, response) => {
  response.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/api/admin/login', (request, response) => {
  if (!config.panelPassword) {
    return response.status(503).json({ ok: false, error: 'panel_password_not_configured' });
  }
  if (typeof request.body?.password !== 'string' || request.body.password !== config.panelPassword) {
    return response.status(401).json({ ok: false, error: 'invalid_password' });
  }
  setSessionCookie(response, createSession(config));
  return response.json({ ok: true });
});

app.post('/api/admin/logout', (_request, response) => {
  response.setHeader('Set-Cookie', 'byabot_admin=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');
  response.json({ ok: true });
});

app.get('/api/admin/session', (request, response) => {
  response.json({ authenticated: isValidSession(config, getCookie(request)) });
});

app.get('/api/admin/bot-name', requireAdmin.bind(null, config), (_request, response) => {
  response.json({ ok: true, name: botName, root: getStorageRoot() });
});

app.put('/api/admin/bot-name', requireAdmin.bind(null, config), async (request, response) => {
  const nextName = String(request.body?.name || '').trim().toLowerCase();
  if (!validBotName(nextName)) {
    return response.status(400).json({ ok: false, error: 'invalid_bot_name' });
  }
  if (nextName === botName) return response.json({ ok: true, name: botName, root: getStorageRoot(), changed: false });

  const previousName = botName;
  const previousRoot = getStorageRoot();
  const nextRoot = `/${nextName}`;
  try {
    try {
      await listFolder(nextRoot);
      return response.status(409).json({ ok: false, error: 'bot_name_exists' });
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    await getLoadedBot()?.stopBot?.();
    await movePathAt(previousRoot, nextRoot);
    setBotName(nextName);
    await ensureRootFolder();
    await ensureFolder(`${SOURCE_ROOT}/src`);
    await writeFile('botname.json', JSON.stringify({ name: botName }, null, 2));
    await writeFileAt('/byabot/botname.json', JSON.stringify({ name: botName }, null, 2));
    await loadRemoteBot();
    await getLoadedBot().startBot();
    response.json({ ok: true, name: botName, root: getStorageRoot(), changed: true });
  } catch (error) {
    setBotName(previousName);
    console.error('Falha ao renomear bot:', error);
    response.status(502).json({ ok: false, error: 'bot_rename_failed' });
  }
});

app.get('/api/admin/source', requireAdmin.bind(null, config), (_request, response) => {
  response.json({ ok: true, files: SOURCE_FILES });
});

app.get('/api/admin/source-tree', requireAdmin.bind(null, config), async (_request, response) => {
  try {
    await ensureFolder(SOURCE_ROOT);
    response.json({ ok: true, tree: await readSourceTree() });
  } catch (error) {
    console.error('Falha ao ler árvore de source:', error);
    response.status(502).json({ ok: false, error: 'source_tree_failed' });
  }
});

app.get('/api/admin/source/item', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const path = sourcePath(request.query.path);
    response.json({ ok: true, path, content: await readFile(path) });
  } catch (error) {
    response.status(502).json({ ok: false, error: 'source_read_failed' });
  }
});

app.put('/api/admin/source/item', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const path = sourcePath(request.body?.path);
    if (typeof request.body?.content !== 'string' || request.body.content.length > 500000) {
      return response.status(400).json({ ok: false, error: 'invalid_content' });
    }
    await writeFile(path, request.body.content);
    response.json({ ok: true, path, applied: path === getRemoteBotFile() });
  } catch (error) {
    response.status(400).json({ ok: false, error: 'source_write_failed' });
  }
});

app.post('/api/admin/source/folder', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const path = sourcePath(request.body?.path);
    if (path === SOURCE_ROOT) return response.status(400).json({ ok: false, error: 'invalid_folder_path' });
    await ensureFolder(path);
    response.status(201).json({ ok: true, path, type: 'folder' });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message === 'invalid_source_path' ? error.message : 'folder_create_failed' });
  }
});

app.post('/api/admin/source/file', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const path = sourcePath(request.body?.path);
    if (path === SOURCE_ROOT || path.endsWith('/')) return response.status(400).json({ ok: false, error: 'invalid_file_path' });
    const content = typeof request.body?.content === 'string' ? request.body.content : '';
    await ensureSourceParents(path.replace(`${SOURCE_ROOT}/`, ''));
    await writeFile(path, content);
    response.status(201).json({ ok: true, path, type: 'file' });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message === 'invalid_source_path' ? error.message : 'file_create_failed' });
  }
});

app.delete('/api/admin/source/item', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const path = sourcePath(request.body?.path);
    if (path === SOURCE_ROOT) return response.status(400).json({ ok: false, error: 'cannot_delete_source_root' });
    const type = request.body?.type;
    if (type === 'folder') await deleteFolder(path);
    else await deleteFile(path);
    response.json({ ok: true, path, type });
  } catch (error) {
    response.status(400).json({ ok: false, error: 'source_delete_failed' });
  }
});

app.post('/api/admin/source/copy', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const source = sourcePath(request.body?.source);
    const destination = sourcePath(request.body?.destination);
    await copyPath(source, destination);
    response.json({ ok: true, source, destination });
  } catch (error) {
    response.status(400).json({ ok: false, error: 'source_copy_failed' });
  }
});

app.post('/api/admin/source/move', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const source = sourcePath(request.body?.source);
    const destination = sourcePath(request.body?.destination);
    await movePath(source, destination);
    response.json({ ok: true, source, destination });
  } catch (error) {
    response.status(400).json({ ok: false, error: 'source_move_failed' });
  }
});

app.post('/api/admin/source/upload', requireAdmin.bind(null, config), upload.array('files', 20), async (request, response) => {
  try {
    const folder = sourcePath(request.body?.folder);
    if (!Array.isArray(request.files) || request.files.length === 0) return response.status(400).json({ ok: false, error: 'files_required' });
    const results = [];
    for (const file of request.files) {
      const safeName = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
      results.push(await uploadFile(`${folder}/${safeName}`, { ...file, originalname: safeName }));
    }
    response.status(201).json({ ok: true, files: results });
  } catch (error) {
    response.status(400).json({ ok: false, error: 'source_upload_failed' });
  }
});

app.get('/api/admin/logs', requireAdmin.bind(null, config), (request, response) => {
  response.json({ ok: true, entries: getEntries(request.query), summary: getSummary() });
});

app.delete('/api/admin/logs', requireAdmin.bind(null, config), (_request, response) => {
  clear();
  logEvent('info', 'logs_cleared', 'Console limpo pelo operador', { stage: 'admin' });
  response.json({ ok: true });
});

app.get('/api/admin/servers', requireAdmin.bind(null, config), async (_request, response) => {
  try {
    await startServices();
    response.json({ ok: true, servers: getLoadedBot().getServers() });
  } catch (error) {
    console.error('Falha ao listar servidores:', error);
    response.status(503).json({ ok: false, error: 'servers_unavailable' });
  }
});

app.delete('/api/admin/servers/:id', requireAdmin.bind(null, config), async (request, response) => {
  if (!/^\d{15,25}$/.test(request.params.id)) {
    return response.status(400).json({ ok: false, error: 'invalid_server_id' });
  }
  try {
    await startServices();
    await getLoadedBot().leaveServer(request.params.id);
    console.log(`Servidor removido: ${request.params.id}`);
    response.json({ ok: true, serverId: request.params.id });
  } catch (error) {
    console.error('Falha ao sair do servidor:', error);
    response.status(502).json({ ok: false, error: 'server_leave_failed' });
  }
});

app.get('/api/admin/source/:id', requireAdmin.bind(null, config), async (request, response) => {
  const source = getSourceFile(request.params.id);
  if (!source) return response.status(404).json({ ok: false, error: 'source_not_found' });
  try {
    await ensureFolder(SOURCE_ROOT);
    await ensureFolder(`${SOURCE_ROOT}/src`);
    response.json({ ok: true, ...source, content: await seedSourceFile(source) });
  } catch (error) {
    console.error('Falha ao ler source:', error);
    response.status(502).json({ ok: false, error: 'source_read_failed' });
  }
});

app.put('/api/admin/source/:id', requireAdmin.bind(null, config), async (request, response) => {
  const source = getSourceFile(request.params.id);
  if (!source) return response.status(404).json({ ok: false, error: 'source_not_found' });
  if (typeof request.body?.content !== 'string' || request.body.content.length > 500000) {
    return response.status(400).json({ ok: false, error: 'invalid_content' });
  }
  try {
    await writeFile(getRemoteBotFile(), request.body.content);
    const bot = getLoadedBot();
    if (typeof bot?.stopBot !== 'function') {
      return response.json({ ok: true, ...source, applied: false, restartRequired: true });
    }
    await bot.stopBot();
    await loadRemoteBot();
    await getLoadedBot().startBot();
    response.json({ ok: true, ...source, applied: true, restartRequired: false });
  } catch (error) {
    console.error('Falha ao salvar source:', error);
    response.status(502).json({ ok: false, error: 'source_write_failed' });
  }
});

app.get('/on', async (_request, response) => {
  try {
    await startServices();
    response.json({ ok: true, service: 'online', bot: getLoadedBot().getStatus() });
  } catch (error) {
    console.error('Falha ao iniciar serviços:', error);
    response.status(503).json({
      ok: false,
      service: 'offline',
      error: error.startupStep ? `${error.startupStep}_startup_failed` : 'startup_failed'
    });
  }
});

if (require.main === module) {
  const port = Number(config.port || 3000);
  app.listen(port, () => {
    console.log(`Health server ouvindo na porta ${port}`);
    startServices().catch(error => {
      console.error('Falha na inicialização automática:', error);
      process.exitCode = 1;
    });
  });
}

module.exports = app;