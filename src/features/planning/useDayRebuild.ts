import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import type { WorkspaceState } from '@/src/data/schema';
import { applyDayRebuild, createDayRebuildPreview, dayRebuildIssue, DayRebuildPreview, RebuildIssue } from './day-rebuild';

type ApplyResult = { ok: true; before: WorkspaceState; after: WorkspaceState } | { ok: false };
export function useDayRebuild() {
  const { workspace, ownerKey, status, updateWorkspace } = useWorkspace();
  const live = useRef({ workspace, ownerKey, status }); live.current = { workspace, ownerKey, status };
  const active = useRef<DayRebuildPreview | null>(null);
  const [preview, setPreview] = useState<DayRebuildPreview | null>(null);
  const [failure, setFailure] = useState<{ preview: DayRebuildPreview; issue: RebuildIssue } | null>(null);
  useEffect(() => { active.current = null; setPreview(null); setFailure(null); }, [ownerKey, status]);
  const build = useCallback(() => {
    const current = live.current;
    if (!ownerKey || current.ownerKey !== ownerKey || current.status !== 'ready' || !current.workspace) return;
    const next = createDayRebuildPreview(current.workspace, ownerKey, Date.now());
    active.current = next; setPreview(next); setFailure(null);
  }, [ownerKey]);
  const cancel = useCallback((expected: DayRebuildPreview) => {
    if (active.current !== expected || live.current.ownerKey !== expected.ownerKey || live.current.status !== 'ready') return;
    active.current = null; setPreview(null); setFailure(null);
  }, []);
  const refresh = useCallback((expected: DayRebuildPreview) => {
    if (active.current !== expected || live.current.ownerKey !== expected.ownerKey || live.current.status !== 'ready') return;
    build();
  }, [build]);
  const apply = useCallback((expected: DayRebuildPreview): ApplyResult => {
    if (active.current !== expected || live.current.ownerKey !== expected.ownerKey || live.current.status !== 'ready') return { ok: false };
    const now = Date.now(); let before: WorkspaceState | null = null, issue: RebuildIssue | null = null;
    const after = updateWorkspace(draft => { applyDayRebuild(draft, expected, now); }, {
      ownerKey: expected.ownerKey, canApply: current => {
        issue = dayRebuildIssue(current, expected, now);
        if (issue) return false;
        before = current; return true;
      },
    });
    if (!after || !before) {
      if (issue && active.current === expected && live.current.ownerKey === expected.ownerKey) setFailure({ preview: expected, issue });
      return { ok: false };
    }
    active.current = null; setPreview(null); setFailure(null);
    return { ok: true, before, after };
  }, [updateWorkspace]);
  const visible = status === 'ready' && preview?.ownerKey === ownerKey ? preview : null;
  const issue = visible && workspace ? dayRebuildIssue(workspace, visible, Date.now()) ?? (failure?.preview === visible ? failure.issue : null) : null;
  return { preview: visible, issue, build, cancel, refresh, apply };
}
