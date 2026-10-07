import type { LocalAiRuntimeAdapter } from './local-ai-runtime';

// Keep native Nitro imports out of the web bundle, including when AI is disabled.
// Metro resolves this file on web; Android keeps the native implementation.
export const liteRtLmRuntimeAdapter: LocalAiRuntimeAdapter = {
  id: 'litert-lm',
  async isAvailable() {
    return false;
  },
  async load() {
    throw new Error('Local AI requires a native Android MYELIN build.');
  },
};

export async function liteRtLmRuntimeIds(): Promise<string[]> {
  return [];
}
