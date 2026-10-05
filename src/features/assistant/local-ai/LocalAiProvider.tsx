import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { WorkspaceState } from '@/src/data/schema';
import { PreparedAssistantActionBatch } from '@/src/features/assistant/assistant-action-session';

import {
  LocalAiManager,
  LocalAiManagerSnapshot,
} from './local-ai-manager';
import { createLocalAiPreferenceStore } from './local-ai-preferences';
import {
  createExpoLocalAiModelFileStore,
  getLocalAiDeviceCapabilities,
} from './expo-model-file-store';
import {
  LOCAL_AI_MODELS,
  LocalAiModelDefinition,
  LocalAiModelId,
} from './model-catalog';
import {
  liteRtLmRuntimeAdapter,
  liteRtLmRuntimeIds,
} from './litert-lm-runtime';
import { prepareLocalAssistantActions } from './local-assistant-bridge';

export type LocalAiModelView = {
  definition: LocalAiModelDefinition;
  state: LocalAiManagerSnapshot['models'][number];
};

type LocalAiContextValue = {
  ready: boolean;
  snapshot: LocalAiManagerSnapshot;
  models: LocalAiModelView[];
  freeStorageBytes: number | null;
  message: string;
  error: string;
  refresh: () => Promise<void>;
  selectModel: (modelId: LocalAiModelId | null) => Promise<void>;
  downloadModel: (modelId: LocalAiModelId) => Promise<void>;
  importModelFile: (modelId: LocalAiModelId) => Promise<void>;
  cancelDownload: (modelId: LocalAiModelId) => void;
  removeModel: (modelId: LocalAiModelId) => Promise<void>;
  acceptLicense: (modelId: LocalAiModelId) => Promise<void>;
  setAutoUnload: (value: boolean) => Promise<void>;
  smokeTestModel: (modelId: LocalAiModelId) => Promise<string>;
  prepareAssistantActions: (request: {
    workspace: WorkspaceState;
    userRequest: string;
    currentRoute?: string;
    requestId?: string;
    signal?: AbortSignal;
  }) => Promise<PreparedAssistantActionBatch>;
};

const EMPTY_SNAPSHOT: LocalAiManagerSnapshot = {
  initialized: false,
  selectedModelId: null,
  activeModelId: null,
  preferences: {
    selectedModelId: null,
    acceptedLicenseModelIds: [],
    autoUnload: true,
  },
  models: [],
};

const LocalAiContext = createContext<LocalAiContextValue | null>(null);

const LOCAL_AI_RUNTIME_ADAPTERS = [liteRtLmRuntimeAdapter];

function friendlyError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'Download paused. Tap Download to resume.';
    if (error.message) return error.message;
  }
  return 'The local AI operation could not be completed.';
}

