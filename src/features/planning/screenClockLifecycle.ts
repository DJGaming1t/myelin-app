/** Run a visible screen's clock only while the app is active. */
export function screenClockLifecycle(refresh: () => void, schedule: typeof setInterval = setInterval, cancel: typeof clearInterval = clearInterval) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  return {
    setActive(active: boolean) {
      if (!active) { stop(); return; }
      if (timer !== undefined) return;
      refresh();
      timer = schedule(refresh, 30_000);
    },
    dispose: stop,
  };
}
