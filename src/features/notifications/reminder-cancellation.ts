// Allow every device cancellation attempt to settle before reporting any
// failure. A failed cancellation must never be mistaken for a cleared plan:
// otherwise an old notification can fire after it was supposedly disabled.
export async function cancelScheduledReminderIds(
  ids: string[],
  cancel: (id: string) => Promise<unknown>,
): Promise<void> {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0))];
  if (!unique.length) return;

  const results = await Promise.allSettled(unique.map(id => Promise.resolve().then(() => cancel(id))));
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) {
    // Never reveal plugin/provider diagnostics to the notification UI.
    throw new Error(
      `Could not cancel ${failed} of ${unique.length} device reminders. Existing alerts may still fire; retry before replacing or disabling them.`,
    );
  }
}
