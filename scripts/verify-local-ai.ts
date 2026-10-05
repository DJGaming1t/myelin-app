/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.equal(functionGemma.artifact?.runtimeId, 'litert-lm');
  assert.equal(functionGemma.artifact?.format, 'litertlm');
  assert.equal(functionGemma.artifact?.sizeBytes, 288_964_608);
  assert.equal(
    functionGemma.artifact?.sha256,
    '33e295cbd996b419bb1de8f3f85c5b6b01ee058a2c89bdb2173cf3e6ff4ce9d0',
  );
  assert.equal(functionGemma.artifact?.downloadUrl, undefined);
  assert.deepEqual(qwen.runtimeCandidates, ['litert-lm']);
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

async function main() {
  {
    const storageSource = readFileSync(
      'src/features/assistant/local-ai/expo-model-file-store.ts',
      'utf8',
    );
    const providerSource = readFileSync(
      'src/features/assistant/local-ai/LocalAiProvider.tsx',
      'utf8',
    );
    const settingsSource = readFileSync(
      'app/(app)/settings/index.tsx',
      'utf8',
    );
    const modelScreenSource = readFileSync(
      'app/(app)/settings/ai-models.tsx',
      'utf8',
    );
    const rootLayoutSource = readFileSync('app/_layout.tsx', 'utf8');
    const liteRtAdapterSource = readFileSync(
      'src/features/assistant/local-ai/litert-lm-runtime.ts',
      'utf8',
    );
    const nativeModuleSource = readFileSync(
      'modules/myelin-litertlm/android/src/main/java/com/djgaming1t/myelin/litertlm/MyelinLiteRtLmModule.kt',
      'utf8',
    );
    const nativeBuildSource = readFileSync(
      'modules/myelin-litertlm/android/build.gradle',
      'utf8',
    );
    const nativeConfigSource = readFileSync(
      'modules/myelin-litertlm/expo-module.config.json',
      'utf8',
    );
    const nativeBoundarySource = readFileSync(
      'scripts/check-native-runtime-boundary.cjs',
      'utf8',
    );
    const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));

    assert.match(storageSource, /Paths\.document/);
    assert.match(storageSource, /Paths\.availableDiskSpace/);
    assert.match(storageSource, /File\.createDownloadTask/);
    assert.match(storageSource, /DownloadTask\.fromSavable/);
    assert.match(storageSource, /task\.savable\(\)/);
    assert.match(storageSource, /install\.json/);
    assert.match(storageSource, /download\.json/);
    assert.match(storageSource, /size did not match the expected artifact/i);
    assert.match(storageSource, /state === 'active'/);
    assert.match(providerSource, /AppState\.addEventListener/);
    assert.match(providerSource, /controller\.abort\(\)/);
    assert.match(rootLayoutSource, /<LocalAiProvider>/);
    assert.match(settingsSource, /Manage AI models/);
    assert.match(modelScreenSource, /Unload AI in background/);
    assert.match(modelScreenSource, /downloadModel/);
    assert.match(modelScreenSource, /Run test/);
    assert.match(providerSource, /liteRtLmRuntimeAdapter/);
    assert.match(providerSource, /smokeTestModel/);
    assert.match(liteRtAdapterSource, /id: 'litert-lm'/);
    assert.match(liteRtAdapterSource, /nativeModule\.generate/);
    assert.match(nativeModuleSource, /Name\("MyelinLiteRtLm"\)/);
    assert.match(nativeModuleSource, /automaticToolCalling = false/);
    assert.match(nativeModuleSource, /Backend\.CPU\(\)/);
    assert.match(nativeModuleSource, /conversation\.sendMessage/);
    assert.match(nativeModuleSource, /cancelProcess\(\)/);
    assert.match(nativeBuildSource, /litertlm-android:0\.17\.1/);
    assert.match(nativeConfigSource, /MyelinLiteRtLmModule/);
    assert.match(nativeBoundarySource, /file\.startsWith\('modules\/'\)/);
    assert.equal(appConfig.expo.version, '0.2.8');
    assert.equal(appConfig.expo.android.versionCode, 5);
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
  
  console.log('✓ LiteRT-LM Android bridge is autolinked and pinned to 0.17.1');
  console.log('✓ FunctionGemma candidate fingerprint is recorded without bypassing its gated download');
  console.log('✓ native inference stays CPU-first with automatic native tool execution disabled');
  console.log('✓ model storage uses persistent documents, size validation and resumable checkpoints');
  console.log('✓ app background pauses active downloads and mounts the local AI provider globally');
  console.log('✓ Settings exposes a dedicated model management screen');
  console.log('✓ catalog exposes FunctionGemma and Qwen without shipping an unverified mobile artifact');
  console.log('✓ compatibility blocks unsupported platforms, missing runtimes and low storage');
  console.log('✓ FunctionGemma license acceptance is enforced before download');
  console.log('✓ Qwen can use the same manager without a separate code path');
  console.log('✓ download, install, load, unload, switch and remove lifecycle is deterministic');
  console.log('✓ background auto-unload releases the active model session');
  console.log('✓ failed downloads roll back to a safe lifecycle state');
  
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
