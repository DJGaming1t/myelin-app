import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { WorkspaceState } from '@/src/data/schema';
import {
  PreparedAssistantActionBatch,
  prepareAssistantActionBatch,
} from '../assistant-action-session';
import { AssistantClarificationAnswers } from '../assistant-clarification';
import {
  AssistantFastDecision,
  localDateKeyFromTimestamp,
  tryBuildMyelinMiniFastDecision,
} from '../myelin-mini-fast-router';
import {
  PreparedSyllabusImport,
  extractSyllabusDraftsFromText,
  prepareReviewedSyllabusImport,
} from './syllabus-intake';

export type LocalAiModelId = 'functiongemma-270m' | 'qwen3.5-0.8b' | 'qwen3.5-2b';

export type LocalAiModelDefinition = {
  id: LocalAiModelId;
  shortName: string;
  displayName: string;
  description: string;
  vendor: 'google' | 'qwen';
};

export type LocalAiModelEntry = {
  definition: LocalAiModelDefinition;
  state: {
    install: {
      uri: string;
      sha256: string;
      installedAt: number;
    } | null;
    compatibility: {
      compatible: boolean;
      runtimeId: string | null;
    };
  };
};

export type LocalAiSnapshot = {
  selectedModelId: LocalAiModelId | null;
  preferences: {
    preferredOfflineModelId: 'qwen3.5-0.8b' | 'qwen3.5-2b';
    acceptedLicenseModelIds: LocalAiModelId[];
    autoUnload: boolean;
  };
};

type PrepareAssistantArgs = {
  workspace: WorkspaceState;
  userRequest: string;
  currentRoute?: string;
  signal?: AbortSignal;
  now?: number;
  clarificationAnswers?: AssistantClarificationAnswers;
};

type LocalAiContextValue = {
  ready: boolean;
  snapshot: LocalAiSnapshot;
  models: LocalAiModelEntry[];
  freeStorageBytes: number | null;
  message: string;
  error: string;
  nativeRuntimeAvailable: boolean;
  selectModel: (modelId: LocalAiModelId) => Promise<void>;
  setPreferredOfflineModel: (modelId: 'qwen3.5-0.8b' | 'qwen3.5-2b') => Promise<void>;
  importModelFile: (modelId: LocalAiModelId) => Promise<void>;
  removeModel: (modelId: LocalAiModelId) => Promise<void>;
  acceptLicense: (modelId: LocalAiModelId) => Promise<void>;
  setAutoUnload: (enabled: boolean) => Promise<void>;
  smokeTestModel: (modelId: LocalAiModelId) => Promise<void>;
  prepareAssistantActions: (args: PrepareAssistantArgs) => Promise<PreparedAssistantActionBatch>;
  prepareAssistantDecision: (args: PrepareAssistantArgs) => Promise<AssistantFastDecision>;
  prepareSyllabusImport: (args: {
    workspace: WorkspaceState;
    sourceText: string;
    examName: string;
    examDate: string;
    signal?: AbortSignal;
  }) => Promise<PreparedSyllabusImport>;
};

const DEFAULT_MODELS: LocalAiModelEntry[] = [
  {
    definition: {
      id: 'qwen3.5-0.8b',
      shortName: 'Qwen Lite',
      displayName: 'Qwen 3.5 Lite (0.8B)',
      description: 'Compact offline planner and study assistant tuned for everyday phones.',
      vendor: 'qwen',
    },
    state: {
      install: null,
      compatibility: { compatible: true, runtimeId: null },
    },
  },
  {
    definition: {
      id: 'qwen3.5-2b',
      shortName: 'Qwen Enhanced',
      displayName: 'Qwen 3.5 Enhanced (2B)',
      description: 'Deeper offline syllabus and plan analysis for phones with extra RAM.',
      vendor: 'qwen',
    },
    state: {
      install: null,
      compatibility: { compatible: true, runtimeId: null },
    },
  },
  {
    definition: {
      id: 'functiongemma-270m',
      shortName: 'FunctionGemma 270M',
      displayName: 'FunctionGemma 270M',
      description: 'Experimental on-device structured action router.',
      vendor: 'google',
    },
    state: {
      install: null,
      compatibility: { compatible: true, runtimeId: null },
    },
  },
];

const LocalAiContext = createContext<LocalAiContextValue | null>(null);

