import type { ApiStakingState } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { DEFAULT_NOMINATORS_STAKING_STATE, DEFAULT_STAKING_STATE, TON_USDE } from '../../config';
import { buildAgentV2HostContext, createAgentV2HostContextSelector } from './buildHostContext';

describe('buildAgentV2HostContext', () => {
  it('keeps Ethereum ahead of TRON and Solana for a mixed-chain account', () => {
    const global = {
      currentAccountId: 'mainnet-account',
      accounts: {
        byId: {
          'mainnet-account': {
            type: 'view',
            title: 'Watch',
            byChain: {
              tron: { address: 'T-address' },
              solana: { address: 'solana-address' },
              ethereum: { address: '0x-address' },
            },
          },
        },
      },
      byAccountId: {
        'mainnet-account': { balances: { bySlug: {} } },
      },
      tokenInfo: { bySlug: {} },
      settings: {
        langCode: 'en', baseCurrency: 'USD', theme: 'light', byAccountId: {},
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;

    expect(buildAgentV2HostContext(global).activeNetwork).toBe('ethereum');
  });

  it('projects wallet data without credentials or unbound portfolio history', () => {
    const netWorthHistory = {
      status: 'ok',
      base: 'usd',
      density: '1d',
      datasets: [{
        assetId: 1,
        symbol: 'GRAM',
        contractAddress: '',
        points: [[1_752_364_800, 2.5] as [number, number]],
      }],
    };
    const global = {
      currentAccountId: 'mainnet-account',
      accounts: {
        byId: {
          'mainnet-account': {
            type: 'view',
            title: 'Watch',
            byChain: {
              ton: { address: 'EQ-raw-address' },
              base: { address: '0x-base-address' },
              bnb: { address: '0x-bnb-address' },
              robinhood: { address: '0x-robinhood-address' },
            },
          },
        },
      },
      byAccountId: {
        'mainnet-account': {
          balances: { bySlug: { toncoin: 1_250_000_000n } },
          nfts: {
            byAddress: {
              'nft-address': {
                address: 'nft-address', chain: 'ton', name: 'Unsafe NFT', collectionName: 'Collection',
                isOnSale: false, isHidden: true, isScam: true,
              },
            },
          },
          savedAddresses: [{ name: 'Alice', chain: 'ton', address: 'EQ-alice' }],
        },
      },
      tokenInfo: {
        bySlug: {
          toncoin: {
            slug: 'toncoin', chain: 'ton', symbol: 'GRAM', name: 'Gram', decimals: 9, priceUsd: 2,
          },
        },
      },
      settings: {
        langCode: 'en',
        baseCurrency: 'USD',
        theme: 'light',
        byAccountId: { 'mainnet-account': { alwaysHiddenSlugs: ['toncoin'] } },
      },
      portfolio: {
        activeRange: '3M',
        historyByAccountId: {
          'mainnet-account': { USD: { '3M': { netWorth: netWorthHistory, fetchedAtSlot: 20_257 } } },
        },
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;

    const result = buildAgentV2HostContext(global);

    expect(result.activeNetwork).toBe('ton');
    expect(result.accounts[0]).toMatchObject({
      accountType: 'viewOnly',
      isViewOnly: true,
      chains: ['ton'],
      addresses: { ton: 'EQ-raw-address' },
      portfolioWalletKeys: expect.arrayContaining([
        'ton:EQ-raw-address',
        'base:0x-base-address',
        'bnb:0x-bnb-address',
        'robinhood:0x-robinhood-address',
      ]),
      holdings: [{ balance: '1.25', visibility: 'hidden' }],
      positions: [{
        kind: 'nft', visibility: 'hidden', riskVerdict: 'spam', label: 'Unsafe NFT',
      }],
    });
    expect(result.accounts[0].portfolioWalletKeys).toHaveLength(4);
    expect(result.assetCatalog).toEqual([{
      slug: 'toncoin',
      chain: 'ton',
      symbol: 'GRAM',
      name: 'Gram',
      decimals: 9,
      priceUsd: '2',
    }]);
    expect(result.currencyRate).toBe('1');
    expect(result.portfolioHistory).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('mnemonic');
  });

  it('does not expose active or inactive testnet wallets to the mainnet-only Portfolio API', () => {
    const global = {
      currentAccountId: '1-mainnet',
      accounts: {
        byId: {
          '1-mainnet': {
            type: 'view',
            byChain: { ton: { address: 'EQ-mainnet-address' } },
          },
          '1-testnet': {
            type: 'view',
            byChain: { ton: { address: 'kQ-testnet-address' } },
          },
        },
      },
      byAccountId: {
        '1-mainnet': { balances: { bySlug: {} } },
        '1-testnet': { balances: { bySlug: {} } },
      },
      tokenInfo: { bySlug: {} },
      settings: {
        langCode: 'en', baseCurrency: 'USD', theme: 'light', byAccountId: {},
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;

    const accounts = buildAgentV2HostContext(global).accounts;
    expect(accounts.find(({ accountId }) => accountId === '1-mainnet')).toMatchObject({
      portfolioWalletKeys: ['ton:EQ-mainnet-address'],
      domainStates: { value_series: { state: 'stale' } },
    });
    expect(accounts.find(({ accountId }) => accountId === '1-testnet')).toMatchObject({
      portfolioWalletKeys: [],
      domainStates: { value_series: { state: 'unavailable' } },
    });
  });

  it('treats an absent saved-address property as an authoritative empty address book', () => {
    const global = {
      currentAccountId: 'mainnet-account',
      accounts: {
        byId: {
          'mainnet-account': {
            type: 'mnemonic',
            title: 'Main',
            byChain: { ton: { address: 'EQ-address' } },
          },
        },
      },
      byAccountId: {
        'mainnet-account': { balances: { bySlug: {} } },
      },
      tokenInfo: { bySlug: {} },
      settings: {
        langCode: 'en', baseCurrency: 'USD', theme: 'light', byAccountId: {},
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;

    expect(buildAgentV2HostContext(global).accounts[0]).toMatchObject({
      savedAddresses: [],
      domainStates: { contacts: { state: 'fresh' } },
    });
  });

  it('keeps saved-address identities stable when the address book order changes', () => {
    const savedAddresses = [
      { name: 'Mom', chain: 'ton' as const, address: 'EQ-mom' },
      { name: 'Alice', chain: 'ethereum' as const, address: '0x-alice' },
    ];
    const global = {
      currentAccountId: 'mainnet-account',
      accounts: {
        byId: {
          'mainnet-account': {
            type: 'mnemonic',
            title: 'Main',
            byChain: { ton: { address: 'EQ-address' } },
          },
        },
      },
      byAccountId: {
        'mainnet-account': { balances: { bySlug: {} }, savedAddresses },
      },
      tokenInfo: { bySlug: {} },
      settings: {
        langCode: 'en', baseCurrency: 'USD', theme: 'light', byAccountId: {},
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;

    const first = buildAgentV2HostContext(global).accounts[0].savedAddresses!;
    const reordered = buildAgentV2HostContext({
      ...global,
      byAccountId: {
        'mainnet-account': { balances: { bySlug: {} }, savedAddresses: [...savedAddresses].reverse() },
      },
    } as unknown as GlobalState).accounts[0].savedAddresses!;

    expect(Object.fromEntries(first.map(({ address, id }) => [address, id]))).toEqual(
      Object.fromEntries(reordered.map(({ address, id }) => [address, id])),
    );
  });

  it('projects only a locally eligible mainnet staking entry point', () => {
    const global = stakingGlobal();

    expect(buildAgentV2HostContext(global)).toMatchObject({
      stakingOffers: [{
        productId: DEFAULT_STAKING_STATE.id,
        asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
        annualYield: '14.09',
        yieldType: 'APY',
        availability: 'available',
      }],
    });

    const viewOnly = buildAgentV2HostContext({
      ...global,
      accounts: {
        byId: {
          'mainnet-account': {
            ...global.accounts!.byId['mainnet-account'],
            type: 'view',
          },
        },
      },
    } as GlobalState);
    expect(viewOnly.stakingOffers?.[0]).toEqual(expect.objectContaining({
      productId: DEFAULT_STAKING_STATE.id,
      annualYield: '14.09',
    }));

    const testnet = buildAgentV2HostContext({
      ...global,
      settings: { ...global.settings, isTestnet: true },
    } as GlobalState);
    expect(testnet.stakingOffers?.[0]?.availability).toBe('disabled');
  });

  it('advertises every eligible local staking product in frontend order', () => {
    const global = stakingGlobal();
    global.tokenInfo.bySlug[TON_USDE.slug] = { ...TON_USDE, priceUsd: 1, percentChange24h: 0 };
    global.byAccountId['mainnet-account'].staking = {
      stateById: {
        [DEFAULT_STAKING_STATE.id]: DEFAULT_STAKING_STATE,
        ethena: {
          id: 'ethena',
          type: 'ethena',
          tokenSlug: TON_USDE.slug,
          yieldType: 'APY',
          annualYield: 8.25,
        } as ApiStakingState,
      },
    };

    expect(buildAgentV2HostContext(global).stakingOffers).toEqual([
      expect.objectContaining({
        productId: DEFAULT_STAKING_STATE.id,
        asset: expect.objectContaining({ slug: 'toncoin' }),
        availability: 'available',
      }),
      expect.objectContaining({
        productId: 'ethena',
        asset: expect.objectContaining({ slug: TON_USDE.slug, symbol: 'USDe', decimals: 6 }),
        availability: 'available',
      }),
    ]);
  });

  it('uses the same mutually exclusive TON strategy as the staking form', () => {
    const global = stakingGlobal();
    global.byAccountId['mainnet-account'].staking = {
      shouldUseNominators: true,
      stateById: {
        [DEFAULT_STAKING_STATE.id]: DEFAULT_STAKING_STATE,
        [DEFAULT_NOMINATORS_STAKING_STATE.id]: DEFAULT_NOMINATORS_STAKING_STATE,
      },
    };

    expect(buildAgentV2HostContext(global).stakingOffers).toEqual([
      expect.objectContaining({ productId: DEFAULT_NOMINATORS_STAKING_STATE.id }),
    ]);
  });

  it('omits the staking offer when the default product asset cannot be resolved locally', () => {
    const global = stakingGlobal();
    global.tokenInfo.bySlug = {};

    expect(buildAgentV2HostContext(global).stakingOffers).toBeUndefined();
  });

  it('projects a minimal swap catalog only after local swap metadata is loaded', () => {
    const global = {
      ...stakingGlobal(),
      swapTokenInfo: {
        isLoaded: true,
        bySlug: {
          toncoin: {
            slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: 2.5,
          },
          usdton: {
            slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: 1,
            tokenAddress: 'EQ-usdt',
          },
          invalidPrice: {
            slug: 'invalid-price', chain: 'ton', symbol: 'BAD', name: 'Bad Price', decimals: 9, priceUsd: 0,
          },
          unsupportedChain: {
            slug: 'base-token', chain: 'base', symbol: 'BASE', name: 'Base Token', decimals: 18, priceUsd: 1,
          },
        },
      },
    } as unknown as GlobalState;

    expect(buildAgentV2HostContext(global).swapAssetCatalog).toEqual([
      { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: '2.5' },
      {
        slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6,
        tokenAddress: 'EQ-usdt', priceUsd: '1',
      },
      { slug: 'invalid-price', chain: 'ton', symbol: 'BAD', name: 'Bad Price', decimals: 9 },
    ]);
    expect(buildAgentV2HostContext({
      ...global,
      swapTokenInfo: { ...global.swapTokenInfo, isLoaded: false },
    } as unknown as GlobalState).swapAssetCatalog).toBeUndefined();
  });

  it('omits malformed assets without discarding valid catalog entries', () => {
    const global = stakingGlobal();
    global.byAccountId['mainnet-account'].balances!.bySlug = {
      toncoin: 1_000_000_000n,
      invalid: 1_000_000_000n,
    };
    global.tokenInfo.bySlug.invalid = {
      slug: 'invalid', chain: 'ton', symbol: '', name: 'Invalid', decimals: 9,
      priceUsd: 0, percentChange24h: 0,
    };
    global.swapTokenInfo = {
      isLoaded: true,
      bySlug: {
        valid: {
          slug: 'valid', chain: 'ton', symbol: 'VALID', name: 'Valid', decimals: 9,
          isPopular: false, priceUsd: 0,
        },
        invalid: {
          slug: 'invalid', chain: 'ton', symbol: '', name: 'Invalid', decimals: 9,
          isPopular: false, priceUsd: 0,
        },
      },
    } as GlobalState['swapTokenInfo'];

    const result = buildAgentV2HostContext(global);

    expect(result.assetCatalog?.map(({ slug }) => slug)).toEqual(['toncoin']);
    expect(result.swapAssetCatalog?.map(({ slug }) => slug)).toEqual(['valid']);
    expect(result.accounts[0].holdings.map(({ asset }) => asset.slug)).toEqual(['toncoin']);
    expect(result.activeAccountId).toBe('mainnet-account');
  });

  it('reuses the projection when only unrelated global and token-info wrapper fields change', () => {
    const global = {
      currentAccountId: 'mainnet-account',
      accounts: {
        byId: {
          'mainnet-account': {
            type: 'view',
            byChain: { ton: { address: 'EQ-address' } },
          },
        },
      },
      byAccountId: {
        'mainnet-account': { balances: { bySlug: { toncoin: 1_000_000_000n } } },
      },
      tokenInfo: {
        bySlug: {
          toncoin: {
            slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: 1,
          },
        },
      },
      settings: {
        langCode: 'en',
        baseCurrency: 'USD',
        theme: 'light',
        areTokensWithNoCostHidden: false,
        byAccountId: {},
      },
      currencyRates: { USD: 1 },
    } as unknown as GlobalState;
    const buildHostContext = jest.fn(buildAgentV2HostContext);
    const selectHostContext = createAgentV2HostContextSelector(buildHostContext);

    const first = selectHostContext(global);
    const unrelatedUpdate = {
      ...global,
      DEBUG_randomId: 2,
      tokenInfo: {
        ...global.tokenInfo,
        irrelevantStatus: 'loaded',
      },
    } as unknown as GlobalState;
    const second = selectHostContext(unrelatedUpdate);

    expect(second).toBe(first);
    expect(buildHostContext).toHaveBeenCalledTimes(1);

    selectHostContext({
      ...unrelatedUpdate,
      tokenInfo: {
        ...unrelatedUpdate.tokenInfo,
        bySlug: { ...unrelatedUpdate.tokenInfo.bySlug },
      },
    });
    expect(buildHostContext).toHaveBeenCalledTimes(2);
  });

  it('invalidates the memoized host context when swap metadata changes', () => {
    const global = {
      ...stakingGlobal(),
      swapTokenInfo: {
        isLoaded: true,
        bySlug: {
          toncoin: {
            slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: 2.5,
          },
        },
      },
    } as unknown as GlobalState;
    const buildHostContext = jest.fn(buildAgentV2HostContext);
    const selectHostContext = createAgentV2HostContextSelector(buildHostContext);
    const first = selectHostContext(global);

    const second = selectHostContext({
      ...global,
      swapTokenInfo: {
        ...global.swapTokenInfo,
        bySlug: {
          ...global.swapTokenInfo.bySlug,
          toncoin: { ...global.swapTokenInfo.bySlug.toncoin, priceUsd: 3 },
        },
      },
    } as GlobalState);

    expect(second).not.toBe(first);
    expect(buildHostContext).toHaveBeenCalledTimes(2);
  });
});

function stakingGlobal(): GlobalState {
  return {
    currentAccountId: 'mainnet-account',
    accounts: {
      byId: {
        'mainnet-account': {
          type: 'mnemonic',
          title: 'Main',
          byChain: { ton: { address: 'EQ-address' } },
        },
      },
    },
    byAccountId: {
      'mainnet-account': { balances: { bySlug: {} } },
    },
    tokenInfo: {
      bySlug: {
        toncoin: {
          slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9,
        },
      },
    },
    settings: {
      langCode: 'en', baseCurrency: 'USD', theme: 'light', isTestnet: false, byAccountId: {},
    },
    stakingDefault: DEFAULT_STAKING_STATE,
    currencyRates: { USD: 1 },
  } as unknown as GlobalState;
}
