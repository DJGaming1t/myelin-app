export class CloudError extends Error {
  constructor(status, code, retryAfter = 0) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function checkAbort(signal) {
  if (signal.aborted) throw signal.reason instanceof CloudError
    ? signal.reason : new CloudError(499, 'cancelled');
}

// A binding may ignore cancellation. Racing it prevents late actionable replies.
export async function bounded(signal, work) {
  checkAbort(signal);
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => { try { checkAbort(signal); } catch (error) { reject(error); } };
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(() => { checkAbort(signal); return work(); }), interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}
