import type { addLog as AddLog, getLogs as GetLogs } from './logs';

function loadLogs() {
  let api: { addLog: typeof AddLog; getLogs: typeof GetLogs };

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require('./logs') as typeof import('./logs');
  });

  return api!;
}

describe('addLog folding', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts a repeating entry on the first one instead of appending it', () => {
    const { addLog, getLogs } = loadLogs();

    for (let i = 0; i < 6; i++) {
      addLog({ message: 'callApi: fetchPastActivities', args: ['0-mainnet'], level: 'debugError' });
      jest.advanceTimersByTime(10000);
    }

    const entries = getLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].repeats).toBe(5);
  });

  it('carries the count without waiting for the failure to happen again', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'stuck', args: [], level: 'debugError' });
    addLog({ message: 'stuck', args: [], level: 'debugError' });

    expect(getLogs()[0].repeats).toBe(1);
  });

  it('starts a new entry once the window is over', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'stuck', args: [], level: 'debugError' });
    addLog({ message: 'stuck', args: [], level: 'debugError' });
    jest.advanceTimersByTime(61000);
    addLog({ message: 'stuck', args: [], level: 'debugError' });

    const entries = getLogs();
    expect(entries).toHaveLength(2);
    expect(entries[0].repeats).toBe(1);
    expect(entries[1].repeats).toBeUndefined();
  });

  it('keeps entries that differ in level, message or arguments apart', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'stuck', args: ['0-mainnet'], level: 'debugError' });
    addLog({ message: 'stuck', args: ['1-mainnet'], level: 'debugError' });
    addLog({ message: 'stuck', args: ['0-mainnet'], level: 'debug' });
    addLog({ message: 'other', args: ['0-mainnet'], level: 'debugError' });

    expect(getLogs()).toHaveLength(4);
  });

  it('folds an error by its serialized contents', () => {
    const { addLog, getLogs } = loadLogs();
    const message = 'Account 0-mainnet is missing from worker storage';

    addLog({ message: 'callApi: fetchPastActivities', args: [new Error(message)], level: 'debugError' });
    addLog({ message: 'callApi: fetchPastActivities', args: [new Error(message)], level: 'debugError' });

    const entries = getLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].repeats).toBe(1);
  });

  it('keeps folding a live failure while unrelated entries churn through the map', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'stuck', args: [], level: 'debugError' });
    for (let i = 0; i < 200; i++) {
      addLog({ message: `unique ${i}`, args: [], level: 'debug' });
    }
    addLog({ message: 'stuck', args: [], level: 'debugError' });

    expect(getLogs()[0].repeats).toBe(1);
  });

  it('stops tracking the oldest failures instead of growing without a bound', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'oldest', args: [], level: 'debugError' });
    for (let i = 0; i < 400; i++) {
      addLog({ message: `unique ${i}`, args: [], level: 'debug' });
    }
    addLog({ message: 'oldest', args: [], level: 'debugError' });

    // Its anchor is gone, so the repeat opens a second entry rather than counting on the first.
    expect(getLogs().filter((entry) => entry.message === 'oldest')).toHaveLength(2);
  });

  it('ages an anchor by its latest entry rather than by its first', () => {
    const { addLog, getLogs } = loadLogs();

    addLog({ message: 'recurring', args: [], level: 'debugError' });
    jest.advanceTimersByTime(59000);
    for (let i = 0; i < 254; i++) {
      addLog({ message: `unique ${i}`, args: [], level: 'debug' });
    }

    // Only the first `recurring` is past the window now, so its repeat opens a second entry and takes over the
    // anchor, and the flood that follows has to drop one of the untouched keys instead of that one.
    jest.advanceTimersByTime(2000);
    addLog({ message: 'recurring', args: [], level: 'debugError' });
    addLog({ message: 'flood one', args: [], level: 'debug' });
    addLog({ message: 'flood two', args: [], level: 'debug' });
    addLog({ message: 'recurring', args: [], level: 'debugError' });

    const entries = getLogs().filter((entry) => entry.message === 'recurring');
    expect(entries).toHaveLength(2);
    expect(entries[1].repeats).toBe(1);
  });

  it('never holds more entries than the buffer size', () => {
    const { addLog, getLogs } = loadLogs();

    for (let i = 0; i < 1100; i++) {
      addLog({ message: `entry ${i}`, args: [], level: 'debug' });
    }

    expect(getLogs()).toHaveLength(999);
  });
});
