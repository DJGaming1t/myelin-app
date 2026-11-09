import { useCallback, useState } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { scheduleTask } from './task-engine';
import { DayRebuildPreview, buildDayRebuildPreview } from './day-rebuild';

export function useDayRebuild() {
  const { workspace, ownerKey, updateWorkspace } = useWorkspace();
  const [preview, setPreview] = useState<DayRebuildPreview | null>(null);
  const [issue, setIssue] = useState<string | null>(null);

  const build = useCallback(() => {
    if (!workspace || !ownerKey) return;
    const next = buildDayRebuildPreview(workspace, ownerKey, Date.now());
    setPreview(next);
    setIssue(next.moves.length === 0 ? 'empty' : null);
  }, [ownerKey, workspace]);

  const cancel = useCallback((_proposal?: DayRebuildPreview) => {
    setPreview(null);
    setIssue(null);
  }, []);

  const refresh = useCallback(
    (_proposal?: DayRebuildPreview) => {
      if (!workspace || !ownerKey) return;
      const next = buildDayRebuildPreview(workspace, ownerKey, Date.now());
      setPreview(next);
      setIssue(next.moves.length === 0 ? 'empty' : null);
    },
    [ownerKey, workspace],
  );

  const apply = useCallback(
    (
      proposal: DayRebuildPreview,
    ):
      | { ok: true; before: WorkspaceState; after: WorkspaceState }
      | { ok: false; reason: string } => {
      if (!workspace || !ownerKey || proposal.ownerKey !== ownerKey) {
        return { ok: false, reason: 'owner' };
      }
      if (workspace.revision !== proposal.sourceRevision) {
        setIssue('stale');
        return { ok: false, reason: 'stale' };
      }
      const before = cloneWorkspace(workspace);
      const now = Date.now();
      const after = updateWorkspace(
        (draft) => {
          for (const move of proposal.moves) {
            const target = draft.tasks.find((t) => t.id === move.taskId);
            if (target && target.status === 'open') {
              scheduleTask(target, move.start, move.end, now);
            }
          }
        },
        {
          ownerKey,
          canApply: (current) => current.revision === proposal.sourceRevision,
        },
      );
      if (!after) {
        setIssue('stale');
        return { ok: false, reason: 'stale' };
      }
      setPreview(null);
      setIssue(null);
      return { ok: true, before, after };
    },
    [ownerKey, updateWorkspace, workspace],
  );

  return {
    preview,
    issue,
    build,
    cancel,
    refresh,
    apply,
  };
}
