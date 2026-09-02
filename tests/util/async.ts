const DEFAULT_TIMEOUT = 1_000;

interface WaitForConditionOptions {
  timeout?: number;
  failureMessage?: string;
}

export async function waitForCondition(
  condition: () => boolean,
  options: WaitForConditionOptions = {},
) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(options.failureMessage ?? `Condition was not met within ${timeout} ms.`);
    }
    await nextTask();
  }
}

export async function flushMicrotasks(turns = 1) {
  for (let index = 0; index < turns; index++) {
    await Promise.resolve();
  }
}

function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
