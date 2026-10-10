#!/usr/bin/env node
// Prepare an ignored Worker config on the CI runner ONLY after explicit
// account-owner authorisation. Does not provision D1, deploy, or infer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'workers/assistant/wrangler.example.jsonc');
const outputPath = path.join(root, 'workers/assistant/wrangler.jsonc');
const EMPTY = '00000000-0000-0000-0000-000000000000';
const D1_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readTemplate() {
  return JSON.parse(fs.readFileSync(templatePath, 'utf8').split('\n')
    .filter(line => !line.trimStart().startsWith('//')).join('\n'));
}
function prepare(id) {
  assert.ok(D1_UUID.test(id) && id !== EMPTY, 'A real dedicated D1 database UUID is required.');
  const config = readTemplate();
  assert.equal(config.main, './index.mjs');
  assert.equal(config.name, 'myelin-assistant');
  assert.equal(config.ai?.binding, 'AI');
  assert.equal(config.vars?.FIREBASE_PROJECT_ID, 'myelin-a0ba7');
  assert.equal(config.d1_databases?.length, 1);
  const db = config.d1_databases[0];
  assert.equal(db.binding, 'ASSISTANT_DB');
  assert.equal(db.database_name, 'myelin-assistant-quota');
  assert.equal(db.database_id, EMPTY);
  assert.equal(db.migrations_dir, './migrations');
  assert.equal(config.vars?.FIREBASE_WEB_API_KEY, undefined);
  db.database_id = id;
  return config;
}
function selfTest() {
  const valid = '12345678-1234-4abc-8def-123456789abc';
  assert.equal(prepare(valid).d1_databases[0].database_id, valid);
  for (const bad of ['', EMPTY, 'not-an-id', '1234', 'n'.repeat(36)]) {
    assert.throws(() => prepare(bad));
  }
  const content = JSON.stringify(prepare(valid));
  for (const name of ['CLOUDFLARE_API_TOKEN', 'FIREBASE_WEB_API_KEY',
    'CLOUDFLARE_ACCOUNT_ID', 'MYELIN_SMOKE_ID_TOKEN']) {
    assert.ok(!content.includes(name));
  }
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    .includes('workers/assistant/wrangler.jsonc'));
  console.log('Deployment configuration self-test passed without network access or credentials.');
}
function write() {
  if (process.env.MYELIN_OWNER_DEPLOY_APPROVED !== 'YES_FREE_PREVIEW_ONLY')
    throw Error('No explicit authorised owner confirmation. Nothing created.');
  if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? '') ||
      !(process.env.CLOUDFLARE_API_TOKEN ?? '').trim() ||
      !(process.env.FIREBASE_WEB_API_KEY ?? '').trim())
    throw Error('Owner Cloudflare account credentials and Firebase web configuration are not set.');
  const config = prepare(process.env.CLOUDFLARE_ASSISTANT_D1_ID ?? '');
  if (fs.existsSync(outputPath)) throw Error('Refusing to overwrite a deployment config.');
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Ignored Worker configuration prepared on this runner. No secrets or IDs printed.');
}
try {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--write')) write();
  else throw Error('Use --self-test (offline) or --write (authorised owner only).');
} catch (error) {
  console.error('Deployment preparation aborted:', error.message);
  process.exitCode = 1;
}
