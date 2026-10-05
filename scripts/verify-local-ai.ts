/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createEmptyWorkspace } from '../src/data/schema';

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
import { Sha256, sha256Hex } from '../src/features/assistant/local-ai/sha256';
import {
  LocalAssistantBridgeError,
  prepareLocalAssistantActions,
} from '../src/features/assistant/local-ai/local-assistant-bridge';

const MB = 1024 * 1024;
const FAKE_SHA_256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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
  importedNames: string[] = [];

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
      sha256: artifact.sha256 ?? FAKE_SHA_256,
      installedAt: 1_760_000_000_000,
    };
    this.records.set(model.id, record);
    return record;
  }

  async importFile(
    model: LocalAiModelDefinition,
    artifact: NonNullable<LocalAiModelDefinition['artifact']>,
    source: { uri: string; name: string; sizeBytes: number | null },
  ) {
    this.importedNames.push(source.name);
    const record: LocalAiInstallRecord = {
      modelId: model.id,
      artifactId: artifact.id,
      uri: `file:///models/${model.id}/${artifact.fileName}`,
      sizeBytes: source.sizeBytes ?? artifact.sizeBytes ?? null,
      sha256: artifact.sha256 ?? FAKE_SHA_256,
      installedAt: 1_760_000_000_100,
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
        sha256: FAKE_SHA_256,
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
        sha256: FAKE_SHA_256,
        releaseStage: 'candidate',
        notes: ['verification fixture'],
      },
    },
  ];
}

