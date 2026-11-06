export type WorkspaceOwner =
  | { kind: 'user'; uid: string }
  | { kind: 'local' };

export function workspaceOwnerKey(owner: WorkspaceOwner): string {
  if (owner.kind === 'local') return 'local:device';

  const uid = owner.uid.trim();
  if (!uid) throw new Error('A Firebase user UID is required for an account workspace.');
  return `user:${uid}`;
}

export function workspaceOwnerLabel(ownerKey: string): 'account' | 'local' {
  return ownerKey.startsWith('user:') ? 'account' : 'local';
}
