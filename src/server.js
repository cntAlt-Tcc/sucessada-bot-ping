const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { startBot, getStatus } = require('./bot');
const config = require('./config');
const { ensureFolder, ensureRootFolder, readFile, writeFile } = require('./storage');
const { createSession, getCookie, isValidSession, requireAdmin, setSessionCookie } = require('./admin');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const SOURCE_FILES = [
  { id: 'bot', label: 'Bot Discord', file: 'src/bot.js' },
  { id: 'server', label: 'Servidor e painel', file: 'src/server.js' },
  { id: 'storage', label: 'Armazenamento remoto', file: 'src/storage.js' },
  { id: 'config', label: 'Configuração', file: 'src/config.js' }
];
const SOURCE_ROOT = '/byabot/source';

function getSourceFile(id) {
  return SOURCE_FILES.find(item => item.id === id);
}

async function seedSourceFile(source) {
  try {
    return await readFile(`${SOURCE_ROOT}/${source.file}`);
  } catch (error) {
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
      .then(() => startBot())
      .catch(error => {
        error.startupStep = 'discord';
        throw error;
      })
      .then(() => ensureRootFolder())
      .then(() => ensureFolder(SOURCE_ROOT))
      .catch(error => {
        if (!error.startupStep) error.startupStep = 'storage';
        throw error;
      })
      .then(() => writeFile('runtime.json', JSON.stringify({
        lastStartedAt: new Date().toISOString(),
        bot: getStatus()
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

app.get('/api/admin/source/:id', requireAdmin.bind(null, config), async (request, response) => {
  const source = getSourceFile(request.params.id);
  if (!source) return response.status(404).json({ ok: false, error: 'source_not_found' });
  try {
    await ensureFolder(SOURCE_ROOT);
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
    await writeFile(`${SOURCE_ROOT}/${source.file}`, request.body.content);
    response.json({ ok: true, ...source, restartRequired: true });
  } catch (error) {
    console.error('Falha ao salvar source:', error);
    response.status(502).json({ ok: false, error: 'source_write_failed' });
  }
});

app.get('/on', async (_request, response) => {
  try {
    await startServices();
    response.json({ ok: true, service: 'online', bot: getStatus() });
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