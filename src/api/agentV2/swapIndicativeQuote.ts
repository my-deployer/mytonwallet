import type {
  AgentAssetIdentityV2,
  AgentSwapAmountV1,
  AgentSwapIndicativeQuoteV1,
} from './protocol/types';
import type { AgentV2HostAsset } from './types';

import { Big } from '../../lib/big.js';

const MAX_QUOTE_FRACTION_DIGITS = 8;

export function calculateAgentSwapIndicativeQuote(
  sourceAsset: AgentV2HostAsset,
  sourceIdentity: AgentAssetIdentityV2,
  destinationAsset: AgentV2HostAsset,
  destinationIdentity: AgentAssetIdentityV2,
  amount: AgentSwapAmountV1,
  observedAt: string,
): AgentSwapIndicativeQuoteV1 {
  const sourcePrice = positiveBig(sourceAsset.priceUsd);
  const destinationPrice = positiveBig(destinationAsset.priceUsd);
  if (!sourcePrice || !destinationPrice) {
    return { status: 'unavailable', reason: 'price_unavailable', observedAt };
  }

  const requested = new Big(amount.value);
  const sourceValue = amount.side === 'source'
    ? requested
    : requested.mul(destinationPrice).div(sourcePrice)
      .round(Math.min(sourceAsset.decimals, MAX_QUOTE_FRACTION_DIGITS), Big.roundUp);
  const destinationValue = amount.side === 'destination'
    ? requested
    : requested.mul(sourcePrice).div(destinationPrice)
      .round(Math.min(destinationAsset.decimals, MAX_QUOTE_FRACTION_DIGITS), Big.roundDown);

  return {
    status: 'resolved',
    kind: 'indicative_spot',
    from: money(sourceValue.toFixed(), sourceIdentity, sourceAsset.decimals),
    to: money(destinationValue.toFixed(), destinationIdentity, destinationAsset.decimals),
    observedAt,
  };
}

function positiveBig(value?: string | number) {
  if (value === undefined) return undefined;
  try {
    const result = new Big(value);
    return result.gt(0) ? result : undefined;
  } catch {
    return undefined;
  }
}

function money(value: string, asset: AgentAssetIdentityV2, decimals: number) {
  return {
    value,
    valueType: 'decimal' as const,
    decimals,
    symbol: asset.symbol,
    slug: asset.slug,
    chain: asset.chain,
    ...(asset.tokenAddress ? { tokenAddress: asset.tokenAddress } : {}),
  };
}
