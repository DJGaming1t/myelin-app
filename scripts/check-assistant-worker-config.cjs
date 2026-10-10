#!/usr/bin/env node
// Local-only configuration readiness guard. Never touches provider services.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../workers/assistant');
const mode = process.argv.includes('--ready') ? 'ready' : 'example';
const target = path.join(root, mode === 'ready' ? 'wrangler.jsonc' : 'wrangler.example.jsonc');

function parseConfig(source) {
  // Safe for our checked-in template: comment-only lines, not arbitrary JSONC.
  return JSON.parse(source.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n'));
}

function verify(source, checkMode = 'example') {
  const config = parseConfig(source);
  assert.equal(config.main, './index.mjs');
  assert.equal(config.ai?.binding, 'AI');
  assert.equal(config.compatibility_date, '2026-10-10');
  assert.equal(config.vars?.FIREBASE_PROJECT_ID, 'myelin-a0ba7');
  assert.equal(config.d1_databases?.length, 1, 'Use a dedicated D1 database, not a shared app database.');
  const d1 = config.d1_databases[0];
  assert.equal(d1.binding, 'ASSISTANT_DB');
  assert.equal(d1.database_name, 'myelin-assistant-quota');
  assert.equal(d1.migrations_dir, './migrations');
  assert.match(d1.database_id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  if (checkMode === 'example') assert.equal(d1.database_id, '00000000-0000-0000-0000-000000000000');
  else assert.notEqual(d1.database_id, '00000000-0000-0000-0000-000000000000',
    'Cannot deploy with the placeholder D1 ID.');
  // Firebase Web API key stays in Cloudflare environment configuration; no
  // provider credentials or generated service-account keys in source control.
  assert.equal(config.vars?.FIREBASE_WEB_API_KEY, undefined);
  assert.equal(config.vars?.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(config.vars?.GEMINI_API_KEY, undefined);
  assert.equal(config.vars?.MYELIN_GEMINI_API_KEY, undefined);
  assert.ok(fs.existsSync(path.join(root, 'index.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'migrations/0001_quotas.sql')));
  return config;
}

try {
  if (mode === 'ready' && !fs.existsSync(target)) throw new Error(
    'No private workers/assistant/wrangler.jsonc configured. Only the compile-only example exists.');
  const source = fs.readFileSync(target, 'utf8');
  verify(source, mode);
  const ignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8');
  assert.ok(ignore.includes('workers/assistant/wrangler.jsonc'));
  console.log(mode === 'example'
    ? 'Example Worker AI + D1 bundle configuration checked (intentionally NOT deployable).'
    : 'Binding file shape looks valid. This does NOT prove account eligibility, Firebase auth, D1 migration, or live AI.');
} catch (error) {
  console.error('Cloud Worker configuration is NOT ready:', error.message);
  process.exitCode = 1;
}
