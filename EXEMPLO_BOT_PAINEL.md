# Exemplo completo: criar e editar um bot pelo painel

Este guia mostra como usar o painel sem perder o contrato exigido pelo carregador remoto.

## Antes de começar

Você precisa de Node.js 18 ou superior, um bot criado no [Discord Developer Portal](https://discord.com/developers/applications), `CONFIG_DISCORD_TOKEN`, credenciais da API File, `CONFIG_PANEL_PASSWORD`, **Message Content Intent** ativado e o bot convidado para um servidor.

## 1. Identidade do bot

Na raiz do projeto existe `botname.json`. Ele define a pasta usada na API File:

```json
{
  "name": "ana"
}
```

Com esse nome, os arquivos ficam assim:

```text
/ana/
├── botname.json
├── runtime.json
└── source/
    └── src/
        └── bot.js
```

O nome aceita letras, números, `_` e `-`, começa com letra ou número e tem até 40 caracteres.

### Hospedar outro bot

Use outra cópia do projeto e altere o `botname.json`:

```json
{
  "name": "beta"
}
```

Configure nessa cópia o token do segundo bot:

```text
CONFIG_DISCORD_TOKEN=token_do_bot_beta
```

A primeira hospedagem usa `/ana/source/src/bot.js` e a segunda `/beta/source/src/bot.js`. Isso separa código, runtime e arquivos do painel. Não use o mesmo nome em duas hospedagens que compartilham a API File.

## 2. Configuração inicial do Discord

1. Abra sua aplicação no Developer Portal.
2. Entre em **Bot** e crie o bot se necessário.
3. Copie o token para `CONFIG_DISCORD_TOKEN`.
4. Ative **Message Content Intent** em **Privileged Gateway Intents**.
5. Gere um convite em **OAuth2 > URL Generator**.
6. Selecione `bot` e, se quiser slash commands depois, `applications.commands`.

No servidor de teste, dê ao bot `View Channel`, `Send Messages` e `Read Message History`. Application ID, Client ID e Public Key não substituem o token.

## 3. Inicie o projeto

```bash
npm install
npm start
```

Abra `http://localhost:3000/`. O diagnóstico fica em `http://localhost:3000/on`.

Na primeira inicialização, a API File cria a pasta do nome e `source/src`. O arquivo local `src/bot.js` é usado como modelo se o remoto ainda não existir.

## 4. Código completo de `src/bot.js`

O painel executa automaticamente somente `/<nome-do-bot>/source/src/bot.js`. Abra **Bot source**, expanda `src`, selecione `bot.js` e cole o arquivo completo:

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

    const command = message.content.trim().toLowerCase();

    if (command === '!ping') {
      await message.reply('Pong!');
      return;
    }

    if (command === '!ola') {
      await message.reply(`Olá, ${message.author.username}!`);
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

async function stopBot() {
  if (client) await client.destroy();
  client = undefined;
  connectionPromise = undefined;
}

function getStatus() {
  return {
    connected: Boolean(client?.isReady()),
    tag: client?.user?.tag || null,
    ping: client?.ws?.ping ?? null
  };
}

module.exports = { startBot, stopBot, getStatus };
```

### O que não pode ser removido

O carregador precisa encontrar `startBot`, `getStatus` e `module.exports`. Sem `startBot`, o serviço não sabe conectar. Sem `getStatus`, o painel não mostra o estado. `stopBot` é recomendado para o hot reload.

## 5. Salvar e testar

1. Entre no painel com `CONFIG_PANEL_PASSWORD`.
2. Abra **Bot source**.
3. Expanda `src` e abra `bot.js`.
4. Cole o código completo sem os marcadores ```` ```js ```` e ```` ``` ````.
5. Clique em **Salvar alterações**.
6. Aguarde `aplicado ao bot`.
7. Abra **Live console** e confirme `Bot conectado como ...`.
8. No Discord, envie `!ping` e `!ola`.

O salvamento encerra a conexão anterior, carrega o conteúdo remoto e conecta novamente. Não é necessário redeploy para alterar `bot.js`.

## 6. Adicionar comandos

Dentro do mesmo listener `MessageCreate`, adicione:

```js
if (command === '!ajuda') {
  await message.reply('Comandos: !ping, !ola e !ajuda');
}
```

Salve e teste `!ajuda`. O exemplo usa prefixos, por isso precisa de `MessageContent`. Slash commands exigem registro na API do Discord e eventos `InteractionCreate`.

## 7. Responder com embed

```js
if (command === '!status') {
  await message.reply({
    embeds: [{
      title: 'Status do bot',
      description: 'O bot está funcionando.',
      color: 0xc5ef65,
      fields: [
        { name: 'Usuário', value: message.author.username, inline: true },
        { name: 'Ping', value: `${client.ws.ping} ms`, inline: true }
      ]
    }]
  });
}
```

## 8. Criar outros arquivos

O painel permite criar arquivos e pastas, mas criar um arquivo não o executa automaticamente. O carregador inicializa `src/bot.js` usando os módulos instalados no projeto local.

Para um exemplo pequeno, mantenha os comandos no próprio `bot.js`. Arquivos adicionais criados somente na API File não devem ser tratados como módulos Node automaticamente; eles precisam ser incorporados ao fluxo de carregamento do projeto antes de serem usados.

Não coloque tokens em arquivos do source. Use `config.discordToken`, que vem de `CONFIG_DISCORD_TOKEN`.

## 9. Renomear pelo painel

No Overview, altere **NOME DO BOT** para outro nome, como `ana2`, e clique em **Renomear**.

O sistema valida o nome, recusa uma pasta existente, encerra o bot, move a pasta inteira, cria `source/src` se necessário, atualiza o `botname.json`, recarrega o source e atualiza o nome do painel.

Se o nome já pertencer a outro bot, escolha outro nome. Não remova uma pasta sem confirmar que ela não é usada.

## 10. Estrutura de arquivos

### Projeto local

```text
botname.json       identidade desta hospedagem
src/bot.js         modelo inicial
src/server.js      painel e API HTTP
src/remote-bot.js  carregador remoto
src/storage.js     cliente da API File
src/config.js      variáveis de ambiente
public/            interface do painel
```

### API File

```text
/<nome-do-bot>/
├── botname.json
├── runtime.json
└── source/
    └── src/
        └── bot.js
```

`runtime.json` registra a última inicialização. Os logs do painel ficam em memória e podem desaparecer após restart ou sleep.

## 11. Erros comuns

### `discord_startup_failed`

Verifique token, Developer Portal e intents privilegiados.

### `storage_startup_failed`

Verifique usuário, senha, URL e permissões da API File.

### `O source remoto precisa exportar startBot e getStatus`

Restaure as funções e o `module.exports` do exemplo.

### `Unexpected token`

Há erro de sintaxe. Confira chaves, parênteses, vírgulas e crases.

### Status `salvo / reinício necessário`

O arquivo salvo não é o `src/bot.js` ativo ou o processo ainda não carregou a identidade. Abra o arquivo dentro de `source/src` do nome atual.

### O bot conecta, mas não responde

Confira Message Content Intent, `GatewayIntentBits.MessageContent`, permissões do canal, prefixo, autor da mensagem e erros em **Live console**.

### O painel mostra outro bot

Confira `botname.json`, `CONFIG_DISCORD_TOKEN` e se o nome é exclusivo. Duas hospedagens com o mesmo nome podem alterar a mesma pasta remota.

## 12. Checklist final

- [ ] `botname.json` tem nome exclusivo.
- [ ] `CONFIG_DISCORD_TOKEN` pertence ao bot correto.
- [ ] Credenciais da API File estão corretas.
- [ ] `CONFIG_PANEL_PASSWORD` está configurado.
- [ ] Message Content Intent está ativo.
- [ ] O bot foi convidado para o servidor.
- [ ] O canal permite enviar mensagens.
- [ ] O arquivo foi salvo em `src/bot.js`.
- [ ] O painel mostrou `aplicado ao bot`.
- [ ] O console mostrou o login do bot.
- [ ] `!ping` respondeu `Pong!`.
