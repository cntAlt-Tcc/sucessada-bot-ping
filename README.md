# Sucessada Bot Ping

Bot Discord em Node.js com endpoint de saúde `/on` e persistência remota pela API File.

## Configuração

1. Instale as dependências com `npm install`.
2. Configure as variáveis de ambiente abaixo.
4. No portal do Discord Developer, habilite o **Message Content Intent** para o bot.
5. Execute localmente com `npm start` e acesse `http://localhost:3000/on`.

O bot responde `!ping` com `Pong!`. A pasta `/byabot` é criada na API de armazenamento e o arquivo `runtime.json` registra a última inicialização.

## Renovação do token

O cliente faz login na API File quando não possui um JWT válido. A expiração (`exp`) do JWT é lida localmente e o token é renovado 60 segundos antes do vencimento. Um retorno `401` também força novo login e repete a requisição uma vez.

## Deploy

O projeto inclui `api/index.js` e `vercel.json` para expor `/on` na Vercel. No painel da Vercel, cadastre estas variáveis como **Environment Variables** para o ambiente de produção:

```text
CONFIG_DISCORD_TOKEN
CONFIG_STORAGE_USERNAME
CONFIG_STORAGE_PASSWORD
CONFIG_STORAGE_API_URL=https://apifile.netlify.app
```

As credenciais são lidas diretamente em runtime e nunca são gravadas no repositório. Faça um novo deploy ou redeploy depois de cadastrar as variáveis.

Se `/on` retornar `discord_startup_failed`, revise o token Discord e habilite o **Message Content Intent**. Se retornar `storage_startup_failed`, revise usuário e senha da API File. A resposta não mostra credenciais.

Importante: a Vercel executa funções serverless sob demanda e pode congelar ou encerrar o processo depois da resposta. Portanto, acessar `/on` por um serviço de ping pode reativar a função, mas **não garante** uma conexão Gateway do Discord 24/7. Para disponibilidade realmente contínua, hospede o mesmo projeto em um serviço com processo persistente, como Render Background Worker, Railway ou VPS; o endpoint `/on` continua útil como health check.# sucessada-bot-ping