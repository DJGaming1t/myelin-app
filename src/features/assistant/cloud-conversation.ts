// Actual hosted, multi-turn model transport. No API key or user account data
// is stored in this module. Disabled unless an HTTPS endpoint was deployed,
// authenticated and explicitly configured in the preview environment.
export type CloudChatMessage = { role: 'user' | 'assistant'; content: string };

export class CloudChatError extends Error {
  constructor(public readonly code: string) {
    const reasons: Record<string, string> = {
      'not-connected': 'Cloud conversation is not connected to a verified server yet.',
      'consent-required': 'Turn on cloud conversation to send messages to the model.',
      'sign-in-required': 'Sign in with a verified account to use hosted conversation.',
      'verified-account-required': 'Verify your account email before using hosted conversation.',
      'cloud-timeout': 'The conversation model took too long. Try again.',
      'daily-limit': 'The hosted model reached its daily free allocation. Local MYELIN tools still work.',
      'cloud-busy': 'The hosted model is busy or temporarily rate-limited. Try again later.',
      'cloud-unavailable': 'The conversation model is unavailable. Your message was not applied to any task.',
    };
    super(reasons[code] ?? reasons['cloud-unavailable']);
    this.name = 'CloudChatError';
  }
}

function abortError() {
  const error = new Error('The chat request was cancelled.');
  error.name = 'AbortError';
  return error;
}

export function validCloudChatEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === '/chat' &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
  } catch { return false; }
}

// Preserve only a few previous turns; never collect app state or notes by
// default. The user explicitly opts in to sending chat messages.
export function chatMessagesForCloud(
  previous: CloudChatMessage[], current: string,
): CloudChatMessage[] {
  const bounded = previous.slice(-10).map(item => ({
    role: item.role,
    content: item.content.trim().slice(0, 1500),
  })).filter(item => item.content);
  const ordered: CloudChatMessage[] = [];
  for (const item of bounded) {
    if (!['user', 'assistant'].includes(item.role)) continue;
    if (!ordered.length && item.role !== 'user') continue;
    if (ordered.length && ordered[ordered.length - 1]!.role === item.role) {
      ordered[ordered.length - 1] = item;
    } else ordered.push(item);
  }
  if (ordered[ordered.length - 1]?.role === 'user') ordered.pop();
  const history = ordered.slice(-6);
  if (history[0]?.role === 'assistant') history.shift();
  return [...history, { role: 'user', content: current.trim().slice(0, 2000) }];
}

export function createCloudChatClient(options: {
  endpoint: string;
  ownerId: string;
  getCurrentOwnerId(): string | null;
  hasConsent(): boolean;
  getIdToken(): Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  if (!validCloudChatEndpoint(options.endpoint) || !options.ownerId)
    throw new CloudChatError('not-connected');
  const send = options.fetch ?? fetch;
  const authorize = () => {
    if (!options.hasConsent()) throw new CloudChatError('consent-required');
    if (!options.ownerId || options.getCurrentOwnerId() !== options.ownerId)
      throw new CloudChatError('sign-in-required');
  };

  return {
    async generate(input: {
      requestId: string;
      messages: CloudChatMessage[];
      signal?: AbortSignal;
    }): Promise<string> {
      authorize();
      if (input.signal?.aborted) throw abortError();
      if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.requestId) ||
          !Array.isArray(input.messages) ||
          input.messages.length < 1 || input.messages.length > 9 ||
          input.messages[0]?.role !== 'user' ||
          input.messages[input.messages.length - 1]?.role !== 'user' ||
          input.messages.some((m, i) =>
            !['user', 'assistant'].includes(m.role) ||
            typeof m.content !== 'string' || !m.content.trim() ||
            m.content.length > 2000 ||
            (i > 0 && input.messages[i - 1]!.role === m.role)))
        throw new CloudChatError('cloud-unavailable');
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      input.signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.min(30_000, Math.max(1, options.timeoutMs ?? 30_000)));
      let stop: (() => void) | undefined;
      const stopped = new Promise<never>((_, reject) => {
        stop = () => reject(timedOut ? new CloudChatError('cloud-timeout') : abortError());
        controller.signal.addEventListener('abort', stop, { once: true });
      });
      try {
        const work = async () => {
          const token = await options.getIdToken();
          if (controller.signal.aborted) throw abortError();
          authorize();
          if (!token || /\s/.test(token)) throw new CloudChatError('sign-in-required');
          const response = await send(options.endpoint, {
            method: 'POST', signal: controller.signal,
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
            body: JSON.stringify({ version: 1, requestId: input.requestId, messages: input.messages }),
          });
          if (controller.signal.aborted) throw abortError();
          authorize();
          if (!response.ok) {
            if (response.status === 401) throw new CloudChatError('sign-in-required');
            if (response.status === 403) throw new CloudChatError('verified-account-required');
            if (response.status === 429) {
              const json = await response.json().catch(() => ({}));
              throw new CloudChatError(json?.error === 'daily-limit' ? 'daily-limit' : 'cloud-busy');
            }
            if (response.status === 504) throw new CloudChatError('cloud-timeout');
            throw new CloudChatError('cloud-unavailable');
          }
          const text = await response.text();
          if (controller.signal.aborted) throw abortError();
          authorize();
          if (text.length > 9_000) throw new CloudChatError('cloud-unavailable');
          const result = JSON.parse(text) as { version?: unknown; reply?: unknown };
          if (result.version !== 1 || typeof result.reply !== 'string' ||
              !result.reply.trim() || result.reply.length > 7_000)
            throw new CloudChatError('cloud-unavailable');
          return result.reply.trim();
        };
        return await Promise.race([work(), stopped]);
      } catch (error) {
        if (input.signal?.aborted) throw abortError();
        if (timedOut) throw new CloudChatError('cloud-timeout');
        if (error instanceof CloudChatError) throw error;
        throw new CloudChatError('cloud-unavailable');
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener('abort', cancel);
        if (stop) controller.signal.removeEventListener('abort', stop);
      }
    },
  };
}
