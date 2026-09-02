import type { ApiActivity, ApiPortfolioHistoryResponse } from '../types';
import type {
  AgentActionProposal,
  AgentPersistedActionV2,
  AgentToolCall,
  AgentWalletDataQueryArgsV5,
} from './protocol/types';
import type { AgentV2SendDraftStore, AgentV2StoredSendDraft } from './sendDraftStore';
import type { AgentV2HostContextSnapshot } from './types';
import type { AgentWalletScopeStore } from './walletScopeStore';
import type { AgentV2WalletToolDispatcherDependencies } from './walletTools';

import { getLogs } from '../../util/logs';
import contractManifest from './generated/manifest.json';
import { AgentV2WalletSession } from './walletSession';
import { AgentV2WalletToolDispatcher } from './walletTools';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_THREAD_ID = '22222222-2222-4222-8222-222222222223';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const TOOL_CALL_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_TOOL_CALL_ID = '44444444-4444-4444-8444-444444444445';
const ACTION_ID = '55555555-5555-4555-8555-555555555555';
const RESULT_ID = '66666666-6666-4666-8666-666666666666';
const SECOND_RESULT_ID = '77777777-7777-4777-8777-777777777777';
const DRAFT_ID = '99999999-9999-4999-8999-999999999999';
const SEND_ACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = '2026-08-10T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const FULL_TRANSACTION_HASH = 'b'.repeat(64);
const MAX_RESULT_BYTES = 98_304;

interface SetupOptions extends Partial<Omit<AgentV2WalletToolDispatcherDependencies, 'session'>> {
  host?: AgentV2HostContextSnapshot;
}

interface QueryVariant {
  args: AgentWalletDataQueryArgsV5;
  expected: Record<string, unknown>;
  operation: AgentWalletDataQueryArgsV5['operation'];
}

