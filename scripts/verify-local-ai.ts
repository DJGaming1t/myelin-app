/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  LOCAL_AI_MODELS,
  LocalAiModelDefinition,
  LocalAiModelId,
} from '../src/features/assistant/local-ai/model-catalog';
import {
  LocalAiDeviceCapabilities,
  LocalAiRuntimeAdapter,
  LocalAiRuntimeSession,
  checkLocalAiCompatibility,
} from '../src/features/assistant/local-ai/local-ai-runtime';
import {
  LocalAiInstallRecord,
  LocalAiManager,
  LocalAiManagerError,
  LocalAiModelFileStore,
} from '../src/features/assistant/local-ai/local-ai-manager';
import {
  createLocalAiPreferenceStore,
  normalizeLocalAiPreferences,
} from '../src/features/assistant/local-ai/local-ai-preferences';

const MB = 1024 * 1024;

class MemoryKeyValueStore {
  values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

class FakeFileStore implements LocalAiModelFileStore {
  records = new Map<LocalAiModelId, LocalAiInstallRecord>();
  failNextDownload = false;

  async inspect(model: LocalAiModelDefinition) {
    return this.records.get(model.id) ?? null;
  }

  async download(
    model: LocalAiModelDefinition,
    artifact: NonNullable<LocalAiModelDefinition['artifact']>,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: { writtenBytes: number; totalBytes: number | null }) => void;
    },
  ) {
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error('simulated download failure');
    }

    options.onProgress?.({
      writtenBytes: Math.floor((artifact.sizeBytes ?? 100) / 2),
      totalBytes: artifact.sizeBytes ?? null,
    });
    options.onProgress?.({
      writtenBytes: artifact.sizeBytes ?? 100,
      totalBytes: artifact.sizeBytes ?? null,
    });

    const record: LocalAiInstallRecord = {
      modelId: model.id,
      artifactId: artifact.id,
      uri: `file:///models/${model.id}/${artifact.fileName}`,
      sizeBytes: artifact.sizeBytes ?? null,
      installedAt: 1_760_000_000_000,
    };
    this.records.set(model.id, record);
    return record;
  }

  async remove(modelId: LocalAiModelId) {
    this.records.delete(modelId);
  }
}

class FakeSession implements LocalAiRuntimeSession {
  closed = false;

  constructor(public readonly modelId: LocalAiModelId) {}

  async generate() {
    return {
      text: '{"version":1}',
      finishReason: 'stop' as const,
    };
  }

  async close() {
    this.closed = true;
  }
}

class FakeRuntime implements LocalAiRuntimeAdapter {
  id = 'fake-runtime';
  sessions: FakeSession[] = [];

  async isAvailable() {
    return true;
  }

  async load(request: Parameters<LocalAiRuntimeAdapter['load']>[0]) {
    const session = new FakeSession(request.model.id);
    this.sessions.push(session);
    return session;
  }
}

function configuredModels(): LocalAiModelDefinition[] {
  const functionGemma = LOCAL_AI_MODELS.find(
    (model) => model.id === 'functiongemma-270m',
  )!;
  const qwen = LOCAL_AI_MODELS.find((model) => model.id === 'qwen3.5-0.8b')!;

  return [
    {
      ...functionGemma,
      runtimeCandidates: ['fake-runtime'],
      artifact: {
        id: 'functiongemma-test-q4',
        runtimeId: 'fake-runtime',
        format: 'test',
        fileName: 'functiongemma.test',
        downloadUrl: 'https://example.invalid/functiongemma.test',
        sizeBytes: 300 * MB,
        releaseStage: 'candidate',
        notes: ['verification fixture'],
      },
    },
    {
      ...qwen,
      runtimeCandidates: ['fake-runtime'],
      artifact: {
        id: 'qwen-test-q4',
        runtimeId: 'fake-runtime',
        format: 'test',
        fileName: 'qwen.test',
        downloadUrl: 'https://example.invalid/qwen.test',
        sizeBytes: 520 * MB,
        releaseStage: 'candidate',
        notes: ['verification fixture'],
      },
    },
  ];
}

const androidCapabilities: LocalAiDeviceCapabilities = {
  platform: 'android',
  architecture: 'arm64-v8a',
  availableRuntimeIds: ['fake-runtime'],
  freeStorageBytes: 4 * 1024 * MB,
  totalMemoryBytes: 8 * 1024 * MB,
};

{
  assert.deepEqual(
    LOCAL_AI_MODELS.map((model) => model.id),
    ['functiongemma-270m', 'qwen3.5-0.8b'],
  );

  const functionGemma = LOCAL_AI_MODELS[0]!;
  const qwen = LOCAL_AI_MODELS[1]!;
  assert.equal(functionGemma.requiresTaskFineTune, true);
  assert.equal(functionGemma.license, 'Gemma');
  assert.equal(qwen.license, 'Apache-2.0');
  assert.equal(functionGemma.artifact, null);
  assert.equal(qwen.artifact, null);

  const blocked = checkLocalAiCompatibility(functionGemma, {
    platform: 'android',
    availableRuntimeIds: [],
  });
  assert.equal(blocked.compatible, false);
  assert.ok(blocked.issues.some((issue) => issue.code === 'artifact_unconfigured'));
  assert.ok(blocked.issues.some((issue) => issue.code === 'runtime_missing'));
}

