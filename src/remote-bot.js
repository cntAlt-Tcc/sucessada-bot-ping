const Module = require('node:module');
const path = require('node:path');
const { readFile, writeFile } = require('./storage');

const LOCAL_BOT_FILE = path.join(__dirname, 'bot.js');
let loadedBot;

function getRemoteBotFile() {
  const { getStorageRoot } = require('./storage');
  return `${getStorageRoot()}/source/src/bot.js`;
}

async function loadRemoteBot() {
  const remoteBotFile = getRemoteBotFile();
  let source;
  try {
    source = await readFile(remoteBotFile);
  } catch (error) {
    if (error.status !== 404) throw error;
    source = require('node:fs').readFileSync(LOCAL_BOT_FILE, 'utf8');
    await writeFile(remoteBotFile, source);
  }

  const remoteModule = new Module(remoteBotFile, module);
  remoteModule.filename = LOCAL_BOT_FILE;
  remoteModule.paths = Module._nodeModulePaths(path.join(__dirname, '..'));
  const compatibility = `
if (typeof module.exports.stopBot !== 'function') {
  module.exports.stopBot = async function stopBot() {
    if (typeof client !== 'undefined' && client) await client.destroy();
    if (typeof client !== 'undefined') client = undefined;
    if (typeof connectionPromise !== 'undefined') connectionPromise = undefined;
  };
}
if (typeof module.exports.getServers !== 'function') {
  module.exports.getServers = function getServers() {
    return typeof client !== 'undefined' && client?.guilds?.cache
      ? [...client.guilds.cache.values()].map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 64 }),
        memberCount: guild.memberCount
      }))
      : [];
  };
}
if (typeof module.exports.leaveServer !== 'function') {
  module.exports.leaveServer = async function leaveServer(serverId) {
    const guild = typeof client !== 'undefined' && client?.guilds?.cache?.get(serverId);
    if (!guild) throw new Error('Servidor não encontrado');
    await guild.leave();
    return { id: serverId };
  };
}
`;
  remoteModule._compile(`${source}${compatibility}`, LOCAL_BOT_FILE);

  if (typeof remoteModule.exports.startBot !== 'function' || typeof remoteModule.exports.getStatus !== 'function') {
    throw new Error('O source remoto precisa exportar startBot e getStatus');
  }

  loadedBot = remoteModule.exports;
  return loadedBot;
}

function getLoadedBot() {
  return loadedBot;
}

module.exports = { loadRemoteBot, getLoadedBot, getRemoteBotFile };
