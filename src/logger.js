const entries = [];
const MAX_ENTRIES = 200;
let installed = false;

function add(level, values) {
  entries.push({
    id: `${Date.now()}-${entries.length}`,
    level,
    message: values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' '),
    at: new Date().toISOString()
  });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

function install() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...values) => {
      add(level, values);
      original(...values);
    };
  }
}

function getEntries(since) {
  return since ? entries.filter(entry => entry.id > since) : entries;
}

module.exports = { install, getEntries };