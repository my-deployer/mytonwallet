import type { AgentAssetIdentityV2, AgentSwapAmountV1 } from './protocol/types';
import type { AgentV2HostAsset } from './types';

import { calculateAgentSwapIndicativeQuote } from './swapIndicativeQuote';

const OBSERVED_AT = '2026-08-18T12:00:00.000Z';
const TON: AgentV2HostAsset = {
  slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9, priceUsd: '3',
};
const USDT: AgentV2HostAsset = {
  slug: 'usdton', chain: 'ton', symbol: 'USDT', decimals: 6, priceUsd: '1',
};

describe('calculateAgentSwapIndicativeQuote', () => {
  it('calculates a source-sided cross-rate and rounds the destination down', () => {
    expect(calculateQuote(
      { ...TON, priceUsd: '1' },
      { ...USDT, priceUsd: '3' },
      { value: '1', valueType: 'decimal', side: 'source' },
    )).toMatchObject({
      status: 'resolved',
      kind: 'indicative_spot',
      from: { value: '1', slug: 'toncoin' },
      to: { value: '0.333333', slug: 'usdton' },
    });
  });

  it('calculates a destination-sided cross-rate and rounds the source up', () => {
    expect(calculateQuote(
      { ...TON, decimals: 6, priceUsd: '3' },
      { ...USDT, priceUsd: '1' },
      { value: '1', valueType: 'decimal', side: 'destination' },
    )).toMatchObject({
      status: 'resolved',
      from: { value: '0.333334', slug: 'toncoin' },
      to: { value: '1', slug: 'usdton' },
    });
  });

  it('caps a calculated value at eight fractional digits', () => {
    expect(calculateQuote(
      { ...TON, priceUsd: '1' },
      { ...USDT, decimals: 12, priceUsd: '3' },
      { value: '1', valueType: 'decimal', side: 'source' },
    )).toMatchObject({ to: { value: '0.33333333' } });
  });

  it.each([undefined, '0', '-1', 'not-a-price'])('does not fabricate a quote for price %p', (priceUsd) => {
    expect(calculateQuote(
      { ...TON, priceUsd },
      USDT,
      { value: '10', valueType: 'decimal', side: 'source' },
    )).toEqual({
      status: 'unavailable',
      reason: 'price_unavailable',
      observedAt: OBSERVED_AT,
    });
  });
});

function calculateQuote(
  source: AgentV2HostAsset,
  destination: AgentV2HostAsset,
  amount: AgentSwapAmountV1,
) {
  return calculateAgentSwapIndicativeQuote(
    source,
    identity(source),
    destination,
    identity(destination),
    amount,
    OBSERVED_AT,
  );
}

function identity(asset: AgentV2HostAsset): AgentAssetIdentityV2 {
  return {
    slug: asset.slug,
    chain: asset.chain,
    symbol: asset.symbol,
    decimals: asset.decimals,
  };
}
