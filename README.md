# Sucessada Bot Ping

Bot Discord em Node.js com endpoint de saúde `/on` e persistência remota pela API File.

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `config.example.json` para `config.json`.
3. Preencha o token Discord e as credenciais da API File em `config.json`.
4. No portal do Discord Developer, habilite o **Message Content Intent** para o bot.
5. Execute localmente com `npm start` e acesse `http://localhost:3000/on`.

O bot responde `!ping` com `Pong!`. A pasta `/byabot` é criada na API de armazenamento e o arquivo `runtime.json` registra a última inicialização.

## Renovação do token

O cliente faz login na API File quando não possui um JWT válido. A expiração (`exp`) do JWT é lida localmente e o token é renovado 60 segundos antes do vencimento. Um retorno `401` também força novo login e repete a requisição uma vez.

## Deploy

O projeto inclui `api/index.js` e `vercel.json` para expor `/on` na Vercel. O arquivo `config.json` fica ignorado pelo Git para proteger os tokens. Em uma plataforma de deploy, envie esse arquivo como parte dos arquivos privados do projeto.

Importante: a Vercel executa funções serverless sob demanda e pode congelar ou encerrar o processo depois da resposta. Portanto, acessar `/on` por um serviço de ping pode reativar a função, mas **não garante** uma conexão Gateway do Discord 24/7. Para disponibilidade realmente contínua, hospede o mesmo projeto em um serviço com processo persistente, como Render Background Worker, Railway ou VPS; o endpoint `/on` continua útil como health check.# sucessada-bot-ping