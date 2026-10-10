#!/usr/bin/env node
// Manual LIVE smoke check. Uses only synthetic public prompts, never exports
// real workspace data. Inference is opt-in and can consume provider allowance.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

const endpoint = (process.env.MYELIN_CHAT_SMOKE_URL ?? '').trim();
const token = process.env.MYELIN_SMOKE_ID_TOKEN ?? '';
const allow = process.env.MYELIN_SMOKE_ALLOW_INFERENCE === '1';
const receiptPath = process.env.MYELIN_CHAT_SMOKE_RECEIPT || '';
const url = (() => {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/chat' ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      ['localhost', '127.0.0.1'].includes(parsed.hostname))
    throw new Error('Expected a deployed HTTPS /chat endpoint with no query or embedded credentials');
  return parsed.href;
})();

async function send(messages, authorization) {
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(40_000),
    headers: { 'content-type': 'application/json',
      ...(authorization ? { authorization: 'Bearer ' + authorization } : {}) },
    body: JSON.stringify({ version: 1, requestId: randomUUID(), messages }),
  });
  const text = await response.text();
  assert.ok(text.length <= 9_000, 'Response body is unexpectedly large');
  let result;
  try { result = JSON.parse(text); } catch { throw Error('Server returned non-JSON content'); }
  return { status: response.status, result, ms: Date.now() - started,
    protocol: response.headers.get('x-myelin-protocol'),
    release: response.headers.get('x-myelin-release') };
}

async function main() {
  const anonymous = await send([{ role: 'user', content: 'Synthetic availability check' }]);
  assert.equal(anonymous.status, 401,
    'Unauthenticated requests must fail closed (no hosted inference)');
  assert.equal(anonymous.result.error, 'sign-in-required');
  assert.equal(anonymous.protocol, '1');
  const receipt = { verifiedAt: new Date().toISOString(),
    unauthenticatedRejected: true, inferenceTested: false,
    successfulTurns: 0, generatedCharacterCounts: [], latenciesMs: [],
    release: anonymous.release || null };
  if (token && !allow) throw Error(
    'An ID token was provided, but inference is not authorized. Set MYELIN_SMOKE_ALLOW_INFERENCE=1 deliberately.');
  if (allow && !token) throw Error(
    'A verified-account short-lived Firebase token is required for an inference test. Do not paste it into chat or logs.');
  if (allow) {
    const firstMessage = 'I have a science exam in four days. Explain one sensible way to organise my revision in two sentences.';
    const first = await send([{ role: 'user', content: firstMessage }], token);
    assert.equal(first.status, 200, 'Live hosted model generation failed or account is not authorized');
    assert.equal(first.result.version, 1);
    assert.equal(typeof first.result.reply, 'string');
    assert.ok(first.result.reply.trim().length >= 10 && first.result.reply.length <= 7000);
    assert.doesNotMatch(first.result.reply, /<\/?think\b|<\|im_start\|>/);
    const second = await send([
      { role: 'user', content: firstMessage },
      { role: 'assistant', content: first.result.reply.slice(0, 1500) },
      { role: 'user', content: 'Summarize your previous recommendation in one short sentence.' },
    ], token);
    assert.equal(second.status, 200, 'Live follow-up request failed');
    assert.equal(second.result.version, 1);
    assert.equal(typeof second.result.reply, 'string');
    assert.ok(second.result.reply.trim().length >= 5 && second.result.reply.length <= 7000);
    assert.doesNotMatch(second.result.reply, /<\/?think\b|<\|im_start\|>/);
    assert.equal(second.release, receipt.release);
    receipt.inferenceTested = true;
    receipt.successfulTurns = 2;
    receipt.generatedCharacterCounts = [first.result.reply.length, second.result.reply.length];
    receipt.latenciesMs = [first.ms, second.ms];
  }
  // The receipt never includes the token, the generated prose, or user data.
  if (receiptPath) fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (!allow) console.log('Transport only. A real multi-turn inference test has NOT been performed.');
}

main().catch(error => {
  console.error('Hosted chat smoke check failed:', error.message);
  process.exitCode = 1;
});
