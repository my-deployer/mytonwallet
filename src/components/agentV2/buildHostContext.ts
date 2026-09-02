import type { AgentApiChain } from '../../api/agentV2/protocol/types';
import type { AgentV2HostContextSnapshot } from '../../api/agentV2/types';
import type { GlobalState } from '../../global/types';

import {
  APP_VERSION,
  IS_AIR_APP,
  IS_EXTENSION,
  IS_PACKAGED_ELECTRON,
  IS_TELEGRAM_APP,
} from '../../config';
import { Big } from '../../lib/big.js';
import {
  selectAccountStakingStates,
  selectAccountState,
  selectAccountTokens,
  selectIsStakingDisabled,
  selectPortfolioMainnetWalletKeys,
} from '../../global/selectors';
import { parseAccountId } from '../../util/account';
import { toDecimal } from '../../util/decimals';
import { filterStakingStatesByTonStrategy, getIsNewStakeAllowed } from '../../util/staking';

const AGENT_CHAINS = new Set<AgentApiChain>(['ton', 'tron', 'solana', 'ethereum']);
const CHAIN_ORDER: AgentApiChain[] = ['ton', 'ethereum', 'tron', 'solana'];
const MAX_AGENT_HOST_ASSETS = 10_000;
const SAFE_STAKING_PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

interface AgentV2HostContextRelevantSlice {
  accountsById: NonNullable<GlobalState['accounts']>['byId'] | undefined;
  areTokensWithNoCostHidden: GlobalState['settings']['areTokensWithNoCostHidden'];
  baseCurrency: GlobalState['settings']['baseCurrency'];
  byAccountId: GlobalState['byAccountId'];
  currencyRates: GlobalState['currencyRates'];
  currentAccountId: GlobalState['currentAccountId'];
  isTestnet: GlobalState['settings']['isTestnet'];
  langCode: GlobalState['settings']['langCode'];
  settingsByAccountId: GlobalState['settings']['byAccountId'];
  theme: GlobalState['settings']['theme'];
  tokenInfoBySlug: GlobalState['tokenInfo']['bySlug'];
  stakingDefault: GlobalState['stakingDefault'];
  swapTokenInfo: GlobalState['swapTokenInfo'];
}

type BuildAgentV2HostContext = (global: GlobalState) => AgentV2HostContextSnapshot;

export function createAgentV2HostContextSelector(
  buildHostContext: BuildAgentV2HostContext = buildAgentV2HostContext,
) {
  let previousSlice: AgentV2HostContextRelevantSlice | undefined;
  let previousHostContext: AgentV2HostContextSnapshot | undefined;

  return (global: GlobalState) => {
    const slice = selectAgentV2HostContextRelevantSlice(global);
    if (previousSlice && areAgentV2HostContextSlicesEqual(previousSlice, slice)) {
      return previousHostContext!;
    }

    previousSlice = slice;
    previousHostContext = buildHostContext(global);
    return previousHostContext;
  };
}

export const selectAgentV2HostContext = createAgentV2HostContextSelector();

