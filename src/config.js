const config = {
  discordToken: process.env.CONFIG_DISCORD_TOKEN?.trim(),
  port: Number(process.env.PORT || 3000),
  panelPassword: process.env.CONFIG_PANEL_PASSWORD?.trim(),
  storage: {
    apiUrl: (process.env.CONFIG_STORAGE_API_URL || 'https://apifile.netlify.app').replace(/\/$/, ''),
    username: process.env.CONFIG_STORAGE_USERNAME?.trim(),
    password: process.env.CONFIG_STORAGE_PASSWORD?.trim()
  }
};

function validateConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('CONFIG_DISCORD_TOKEN');
  if (!config.storage.username) missing.push('CONFIG_STORAGE_USERNAME');
  if (!config.storage.password) missing.push('CONFIG_STORAGE_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
  }
}

module.exports = { ...config, validateConfig };