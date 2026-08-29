import {
  type ApiChain,
  type ApiTokenPriceDetails,
  type ApiTokenWithMaybePrice,
  type ApiTokenWithPrice,
  type OnApiUpdate,
} from '../types';

import { getTokenInfo } from '../../util/chain';
import Deferred from '../../util/Deferred';
import { buildCollectionByKey, omitUndefined } from '../../util/iteratees';
import { logDebugError } from '../../util/logs';
import { tokenRepository } from '../db';
import { callBackendGet, callBackendPost } from './backend';
import { getHeldSlugs } from './held-tokens';

/** A backstop for the token details payload, which is normally bounded by the number of the tokens on the device */
const MAX_POST_TOKENS = 1500;

export type TokenDetailsOptions = {
  langCode?: string;
  /** Limits the payload to the tokens the polled wallets hold. Off for the runtimes that poll no wallet. */
  shouldNarrowToHeldTokens?: boolean;
};

export const tokensPreload = new Deferred();
/** Slugs of the last `GET /assets` response, reused when the details are requested outside `updateTokensFromBackend` */
let backendTokenSlugs = new Set<string>();
let isTokenUpdatePaused = false;
let arePricesFresh = false;
let pendingTokenUpdate: OnApiUpdate | undefined;
const tokensCache: {
  bySlug: Record<string, ApiTokenWithPrice>;
} = {
  bySlug: { ...getTokenInfo() },
};

export async function loadTokensCache() {
  try {
    const tokens = await tokenRepository.all();
    await updateTokens(tokens);
  } finally {
    tokensPreload.resolve();
  }
}

export function fetchBackendTokenDetails(assets: string[], langCode?: string): Promise<ApiTokenPriceDetails[]> {
  return callBackendPost<ApiTokenPriceDetails[]>(buildTokenDetailsPath(langCode), { assets });
}

/**
 * Picks the token addresses to ask `POST /assets` about. `GET /assets` covers the enabled tokens, so the request is
 * for the rest: the rug pulled, the disabled and whatever the backend does not publish.
 */
export function buildTokenDetailsPayload(tokens: ApiTokenWithPrice[], options: {
  /** Slugs returned by `GET /assets` */
  backendSlugs: Set<string>;
  /** When given, the payload is limited to the tokens the polled wallets hold */
  heldSlugs?: Set<string>;
  maxCount: number;
}) {
  const { backendSlugs, heldSlugs, maxCount } = options;
  const result: string[] = [];

  for (const token of tokens) {
    if (!token.tokenAddress || backendSlugs.has(token.slug)) continue;
    // `type` arrives from this very endpoint, so an unclassified LP token is still requested once. Afterwards it is
    // dropped: an LP token has no price of its own and the UI treats it as a service token.
    if (token.type === 'lp_token') continue;
    if (heldSlugs && !heldSlugs.has(token.slug)) continue;

    result.push(token.tokenAddress);

    if (result.length >= maxCount) break;
  }

  return result;
}

/** Loads `GET /assets`, tops it up with the details of the tokens it doesn't cover, and applies both to the cache */
export async function updateTokensFromBackend(onUpdate: OnApiUpdate, options: TokenDetailsOptions = {}) {
  const { langCode } = options;
  const tokens = await callBackendGet<ApiTokenWithPrice[]>('/assets', { langCode });

  for (const token of tokens) {
    token.isFromBackend = true;
  }

  await tokensPreload.promise;

  backendTokenSlugs = new Set(tokens.map((token) => token.slug));

  // A failed top-up must not discard the `GET /assets` response, which is the part the UI waits for
  const nonBackendTokenDetails = await fetchNonBackendTokenDetails(options).catch((err) => {
    logDebugError('fetchNonBackendTokenDetails', err);
    return undefined;
  });

  await updateTokens(tokens, () => {
    arePricesFresh = true;
    sendUpdateTokens(onUpdate);
  }, nonBackendTokenDetails, true);
}

export async function fetchNonBackendTokenDetails(options: TokenDetailsOptions = {}) {
  const { langCode, shouldNarrowToHeldTokens } = options;
  // POST is used to retrieve data because the addresses may not fit into a URL
  const tokenAddresses = buildTokenDetailsPayload(Object.values(tokensCache.bySlug), {
    backendSlugs: backendTokenSlugs,
    heldSlugs: shouldNarrowToHeldTokens ? getHeldSlugs() : undefined,
    maxCount: MAX_POST_TOKENS,
  });

  return tokenAddresses.length ? fetchBackendTokenDetails(tokenAddresses, langCode) : undefined;
}

