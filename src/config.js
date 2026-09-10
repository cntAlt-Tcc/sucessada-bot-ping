const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error('config.json não encontrado. Copie config.example.json para config.json e preencha os valores.');
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`config.json inválido: ${error.message}`);
  }
}

module.exports = loadConfig();