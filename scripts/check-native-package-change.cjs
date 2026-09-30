const fs = require('fs');

const [basePath, headPath] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
const keys = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
];

function pick(value) {
  return Object.fromEntries(keys.map((key) => [key, value[key] ?? null]));
}

if (JSON.stringify(pick(base)) !== JSON.stringify(pick(head))) {
  process.exit(1);
}
