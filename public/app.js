const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const fileList = document.querySelector('#file-list');
const editor = document.querySelector('#editor');
const fileName = document.querySelector('#file-name');
const status = document.querySelector('#status');
const saveButton = document.querySelector('#save');
const lineCount = document.querySelector('#line-count');
let selectedSource = '';
let lastLogId = '';
let selectedItem = null;
let clipboardItem = null;
let logFilter = { level: '', query: '' };

async function api(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'request_failed');
  return body;
}

function setRuntime(statusText, ping) {
  const online = statusText === 'ONLINE';
  document.querySelector('#metric-status').textContent = statusText;
  document.querySelector('#metric-detail').textContent = online ? 'Gateway conectado' : 'Aguardando conexão';
  document.querySelector('#side-status').textContent = online ? 'Conectado agora' : 'Desconectado';
  document.querySelector('#metric-ping').innerHTML = ping == null ? '-- <em>ms</em>' : `${ping} <em>ms</em>`;
  document.querySelector('#status-pulse').className = online ? 'online' : '';
  document.querySelector('#overview-state').textContent = online ? 'Online agora' : 'Offline';
  document.querySelector('#overview-pulse').className = online ? 'online' : '';
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  loadTree();
  loadRuntime();
  loadLogs();
  loadServers();
  document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
}

async function loadServers() {
  const list = document.querySelector('#servers-list');
  try {
    const result = await api('/api/admin/servers');
    document.querySelector('#metric-servers').textContent = String(result.servers.length).padStart(2, '0');
    document.querySelector('#server-count').textContent = `${result.servers.length} SERVERS`;
    list.innerHTML = result.servers.length ? '' : '<span class="muted">Nenhum servidor encontrado.</span>';
    result.servers.forEach(server => {
      const card = document.createElement('article');
      card.className = 'server-card';
      const initial = server.name.slice(0, 1).toUpperCase();
      card.innerHTML = `<div class="server-avatar">${server.icon ? `<img src="${server.icon}" alt="">` : initial}</div><div class="server-info"><strong></strong><small>ID ${server.id}</small></div><div class="server-members"><b>${server.memberCount ?? '--'}</b><small>members</small></div><span class="server-online">ONLINE</span><button class="leave-server" type="button">Sair</button>`;
      card.querySelector('.server-info strong').textContent = server.name;
      card.querySelector('.leave-server').onclick = () => leaveServer(server.id, server.name);
      list.appendChild(card);

    });
  } catch (error) {
    list.innerHTML = `<span class="error">${error.message}</span>`;
  }
}

async function loadLogs() {
  try {
    const params = new URLSearchParams({ ...(lastLogId ? { since: lastLogId } : {}), ...(logFilter.level ? { level: logFilter.level } : {}), ...(logFilter.query ? { query: logFilter.query } : {}) });
    const result = await api(`/api/admin/logs?${params}`);
    const logs = document.querySelector('#logs');
    if (!lastLogId || logFilter.level || logFilter.query) logs.innerHTML = '';
    result.entries.forEach(entry => {
      const row = document.createElement('div');
      row.className = `log-row ${entry.level}`;
      row.innerHTML = `<time>${new Date(entry.at).toLocaleTimeString('pt-BR')}</time><b>${entry.level.toUpperCase()}</b><span class="log-event">${entry.event}${entry.code ? ` · ${entry.code}` : ''}</span><span class="log-message"></span>`;
      row.querySelector('.log-message').textContent = `${entry.stage ? `[${entry.stage}] ` : ''}${entry.message}`;
      logs.appendChild(row);
      lastLogId = entry.id;
    });
    while (logs.children.length > 200) logs.firstElementChild.remove();
  } catch { /* polling pode falhar sem bloquear o editor */ }
}

