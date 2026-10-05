import { Directory, DownloadTask, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  LocalAiDownloadProgress,
  LocalAiInstallRecord,
  LocalAiModelFileStore,
} from './local-ai-manager';
import {
  LocalAiArtifactDescriptor,
  LocalAiModelDefinition,
  LocalAiModelId,
} from './model-catalog';
import { LocalAiDeviceCapabilities } from './local-ai-runtime';

const ROOT_NAME = 'myelin-ai-models';
const MANIFEST_NAME = 'install.json';
const CHECKPOINT_NAME = 'download.json';
const CHECKPOINT_VERSION = 1 as const;
const MANIFEST_VERSION = 1 as const;
const MIN_HEADROOM_BYTES = 64 * 1024 * 1024;

type InstallManifest = {
  version: typeof MANIFEST_VERSION;
  modelId: LocalAiModelId;
  artifactId: string;
  fileName: string;
  uri: string;
  sizeBytes: number;
  installedAt: number;
};

type DownloadCheckpoint = {
  version: typeof CHECKPOINT_VERSION;
  modelId: LocalAiModelId;
  artifactId: string;
  fileName: string;
  partialUri: string;
  state: 'active' | 'paused';
  resumeState: unknown | null;
  writtenBytes: number;
  totalBytes: number | null;
  updatedAt: number;
};

function ensureDirectory(directory: Directory) {
  if (!directory.exists) directory.create();
  return directory;
}

function rootDirectory() {
  return ensureDirectory(new Directory(Paths.document, ROOT_NAME));
}

function modelDirectory(modelId: LocalAiModelId) {
  const root = rootDirectory();
  return ensureDirectory(new Directory(root, modelId));
}

function modelPaths(modelId: LocalAiModelId, artifact: LocalAiArtifactDescriptor) {
  const directory = modelDirectory(modelId);
  return {
    directory,
    finalFile: new File(directory, artifact.fileName),
    partialFile: new File(directory, `${artifact.fileName}.partial`),
    manifestFile: new File(directory, MANIFEST_NAME),
    checkpointFile: new File(directory, CHECKPOINT_NAME),
    importFile: new File(directory, `${artifact.fileName}.importing`),
  };
}

function readJson(file: File): unknown | null {
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync());
  } catch {
    return null;
  }
}

function writeJson(file: File, value: unknown) {
  if (!file.exists) file.create();
  file.write(JSON.stringify(value));
}

function deleteFile(file: File) {
  if (file.exists) file.delete();
}

function deleteDirectory(directory: Directory) {
  if (directory.exists) directory.delete();
}

function validManifest(
  raw: unknown,
  modelId: LocalAiModelId,
  artifact: LocalAiArtifactDescriptor,
): InstallManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== MANIFEST_VERSION ||
    value.modelId !== modelId ||
    value.artifactId !== artifact.id ||
    value.fileName !== artifact.fileName ||
    typeof value.uri !== 'string' ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes <= 0 ||
    typeof value.installedAt !== 'number' ||
    !Number.isFinite(value.installedAt)
  ) {
    return null;
  }
  return value as InstallManifest;
}

function validCheckpoint(
  raw: unknown,
  modelId: LocalAiModelId,
  artifact: LocalAiArtifactDescriptor,
): DownloadCheckpoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== CHECKPOINT_VERSION ||
    value.modelId !== modelId ||
    value.artifactId !== artifact.id ||
    value.fileName !== artifact.fileName ||
    typeof value.partialUri !== 'string' ||
    (value.state !== 'active' && value.state !== 'paused') ||
    typeof value.writtenBytes !== 'number' ||
    !Number.isFinite(value.writtenBytes) ||
    value.writtenBytes < 0 ||
    !(
      value.totalBytes === null ||
      (typeof value.totalBytes === 'number' &&
        Number.isFinite(value.totalBytes) &&
        value.totalBytes >= 0)
    ) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }
  return value as DownloadCheckpoint;
}