function importOnlyModels(): LocalAiModelDefinition[] {
  const functionGemma = LOCAL_AI_MODELS.find(
    (model) => model.id === 'functiongemma-270m',
  )!;

  return [
    {
      ...functionGemma,
      runtimeCandidates: ['fake-runtime'],
      artifact: {
        ...functionGemma.artifact!,
        runtimeId: 'fake-runtime',
        downloadUrl: undefined,
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
  const encoder = new TextEncoder();
  assert.equal(
    sha256Hex(new Uint8Array()),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    sha256Hex(encoder.encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const chunked = new Sha256();
  chunked.update(encoder.encode('a'));
  chunked.update(encoder.encode('b'));
  chunked.update(encoder.encode('c'));
  assert.equal(
    chunked.digestHex(),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
}

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
    const assistantScreenSource = readFileSync(
      'app/(app)/settings/ai-assistant.tsx',
      'utf8',
    );
    const rootLayoutSource = readFileSync('app/_layout.tsx', 'utf8');
    const liteRtAdapterSource = readFileSync(
      'src/features/assistant/local-ai/litert-lm-runtime.ts',
      'utf8',
    );
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
    const nativeBoundarySource = readFileSync(
      'scripts/check-native-runtime-boundary.cjs',
      'utf8',
    );

    assert.match(storageSource, /Paths\.document/);
    assert.match(storageSource, /Paths\.availableDiskSpace/);
    assert.match(storageSource, /File\.createDownloadTask/);
    assert.match(storageSource, /DownloadTask\.fromSavable/);
    assert.match(storageSource, /task\.savable\(\)/);
    assert.match(storageSource, /install\.json/);
    assert.match(storageSource, /download\.json/);
    assert.match(storageSource, /size did not match the expected artifact/i);
    assert.match(storageSource, /state === 'active'/);
    assert.match(storageSource, /sourceFile\.copy/);
    assert.match(storageSource, /\.litertlm/);
    assert.match(storageSource, /selected model size did not match the expected artifact/i);
    assert.match(storageSource, /verifyArtifactFingerprint/);
    assert.match(storageSource, /readableStream\(\)/);
    assert.match(storageSource, /SHA-256 fingerprint did not match/i);
    assert.match(storageSource, /MANIFEST_VERSION = 2/);
    assert.match(providerSource, /AppState\.addEventListener/);
    assert.match(providerSource, /controller\.abort\(\)/);
    assert.match(rootLayoutSource, /<LocalAiProvider>/);
    assert.match(settingsSource, /Manage AI models/);
    assert.match(modelScreenSource, /Unload AI in background/);
    assert.match(modelScreenSource, /downloadModel/);
    assert.match(modelScreenSource, /Import file/);
    assert.match(modelScreenSource, /Confirm licence/);
    assert.match(modelScreenSource, /I accepted the licence/);
    assert.match(modelScreenSource, /Run test/);
    assert.match(modelScreenSource, /Try selected model/);
    assert.match(modelScreenSource, /\/\(app\)\/settings\/ai-assistant/);
    assert.match(assistantScreenSource, /Preview actions/);
    assert.match(assistantScreenSource, /REVIEW BEFORE APPLYING/);
    assert.match(assistantScreenSource, /Apply changes/);
    assert.match(assistantScreenSource, /applyPreparedAssistantActionBatch/);
    assert.match(assistantScreenSource, /commitAssistantWorkspace/);
    assert.match(assistantScreenSource, /prepared\.confirmationKey/);
    assert.match(assistantScreenSource, /prepared\.sourceRevision/);
    assert.match(assistantScreenSource, /MYELIN stays in control/);
    assert.match(assistantScreenSource, /deterministic planner/);
    assert.match(assistantScreenSource, /MYELIN CALCULATED PLAN/);
    assert.match(assistantScreenSource, /DAILY MILEAGE/);
    assert.match(assistantScreenSource, /USABLE CAPACITY/);
    assert.match(assistantScreenSource, /DOESN'T FIT/);
    assert.match(assistantScreenSource, /CAPACITY WARNINGS/);
    assert.match(assistantScreenSource, /NEXT PLANNED DAYS/);
    assert.match(assistantScreenSource, /ONE WORKLOAD LEDGER/);
    assert.match(assistantScreenSource, /Tasks and exam work are sharing the same mileage/);
    assert.match(assistantScreenSource, /deduplicatedMinutes/);
    assert.match(assistantScreenSource, /isAssistantExamPlanSummary/);
    assert.match(assistantScreenSource, /slice\(0, 7\)/);
    assert.doesNotMatch(assistantScreenSource, /updateWorkspace\(/);
    assert.match(providerSource, /liteRtLmRuntimeAdapter/);
    assert.match(providerSource, /DocumentPicker\.getDocumentAsync/);
    assert.match(providerSource, /copyToCacheDirectory: true/);
    assert.match(providerSource, /importModelFile/);
    assert.match(providerSource, /smokeTestModel/);
    assert.match(providerSource, /prepareAssistantActions/);
    assert.match(liteRtAdapterSource, /id: 'litert-lm'/);
    assert.match(liteRtAdapterSource, /createLLM/);
    assert.match(liteRtAdapterSource, /backend: 'cpu'/);
    assert.match(liteRtAdapterSource, /enableStructuredOutput: true/);
    assert.match(liteRtAdapterSource, /llm\.resetConversation\(\)/);
    assert.match(liteRtAdapterSource, /responseSchema/);
    assert.match(liteRtAdapterSource, /await llm\.unload\(\)/);
    assert.doesNotMatch(liteRtAdapterSource, /@\/modules\/myelin-litertlm/);
    assert.equal(
      packageJson.dependencies['react-native-litert-lm'],
      '0.7.0',
      'The maintained LiteRT wrapper must stay pinned exactly.',
    );
    assert.ok(
      appConfig.expo.plugins.includes('react-native-litert-lm'),
      'Expo must load the maintained LiteRT wrapper plugin.',
    );
    assert.ok(
      !appConfig.expo.plugins.some(
        (entry: unknown) =>
          entry === './plugins/with-myelin-kotlin-version' ||
          (Array.isArray(entry) &&
            entry[0] === './plugins/with-myelin-kotlin-version'),
      ),
      'The wrapper plugin owns Kotlin/minSdk configuration; the temporary MYELIN Kotlin plugin must be removed.',
    );
    assert.equal(existsSync('modules/myelin-litertlm'), false);
    assert.equal(existsSync('plugins/with-myelin-kotlin-version.js'), false);
    assert.match(nativeBoundarySource, /file\.startsWith\('modules\/'\)/);
    assert.equal(appConfig.expo.version, '0.2.13');
    assert.equal(appConfig.expo.android.versionCode, 10);
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
    const catalog = importOnlyModels();

    const manager = new LocalAiManager(
      files,
      preferences,
      async () => androidCapabilities,
      [runtime],
      catalog,
    );
    const initialized = await manager.initialize();
    assert.equal(
      initialized.models.find((model) => model.modelId === 'functiongemma-270m')!
        .lifecycle,
      'blocked',
      'An import-only gated model starts blocked until a licensed file is supplied.',
    );

    await assert.rejects(
      () =>
        manager.importFile('functiongemma-270m', {
          uri: 'file:///picked/mobile_actions_q8_ekv1024.litertlm',
          name: 'mobile_actions_q8_ekv1024.litertlm',
          sizeBytes: 288_964_608,
        }),
      (error: unknown) =>
        error instanceof LocalAiManagerError && error.code === 'license_required',
    );

    await manager.acceptLicense('functiongemma-270m');

    await assert.rejects(
      () =>
        manager.importFile('functiongemma-270m', {
          uri: 'file:///picked/not-a-model.bin',
          name: 'not-a-model.bin',
          sizeBytes: 288_964_608,
        }),
      (error: unknown) =>
        error instanceof LocalAiManagerError && error.code === 'invalid_artifact',
    );

    const imported = await manager.importFile('functiongemma-270m', {
      uri: 'file:///picked/mobile_actions_q8_ekv1024.litertlm',
      name: 'mobile_actions_q8_ekv1024.litertlm',
      sizeBytes: 288_964_608,
    });
    assert.equal(imported.modelId, 'functiongemma-270m');
    assert.deepEqual(files.importedNames, [
      'mobile_actions_q8_ekv1024.litertlm',
    ]);
    assert.equal(
      manager.snapshot().models.find((model) => model.modelId === 'functiongemma-270m')!
        .lifecycle,
      'installed',
    );

    const reloaded = new LocalAiManager(
      files,
      preferences,
      async () => androidCapabilities,
      [runtime],
      catalog,
    );
    const reloadedSnapshot = await reloaded.initialize();
    assert.equal(
      reloadedSnapshot.models.find(
        (model) => model.modelId === 'functiongemma-270m',
      )!.lifecycle,
      'installed',
      'Imported models remain installed after manager/app reinitialization even without a direct download URL.',
    );

    const session = (await reloaded.load('functiongemma-270m')) as FakeSession;
    assert.equal(session.modelId, 'functiongemma-270m');
    await reloaded.unload();
    assert.equal(session.closed, true);
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
  
  {
    const now = 1_760_000_100_000;
    const workspace = createEmptyWorkspace(now);
    const captured: { request?: Parameters<LocalAiRuntimeSession['generate']>[0] } = {};
    const session: LocalAiRuntimeSession = {
      modelId: 'functiongemma-270m',
      async generate(request) {
        captured.request = request;
        return {
          text: JSON.stringify({
            version: 1,
            requestId: 'local-test-1',
            actions: [
              {
                type: 'create_topic',
                name: 'Magnetic Effects of Electric Current',
                subject: 'Science',
                status: 'new',
                priority: 2,
                estimatedMinutes: 45,
                notes: '',
              },
            ],
          }),
          finishReason: 'stop',
        };
      },
      async close() {},
    };

    const prepared = await prepareLocalAssistantActions({
      workspace,
      session,
      userRequest: 'Add Magnetic Effects of Electric Current as a Science topic.',
      requestId: 'local-test-1',
      currentRoute: '/(app)/today',
      now,
    });

    assert.equal(prepared.requestId, 'local-test-1');
    assert.equal(prepared.preview.requiresConfirmation, true);
    assert.equal(prepared.preview.hasMutations, true);
    assert.equal(workspace.topics.length, 0, 'Local AI bridge must not mutate the source workspace.');
    assert.equal(prepared.preview.nextWorkspace.topics.length, 1);
    assert.ok(captured.request?.jsonSchema, 'Local AI requests must use the assistant action JSON schema.');
    assert.match(captured.request?.prompt ?? '', /Never invent a timetable/i);
    assert.match(captured.request?.prompt ?? '', /Copy this requestId exactly: local-test-1/);

    const invalidJsonSession: LocalAiRuntimeSession = {
      modelId: 'functiongemma-270m',
      async generate() {
        return { text: 'not-json', finishReason: 'stop' };
      },
      async close() {},
    };
    await assert.rejects(
      () =>
        prepareLocalAssistantActions({
          workspace,
          session: invalidJsonSession,
          userRequest: 'Do something.',
          requestId: 'local-test-2',
          now,
        }),
      (error: unknown) =>
        error instanceof LocalAssistantBridgeError && error.code === 'invalid_json',
    );

    const wrongIdSession: LocalAiRuntimeSession = {
      modelId: 'functiongemma-270m',
      async generate() {
        return {
          text: JSON.stringify({
            version: 1,
            requestId: 'wrong-id',
            actions: [
              {
                type: 'create_topic',
                name: 'Light',
                subject: 'Science',
                status: 'new',
                priority: 2,
                estimatedMinutes: 45,
                notes: '',
              },
            ],
          }),
          finishReason: 'stop',
        };
      },
      async close() {},
    };
    await assert.rejects(
      () =>
        prepareLocalAssistantActions({
          workspace,
          session: wrongIdSession,
          userRequest: 'Add Light.',
          requestId: 'local-test-3',
          now,
        }),
      (error: unknown) =>
        error instanceof LocalAssistantBridgeError && error.code === 'mismatched_request_id',
    );
  }

  console.log('✓ local model output is schema-bound, exact-JSON only, and previewed through the Assistant Action Layer');
  console.log('✓ streamed SHA-256 matches standard vectors and chunk boundaries');
  console.log('✓ maintained react-native-litert-lm 0.7.0 replaces the custom Kotlin bridge');
  console.log('✓ FunctionGemma candidate fingerprint is recorded without bypassing its gated download');
  console.log('✓ native inference stays CPU-first, structured, and isolated between MYELIN requests');
  console.log('✓ model storage uses persistent documents, size validation and resumable checkpoints');
  console.log('✓ licensed .litertlm files can be imported safely without enabling gated direct downloads');
  console.log('✓ imported models survive reinitialization and remain loadable through the maintained runtime');
  console.log('✓ app background pauses active downloads and mounts the local AI provider globally');
  console.log('✓ Settings exposes a dedicated model management screen');
  console.log('✓ Settings exposes a preview-first request → review → explicit apply flow for the selected local model');
  console.log('✓ exam-plan previews surface bounded deterministic mileage, fit warnings and next planned days');
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
