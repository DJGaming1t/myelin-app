const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateGithubSetup, functionEnvironment, probeDeployment, ENDPOINT } = require('./cloud-deployment-contract.cjs');
const { releaseHeaders } = require('../functions/deployment-meta.cjs');
const sha = 'a'.repeat(40);
const env = { GITHUB_REPOSITORY: 'DJGaming1t/myelin-app', GITHUB_REF: 'refs/heads/codex/exam-autopilot-capacity-v1', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: sha, MYELIN_GEMINI_MODEL: 'gemini-development-model',
  MYELIN_GCP_WIF_PROVIDER: 'projects/14373433855/locations/global/workloadIdentityPools/myelin-github/providers/myelin',
  MYELIN_GCP_DEPLOY_SERVICE_ACCOUNT: 'myelin-deployer@myelin-a0ba7.iam.gserviceaccount.com' };
test('deployment accepts only manual beta branch, project and valid public model/commit', () => {
  assert.doesNotThrow(() => validateGithubSetup(env));
  for (const patch of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REPOSITORY: 'fork/myelin-app' },
    { MYELIN_GCP_WIF_PROVIDER: '' }, { MYELIN_GCP_WIF_PROVIDER: env.MYELIN_GCP_WIF_PROVIDER.replace('14373433855', '1') },
    { MYELIN_GCP_DEPLOY_SERVICE_ACCOUNT: 'owner@other.iam.gserviceaccount.com' }, { GITHUB_SHA: 'HEAD' },
    { MYELIN_GEMINI_MODEL: 'gemini-a\nKEY=hidden' }, { MYELIN_GEMINI_MODEL: 'gemini-a;rm -rf .' }]) {
    assert.throws(() => validateGithubSetup({ ...env, ...patch }));
  }
  assert.equal(functionEnvironment(env.MYELIN_GEMINI_MODEL, sha).split('\n').filter(Boolean).length, 3);
  assert.deepEqual(releaseHeaders('bad\nheader'), { 'X-Myelin-Protocol': '1' });
  assert.equal(releaseHeaders(sha)['X-Myelin-Release'], sha);
});
function fakeSend(overrides = {}) {
  let calls = 0;
  const send = async (url, options) => {
    assert.equal(url, ENDPOINT); assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.authorization, undefined);
    const checks = [ [405, 'method-not-allowed'], [401, 'sign-in-required'], [400, 'invalid-request'] ];
    const [status, error] = checks[calls++];
    return new Response(overrides.text ?? JSON.stringify({ error }), { status: overrides.status ?? status,
      headers: { 'x-myelin-protocol': '1', 'x-myelin-release': overrides.release ?? sha } });
  };
  return { send, count: () => calls };
}
test('live transport checks never send credentials or call generation; receipt stays provider-unverified', async () => {
  const fake = fakeSend(); const receipt = await probeDeployment({ release: sha, fetch: fake.send });
  assert.equal(fake.count(), 3); assert.equal(receipt.transportVerified, true);
  assert.equal(receipt.providerVerified, false); assert.equal(receipt.appCloudEnabled, false);
});
test('wrong revision, unexpected status, HTML/error pages fail closed', async () => {
  for (const overrides of [{ release: 'b'.repeat(40) }, { status: 200 }, { text: '<html>login</html>' }, { text: JSON.stringify({ error: 'different' }) }]) {
    await assert.rejects(probeDeployment({ release: sha, fetch: fakeSend(overrides).send }));
  }
});
test('probe timeout and cancellation discard replies from uncooperative dependencies', async () => {
  await assert.rejects(probeDeployment({ release: sha, timeoutMs: 5, fetch: () => new Promise(() => {}) }), /timed out/);
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(probeDeployment({ release: sha, signal: controller.signal, fetch: async () => { calls++; } }), /cancelled/);
  assert.equal(calls, 0);
});