function buildTokenDetailsPath(langCode?: string) {
  if (!langCode) {
    return '/assets';
  }

  return `/assets?${new URLSearchParams({ langCode }).toString()}`;
}

export async function updateTokens(
  tokens: ApiTokenWithMaybePrice[],
  sendUpdate?: NoneToVoidFunction,
  tokenDetails?: ApiTokenPriceDetails[],
  shouldSendUpdate?: boolean,
) {
  const tokensForDb: ApiTokenWithPrice[] = [];
  const detailsBySlug = buildCollectionByKey(tokenDetails ?? [], 'slug');

  for (const { slug, ...details } of tokenDetails ?? []) {
    const cachedToken = tokensCache.bySlug[slug] as ApiTokenWithPrice | undefined;
    if (cachedToken) {
      const token = { ...cachedToken, ...details };
      tokensCache.bySlug[slug] = token;
      tokensForDb.push(token);
    }
  }

  for (const token of tokens) {
    const { slug } = token;
    const cachedToken = tokensCache.bySlug[slug] as ApiTokenWithPrice | undefined;
    const mergedToken = mergeTokenWithCache(token, detailsBySlug, cachedToken);

    if (cachedToken === undefined) {
      shouldSendUpdate = true;
    }

    tokensCache.bySlug[token.slug] = mergedToken;
    if (token.tokenAddress) {
      tokensForDb.push(mergedToken);
    }
  }

  await tokenRepository.bulkPut(tokensForDb);

  if (shouldSendUpdate && sendUpdate) {
    sendUpdate();
  }
}

function mergeTokenWithCache(
  token: ApiTokenWithMaybePrice,
  detailsBySlug: Record<string, ApiTokenPriceDetails>,
  cachedToken?: ApiTokenWithPrice,
): ApiTokenWithPrice {
  if (cachedToken) {
    // Metadata from backend takes priority (e.g., image)
    return {
      ...omitUndefined(token.isFromBackend ? cachedToken : token),
      ...omitUndefined(token.isFromBackend ? token : cachedToken),
      ...(token.isFromBackend && { localizedName: token.localizedName }),
      priceUsd: token.priceUsd ?? cachedToken.priceUsd,
      percentChange24h: token.percentChange24h ?? cachedToken.percentChange24h,
      // For the scenario where the token was cached previously, but now it's disabled
      ...omitUndefined((detailsBySlug[token.slug] as ApiTokenPriceDetails | undefined) ?? {}),
      ...(token.slug in detailsBySlug && { isFromBackend: undefined }),
    };
  } else if (token.slug in detailsBySlug) {
    return {
      ...token,
      ...detailsBySlug[token.slug],
      isFromBackend: undefined,
    };
  } else {
    return {
      ...token,
      priceUsd: token.priceUsd ?? 0,
      percentChange24h: token.percentChange24h ?? 0,
    };
  }
}

export function getTokensCache() {
  return tokensCache;
}

/** Note that this function may return `undefined` if the token is not found (e.g. pTON) */
export function getTokenBySlug(slug: string): ApiTokenWithPrice | undefined {
  return tokensCache.bySlug[slug];
}

export function getTokenByAddress(tokenAddress: string, chain?: ApiChain) {
  if (chain) return getTokenBySlug(buildTokenSlug(chain, tokenAddress));

  const normalizedAddress = normalizeTokenAddress(tokenAddress);
  const matches = Object.values(tokensCache.bySlug).filter((token) => {
    return token.tokenAddress && normalizeTokenAddress(token.tokenAddress) === normalizedAddress;
  });

  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeTokenAddress(tokenAddress: string) {
  return tokenAddress.trim().toLowerCase();
}

export function sendUpdateTokens(onUpdate: OnApiUpdate) {
  if (isTokenUpdatePaused) {
    pendingTokenUpdate = onUpdate;
    return;
  }

  onUpdate({
    type: 'updateTokens',
    arePricesFresh,
    tokens: tokensCache.bySlug,
  });
}

export function pauseTokenUpdates() {
  isTokenUpdatePaused = true;
  arePricesFresh = false;
  pendingTokenUpdate = undefined;
}

export function resumeTokenUpdates() {
  isTokenUpdatePaused = false;

  const onUpdate = pendingTokenUpdate;
  pendingTokenUpdate = undefined;
  if (onUpdate) {
    sendUpdateTokens(onUpdate);
  }
}

export function buildTokenSlug(chain: ApiChain, address: string) {
  const addressPart = address.replace(/[^a-z\d]/gi, '').slice(0, 10);
  return `${chain}-${addressPart}`.toLowerCase();
}
