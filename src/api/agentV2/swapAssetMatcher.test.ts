import type { AgentV2HostAsset } from './types';

import { matchAgentSwapAsset } from './swapAssetMatcher';

const CATALOG: AgentV2HostAsset[] = [
  { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
  { slug: 'ton-usdt', chain: 'ton', symbol: 'USD₮', name: 'Tether USD', decimals: 6 },
  { slug: 'tron-usdt', chain: 'tron', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { slug: 'ethereum-usdt', chain: 'ethereum', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { slug: 'solana-usdt', chain: 'solana', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
];

describe('matchAgentSwapAsset', () => {
  it('resolves an exact canonical symbol from the local swap catalog', () => {
    expect(matchAgentSwapAsset({ kind: 'query', query: 'TON' }, CATALOG)).toMatchObject({
      status: 'resolved',
      identity: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
    });
  });

  it('honors an explicit chain and technical ticker normalization', () => {
    expect(matchAgentSwapAsset({ kind: 'query', query: 'USDT', chain: 'ton' }, CATALOG)).toMatchObject({
      status: 'resolved',
      identity: { slug: 'ton-usdt', chain: 'ton' },
    });
  });

  it('returns at most three deterministic ambiguity candidates', () => {
    expect(matchAgentSwapAsset({ kind: 'query', query: 'USDT' }, CATALOG)).toEqual({
      status: 'ambiguous',
      candidates: [
        expect.objectContaining({ slug: 'ethereum-usdt', chain: 'ethereum' }),
        expect.objectContaining({ slug: 'solana-usdt', chain: 'solana' }),
        expect.objectContaining({ slug: 'ton-usdt', chain: 'ton' }),
      ],
      hasMore: true,
    });
  });

  it('does not resolve an asset absent from the local swap catalog', () => {
    expect(matchAgentSwapAsset({ kind: 'query', query: 'BTC' }, CATALOG)).toEqual({ status: 'not_found' });
  });
});
