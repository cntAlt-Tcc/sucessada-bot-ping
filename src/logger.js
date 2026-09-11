const crypto = require('node:crypto');

const entries = [];
const MAX_ENTRIES = 500;
let installed = false;

function safeValue(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

function add(level, message, details = {}) {
  const entry = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    level,
    event: details.event || 'console',
    stage: details.stage || null,
    code: details.code || null,
    requestId: details.requestId || null,
    message: String(message),
    meta: details.meta || null,
    error: details.error ? safeValue(details.error) : null,
    at: new Date().toISOString()
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  return entry;
}

function event(level, name, message, details = {}) {
  return add(level, message, { ...details, event: name });
}

function install() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...values) => {
      const error = values.find(value => value instanceof Error);
      const message = values.map(value => typeof value === 'string' ? value : JSON.stringify(safeValue(value))).join(' ');
      add(level, message, { error });
      original(...values);
    };
  }
}

function getEntries({ since, level, event: eventName, query } = {}) {
  return entries.filter(entry => {
    if (since && entry.id <= since) return false;
    if (level && entry.level !== level) return false;
    if (eventName && entry.event !== eventName) return false;
    if (query && !`${entry.message} ${entry.event} ${entry.code || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
}

function getSummary() {
  return entries.reduce((summary, entry) => {
    summary.total += 1;
    summary.byLevel[entry.level] = (summary.byLevel[entry.level] || 0) + 1;
    if (entry.level === 'error') summary.lastError = entry;
    return summary;
  }, { total: 0, byLevel: {}, lastError: null });
}

function clear() { entries.length = 0; }

module.exports = { add, clear, event, getEntries, getSummary, install };
