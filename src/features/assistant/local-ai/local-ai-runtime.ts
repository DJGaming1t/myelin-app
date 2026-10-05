import {
  LocalAiArtifactDescriptor,
  LocalAiModelDefinition,
  LocalAiModelId,
} from './model-catalog';

export type LocalAiPlatform = 'android' | 'ios' | 'web' | 'unknown';

export type LocalAiDeviceCapabilities = {
  platform: LocalAiPlatform;
  architecture?: string;
  availableRuntimeIds: string[];
  freeStorageBytes?: number | null;
  totalMemoryBytes?: number | null;
};

export type LocalAiCompatibilityCode =
  | 'unsupported_platform'
  | 'artifact_unconfigured'
  | 'runtime_missing'
  | 'insufficient_storage';

export type LocalAiCompatibilityIssue = {
  code: LocalAiCompatibilityCode;
  blocking: true;
  message: string;
};

export type LocalAiCompatibility = {
  compatible: boolean;
  runtimeId: string | null;
  issues: LocalAiCompatibilityIssue[];
};

export type LocalAiGenerationRequest = {
  prompt: string;
  maxOutputTokens?: number;
  jsonSchema?: unknown;
  tools?: unknown[];
  signal?: AbortSignal;
};

export type LocalAiGenerationResult = {
  text: string;
  finishReason: 'stop' | 'length' | 'cancelled' | 'error';
  inputTokens?: number;
  outputTokens?: number;
};

export type LocalAiRuntimeSession = {
  modelId: LocalAiModelId;
  generate(request: LocalAiGenerationRequest): Promise<LocalAiGenerationResult>;
  close(): Promise<void>;
};

export type LocalAiRuntimeLoadRequest = {
  model: LocalAiModelDefinition;
  artifact: LocalAiArtifactDescriptor;
  artifactUri: string;
};

export type LocalAiRuntimeAdapter = {
  id: string;
  isAvailable(): Promise<boolean>;
  load(request: LocalAiRuntimeLoadRequest): Promise<LocalAiRuntimeSession>;
};

function storageIssue(
  artifact: LocalAiArtifactDescriptor,
  capabilities: LocalAiDeviceCapabilities,
) {
  if (
    artifact.sizeBytes == null ||
    capabilities.freeStorageBytes == null
  ) {
    return null;
  }

  const required = Math.ceil(artifact.sizeBytes * 1.15);
  if (capabilities.freeStorageBytes >= required) return null;

  return {
    code: 'insufficient_storage' as const,
    blocking: true as const,
    message:
      'This device does not currently have enough free storage for the model plus installation headroom.',
  };
}

export function checkLocalAiCompatibility(
  model: LocalAiModelDefinition,
  capabilities: LocalAiDeviceCapabilities,
): LocalAiCompatibility {
  const issues: LocalAiCompatibilityIssue[] = [];

  if (capabilities.platform !== 'android') {
    issues.push({
      code: 'unsupported_platform',
      blocking: true,
      message: 'Local AI is currently planned for Android first.',
    });
  }

  if (!model.artifact || !model.artifact.downloadUrl) {
    issues.push({
      code: 'artifact_unconfigured',
      blocking: true,
      message:
        'MYELIN has not selected a verified downloadable mobile artifact for this model yet.',
    });
  }

  const runtimeId =
    model.runtimeCandidates.find((candidate) =>
      capabilities.availableRuntimeIds.includes(candidate),
    ) ?? null;

  if (!runtimeId) {
    issues.push({
      code: 'runtime_missing',
      blocking: true,
      message:
        'This app build does not contain a compatible native inference runtime for the model.',
    });
  }

  if (model.artifact) {
    const storage = storageIssue(model.artifact, capabilities);
    if (storage) issues.push(storage);
  }

  return {
    compatible: issues.length === 0,
    runtimeId,
    issues,
  };
}
