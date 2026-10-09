const { CloudError } = require('./quota.cjs');
const protocol = require('./protocol-v1.json');
const invalidTokenCodes = new Set(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error',
  'auth/invalid-argument', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found']);

function validateBody(body) {
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

// Race as well as abort: even a stalled dependency cannot surface a late result.
async function bounded(signal, work) {
  if (signal.aborted) throw signal.reason ?? new CloudError(499, 'cancelled');
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason ?? new CloudError(499, 'cancelled'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(work), interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function generateDecision({ authorization, body, signal }, deps) {
  const prompt = validateBody(body);
  if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization) || authorization.length > 8192)
    throw new CloudError(401, 'sign-in-required');
  let identity;
  try { identity = await bounded(signal, () => deps.verifyToken(authorization.slice(7))); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    // IAM/configuration/outage errors are server failures, not a bad user login.
    if (invalidTokenCodes.has(error?.code)) throw new CloudError(401, 'sign-in-required');
    throw new CloudError(503, 'authentication-unavailable');
  }
  if (!identity?.uid || identity.email_verified !== true || identity.firebase?.sign_in_provider === 'anonymous')
    throw new CloudError(403, 'verified-account-required');
  if (!deps.apiKey || !/^gemini-[a-z0-9.-]+$/.test(deps.model ?? '')) throw new CloudError(503, 'cloud-not-configured');

  // Await reservation without racing it: if cancellation arrives during a commit,
  // obtain and release the lease before returning. Never start a provider call then.
  const release = await deps.quota.reserve(identity.uid, prompt.requestId);
  try {
    const response = await bounded(signal, () => deps.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + deps.model + ':generateContent', {
        method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: protocol.system + '\nReturn JSON matching this protocol schema:\n' + JSON.stringify(protocol.schema) }] },
          contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200, temperature: 0.1, candidateCount: 1 },
        }),
      }));
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(raw ?? '') ? Math.min(300, Math.max(1, Number(raw))) : 60;
      await deps.quota.cooldown(seconds);
      throw new CloudError(429, 'provider-busy', seconds);
    }
    if (!response.ok) throw new CloudError(502, 'provider-unavailable');
    const content = await bounded(signal, () => response.text());
    if (content.length > 64_000) throw new CloudError(502, 'invalid-provider-response');
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new CloudError(502, 'invalid-provider-response'); }
    const candidate = parsed.candidates?.[0];
    if (!candidate || candidate.finishReason !== 'STOP') throw new CloudError(502, 'incomplete-provider-response');
    const text = (candidate.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
    let decision;
    try { decision = JSON.parse(text); } catch { throw new CloudError(502, 'invalid-provider-response'); }
    if (!decision || Array.isArray(decision) || decision.version !== 1 || decision.requestId !== prompt.requestId ||
        !['actions', 'clarify', 'escalate'].includes(decision.route)) throw new CloudError(502, 'invalid-provider-response');
    // Client still performs full protocol/grounding/preview validation. No data writes here.
    return decision;
  } finally {
    // Counters stay charged even on errors/cancellation. Expiring leases survive crashes.
    await release().catch(() => undefined);
  }
}
module.exports = { validateBody, bounded, generateDecision };
