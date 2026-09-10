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

module.exports = { startBot, getStatus };