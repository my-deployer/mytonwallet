import { flushMicrotasks, waitForCondition } from './async';

describe('async test helpers', () => {
  it('waits for an observable condition instead of a fixed pause', async () => {
    let isReady = false;
    void Promise.resolve().then(() => {
      isReady = true;
    });

    await waitForCondition(() => isReady);
    expect(isReady).toBe(true);
  });

  it('reports a bounded condition failure', async () => {
    await expect(waitForCondition(() => false, {
      timeout: 0,
      failureMessage: 'Render did not settle.',
    })).rejects.toThrow('Render did not settle.');
  });

  it('flushes a requested number of microtask turns', async () => {
    const values: number[] = [];
    void Promise.resolve().then(() => {
      values.push(1);
      void Promise.resolve().then(() => values.push(2));
    });

    await flushMicrotasks(2);
    expect(values).toEqual([1, 2]);
  });
});
