import { bounded, checkAbort, CloudError } from './errors.mjs';
import { generateDecision } from './decision-service.mjs';

const encoder = new TextEncoder();

async function readBody(request, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') ||
      Number(request.headers.get('content-length') ?? 0) > 128_000) throw new CloudError(400, 'invalid-request');
  if (!request.body) throw new CloudError(400, 'invalid-request');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0; let content = ''; let completed = false;
  try {
    for (;;) {
      const { done, value } = await bounded(signal, () => reader.read());
      if (done) { completed = true; break; }
      bytes += value.byteLength;
      if (bytes > 128_000) throw new CloudError(400, 'invalid-request');
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    return JSON.parse(content);
  } catch (error) {
    checkAbort(signal);
    if (error instanceof CloudError) throw error;
    throw new CloudError(400, 'invalid-request');
  } finally {
    if (!completed) void reader.cancel().catch(() => undefined);
    // A reader ignoring abort may still hold a pending read; do not block the reply.
    try { reader.releaseLock(); } catch { /* cancellation will eventually close it */ }
  }
}

export function createHandler(deps = {}, { releaseCommit = '', timeoutMs = 25_000 } = {}) {
  const deadline = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(25_000, timeoutMs)) : 25_000;
  return async (request, context) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Myelin-Protocol': '1', 'Content-Type': 'application/json' };
    if (/^[a-f0-9]{40}$/.test(releaseCommit)) headers['X-Myelin-Release'] = releaseCommit;
    const respond = (status, value, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
    if (new URL(request.url).pathname !== '/assistant') return respond(404, { error: 'not-found' });
    if (request.method !== 'POST') return respond(405, { error: 'method-not-allowed' }, { Allow: 'POST' });
    const controller = new AbortController();
    const disconnected = () => controller.abort(new CloudError(499, 'cancelled'));
    request.signal.addEventListener('abort', disconnected, { once: true });
    if (request.signal.aborted) disconnected();
    const timer = setTimeout(() => controller.abort(new CloudError(504, 'cloud-timeout')), deadline);
    try {
      const body = await readBody(request, controller.signal);
      const pending = generateDecision({ authorization: request.headers.get('authorization'), body, signal: controller.signal }, deps);
      // Preserve late-reservation cleanup when the runtime permits background work.
      context?.waitUntil?.(pending.then(() => undefined, () => undefined));
      const decision = await bounded(controller.signal, () => pending);
      checkAbort(controller.signal);
      if (encoder.encode(JSON.stringify(decision)).length > 64_000) throw new CloudError(502, 'invalid-provider-response');
      return respond(200, { version: 1, decision });
    } catch (error) {
      const known = error instanceof CloudError ? error : new CloudError(503, 'cloud-unavailable');
      const extra = known.retryAfter ? { 'Retry-After': String(known.retryAfter) } : {};
      return respond(known.status === 499 ? 408 : known.status,
        { error: known.code, retryAfterSeconds: known.retryAfter }, extra);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', disconnected);
    }
  };
}

// Deliberately inactive until real revocation-aware auth and atomic D1 quotas exist.
// Request bodies cannot supply dependencies. AI alone never permits generation.
export default {
  fetch(request, env, context) {
    return createHandler({ ai: env?.AI }, { releaseCommit: env?.MYELIN_RELEASE_COMMIT })(request, context);
  },
};
