import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAchievement } from '@/src/features/achievement/AchievementProvider';
import { applyTaskCompletion, canCompleteTask, canUndoTaskCompletion, restoreTaskCompletion, TaskCompletionReceipt } from './task-completion';

/** One guarded transaction path for quick actions and the dedicated completion API. */
export function useTaskCompletion() {
  const { updateWorkspace, ownerKey } = useWorkspace();
  const [lastCompleted, setLastCompleted] = useState<TaskCompletionReceipt | null>(null);
  const receiptRef = useRef<TaskCompletionReceipt | null>(null);
  useEffect(() => { receiptRef.current = null; setLastCompleted(null); }, [ownerKey]);
  const completeWithReceipt = useCallback((taskId: string): TaskCompletionReceipt | null => {
    if (!ownerKey) return null;
    let receipt: TaskCompletionReceipt | null = null;
    const now = Date.now();
    const updated = updateWorkspace(draft => { receipt = applyTaskCompletion(draft, ownerKey, taskId, now); }, {
      ownerKey, canApply: current => canCompleteTask(current, taskId),
    });
    if (!updated || !receipt) return null;
    receiptRef.current = receipt; setLastCompleted(receipt); return receipt;
  }, [ownerKey, updateWorkspace]);
  const undoReceipt = useCallback((receipt: TaskCompletionReceipt) => {
    // Consumed/superseded callbacks cannot undo a later completion from this hook.
    if (receiptRef.current !== receipt) return false;
    receiptRef.current = null;
    const updated = updateWorkspace(draft => { restoreTaskCompletion(draft, receipt, Date.now()); }, {
      ownerKey: receipt.ownerKey, canApply: current => canUndoTaskCompletion(current, receipt),
    });
    setLastCompleted(null); return !!updated;
  }, [updateWorkspace]);
  const complete = useCallback((taskId: string) => !!completeWithReceipt(taskId), [completeWithReceipt]);
  const undo = useCallback(() => receiptRef.current ? undoReceipt(receiptRef.current) : false, [undoReceipt]);
  const dismiss = useCallback(() => { receiptRef.current = null; setLastCompleted(null); }, []);
  return { lastCompleted: lastCompleted?.ownerKey === ownerKey ? lastCompleted : null, complete, undo, dismiss, completeWithReceipt, undoReceipt };
}

export function useQuickTaskCompletion() {
  const { completeWithReceipt, undoReceipt } = useTaskCompletion();
  const celebrate = useAchievement();
  return useCallback((taskId: string) => {
    const receipt = completeWithReceipt(taskId);
    if (!receipt) return false;
    celebrate({ title: 'One more thing done!', detail: receipt.title, undo: () => undoReceipt(receipt) });
    return true;
  }, [celebrate, completeWithReceipt, undoReceipt]);
}
