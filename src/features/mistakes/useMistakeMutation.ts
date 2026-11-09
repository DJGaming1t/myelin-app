import { useCallback, useEffect, useRef, useState } from 'react';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { Mistake } from '@/src/data/schema';
import {
  MistakeInput,
  applyMistakeInput,
  createMistake,
  deleteMistakeFromWorkspace,
  findMistake,
  reopenMistake,
} from './mistake-engine';

export type MistakeMutationKind = 'create' | 'edit' | 'reopen' | 'delete';

export function useMistakeMutation(
  ownerKey: string | null,
  baseline: Mistake | null,
  onSuccess: (kind: MistakeMutationKind, mistakeId: string) => void,
) {
  const { updateWorkspace, waitForSaves } = useWorkspace();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    kind: MistakeMutationKind;
    input?: MistakeInput;
  } | null>(null);
  const [changed, setChanged] = useState(false);
  const mountedRef = useRef(true);
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const active = useCallback(
    () => mountedRef.current && ownerRef.current === ownerKey,
    [ownerKey],
  );

  const perform = useCallback(
    async (kind: MistakeMutationKind, input?: MistakeInput) => {
      if (!ownerKey || busy) return;
      setBusy(true);
      setError('');
      setChanged(false);
      setPending({ kind, input });

      let targetId = baseline?.id ?? '';
      let conflict = false;

      const updated = updateWorkspace(
        (draft) => {
          if (kind === 'create') {
            if (!input) return;
            const created = createMistake(input);
            targetId = created.id;
            draft.mistakes.push(created);
            return;
          }
          if (!baseline) return;
          const current = findMistake(draft, baseline.id);
          if (!current) return;
          if (kind === 'edit' && input) {
            applyMistakeInput(current, input);
          } else if (kind === 'reopen') {
            reopenMistake(current);
          } else if (kind === 'delete') {
            deleteMistakeFromWorkspace(draft, baseline.id);
          }
        },
        {
          ownerKey,
          canApply: (currentWorkspace) => {
            if (kind === 'create') return Boolean(input);
            if (!baseline) {
              conflict = true;
              return false;
            }
            const existing = findMistake(currentWorkspace, baseline.id);
            if (!existing) {
              conflict = true;
              return false;
            }
            if (existing.resolvedAt !== baseline.resolvedAt || existing.wins !== baseline.wins) {
              conflict = true;
              return false;
            }
            return true;
          },
        },
      );

      if (!updated) {
        if (mountedRef.current) {
          setBusy(false);
          setChanged(conflict);
          setError(
            conflict
              ? 'This mistake changed in the background. Review the latest state before saving.'
              : 'Your notebook change could not be saved.',
          );
        }
        return;
      }

      try {
        await waitForSaves();
        if (!mountedRef.current || ownerRef.current !== ownerKey) return;
        setPending(null);
        setBusy(false);
        onSuccess(kind, targetId);
      } catch {
        if (!mountedRef.current) return;
        setBusy(false);
        setError('Could not save this notebook change. Retry when ready.');
      }
    },
    [baseline, busy, onSuccess, ownerKey, updateWorkspace, waitForSaves],
  );

  const retry = useCallback(async () => {
    if (!pending) return;
    await perform(pending.kind, pending.input);
  }, [pending, perform]);

  return {
    error,
    busy,
    pending: Boolean(pending),
    changed,
    locked: busy,
    active,
    perform,
    retry,
  };
}
