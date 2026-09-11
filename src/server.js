const express = require('express');
const path = require('node:path');
const { startBot, getStatus } = require('./bot');
const config = require('./config');
const { ensureRootFolder, listFolder, readFile, writeFile } = require('./storage');
const { createSession, getCookie, isValidSession, requireAdmin, setSessionCookie } = require('./admin');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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

app.get('/api/admin/files', requireAdmin.bind(null, config), async (_request, response) => {
  try {
    const data = await listFolder();
    response.json({ ok: true, files: Array.isArray(data) ? data : data?.items || data || [] });
  } catch (error) {
    console.error('Falha ao listar arquivos:', error);
    response.status(502).json({ ok: false, error: 'storage_list_failed' });
  }
});

app.get('/api/admin/files/:name', requireAdmin.bind(null, config), async (request, response) => {
  try {
    const name = decodeURIComponent(request.params.name);
    response.json({ ok: true, name, content: await readFile(name) });
  } catch (error) {
    console.error('Falha ao ler arquivo:', error);
    response.status(502).json({ ok: false, error: 'storage_read_failed' });
  }
});

app.put('/api/admin/files/:name', requireAdmin.bind(null, config), async (request, response) => {
  const name = decodeURIComponent(request.params.name);
  if (!/^([\w.-]+\/)*[\w.-]+$/.test(name) || name.includes('..')) {
    return response.status(400).json({ ok: false, error: 'invalid_file_name' });
  }
  if (typeof request.body?.content !== 'string' || request.body.content.length > 500000) {
    return response.status(400).json({ ok: false, error: 'invalid_content' });
  }
  try {
    await writeFile(name, request.body.content);
    response.json({ ok: true, name });
  } catch (error) {
    console.error('Falha ao salvar arquivo:', error);
    response.status(502).json({ ok: false, error: 'storage_write_failed' });
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