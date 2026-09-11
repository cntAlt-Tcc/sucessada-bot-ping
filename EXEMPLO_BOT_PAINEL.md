# Exemplo: criar um bot pelo painel

Este projeto executa automaticamente apenas este arquivo:

```text
/byabot/source/src/bot.js
```

Por isso, para alterar o comportamento do bot, abra o painel, entre em **Bot source**, selecione `src/bot.js`, apague o conteúdo antigo e cole o exemplo abaixo.

## 1. Código mínimo funcionando

```js
const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');

let client;
let connectionPromise;

function createClient() {
  const instance = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  instance.once(Events.ClientReady, readyClient => {
    console.log(`Bot conectado como ${readyClient.user.tag}`);
  });

  instance.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (message.content.trim() === '!ping') {
      await message.reply('Pong!');
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
```

## 2. Como salvar pelo painel

1. Inicie o serviço e abra a URL do painel.
2. Entre com `CONFIG_PANEL_PASSWORD`.
3. Abra **Bot source**.
4. Expanda a pasta `src` e selecione `bot.js`.
5. Cole o código completo acima.
6. Clique em **Salvar alterações**.
7. Aguarde o status `aplicado ao bot` e confira **Live console**.
8. No Discord, envie `!ping` em um servidor onde o bot esteja presente.

O salvamento desse arquivo encerra a conexão anterior, carrega o código novo e inicia o bot novamente. Não é necessário criar outro `bot.js` na raiz de `/byabot/source`.

## 3. O que precisa estar configurado no Discord

No [Discord Developer Portal](https://discord.com/developers/applications):

- o token usado em `CONFIG_DISCORD_TOKEN` precisa ser do bot, não o Application ID;
- em **Bot > Privileged Gateway Intents**, ative **Message Content Intent**;
- ao convidar o bot, use os escopos `bot` e `applications.commands`;
- conceda pelo menos `View Channels`, `Send Messages` e `Read Message History` no canal de teste.

Sem o **Message Content Intent**, o bot pode conectar, mas não consegue ler `!ping`.

## 4. Por que um arquivo novo pode não funcionar

- O painel pode armazenar vários arquivos, mas o arquivo executado automaticamente é somente `src/bot.js`.
- `bot.js` precisa exportar `startBot` e `getStatus`. Sem essas funções, o painel não consegue iniciar o código.
- Criar `src/comandos.js` não registra comandos sozinho. Além disso, o `bot.js` remoto é compilado usando o caminho local do projeto; imports de arquivos criados somente no armazenamento remoto não são carregados automaticamente.
- Não remova `module.exports`, `startBot` ou `getStatus` ao adicionar comandos.
- Depois de salvar, procure erros em **Live console**. O código só foi aplicado quando aparecer `aplicado ao bot`.

## 5. Adicionando outro comando

Dentro do mesmo listener `MessageCreate`, adicione outro teste:

```js
if (message.content.trim() === '!ola') {
  await message.reply(`Olá, ${message.author.username}!`);
}
```

O teste deve ficar antes do fechamento de `instance.on(Events.MessageCreate, async message => { ... })`. Salve novamente e teste `!ola` no Discord.

## 6. Erros mais comuns

| Sintoma | Verificação |
| --- | --- |
| `discord_startup_failed` | Token, variáveis de ambiente e **Message Content Intent** |
| `O source remoto precisa exportar startBot e getStatus` | As duas funções e o `module.exports` continuam no arquivo |
| Status aplicado, mas nada responde | Bot no servidor correto, permissões do canal e conteúdo exatamente `!ping` |
| `Unexpected token` ou erro de sintaxe | Chaves, parênteses e crases do JavaScript colados no editor |
| Bot conecta e cai depois | Veja o erro completo em **Live console** e confirme que não há outro processo usando o mesmo token |
