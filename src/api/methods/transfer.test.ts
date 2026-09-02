import type { ApiCheckTransactionDraftOptions, ApiCheckTransactionDraftResult } from '../types';

import chains from '../chains';
import { checkTransactionDraft } from './transfer';

jest.mock('../chains', () => ({
  __esModule: true,
  default: {
    ton: {
      checkTransactionDraft: jest.fn(),
    },
  },
}));

const mockedCheckTransactionDraft = jest.mocked(chains.ton.checkTransactionDraft);

const options: ApiCheckTransactionDraftOptions = {
  accountId: '0-mainnet',
  toAddress: 'EQ-test',
  amount: 1n,
};

describe('checkTransactionDraft cancellation isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCheckTransactionDraft.mockResolvedValue({});
  });

  it('bypasses the shared draft cache and passes the signal to the chain', async () => {
    const controller = new AbortController();

    await checkTransactionDraft('ton', options, controller.signal);
    await checkTransactionDraft('ton', options, controller.signal);

    expect(mockedCheckTransactionDraft).toHaveBeenCalledTimes(2);
    expect(mockedCheckTransactionDraft).toHaveBeenNthCalledWith(1, options, controller.signal);
    expect(mockedCheckTransactionDraft).toHaveBeenNthCalledWith(2, options, controller.signal);
  });

  it('bounds the independent UI draft cache and evicts the least recently used entry', async () => {
    for (let i = 0; i < 65; i++) {
      await checkTransactionDraft('ton', { ...options, toAddress: `EQ-test-${i}` });
    }

    await checkTransactionDraft('ton', { ...options, toAddress: 'EQ-test-0' });

    expect(mockedCheckTransactionDraft).toHaveBeenCalledTimes(66);
  });

  it('keeps an evicted late completion from overwriting a replacement request', async () => {
    const stale = createDeferred<ApiCheckTransactionDraftResult>();
    const current = createDeferred<ApiCheckTransactionDraftResult>();
    let targetRequestCount = 0;
    mockedCheckTransactionDraft.mockImplementation(({ toAddress }) => {
      if (toAddress !== 'EQ-late-key') return Promise.resolve({});
      targetRequestCount += 1;
      return targetRequestCount === 1 ? stale.promise : current.promise;
    });

    const staleRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-key' });
    for (let i = 0; i < 64; i++) {
      await checkTransactionDraft('ton', { ...options, toAddress: `EQ-eviction-${i}` });
    }
    const currentRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-key' });
    stale.resolve({ resolvedAddress: 'EQ-stale' });
    await staleRequest;
    const coalescedRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-key' });
    current.resolve({ resolvedAddress: 'EQ-current' });

    await expect(currentRequest).resolves.toMatchObject({ resolvedAddress: 'EQ-current' });
    await expect(coalescedRequest).resolves.toMatchObject({ resolvedAddress: 'EQ-current' });
    expect(targetRequestCount).toBe(2);
  });

  it('keeps an evicted late rejection from deleting a replacement request', async () => {
    const stale = createDeferred<ApiCheckTransactionDraftResult>();
    const current = createDeferred<ApiCheckTransactionDraftResult>();
    let targetRequestCount = 0;
    mockedCheckTransactionDraft.mockImplementation(({ toAddress }) => {
      if (toAddress !== 'EQ-late-rejection') return Promise.resolve({});
      targetRequestCount += 1;
      return targetRequestCount === 1 ? stale.promise : current.promise;
    });

    const staleRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-rejection' });
    const staleExpectation = expect(staleRequest).rejects.toThrow('Stale failure');
    for (let i = 0; i < 64; i++) {
      await checkTransactionDraft('ton', { ...options, toAddress: `EQ-rejection-eviction-${i}` });
    }
    const currentRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-rejection' });
    stale.reject(new Error('Stale failure'));
    await staleExpectation;
    const coalescedRequest = checkTransactionDraft('ton', { ...options, toAddress: 'EQ-late-rejection' });
    current.resolve({ resolvedAddress: 'EQ-current' });

    await expect(currentRequest).resolves.toMatchObject({ resolvedAddress: 'EQ-current' });
    await expect(coalescedRequest).resolves.toMatchObject({ resolvedAddress: 'EQ-current' });
    expect(targetRequestCount).toBe(2);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