{
  const [functionGemma] = configuredModels();
  const lowStorage = checkLocalAiCompatibility(functionGemma!, {
    platform: 'android',
    availableRuntimeIds: ['fake-runtime'],
    freeStorageBytes: 100 * MB,
  });
  assert.equal(lowStorage.compatible, false);
  assert.ok(lowStorage.issues.some((issue) => issue.code === 'insufficient_storage'));

  const web = checkLocalAiCompatibility(functionGemma!, {
    platform: 'web',
    availableRuntimeIds: ['fake-runtime'],
    freeStorageBytes: 4 * 1024 * MB,
  });
  assert.ok(web.issues.some((issue) => issue.code === 'unsupported_platform'));
}

{
  const normalized = normalizeLocalAiPreferences({
    selectedModelId: 'not-a-model',
    acceptedLicenseModelIds: [
      'functiongemma-270m',
      'functiongemma-270m',
      'bad',
    ],
    autoUnload: false,
  });
  assert.equal(normalized.selectedModelId, null);
  assert.deepEqual(normalized.acceptedLicenseModelIds, ['functiongemma-270m']);
  assert.equal(normalized.autoUnload, false);
}

{
  const kv = new MemoryKeyValueStore();
  const preferences = createLocalAiPreferenceStore(kv);
  const files = new FakeFileStore();
  const runtime = new FakeRuntime();

  const manager = new LocalAiManager(
    files,
    preferences,
    async () => androidCapabilities,
    [runtime],
    configuredModels(),
  );

  const initialized = await manager.initialize();
  assert.equal(initialized.initialized, true);
  assert.equal(
    initialized.models.find((model) => model.modelId === 'functiongemma-270m')!
      .lifecycle,
    'not-installed',
  );

  await assert.rejects(
    () => manager.download('functiongemma-270m'),
    (error: unknown) =>
      error instanceof LocalAiManagerError && error.code === 'license_required',
  );

  await manager.acceptLicense('functiongemma-270m');
  await manager.selectModel('functiongemma-270m');
  const installed = await manager.download('functiongemma-270m');
  assert.equal(installed.modelId, 'functiongemma-270m');
  assert.equal(manager.snapshot().selectedModelId, 'functiongemma-270m');
  assert.equal(
    manager.snapshot().models.find((model) => model.modelId === 'functiongemma-270m')!
      .lifecycle,
    'installed',
  );

  const firstSession = (await manager.load('functiongemma-270m')) as FakeSession;
  assert.equal(manager.snapshot().activeModelId, 'functiongemma-270m');
  assert.equal(firstSession.closed, false);

  await manager.handleAppBackgrounded();
  assert.equal(firstSession.closed, true);
  assert.equal(manager.snapshot().activeModelId, null);
  assert.equal(
    manager.snapshot().models.find((model) => model.modelId === 'functiongemma-270m')!
      .lifecycle,
    'installed',
  );

  await manager.remove('functiongemma-270m');
  assert.equal(files.records.has('functiongemma-270m'), false);
  assert.equal(
    manager.snapshot().models.find((model) => model.modelId === 'functiongemma-270m')!
      .lifecycle,
    'not-installed',
  );
}

{
  const kv = new MemoryKeyValueStore();
  const preferences = createLocalAiPreferenceStore(kv);
  const files = new FakeFileStore();
  const runtime = new FakeRuntime();

  const manager = new LocalAiManager(
    files,
    preferences,
    async () => androidCapabilities,
    [runtime],
    configuredModels(),
  );
  await manager.initialize();

  await manager.download('qwen3.5-0.8b');
  const qwenSession = (await manager.load('qwen3.5-0.8b')) as FakeSession;
  assert.equal(qwenSession.modelId, 'qwen3.5-0.8b');

  await manager.acceptLicense('functiongemma-270m');
  await manager.download('functiongemma-270m');
  const functionSession = (await manager.load('functiongemma-270m')) as FakeSession;

  assert.equal(qwenSession.closed, true, 'Loading another model should unload the previous model.');
  assert.equal(functionSession.closed, false);
  assert.equal(manager.snapshot().activeModelId, 'functiongemma-270m');

  await manager.setAutoUnload(false);
  await manager.handleAppBackgrounded();
  assert.equal(functionSession.closed, false, 'Auto-unload can be disabled explicitly.');

  files.failNextDownload = true;
  await manager.remove('qwen3.5-0.8b');
  await assert.rejects(() => manager.download('qwen3.5-0.8b'), /simulated download failure/);
  assert.equal(
    manager.snapshot().models.find((model) => model.modelId === 'qwen3.5-0.8b')!
      .lifecycle,
    'not-installed',
  );
  assert.match(
    manager.snapshot().models.find((model) => model.modelId === 'qwen3.5-0.8b')!
      .error,
    /simulated download failure/,
  );
}

console.log('✓ catalog exposes FunctionGemma and Qwen without shipping an unverified mobile artifact');
console.log('✓ compatibility blocks unsupported platforms, missing runtimes and low storage');
console.log('✓ FunctionGemma license acceptance is enforced before download');
console.log('✓ Qwen can use the same manager without a separate code path');
console.log('✓ download, install, load, unload, switch and remove lifecycle is deterministic');
console.log('✓ background auto-unload releases the active model session');
console.log('✓ failed downloads roll back to a safe lifecycle state');