export function buildAgentV2HostContext(global: GlobalState): AgentV2HostContextSnapshot {
  const activePortfolioWalletKeys = selectPortfolioMainnetWalletKeys(global);
  const accounts = Object.entries(global.accounts?.byId ?? {}).map(([accountId, account]) => {
    const chains = Object.keys(account.byChain).filter(isAgentChain);
    const tokens = (selectAccountTokens(global, accountId) ?? [])
      .filter((token) => isAgentChain(token.chain) && isAgentAssetMetadataValid(token));
    const accountState = selectAccountState(global, accountId);
    const tokenBySlug = new Map(tokens.map((token) => [token.slug, token]));
    const savedAddresses = (accountState?.savedAddresses ?? [])
      .filter(({ chain }) => isAgentChain(chain))
      .map(({ name, chain, address }) => ({
        id: `${chain}:${address}`,
        name,
        chain: chain as AgentApiChain,
        address,
      }));
    const accountPortfolioWalletKeys = parseAccountId(accountId).network === 'mainnet'
      ? Object.entries(account.byChain)
        .filter(([chain, value]) => isAgentChain(chain) && Boolean(value?.address))
        .map(([chain, value]) => `${chain}:${value.address}`)
      : [];
    const portfolioWalletKeys = accountId === global.currentAccountId
      ? activePortfolioWalletKeys
      : accountPortfolioWalletKeys;
    const extraPositions = [
      ...Object.values(accountState?.nfts?.byAddress ?? {}).map((nft) => ({
        id: `nft-${nft.address}`,
        kind: 'nft' as const,
        chain: nft.chain as AgentApiChain,
        label: nft.name || nft.collectionName || 'NFT',
        valuationStatus: 'not_applicable' as const,
        visibility: nft.isHidden ? 'hidden' as const : 'visible' as const,
        ...(nft.collectionName ? { collection: nft.collectionName } : {}),
        isOnSale: nft.isOnSale,
        ...(nft.isScam ? { riskVerdict: 'spam' as const } : {}),
      })),
      ...Object.values(accountState?.staking?.stateById ?? {}).flatMap((staking) => {
        const token = tokenBySlug.get(staking.tokenSlug);
        if (!token || staking.balance <= 0n || !isAgentChain(token.chain)) return [];
        return [{
          id: `staking-${staking.id}`,
          kind: 'staking' as const,
          chain: token.chain as AgentApiChain,
          label: `${token.symbol} staking`,
          asset: {
            slug: token.slug,
            chain: token.chain as AgentApiChain,
            symbol: token.symbol,
            name: token.name,
            ...(token.tokenAddress ? { tokenAddress: token.tokenAddress } : {}),
            decimals: token.decimals,
          },
          quantity: toDecimal(staking.balance, token.decimals, true),
          valuationStatus: 'unpriced' as const,
          visibility: 'visible' as const,
          status: staking.unstakeRequestAmount ? 'unstaking' : 'active',
          apy: String(staking.annualYield),
          ...('unclaimedRewards' in staking && staking.unclaimedRewards > 0n
            ? { rewards: toDecimal(staking.unclaimedRewards, token.decimals, true) }
            : {}),
        }];
      }),
      ...(accountState?.vesting?.info ?? []).flatMap((vesting) => {
        const remaining = vesting.parts
          .filter(({ status }) => status === 'frozen' || status === 'ready')
          .reduce((total, { amount }) => total + amount, 0);
        return remaining > 0 ? [{
          id: `vesting-${vesting.id}`,
          kind: 'vesting' as const,
          chain: 'ton' as const,
          label: vesting.title,
          quantity: String(remaining),
          valuationStatus: 'unpriced' as const,
          visibility: 'visible' as const,
          status: vesting.parts.some(({ status }) => status === 'ready') ? 'ready' : 'frozen',
        }] : [];
      }),
    ];
    return {
      accountId,
      ...(account.title ? { label: account.title } : {}),
      state: 'active' as const,
      accountType: account.type === 'view'
        ? 'viewOnly' as const
        : account.type === 'hardware'
          ? 'ledger' as const
          : 'regular' as const,
      isViewOnly: account.type === 'view',
      chains,
      addresses: Object.fromEntries(
        Object.entries(account.byChain)
          .filter(([chain, value]) => isAgentChain(chain) && Boolean(value?.address))
          .map(([chain, value]) => [chain, value.address]),
      ),
      portfolioWalletKeys,
      holdings: tokens.map((token) => ({
        asset: {
          slug: token.slug,
          chain: token.chain as AgentApiChain,
          symbol: token.symbol,
          name: token.name,
          ...(token.tokenAddress ? { tokenAddress: token.tokenAddress } : {}),
          decimals: token.decimals,
        },
        balance: toDecimal(token.amount, token.decimals, true),
        availableBalance: toDecimal(token.amount, token.decimals, true),
        valuationStatus: isPositiveDecimal(token.totalValue)
          ? 'valued' as const
          : 'unpriced' as const,
        visibility: token.isDisabled ? 'hidden' as const : 'visible' as const,
        ...(token.totalValue ? { fiatValue: token.totalValue } : {}),
        ...(canonicalPositiveNumber(token.price) ? { fiatPrice: canonicalPositiveNumber(token.price) } : {}),
      })),
      positions: extraPositions,
      savedAddresses,
      domainStates: {
        accounts: { state: 'fresh' as const },
        positions: { state: accountState?.balances ? 'fresh' as const : 'notLoaded' as const },
        transactions: {
          state: accountState?.activities?.idsMain === undefined ? 'notLoaded' as const : 'fresh' as const,
        },
        // Saved addresses are local account metadata. Once the account state is
        // present, an absent property is the authoritative empty address book.
        contacts: { state: accountState === undefined ? 'notLoaded' as const : 'fresh' as const },
        value_series: {
          state: portfolioWalletKeys.length ? 'stale' as const : 'unavailable' as const,
        },
      },
    };
  });
  const activeAccount = accounts.find(({ accountId }) => accountId === global.currentAccountId);
  const activeNetwork = CHAIN_ORDER.find((chain) => activeAccount?.chains.includes(chain));
  const savedAddresses = accounts.find(({ accountId }) => accountId === global.currentAccountId)
    ?.savedAddresses ?? [];
  const assetCatalog = Object.values(global.tokenInfo.bySlug)
    .filter((token) => isAgentChain(token.chain) && isAgentAssetMetadataValid(token))
    .slice(0, MAX_AGENT_HOST_ASSETS)
    .map((token) => ({
      slug: token.slug,
      chain: token.chain as AgentApiChain,
      symbol: token.symbol,
      name: token.name,
      ...(token.tokenAddress ? { tokenAddress: token.tokenAddress } : {}),
      decimals: token.decimals,
      ...(canonicalPositiveNumber(token.priceUsd) ? { priceUsd: canonicalPositiveNumber(token.priceUsd) } : {}),
      ...(canonicalFiniteNumber(token.percentChange24h) !== undefined
        ? { percentChange24h: canonicalFiniteNumber(token.percentChange24h) }
        : {}),
    }));
  const swapTokenInfo = global.swapTokenInfo;
  const swapAssetCatalog = swapTokenInfo?.isLoaded
    ? Object.values(swapTokenInfo.bySlug)
      .filter((token) => isAgentChain(token.chain) && isAgentAssetMetadataValid(token))
      .slice(0, MAX_AGENT_HOST_ASSETS)
      .map((token) => ({
        slug: token.slug,
        chain: token.chain,
        symbol: token.symbol,
        name: token.name,
        ...(token.tokenAddress ? { tokenAddress: token.tokenAddress } : {}),
        decimals: token.decimals,
        ...(canonicalPositiveNumber(token.priceUsd) ? { priceUsd: canonicalPositiveNumber(token.priceUsd) } : {}),
      }))
    : undefined;
  const currencyRate = canonicalPositiveNumber(Number(global.currencyRates[global.settings.baseCurrency]));
  const stakingOffers = activeAccount
    ? buildStakingOfferContexts(global, activeAccount.accountId, assetCatalog)
    : undefined;

  return {
    platform: 'classic',
    client: getClientKind(),
    lang: global.settings.langCode,
    baseCurrency: global.settings.baseCurrency,
    ...(currencyRate ? { currencyRate } : {}),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: APP_VERSION,
    theme: global.settings.theme,
    isTestnet: global.settings.isTestnet,
    ...(activeAccount ? { activeAccountId: activeAccount.accountId } : {}),
    ...(activeNetwork ? { activeNetwork } : {}),
    ...(stakingOffers?.length ? { stakingOffers } : {}),
    accounts,
    assetCatalog,
    ...(swapAssetCatalog ? { swapAssetCatalog } : {}),
    savedAddresses: savedAddresses
      .filter(({ chain }) => isAgentChain(chain))
      .map(({ id, name, chain, address }) => ({ id, name, chain, address })),
  };
}

