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
CONFIG_PANEL_PASSWORD=uma_senha_forte_para_o_painel
```

As credenciais são lidas diretamente em runtime e nunca são gravadas no repositório. Faça um novo deploy ou redeploy depois de cadastrar as variáveis.

Na rota principal `/`, o painel pede `CONFIG_PANEL_PASSWORD`. Depois do login, ele edita somente as fontes catalogadas do bot através do backend, persistindo-as em `/byabot/source`. O navegador nunca acessa a API File diretamente.

O painel não executa JavaScript arbitrário. O source remoto é carregado antes da conexão Discord. Ao salvar, o backend encerra a conexão anterior, recarrega o source persistido e inicia a nova versão sem redeploy. O painel também exibe logs reais capturados do console do processo. Esse hot reload funciona de forma confiável no Render Web Service persistente; na Vercel, cada instância serverless pode ser encerrada a qualquer momento.

Se `/on` retornar `discord_startup_failed`, revise o token Discord e habilite o **Message Content Intent**. Se retornar `storage_startup_failed`, revise usuário e senha da API File. A resposta não mostra credenciais.

Importante: a Vercel executa funções serverless sob demanda e pode congelar ou encerrar o processo depois da resposta. Portanto, acessar `/on` por um serviço de ping não garante uma conexão Gateway do Discord 24/7.

### Render Web Service gratuito

O arquivo `render.yaml` configura um Web Service no plano gratuito. No Render, crie um Blueprint a partir deste repositório e informe os cinco valores `CONFIG_*` solicitados. O comando `npm start` inicia o bot automaticamente.

O plano gratuito pode dormir depois de um período sem tráfego. Configure um serviço de monitoramento gratuito para acessar `/on` a cada 10 minutos. Isso pode manter o serviço ativo, mas não é uma garantia oficial de disponibilidade 24/7.

Para Railway, crie um serviço usando este repositório, configure as mesmas variáveis de ambiente e use `npm start` como comando de inicialização.