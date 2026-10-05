import { Platform } from 'react-native';

import MyelinLiteRtLm from '@/modules/myelin-litertlm';

import {
  LocalAiGenerationRequest,
  LocalAiGenerationResult,
  LocalAiRuntimeAdapter,
  LocalAiRuntimeSession,
} from './local-ai-runtime';

const DEFAULT_MAX_OUTPUT_TOKENS = 384;

function clampOutputTokens(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.max(8, Math.min(1024, Math.round(value)));
}

export const liteRtLmRuntimeAdapter: LocalAiRuntimeAdapter = {
  id: 'litert-lm',

  async isAvailable() {
    if (Platform.OS !== 'android' || !MyelinLiteRtLm) return false;
    try {
      return MyelinLiteRtLm.isAvailable();
    } catch {
      return false;
    }
  },

  async load(request) {
    if (Platform.OS !== 'android' || !MyelinLiteRtLm) {
      throw new Error(
        'LiteRT-LM is not available in this app build. Install a native MYELIN preview build first.',
      );
    }

    const nativeModule = MyelinLiteRtLm;
    const nativeSessionId = await nativeModule.load(request.artifactUri);

    const session: LocalAiRuntimeSession = {
      modelId: request.model.id,

      async generate(
        generation: LocalAiGenerationRequest,
      ): Promise<LocalAiGenerationResult> {
        if (generation.signal?.aborted) {
          return { text: '', finishReason: 'cancelled' };
        }

        let cancelled = false;
        const onAbort = () => {
          cancelled = true;
          void nativeModule.cancel(nativeSessionId).catch(() => undefined);
        };
        generation.signal?.addEventListener('abort', onAbort, { once: true });

        try {
          const text = await nativeModule.generate(
            nativeSessionId,
            generation.prompt,
            clampOutputTokens(generation.maxOutputTokens),
          );

          if (cancelled || generation.signal?.aborted) {
            return { text: '', finishReason: 'cancelled' };
          }

          return {
            text,
            finishReason: 'stop',
          };
        } catch (error) {
          if (cancelled || generation.signal?.aborted) {
            return { text: '', finishReason: 'cancelled' };
          }
          throw error;
        } finally {
          generation.signal?.removeEventListener('abort', onAbort);
        }
      },

      async close() {
        await nativeModule.close(nativeSessionId);
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