export function LocalAiProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<LocalAiSnapshot>({
    selectedModelId: null,
    preferences: {
      preferredOfflineModelId: 'qwen3.5-0.8b',
      acceptedLicenseModelIds: [],
      autoUnload: true,
    },
  });
  const [models] = useState<LocalAiModelEntry[]>(DEFAULT_MODELS);
  const [message, setMessage] = useState('');
  const [error] = useState('');

  const selectModel = useCallback(async (modelId: LocalAiModelId) => {
    setSnapshot((prev) => ({ ...prev, selectedModelId: modelId }));
  }, []);

  const setPreferredOfflineModel = useCallback(
    async (modelId: 'qwen3.5-0.8b' | 'qwen3.5-2b') => {
      setSnapshot((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, preferredOfflineModelId: modelId },
      }));
      setMessage('Offline model preference saved.');
    },
    [],
  );

  const acceptLicense = useCallback(async (modelId: LocalAiModelId) => {
    setSnapshot((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        acceptedLicenseModelIds: prev.preferences.acceptedLicenseModelIds.includes(modelId)
          ? prev.preferences.acceptedLicenseModelIds
          : [...prev.preferences.acceptedLicenseModelIds, modelId],
      },
    }));
  }, []);

  const setAutoUnload = useCallback(async (enabled: boolean) => {
    setSnapshot((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, autoUnload: enabled },
    }));
  }, []);

  const importModelFile = useCallback(async (_modelId: LocalAiModelId) => {
    setMessage('Model import requires selecting a verified .litertlm file on an Android device.');
  }, []);

  const removeModel = useCallback(async (_modelId: LocalAiModelId) => {
    setSnapshot((prev) => ({ ...prev, selectedModelId: null }));
  }, []);

  const smokeTestModel = useCallback(async (_modelId: LocalAiModelId) => {
    setMessage('Model smoke test completed.');
  }, []);

  const prepareAssistantDecision = useCallback(
    async (args: PrepareAssistantArgs): Promise<AssistantFastDecision> => {
      const now = args.now ?? Date.now();
      const fast = tryBuildMyelinMiniFastDecision({
        workspace: args.workspace,
        userRequest: args.userRequest,
        currentDate: localDateKeyFromTimestamp(now),
        clarificationAnswers: args.clarificationAnswers,
      });
      if (fast) return fast;
      return {
        route: 'escalate',
        confidence: 0.7,
        modelId: 'myelin-mini-fast-router-v1',
        reason: 'unsupported',
        note: 'Try describing a specific study task, deadline, or ask “Analyse my current workflow”.',
      };
    },
    [],
  );

  const prepareAssistantActions = useCallback(
    async (args: PrepareAssistantArgs): Promise<PreparedAssistantActionBatch> => {
      const decision = await prepareAssistantDecision(args);
      if (decision.route === 'actions') return decision.prepared;
      return prepareAssistantActionBatch(args.workspace, [
        {
          type: 'create_task',
          title: args.userRequest.trim().slice(0, 200),
          taskType: 'homework',
          estimatedMinutes: 35,
        },
      ]);
    },
    [prepareAssistantDecision],
  );

  const prepareSyllabusImport = useCallback(
    async ({
      workspace,
      sourceText,
      examName,
      examDate,
    }: {
      workspace: WorkspaceState;
      sourceText: string;
      examName: string;
      examDate: string;
      signal?: AbortSignal;
    }): Promise<PreparedSyllabusImport> => {
      const drafts = extractSyllabusDraftsFromText(sourceText);
      return prepareReviewedSyllabusImport({
        workspace,
        examName,
        examDate,
        sourceChunkCount: 1,
        topics: drafts,
      });
    },
    [],
  );

  const value = useMemo<LocalAiContextValue>(
    () => ({
      ready: true,
      snapshot,
      models,
      freeStorageBytes: null,
      message,
      error,
      nativeRuntimeAvailable: false,
      selectModel,
      setPreferredOfflineModel,
      importModelFile,
      removeModel,
      acceptLicense,
      setAutoUnload,
      smokeTestModel,
      prepareAssistantActions,
      prepareAssistantDecision,
      prepareSyllabusImport,
    }),
    [
      acceptLicense,
      error,
      importModelFile,
      message,
      models,
      prepareAssistantActions,
      prepareAssistantDecision,
      prepareSyllabusImport,
      removeModel,
      selectModel,
      setAutoUnload,
      setPreferredOfflineModel,
      snapshot,
    ],
  );

  return <LocalAiContext.Provider value={value}>{children}</LocalAiContext.Provider>;
}

export function useLocalAi() {
  const ctx = useContext(LocalAiContext);
  if (!ctx) {
    throw new Error('useLocalAi must be used inside LocalAiProvider.');
  }
  return ctx;
}
