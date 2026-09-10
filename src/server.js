const express = require('express');
const { startBot, getStatus } = require('./bot');
const config = require('./config');
const { ensureRootFolder, writeFile } = require('./storage');

const app = express();
app.use(express.json());

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
  response.json({ service: 'sucessada-bot-ping', endpoint: '/on' });
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
  app.listen(port, () => console.log(`Health server ouvindo na porta ${port}`));
}

module.exports = app;