async function leaveServer(id, name) {
  if (!window.confirm(`Sair de "${name}"? O bot será removido deste servidor.`)) return;
  try {
    await api(`/api/admin/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadServers();
  } catch (error) {
    window.alert(`Não foi possível sair: ${error.message}`);
  }
}

async function loadRuntime() {
  try {
    const result = await api('/on');
    setRuntime(result.bot?.connected ? 'ONLINE' : 'OFFLINE', result.bot?.ping);
  } catch {
    setRuntime('OFFLINE', null);
  }
}

async function checkSession() {
  const result = await api('/api/admin/session');
  if (result.authenticated) showApp();
}

async function loadSources() {
  return loadTree();
}

async function loadTree() {
  fileList.innerHTML = '<span class="muted">Carregando árvore...</span>';
  try {
    const result = await api('/api/admin/source-tree');
    fileList.innerHTML = '';
    let count = 0;
    function render(items, depth = 0) {
      items.forEach(item => {
        if (item.type === 'file') count += 1;
        const button = document.createElement('button');
        button.className = `file-item ${item.type === 'folder' ? 'folder-item' : ''}`;
        button.style.paddingLeft = `${9 + depth * 16}px`;
        button.innerHTML = `<span class="code-badge">${item.type === 'folder' ? 'DIR' : 'JS'}</span><span><b>${item.name}</b><small>${item.type === 'folder' ? 'pasta' : 'arquivo'}</small></span>`;
        button.onclick = () => item.type === 'folder' ? button.classList.toggle('expanded') : openItem(item, button);
        button.oncontextmenu = event => { event.preventDefault(); showContextMenu(event.clientX, event.clientY, item); };
        fileList.appendChild(button);
        if (item.children) render(item.children, depth + 1);
      });
    }
    render(result.tree);
    document.querySelector('#tree-count').textContent = String(count).padStart(2, '0');
    if (!fileList.children.length) fileList.innerHTML = '<span class="muted">Nenhum arquivo ainda.</span>';
  } catch (error) {
    fileList.innerHTML = `<span class="error">${error.message}</span>`;
  }
}

function parentPath(item) {
  return item.type === 'folder' ? item.path : item.path.slice(0, item.path.lastIndexOf('/'));
}

function showContextMenu(x, y, item) {
  selectedItem = item;
  const menu = document.querySelector('#context-menu');
  const actions = item.type === 'folder'
    ? [['copy', 'Copiar'], ['cut', 'Recortar'], ['new-file', 'Novo arquivo'], ['new-folder', 'Nova pasta'], ['upload', 'Upload de arquivos'], ['paste', 'Colar'], ['delete', 'Excluir pasta']]
    : [['copy', 'Copiar'], ['cut', 'Recortar'], ['delete', 'Excluir arquivo']];
  menu.innerHTML = actions.map(([action, label]) => `<button data-action="${action}" type="button">${label}</button>`).join('');
  menu.classList.remove('hidden');
  menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - actions.length * 42 - 12)}px`;
  menu.querySelectorAll('button').forEach(button => button.onclick = () => runContextAction(button.dataset.action, item));
}

function hideContextMenu() { document.querySelector('#context-menu').classList.add('hidden'); }

async function runContextAction(action, item) {
  hideContextMenu();
  if (action === 'copy' || action === 'cut') {
    clipboardItem = { ...item, operation: action };
    status.textContent = action === 'copy' ? 'item copiado' : 'item recortado';
    return;
  }
  if (action === 'new-file' || action === 'new-folder') {
    const name = window.prompt(`Nome do ${action === 'new-file' ? 'arquivo' : 'pasta'}`);
    if (name) await createSourceItem(action === 'new-file' ? 'file' : 'folder', `${item.path}/${name}`);
    return;
  }
  if (action === 'upload') { document.querySelector('#upload-input').dataset.folder = item.path; document.querySelector('#upload-input').click(); return; }
  if (action === 'paste') {
    if (!clipboardItem) return window.alert('Nada copiado ou recortado.');
    const destination = `${item.path}/${clipboardItem.name}`;
    try {
      await api(`/api/admin/source/${clipboardItem.operation === 'copy' ? 'copy' : 'move'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: clipboardItem.path, destination }) });
      if (clipboardItem.operation === 'cut') clipboardItem = null;
      await loadTree();
    } catch (error) { window.alert(`Não foi possível colar: ${error.message}`); }
    return;
  }
  if (action === 'delete') {
    if (!window.confirm(`Excluir ${item.path}?`)) return;
    try { await api('/api/admin/source/item', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: item.path, type: item.type }) }); selectedItem = null; await loadTree(); }
    catch (error) { window.alert(`Não foi possível excluir: ${error.message}`); }
  }
}

async function openItem(item, button) {
  selectedItem = item;
  document.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  status.textContent = 'carregando';
  try {
    const result = await api(`/api/admin/source/item?path=${encodeURIComponent(item.path)}`);
    fileName.textContent = item.name;
    document.querySelector('#editor-path').textContent = item.path;
    document.querySelector('#delete-item').classList.remove('hidden');
    editor.value = result.content;
    editor.disabled = false;
    saveButton.disabled = false;
    status.textContent = 'pronto';
    updateLineCount();
  } catch (error) {
    status.textContent = error.message;
  }
}

function updateLineCount() {
  lineCount.textContent = `${editor.value.split('\n').length} lines`;
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: loginForm.password.value })
    });
    showApp();
  } catch {
    loginError.textContent = 'Senha inválida ou painel não configurado.';
  }
});

saveButton.onclick = async () => {
  if (!selectedItem) return;
  saveButton.disabled = true;
  status.textContent = 'salvando';
  try {
    const result = await api('/api/admin/source/item', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: selectedItem.path, content: editor.value })
    });
    status.textContent = result.applied ? 'aplicado ao bot' : 'salvo / reinício necessário';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
};

editor.addEventListener('input', updateLineCount);
editor.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveButton.click();
});
document.querySelector('#refresh').onclick = () => { loadTree(); loadRuntime(); loadLogs(); };
document.querySelector('#log-level').onchange = event => { logFilter.level = event.target.value; lastLogId = ''; loadLogs(); };
document.querySelector('#log-query').oninput = event => { logFilter.query = event.target.value.trim(); lastLogId = ''; loadLogs(); };
document.querySelector('#clear-logs').onclick = async () => { await api('/api/admin/logs', { method: 'DELETE' }); lastLogId = ''; loadLogs(); };
document.querySelector('#new-folder').onclick = async () => {
  const name = window.prompt('Nome da pasta, exemplo: components');
  if (!name) return;
  const parent = selectedItem?.type === 'folder' ? selectedItem.path : '/byabot/source';
  await createSourceItem('folder', `${parent}/${name}`);
};
document.querySelector('#new-file').onclick = async () => {
  const name = window.prompt('Nome do arquivo, exemplo: events/messageCreate.js');
  if (!name) return;
  const parent = selectedItem?.type === 'folder' ? selectedItem.path : '/byabot/source';
  await createSourceItem('file', `${parent}/${name}`);
};
document.querySelector('#upload-input').onchange = async event => {
  const input = event.currentTarget;
  if (!input.files.length) return;
  const form = new FormData();
  form.append('folder', input.dataset.folder || '/byabot/source');
  [...input.files].forEach(file => form.append('files', file));
  try { await api('/api/admin/source/upload', { method: 'POST', body: form }); status.textContent = 'upload concluído'; await loadTree(); }
  catch (error) { window.alert(`Não foi possível enviar: ${error.message}`); }
  input.value = '';
};
async function createSourceItem(type, path) {
  try {
    await api(`/api/admin/source/${type}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, content: '' }) });
    status.textContent = `${type === 'folder' ? 'pasta' : 'arquivo'} criado`;
    await loadTree();
  } catch (error) { window.alert(`Não foi possível criar: ${error.message}`); }
}
document.querySelector('#delete-item').onclick = async () => {
  if (!selectedItem || !window.confirm(`Excluir ${selectedItem.path}?`)) return;
  try {
    await api('/api/admin/source/item', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: selectedItem.path, type: selectedItem.type }) });
    selectedItem = null; editor.value = ''; editor.disabled = true; saveButton.disabled = true; document.querySelector('#delete-item').classList.add('hidden'); await loadTree();
  } catch (error) { window.alert(`Não foi possível excluir: ${error.message}`); }
};
document.addEventListener('click', hideContextMenu);
window.addEventListener('resize', hideContextMenu);
function showView(view) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  document.querySelectorAll('.view').forEach(page => page.classList.toggle('view-active', page.dataset.page === view));
  if (view === 'source') loadTree();
  if (view === 'logs') loadLogs();
  if (view === 'servers') loadServers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
document.querySelector('#servers-refresh').onclick = loadServers;
document.querySelector('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
checkSession().catch(() => {});
setInterval(() => { if (!appView.classList.contains('hidden')) loadLogs(); }, 3000);
