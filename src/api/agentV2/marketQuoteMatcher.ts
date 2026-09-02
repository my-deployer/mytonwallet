import type {
  AgentAssetIdentityV2,
  AgentMarketQuoteSelectorV1,
} from './protocol/types';
import type { AgentV2HostAsset } from './types';

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE = /\s+/gu;

type AgentMarketQuoteMatch =
  | { status: 'resolved'; asset: AgentV2HostAsset; identity: AgentAssetIdentityV2 }
  | { status: 'ambiguous'; candidates: AgentAssetIdentityV2[]; hasMore: boolean }
  | { status: 'not_found' };

export function matchAgentMarketQuoteAsset(
  selector: AgentMarketQuoteSelectorV1,
  catalog: readonly AgentV2HostAsset[],
): AgentMarketQuoteMatch {
  const validAssets = catalog.flatMap((asset) => {
    const identity = projectMarketQuoteAsset(asset);
    return identity ? [{ asset, identity }] : [];
  });
  const candidates = selector.kind === 'asset'
    ? validAssets.filter(({ identity }) => matchesIdentity(identity, selector.asset))
    : matchQuery(validAssets, selector.query, selector.chain);
  const unique = uniqueAssets(candidates);
  if (unique.length === 0) return { status: 'not_found' };
  if (unique.length === 1) return { status: 'resolved', ...unique[0] };
  return {
    status: 'ambiguous',
    candidates: unique.slice(0, 3).map(({ identity }) => identity),
    hasMore: unique.length > 3,
  };
}

function matchQuery(
  catalog: Array<{ asset: AgentV2HostAsset; identity: AgentAssetIdentityV2 }>,
  rawQuery: string,
  chain?: AgentAssetIdentityV2['chain'],
) {
  const query = normalize(rawQuery);
  const tickerQuery = normalizeTicker(rawQuery);
  const scoped = chain ? catalog.filter(({ identity }) => identity.chain === chain) : catalog;
  if (!query) return [];

  const addressMatches = scoped.filter(({ identity }) => normalize(identity.tokenAddress) === query);
  if (addressMatches.length) return addressMatches;
  const slugMatches = scoped.filter(({ identity }) => normalize(identity.slug) === query);
  if (slugMatches.length) return slugMatches;

  return scoped.filter(({ identity }) => (
    normalizeTicker(identity.symbol) === tickerQuery || normalize(identity.name) === query
  ));
}

function matchesIdentity(left: AgentAssetIdentityV2, right: AgentAssetIdentityV2) {
  return left.slug === right.slug
    && left.chain === right.chain
    && (right.tokenAddress === undefined || left.tokenAddress === right.tokenAddress);
}

function uniqueAssets<T extends { asset: AgentV2HostAsset; identity: AgentAssetIdentityV2 }>(assets: T[]) {
  const unique = new Map<string, T>();
  for (const candidate of assets) {
    const { identity } = candidate;
    const key = `${identity.chain}\u0000${identity.slug}\u0000${identity.tokenAddress ?? ''}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((left, right) => (
    left.identity.chain.localeCompare(right.identity.chain)
    || left.identity.symbol.localeCompare(right.identity.symbol)
    || left.identity.slug.localeCompare(right.identity.slug)
  ));
}

function projectMarketQuoteAsset(asset: AgentV2HostAsset): AgentAssetIdentityV2 | undefined {
  const slug = sanitize(asset.slug, 128);
  const symbol = sanitize(asset.symbol, 32);
  const name = asset.name === undefined ? undefined : sanitize(asset.name, 160);
  const tokenAddress = asset.tokenAddress === undefined ? undefined : sanitize(asset.tokenAddress, 256);
  if (!slug || !symbol || (asset.name !== undefined && !name) || (asset.tokenAddress !== undefined && !tokenAddress)) {
    return undefined;
  }
  return {
    slug,
    chain: asset.chain,
    symbol,
    ...(name ? { name } : {}),
    ...(tokenAddress ? { tokenAddress } : {}),
    decimals: asset.decimals,
  };
}

function sanitize(value: string, maxLength: number) {
  return [...value.normalize('NFC').replace(CONTROL_CHARACTERS, '').replace(WHITESPACE, ' ').trim()]
    .slice(0, maxLength)
    .join('');
}

function normalize(value?: string) {
  return value?.normalize('NFKC').trim().toLocaleLowerCase('en-US') ?? '';
}

function normalizeTicker(value?: string) {
  // Tether's canonical TON symbol uses the Unicode tugrik glyph as a stylized T.
  return normalize(value).replaceAll('\u20AE', 't');
}