describe('AgentV2WalletToolDispatcher', () => {
  it('advertises the live wallet query, Send preparation, and market quote tools', () => {
    const { session } = setup();

    expect(session.buildContext().capabilities.supportedTools).toEqual([
      {
        name: 'wallet.data.query',
        version: 5,
        scopes: ['wallet.data.read'],
        timeoutMs: 30_000,
        maxResultBytes: MAX_RESULT_BYTES,
      },
      {
        name: 'wallet.directory.query',
        version: 1,
        scopes: ['wallet.directory.read'],
        timeoutMs: 30_000,
        maxResultBytes: 32_768,
      },
      {
        name: 'action.send.prepare',
        version: 1,
        scopes: ['action.send.prepare'],
        timeoutMs: 15_000,
        maxResultBytes: MAX_RESULT_BYTES,
      },
      {
        name: 'market.asset.quote',
        version: 1,
        scopes: ['market.data.read'],
        timeoutMs: 5_000,
        maxResultBytes: 16_384,
      },
    ]);
  });

  it('returns every non-deleted wallet through the purpose-bound directory tool', async () => {
    const { dispatcher, session } = setup();

    const response = await dispatcher.execute(directoryCall(session), execution());

    expect(response).toMatchObject({
      toolName: 'wallet.directory.query',
      status: 'success',
      directorySession: {
        sessionId: session.snapshot().sessionId,
        revision: session.snapshot().revision,
      },
      result: {
        freshness: { asOf: NOW, source: 'store', isStale: false },
        redaction: { level: 'scoped', omittedFields: [], maxResultBytes: 32_768 },
        result: {
          status: 'complete',
          coverage: { accountsRequested: 2, accountsIncluded: 2, rowsOmitted: 0 },
          accounts: [
            { label: 'Main', isCurrent: true, state: 'active', chains: ['ton'] },
            { label: 'Savings', isCurrent: false, state: 'active', chains: ['ton'] },
          ],
        },
      },
    });
    expect(response).not.toHaveProperty('walletContextSession');
  });

  it('rejects a wallet directory grant that is not bound to the current message', async () => {
    const { dispatcher, session } = setup();
    const call = directoryCall(session);
    call.directoryGrant!.messageId = RUN_ID;

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      toolName: 'wallet.directory.query',
      status: 'rejected',
      error: { code: 'tool_scope_mismatch', retryable: false },
    });
  });

  it('resolves a market quote from the current local catalog without a backend market call', async () => {
    const { dispatcher, session } = setup();

    const response = await dispatcher.execute(quoteCall(session, 'TON'), execution());

    expect(response).toMatchObject({
      toolName: 'market.asset.quote',
      status: 'success',
      result: {
        schemaVersion: 1,
        freshness: { asOf: NOW, source: 'store', isStale: false },
        redaction: { level: 'minimal', omittedFields: [], maxResultBytes: 16_384 },
        result: {
          schemaVersion: 1,
          status: 'resolved',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
          price: '2.5',
          quoteCurrency: 'USD',
          percentChange24h: '-1.25',
          readAt: NOW,
        },
      },
    });
  });

  it('returns a typed unavailable quote when the client cannot provide the exact currency', async () => {
    const { dispatcher, session } = setup();
    const call = quoteCall(session, 'TON');
    if (!('quoteCurrency' in call.arguments)) throw new Error('Expected a currency quote call');
    call.arguments.quoteCurrency = 'USDT';

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      toolName: 'market.asset.quote',
      status: 'success',
      result: {
        result: {
          schemaVersion: 1,
          status: 'price_unavailable',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
          readAt: NOW,
        },
      },
    });
  });

  it('resolves an asset cross-rate from two prices in the same local snapshot', async () => {
    const host = hostContext();
    host.assetCatalog![2].priceUsd = '1';
    const { dispatcher, session } = setup({ host });
    const call = quoteCall(session, 'TON');
    call.arguments = {
      schemaVersion: 1,
      selector: { kind: 'asset', asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' } },
      quoteAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
    };

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      toolName: 'market.asset.quote',
      status: 'success',
      result: {
        result: {
          schemaVersion: 1,
          status: 'resolved',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
          price: '2.5',
          quoteAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
          readAt: NOW,
        },
      },
    });
  });

  it('returns price_unavailable when either side of an asset cross-rate has no current price', async () => {
    const { dispatcher, session } = setup();
    const call = quoteCall(session, 'TON');
    call.arguments = {
      schemaVersion: 1,
      selector: { kind: 'asset', asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' } },
      quoteAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
    };

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      result: {
        result: {
          schemaVersion: 1,
          status: 'price_unavailable',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
          readAt: NOW,
        },
      },
    });
  });

  it('reads the exact current staking offer without position, balance, or action eligibility', async () => {
    const host = hostContext();
    host.accounts[0].accountType = 'viewOnly';
    host.accounts[0].isViewOnly = true;
    host.accounts[0].holdings[0].balance = '0';
    const { dispatcher, session } = setup({ host });
    enableStakingOffer(session);

    const response = await dispatcher.execute(stakingOfferCall(session), execution());

    expect(response).toMatchObject({
      toolName: 'staking.offer.read',
      status: 'success',
      result: {
        schemaVersion: 1,
        freshness: { asOf: NOW, source: 'store', isStale: false },
        redaction: { level: 'minimal', omittedFields: [], maxResultBytes: 16_384 },
        result: {
          schemaVersion: 1,
          status: 'available',
          productId: 'liquid',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
          annualYield: '14.09',
          yieldType: 'APY',
          depositAvailability: 'available',
          readAt: NOW,
        },
      },
    });
  });

  it('lists the global staking catalog for a view-only wallet with zero balances', async () => {
    const host = hostContext();
    host.accounts[0].accountType = 'viewOnly';
    host.accounts[0].isViewOnly = true;
    host.accounts[0].holdings = [];
    host.stakingOffers = [];
    const assets = new Map([
      ['toncoin', { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 }],
      ['ton-usde', { slug: 'ton-usde', chain: 'ton' as const, symbol: 'USDe', decimals: 6 }],
    ]);
    const { dispatcher, session } = setup({
      host,
      getTokenBySlug: (slug) => assets.get(slug),
      getStakingCatalog: () => Promise.resolve({
        hasPartialCoverage: false,
        products: [
          {
            productId: 'liquid', tokenSlug: 'toncoin', annualYield: 4.5, yieldType: 'APY',
            depositAvailability: 'available',
          },
          {
            productId: 'ethena', tokenSlug: 'ton-usde', annualYield: 8, yieldType: 'APY',
            depositAvailability: 'disabled', disabledReason: 'protocol_disabled',
          },
          {
            productId: 'unknown', tokenSlug: 'missing', annualYield: 1, yieldType: 'APR',
            depositAvailability: 'available',
          },
        ],
      }),
    });
    enableStakingCatalog(session);

    const response = await dispatcher.execute(stakingCatalogCall(session), execution());

    expect(response).toMatchObject({
      toolName: 'staking.offers.list',
      status: 'success',
      result: {
        freshness: { source: 'network', isStale: false },
        warnings: [{ code: 'partial_coverage' }],
        result: {
          status: 'resolved',
          offers: [
            { productId: 'liquid', asset: { slug: 'toncoin', symbol: 'TON' }, depositAvailability: 'available' },
            {
              productId: 'ethena', asset: { slug: 'ton-usde', symbol: 'USDe' },
              depositAvailability: 'disabled', disabledReason: 'protocol_disabled',
            },
          ],
        },
      },
    });
  });

  it('matches a minimal staking asset selector to the richer local offer identity', async () => {
    const { dispatcher, session } = setup();
    enableStakingOffer(session);
    const call = stakingOfferCall(session);
    call.arguments.asset = { slug: 'toncoin', chain: 'ton', symbol: 'TON' };

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'success',
      result: {
        result: {
          status: 'available',
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
        },
      },
    });
  });

  it('reads the selected product from multiple locally advertised staking offers', async () => {
    const host = hostContext();
    const usde = {
      slug: 'ton-eqaib6kmdf', chain: 'ton' as const, symbol: 'USDe', name: 'Ethena USDe',
      tokenAddress: 'EQ-usde', decimals: 6,
    };
    host.assetCatalog!.push(usde);
    host.stakingOffers!.push({
      productId: 'ethena',
      asset: usde,
      annualYield: '8.25',
      yieldType: 'APY',
      availability: 'available',
    });
    const { dispatcher, session } = setup({ host });
    enableStakingOffer(session);
    const call = stakingOfferCall(session);
    call.arguments = { schemaVersion: 1, productId: 'ethena', asset: usde };

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'success',
      result: { result: { status: 'available', productId: 'ethena', asset: usde, annualYield: '8.25' } },
    });
  });

  it.each([
    ['product_not_found', { productId: 'unknown-product' }],
    ['asset_mismatch', { asset: { slug: 'usdton', chain: 'ton', symbol: 'USDT', decimals: 6 } }],
  ] as const)('returns typed %s for an offer selector mismatch', async (reason, argumentsOverride) => {
    const { dispatcher, session } = setup();
    enableStakingOffer(session);
    const call = stakingOfferCall(session);
    call.arguments = { ...call.arguments, ...argumentsOverride };

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'success',
      result: { result: { status: 'unavailable', reason, readAt: NOW } },
    });
  });

  it('reads the current yield but preserves disabled deposit availability', async () => {
    const host = hostContext();
    host.stakingOffers![0].availability = 'disabled';
    const { dispatcher, session } = setup({ host });
    enableStakingOffer(session);

    await expect(dispatcher.execute(stakingOfferCall(session), execution())).resolves.toMatchObject({
      status: 'success',
      result: {
        result: {
          status: 'available',
          productId: 'liquid',
          annualYield: '14.09',
          depositAvailability: 'disabled',
          readAt: NOW,
        },
      },
    });
  });

  it('reads the current staking policy after a background offer refresh', async () => {
    const { dispatcher, host, session } = setup();
    enableStakingOffer(session);
    const call = stakingOfferCall(session);
    session.update({
      ...host,
      stakingOffers: [{ ...host.stakingOffers![0], annualYield: '15' }],
    });

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'success',
      result: { result: { status: 'available', annualYield: '15' } },
    });
  });

  it.each(['classic', 'ios'] as const)(
    'prepares and resolves a source-sided Swap through the exact tool/action binding on %s',
    async (platform) => {
      const host = swapHostContext();
      host.platform = platform;
      host.client = platform === 'classic' ? 'web' : 'native';
      const { dispatcher, session } = setup({ host });
      const call = swapPrepareCall(session, {
        sourceQuery: 'TON',
        destinationQuery: 'USDT',
        destinationChain: 'ton',
        amount: '10',
        amountSide: 'source',
      });

      const response = await dispatcher.execute(call, execution());

      expect(response).toMatchObject({
        status: 'success',
        toolName: 'action.swap.prepare',
        result: {
          freshness: { asOf: NOW, source: 'store', isStale: false },
          redaction: { level: 'minimal', omittedFields: [], maxResultBytes: 16_384 },
          result: {
            schemaVersion: 1,
            status: 'ready',
            sourceAsset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
            destinationAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
            amount: { value: '10', valueType: 'decimal', side: 'source' },
            quote: {
              status: 'resolved',
              kind: 'indicative_spot',
              from: { value: '10', slug: 'toncoin' },
              to: { value: '25', slug: 'usdton' },
              observedAt: NOW,
            },
          },
        },
      });
      if (response.status !== 'success' || response.toolName !== 'action.swap.prepare'
        || response.result.result.status !== 'ready') throw new Error('Expected a prepared Swap');
      const action = swapAction(session, call, response.result.result);
      await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);

      expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({
        kind: 'openSwap',
        tokenInSlug: 'toncoin',
        tokenOutSlug: 'usdton',
        amount: '10',
        amountSide: 'source',
      });
      expect(dispatcher.resolveAction(OTHER_THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
    },
  );

  it('keeps Swap preparation actionable when a local price is unavailable', async () => {
    const host = swapHostContext();
    delete host.swapAssetCatalog![1].priceUsd;
    const { dispatcher, session } = setup({ host });
    const call = swapPrepareCall(session, {
      sourceQuery: 'TON',
      destinationQuery: 'USDT',
      destinationChain: 'ton',
      amount: '10',
      amountSide: 'destination',
    });

    const response = await dispatcher.execute(call, execution());

    expect(response).toMatchObject({
      status: 'success',
      result: { result: {
        status: 'ready',
        quote: { status: 'unavailable', reason: 'price_unavailable', observedAt: NOW },
      } },
    });
    if (response.status !== 'success' || response.toolName !== 'action.swap.prepare'
      || response.result.result.status !== 'ready') throw new Error('Expected a prepared Swap');
    const action = swapAction(session, call, response.result.result);
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'openSwap', amount: '10', amountSide: 'destination',
    });
  });

  it('returns bounded Swap ambiguity and same-asset outcomes without retaining an action', async () => {
    const host = swapHostContext();
    host.swapAssetCatalog!.push({
      slug: 'trx-usdt', chain: 'tron', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: '1',
    });
    const { dispatcher, session } = setup({ host });
    const ambiguousCall = swapPrepareCall(session, {
      sourceQuery: 'TON', destinationQuery: 'USDT', amount: '1', amountSide: 'source',
    });
    const sameAssetCall = swapPrepareCall(session, {
      sourceQuery: 'TON', destinationQuery: 'TON', amount: '1', amountSide: 'source',
    });

    await expect(dispatcher.execute(ambiguousCall, execution())).resolves.toMatchObject({
      status: 'success',
      result: { result: {
        status: 'asset_ambiguous',
        side: 'destination',
        candidates: [
          expect.objectContaining({ slug: 'usdton', chain: 'ton' }),
          expect.objectContaining({ slug: 'trx-usdt', chain: 'tron' }),
        ],
        hasMore: false,
      } },
    });
    await expect(dispatcher.execute(sameAssetCall, execution())).resolves.toMatchObject({
      status: 'success',
      result: { result: { status: 'same_asset', asset: { slug: 'toncoin', chain: 'ton' } } },
    });
  });

  it('revalidates live and persisted Swap actions against current wallet authority', async () => {
    const { dispatcher, session } = setup({ host: swapHostContext() });
    const call = swapPrepareCall(session, {
      sourceQuery: 'USDT',
      sourceChain: 'ton',
      destinationQuery: 'TON',
      amount: '10',
      amountSide: 'destination',
    });
    const response = await dispatcher.execute(call, execution());
    if (response.status !== 'success' || response.toolName !== 'action.swap.prepare'
      || response.result.result.status !== 'ready') throw new Error('Expected a prepared Swap');
    const action = swapAction(session, call, response.result.result);
    const persisted = persistedSwapAction(action);
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);

    expect(dispatcher.resolvePersistedAction(THREAD_ID, MESSAGE_ID, persisted)).toMatchObject({
      kind: 'openSwap', tokenInSlug: 'usdton', tokenOutSlug: 'toncoin', amountSide: 'destination',
    });
    const host = session.snapshot().host!;
    const refreshedPrices = {
      ...host,
      swapAssetCatalog: host.swapAssetCatalog!.map((asset) => ({ ...asset, priceUsd: '4' })),
    };
    expect(session.update(refreshedPrices)).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: false,
    });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'openSwap', tokenInSlug: 'usdton', tokenOutSlug: 'toncoin', amountSide: 'destination',
    });
    expect(dispatcher.resolvePersistedAction(THREAD_ID, MESSAGE_ID, persisted)).toMatchObject({
      kind: 'openSwap', tokenInSlug: 'usdton', tokenOutSlug: 'toncoin', amountSide: 'destination',
    });
    const expandedCatalog = {
      ...refreshedPrices,
      swapAssetCatalog: [...refreshedPrices.swapAssetCatalog, {
        slug: 'gram', chain: 'ton', symbol: 'GRAM', decimals: 9, priceUsd: '1',
      }],
    };
    expect(session.update(expandedCatalog)).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: true,
    });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'openSwap', tokenInSlug: 'usdton', tokenOutSlug: 'toncoin', amountSide: 'destination',
    });
    expect(dispatcher.resolvePersistedAction(THREAD_ID, MESSAGE_ID, persisted)).toMatchObject({
      kind: 'openSwap', tokenInSlug: 'usdton', tokenOutSlug: 'toncoin', amountSide: 'destination',
    });
    session.update({ ...expandedCatalog, swapAssetCatalog: expandedCatalog.swapAssetCatalog.slice(0, 1) });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
    expect(dispatcher.resolvePersistedAction(THREAD_ID, MESSAGE_ID, persisted)).toEqual({ kind: 'inactive' });
  });

  it.each(getQueryVariants())('executes the exact $operation V5 variant', async ({ args, expected, operation }) => {
    const { dispatcher, session } = setup();
    const call = queryCall(session, args);

    const response = await dispatcher.execute(call, execution());

    expect(response).toMatchObject({
      protocolVersion: 2,
      runId: RUN_ID,
      threadId: THREAD_ID,
      toolCallId: TOOL_CALL_ID,
      toolName: 'wallet.data.query',
      status: 'success',
      result: {
        schemaVersion: 1,
        freshness: { asOf: NOW, source: 'store', isStale: false },
        redaction: {
          level: 'scoped',
          omittedFields: ['rawAccountId', 'fullTransactionHash'],
          maxResultBytes: MAX_RESULT_BYTES,
        },
        result: {
          schemaVersion: 5,
          operation,
          status: 'resolved',
          ...expected,
        },
      },
    });
    if (operation === 'transactions.detail') {
      expect(JSON.stringify(response)).not.toContain(FULL_TRANSACTION_HASH);
    }
  });

  it('checks consent on every direct execution', async () => {
    let isConsentAccepted = true;
    const getConsent = jest.fn(() => Promise.resolve(isConsentAccepted));
    const { dispatcher, session } = setup({ getConsent });
    const call = queryCall(session, assetsSearchArgs('TON'));

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({ status: 'success' });
    isConsentAccepted = false;
    const denied = await dispatcher.execute(call, execution());

    expect(denied).toMatchObject({
      status: 'rejected',
      error: { code: 'consent_required', retryable: false },
    });
    expect(denied).not.toHaveProperty('result');
  });

  it('executes repeated direct calls independently because runtime owns replay', async () => {
    const ids = [RESULT_ID, SECOND_RESULT_ID];
    const randomUuid = jest.fn(() => ids.shift()!);
    const { dispatcher, session } = setup({ randomUuid });
    const call = queryCall(session, assetsSearchArgs('TON'));

    const first = await dispatcher.execute(call, execution());
    const second = await dispatcher.execute(call, execution());

    expect(first).toMatchObject({ status: 'success', clientToolResultId: RESULT_ID });
    expect(second).toMatchObject({ status: 'success', clientToolResultId: SECOND_RESULT_ID });
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it.each([1, 2, 3, 4])('rejects legacy wallet.data.query@%i', async (version) => {
    const { dispatcher, session } = setup();
    const call = {
      ...queryCall(session, assetsSearchArgs('TON')),
      version,
    } as unknown as AgentToolCall;

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'rejected',
      error: { code: 'tool_unsupported', retryable: false },
    });
  });

  it.each([
    'asset.search',
    'wallet.accounts.list',
    'wallet.balances.list',
    'wallet.transactions.list',
    'portfolio.snapshot',
    'addressBook.resolve',
  ])('rejects the removed %s tool name', async (name) => {
    const { dispatcher, session } = setup();
    const call = {
      ...queryCall(session, assetsSearchArgs('TON')),
      name,
    } as unknown as AgentToolCall;

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'rejected',
      error: { code: 'tool_unsupported', retryable: false },
    });
  });

  it.each([
    {},
    { schemaVersion: 4, operation: 'assets.search', query: 'TON', chains: [], pageSize: 10 },
    {
      schemaVersion: 5,
      semanticFrame: { operation: 'transactions.list' },
      accountSelector: { kind: 'current' },
      reads: [],
    },
  ])('rejects malformed or legacy V5 arguments before materialization', async (argumentsValue) => {
    const fetchPastActivities = jest.fn(defaultFetchPastActivities);
    const { dispatcher, session } = setup({ fetchPastActivities });
    const call = {
      ...queryCall(session, assetsSearchArgs('TON')),
      arguments: argumentsValue,
    } as unknown as AgentToolCall;

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'rejected',
      error: { code: 'validation_failed', retryable: false },
    });
    expect(fetchPastActivities).not.toHaveBeenCalled();
  });

  it.each([
    'b'.repeat(16),
    `${'b'.repeat(12)}…${'b'.repeat(12)}`,
  ])('rejects a shortened or ellipsized transaction detail hash', async (hash) => {
    const fetchPastActivities = jest.fn(defaultFetchPastActivities);
    const { dispatcher, session } = setup({ fetchPastActivities });
    const call = queryCall(session, transactionDetailArgs(hash));

    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({
      status: 'rejected',
      error: { code: 'validation_failed', retryable: false },
    });
    expect(fetchPastActivities).not.toHaveBeenCalled();
  });

  it('returns scope anchors in scope-required choices without declaring them redacted', async () => {
    const host = hostContext();
    host.accounts[1].label = 'Duplicate';
    host.accounts.push(secondaryAccount('account-three', 'Duplicate'));
    const scopeStore = createScopeStore();
    const { dispatcher, session } = setup({ host, scopeStore });
    const call = queryCall(session, {
      ...positionsListArgs(),
      accountSelector: { kind: 'named', label: 'Duplicate' },
    });

    const result = await dispatcher.execute(call, execution());

    expect(result).toMatchObject({
      status: 'success',
      toolName: 'wallet.data.query',
      result: {
        redaction: { omittedFields: expect.not.arrayContaining(['scopeAnchor']) },
        result: {
          schemaVersion: 5,
          operation: 'positions.list',
          status: 'scope_resolution_required',
          reason: 'ambiguous',
          choices: [
            expect.objectContaining({ label: 'Duplicate', scopeAnchor: expect.stringMatching(/^scope_/u) }),
            expect.objectContaining({ label: 'Duplicate', scopeAnchor: expect.stringMatching(/^scope_/u) }),
          ],
        },
      },
    });
    if (result.status !== 'success' || result.toolName !== 'wallet.data.query') {
      throw new Error('Expected a wallet query result');
    }
    expect(result.result.redaction.omittedFields).not.toContain('scopeAnchor');
    expect(scopeStore.issue).toHaveBeenCalledTimes(2);
  });

  it('binds a spam action to the exact source call and asset ref after execution', async () => {
    const { dispatcher, session } = setup();
    const call = queryCall(session, {
      ...positionsListArgs(),
      riskMode: 'all',
    });
    const result = await dispatcher.execute(call, execution());
    if (result.status !== 'success' || result.toolName !== 'wallet.data.query') {
      throw new Error('Expected a wallet query result');
    }
    const queryResult = result.result.result;
    if (queryResult.operation !== 'positions.list' || queryResult.status !== 'resolved') {
      throw new Error('Expected resolved positions');
    }
    const assetRef = queryResult.positions.find(({ riskVerdict }) => riskVerdict === 'spam')?.assetRef;
    if (!assetRef) throw new Error('Expected an opaque spam asset ref');
    const snapshot = session.snapshot();
    const action: Extract<AgentActionProposal, { kind: 'hideSpamAssets' }> = {
      id: ACTION_ID,
      kind: 'hideSpamAssets',
      labelCode: 'hide_spam_assets',
      sourceToolCallId: call.id,
      assetRefs: [assetRef],
      contextBinding: {
        sessionId: snapshot.sessionId,
        revision: snapshot.revision,
        activeAccountRef: call.walletContextSession.activeAccountRef,
      },
      effect: 'hide_spam_assets',
      localMutationRequired: true,
      requiresConfirmation: false,
    };
    const wrongSource = { ...action, id: SEND_ACTION_ID, sourceToolCallId: OTHER_TOOL_CALL_ID };

    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, wrongSource);
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, wrongSource)).toEqual({ kind: 'inactive' });
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);

    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({
      kind: 'hideSpamAssets',
      slugs: ['spam-token'],
    });
    expect(dispatcher.resolveAction(OTHER_THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, {
      ...action,
      assetRefs: ['asset_wrong'],
    })).toEqual({ kind: 'inactive' });
  });

  it('prepares, presents, and resolves a Send only through the exact checked action binding', async () => {
    const checker = jest.fn(() => Promise.resolve({
      resolvedAddress: 'EQ-resolved-recipient',
      isToAddressNew: true,
    }));
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({
      checkTransactionDraft: checker,
      randomUuid: () => ids.shift()!,
    });
    const call = sendPrepareCall(session);
    const context = execution();

    const result = await dispatcher.execute(call, context);

    expect(checker).toHaveBeenCalledWith('ton', {
      accountId: 'account-main',
      toAddress: 'EQ-user-recipient',
      amount: 1_250_000_000n,
      payload: { type: 'comment', text: 'hello', shouldEncrypt: false },
    }, context.signal);
    expect(JSON.stringify(result)).not.toContain('EQ-user-recipient');
    expect(result).toMatchObject({
      status: 'success',
      toolName: 'action.send.prepare',
      result: {
        result: {
          draftId: DRAFT_ID,
          action: {
            id: SEND_ACTION_ID,
            kind: 'send',
            sourceToolCallId: call.id,
            requiresConfirmation: true,
          },
          summary: {
            primaryAmount: { value: '1.25', symbol: 'TON' },
            destination: { kind: 'external', disclosure: 'hidden' },
            sendWarnings: [{ code: 'new_address', disposition: 'review' }],
          },
        },
      },
    });
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);

    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'send',
      status: 'active',
      amount: { value: '1.25', symbol: 'TON' },
      recipient: { kind: 'external' },
      warningCodes: ['new_address'],
    });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({
      kind: 'reviewSend',
      draftId: DRAFT_ID,
      chain: 'ton',
      review: {
        tokenSlug: 'toncoin',
        amountAtomic: '1250000000',
        toAddress: 'EQ-resolved-recipient',
        comment: 'hello',
      },
    });
    expect(dispatcher.resolveAction(THREAD_ID, 'wrong-message', action)).toEqual({ kind: 'inactive' });

    const host = session.snapshot().host!;
    session.update({
      ...host,
      accounts: host.accounts.map((account, index) => (
        index === 1 ? { ...account, label: 'Drifted Savings' } : account
      )),
    });
    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'send',
      status: 'active',
    });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend',
      draftId: DRAFT_ID,
    });

    session.update({
      ...session.snapshot().host!,
      activeAccountId: 'account-savings',
    });
    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
  });

  it('scrubs an address-bearing active account label from Send output', async () => {
    const host = hostContext();
    const rawAddress = `0x${'12'.repeat(20)}`;
    host.accounts[0].label = `Main ${rawAddress}`;
    host.accounts[0].addresses.ethereum = rawAddress;
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({ host, randomUuid: () => ids.shift()! });
    const call = sendPrepareCall(session);

    const result = await dispatcher.execute(call, execution());

    expect(JSON.stringify(result)).not.toContain(rawAddress);
    expect(result).toMatchObject({
      status: 'success',
      toolName: 'action.send.prepare',
      result: { result: { summary: { account: { label: 'Wallet' } } } },
    });
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'send', accountLabel: 'Wallet',
    });
  });

  it('retains prepared Send through profile updates and clears it after active sender changes', async () => {
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({ randomUuid: () => ids.shift()! });
    const result = await dispatcher.execute(sendPrepareCall(session), execution());
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    const host = session.snapshot().host!;

    session.update({
      ...host,
      accounts: host.accounts.map((account, index) => (
        index === 1 ? { ...account, label: 'Renamed Savings' } : account
      )),
    });
    dispatcher.clear(undefined, { shouldRetainRevalidatedActions: true });

    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend', draftId: DRAFT_ID,
    });

    const currentHost = session.snapshot().host!;
    session.update({
      ...currentHost,
      accounts: currentHost.accounts.map((account, index) => (
        index === 0 ? { ...account, addresses: { ton: 'EQ-changed-sender' } } : account
      )),
    });
    dispatcher.clear(undefined, { shouldRetainRevalidatedActions: true });

    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
  });

  it('restores only an unexpired Send draft with matching sender authority', async () => {
    let now = NOW_MS;
    const sendDraftStore = new MemorySendDraftStore();
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({
      sendDraftStore,
      now: () => now,
      randomUuid: () => ids.shift()!,
    });
    const result = await dispatcher.execute(sendPrepareCall(session), execution());
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);

    const restored = new AgentV2WalletToolDispatcher({
      session,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    const storedDraft = await sendDraftStore.get(DRAFT_ID);
    expect(storedDraft).toMatchObject({
      threadId: THREAD_ID,
      assistantMessageId: MESSAGE_ID,
      actionId: action.id,
      sourceToolCallId: action.sourceToolCallId,
      expiresAt: Date.parse(action.draftExpiresAt),
      authorityBinding: JSON.stringify({
        accountId: 'account-main',
        accountType: 'regular',
        network: 'ton',
        address: 'EQ-main-private-address',
        chains: ['ton'],
      }),
    });
    await restored.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(restored.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend', draftId: DRAFT_ID, chain: 'ton',
    });

    const reloadedSession = new AgentV2WalletSession();
    await reloadedSession.reset();
    reloadedSession.update(hostContext());
    const restoredAfterRuntimeRestart = new AgentV2WalletToolDispatcher({
      session: reloadedSession,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    await restoredAfterRuntimeRestart.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(restoredAfterRuntimeRestart.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend', draftId: DRAFT_ID, chain: 'ton',
    });

    const hostWithUpdatedSwapCatalog = {
      ...session.snapshot().host!,
      swapAssetCatalog: [{
        slug: 'toncoin',
        symbol: 'TON',
        chain: 'ton' as const,
        decimals: 9,
      }],
    };
    session.update(hostWithUpdatedSwapCatalog);
    const restoredAfterUnrelatedRevision = new AgentV2WalletToolDispatcher({
      session,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    await restoredAfterUnrelatedRevision.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(restoredAfterUnrelatedRevision.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend', draftId: DRAFT_ID, chain: 'ton',
    });

    const host = session.snapshot().host!;
    session.update({
      ...host,
      accounts: host.accounts.map((account, index) => (
        index === 1 ? { ...account, label: 'Drifted Savings' } : account
      )),
    });
    const drifted = new AgentV2WalletToolDispatcher({
      session,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    await drifted.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(drifted.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'reviewSend', draftId: DRAFT_ID,
    });

    const profileUpdatedHost = session.snapshot().host!;
    session.update({
      ...profileUpdatedHost,
      accounts: profileUpdatedHost.accounts.map((account, index) => (
        index === 0 ? { ...account, addresses: { ton: 'EQ-changed-sender' } } : account
      )),
    });
    const senderChanged = new AgentV2WalletToolDispatcher({
      session,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    await senderChanged.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(senderChanged.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });

    now = Date.parse(action.draftExpiresAt);
    const expired = new AgentV2WalletToolDispatcher({
      session,
      sendDraftStore,
      now: () => now,
      getConsent: () => Promise.resolve(true),
    });
    await expired.hydrateAction(THREAD_ID, MESSAGE_ID, action);
    expect(expired.resolvePersistedAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
  });

  it('deletes a late persisted Send binding after wallet authority changes', async () => {
    const sendDraftStore = new DelayedBindingSendDraftStore();
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({
      sendDraftStore,
      randomUuid: () => ids.shift()!,
    });
    const result = await dispatcher.execute(sendPrepareCall(session), execution());
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;

    const registration = dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    await sendDraftStore.bindingStarted;
    const host = session.snapshot().host!;
    session.update({
      ...host,
      accounts: host.accounts.map((account, index) => (
        index === 0 ? { ...account, addresses: { ton: 'EQ-changed-sender' } } : account
      )),
    });
    sendDraftStore.finishBinding();
    await registration;

    await expect(sendDraftStore.get(DRAFT_ID)).resolves.toBeUndefined();
    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({ kind: 'inactive' });
  });

  it('scrubs an identifier-shaped asset symbol from Send output', async () => {
    const host = hostContext();
    const sensitiveSymbol = 'A'.repeat(32);
    host.accounts[0].holdings[0].asset.symbol = sensitiveSymbol;
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({ host, randomUuid: () => ids.shift()! });
    const call = sendPrepareCall(session);

    const result = await dispatcher.execute(call, execution());

    expect(JSON.stringify(result)).not.toContain(sensitiveSymbol);
    expect(result).toMatchObject({
      status: 'success',
      toolName: 'action.send.prepare',
      result: { result: { summary: { primaryAmount: { symbol: 'Asset' } } } },
    });
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'send', amount: { value: '1.25', symbol: 'Asset' },
    });
  });

  it('scrubs an address-bearing saved contact label from Send output', async () => {
    const host = hostContext();
    const rawAddress = `0x${'34'.repeat(20)}`;
    host.accounts[0].savedAddresses![0] = {
      id: 'alice', name: `Alice ${rawAddress}`, chain: 'ton', address: rawAddress,
    };
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({ host, randomUuid: () => ids.shift()! });
    const addressRef = session.resolveSavedAddressRefs('account-main', 'alice')!.addressRef;
    const call = sendPrepareCall(session);
    call.arguments = {
      ...call.arguments as import('./protocol/types').ActionSendPrepareArgs,
      recipient: { kind: 'savedAddress', addressRef },
    };
    const context = execution();

    const result = await dispatcher.execute(call, context);

    expect(JSON.stringify(result)).not.toContain(rawAddress);
    expect(result).toMatchObject({
      status: 'success',
      toolName: 'action.send.prepare',
      result: {
        result: {
          summary: { destination: { kind: 'savedAddress', label: expect.stringMatching(/[·…]/u) } },
        },
      },
    });
    if (result.status !== 'success' || result.toolName !== 'action.send.prepare') {
      throw new Error('Expected a prepared Send');
    }
    const { action } = result.result.result;
    await dispatcher.registerAction(THREAD_ID, MESSAGE_ID, action);
    expect(dispatcher.getActionPresentation(THREAD_ID, MESSAGE_ID, action)).toMatchObject({
      kind: 'send', recipient: { kind: 'savedAddress', label: expect.stringMatching(/[·…]/u) },
    });
  });

  it('prepares a Send to another own wallet through its opaque address reference', async () => {
    const checker = jest.fn(() => Promise.resolve({ resolvedAddress: 'EQ-resolved-recipient' }));
    const ids = [RESULT_ID, DRAFT_ID, SEND_ACTION_ID];
    const { dispatcher, session } = setup({
      checkTransactionDraft: checker,
      randomUuid: () => ids.shift()!,
    });
    const addressRef = session.resolveWalletAddressRefs('account-savings', 'ton')!.addressRef;
    const call = sendPrepareCall(session);
    call.arguments = {
      ...call.arguments as import('./protocol/types').ActionSendPrepareArgs,
      recipient: { kind: 'savedAddress', addressRef },
    };
    const context = execution();

    const result = await dispatcher.execute(call, context);

    expect(checker).toHaveBeenCalledWith('ton', expect.objectContaining({
      accountId: 'account-main',
      toAddress: 'EQ-account-savings-private-address',
    }), context.signal);
    expect(JSON.stringify(result)).not.toContain('EQ-account-savings-private-address');
    expect(result).toMatchObject({
      status: 'success',
      toolName: 'action.send.prepare',
      result: {
        result: {
          summary: { destination: { kind: 'savedAddress', label: 'Savings' } },
        },
      },
    });
  });

  it('resolves a live Send-form action through an opaque saved address reference', () => {
    const { dispatcher, session } = setup();
    const snapshot = session.snapshot();
    const addressRef = session.resolveWalletAddressRefs('account-savings', 'ton')!.addressRef;
    const action: Extract<AgentActionProposal, { kind: 'send'; effect: 'open_send' }> = {
      id: SEND_ACTION_ID,
      kind: 'send',
      labelCode: 'open_send',
      effect: 'open_send',
      contextBinding: {
        sessionId: snapshot.sessionId,
        revision: snapshot.revision,
        activeAccountRef: snapshot.accountRefs.get('account-main')!,
        activeNetwork: 'ton',
      },
      asset: { slug: 'toncoin', chain: 'ton' },
      recipient: { kind: 'savedAddress', addressRef },
      localDraftRequired: false,
      requiresConfirmation: false,
    };

    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({
      kind: 'sendForm',
      tokenSlug: 'toncoin',
      toAddress: 'EQ-account-savings-private-address',
    });
    expect(JSON.stringify(action)).not.toContain('EQ-account-savings-private-address');
  });

  it.each([
    [{ kind: 'address', chain: 'ton', address: 'EQ-user-authored-address' }, 'EQ-user-authored-address'],
    [{ kind: 'domain', chain: 'ton', domain: 'mother.ton' }, 'mother.ton'],
  ] as const)('resolves a live Send-form action with a direct recipient', (recipient, toAddress) => {
    const { dispatcher, session } = setup();
    const snapshot = session.snapshot();
    const action: Extract<AgentActionProposal, { kind: 'send'; effect: 'open_send' }> = {
      id: SEND_ACTION_ID,
      kind: 'send',
      labelCode: 'open_send',
      effect: 'open_send',
      contextBinding: {
        sessionId: snapshot.sessionId,
        revision: snapshot.revision,
        activeAccountRef: snapshot.accountRefs.get('account-main')!,
        activeNetwork: 'ton',
      },
      asset: { slug: 'toncoin', chain: 'ton' },
      recipient,
      localDraftRequired: false,
      requiresConfirmation: false,
    };

    expect(dispatcher.resolveAction(THREAD_ID, MESSAGE_ID, action)).toEqual({
      kind: 'sendForm',
      tokenSlug: 'toncoin',
      toAddress,
    });
  });

  it('rejects Send preparation when wallet authority drifts during the checker call', async () => {
    const host = hostContext();
    const checker = jest.fn(() => {
      host.accounts[1].label = 'Changed during check';
      return Promise.resolve({ resolvedAddress: 'EQ-resolved-recipient' });
    });
    const { dispatcher, session } = setup({ host, checkTransactionDraft: checker });
    const call = sendPrepareCall(session);
    const before = session.snapshot();

    const result = await dispatcher.execute(call, execution());
    const after = session.snapshot();

    expect(checker).toHaveBeenCalledTimes(1);
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.revision).toBe(before.revision);
    expect(result).toMatchObject({
      status: 'rejected',
      error: { code: 'wallet_context_changed', retryable: false },
    });
    expect(result).not.toHaveProperty('result');
  });

  it('fits a large query response to the exact 98,304-byte contract budget', async () => {
    const { dispatcher, session } = setup({ host: largeHostContext() });
    const call = queryCall(session, {
      ...positionsListArgs(),
      positionKinds: ['nft'],
      riskMode: 'all',
    });

    const result = await dispatcher.execute(call, execution());

    expect(result.status).toBe('success');
    expect(serializedByteLength(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    if (result.status !== 'success' || result.toolName !== 'wallet.data.query') {
      throw new Error('Expected a fitted wallet query result');
    }
    const queryResult = result.result.result;
    if (queryResult.operation !== 'positions.list' || queryResult.status !== 'resolved') {
      throw new Error('Expected resolved positions');
    }
    expect(result.result.redaction.maxResultBytes).toBe(MAX_RESULT_BYTES);
    expect(queryResult.positions.length).toBeLessThan(100);
    expect(queryResult.coverage).toMatchObject({
      status: 'partial',
      rowsOmitted: expect.any(Number),
      limitations: expect.arrayContaining(['row_limit']),
    });
  });

  it('returns result_too_large without a payload when even the minimal result exceeds a small budget', async () => {
    const { dispatcher, session } = setup();
    const call = queryCall(session, positionsListArgs());
    call.maxResultBytes = 512;

    const result = await dispatcher.execute(call, execution());

    expect(result).toMatchObject({
      status: 'rejected',
      error: { code: 'result_too_large', retryable: false },
    });
    expect(result).not.toHaveProperty('result');
    expect(JSON.stringify(result)).not.toContain('EQ-main-private-address');
  });

  it('logs only safe metadata when a provider throws', async () => {
    const secret = 'provider-secret-EQ-private-wallet-address';
    const initialLogCount = getLogs().length;
    const { dispatcher, session } = setup({
      checkTransactionDraft: () => Promise.reject(new Error(secret)),
    });
    const call = sendPrepareCall(session);

    const result = await dispatcher.execute(call, execution());
    const newLogs = getLogs().slice(initialLogCount);

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'tool_failed', retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(newLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'AgentV2 wallet tool execution',
        args: [expect.stringContaining('"stage":"failed"')],
      }),
    ]));
    expect(JSON.stringify(newLogs)).not.toContain(secret);
  });

  it('classifies send-preparation transport failures as retryable', async () => {
    const { dispatcher, session } = setup({
      checkTransactionDraft: () => Promise.reject(new TypeError('fetch failed')),
    });

    const result = await dispatcher.execute(sendPrepareCall(session), execution());

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'offline_prepare_unavailable', retryable: true },
    });
  });

  it('propagates the runtime signal through wallet query and returns abort as cancelled', async () => {
    let markStarted!: () => void;
    let sourceSignal: AbortSignal | undefined;
    let isFirstCall = true;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchPastActivities = jest.fn((
      _accountId: string,
      _limit: number,
      _tokenSlug?: string,
      _toTimestamp?: number,
      options?: { signal?: AbortSignal; shouldThrowOnError?: boolean },
    ): Promise<{ activities: ApiActivity[]; hasMore: boolean } | undefined> => {
      sourceSignal = options?.signal;
      if (isFirstCall) {
        isFirstCall = false;
        markStarted();
        return new Promise(() => undefined);
      }
      return Promise.resolve({ activities: [], hasMore: false });
    });
    const { dispatcher, session } = setup({ fetchPastActivities });
    const call = queryCall(session, transactionsListArgs());
    const controller = new AbortController();
    const context = { ...execution(), signal: controller.signal };
    const first = dispatcher.execute(call, context);
    await started;

    expect(sourceSignal).toBe(controller.signal);
    controller.abort(new Error('parent stopped'));

    await expect(first).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'tool_failed', retryable: true },
    });
    await expect(dispatcher.execute(call, execution())).resolves.toMatchObject({ status: 'success' });
    expect(fetchPastActivities).toHaveBeenCalledTimes(2);
  });

  it('bounds all wallet-tool retained records under one 128-entry quota', () => {
    const { dispatcher } = setup();
    const retainedState = (dispatcher as unknown as {
      retainedState: { set: (namespace: string, key: string, value: unknown) => number; size: number };
    }).retainedState;

    for (let index = 0; index < 129; index++) {
      retainedState.set(index % 2 ? 'spamSnapshot' : 'spamAction', String(index), { index });
    }

    expect(retainedState.size).toBe(128);
  });
});

