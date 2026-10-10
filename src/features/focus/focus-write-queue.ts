// Serialise durable focus-session writes. A failed write rejects its caller
// instead of masquerading as success, while later retries can still proceed.
export function createFocusWriteQueue<T>(
  persist: (ownerKey: string, value: T | null) => Promise<void>,
) {
  let pending: Promise<void> = Promise.resolve();
  return {
    write(ownerKey: string, next: T | null): Promise<void> {
      const attempt = pending.catch(() => undefined).then(
        () => persist(ownerKey, next),
      );
      pending = attempt;
      return attempt;
    },
  };
}
