const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');

let client;
let connectionPromise;

function createClient() {
  const instance = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  instance.once(Events.ClientReady, readyClient => {
    console.log(`Discord conectado como ${readyClient.user.tag}`);
  });

  instance.on(Events.MessageCreate, message => {
    if (message.author.bot) return;
    if (message.content.trim() === '!ping') {
      message.reply('Pong!');
    }
  });

  return instance;
}

function startBot() {
  if (client?.isReady()) return Promise.resolve(client);
  if (connectionPromise) return connectionPromise;
  if (!config.discordToken) throw new Error('CONFIG_DISCORD_TOKEN não configurado');

  client = createClient();
  connectionPromise = client.login(config.discordToken)
    .then(() => client)
    .catch(error => {
      connectionPromise = undefined;
      client = undefined;
      throw error;
    });

  return connectionPromise;
}

function getStatus() {
  return {
    connected: Boolean(client?.isReady()),
    tag: client?.user?.tag || null,
    ping: client?.ws?.ping ?? null
  };
}

function getServers() {
  return client?.guilds?.cache ? [...client.guilds.cache.values()].map(guild => ({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 64 }),
    memberCount: guild.memberCount
  })) : [];
}

async function leaveServer(serverId) {
  const guild = client?.guilds?.cache?.get(serverId);
  if (!guild) throw new Error('Servidor não encontrado');
  await guild.leave();
  return { id: serverId };
}

async function stopBot() {
  if (client) await client.destroy();
  client = undefined;
  connectionPromise = undefined;
}

module.exports = { startBot, stopBot, getStatus, getServers, leaveServer };