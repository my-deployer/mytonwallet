import type { ApiBackendConfig } from '../../types';

import { fetchWithRetry } from '../../../util/fetch';
import { untrackableRegistry } from './util/untrackable';
import { setBackendConfigCache } from '../../common/cache';
import { ApiServerError } from '../../errors';
import { fetchAccountAssets } from './wallet';

jest.mock('../../../util/fetch', () => ({
  ...jest.requireActual('../../../util/fetch'),
  fetchWithRetry: jest.fn(),
}));

const fetchMock = jest.mocked(fetchWithRetry);

function setNegVerdictCacheFlag(enabled: boolean) {
  setBackendConfigCache({ isNegVerdictCacheEnabled: enabled } as unknown as ApiBackendConfig);
}

describe('fetchAccountAssets untrackable handling', () => {
  beforeEach(() => {
    untrackableRegistry.reset();
    fetchMock.mockReset();
    setNegVerdictCacheFlag(false);
  });

  it('flag on: a positions 400 marks the address and returns converged-empty balances (native zeroed)', async () => {
    setNegVerdictCacheFlag(true);
    fetchMock.mockRejectedValue(new ApiServerError('untrackable wallet address', 400));

    const { balances } = await fetchAccountAssets('ethereum', 'mainnet', '0xdead', jest.fn());

    // Not an empty object: the native slug must be present at 0 so the poller emits a zero update
    // instead of leaving the previous balances stale.
    expect(Object.keys(balances).length).toBeGreaterThan(0);
    expect(Object.values(balances).every((value) => value === 0n)).toBe(true);
    expect(untrackableRegistry.has('mainnet', '0xdead')).toBe(true);
  });

  it('flag off: a positions 400 rethrows and marks nothing (dark-ship guard)', async () => {
    fetchMock.mockRejectedValue(new ApiServerError('untrackable wallet address', 400));

    await expect(fetchAccountAssets('ethereum', 'mainnet', '0xdead', jest.fn()))
      .rejects.toBeInstanceOf(ApiServerError);
    expect(untrackableRegistry.has('mainnet', '0xdead')).toBe(false);
  });
});
