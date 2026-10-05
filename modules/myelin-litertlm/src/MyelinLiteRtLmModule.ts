import { requireOptionalNativeModule } from 'expo-modules-core';

export type MyelinLiteRtLmRuntimeInfo = {
  runtimeId: 'litert-lm';
  backend: 'CPU';
  libraryVersion: string;
  supportsCancellation: boolean;
  automaticToolCalling: false;
};

export type MyelinLiteRtLmNativeModule = {
  isAvailable(): boolean;
  runtimeInfo(): MyelinLiteRtLmRuntimeInfo;
  load(modelUri: string, maxNumTokens?: number | null): Promise<string>;
  generate(
    sessionId: string,
    prompt: string,
    maxOutputTokens?: number | null,
  ): Promise<string>;
  cancel(sessionId: string): Promise<void>;
  close(sessionId: string): Promise<void>;
  closeAll(): Promise<void>;
};

export default requireOptionalNativeModule(
  'MyelinLiteRtLm',
) as MyelinLiteRtLmNativeModule | null;