export function LocalAiProvider({ children }: PropsWithChildren) {
  const managerRef = useRef<LocalAiManager | null>(null);
  const controllers = useRef(new Map<LocalAiModelId, AbortController>());

  if (!managerRef.current) {
    managerRef.current = new LocalAiManager(
      createExpoLocalAiModelFileStore(),
      createLocalAiPreferenceStore(AsyncStorage),
      async () =>
        getLocalAiDeviceCapabilities(await liteRtLmRuntimeIds()),
      LOCAL_AI_RUNTIME_ADAPTERS,
    );
  }

  const manager = managerRef.current;
  const [snapshot, setSnapshot] =
    useState<LocalAiManagerSnapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [freeStorageBytes, setFreeStorageBytes] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const updateStorage = useCallback(() => {
    const capabilities = getLocalAiDeviceCapabilities([]);
    setFreeStorageBytes(capabilities.freeStorageBytes ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const next = await manager.initialize();
      setSnapshot(next);
      updateStorage();
      setReady(true);
    } catch (cause) {
      setError(friendlyError(cause));
      setReady(true);
    }
  }, [manager, updateStorage]);

  useEffect(() => {
    const unsubscribe = manager.subscribe(setSnapshot);
    void refresh();
    return unsubscribe;
  }, [manager, refresh]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        updateStorage();
        return;
      }

      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      controllers.current.clear();
      void manager.handleAppBackgrounded();
    });

    return () => subscription.remove();
  }, [manager, updateStorage]);

  const selectModel = useCallback(
    async (modelId: LocalAiModelId | null) => {
      setError('');
      await manager.selectModel(modelId);
      setMessage(
        modelId
          ? `${LOCAL_AI_MODELS.find((model) => model.id === modelId)?.shortName ?? 'Model'} selected for local AI.`
          : 'Local AI model selection cleared.',
      );
    },
    [manager],
  );

  const downloadModel = useCallback(
    async (modelId: LocalAiModelId) => {
      setError('');
      setMessage('');
      const controller = new AbortController();
      controllers.current.set(modelId, controller);

      try {
        await manager.download(modelId, { signal: controller.signal });
        setMessage('Model download verified and installed.');
      } catch (cause) {
        const next = friendlyError(cause);
        if (cause instanceof Error && cause.name === 'AbortError') {
          setMessage(next);
        } else {
          setError(next);
        }
        throw cause;
      } finally {
        if (controllers.current.get(modelId) === controller) {
          controllers.current.delete(modelId);
        }
        updateStorage();
      }
    },
    [manager, updateStorage],
  );

  const importModelFile = useCallback(
    async (modelId: LocalAiModelId) => {
      setError('');
      setMessage('');

      if (Platform.OS === 'web') {
        const cause = new Error('Local model import is only available in the native app.');
        setError(friendlyError(cause));
        throw cause;
      }

      try {
        const picked = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: '*/*',
        });
        if (picked.canceled) {
          setMessage('Model import cancelled.');
          return;
        }

        const asset = picked.assets[0];
        if (!asset) {
          throw new Error('No model file was selected.');
        }

        await manager.importFile(modelId, {
          uri: asset.uri,
          name: asset.name,
          sizeBytes: asset.size ?? null,
        });
        setMessage('Model file verified and imported into MYELIN.');
      } catch (cause) {
        setError(friendlyError(cause));
        throw cause;
      } finally {
        updateStorage();
      }
    },
    [manager, updateStorage],
  );

  const cancelDownload = useCallback((modelId: LocalAiModelId) => {
    controllers.current.get(modelId)?.abort();
  }, []);

  const removeModel = useCallback(
    async (modelId: LocalAiModelId) => {
      setError('');
      setMessage('');
      try {
        controllers.current.get(modelId)?.abort();
        controllers.current.delete(modelId);
        await manager.remove(modelId);
        setMessage('Downloaded model removed from this device.');
      } catch (cause) {
        setError(friendlyError(cause));
        throw cause;
      } finally {
        updateStorage();
      }
    },
    [manager, updateStorage],
  );

  const acceptLicense = useCallback(
    async (modelId: LocalAiModelId) => {
      setError('');
      await manager.acceptLicense(modelId);
      setMessage('Model licence acceptance saved on this device.');
    },
    [manager],
  );

  const setAutoUnload = useCallback(
    async (value: boolean) => {
      setError('');
      await manager.setAutoUnload(value);
    },
    [manager],
  );

  const smokeTestModel = useCallback(
    async (modelId: LocalAiModelId) => {
      setError('');
      setMessage('');
      let loaded = false;

      try {
        const session = await manager.load(modelId);
        loaded = true;
        const result = await session.generate({
          prompt:
            'This is a native runtime test. Reply with exactly MYELIN_OK and nothing else.',
          maxOutputTokens: 24,
        });
        const output = result.text.trim();
        if (result.finishReason !== 'stop' || !output) {
          throw new Error('The native model did not return a usable response.');
        }
        setMessage(`Native AI test replied: ${output.slice(0, 120)}`);
        return output;
      } catch (cause) {
        setError(friendlyError(cause));
        throw cause;
      } finally {
        if (loaded) {
          try {
            await manager.unload();
          } catch {
            // The next refresh reconciles lifecycle state if native cleanup fails.
          }
        }
        updateStorage();
      }
    },
    [manager, updateStorage],
  );

  const prepareAssistantActions = useCallback(
    async (request: {
      workspace: WorkspaceState;
      userRequest: string;
      currentRoute?: string;
      requestId?: string;
      signal?: AbortSignal;
    }) => {
      setError('');
      setMessage('');

      const selectedModelId = manager.snapshot().selectedModelId;
      if (!selectedModelId) {
        const cause = new Error('Choose a local AI model before using the assistant.');
        setError(friendlyError(cause));
        throw cause;
      }

      try {
        const session = await manager.load(selectedModelId);
        const prepared = await prepareLocalAssistantActions({
          ...request,
          session,
        });
        const count = prepared.preview.results.length;
        setMessage(
          `Local AI prepared ${count} ${count === 1 ? 'action' : 'actions'}. Review before applying.`,
        );
        return prepared;
      } catch (cause) {
        setError(friendlyError(cause));
        throw cause;
      }
    },
    [manager],
  );

  const models = useMemo(
    () =>
      LOCAL_AI_MODELS.map((definition) => ({
        definition,
        state:
          snapshot.models.find((state) => state.modelId === definition.id) ?? {
            modelId: definition.id,
            lifecycle: 'blocked' as const,
            compatibility: {
              compatible: false,
              runtimeId: null,
              issues: [],
            },
            install: null,
            progress: null,
            error: '',
          },
      })),
    [snapshot.models],
  );

  const value = useMemo<LocalAiContextValue>(
    () => ({
      ready,
      snapshot,
      models,
      freeStorageBytes,
      message,
      error,
      refresh,
      selectModel,
      downloadModel,
      importModelFile,
      cancelDownload,
      removeModel,
      acceptLicense,
      setAutoUnload,
      smokeTestModel,
      prepareAssistantActions,
    }),
    [
      acceptLicense,
      cancelDownload,
      downloadModel,
      error,
      importModelFile,
      freeStorageBytes,
      message,
      models,
      ready,
      refresh,
      removeModel,
      selectModel,
      setAutoUnload,
      smokeTestModel,
      prepareAssistantActions,
      snapshot,
    ],
  );

  return (
    <LocalAiContext.Provider value={value}>
      {children}
    </LocalAiContext.Provider>
  );
}

export function useLocalAi() {
  const value = useContext(LocalAiContext);
  if (!value) throw new Error('useLocalAi must be used inside LocalAiProvider.');
  return value;
}
