const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { CloudError, createFirestoreQuota } = require('./quota.cjs');
const { generateDecision } = require('./assistant-core.cjs');

initializeApp();
const key = defineSecret('MYELIN_GEMINI_API_KEY');
// No untested model default; select an available model during deployment smoke tests.
const model = defineString('MYELIN_GEMINI_MODEL', { default: '' });
const quota = createFirestoreQuota(getFirestore());

exports.myelinAssistant = onRequest({
  region: 'asia-south1', timeoutSeconds: 40, memory: '256MiB', maxInstances: 2,
  concurrency: 8, cors: false, secrets: [key], invoker: 'public',
}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).set('Allow', 'POST').json({ error: 'method-not-allowed' }); return; }
  if (!req.is('application/json') || (req.rawBody?.length ?? 0) > 128_000) {
    res.status(400).json({ error: 'invalid-request' }); return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new CloudError(504, 'cloud-timeout')), 25_000);
  const disconnected = () => { if (!res.writableEnded) controller.abort(new CloudError(499, 'cancelled')); };
  res.on('close', disconnected);
  try {
    const decision = await generateDecision({ authorization: req.get('authorization'), body: req.body, signal: controller.signal }, {
      verifyToken: token => getAuth().verifyIdToken(token, true), quota,
      apiKey: key.value(), model: model.value(), fetch,
    });
    if (!controller.signal.aborted && !res.destroyed) res.status(200).json({ version: 1, decision });
  } catch (error) {
    const known = error instanceof CloudError ? error : new CloudError(503, 'cloud-unavailable');
    if (!res.destroyed) {
      if (known.retryAfter) res.set('Retry-After', String(known.retryAfter));
      res.status(known.status === 499 ? 408 : known.status).json({ error: known.code, retryAfterSeconds: known.retryAfter });
    }
  } finally {
    clearTimeout(timer);
    res.off('close', disconnected);
  }
});
