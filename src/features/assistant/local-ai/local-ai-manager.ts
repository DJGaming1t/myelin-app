import {
  LOCAL_AI_MODELS,
  LocalAiArtifactDescriptor,
  LocalAiModelDefinition,
  LocalAiModelId,
  localAiModelById,
} from './model-catalog';
import {
  LocalAiCompatibility,
  LocalAiDeviceCapabilities,
  LocalAiRuntimeAdapter,
  LocalAiRuntimeSession,
  checkLocalAiCompatibility,
} from './local-ai-runtime';

export type LocalAiInstallRecord = {
  modelId: LocalAiModelId;
  artifactId: string;
  uri: string;
  sizeBytes: number | null;
  installedAt: number;
};

export type LocalAiDownloadProgress = {
  writtenBytes: number;
  totalBytes: number | null;
};

export type LocalAiModelFileStore = {
  inspect(
    model: LocalAiModelDefinition,
    artifact: LocalAiArtifactDescriptor,
  ): Promise<LocalAiInstallRecord | null>;
  download(
    model: LocalAiModelDefinition,
    artifact: LocalAiArtifactDescriptor,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: LocalAiDownloadProgress) => void;
    },
  ): Promise<LocalAiInstallRecord>;
  remove(modelId: LocalAiModelId): Promise<void>;
};

export type LocalAiPreferences = {
  selectedModelId: LocalAiModelId | null;
  acceptedLicenseModelIds: LocalAiModelId[];
  autoUnload: boolean;
};

export type LocalAiPreferenceStore = {
  load(): Promise<LocalAiPreferences>;
  save(preferences: LocalAiPreferences): Promise<void>;
};

export type LocalAiModelLifecycle =
  | 'not-installed'
  | 'blocked'
  | 'downloading'
  | 'installed'
  | 'loading'
  | 'loaded'
  | 'error';

export type LocalAiModelState = {
  modelId: LocalAiModelId;
  lifecycle: LocalAiModelLifecycle;
  compatibility: LocalAiCompatibility;
  install: LocalAiInstallRecord | null;
  progress: LocalAiDownloadProgress | null;
  error: string;
};

export type LocalAiManagerSnapshot = {
  initialized: boolean;
  selectedModelId: LocalAiModelId | null;
  activeModelId: LocalAiModelId | null;
  preferences: LocalAiPreferences;
  models: LocalAiModelState[];
};

export class LocalAiManagerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'unknown_model'
      | 'busy'
      | 'blocked'
      | 'artifact_unconfigured'
      | 'not_installed'
      | 'runtime_unavailable'
      | 'license_required',
  ) {
    super(message);
    this.name = 'LocalAiManagerError';
  }
}

