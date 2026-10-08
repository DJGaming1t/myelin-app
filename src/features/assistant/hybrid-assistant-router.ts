import { WorkspaceState } from '@/src/data/schema';
import {
  MyelinMiniModelAdapter,
  MyelinMiniRouteResult,
  routeWithMyelinMini,
} from './myelin-mini';

function throwIfCancelled(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error('The assistant request was cancelled.');
  error.name = 'AbortError';
  throw error;
}

// The caller supplies providers. Cloud is never invoked without explicit consent.
// Both providers use the same validated protocol and preview/confirmation layer.
export async function routeWithHybridAssistant(input: {
  workspace: WorkspaceState;
  userRequest: string;
  requestId: string;
  offline: MyelinMiniModelAdapter;
  cloud?: MyelinMiniModelAdapter;
  allowCloudFallback: boolean;
  currentRoute?: string;
  now?: number;
  signal?: AbortSignal;
}): Promise<MyelinMiniRouteResult> {
  throwIfCancelled(input.signal);
  if (!input.userRequest.trim()) throw new Error('Enter an assistant request first.');
  let local: MyelinMiniRouteResult;
  try {
    local = await routeWithMyelinMini({ ...input, model: input.offline });
    throwIfCancelled(input.signal);
  } catch (error) {
    throwIfCancelled(input.signal);
    if (error instanceof Error && error.name === 'AbortError') throw error;
    local = {
      route: 'escalate', confidence: 0, reason: 'low-confidence',
      note: 'The offline model is unavailable or could not prepare a valid response. Check the selected model or try a simpler request.',
      modelId: input.offline.id,
    };
  }
  // A clarification is a question for the user, not permission to guess remotely.
  if (local.route !== 'escalate' || !input.allowCloudFallback || !input.cloud) return local;
  try {
    const remote = await routeWithMyelinMini({ ...input, model: input.cloud, allowFastRouter: false });
    throwIfCancelled(input.signal);
    return remote;
  } catch (error) {
    throwIfCancelled(input.signal);
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { ...local, note: `${local.note} Cloud AI is also unavailable right now. Try again later.` };
  }
}
