import { useEffect, useRef, useState } from 'react';
import { Mistake } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { applyMistakeInput, createMistake, deleteMistakeFromWorkspace, findMistake,
  MistakeInput, reopenMistake } from './mistake-engine';

type Kind = 'create' | 'edit' | 'delete' | 'reopen';
type Receipt = { kind: Kind; id: string; after: string | null };
export function useMistakeMutation(ownerKey: string, baseline: Mistake | null,
  onSaved: (kind: Kind, id: string) => void) {
  const { readWorkspace, updateWorkspace, waitForSaves, retrySaves } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [changed, setChanged] = useState(false);
  const receiptRef = useRef<Receipt | null>(null);
  const busyRef = useRef(false);
  const finished = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && !!readWorkspace(ownerKey);
  const expected = baseline ? JSON.stringify(baseline) : null;

  function finish(saved: Receipt) {
    if (!active() || finished.current) return;
    const current = findMistake(readWorkspace(ownerKey)!, saved.id);
    if ((current ? JSON.stringify(current) : null) !== saved.after) {
      setChanged(true);
      setError('Saved. This mistake changed again. Open the latest notebook state before continuing.');
      return;
    }
    finished.current = true;
    onSaved(saved.kind, saved.id);
  }

  async function perform(kind: Kind, input?: MistakeInput) {
    if (!active() || busyRef.current || receiptRef.current || finished.current) return;
    if ((kind === 'create' || kind === 'edit') &&
      (!input || !input.prompt.trim() || !input.correction.trim())) {
      setError('Add a prompt and correction before saving.'); return;
    }
    const now = Date.now();
    const created = kind === 'create' ? createMistake(input!, now) : null;
    const id = created?.id ?? baseline?.id;
    if (!id) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = updateWorkspace(draft => {
        if (created) draft.mistakes.push(created);
        else if (kind === 'delete') deleteMistakeFromWorkspace(draft, id);
        else {
          const target = findMistake(draft, id)!;
          if (kind === 'edit') applyMistakeInput(target, input!, now);
          else reopenMistake(target, now);
        }
      }, { ownerKey, canApply: live => {
        if (!active()) return false;
        const target = findMistake(live, id);
        if (kind === 'create' ? !!target : !target || JSON.stringify(target) !== expected) return false;
        if (kind === 'edit' && target!.resolvedAt !== 0) return false;
        if (kind === 'reopen' && !target!.resolvedAt) return false;
        const topic = live.topics.find(t => t.id === (input?.topicId ?? target?.topicId));
        if (!topic) return false;
        if (kind === 'edit' && input!.topicId !== baseline!.topicId) return false;
        return !input?.cardId || topic.cards.some(c => c.id === input.cardId);
      } });
      if (!updated) {
        if (active()) setError('This mistake, topic or linked question changed. Your draft is still here. Load the latest record or choose a current topic/question before saving.');
        return;
      }
      const target = findMistake(updated, id);
      const saved = { kind, id, after: target ? JSON.stringify(target) : null };
      receiptRef.current = saved;
      setReceipt(saved);
      await waitForSaves();
      finish(saved);
    } catch {
      if (active()) setError('Could not save this change. Your work is still here. Retry saving; the action will not be repeated.');
    } finally {
      busyRef.current = false;
      if (active()) setBusy(false);
    }
  }

  async function retry() {
    const saved = receiptRef.current;
    if (!active() || !saved || busyRef.current || finished.current || changed) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (await retrySaves(ownerKey)) finish(saved);
      else if (active()) setError('Could not save this change. Your work is still here. Retry saving; the action will not be repeated.');
    } finally { busyRef.current = false; if (active()) setBusy(false); }
  }
  return { busy, error, pending: !!receipt, changed, perform, retry, active,
    locked: busy || !!receipt || finished.current };
}