function buildStakingOfferContexts(
  global: GlobalState,
  accountId: string,
  assetCatalog: NonNullable<AgentV2HostContextSnapshot['assetCatalog']>,
): AgentV2HostContextSnapshot['stakingOffers'] {
  const isStakingDisabled = selectIsStakingDisabled(global);
  const accountState = selectAccountState(global, accountId);
  const stakingStates = filterStakingStatesByTonStrategy(
    selectAccountStakingStates(global, accountId).filter(Boolean),
    accountState?.staking?.shouldUseNominators,
  );
  return stakingStates.flatMap((staking) => {
    if (!staking) return [];
    const asset = assetCatalog.find(({ slug }) => slug === staking.tokenSlug);
    const annualYield = canonicalAnnualYield(staking.annualYield);
    if (!asset || !SAFE_STAKING_PRODUCT_ID_PATTERN.test(staking.id) || annualYield === undefined) return [];
    return [{
      productId: staking.id,
      asset: {
        slug: asset.slug,
        chain: asset.chain,
        symbol: asset.symbol,
        ...(asset.name ? { name: asset.name } : {}),
        ...(asset.tokenAddress ? { tokenAddress: asset.tokenAddress } : {}),
        decimals: asset.decimals,
      },
      annualYield,
      yieldType: staking.yieldType,
      availability: isStakingDisabled || !getIsNewStakeAllowed(staking.tokenSlug)
        ? 'disabled' as const
        : 'available' as const,
    }];
  }).slice(0, 8);
}

