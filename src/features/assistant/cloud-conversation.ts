export class CloudChatError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(
      message ??
        (code === 'sign-in-required'
          ? 'Sign in with a verified email to use hosted conversation.'
          : 'Hosted conversation is currently unavailable.'),
    );
    this.name = 'CloudChatError';
    this.code = code;
  }
}

export function validCloudChatEndpoint(endpoint: string): boolean {
  const clean = endpoint.trim();
  return clean.startsWith('https://') && clean.length > 12;
}

export function chatMessagesForCloud(
  prior: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestUserContent: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return [...prior.slice(-6), { role: 'user', content: latestUserContent }];
}

export function createCloudChatClient(options: {
  endpoint: string;
  ownerId: string;
  getCurrentOwnerId: () => string | null;
  hasConsent: () => boolean;
  getIdToken: () => Promise<string>;
}) {
  return {
    async generate(request: {
      requestId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      signal?: AbortSignal;
    }): Promise<string> {
      if (!options.hasConsent()) {
        throw new CloudChatError('consent-required', 'Cloud conversation consent is turned off.');
      }
      if (options.getCurrentOwnerId() !== options.ownerId) {
        throw new CloudChatError('owner-changed', 'Active account changed.');
      }
      const token = await options.getIdToken();
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId: request.requestId,
          messages: request.messages,
        }),
        signal: request.signal,
      });
      if (!response.ok) {
        throw new CloudChatError('http-error', 'Could not reach the hosted conversation service.');
      }
      const data = (await response.json()) as { reply?: string };
      if (!data?.reply) {
        throw new CloudChatError('empty-reply', 'Hosted model returned an empty reply.');
      }
      return data.reply;
    },
  };
}
