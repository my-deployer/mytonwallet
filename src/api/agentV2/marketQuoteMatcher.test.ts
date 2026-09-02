import type { AgentV2HostAsset } from './types';

import { matchAgentMarketQuoteAsset } from './marketQuoteMatcher';

const CATALOG: AgentV2HostAsset[] = [
  { slug: 'toncoin', chain: 'ton', symbol: 'GRAM', name: 'Gram', decimals: 9 },
  { slug: 'eth', chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { slug: 'ton-usdt', chain: 'ton', symbol: 'USD₮', name: 'Tether USD', tokenAddress: 'EQ-ton', decimals: 6 },
  { slug: 'tron-usdt', chain: 'tron', symbol: 'USDT', name: 'Tether USD', tokenAddress: 'T-tron', decimals: 6 },
  { slug: 'ethereum-usdt', chain: 'ethereum', symbol: 'USDT', name: 'Tether USD', tokenAddress: '0x-eth', decimals: 6 },
  { slug: 'solana-usdt', chain: 'solana', symbol: 'USDT', name: 'Tether USD', tokenAddress: 'S-sol', decimals: 6 },
];

describe('matchAgentMarketQuoteAsset', () => {
  it('does not redirect a model-selected query through a native alias', () => {
    expect(matchAgentMarketQuoteAsset({ kind: 'query', query: 'TON' }, CATALOG)).toEqual({ status: 'not_found' });
  });

  it('does not prefix-match a model-selected query', () => {
    expect(matchAgentMarketQuoteAsset({ kind: 'query', query: 'GRA' }, CATALOG)).toEqual({ status: 'not_found' });
  });

  it('normalizes technical ticker glyphs for an exact symbol match', () => {
    expect(matchAgentMarketQuoteAsset({ kind: 'query', query: 'USDT', chain: 'ton' }, CATALOG)).toMatchObject({
      status: 'resolved',
      identity: { slug: 'ton-usdt', chain: 'ton', symbol: 'USD₮' },
    });
  });

  it('returns at most three deterministic candidates for an ambiguous symbol', () => {
    expect(matchAgentMarketQuoteAsset({ kind: 'query', query: 'USDT' }, CATALOG)).toEqual({
      status: 'ambiguous',
      candidates: [
        expect.objectContaining({ chain: 'ethereum', slug: 'ethereum-usdt' }),
        expect.objectContaining({ chain: 'solana', slug: 'solana-usdt' }),
        expect.objectContaining({ chain: 'ton', slug: 'ton-usdt' }),
      ],
      hasMore: true,
    });
  });

  it('resolves a native name to its local wallet slug', () => {
    expect(matchAgentMarketQuoteAsset({ kind: 'query', query: 'Ethereum' }, CATALOG)).toMatchObject({
      status: 'resolved',
      identity: { slug: 'eth', chain: 'ethereum', symbol: 'ETH' },
    });
  });

  it('honors an explicit identity without fuzzy matching', () => {
    expect(matchAgentMarketQuoteAsset({
      kind: 'asset',
      asset: { slug: 'tron-usdt', chain: 'tron', symbol: 'USDT', tokenAddress: 'T-tron' },
    }, CATALOG)).toMatchObject({ status: 'resolved', identity: { slug: 'tron-usdt', chain: 'tron' } });
  });
});
