const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const fileList = document.querySelector('#file-list');
const editor = document.querySelector('#editor');
const fileName = document.querySelector('#file-name');
const status = document.querySelector('#status');
const saveButton = document.querySelector('#save');
let selectedFile = '';

async function api(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'request_failed');
  return body;
}

function showApp() { loginView.classList.add('hidden'); appView.classList.remove('hidden'); loadFiles(); }

async function checkSession() {
  const result = await api('/api/admin/session');
  if (result.authenticated) showApp();
}

async function loadFiles() {
  fileList.innerHTML = '<span class="muted">Carregando...</span>';
  try {
    const result = await api('/api/admin/files');
    const files = result.files.filter(item => typeof item === 'string' || item.type === 'file' || item.kind === 'file');
    fileList.innerHTML = '';
    files.forEach(item => {
      const name = typeof item === 'string' ? item : item.path || item.name;
      if (!name) return;
      const button = document.createElement('button');
      button.className = 'file-item';
      button.textContent = name.replace(/^\/byabot\//, '');
      button.onclick = () => openFile(name.replace(/^\/byabot\//, ''), button);
      fileList.appendChild(button);
    });
    if (!fileList.children.length) fileList.innerHTML = '<span class="muted">Nenhum arquivo encontrado.</span>';
  } catch (error) { fileList.innerHTML = `<span class="error">${error.message}</span>`; }
}

async function openFile(name, button) {
  selectedFile = name;
  document.querySelectorAll('.file-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  fileName.textContent = name;
  status.textContent = 'carregando';
  try {
    const result = await api(`/api/admin/files/${encodeURIComponent(name)}`);
    editor.value = typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2);
    editor.disabled = false; saveButton.disabled = false; status.textContent = '';
  } catch (error) { status.textContent = error.message; }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault(); loginError.textContent = '';
  try { await api('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: loginForm.password.value }) }); showApp(); }
  catch (error) { loginError.textContent = 'Senha inválida ou painel não configurado.'; }
});

saveButton.onclick = async () => {
  saveButton.disabled = true; status.textContent = 'salvando';
  try { await api(`/api/admin/files/${encodeURIComponent(selectedFile)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: editor.value }) }); status.textContent = 'salvo'; }
  catch (error) { status.textContent = error.message; }
  finally { saveButton.disabled = false; }
};
document.querySelector('#refresh').onclick = loadFiles;
document.querySelector('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
checkSession().catch(() => {});