import { WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { validateWorkspaceV2 } from '@/src/data/validation';
import {
  AssistantActionBatch,
  AssistantActionBatchResult,
  AssistantActionError,
  parseAssistantActionBatch,
  runAssistantActionBatch,
} from '@/src/features/assistant/ai-action-engine';

export type PreparedAssistantActionBatch = {
  batch: AssistantActionBatch;
  sourceRevision: number;
  requestId: string;
  requestDigest: string;
  confirmationKey: string;
  preview: AssistantActionBatchResult;
};

function confirmationKey(sourceRevision: number, requestDigest: string) {
  return `assistant:${sourceRevision}:${requestDigest}`;
}

export function prepareAssistantActionBatch(
  workspace: WorkspaceState,
  rawBatch: unknown,
  now = Date.now(),
): PreparedAssistantActionBatch {
  const batch = parseAssistantActionBatch(rawBatch);
  const preview = runAssistantActionBatch(workspace, batch, {
    mode: 'preview',
    now,
  });

  return {
    batch,
    sourceRevision: workspace.revision,
    requestId: preview.requestId,
    requestDigest: preview.requestDigest,
    confirmationKey: confirmationKey(workspace.revision, preview.requestDigest),
    preview,
  };
}

function matchingReceipt(
  workspace: WorkspaceState,
  requestId: string,
  requestDigest: string,
) {
  const receipt = (workspace.assistantReceipts ?? []).find(
    (item) => item.requestId === requestId,
  );
  if (!receipt) return false;
  if (receipt.digest !== requestDigest) {
    throw new AssistantActionError(
      `Assistant request ID "${requestId}" was already applied with different content.`,
    );
  }
  return true;
}

export function applyPreparedAssistantActionBatch(
  workspace: WorkspaceState,
  prepared: PreparedAssistantActionBatch,
  providedConfirmationKey: string,
  now = Date.now(),
): AssistantActionBatchResult {
  if (providedConfirmationKey !== prepared.confirmationKey) {
    throw new AssistantActionError(
      'Assistant confirmation no longer matches the previewed action batch.',
    );
  }

  if (matchingReceipt(workspace, prepared.requestId, prepared.requestDigest)) {
    return runAssistantActionBatch(workspace, prepared.batch, {
      mode: 'apply',
      confirmed: true,
      now,
    });
  }

  if (workspace.revision !== prepared.sourceRevision) {
    throw new AssistantActionError(
      'MYELIN changed after this assistant preview. Preview the actions again before applying them.',
    );
  }

  const result = runAssistantActionBatch(workspace, prepared.batch, {
    mode: 'apply',
    confirmed: true,
    now,
  });
  const next = cloneWorkspace(result.nextWorkspace);
  next.revision = workspace.revision + 1;
  next.updatedAt = now;
  validateWorkspaceV2(next);

  return {
    ...result,
    nextWorkspace: next,
  };
}
