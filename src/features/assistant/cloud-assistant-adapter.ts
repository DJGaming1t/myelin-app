import type { MyelinMiniModelAdapter, MyelinMiniModelRequest } from './myelin-mini';

export class AssistantCloudError extends Error {
  constructor(public readonly code: string, public readonly retryAfterSeconds = 0) {
    const messages: Record<string, string> = {
      'sign-in-required': 'Sign in again to use cloud AI.',
      'verified-account-required': 'Verify your email to use cloud AI.',
      'cloud-consent-required': 'Allow cloud AI before sending this request.',
      'cloud-not-configured': 'Cloud AI is not connected yet.',
      'cloud-timeout': 'Cloud AI took too long. Try again later.',
      'cloud-busy': 'Cloud AI has reached a usage limit. Try again later.',
      'cloud-unavailable': 'Cloud AI is unavailable right now. Try again later.',
    };
    super(messages[code] ?? messages['cloud-unavailable']);
    this.name = 'AssistantCloudError';
  }
}

function abortError() { const error = new Error('The assistant request was cancelled.'); error.name = 'AbortError'; return error; }

// No default endpoint or persistence. The app must supply an authenticated owner,
// explicit consent and a smoke-tested release endpoint before enabling controls.
export function createCloudAssistantAdapter(options: {
  endpoint: string;
  ownerId: string;
  getCurrentOwnerId(): string | null;
  hasConsent(): boolean;
  getIdToken(): Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): MyelinMiniModelAdapter {
  const url = new URL(options.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !options.ownerId)
    throw new AssistantCloudError('cloud-not-configured');
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let retryAt = 0;
  const ensureAuthorized = () => {
    if (!options.hasConsent()) throw new AssistantCloudError('cloud-consent-required');
    if (options.getCurrentOwnerId() !== options.ownerId) throw new AssistantCloudError('sign-in-required');
  };
  return {
    id: 'myelin-cloud-protocol-v1',
    async generate(request: MyelinMiniModelRequest) {
      if (request.signal?.aborted) throw abortError();
      ensureAuthorized();
      if (now() < retryAt) throw new AssistantCloudError('cloud-busy', Math.ceil((retryAt - now()) / 1000));
      if (request.user.length > 48_000) throw new AssistantCloudError('cloud-unavailable');
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      request.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(30_000, Math.max(1, options.timeoutMs ?? 30_000)));
      let interrupt: (() => void) | undefined;
      const stopped = new Promise<never>((_, reject) => {
        interrupt = () => reject(timedOut ? new AssistantCloudError('cloud-timeout') : abortError());
        controller.signal.addEventListener('abort', interrupt, { once: true });
      });
      try {
        const work = async () => {
          const token = await options.getIdToken();
          if (controller.signal.aborted) throw abortError();
          ensureAuthorized();
          if (!token || /\s/.test(token)) throw new AssistantCloudError('sign-in-required');
          const response = await send(options.endpoint, {
            method: 'POST', signal: controller.signal,
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
            body: JSON.stringify({ version: 1, prompt: request.user }),
          });
          if (controller.signal.aborted) throw abortError();
          ensureAuthorized();
          if (!response.ok) {
            if (response.status === 429) {
              const raw = response.headers.get('retry-after');
              const delay = /^\d+$/.test(raw ?? '') ? Math.min(86_400, Math.max(1, Number(raw))) : 60;
              retryAt = now() + delay * 1000;
              throw new AssistantCloudError('cloud-busy', delay);
            }
            if (response.status === 401) throw new AssistantCloudError('sign-in-required');
            if (response.status === 403) throw new AssistantCloudError('verified-account-required');
            if (response.status === 504) throw new AssistantCloudError('cloud-timeout');
            throw new AssistantCloudError('cloud-unavailable');
          }
          const text = await response.text();
          if (controller.signal.aborted) throw abortError();
          ensureAuthorized();
          if (text.length > 64_000) throw new AssistantCloudError('cloud-unavailable');
          const result = JSON.parse(text) as { version?: unknown; decision?: unknown };
          if (result?.version !== 1 || !result.decision || typeof result.decision !== 'object')
            throw new AssistantCloudError('cloud-unavailable');
          return result.decision;
        };
        return await Promise.race([work(), stopped]);
      } catch (error) {
        if (request.signal?.aborted) throw abortError();
        if (timedOut) throw new AssistantCloudError('cloud-timeout');
        if (error instanceof AssistantCloudError) throw error;
        throw new AssistantCloudError('cloud-unavailable');
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', cancel);
        if (interrupt) controller.signal.removeEventListener('abort', interrupt);
      }
    },
  };
}
