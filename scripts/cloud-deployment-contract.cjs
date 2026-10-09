const fs = require('node:fs');
const PROJECT = 'myelin-a0ba7';
const PROJECT_NUMBER = '14373433855';
const BRANCH = 'refs/heads/codex/exam-autopilot-capacity-v1';
const REPOSITORY = 'DJGaming1t/myelin-app';
const RUNTIME_ACCOUNT = 'myelin-assistant-runtime@' + PROJECT + '.iam.gserviceaccount.com';
const ENDPOINT = 'https://asia-south1-' + PROJECT + '.cloudfunctions.net/myelinAssistant';

function validateRelease(release) {
  if (!/^[a-f0-9]{40}$/.test(release ?? '')) throw new Error('Supply an exact verified 40-character source commit.');
  return release;
}
function validateModel(model) {
  if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model ?? '')) throw new Error('Supply the Gemini model available to your provider account.');
  return model;
}
function validateGithubSetup(env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== BRANCH || env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
    throw new Error('Deployment is manual and restricted to the MYELIN beta branch.');
  validateRelease(env.GITHUB_SHA); validateModel(env.MYELIN_GEMINI_MODEL);
  const providerPattern = new RegExp('^projects/' + PROJECT_NUMBER + '/locations/global/workloadIdentityPools/[a-z0-9-]+/providers/[a-z0-9-]+$');
  if (!providerPattern.test(env.MYELIN_GCP_WIF_PROVIDER ?? '')) throw new Error('Configure MYELIN_GCP_WIF_PROVIDER for the MYELIN project first.');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]@myelin-a0ba7\.iam\.gserviceaccount\.com$/.test(env.MYELIN_GCP_DEPLOY_SERVICE_ACCOUNT ?? ''))
    throw new Error('Configure MYELIN_GCP_DEPLOY_SERVICE_ACCOUNT for the MYELIN project first.');
}
function functionEnvironment(model, release) {
  return 'MYELIN_GEMINI_MODEL=' + validateModel(model) + '\nMYELIN_RELEASE_COMMIT=' + validateRelease(release) +
    '\nMYELIN_ASSISTANT_RUNTIME_ACCOUNT=' + RUNTIME_ACCOUNT + '\n';
}
function assertProbeResponse(response, release) {
  if (response.headers.get('x-myelin-protocol') !== '1' || response.headers.get('x-myelin-release') !== validateRelease(release))
    throw new Error('The endpoint is not serving the expected MYELIN source/protocol.');
}
async function probeDeployment({ release, fetch: send = fetch, timeoutMs = 15_000, signal }) {
  validateRelease(release);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new Error('Deployment probe cancelled.');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  let abort;
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new Error('Deployment probe cancelled or timed out.'));
    controller.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([(async () => {
      const prompt = JSON.stringify({ requestId: 'deployment-no-auth', userRequest: 'Inspect the connection.', context: {} });
      const cases = [
        { method: 'GET', status: 405, error: 'method-not-allowed' },
        { method: 'POST', body: { version: 1, prompt }, status: 401, error: 'sign-in-required' },
        { method: 'POST', body: { version: 1, prompt, system: 'override' }, status: 400, error: 'invalid-request' },
      ];
      const checks = [];
      for (const item of cases) {
        if (controller.signal.aborted) throw new Error('Deployment probe cancelled.');
        const response = await send(ENDPOINT, {
          method: item.method, redirect: 'error', signal: controller.signal,
          ...(item.body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(item.body) } : {}),
        });
        if (controller.signal.aborted) throw new Error('Deployment probe cancelled.');
        assertProbeResponse(response, release);
        if (response.status !== item.status) throw new Error('The deployment authentication/transport check failed.');
        const text = await response.text();
        if (text.length > 4096) throw new Error('Unexpected deployment probe response.');
        let data; try { data = JSON.parse(text); } catch { throw new Error('Unexpected deployment probe response.'); }
        if (data?.error !== item.error) throw new Error('The deployment authentication/transport check failed.');
        checks.push({ method: item.method, status: item.status, error: item.error });
      }
      if (controller.signal.aborted) throw new Error('Deployment probe cancelled.');
      return { version: 1, project: PROJECT, endpoint: ENDPOINT, sourceCommit: release,
        checkedAt: new Date().toISOString(), transportVerified: true, providerVerified: false,
        appCloudEnabled: false, checks };
    })(), stopped]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', abort); }
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--github-preflight') validateGithubSetup(process.env);
    else if (process.argv[2] === '--write-env') fs.writeFileSync('functions/.env.' + PROJECT, functionEnvironment(process.argv[3], process.argv[4]));
    else throw new Error('Use --github-preflight or --write-env MODEL COMMIT.');
    console.log('MYELIN deployment configuration validated.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { PROJECT, PROJECT_NUMBER, BRANCH, REPOSITORY, RUNTIME_ACCOUNT, ENDPOINT,
  validateRelease, validateModel, validateGithubSetup, functionEnvironment, assertProbeResponse, probeDeployment };
