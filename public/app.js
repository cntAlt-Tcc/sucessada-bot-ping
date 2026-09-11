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
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  loadSources();
  loadRuntime();
  document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
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
  fileList.innerHTML = '<span class="muted">Carregando source...</span>';
  try {
    const result = await api('/api/admin/source');
    document.querySelector('#metric-files').textContent = String(result.files.length).padStart(2, '0');
    fileList.innerHTML = '';
    result.files.forEach(source => {
      const button = document.createElement('button');
      button.className = 'file-item';
      button.innerHTML = `<span class="code-badge">JS</span><span><b>${source.file}</b><small>${source.label}</small></span>`;
      button.onclick = () => openSource(source.id, button);
      fileList.appendChild(button);
    });
  } catch (error) {
    fileList.innerHTML = `<span class="error">${error.message}</span>`;
  }
}

async function openSource(id, button) {
  selectedSource = id;
  document.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  status.textContent = 'carregando';
  try {
    const result = await api(`/api/admin/source/${encodeURIComponent(id)}`);
    fileName.textContent = result.file;
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
  saveButton.disabled = true;
  status.textContent = 'salvando';
  try {
    await api(`/api/admin/source/${encodeURIComponent(selectedSource)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: editor.value })
    });
    status.textContent = 'persistido / reinício necessário';
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
document.querySelector('#refresh').onclick = () => { loadSources(); loadRuntime(); };
document.querySelector('#overview-nav').onclick = event => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.currentTarget.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
document.querySelector('#source-nav').onclick = event => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.querySelector('.source-shell').scrollIntoView({ behavior: 'smooth' });
  document.querySelector('.file-item')?.click();
};
document.querySelector('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
checkSession().catch(() => {});
