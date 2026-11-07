import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { completeTask } from '@/src/features/planning/task-engine';
import { canUndoDayMapCompletion, completionReceipt, DayMapCompletionReceipt, restoreDayMapCompletion } from './day-map-completion';

/** Keep the last undo local to this screen and to the workspace that produced it. */
export function useDayMapCompletion() {
  const { ownerKey, readWorkspace, updateWorkspace } = useWorkspace();
  const [receipt, setReceipt] = useState<DayMapCompletionReceipt | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { setReceipt(null); setNotice(''); }, [ownerKey]);

  const complete = useCallback((taskId: string) => {
    if (!ownerKey) return false;
    const before = readWorkspace(ownerKey)?.tasks.find(task => task.id === taskId);
    if (!before || before.status !== 'open') return false;
    const timestamp = Date.now();
    const updated = updateWorkspace(draft => {
      const task = draft.tasks.find(item => item.id === taskId);
      if (task) completeTask(task, timestamp);
    }, { ownerKey, canApply: current => current.tasks.some(task => task.id === taskId && task.status === 'open' && task.updatedAt === before.updatedAt) });
    const after = updated?.tasks.find(task => task.id === taskId);
    if (!after) { setNotice('This task changed. Open it to review.'); return false; }
    setNotice('');
    setReceipt(completionReceipt(ownerKey, before, after));
    return true;
  }, [ownerKey, readWorkspace, updateWorkspace]);

  const undo = useCallback(() => {
    if (!receipt || receipt.ownerKey !== ownerKey) return false;
    const updated = updateWorkspace(draft => {
      const task = draft.tasks.find(item => item.id === receipt.id);
      if (task) restoreDayMapCompletion(task, receipt, Date.now());
    }, { ownerKey: receipt.ownerKey, canApply: current => canUndoDayMapCompletion(current.tasks.find(task => task.id === receipt.id), receipt, ownerKey) });
    setReceipt(null);
    setNotice(updated ? '' : 'This task changed since completion. Open it to review.');
    return !!updated;
  }, [ownerKey, receipt, updateWorkspace]);

  const dismiss = useCallback(() => { setReceipt(null); setNotice(''); }, []);
  return { receipt: receipt?.ownerKey === ownerKey ? receipt : null, notice, complete, undo, dismiss };
}
