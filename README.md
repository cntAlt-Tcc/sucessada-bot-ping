# Sucessada Bot Ping

Bot Discord em Node.js com painel web, hot reload do source, endpoint de saúde e armazenamento remoto pela API File.

Cada instalação possui um `botname.json` próprio. O nome define a pasta isolada usada na API File:

```text
botname.json: { "name": "ana" }
API File:      /ana/
Source:        /ana/source/src/bot.js
Runtime:       /ana/runtime.json
```

## Índice

- [Como funciona](#como-funciona)
- [Requisitos](#requisitos)
- [Configuração rápida](#configuração-rápida)
- [Configuração do Discord](#configuração-do-discord)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Identidade e isolamento](#identidade-e-isolamento)
- [Uso do painel](#uso-do-painel)
- [Contrato do bot](#contrato-do-bot)
- [Deploy](#deploy)
- [Diagnóstico](#diagnóstico)
- [Segurança](#segurança)

## Como funciona

1. O processo lê o `botname.json` local.
2. O nome é validado e convertido em uma raiz, como `/ana`.
3. A API File cria a raiz e as pastas necessárias se elas não existirem.
4. O source de `/ana/source/src/bot.js` é carregado antes do login no Discord.
5. O bot conecta usando `CONFIG_DISCORD_TOKEN`.
6. O painel mostra status, ping, servidores, logs do processo e a árvore de source.
7. Ao salvar `src/bot.js`, o processo encerra a conexão, carrega o novo código e conecta novamente sem redeploy.

O endpoint `/on` inicia os serviços quando necessário e retorna o estado do bot. Ele também é usado como health check no Render.

## Requisitos

- Node.js 18 ou superior;
- uma aplicação criada no Discord Developer Portal;
- uma conta na API File configurada para este projeto;
- um serviço persistente para manter o Gateway do Discord conectado.

O projeto usa `discord.js`, `express` e `multer`. As dependências estão no `package.json`.

## Configuração rápida

### 1. Instale as dependências

```bash
npm install
```

### 2. Crie a identidade da instalação

O arquivo `botname.json` fica na raiz do projeto:

```json
{
  "name": "ana"
}
```

O nome aceita letras, números, `_` e `-`, começa com letra ou número e tem no máximo 40 caracteres. Não use o mesmo nome em duas hospedagens que compartilham a mesma conta da API File.

### 3. Configure o ambiente

Defina as variáveis descritas em [Variáveis de ambiente](#variáveis-de-ambiente).

### 4. Inicie localmente

```bash
npm start
```

Abra `http://localhost:3000/`. O health check fica em `http://localhost:3000/on`.

No primeiro início, a API File cria a pasta do nome e `source/src`. O source local de `src/bot.js` é copiado para a pasta remota se ainda não existir.

## Configuração do Discord

### Criar a aplicação

1. Abra o [Discord Developer Portal](https://discord.com/developers/applications).
2. Clique em **New Application**.
3. Dê um nome à aplicação.
4. Abra **Bot** e clique em **Add Bot**.
5. Copie o token e salve-o somente no ambiente da hospedagem.

O token do bot é diferente do Application ID, Client ID e Public Key. `CONFIG_DISCORD_TOKEN` precisa receber o token secreto do bot.

### Ativar intents

Em **Bot > Privileged Gateway Intents**, ative **Message Content Intent**, obrigatório para ler `!ping` e outros comandos de prefixo.

Ative **Server Members Intent** ou **Presence Intent** somente se o seu código usar esses eventos. Todo intent privilegiado usado no código também precisa estar ativo no portal.

### Convidar o bot

Em **OAuth2 > URL Generator**, marque o escopo `bot` e, se usar slash commands, `applications.commands`. Dê somente as permissões necessárias.

Para o exemplo `!ping`, o canal de teste precisa permitir `View Channel`, `Send Messages` e `Read Message History`.

## Variáveis de ambiente

```text
CONFIG_DISCORD_TOKEN=token_secreto_do_bot
CONFIG_STORAGE_USERNAME=usuario_da_api_file
CONFIG_STORAGE_PASSWORD=senha_da_api_file
CONFIG_STORAGE_API_URL=https://apifile.netlify.app
CONFIG_PANEL_PASSWORD=senha_forte_do_painel
```

`PORT` é opcional e usa `3000` localmente. Em plataformas como Render, a plataforma fornece `PORT` automaticamente.

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `CONFIG_DISCORD_TOKEN` | Sim | Login no Gateway Discord |
| `CONFIG_STORAGE_USERNAME` | Sim | Usuário da API File |
| `CONFIG_STORAGE_PASSWORD` | Sim | Senha da API File |
| `CONFIG_STORAGE_API_URL` | Não | URL da API File; padrão `https://apifile.netlify.app` |
| `CONFIG_PANEL_PASSWORD` | Recomendada | Senha do painel administrativo |
| `PORT` | Não | Porta HTTP do processo |

Nunca coloque tokens, senhas ou JWT no Git. As credenciais são lidas em runtime.

## Identidade e isolamento

O `botname.json` local é a fonte de verdade da identidade de cada deploy. Ele não é compartilhado entre hospedagens.

### Exemplo com dois bots

Hospedagem A:

```json
{ "name": "ana" }
```

```text
CONFIG_DISCORD_TOKEN=token_do_bot_ana
API File: /ana/source/src/bot.js
```

Hospedagem B:

```json
{ "name": "beta" }
```

```text
CONFIG_DISCORD_TOKEN=token_do_bot_beta
API File: /beta/source/src/bot.js
```

Assim, source, `runtime.json` e arquivos criados pelo painel ficam em raízes diferentes. Os servidores exibidos vêm do token da instância em execução.

Não use o mesmo nome em dois bots que apontam para a mesma conta da API File. O segundo deploy poderia ler ou alterar o source do primeiro.

### Renomear pelo painel

O campo **NOME DO BOT** faz o seguinte:

1. valida o novo nome;
2. verifica se a pasta de destino já existe;
3. encerra o bot atual;
4. move a pasta remota inteira;
5. cria `source/src` se necessário;
6. atualiza o `botname.json` local e a cópia dentro da nova raiz;
7. recarrega o source e inicia o bot novo.

Se a troca falhar, a pasta volta ao nome anterior quando possível. Um nome já existente é recusado para evitar sobrescrita.

## Uso do painel

Abra `/` e informe `CONFIG_PANEL_PASSWORD`.

### Overview

Exibe estado do Gateway, ping do WebSocket, quantidade de servidores, nome atual e controle para renomear o bot.

### Bot source

O editor trabalha dentro de `/<nome>/source`. O arquivo principal é `/<nome>/source/src/bot.js`.

É possível criar pastas, criar arquivos, fazer upload, copiar, mover e excluir itens. Porém, o carregador automático executa `src/bot.js`; criar outro arquivo não o registra sozinho.

O painel salva o arquivo e recarrega o bot quando o item salvo é o `src/bot.js` ativo. O status `aplicado ao bot` confirma que a troca foi tentada.

### Live console

Mostra logs capturados do processo, incluindo configuração, armazenamento, login Discord e erros HTTP. Os logs ficam em memória e podem ser perdidos quando a plataforma reinicia.

### Servers

Lista as guilds acessíveis pelo bot conectado e permite sair de uma guild. A lista vem da sessão Discord do token; não é um arquivo separado.

## Contrato do bot

O source remoto precisa exportar:

```js
module.exports = { startBot, getStatus };
```

`startBot` deve conectar o cliente e retornar uma Promise. `getStatus` deve retornar pelo menos:

```js
{
  connected: Boolean,
  tag: String | null,
  ping: Number | null
}
```

O carregador fornece compatibilidade para `stopBot`, `getServers` e `leaveServer` quando não forem exportadas. O exemplo completo está em [EXEMPLO_BOT_PAINEL.md](EXEMPLO_BOT_PAINEL.md).

## Deploy

### Render Web Service

O `render.yaml` configura Node, `npm install`, `npm start`, `/on` como health check e as variáveis principais.

No Render:

1. crie um Blueprint a partir do repositório;
2. informe os valores secretos;
3. confirme o deploy;
4. abra a URL pública e acesse `/on`;
5. abra `/` para entrar no painel.

O plano gratuito pode dormir. Um monitor externo acessando `/on` pode reduzir o tempo dormindo, mas não garante disponibilidade 24/7.

### Railway

Crie um serviço usando o repositório, configure as mesmas variáveis e use `npm start`. Garanta um `botname.json` exclusivo.

### Vercel

O projeto possui `api/index.js` e `vercel.json` para expor o endpoint HTTP. Cadastre as variáveis em **Environment Variables** e faça novo deploy após alterá-las.

Vercel Functions são serverless e podem congelar ou encerrar o processo. Portanto, Vercel não é adequada para manter um bot Discord conectado 24/7. Acessar `/on` não transforma uma função serverless em processo persistente.

## Diagnóstico

### `storage_startup_failed`

Verifique usuário, senha, URL, conectividade e permissões da API File.

### `discord_startup_failed`

Verifique o token, se ele não foi revogado, se os intents estão ativos e se nenhum outro processo usa o mesmo token.

### `O source remoto precisa exportar startBot e getStatus`

O `bot.js` foi substituído sem manter o contrato. Restaure as funções e o `module.exports` do exemplo.

### O bot conecta, mas não responde

Confira Message Content Intent, `GatewayIntentBits.MessageContent`, permissões do canal, prefixo exato, autor da mensagem e erros em **Live console**.

### O painel mostra a pasta errada

Confira o `botname.json` local e reinicie o processo. O nome precisa ser válido e a instância precisa apontar para a conta da API File onde a pasta foi criada.

### O nome novo já existe

Escolha outro nome. O sistema bloqueia nomes existentes para impedir colisões.

## Segurança

- nunca publique `CONFIG_DISCORD_TOKEN`;
- nunca publique credenciais da API File;
- use uma senha forte em `CONFIG_PANEL_PASSWORD`;
- dê ao bot somente as permissões Discord necessárias;
- use nomes exclusivos por hospedagem;
- revise o source antes de salvar, pois o painel executa JavaScript com as permissões do processo;
- lembre que logs podem conter dados enviados pelo seu código.

## Escopo

Este repositório é uma aplicação privada de exemplo para hospedagem de bots Discord. Consulte as políticas do Discord, da plataforma de deploy e da API File antes de colocar o serviço em produção.
