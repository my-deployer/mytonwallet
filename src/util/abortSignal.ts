export function raceWithAbortSignal<T>(
  task: PromiseLike<T> | (() => PromiseLike<T>),
  signal?: AbortSignal | null,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(getAbortReason(signal));

  const promise = typeof task === 'function' ? task() : task;
  if (!signal) return Promise.resolve(promise);

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(getAbortReason(signal));
    };
    const cleanup = () => signal.removeEventListener('abort', handleAbort);
    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      },
    );
  });
}

export function throwIfAborted(signal?: AbortSignal | null) {
  if (signal?.aborted) throw getAbortReason(signal);
}

export function getAbortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}
