const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const config = require('./config');
const { deleteFile, deleteFolder, ensureFolder, ensureRootFolder, listFolder, readFile, writeFile } = require('./storage');
const { loadRemoteBot, getLoadedBot, REMOTE_BOT_FILE } = require('./remote-bot');
const { getEntries, install: installLogger } = require('./logger');
const { createSession, getCookie, isValidSession, requireAdmin, setSessionCookie } = require('./admin');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
installLogger();

const SOURCE_FILES = [{ id: 'bot', label: 'Bot Discord', file: 'src/bot.js' }];
const SOURCE_ROOT = '/byabot/source';

function getSourceFile(id) {
  return SOURCE_FILES.find(item => item.id === id);
}

function sourcePath(value = '') {
  const normalized = `/${String(value).replace(/^\/+/, '')}`;
  if (normalized.includes('..') || !/^\/byabot\/source(?:\/[\w.-]+)*$/.test(normalized)) {
    throw new Error('invalid_source_path');
  }
  return normalized;
}

function sourceRelative(value) {
  return sourcePath(value).replace(/^\/byabot\/source\/?/, '');
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
    return await readFile(REMOTE_BOT_FILE);
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
    startupPromise = Promise.resolve()
      .then(() => config.validateConfig())
      .then(() => ensureRootFolder())
      .catch(error => {
        error.startupStep = 'storage';
        throw error;
      })
      .then(() => ensureFolder(SOURCE_ROOT))
      .then(() => ensureFolder(`${SOURCE_ROOT}/src`))
      .then(() => loadRemoteBot())
      .then(bot => bot.startBot())
      .catch(error => {
        if (!error.startupStep) error.startupStep = 'discord';
        throw error;
      })
      .then(() => writeFile('runtime.json', JSON.stringify({
        lastStartedAt: new Date().toISOString(),
        bot: getLoadedBot().getStatus()
      }, null, 2)))
      .catch(error => {
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
    response.json({ ok: true, path, applied: path === REMOTE_BOT_FILE });
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
    await ensureSourceParents(path.replace(/^\/byabot\/source\//, ''));
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

app.get('/api/admin/logs', requireAdmin.bind(null, config), (request, response) => {
  response.json({ ok: true, entries: getEntries(request.query.since) });
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
    await writeFile(REMOTE_BOT_FILE, request.body.content);
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