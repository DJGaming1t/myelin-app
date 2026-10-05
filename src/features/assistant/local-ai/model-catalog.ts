export type LocalAiModelId = 'functiongemma-270m' | 'qwen3.5-0.8b';

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
    runtimeCandidates: ['litert-lm'],
    artifact: null,
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
      'A MYELIN-specific fine-tune/export must be selected before downloads are enabled.',
    ],
  },
  {
    id: 'qwen3.5-0.8b',
    displayName: 'Qwen3.5 0.8B',
    shortName: 'Qwen',
    vendor: 'qwen',
    sourceModel: 'Qwen/Qwen3.5-0.8B',
    license: 'Apache-2.0',
    role: 'reasoning-assistant',
    parameterLabel: '0.8B family',
    description:
      'Smarter local assistant candidate for interpretation and plan critique.',
    requiresTaskFineTune: false,
    runtimeCandidates: ['qwen-mobile'],
    artifact: null,
    targetDownloadMb: {
      min: 450,
      max: 650,
      kind: 'engineering-target',
    },
    capabilities: {
      text: true,
      vision: true,
      structuredActions: true,
      functionCalling: false,
      plannerCritique: 'moderate',
    },
    notes: [
      'The official checkpoint is not the mobile artifact MYELIN should distribute.',
      'A verified quantized Android artifact/runtime pair must be selected before downloads are enabled.',
    ],
  },
] as const;

export function localAiModelById(modelId: string) {
  return LOCAL_AI_MODELS.find((model) => model.id === modelId) ?? null;
}
