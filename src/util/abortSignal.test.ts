import {
  mergeAbortSignals,
  pauseWithAbortSignal,
  raceWithAbortSignal,
} from './abortSignal';

describe('raceWithAbortSignal', () => {
  it('does not start a provider task when the signal is already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('run already stopped');
    const task = jest.fn(() => Promise.resolve('result'));
    controller.abort(reason);

    await expect(raceWithAbortSignal(task, controller.signal)).rejects.toBe(reason);
    expect(task).not.toHaveBeenCalled();
  });

  it('stops consuming a provider promise while preserving the abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('run stopped');
    const task = new Promise<string>(() => {});
    const result = raceWithAbortSignal(task, controller.signal);

    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
  });
});

describe('mergeAbortSignals', () => {
  it('preserves the first abort reason and removes every listener', () => {
    const first = new AbortController();
    const second = new AbortController();
    const firstRemove = jest.spyOn(first.signal, 'removeEventListener');
    const secondRemove = jest.spyOn(second.signal, 'removeEventListener');
    const reason = new Error('first stopped');
    const merged = mergeAbortSignals(first.signal, second.signal);

    first.abort(reason);

    expect(merged.signal?.aborted).toBe(true);
    expect(merged.signal?.reason).toBe(reason);
    expect(firstRemove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(secondRemove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('returns an already-aborted merged signal without installing listeners', () => {
    const first = new AbortController();
    const second = new AbortController();
    const reason = new Error('already stopped');
    first.abort(reason);
    const secondAdd = jest.spyOn(second.signal, 'addEventListener');

    const merged = mergeAbortSignals(first.signal, second.signal);

    expect(merged.signal?.reason).toBe(reason);
    expect(secondAdd).not.toHaveBeenCalled();
  });
});

describe('pauseWithAbortSignal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('removes its listener after the timer settles', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    const pause = pauseWithAbortSignal(100, controller.signal);

    jest.advanceTimersByTime(100);
    await pause;

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('clears its timer and preserves the abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('pause stopped');
    const pause = pauseWithAbortSignal(100, controller.signal);

    controller.abort(reason);

    await expect(pause).rejects.toBe(reason);
    expect(jest.getTimerCount()).toBe(0);
  });
});
