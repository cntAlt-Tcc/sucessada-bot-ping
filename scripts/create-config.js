const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'config.json');
const isVercelBuild = process.env.VERCEL === '1';

const discordToken = process.env.CONFIG_DISCORD_TOKEN;
const storageUsername = process.env.CONFIG_STORAGE_USERNAME;
const storagePassword = process.env.CONFIG_STORAGE_PASSWORD;

if (!discordToken && !storageUsername && !storagePassword) {
  if (isVercelBuild) {
    throw new Error('Configure CONFIG_DISCORD_TOKEN, CONFIG_STORAGE_USERNAME e CONFIG_STORAGE_PASSWORD na Vercel.');
  }

  console.log('Configuração local preservada.');
  process.exit(0);
}

if (!discordToken || !storageUsername || !storagePassword) {
  throw new Error('As três variáveis CONFIG_* são obrigatórias para gerar config.json.');
}

const config = {
  discordToken,
  port: 3000,
  storage: {
    apiUrl: process.env.CONFIG_STORAGE_API_URL || 'https://apifile.netlify.app',
    username: storageUsername,
    password: storagePassword
  }
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log('config.json gerado para o deploy.');