function isAgentAssetMetadataValid({
  slug,
  symbol,
  decimals,
}: Readonly<{ slug: string; symbol: string; decimals: number }>) {
  return Boolean(slug && symbol && Number.isInteger(decimals) && decimals >= 0);
}

function selectAgentV2HostContextRelevantSlice(global: GlobalState): AgentV2HostContextRelevantSlice {
  return {
    accountsById: global.accounts?.byId,
    areTokensWithNoCostHidden: global.settings.areTokensWithNoCostHidden,
    baseCurrency: global.settings.baseCurrency,
    byAccountId: global.byAccountId,
    currencyRates: global.currencyRates,
    currentAccountId: global.currentAccountId,
    isTestnet: global.settings.isTestnet,
    langCode: global.settings.langCode,
    settingsByAccountId: global.settings.byAccountId,
    theme: global.settings.theme,
    tokenInfoBySlug: global.tokenInfo.bySlug,
    stakingDefault: global.stakingDefault,
    swapTokenInfo: global.swapTokenInfo,
  };
}

function areAgentV2HostContextSlicesEqual(
  first: AgentV2HostContextRelevantSlice,
  second: AgentV2HostContextRelevantSlice,
) {
  return first.accountsById === second.accountsById
    && first.areTokensWithNoCostHidden === second.areTokensWithNoCostHidden
    && first.baseCurrency === second.baseCurrency
    && first.byAccountId === second.byAccountId
    && first.currencyRates === second.currencyRates
    && first.currentAccountId === second.currentAccountId
    && first.langCode === second.langCode
    && first.isTestnet === second.isTestnet
    && first.settingsByAccountId === second.settingsByAccountId
    && first.theme === second.theme
    && first.tokenInfoBySlug === second.tokenInfoBySlug
    && first.stakingDefault === second.stakingDefault
    && first.swapTokenInfo === second.swapTokenInfo;
}

function isPositiveDecimal(value?: string) {
  return Boolean(value && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value) && /[1-9]/u.test(value));
}

function canonicalPositiveNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value.toFixed(18).replace(/(?:\.0+|(?<fraction>\.\d*?)0+)$/u, '$<fraction>');
}

function canonicalFiniteNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value.toFixed(18).replace(/(?:\.0+|(?<fraction>\.\d*?)0+)$/u, '$<fraction>');
}

function canonicalAnnualYield(value: number) {
  if (!Number.isFinite(value) || value < 0) return undefined;
  try {
    const result = new Big(value);
    const canonical = result.toFixed();
    return result.lte(100_000) && canonical.length <= 128 ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function isAgentChain(value: string): value is AgentApiChain {
  return AGENT_CHAINS.has(value);
}

function getClientKind(): AgentV2HostContextSnapshot['client'] {
  if (IS_AIR_APP) return 'capacitor';
  if (IS_PACKAGED_ELECTRON) return 'electron';
  if (IS_EXTENSION) return 'extension';
  if (IS_TELEGRAM_APP) return 'tma';
  return 'web';
}
