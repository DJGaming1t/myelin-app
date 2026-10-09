import { bounded, checkAbort, CloudError } from './errors.mjs';
import { buildProviderInput, runQwen } from './qwen-provider.mjs';

const invalidTokenCodes = new Set(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error',
  'auth/invalid-argument', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found']);

export function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.version !== 1 ||
      Object.keys(body).some(key => !['version', 'prompt'].includes(key)) ||
      typeof body.prompt !== 'string' || body.prompt.length > 48_000) throw new CloudError(400, 'invalid-request');
  let prompt;
  try { prompt = JSON.parse(body.prompt); } catch { throw new CloudError(400, 'invalid-request'); }
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt) ||
      Object.keys(prompt).some(key => !['requestId', 'userRequest', 'context', 'clarificationAnswers'].includes(key)) ||
      typeof prompt.requestId !== 'string' || !prompt.requestId.trim() || prompt.requestId.length > 120 ||
      typeof prompt.userRequest !== 'string' || !prompt.userRequest.trim() || prompt.userRequest.length > 4000 ||
      !prompt.context || typeof prompt.context !== 'object' || Array.isArray(prompt.context)) throw new CloudError(400, 'invalid-request');
  return prompt;
}

export async function generateDecision({ authorization, body, signal }, deps = {}) {
  const prompt = validateBody(body);
  if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization) || authorization.length > 8192)
    throw new CloudError(401, 'sign-in-required');
  // No permissive placeholder auth, in-memory quota fallback or env-based bypass.
  if (typeof deps.verifyToken !== 'function' || typeof deps.quota?.reserve !== 'function' ||
      typeof deps.quota?.cooldown !== 'function' || typeof deps.ai?.run !== 'function')
    throw new CloudError(503, 'cloud-not-configured');
  let identity;
  try { identity = await bounded(signal, () => deps.verifyToken(authorization.slice(7), signal)); }
  catch (error) {
    checkAbort(signal);
    if (invalidTokenCodes.has(error?.code)) throw new CloudError(401, 'sign-in-required');
    throw new CloudError(503, 'authentication-unavailable');
  }
  if (typeof identity?.uid !== 'string' || !identity.uid || identity.email_verified !== true ||
      identity.firebase?.sign_in_provider === 'anonymous') throw new CloudError(403, 'verified-account-required');
  const input = buildProviderInput(body.prompt);
  // Do not race an atomic reservation: release its lease if it commits after abort.
  // The HTTP handler bounds its own response while this cleanup can continue.
  const release = await deps.quota.reserve(identity.uid, prompt.requestId);
  if (typeof release !== 'function') throw new CloudError(503, 'quota-unavailable');
  try {
    checkAbort(signal);
    try { return await runQwen({ ai: deps.ai, input, requestId: prompt.requestId, signal, now: deps.now }); }
    catch (error) {
      if (error instanceof CloudError && error.status === 429) {
        // Persist shared cooldown; a failed store cannot authorize more generation.
        await bounded(signal, () => deps.quota.cooldown(error.retryAfter));
      }
      throw error;
    }
  } finally {
    // Attempt counted on errors/cancellation. Expiring leases cover cleanup failure.
    await release().catch(() => undefined);
  }
}