function expectedSizeMatches(actual: number, expected?: number) {
  return expected == null || actual === expected;
}

function createAbortError() {
  const error = new Error('Model download paused. Tap Download to resume.');
  error.name = 'AbortError';
  return error;
}

function requiredFreeBytes(
  artifact: LocalAiArtifactDescriptor,
  partialBytes: number,
) {
  if (artifact.sizeBytes == null) return MIN_HEADROOM_BYTES;
  const remaining = Math.max(0, artifact.sizeBytes - partialBytes);
  const headroom = Math.max(
    MIN_HEADROOM_BYTES,
    Math.ceil(artifact.sizeBytes * 0.1),
  );
  return remaining + headroom;
}

export function getLocalAiDeviceCapabilities(
  availableRuntimeIds: string[] = [],
): LocalAiDeviceCapabilities {
  const platform =
    Platform.OS === 'android'
      ? 'android'
      : Platform.OS === 'ios'
        ? 'ios'
        : Platform.OS === 'web'
          ? 'web'
          : 'unknown';

  return {
    platform,
    availableRuntimeIds,
    freeStorageBytes:
      platform === 'web' ? null : Math.max(0, Paths.availableDiskSpace),
    totalMemoryBytes: null,
  };
}

export function createExpoLocalAiModelFileStore(): LocalAiModelFileStore {
  return {
    async inspect(model, artifact) {
      if (Platform.OS === 'web') return null;

      const paths = modelPaths(model.id, artifact);
      const manifest = validManifest(
        readJson(paths.manifestFile),
        model.id,
        artifact,
      );

      if (!manifest) {
        if (paths.manifestFile.exists) deleteFile(paths.manifestFile);
        return null;
      }

      const installedFile = new File(manifest.uri);
      const actualSize = installedFile.exists ? installedFile.size : 0;
      const valid =
        installedFile.exists &&
        actualSize === manifest.sizeBytes &&
        expectedSizeMatches(actualSize, artifact.sizeBytes);

      if (!valid) {
        deleteFile(installedFile);
        deleteFile(paths.manifestFile);
        return null;
      }

      return {
        modelId: model.id,
        artifactId: artifact.id,
        uri: installedFile.uri,
        sizeBytes: actualSize,
        installedAt: manifest.installedAt,
      };
    },

    async download(model, artifact, options) {
      if (Platform.OS === 'web') {
        throw new Error('Local model downloads are not available on web.');
      }
      if (!artifact.downloadUrl) {
        throw new Error('This model does not have a configured download URL.');
      }

      const existing = await this.inspect(model, artifact);
      if (existing) return existing;

      const paths = modelPaths(model.id, artifact);
      let checkpoint = validCheckpoint(
        readJson(paths.checkpointFile),
        model.id,
        artifact,
      );

      if (paths.checkpointFile.exists && !checkpoint) {
        deleteFile(paths.checkpointFile);
      }

      if (
        checkpoint &&
        (checkpoint.partialUri !== paths.partialFile.uri ||
          !paths.partialFile.exists)
      ) {
        checkpoint = null;
        deleteFile(paths.checkpointFile);
        deleteFile(paths.partialFile);
      }

      if (checkpoint?.state === 'active') {
        // The app/process disappeared without a clean pause. Expo cannot
        // reconstruct resume data from an active task, so restart safely.
        checkpoint = null;
        deleteFile(paths.checkpointFile);
        deleteFile(paths.partialFile);
      }

      const partialBytes = paths.partialFile.exists ? paths.partialFile.size : 0;
      const required = requiredFreeBytes(artifact, partialBytes);
      if (Paths.availableDiskSpace < required) {
        throw new Error(
          'Not enough free storage to finish this model download safely.',
        );
      }

      if (options.signal?.aborted) throw createAbortError();

      let writtenBytes = checkpoint?.writtenBytes ?? partialBytes;
      let totalBytes = checkpoint?.totalBytes ?? artifact.sizeBytes ?? null;

      const onProgress = (progress: {
        bytesWritten: number;
        totalBytes: number;
      }) => {
        writtenBytes = Math.max(0, progress.bytesWritten);
        totalBytes =
          Number.isFinite(progress.totalBytes) && progress.totalBytes > 0
            ? progress.totalBytes
            : artifact.sizeBytes ?? null;
        options.onProgress?.({
          writtenBytes,
          totalBytes,
        });
      };

      let task: DownloadTask;
      let resume = false;

      if (checkpoint?.state === 'paused' && checkpoint.resumeState) {
        task = DownloadTask.fromSavable(
          checkpoint.resumeState as Parameters<
            typeof DownloadTask.fromSavable
          >[0],
          { onProgress },
        );
        resume = true;
      } else {
        deleteFile(paths.partialFile);
        task = File.createDownloadTask(
          artifact.downloadUrl,
          paths.partialFile,
          { onProgress },
        );
      }

      writeJson(paths.checkpointFile, {
        version: CHECKPOINT_VERSION,
        modelId: model.id,
        artifactId: artifact.id,
        fileName: artifact.fileName,
        partialUri: paths.partialFile.uri,
        state: 'active',
        resumeState: null,
        writtenBytes,
        totalBytes,
        updatedAt: Date.now(),
      } satisfies DownloadCheckpoint);

      let pausePromise: Promise<void> | null = null;
      const pauseForAbort = () => {
        if (task.state !== 'active' || pausePromise) return;
        pausePromise = task
          .pauseAsync()
          .then(() => {
            const resumeState = task.savable();
            writeJson(paths.checkpointFile, {
              version: CHECKPOINT_VERSION,
              modelId: model.id,
              artifactId: artifact.id,
              fileName: artifact.fileName,
              partialUri: paths.partialFile.uri,
              state: 'paused',
              resumeState,
              writtenBytes: paths.partialFile.exists
                ? paths.partialFile.size
                : writtenBytes,
              totalBytes,
              updatedAt: Date.now(),
            } satisfies DownloadCheckpoint);
          })
          .catch(() => {
            task.cancel();
          });
      };

      options.signal?.addEventListener('abort', pauseForAbort, { once: true });

      try {
        const output = resume
          ? await task.resumeAsync()
          : await task.downloadAsync();

        if (pausePromise) await pausePromise;

        if (!output) {
          if (task.state === 'paused') {
            if (!pausePromise) {
              writeJson(paths.checkpointFile, {
                version: CHECKPOINT_VERSION,
                modelId: model.id,
                artifactId: artifact.id,
                fileName: artifact.fileName,
                partialUri: paths.partialFile.uri,
                state: 'paused',
                resumeState: task.savable(),
                writtenBytes: paths.partialFile.exists
                  ? paths.partialFile.size
                  : writtenBytes,
                totalBytes,
                updatedAt: Date.now(),
              } satisfies DownloadCheckpoint);
            }
            throw createAbortError();
          }
          throw new Error('Model download ended before a complete file was produced.');
        }

        const downloaded = new File(output.uri);
        const downloadedSize = downloaded.exists ? downloaded.size : 0;
        if (
          !downloaded.exists ||
          downloadedSize <= 0 ||
          !expectedSizeMatches(downloadedSize, artifact.sizeBytes)
        ) {
          deleteFile(downloaded);
          deleteFile(paths.checkpointFile);
          throw new Error(
            'The downloaded model size did not match the expected artifact.',
          );
        }

        deleteFile(paths.finalFile);
        await downloaded.move(paths.finalFile);

        const finalFile = new File(paths.finalFile.uri);
        const finalSize = finalFile.exists ? finalFile.size : 0;
        if (
          !finalFile.exists ||
          finalSize !== downloadedSize ||
          !expectedSizeMatches(finalSize, artifact.sizeBytes)
        ) {
          deleteFile(finalFile);
          deleteFile(paths.checkpointFile);
          throw new Error('The installed model failed the final size check.');
        }

        const installedAt = Date.now();
        writeJson(paths.manifestFile, {
          version: MANIFEST_VERSION,
          modelId: model.id,
          artifactId: artifact.id,
          fileName: artifact.fileName,
          uri: finalFile.uri,
          sizeBytes: finalSize,
          installedAt,
        } satisfies InstallManifest);
        deleteFile(paths.checkpointFile);
        deleteFile(paths.partialFile);

        const record: LocalAiInstallRecord = {
          modelId: model.id,
          artifactId: artifact.id,
          uri: finalFile.uri,
          sizeBytes: finalSize,
          installedAt,
        };
        return record;
      } finally {
        options.signal?.removeEventListener('abort', pauseForAbort);
        task.release();
      }
    },

    async importFile(model, artifact, source) {
      if (Platform.OS === 'web') {
        throw new Error('Local model import is not available on web.');
      }
      if (artifact.format !== 'litertlm') {
        throw new Error('MYELIN can only import .litertlm model artifacts.');
      }
      if (!source.name.toLowerCase().endsWith('.litertlm')) {
        throw new Error('Choose a .litertlm model file.');
      }

      const sourceFile = new File(source.uri);
      if (!sourceFile.exists) {
        throw new Error('The selected model file is no longer readable.');
      }

      const sourceSize = sourceFile.size;
      if (sourceSize <= 0) {
        throw new Error('The selected model file is empty.');
      }
      if (
        source.sizeBytes != null &&
        Number.isFinite(source.sizeBytes) &&
        source.sizeBytes > 0 &&
        source.sizeBytes !== sourceSize
      ) {
        throw new Error(
          'The selected model file changed before MYELIN could import it.',
        );
      }
      if (!expectedSizeMatches(sourceSize, artifact.sizeBytes)) {
        throw new Error(
          'The selected model size did not match the expected artifact.',
        );
      }

      const headroom = Math.max(
        MIN_HEADROOM_BYTES,
        Math.ceil(sourceSize * 0.1),
      );
      if (Paths.availableDiskSpace < sourceSize + headroom) {
        throw new Error(
          'Not enough free storage to copy this model into MYELIN safely.',
        );
      }

      const paths = modelPaths(model.id, artifact);
      deleteFile(paths.importFile);

      try {
        await sourceFile.copy(paths.importFile, { overwrite: true });

        const staged = new File(paths.importFile.uri);
        const stagedSize = staged.exists ? staged.size : 0;
        if (
          !staged.exists ||
          stagedSize !== sourceSize ||
          !expectedSizeMatches(stagedSize, artifact.sizeBytes)
        ) {
          throw new Error('The imported model failed its staged size check.');
        }

        await staged.move(paths.finalFile, { overwrite: true });

        const finalFile = new File(paths.finalFile.uri);
        const finalSize = finalFile.exists ? finalFile.size : 0;
        if (
          !finalFile.exists ||
          finalSize !== sourceSize ||
          !expectedSizeMatches(finalSize, artifact.sizeBytes)
        ) {
          deleteFile(finalFile);
          throw new Error('The imported model failed the final size check.');
        }

        const installedAt = Date.now();
        writeJson(paths.manifestFile, {
          version: MANIFEST_VERSION,
          modelId: model.id,
          artifactId: artifact.id,
          fileName: artifact.fileName,
          uri: finalFile.uri,
          sizeBytes: finalSize,
          installedAt,
        } satisfies InstallManifest);

        deleteFile(paths.checkpointFile);
        deleteFile(paths.partialFile);

        return {
          modelId: model.id,
          artifactId: artifact.id,
          uri: finalFile.uri,
          sizeBytes: finalSize,
          installedAt,
        } satisfies LocalAiInstallRecord;
      } finally {
        deleteFile(paths.importFile);
      }
    },

    async remove(modelId) {
      if (Platform.OS === 'web') return;
      const root = rootDirectory();
      const directory = new Directory(root, modelId);
      deleteDirectory(directory);
    },
  };
}