function setup(options: SetupOptions = {}) {
  const session = new AgentV2WalletSession();
  const host = options.host ?? hostContext();
  session.update(host);
  enableWalletQuery(session);
  const dispatcher = new AgentV2WalletToolDispatcher({
    session,
    getConsent: options.getConsent ?? (() => Promise.resolve(true)),
    randomUuid: options.randomUuid ?? (() => RESULT_ID),
    now: options.now ?? (() => NOW_MS),
    checkTransactionDraft: options.checkTransactionDraft ?? defaultCheckTransactionDraft,
    fetchPortfolioHistory: options.fetchPortfolioHistory ?? defaultFetchPortfolioHistory,
    onPortfolioHistory: options.onPortfolioHistory,
    fetchPastActivities: options.fetchPastActivities ?? defaultFetchPastActivities,
    fetchActivityDetails: options.fetchActivityDetails ?? defaultFetchActivityDetails,
    getTokenBySlug: options.getTokenBySlug,
    getStakingCatalog: options.getStakingCatalog,
    refreshWalletHoldings: options.refreshWalletHoldings,
    scopeStore: options.scopeStore ?? createScopeStore(),
    sendDraftStore: options.sendDraftStore,
  });
  return { dispatcher, host, session };
}

function directoryCall(session: AgentV2WalletSession): AgentToolCall {
  const snapshot = session.snapshot();
  const active = snapshot.host!.accounts.find(({ accountId }) => accountId === snapshot.host!.activeAccountId)!;
  const activeAccountRef = snapshot.accountRefs.get(active.accountId)!;
  return {
    id: TOOL_CALL_ID,
    name: 'wallet.directory.query',
    version: 1,
    arguments: { schemaVersion: 1, purpose: 'send_wallet_resolution' },
    scopes: ['wallet.directory.read'],
    timeoutMs: 30_000,
    maxResultBytes: 32_768,
    directorySession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      activeAccountRef,
    },
    directoryGrant: {
      schemaVersion: 1,
      kind: 'send_wallet_resolution',
      sourceCapabilityId: 'wallet.send-prepare',
      messageId: MESSAGE_ID,
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

function enableWalletQuery(session: AgentV2WalletSession) {
  session.updateFeatureCapabilities('available', 'available');
  session.updateWalletQueryCapabilities({
    status: 'available',
    supportedToolVersions: [5],
    filterCatalog: {
      version: 1,
      digest: contractManifest.walletFilterCatalogSha256,
      requiresClientTimeZone: true,
    },
  });
}

function enableStakingOffer(session: AgentV2WalletSession) {
  session.updateFeatureCapabilities('available', 'available', 'available');
}

function enableStakingCatalog(session: AgentV2WalletSession) {
  session.updateFeatureCapabilities('available', 'available', undefined, 'available');
}

function execution(threadId = THREAD_ID) {
  return {
    deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    messageId: MESSAGE_ID,
    runId: RUN_ID,
    threadId,
    signal: new AbortController().signal,
  };
}

class MemorySendDraftStore implements AgentV2SendDraftStore {
  protected readonly drafts = new Map<string, AgentV2StoredSendDraft>();

  clear() {
    this.drafts.clear();
    return Promise.resolve();
  }

  delete(draftId: string) {
    this.drafts.delete(draftId);
    return Promise.resolve();
  }

  get(draftId: string) {
    return Promise.resolve(this.drafts.get(draftId));
  }

  put(draft: AgentV2StoredSendDraft) {
    this.drafts.set(draft.draftId, JSON.parse(JSON.stringify(draft)) as AgentV2StoredSendDraft);
    return Promise.resolve();
  }
}

class DelayedBindingSendDraftStore extends MemorySendDraftStore {
  private resolveBinding!: () => void;
  private markBindingStarted!: () => void;
  readonly bindingStarted = new Promise<void>((resolve) => {
    this.markBindingStarted = resolve;
  });

  private readonly bindingPending = new Promise<void>((resolve) => {
    this.resolveBinding = resolve;
  });

  override put(draft: AgentV2StoredSendDraft) {
    if (!draft.assistantMessageId) return super.put(draft);
    this.markBindingStarted();
    return this.bindingPending.then(() => super.put(draft));
  }

  finishBinding() {
    this.resolveBinding();
  }
}

function queryCall(
  session: AgentV2WalletSession,
  args: AgentWalletDataQueryArgsV5,
): Extract<AgentToolCall, { name: 'wallet.data.query' }> {
  const snapshot = session.snapshot();
  const activeAccount = snapshot.host!.accounts.find(({ accountId }) => (
    accountId === snapshot.host!.activeAccountId
  ))!;
  const accountScope = getQueryAccountScope(args);
  return {
    id: TOOL_CALL_ID,
    name: 'wallet.data.query',
    version: 5,
    arguments: args,
    scopes: ['wallet.data.read'],
    timeoutMs: 30_000,
    maxResultBytes: MAX_RESULT_BYTES,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope,
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: snapshot.host!.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
    ...(accountScope === 'current' ? {} : {
      scopeIntent: {
        messageId: MESSAGE_ID,
        reason: accountScope === 'explicitAll'
          ? 'explicit_all_wallet_query' as const
          : 'selected_wallet_query' as const,
      },
    }),
  };
}

function sendPrepareCall(session: AgentV2WalletSession): AgentToolCall {
  const snapshot = session.snapshot();
  const activeAccount = snapshot.host!.accounts.find(({ accountId }) => (
    accountId === snapshot.host!.activeAccountId
  ))!;
  return {
    id: TOOL_CALL_ID,
    name: 'action.send.prepare',
    version: 1,
    arguments: {
      asset: { slug: 'toncoin', chain: 'ton' },
      amount: { value: '1.25', valueType: 'decimal' },
      recipient: { kind: 'address', chain: 'ton', address: 'EQ-user-recipient' },
      comment: 'hello',
    },
    scopes: ['action.send.prepare'],
    timeoutMs: 15_000,
    maxResultBytes: MAX_RESULT_BYTES,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope: 'current',
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: snapshot.host!.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

function quoteCall(
  session: AgentV2WalletSession,
  query: string,
): Extract<AgentToolCall, { name: 'market.asset.quote' }> {
  const snapshot = session.snapshot();
  const activeAccount = snapshot.host!.accounts.find(({ accountId }) => (
    accountId === snapshot.host!.activeAccountId
  ))!;
  return {
    id: TOOL_CALL_ID,
    name: 'market.asset.quote',
    version: 1,
    arguments: {
      schemaVersion: 1,
      quoteCurrency: snapshot.host!.baseCurrency,
      selector: { kind: 'query', query },
    },
    scopes: ['market.data.read'],
    timeoutMs: 5_000,
    maxResultBytes: 16_384,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope: 'current',
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: snapshot.host!.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

function stakingOfferCall(
  session: AgentV2WalletSession,
): Extract<AgentToolCall, { name: 'staking.offer.read' }> {
  const snapshot = session.snapshot();
  const host = snapshot.host!;
  const activeAccount = host.accounts.find(({ accountId }) => accountId === host.activeAccountId)!;
  const offer = host.stakingOffers![0];
  return {
    id: TOOL_CALL_ID,
    name: 'staking.offer.read',
    version: 1,
    arguments: {
      schemaVersion: 1,
      productId: offer.productId,
      asset: offer.asset,
    },
    scopes: ['staking.data.read'],
    timeoutMs: 15_000,
    maxResultBytes: 16_384,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope: 'current',
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: host.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

function stakingCatalogCall(
  session: AgentV2WalletSession,
): Extract<AgentToolCall, { name: 'staking.offers.list' }> {
  const snapshot = session.snapshot();
  const host = snapshot.host!;
  const activeAccount = host.accounts.find(({ accountId }) => accountId === host.activeAccountId)!;
  return {
    id: TOOL_CALL_ID,
    name: 'staking.offers.list',
    version: 1,
    arguments: { schemaVersion: 1 },
    scopes: ['staking.data.read'],
    timeoutMs: 15_000,
    maxResultBytes: 16_384,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope: 'current',
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: host.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

interface SwapCallOptions {
  sourceQuery: string;
  sourceChain?: 'ton' | 'tron' | 'ethereum' | 'solana';
  destinationQuery: string;
  destinationChain?: 'ton' | 'tron' | 'ethereum' | 'solana';
  amount: string;
  amountSide: 'source' | 'destination';
}

function swapPrepareCall(
  session: AgentV2WalletSession,
  options: SwapCallOptions,
): Extract<AgentToolCall, { name: 'action.swap.prepare' }> {
  const snapshot = session.snapshot();
  const activeAccount = snapshot.host!.accounts.find(({ accountId }) => (
    accountId === snapshot.host!.activeAccountId
  ))!;
  return {
    id: TOOL_CALL_ID,
    name: 'action.swap.prepare',
    version: 1,
    arguments: {
      schemaVersion: 1,
      sourceSelector: {
        kind: 'query', query: options.sourceQuery,
        ...(options.sourceChain ? { chain: options.sourceChain } : {}),
      },
      destinationSelector: {
        kind: 'query', query: options.destinationQuery,
        ...(options.destinationChain ? { chain: options.destinationChain } : {}),
      },
      amount: { value: options.amount, valueType: 'decimal', side: options.amountSide },
    },
    scopes: ['action.swap.prepare'],
    timeoutMs: 15_000,
    maxResultBytes: 16_384,
    walletContextSession: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountScope: 'current',
      activeAccountRef: snapshot.accountRefs.get(activeAccount.accountId)!,
      activeNetwork: snapshot.host!.activeNetwork,
    },
    intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
  };
}

function swapAction(
  session: AgentV2WalletSession,
  call: Extract<AgentToolCall, { name: 'action.swap.prepare' }>,
  result: Extract<import('./protocol/types').ActionSwapPrepareResultV1, { status: 'ready' }>,
): Extract<AgentActionProposal, { kind: 'swap' }> {
  const snapshot = session.snapshot();
  return {
    id: ACTION_ID,
    schemaVersion: 1,
    kind: 'swap',
    labelCode: 'open_swap',
    effect: 'open_swap',
    sourceToolCallId: call.id,
    contextBinding: {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      activeAccountRef: call.walletContextSession.activeAccountRef,
    },
    sourceAsset: result.sourceAsset,
    destinationAsset: result.destinationAsset,
    amount: result.amount,
    localDraftRequired: false,
    requiresConfirmation: false,
  };
}

function persistedSwapAction(
  action: Extract<AgentActionProposal, { kind: 'swap' }>,
): Extract<AgentPersistedActionV2, { kind: 'swap' }> {
  return {
    id: action.id,
    schemaVersion: 1,
    kind: 'swap',
    labelCode: 'open_swap',
    effect: 'open_swap',
    sourceAsset: action.sourceAsset,
    destinationAsset: action.destinationAsset,
    amount: action.amount,
    localDraftRequired: false,
    requiresConfirmation: false,
  };
}

function getQueryAccountScope(args: AgentWalletDataQueryArgsV5) {
  if (args.operation === 'assets.search' || args.accountSelector.kind === 'current') return 'current' as const;
  if (args.accountSelector.kind === 'explicitAll') return 'explicitAll' as const;
  return 'selected' as const;
}

function getQueryVariants(): QueryVariant[] {
  return [
    {
      operation: 'account.inventory',
      args: {
        schemaVersion: 5,
        operation: 'account.inventory',
        accountSelector: { kind: 'explicitAll' },
        chains: [],
      },
      expected: {
        resolvedScope: { kind: 'explicitAll' },
        accounts: [
          expect.objectContaining({ kind: 'account', accountLabel: 'Main', isCurrent: true }),
          expect.objectContaining({ kind: 'account', accountLabel: 'Savings', isCurrent: false }),
        ],
      },
    },
    {
      operation: 'assets.search',
      args: assetsSearchArgs('TON'),
      expected: {
        resolution: 'unique',
        assets: [{
          asset: expect.objectContaining({ slug: 'toncoin', chain: 'ton', symbol: 'TON' }),
          matchQuality: 'exact',
          matchedOn: 'symbol',
        }],
      },
    },
    {
      operation: 'positions.list',
      args: positionsListArgs(),
      expected: {
        resolvedScope: { kind: 'current' },
        policySummary: {
          riskMode: 'exclude',
          visibilityMode: 'visible',
          spamMatches: { count: 1, accuracy: 'exact' },
          hiddenMatches: { count: 0, accuracy: 'exact' },
        },
        positions: [expect.objectContaining({
          kind: 'position',
          asset: expect.objectContaining({ slug: 'toncoin' }),
          quantity: '5',
          availableQuantity: '4.5',
          valuationStatus: 'valued',
          fiatValue: '25.5',
          baseCurrency: 'USD',
        })],
      },
    },
    {
      operation: 'portfolio.aggregate',
      args: {
        schemaVersion: 5,
        operation: 'portfolio.aggregate',
        accountSelector: { kind: 'current' },
        chains: [],
        range: '3m',
        groupBy: ['asset'],
        riskMode: 'exclude',
        visibilityMode: 'visible',
      },
      expected: {
        total: { value: '25.5', baseCurrency: 'USD', unpricedCount: 0 },
        allocations: [expect.objectContaining({ value: '25.5', percent: '100' })],
        aggregates: [expect.objectContaining({ groupKind: 'asset', value: '25.5' })],
        series: [expect.objectContaining({
          metric: 'portfolio_value',
          points: [
            { timestamp: '2025-08-10T00:00:00.000Z', value: '20' },
            { timestamp: '2025-08-11T00:00:00.000Z', value: '25.5' },
          ],
        })],
      },
    },
    {
      operation: 'transactions.list',
      args: transactionsListArgs(),
      expected: {
        appliedFilterDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        transactions: [expect.objectContaining({
          kind: 'transaction',
          direction: 'incoming',
          status: 'completed',
          asset: expect.objectContaining({ slug: 'toncoin' }),
          quantity: '1.25',
          safeDescription: 'Received 1.25 TON',
        })],
      },
    },
    {
      operation: 'transactions.detail',
      args: transactionDetailArgs(FULL_TRANSACTION_HASH),
      expected: {
        transaction: expect.objectContaining({
          kind: 'transaction',
          direction: 'incoming',
          status: 'completed',
          asset: expect.objectContaining({ slug: 'toncoin' }),
          quantity: '1.25',
        }),
      },
    },
    {
      operation: 'contacts.list',
      args: {
        schemaVersion: 5,
        operation: 'contacts.list',
        accountSelector: { kind: 'current' },
        query: 'Alice',
        chains: ['ton'],
        pageSize: 100,
      },
      expected: {
        contacts: [expect.objectContaining({
          kind: 'contact',
          name: 'Alice',
          contactRef: expect.any(String),
          addressRef: expect.any(String),
          addressDisplay: expect.not.stringContaining('EQ-alice-private-address'),
        })],
      },
    },
    {
      operation: 'value.series',
      args: {
        schemaVersion: 5,
        operation: 'value.series',
        accountSelector: { kind: 'current' },
        chains: [],
        metric: 'portfolio_value',
        assetSelectors: [],
        range: '3m',
        maxPoints: 64,
      },
      expected: {
        series: [expect.objectContaining({
          metric: 'portfolio_value',
          label: 'Main',
          baseCurrency: 'USD',
          points: [
            { timestamp: '2025-08-10T00:00:00.000Z', value: '20' },
            { timestamp: '2025-08-11T00:00:00.000Z', value: '25.5' },
          ],
        })],
      },
    },
  ];
}

function assetsSearchArgs(query: string): AgentWalletDataQueryArgsV5 {
  return {
    schemaVersion: 5,
    operation: 'assets.search',
    query,
    chains: [],
    pageSize: 10,
  };
}

function positionsListArgs(): Extract<AgentWalletDataQueryArgsV5, { operation: 'positions.list' }> {
  return {
    schemaVersion: 5,
    operation: 'positions.list',
    accountSelector: { kind: 'current' },
    chains: [],
    assetSelectors: [],
    positionKinds: ['fungible', 'nft', 'staking', 'vesting', 'vault'],
    riskMode: 'exclude',
    visibilityMode: 'visible',
    includeZero: false,
    sort: 'wallet_order',
    pageSize: 100,
  };
}

function transactionsListArgs(): Extract<AgentWalletDataQueryArgsV5, { operation: 'transactions.list' }> {
  return {
    schemaVersion: 5,
    operation: 'transactions.list',
    accountSelector: { kind: 'current' },
    chains: [],
    filters: {
      schemaVersion: 1,
      catalogDigest: contractManifest.walletFilterCatalogSha256,
      clauses: [],
    },
    riskMode: 'exclude',
    pageSize: 50,
  };
}

function transactionDetailArgs(
  hash: string,
): Extract<AgentWalletDataQueryArgsV5, { operation: 'transactions.detail' }> {
  return {
    schemaVersion: 5,
    operation: 'transactions.detail',
    accountSelector: { kind: 'current' },
    hash,
  };
}

function createScopeStore(): AgentWalletScopeStore {
  let nextAnchor = 0;
  return {
    clear: jest.fn(() => Promise.resolve()),
    issue: jest.fn(() => {
      const suffix = String(nextAnchor).padStart(32, 'a');
      nextAnchor += 1;
      return Promise.resolve(`scope_${suffix}`);
    }),
    resolve: jest.fn(() => Promise.reject(new Error('Unexpected wallet scope resolution'))),
  };
}

function defaultCheckTransactionDraft() {
  return Promise.resolve({ resolvedAddress: 'EQ-resolved-recipient' });
}

function defaultFetchPastActivities() {
  return Promise.resolve({ activities: [transactionActivity()], hasMore: false });
}

function defaultFetchActivityDetails(_accountId: string, activity: ApiActivity) {
  return Promise.resolve(activity);
}

function defaultFetchPortfolioHistory() {
  return Promise.resolve(portfolioHistory());
}

function transactionActivity(): Extract<ApiActivity, { kind: 'transaction' }> {
  return {
    kind: 'transaction',
    id: `${FULL_TRANSACTION_HASH}:0`,
    externalMsgHashNorm: FULL_TRANSACTION_HASH,
    timestamp: Date.parse('2026-08-10T10:00:00.000Z'),
    status: 'completed',
    amount: 1_250_000_000n,
    fee: 1_000n,
    fromAddress: 'EQ-external-private-address',
    toAddress: 'EQ-main-private-address',
    normalizedAddress: 'EQ-main-private-address',
    slug: 'toncoin',
    isIncoming: true,
  };
}

function portfolioHistory(): ApiPortfolioHistoryResponse {
  const points: [number, number][] = [
    [Date.parse('2025-08-10T00:00:00.000Z') / 1000, 20],
    [Date.parse('2025-08-11T00:00:00.000Z') / 1000, 25.5],
  ];
  return {
    status: 'ok',
    base: 'USD',
    density: '1d',
    points,
    datasets: [{ assetId: 1, contractAddress: '', symbol: 'TON', points }],
  };
}

function hostContext(): AgentV2HostContextSnapshot {
  return {
    platform: 'classic',
    client: 'web',
    lang: 'en',
    baseCurrency: 'USD',
    currencyRate: '1',
    timeZone: 'Europe/Moscow',
    activeAccountId: 'account-main',
    activeNetwork: 'ton',
    isTestnet: false,
    assetCatalog: [
      {
        slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9,
        priceUsd: '2.5', percentChange24h: '-1.25',
      },
      { slug: 'spam-token', chain: 'ton', symbol: 'SPAM', name: 'Spam Token', decimals: 9 },
      { slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    ],
    stakingOffers: [{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
      annualYield: '14.09',
      yieldType: 'APY',
      availability: 'available',
    }],
    accounts: [
      {
        accountId: 'account-main',
        label: 'Main',
        state: 'active',
        accountType: 'regular',
        isViewOnly: false,
        chains: ['ton'],
        addresses: { ton: 'EQ-main-private-address' },
        portfolioWalletKeys: ['ton:EQ-main-private-address'],
        holdings: [
          {
            asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
            balance: '5',
            availableBalance: '4.5',
            fiatValue: '25.5',
            valuationStatus: 'valued',
          },
          {
            asset: { slug: 'spam-token', chain: 'ton', symbol: 'SPAM', name: 'Spam Token', decimals: 9 },
            balance: '1000000',
            fiatValue: '999999',
            valuationStatus: 'valued',
            riskVerdict: 'spam',
          },
        ],
        savedAddresses: [
          { id: 'alice', name: 'Alice', chain: 'ton', address: 'EQ-alice-private-address' },
        ],
        domainStates: freshDomainStates(),
      },
      secondaryAccount('account-savings', 'Savings'),
    ],
    savedAddresses: [],
  };
}

function swapHostContext(): AgentV2HostContextSnapshot {
  return {
    ...hostContext(),
    isTestnet: false,
    swapAssetCatalog: [
      {
        slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: '2.5',
      },
      {
        slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: '1',
      },
    ],
  };
}

function secondaryAccount(accountId: string, label: string) {
  return {
    accountId,
    label,
    state: 'active' as const,
    accountType: 'regular' as const,
    isViewOnly: false,
    chains: ['ton'],
    addresses: { ton: `EQ-${accountId}-private-address` },
    portfolioWalletKeys: [`ton:EQ-${accountId}-private-address`],
    holdings: [{
      asset: { slug: 'usdton', chain: 'ton' as const, symbol: 'USDT', name: 'Tether USD', decimals: 6 },
      balance: '50',
      fiatValue: '50',
      valuationStatus: 'valued' as const,
    }],
    savedAddresses: [{
      id: `${accountId}-contact`,
      name: `${label} Contact`,
      chain: 'ton' as const,
      address: `EQ-${accountId}-contact-private-address`,
    }],
    domainStates: freshDomainStates(),
  };
}

function freshDomainStates() {
  return {
    accounts: { state: 'fresh' as const },
    positions: { state: 'fresh' as const },
    transactions: { state: 'fresh' as const },
    contacts: { state: 'fresh' as const },
    value_series: { state: 'fresh' as const },
  };
}

function largeHostContext(): AgentV2HostContextSnapshot {
  const host = hostContext();
  host.accounts[0].label = 'M'.repeat(80);
  host.accounts[0].holdings = [];
  host.accounts[0].positions = Array.from({ length: 100 }, (_, index) => ({
    id: `nft-${index}-${'i'.repeat(120)}`,
    kind: 'nft' as const,
    chain: 'ton',
    label: `Collectible ${index} ${'Ж'.repeat(140)}`,
    asset: {
      slug: `asset-${index}-${'s'.repeat(110)}`,
      chain: 'ton',
      symbol: `NFT${index}${'x'.repeat(24)}`.slice(0, 32),
      name: `Asset ${index} ${'名'.repeat(145)}`.slice(0, 160),
      tokenAddress: `EQ${index}${'a'.repeat(250)}`.slice(0, 256),
      decimals: 0,
    },
    quantity: '1',
    valuationStatus: 'valued' as const,
    fiatValue: '1',
    status: 'active',
    collection: `Collection ${index} ${'界'.repeat(145)}`.slice(0, 160),
    isOnSale: true,
    riskVerdict: 'spam' as const,
  }));
  return host;
}

function serializedByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
