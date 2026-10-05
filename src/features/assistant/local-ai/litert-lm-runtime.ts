import { createLLM } from 'react-native-litert-lm';
import { Platform } from 'react-native';

import {
  LocalAiGenerationRequest,
  LocalAiGenerationResult,
  LocalAiRuntimeAdapter,
  LocalAiRuntimeSession,
} from './local-ai-runtime';

const DEFAULT_MAX_OUTPUT_TOKENS = 384;
const DEFAULT_CONTEXT_TOKENS = 1024;

function clampOutputTokens(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.max(8, Math.min(1024, Math.round(value)));
}

function localModelPath(uri: string) {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function responseSchema(schema: unknown) {
  if (schema == null) return undefined;
  return typeof schema === 'string' ? schema : JSON.stringify(schema);
}

export const liteRtLmRuntimeAdapter: LocalAiRuntimeAdapter = {
  id: 'litert-lm',

  async isAvailable() {
    if (Platform.OS !== 'android') return false;

    try {
      const probe = createLLM();
      probe.close();
      return true;
    } catch {
      return false;
    }
  },

  async load(request) {
    if (Platform.OS !== 'android') {
      throw new Error(
        'LiteRT-LM is available only in a native Android MYELIN build.',
      );
    }

    const llm = createLLM({
      enableMemoryTracking: true,
      maxMemorySnapshots: 64,
    });

    try {
      await llm.loadModel(localModelPath(request.artifactUri), {
        backend: 'cpu',
        maxContextTokens: DEFAULT_CONTEXT_TOKENS,
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: 0,
        enableStructuredOutput: true,
      });
    } catch (error) {
      llm.close();
      throw error;
    }

    let closed = false;
    let inFlight: Promise<unknown> | null = null;

    const session: LocalAiRuntimeSession = {
      modelId: request.model.id,

      async generate(
        generation: LocalAiGenerationRequest,
      ): Promise<LocalAiGenerationResult> {
        if (closed) {
          throw new Error('This local AI session has already been closed.');
        }
        if (generation.signal?.aborted) {
          return { text: '', finishReason: 'cancelled' };
        }
        if (inFlight) {
          throw new Error(
            'This local AI session is already generating. Wait for it to finish first.',
          );
        }

        let cancelled = false;
        const onAbort = () => {
          // react-native-litert-lm 0.7.0 does not expose a safe public
          // mid-generation cancel primitive. We mark the result cancelled and
          // discard it when native generation returns instead of pretending
          // compute stopped immediately.
          cancelled = true;
        };
        generation.signal?.addEventListener('abort', onAbort, { once: true });

        try {
          // Independent MYELIN requests must never inherit hidden model chat
          // history from the previous planning request.
          llm.resetConversation();

          const work = llm.execute(
            [{ type: 'text', text: generation.prompt }],
            undefined,
            {
              maxOutputTokens: clampOutputTokens(generation.maxOutputTokens),
              ...(generation.jsonSchema == null
                ? {}
                : { responseSchema: responseSchema(generation.jsonSchema) }),
            },
          );
          inFlight = work;
          const text = await work;

          if (cancelled || generation.signal?.aborted) {
            return { text: '', finishReason: 'cancelled' };
          }

          return {
            text,
            finishReason: 'stop',
          };
        } finally {
          inFlight = null;
          generation.signal?.removeEventListener('abort', onAbort);
        }
      },

      async close() {
        if (closed) return;
        closed = true;

        if (inFlight) {
          try {
            await inFlight;
          } catch {
            // Unload still needs to run after a failed generation.
          }
        }

        await llm.unload();
        llm.close();
      },
    };

    return session;
  },
};

export async function liteRtLmRuntimeIds() {
  return (await liteRtLmRuntimeAdapter.isAvailable())
    ? [liteRtLmRuntimeAdapter.id]
    : [];
}
