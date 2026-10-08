export type QwenOfflineModelId = 'qwen3.5-0.8b' | 'qwen3.5-2b';
export type LocalAiModelId = 'functiongemma-270m' | QwenOfflineModelId;

export type LocalAiArtifactDescriptor = {
  id: string;
  runtimeId: string;
  format: string;
  fileName: string;
  downloadUrl?: string;
  sizeBytes?: number;
  sha256?: string;
  releaseStage: 'unconfigured' | 'candidate' | 'release';
  notes: string[];
};

export type LocalAiModelDefinition = {
  id: LocalAiModelId;
  displayName: string;
  shortName: string;
  vendor: 'google' | 'qwen';
  sourceModel: string;
  license: string;
  role: 'tool-specialist' | 'reasoning-assistant';
  parameterLabel: string;
  description: string;
  requiresTaskFineTune: boolean;
  availability: 'import-only' | 'coming-soon';
  sourceUrl: string;
  artifactPageUrl?: string;
  runtimeCandidates: string[];
  artifact: LocalAiArtifactDescriptor | null;
  targetDownloadMb: {
    min: number;
    max: number;
    kind: 'engineering-target';
  };
  capabilities: {
    text: true;
    vision: boolean;
    structuredActions: boolean;
    functionCalling: boolean;
    plannerCritique: 'limited' | 'moderate';
  };
  notes: string[];
};

export const LOCAL_AI_MODELS: readonly LocalAiModelDefinition[] = [
  {
    id: 'functiongemma-270m',
    displayName: 'FunctionGemma 270M',
    shortName: 'FunctionGemma',
    vendor: 'google',
    sourceModel: 'google/functiongemma-270m-it',
    license: 'Gemma',
    role: 'tool-specialist',
    parameterLabel: '270M',
    description:
      'Small tool-calling specialist intended for a MYELIN-specific fine-tune.',
    requiresTaskFineTune: true,
    availability: 'import-only',
    sourceUrl:
      'https://huggingface.co/litert-community/functiongemma-270m-ft-mobile-actions',
    artifactPageUrl:
      'https://huggingface.co/litert-community/functiongemma-270m-ft-mobile-actions/blob/main/mobile_actions_q8_ekv1024.litertlm',
    runtimeCandidates: ['litert-lm'],
    artifact: {
      id: 'functiongemma-mobile-actions-q8-ekv1024',
      runtimeId: 'litert-lm',
      format: 'litertlm',
      fileName: 'mobile_actions_q8_ekv1024.litertlm',
      sizeBytes: 288_964_608,
      sha256:
        '33e295cbd996b419bb1de8f3f85c5b6b01ee058a2c89bdb2173cf3e6ff4ce9d0',
      releaseStage: 'candidate',
      notes: [
        'Runtime smoke-test candidate only; this is not the final MYELIN-specific fine-tune.',
        'The official FunctionGemma source is Gemma-license gated, so MYELIN does not expose an unauthenticated direct download URL.',
        'The recorded SHA-256 is a candidate fingerprint and must be re-verified against the licensed release source before production distribution.',
      ],
    },
    targetDownloadMb: {
      min: 250,
      max: 350,
      kind: 'engineering-target',
    },
    capabilities: {
      text: true,
      vision: false,
      structuredActions: true,
      functionCalling: true,
      plannerCritique: 'limited',
    },
    notes: [
      'Do not ship the generic checkpoint as the finished MYELIN assistant.',
      'The configured mobile-actions bundle is only for native runtime validation.',
      'Production download remains disabled until a MYELIN-specific licensed artifact is selected.',
    ],
  },
  {
    id: 'qwen3.5-0.8b',
    displayName: 'Lite Offline AI · Qwen3.5 0.8B',
    shortName: 'Qwen Lite',
    vendor: 'qwen',
    sourceModel: 'Qwen/Qwen3.5-0.8B',
    license: 'Apache-2.0',
    role: 'reasoning-assistant',
    parameterLabel: '0.8B family',
    description:
      'The smaller MYELIN interpreter for devices where download size and speed matter most.',
    requiresTaskFineTune: true,
    availability: 'coming-soon',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.5-0.8B',
    runtimeCandidates: ['litert-lm'],
    artifact: null,
    targetDownloadMb: {
      min: 900,
      max: 1050,
      kind: 'engineering-target',
    },
    capabilities: {
      text: true,
      vision: false,
      structuredActions: true,
      functionCalling: false,
      plannerCritique: 'moderate',
    },
    notes: [
      'MYELIN fine-tuning and evaluation are in progress; no approved phone artifact is configured.',
      'Size targets are estimates, not a measured download or working-RAM guarantee.',
    ],
  },
  {
    id: 'qwen3.5-2b',
    displayName: 'Enhanced Offline AI · Qwen3.5 2B',
    shortName: 'Qwen Enhanced',
    vendor: 'qwen',
    sourceModel: 'Qwen/Qwen3.5-2B',
    license: 'Apache-2.0',
    role: 'reasoning-assistant',
    parameterLabel: '2B family',
    description: 'A larger candidate for interpreting more involved requests. Phone speed and memory must be measured before release.',
    requiresTaskFineTune: true,
    availability: 'coming-soon',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.5-2B',
    runtimeCandidates: ['litert-lm'],
    artifact: null,
    targetDownloadMb: { min: 1200, max: 1700, kind: 'engineering-target' },
    capabilities: {
      text: true,
      vision: false,
      structuredActions: true,
      functionCalling: false,
      plannerCritique: 'moderate',
    },
    notes: [
      'Needs its own fine-tune; the 0.8B adapter cannot be reused for 2B.',
      'Download remains disabled until quality, conversion and phone-runtime checks pass.',
      'The current native runtime accepts LiteRT-LM bundles, not training adapters or GGUF files.',
    ],
  },
] as const;

export function localAiModelById(modelId: string) {
  return LOCAL_AI_MODELS.find((model) => model.id === modelId) ?? null;
}