function defaultPreferences(): LocalAiPreferences {
  return {
    selectedModelId: null,
    acceptedLicenseModelIds: [],
    autoUnload: true,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Local AI operation failed.';
}

export class LocalAiManager {
  private readonly catalog: readonly LocalAiModelDefinition[];
  private readonly states = new Map<LocalAiModelId, LocalAiModelState>();
  private readonly runtimes = new Map<string, LocalAiRuntimeAdapter>();
  private preferences: LocalAiPreferences = defaultPreferences();
  private initialized = false;
  private activeSession: LocalAiRuntimeSession | null = null;
  private activeModelId: LocalAiModelId | null = null;
  private busy = false;
  private listeners = new Set<(snapshot: LocalAiManagerSnapshot) => void>();

  constructor(
    private readonly fileStore: LocalAiModelFileStore,
    private readonly preferenceStore: LocalAiPreferenceStore,
    private readonly capabilitiesProvider: () => Promise<LocalAiDeviceCapabilities>,
    runtimeAdapters: LocalAiRuntimeAdapter[],
    catalog: readonly LocalAiModelDefinition[] = LOCAL_AI_MODELS,
  ) {
    this.catalog = catalog;
    for (const adapter of runtimeAdapters) {
      this.runtimes.set(adapter.id, adapter);
    }
  }

  subscribe(listener: (snapshot: LocalAiManagerSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): LocalAiManagerSnapshot {
    return {
      initialized: this.initialized,
      selectedModelId: this.preferences.selectedModelId,
      activeModelId: this.activeModelId,
      preferences: {
        ...this.preferences,
        acceptedLicenseModelIds: [...this.preferences.acceptedLicenseModelIds],
      },
      models: this.catalog.map((model) =>
        this.states.get(model.id) ?? {
          modelId: model.id,
          lifecycle: 'not-installed',
          compatibility: {
            compatible: false,
            runtimeId: null,
            issues: [],
          },
          install: null,
          progress: null,
          error: '',
        },
      ),
    };
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private model(modelId: LocalAiModelId) {
    const model =
      this.catalog.find((candidate) => candidate.id === modelId) ??
      localAiModelById(modelId);
    if (!model) {
      throw new LocalAiManagerError('Unknown local AI model.', 'unknown_model');
    }
    return model;
  }

  private state(modelId: LocalAiModelId) {
    const state = this.states.get(modelId);
    if (!state) {
      throw new LocalAiManagerError(
        'Local AI manager has not been initialized yet.',
        'blocked',
      );
    }
    return state;
  }

  private update(modelId: LocalAiModelId, patch: Partial<LocalAiModelState>) {
    const current = this.state(modelId);
    this.states.set(modelId, { ...current, ...patch });
    this.emit();
  }

  private ensureIdle() {
    if (this.busy) {
      throw new LocalAiManagerError(
        'Another local AI operation is already running.',
        'busy',
      );
    }
  }

  async initialize() {
    const [capabilities, preferences] = await Promise.all([
      this.capabilitiesProvider(),
      this.preferenceStore.load(),
    ]);
    this.preferences = preferences;

    for (const model of this.catalog) {
      const compatibility = checkLocalAiCompatibility(model, capabilities);
      let install: LocalAiInstallRecord | null = null;
      if (model.artifact) {
        install = await this.fileStore.inspect(model, model.artifact);
      }

      this.states.set(model.id, {
        modelId: model.id,
        lifecycle: compatibility.compatible
          ? install
            ? 'installed'
            : 'not-installed'
          : 'blocked',
        compatibility,
        install,
        progress: null,
        error: '',
      });
    }

    if (
      this.preferences.selectedModelId &&
      !this.catalog.some((model) => model.id === this.preferences.selectedModelId)
    ) {
      this.preferences.selectedModelId = null;
      await this.preferenceStore.save(this.preferences);
    }

    this.initialized = true;
    this.emit();
    return this.snapshot();
  }

  async selectModel(modelId: LocalAiModelId | null) {
    if (modelId) this.model(modelId);
    this.preferences = {
      ...this.preferences,
      selectedModelId: modelId,
    };
    await this.preferenceStore.save(this.preferences);
    this.emit();
  }

  async acceptLicense(modelId: LocalAiModelId) {
    const model = this.model(modelId);
    if (model.license === 'Apache-2.0') return;

    if (!this.preferences.acceptedLicenseModelIds.includes(modelId)) {
      this.preferences = {
        ...this.preferences,
        acceptedLicenseModelIds: [
          ...this.preferences.acceptedLicenseModelIds,
          modelId,
        ],
      };
      await this.preferenceStore.save(this.preferences);
      this.emit();
    }
  }

  private assertLicenseAccepted(model: LocalAiModelDefinition) {
    if (model.license === 'Apache-2.0') return;
    if (!this.preferences.acceptedLicenseModelIds.includes(model.id)) {
      throw new LocalAiManagerError(
        'This model requires its license terms to be accepted before download.',
        'license_required',
      );
    }
  }

  async download(
    modelId: LocalAiModelId,
    options: { signal?: AbortSignal } = {},
  ) {
    this.ensureIdle();
    const model = this.model(modelId);
    const state = this.state(modelId);
    this.assertLicenseAccepted(model);

    if (!model.artifact || !model.artifact.downloadUrl) {
      throw new LocalAiManagerError(
        'No verified downloadable mobile artifact is configured for this model yet.',
        'artifact_unconfigured',
      );
    }
    if (!state.compatibility.compatible) {
      throw new LocalAiManagerError(
        state.compatibility.issues[0]?.message ?? 'This model is blocked on this device.',
        'blocked',
      );
    }

    this.busy = true;
    this.update(modelId, {
      lifecycle: 'downloading',
      progress: { writtenBytes: 0, totalBytes: model.artifact.sizeBytes ?? null },
      error: '',
    });

    try {
      const install = await this.fileStore.download(model, model.artifact, {
        signal: options.signal,
        onProgress: (progress) => {
          this.update(modelId, { progress });
        },
      });
      this.update(modelId, {
        lifecycle: 'installed',
        install,
        progress: null,
        error: '',
      });
      return install;
    } catch (error) {
      this.update(modelId, {
        lifecycle: state.install ? 'installed' : 'not-installed',
        progress: null,
        error: errorMessage(error),
      });
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async remove(modelId: LocalAiModelId) {
    this.ensureIdle();
    this.model(modelId);

    if (this.activeModelId === modelId) {
      await this.unload();
    }

    this.busy = true;
    try {
      await this.fileStore.remove(modelId);
      this.update(modelId, {
        lifecycle: this.state(modelId).compatibility.compatible
          ? 'not-installed'
          : 'blocked',
        install: null,
        progress: null,
        error: '',
      });
    } finally {
      this.busy = false;
    }
  }

  async load(modelId: LocalAiModelId) {
    this.ensureIdle();
    const model = this.model(modelId);
    const state = this.state(modelId);

    if (!state.install || !model.artifact) {
      throw new LocalAiManagerError(
        'Download this model before loading it.',
        'not_installed',
      );
    }

    const runtimeId = state.compatibility.runtimeId;
    if (!runtimeId) {
      throw new LocalAiManagerError(
        'No compatible runtime is available in this app build.',
        'runtime_unavailable',
      );
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime || !(await runtime.isAvailable())) {
      throw new LocalAiManagerError(
        'The required native AI runtime is unavailable.',
        'runtime_unavailable',
      );
    }

    if (this.activeModelId === modelId && this.activeSession) {
      return this.activeSession;
    }

    if (this.activeSession) {
      await this.unload();
    }

    this.busy = true;
    this.update(modelId, { lifecycle: 'loading', error: '' });
    try {
      const session = await runtime.load({
        model,
        artifact: model.artifact,
        artifactUri: state.install.uri,
      });
      this.activeSession = session;
      this.activeModelId = modelId;
      this.update(modelId, { lifecycle: 'loaded', error: '' });
      return session;
    } catch (error) {
      this.update(modelId, {
        lifecycle: 'installed',
        error: errorMessage(error),
      });
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async unload() {
    if (!this.activeSession || !this.activeModelId) return;
    const modelId = this.activeModelId;
    const session = this.activeSession;
    this.activeSession = null;
    this.activeModelId = null;

    await session.close();
    const current = this.states.get(modelId);
    if (current) {
      this.states.set(modelId, {
        ...current,
        lifecycle: current.install ? 'installed' : 'not-installed',
      });
      this.emit();
    }
  }

  async setAutoUnload(value: boolean) {
    this.preferences = {
      ...this.preferences,
      autoUnload: value,
    };
    await this.preferenceStore.save(this.preferences);
    this.emit();
  }

  async handleAppBackgrounded() {
    if (this.preferences.autoUnload) {
      await this.unload();
    }
  }
}
