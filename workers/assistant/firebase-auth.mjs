// Google validates the complete signed ID token through its documented account
// lookup API. Decoded claims are never accepted without that successful lookup.
// No Admin private key, unsigned-token fallback, identity cache or emulator URL.
import { bounded } from './errors.mjs';

const endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const invalidCodes = new Set(['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND']);
const authError = code => Object.assign(new Error(code), { code });
const unavailable = () => authError('auth/service-unavailable');
const invalid = () => authError('auth/invalid-id-token');

function claimsFrom(token, projectId, now) {
  try {
    if (typeof token !== 'string' || token.length > 8185) throw invalid();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw invalid();
    const decode = part => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))));
    const header = decode(parts[0]); const claims = decode(parts[1]);
    const seconds = Math.floor(now / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
        claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= seconds ||
        !Number.isSafeInteger(claims.iat) || claims.iat > seconds || claims.iat >= claims.exp ||
        !Number.isSafeInteger(claims.auth_time) || claims.auth_time < 0 || claims.auth_time > claims.iat ||
        !claims.firebase || typeof claims.firebase.sign_in_provider !== 'string' ||
        claims.firebase.tenant !== undefined) throw invalid();
    return claims;
  } catch { throw invalid(); }
}

async function readJSON(response, signal) {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader(); let bytes = 0; let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await bounded(signal, () => reader.read());
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64_000) throw unavailable();
      text += decoder.decode(value, { stream: true });
    }
    signal.throwIfAborted();
    return JSON.parse(text + decoder.decode());
  } finally { void reader.cancel().catch(() => undefined); }
}

export function createFirebaseVerifier({ projectId, apiKey, fetch: fetcher = globalThis.fetch, now = Date.now }) {
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId) ||
      typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(apiKey) || typeof fetcher !== 'function')
    throw unavailable();
  return async (token, outerSignal) => {
    const claims = claimsFrom(token, projectId, now());
    const controller = new AbortController();
    const abort = () => controller.abort();
    outerSignal?.addEventListener('abort', abort, { once: true });
    if (outerSignal?.aborted) abort();
    const timer = setTimeout(abort, 5000);
    try {
      controller.signal.throwIfAborted();
      // Fixed HTTPS origin; redirects must not forward credentials elsewhere.
      const response = await bounded(controller.signal, () => fetcher(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
      }));
      const value = await readJSON(response, controller.signal);
      if (!response.ok) {
        const code = value?.error?.message?.split(' : ')[0];
        if (response.status === 400 && invalidCodes.has(code)) throw invalid();
        throw unavailable();
      }
      if (!Array.isArray(value?.users) || value.users.length !== 1) throw unavailable();
      const user = value.users[0];
      if (user?.localId !== claims.sub || user.tenantId !== undefined ||
          (user.disabled !== undefined && typeof user.disabled !== 'boolean') ||
          typeof user.validSince !== 'string' || !/^\d{1,16}$/.test(user.validSince) ||
          !Number.isSafeInteger(Number(user.validSince))) throw unavailable();
      if (user.disabled) throw authError('auth/user-disabled');
      // Match Firebase Admin's revocation comparison: original sign-in time,
      // not refreshed token iat. Missing revocation metadata fails closed.
      if (claims.auth_time < Number(user.validSince)) throw authError('auth/id-token-revoked');
      claimsFrom(token, projectId, now()); // Do not accept a token that expired during lookup.
      return { uid: user.localId,
        email_verified: claims.email_verified === true && user.emailVerified === true &&
          typeof user.email === 'string' && user.email === claims.email,
        firebase: { sign_in_provider: claims.firebase.sign_in_provider } };
    } catch (error) {
      if (['auth/invalid-id-token', 'auth/user-disabled', 'auth/id-token-revoked'].includes(error?.code)) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer); outerSignal?.removeEventListener('abort', abort);
    }
  };
}
