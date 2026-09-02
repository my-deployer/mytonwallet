import type {
  ActionSendPrepareArgs,
  ActionSwapPrepareArgsV1,
  ActionSwapPrepareResultV1,
  AgentActionProposal,
  AgentAssetIdentityV2,
  AgenticWalletToolErrorCode,
  AgentMarketQuoteArgsV1,
  AgentMarketQuoteResultV1,
  AgentPersistedActionV2,
  AgentStakingOfferReadResultV1,
  AgentStakingOffersListResultV1,
  AgentToolCall,
  AgentToolFreshness,
  AgentToolResultRequestV2,
  AgentWalletDirectoryResultV1,
  AgentWalletDirectorySuccessV1,
} from './protocol/types';
import type { AgentV2ToolExecutionContext, AgentV2ToolExecutor } from './runtime';
import type { AgentV2SendDraftStore, AgentV2StoredSendDraft } from './sendDraftStore';
import type { AgentStakingProductCatalog } from './stakingCatalog';
import type {
  AgentV2ActionPresentation,
  AgentV2HostAccount,
  AgentV2HostAsset,
  AgentV2HostContextSnapshot,
  AgentV2ResolvedAction,
  ApiUpdateAgentV2PortfolioHistory,
} from './types';
import type {
  FetchPastActivities,
  FetchPortfolioHistory,
  FetchPortfolioPnlChange,
  RefreshWalletHoldings,
} from './walletQueryMaterializer';
import type { WalletQueryPreflightFailure } from './walletQueryPreflight';
import type { AgentWalletScopeStore } from './walletScopeStore';
import type { AgentV2WalletSession } from './walletSession';
import {
  type ApiActivity,
  type ApiAnyDisplayError,
  type ApiChain,
  type ApiCheckTransactionDraftOptions,
  type ApiCheckTransactionDraftResult,
  ApiCommonError,
  ApiTransactionDraftError,
} from '../types';

import { Big } from '../../lib/big.js';
import { throwIfAborted } from '../../util/abortSignal';
import { getIsSupportedChain } from '../../util/chain';
import { logDebug } from '../../util/logs';
import {
  AGENT_V2_TOOL_CONTRACTS,
  type AgentV2ToolContractMetadata,
} from './protocol/toolContractCatalog';
import {
  AgentV2ContractError,
  decodeAgentV2ToolArguments,
} from './protocol/transportContracts';
import { supportsAgentV2SwapAction } from './actionPlatformPolicy';
import { BoundedRetainedRegistry } from './boundedRetainedRegistry';
import { matchAgentMarketQuoteAsset } from './marketQuoteMatcher';
import { buildAgentV2SendAuthorityKey } from './sendActionAuthority';
import { matchAgentSwapAsset } from './swapAssetMatcher';
import { calculateAgentSwapIndicativeQuote } from './swapIndicativeQuote';
import { isRetryableWalletSourceError, WalletQueryProjectionError } from './walletQueryErrors';
import {
  safeWalletQueryAccountLabel,
  safeWalletQueryAssetSymbol,
  safeWalletQueryIdentifierDisplay,
} from './walletQueryMaterializer';
import { getWalletQueryPreflightFailure } from './walletQueryPreflight';
import {
  buildWalletQueryProjectionV5,
  fitWalletQueryV5Request,
} from './walletQueryProjectionV5';

const MAX_RESULT_BYTES = 98_304;
const SAFE_STAKING_PRODUCT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/u;
const RETAINED_STATE_MAX_ENTRIES = 128;
const RETAINED_STATE_TTL_MS = 15 * 60_000;
const SEND_DRAFT_TTL_MS = 10 * 60_000;
const SEND_DRAFT_NAMESPACE = 'sendDraft';
const SPAM_SNAPSHOT_NAMESPACE = 'spamSnapshot';
const SPAM_ACTION_NAMESPACE = 'spamAction';
const SWAP_SNAPSHOT_NAMESPACE = 'swapSnapshot';
const SWAP_ACTION_NAMESPACE = 'swapAction';

type SendDraft = AgentV2StoredSendDraft;

interface SpamSnapshotBinding {
  threadId: string;
  sourceToolCallId: string;
  sessionId: string;
  revision: number;
  accountRef: string;
  assetRefs: string[];
}

interface SpamActionBinding extends SpamSnapshotBinding {
  actionId: string;
  messageId: string;
}

interface SwapSnapshotBinding {
  threadId: string;
  sourceToolCallId: string;
  sessionId: string;
  revision: number;
  accountRef: string;
  sourceSlug: string;
  destinationSlug: string;
  amount: string;
  amountSide: 'source' | 'destination';
}

interface SwapActionBinding extends SwapSnapshotBinding {
  actionId: string;
  messageId: string;
}

export interface AgentV2WalletToolDispatcherDependencies {
  session: AgentV2WalletSession;
  getConsent: () => Promise<boolean>;
  randomUuid?: () => string;
  now?: () => number;
  checkTransactionDraft?: (
    chain: ApiChain,
    options: ApiCheckTransactionDraftOptions,
    signal?: AbortSignal,
  ) => Promise<ApiCheckTransactionDraftResult>;
  fetchPortfolioHistory?: FetchPortfolioHistory;
  fetchPortfolioPnlChange?: FetchPortfolioPnlChange;
  onPortfolioHistory?: (update: Omit<ApiUpdateAgentV2PortfolioHistory, 'type'>) => void;
  fetchPastActivities?: FetchPastActivities;
  fetchActivityDetails?: (
    accountId: string,
    activity: ApiActivity,
    signal?: AbortSignal,
  ) => Promise<ApiActivity>;
  getTokenBySlug?: (slug: string) => AgentV2HostAsset | undefined;
  getStakingCatalog?: (signal?: AbortSignal) => Promise<AgentStakingProductCatalog>;
  refreshWalletHoldings?: RefreshWalletHoldings;
  scopeStore?: AgentWalletScopeStore;
  sendDraftStore?: AgentV2SendDraftStore;
}

export class AgentV2WalletToolDispatcher implements AgentV2ToolExecutor {
  private readonly randomUuid: () => string;
  private readonly now: () => number;
  private readonly retainedState: BoundedRetainedRegistry;
  private generation = 0;
  private threadGeneration = 0;

  constructor(private readonly dependencies: AgentV2WalletToolDispatcherDependencies) {
    this.randomUuid = dependencies.randomUuid ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? Date.now;
    this.retainedState = new BoundedRetainedRegistry(
      RETAINED_STATE_MAX_ENTRIES,
      RETAINED_STATE_TTL_MS,
      this.now,
      ({ namespace, key }) => {
        if (namespace === SEND_DRAFT_NAMESPACE) {
          void this.dependencies.sendDraftStore?.delete(key).catch(() => undefined);
        }
      },
    );
  }

  async execute(toolCall: AgentToolCall, context: AgentV2ToolExecutionContext): Promise<AgentToolResultRequestV2> {
    const completedAt = new Date(this.now()).toISOString();
    const commonBase = {
      protocolVersion: 2 as const,
      runId: context.runId,
      threadId: context.threadId,
      toolCallId: toolCall.id,
      clientToolResultId: this.randomUuid(),
      completedAt,
    };
    if (!await this.dependencies.getConsent()) {
      return failure(commonBase, toolCall, 'consent_required', false);
    }

    const { signal } = context;
    let request: AgentToolResultRequestV2;

    try {
      const contract = AGENT_V2_TOOL_CONTRACTS.find(({ name, version }) => (
        name === toolCall.name && version === toolCall.version
      ));
      if (!contract) throw new WalletToolError('tool_unsupported', 'This wallet tool is not supported.', false);
      this.assertAdmission(toolCall, contract, context);
      try {
        decodeAgentV2ToolArguments(toolCall);
      } catch (error) {
        if (error instanceof AgentV2ContractError) {
          throw new WalletToolError('validation_failed', 'The wallet tool arguments are invalid.', false);
        }
        throw error;
      }

      const authority = await this.captureAuthority(toolCall);
      if (toolCall.name === 'wallet.directory.query') {
        const result = this.dependencies.session.buildWalletDirectory(completedAt);
        request = {
          ...commonBase,
          directorySession: toolCall.directorySession,
          toolName: toolCall.name,
          status: 'success',
          result: directorySuccessEnvelope(result, completedAt, toolCall.maxResultBytes),
        } satisfies AgentToolResultRequestV2;
      } else if (toolCall.name === 'wallet.data.query') {
        const result = await this.executeWalletQueryV5(toolCall, completedAt, context, authority);
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: successEnvelope(result, completedAt, {
            freshness: storeFreshness(completedAt),
            omittedFields: ['rawAccountId', 'fullTransactionHash'],
            maxResultBytes: toolCall.maxResultBytes,
          }),
        } satisfies AgentToolResultRequestV2;
        fitWalletQueryV5Request(request, toolCall.maxResultBytes ?? MAX_RESULT_BYTES);
      } else if (toolCall.name === 'market.asset.quote') {
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: successEnvelope(this.executeMarketQuote(toolCall, completedAt), completedAt, {
            freshness: storeFreshness(completedAt),
            omittedFields: [],
            maxResultBytes: toolCall.maxResultBytes,
            redactionLevel: 'minimal',
          }),
        } satisfies AgentToolResultRequestV2;
      } else if (toolCall.name === 'staking.offer.read') {
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: successEnvelope(this.executeStakingOfferRead(toolCall, completedAt), completedAt, {
            freshness: storeFreshness(completedAt),
            omittedFields: [],
            maxResultBytes: toolCall.maxResultBytes,
            redactionLevel: 'minimal',
          }),
        } satisfies AgentToolResultRequestV2;
      } else if (toolCall.name === 'staking.offers.list') {
        const { result, hasPartialCoverage } = await this.executeStakingOffersList(completedAt, signal);
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: successEnvelope(result, completedAt, {
            freshness: { asOf: completedAt, source: 'network', isStale: false },
            omittedFields: [],
            maxResultBytes: toolCall.maxResultBytes,
            redactionLevel: 'minimal',
            warnings: hasPartialCoverage ? [{ code: 'partial_coverage' }] : undefined,
          }),
        } satisfies AgentToolResultRequestV2;
      } else if (toolCall.name === 'action.swap.prepare') {
        const result = this.executeSwapPrepare(toolCall, completedAt);
        this.captureSwapSnapshot(toolCall, context.threadId, result);
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: successEnvelope(result, completedAt, {
            freshness: storeFreshness(completedAt),
            omittedFields: [],
            maxResultBytes: toolCall.maxResultBytes,
            redactionLevel: 'minimal',
          }),
        } satisfies AgentToolResultRequestV2;
      } else {
        request = {
          ...commonBase,
          walletContextSession: toolCall.walletContextSession,
          toolName: toolCall.name,
          status: 'success',
          result: await this.prepareSend(toolCall, completedAt, context.threadId, authority, signal),
        } satisfies AgentToolResultRequestV2;
      }

      throwIfAborted(signal);
      await this.assertConsentAndAuthority(toolCall, authority);
      const preflightFailure = getWalletQueryPreflightFailure(toolCall, request);
      if (preflightFailure) {
        throw new WalletToolError('validation_failed', getWalletQueryPreflightMessage(preflightFailure), false);
      }
      if (serializedByteLength(request) > (toolCall.maxResultBytes ?? MAX_RESULT_BYTES)) {
        this.discard(toolCall.id);
        request = failure(commonBase, toolCall, 'result_too_large', false);
      }
      await this.assertConsentAndAuthority(toolCall, authority);
      this.captureSpamSnapshot(toolCall, context.threadId, request);
    } catch (error) {
      logDebug('AgentV2 wallet tool execution', {
        stage: 'failed',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolVersion: toolCall.version,
        errorCode: error instanceof WalletToolError || error instanceof WalletQueryProjectionError
          ? error.code
          : undefined,
      });
      this.discard(toolCall.id);
      request = error instanceof WalletToolError || error instanceof WalletQueryProjectionError
        ? failure(commonBase, toolCall, error.code, error.retryable, 'status' in error ? error.status : 'rejected')
        : failure(commonBase, toolCall, 'tool_failed', true, 'error');
    }

    if (context.signal.aborted) {
      this.discard(toolCall.id);
      return failure(commonBase, toolCall, 'tool_failed', true, 'cancelled');
    }
    return request;
  }

  private executeMarketQuote(toolCall: AgentToolCall, readAt: string): AgentMarketQuoteResultV1 {
    const host = this.dependencies.session.snapshot().host;
    const args = toolCall.arguments as AgentMarketQuoteArgsV1;
    const match = matchAgentMarketQuoteAsset(args.selector, host?.assetCatalog ?? []);
    if (match.status === 'not_found') {
      return args.selector.kind === 'asset'
        ? {
          schemaVersion: 1,
          status: 'price_unavailable',
          asset: args.selector.asset,
          readAt,
        }
        : { schemaVersion: 1, status: 'not_found', readAt };
    }
    if (match.status === 'ambiguous') {
      return {
        schemaVersion: 1,
        status: 'ambiguous',
        candidates: match.candidates,
        hasMore: match.hasMore,
        readAt,
      };
    }
    const { asset, identity } = match;
    if (!host) {
      return { schemaVersion: 1, status: 'price_unavailable', asset: identity, readAt };
    }
    if ('quoteAsset' in args) {
      const quoteMatch = matchAgentMarketQuoteAsset(
        { kind: 'asset', asset: args.quoteAsset },
        host.assetCatalog ?? [],
      );
      if (quoteMatch.status !== 'resolved') {
        return { schemaVersion: 1, status: 'price_unavailable', asset: identity, readAt };
      }
      const price = dividePositiveDecimals(asset.priceUsd, quoteMatch.asset.priceUsd);
      if (!price) return { schemaVersion: 1, status: 'price_unavailable', asset: identity, readAt };
      return {
        schemaVersion: 1,
        status: 'resolved',
        asset: identity,
        price,
        quoteAsset: quoteMatch.identity,
        readAt,
      };
    }
    if (args.quoteCurrency !== host.baseCurrency || !host.currencyRate) {
      return { schemaVersion: 1, status: 'price_unavailable', asset: identity, readAt };
    }
    const price = multiplyPositiveDecimals(asset.priceUsd, host.currencyRate);
    const percentChange24h = canonicalDecimal(asset.percentChange24h);
    if (!price || percentChange24h === undefined) {
      return { schemaVersion: 1, status: 'price_unavailable', asset: identity, readAt };
    }
    return {
      schemaVersion: 1,
      status: 'resolved',
      asset: identity,
      price,
      quoteCurrency: args.quoteCurrency,
      percentChange24h,
      readAt,
    };
  }

  private executeStakingOfferRead(
    toolCall: Extract<AgentToolCall, { name: 'staking.offer.read' }>,
    readAt: string,
  ): AgentStakingOfferReadResultV1 {
    const offers = this.dependencies.session.snapshot().host?.stakingOffers;
    if (!offers?.length) return stakingOfferUnavailable('state_unavailable', readAt);
    const offer = offers.find(({ productId }) => productId === toolCall.arguments.productId);
    if (!offer) return stakingOfferUnavailable('product_not_found', readAt);
    if (!matchesAgentAssetIdentitySelector(offer.asset, toolCall.arguments.asset)) {
      return stakingOfferUnavailable('asset_mismatch', readAt);
    }
    return {
      schemaVersion: 1,
      status: 'available',
      productId: offer.productId,
      asset: offer.asset,
      yieldType: offer.yieldType,
      depositAvailability: offer.availability,
      annualYield: offer.annualYield,
      readAt,
    };
  }

  private async executeStakingOffersList(readAt: string, signal: AbortSignal) {
    if (!this.dependencies.getStakingCatalog || !this.dependencies.getTokenBySlug) {
      return { result: stakingCatalogUnavailable(readAt), hasPartialCoverage: false };
    }

    let catalog: AgentStakingProductCatalog;
    try {
      catalog = await this.dependencies.getStakingCatalog(signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      return { result: stakingCatalogUnavailable(readAt), hasPartialCoverage: false };
    }

    const { products } = catalog;
    let hasPartialCoverage = catalog.hasPartialCoverage || products.length > 16;
    const offers = products.slice(0, 16).flatMap((product) => {
      const asset = this.dependencies.getTokenBySlug!(product.tokenSlug);
      const annualYield = canonicalBoundedYield(product.annualYield);
      if (
        !asset
        || !SAFE_STAKING_PRODUCT_ID_PATTERN.test(product.productId)
        || annualYield === undefined
        || asset.slug.length > 128
        || asset.chain.length > 32
        || (asset.tokenAddress !== undefined && asset.tokenAddress.length > 256)
        || !Number.isInteger(asset.decimals)
        || asset.decimals < 0
        || asset.decimals > 255
      ) {
        hasPartialCoverage = true;
        return [];
      }
      return [{
        productId: product.productId,
        asset: {
          slug: asset.slug,
          chain: asset.chain,
          symbol: safeWalletQueryAssetSymbol(asset),
          ...(asset.tokenAddress ? { tokenAddress: asset.tokenAddress } : {}),
          decimals: asset.decimals,
        },
        annualYield,
        yieldType: product.yieldType,
        depositAvailability: product.depositAvailability,
        ...(product.disabledReason ? { disabledReason: product.disabledReason } : {}),
      }];
    });

    return {
      result: { schemaVersion: 1, status: 'resolved', offers, readAt } as AgentStakingOffersListResultV1,
      hasPartialCoverage,
    };
  }

  private executeSwapPrepare(toolCall: AgentToolCall, observedAt: string): ActionSwapPrepareResultV1 {
    const host = this.dependencies.session.snapshot().host;
    if (!host || !supportsAgentV2SwapAction(host.platform) || host.isTestnet !== false) {
      throw new WalletToolError('validation_failed', 'Swap preparation is unavailable.', false);
    }
    const catalog = host.swapAssetCatalog ?? [];
    const args = toolCall.arguments as ActionSwapPrepareArgsV1;
    const source = matchAgentSwapAsset(args.sourceSelector, catalog);
    if (source.status === 'not_found') {
      return { schemaVersion: 1, status: 'asset_not_found', side: 'source', observedAt };
    }
    if (source.status === 'ambiguous') {
      return {
        schemaVersion: 1,
        status: 'asset_ambiguous',
        side: 'source',
        candidates: source.candidates,
        hasMore: source.hasMore,
        observedAt,
      };
    }
    const destination = matchAgentSwapAsset(args.destinationSelector, catalog);
    if (destination.status === 'not_found') {
      return { schemaVersion: 1, status: 'asset_not_found', side: 'destination', observedAt };
    }
    if (destination.status === 'ambiguous') {
      return {
        schemaVersion: 1,
        status: 'asset_ambiguous',
        side: 'destination',
        candidates: destination.candidates,
        hasMore: destination.hasMore,
        observedAt,
      };
    }
    if (source.identity.slug === destination.identity.slug
      && source.identity.chain === destination.identity.chain) {
      return { schemaVersion: 1, status: 'same_asset', asset: source.identity, observedAt };
    }
    return {
      schemaVersion: 1,
      status: 'ready',
      sourceAsset: source.identity,
      destinationAsset: destination.identity,
      amount: args.amount,
      quote: calculateAgentSwapIndicativeQuote(
        source.asset,
        source.identity,
        destination.asset,
        destination.identity,
        args.amount,
        observedAt,
      ),
    };
  }

  discard(toolCallId: string) {
    this.retainedState.delete(SPAM_SNAPSHOT_NAMESPACE, toolCallId);
    this.retainedState.deleteWhere(({ namespace, value }) => (
      (namespace === SPAM_ACTION_NAMESPACE || namespace === SEND_DRAFT_NAMESPACE)
      && (value as SpamActionBinding | SendDraft).sourceToolCallId === toolCallId
    ));
    this.retainedState.delete(SWAP_SNAPSHOT_NAMESPACE, toolCallId);
    this.retainedState.deleteWhere(({ namespace, value }) => (
      namespace === SWAP_ACTION_NAMESPACE
      && (value as SwapActionBinding).sourceToolCallId === toolCallId
    ));
  }

  async registerAction(threadId: string, messageId: string, action: AgentActionProposal) {
    const threadGeneration = this.threadGeneration;
    if (action.kind === 'swap') {
      const source = this.retainedState.get<SwapSnapshotBinding>(
        SWAP_SNAPSHOT_NAMESPACE,
        action.sourceToolCallId,
      );
      if (source && source.threadId === threadId
        && source.sessionId === action.contextBinding.sessionId
        && source.revision === action.contextBinding.revision
        && source.accountRef === action.contextBinding.activeAccountRef
        && source.sourceSlug === action.sourceAsset.slug
        && source.destinationSlug === action.destinationAsset.slug
        && source.amount === action.amount.value
        && source.amountSide === action.amount.side) {
        this.retainedState.set(SWAP_ACTION_NAMESPACE, action.id, {
          ...source,
          actionId: action.id,
          messageId,
        }, { threadId });
      }
      this.retainedState.delete(SWAP_SNAPSHOT_NAMESPACE, action.sourceToolCallId);
      return;
    }
    if (action.kind === 'hideSpamAssets') {
      const source = this.retainedState.get<SpamSnapshotBinding>(SPAM_SNAPSHOT_NAMESPACE, action.sourceToolCallId);
      if (
        source
        && source.threadId === threadId
        && source.assetRefs.length === action.assetRefs.length
        && source.assetRefs.every((assetRef, index) => assetRef === action.assetRefs[index])
        && source.sessionId === action.contextBinding.sessionId
        && source.revision === action.contextBinding.revision
        && source.accountRef === action.contextBinding.activeAccountRef
      ) {
        this.retainedState.set(
          SPAM_ACTION_NAMESPACE,
          action.id,
          { ...source, actionId: action.id, messageId },
          { threadId },
        );
        this.retainedState.delete(SPAM_SNAPSHOT_NAMESPACE, action.sourceToolCallId);
      }
      return;
    }
    if (action.kind !== 'send' || action.effect !== 'open_wallet_review') return;
    const draft = this.retainedState.get<SendDraft>(SEND_DRAFT_NAMESPACE, action.draftId);
    if (
      !draft
      || draft.threadId !== threadId
      || draft.actionId !== action.id
      || draft.sourceToolCallId !== action.sourceToolCallId
      || new Date(action.draftExpiresAt).getTime() !== draft.expiresAt
    ) return;
    const expectedAuthorityBinding = draft.authorityBinding;
    const boundDraft = { ...draft, assistantMessageId: messageId };
    const generation = this.generation;
    const token = this.retainedState.set(SEND_DRAFT_NAMESPACE, draft.draftId, boundDraft, {
      expiresAt: draft.expiresAt,
      threadId,
    });
    const currentAuthorityBinding = buildAgentV2SendAuthorityKey(this.dependencies.session.snapshot().host);
    if (
      generation !== this.generation
      || threadGeneration !== this.threadGeneration
      || !this.retainedState.isCurrent(SEND_DRAFT_NAMESPACE, draft.draftId, token)
      || currentAuthorityBinding !== expectedAuthorityBinding
    ) {
      this.retainedState.delete(SEND_DRAFT_NAMESPACE, draft.draftId);
      return;
    }
    let didPersist = false;
    if (this.dependencies.sendDraftStore) {
      try {
        await this.dependencies.sendDraftStore.put(boundDraft);
        didPersist = true;
      } catch {
        // The current session can still use its in-memory reviewed draft.
      }
    }
    const latestAuthorityBinding = buildAgentV2SendAuthorityKey(this.dependencies.session.snapshot().host);
    if (
      generation !== this.generation
      || threadGeneration !== this.threadGeneration
      || !this.retainedState.isCurrent(SEND_DRAFT_NAMESPACE, draft.draftId, token)
      || latestAuthorityBinding !== expectedAuthorityBinding
    ) {
      this.retainedState.delete(SEND_DRAFT_NAMESPACE, draft.draftId);
      if (didPersist) await this.dependencies.sendDraftStore?.delete(draft.draftId).catch(() => undefined);
      return;
    }
  }

  async hydrateAction(threadId: string, messageId: string, action: AgentPersistedActionV2) {
    if (
      action.kind !== 'send'
      || action.effect !== 'open_wallet_review'
      || !this.dependencies.sendDraftStore
    ) return;
    const generation = this.generation;
    const threadGeneration = this.threadGeneration;
    const draft = await this.dependencies.sendDraftStore.get(action.draftId);
    if (!draft) return;
    const authorityBinding = buildAgentV2SendAuthorityKey(this.dependencies.session.snapshot().host);
    if (
      generation !== this.generation
      || threadGeneration !== this.threadGeneration
      || draft.threadId !== threadId
      || draft.assistantMessageId !== messageId
      || draft.actionId !== action.id
      || draft.sourceToolCallId !== action.sourceToolCallId
      || draft.expiresAt !== new Date(action.draftExpiresAt).getTime()
      || draft.expiresAt <= this.now()
      || draft.authorityBinding !== authorityBinding
    ) return;
    this.retainedState.set(SEND_DRAFT_NAMESPACE, draft.draftId, draft, {
      expiresAt: draft.expiresAt,
      threadId,
    });
  }

  getActionPresentation(
    threadId: string,
    messageId: string,
    action: AgentActionProposal | AgentPersistedActionV2,
  ) {
    if (action.kind === 'send' && action.effect === 'open_send') {
      const binding = this.resolveSendFormBinding(action);
      if (!binding) return { kind: 'inactive' as const };
      return {
        kind: 'send',
        status: 'active',
        network: binding.network,
        accountLabel: safeWalletQueryAccountLabel(binding.active),
        ...(binding.destination ? { recipient: binding.destination.presentation } : {}),
        feeStatus: 'calculated_in_wallet',
        warningCodes: [],
      } satisfies AgentV2ActionPresentation;
    }
    const draft = this.getBoundSendDraft(threadId, messageId, action);
    return draft?.presentation ?? { kind: 'inactive' as const };
  }

  resolveAction(threadId: string, messageId: string, action: AgentActionProposal): AgentV2ResolvedAction {
    if (action.kind === 'swap') {
      const binding = this.retainedState.get<SwapActionBinding>(SWAP_ACTION_NAMESPACE, action.id);
      if (!binding || binding.threadId !== threadId || binding.messageId !== messageId) return { kind: 'inactive' };
      return this.resolveSwapAction(action);
    }
    if (action.kind === 'hideSpamAssets') return this.resolveHideSpamAction(threadId, messageId, action);
    if (action.kind === 'send' && action.effect === 'open_send') {
      return this.resolveSendFormAction(action);
    }
    const draft = this.getBoundSendDraft(threadId, messageId, action);
    if (!draft) return { kind: 'inactive' };
    return { kind: 'reviewSend', draftId: draft.draftId, chain: draft.network, review: draft.review };
  }

  resolvePersistedAction(
    threadId: string,
    messageId: string,
    action: AgentPersistedActionV2,
  ): AgentV2ResolvedAction {
    if (action.kind === 'swap') return this.resolveSwapAction(action);
    const draft = this.getBoundSendDraft(threadId, messageId, action);
    if (!draft) return { kind: 'inactive' };
    return { kind: 'reviewSend', draftId: draft.draftId, chain: draft.network, review: draft.review };
  }

  private captureSwapSnapshot(
    toolCall: Extract<AgentToolCall, { name: 'action.swap.prepare' }>,
    threadId: string,
    result: ActionSwapPrepareResultV1,
  ) {
    if (result.status !== 'ready') return;
    this.retainedState.set(SWAP_SNAPSHOT_NAMESPACE, toolCall.id, {
      threadId,
      sourceToolCallId: toolCall.id,
      sessionId: toolCall.walletContextSession.sessionId,
      revision: toolCall.walletContextSession.revision,
      accountRef: toolCall.walletContextSession.activeAccountRef,
      sourceSlug: result.sourceAsset.slug,
      destinationSlug: result.destinationAsset.slug,
      amount: result.amount.value,
      amountSide: result.amount.side,
    }, { threadId });
  }

  private resolveSwapAction(
    action: Extract<AgentActionProposal | AgentPersistedActionV2, { kind: 'swap' }>,
  ): AgentV2ResolvedAction {
    const snapshot = this.dependencies.session.snapshot();
    const host = snapshot.host;
    const active = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
    if (!supportsAgentV2SwapAction(host?.platform) || host?.isTestnet !== false
      || !active || active.state !== 'active' || active.isViewOnly || active.accountType === 'ledger') {
      return { kind: 'inactive' };
    }
    if ('contextBinding' in action) {
      const accountRef = snapshot.accountRefs.get(active.accountId);
      if (action.contextBinding.sessionId !== snapshot.sessionId
        || action.contextBinding.activeAccountRef !== accountRef) return { kind: 'inactive' };
    }
    const catalog = host.swapAssetCatalog ?? [];
    const source = catalog.find(({ slug }) => slug === action.sourceAsset.slug);
    const destination = catalog.find(({ slug }) => slug === action.destinationAsset.slug);
    if (!source || !destination
      || source.chain !== action.sourceAsset.chain
      || destination.chain !== action.destinationAsset.chain) return { kind: 'inactive' };
    return {
      kind: 'openSwap',
      tokenInSlug: source.slug,
      tokenOutSlug: destination.slug,
      amount: action.amount.value,
      amountSide: action.amount.side,
    };
  }

  clear(
    threadId?: string,
    {
      shouldClearPersistentState = false,
      shouldRetainRevalidatedActions = false,
    }: {
      shouldClearPersistentState?: boolean;
      shouldRetainRevalidatedActions?: boolean;
    } = {},
  ) {
    if (!threadId) {
      this.generation += 1;
      this.threadGeneration += 1;
      if (shouldClearPersistentState) {
        this.retainedState.clear();
        this.dependencies.scopeStore?.clear().catch(() => undefined);
        this.dependencies.sendDraftStore?.clear().catch(() => undefined);
      } else if (shouldRetainRevalidatedActions) {
        const authorityBinding = buildAgentV2SendAuthorityKey(this.dependencies.session.snapshot().host);
        this.retainedState.deleteWhere(({ namespace, value }) => (
          namespace !== SWAP_ACTION_NAMESPACE
          && (namespace !== SEND_DRAFT_NAMESPACE
            || (value as SendDraft).authorityBinding !== authorityBinding)
        ));
      } else {
        this.retainedState.discard();
      }
      return;
    }
    this.threadGeneration += 1;
    this.retainedState.deleteWhere((entry) => entry.threadId === threadId);
  }

  private async executeWalletQueryV5(
    toolCall: Extract<AgentToolCall, { name: 'wallet.data.query' }>,
    completedAt: string,
    context: AgentV2ToolExecutionContext,
    authority: Awaited<ReturnType<AgentV2WalletSession['walletAuthorityBinding']>>,
  ) {
    const args = toolCall.arguments;
    logDebug('AgentV2 wallet query', {
      stage: 'projection_started',
      toolCallId: toolCall.id,
      operation: args.operation,
    });
    const result = await buildWalletQueryProjectionV5({
      session: this.dependencies.session,
      args,
      call: toolCall,
      completedAt,
      signal: context.signal,
      fetchPastActivities: this.dependencies.fetchPastActivities,
      fetchActivityDetails: this.dependencies.fetchActivityDetails,
      fetchPortfolioHistory: this.dependencies.fetchPortfolioHistory,
      fetchPortfolioPnlChange: this.dependencies.fetchPortfolioPnlChange,
      getTokenBySlug: this.dependencies.getTokenBySlug,
      refreshWalletHoldings: this.dependencies.refreshWalletHoldings,
      onPortfolioHistory: this.dependencies.onPortfolioHistory,
      scopeStore: this.dependencies.scopeStore,
      authorityBinding: {
        accountDigest: authority.accountDigest,
        accountScope: toolCall.walletContextSession.accountScope,
        activeAccountRef: toolCall.walletContextSession.activeAccountRef,
        deviceId: context.deviceId,
        messageId: context.messageId,
        profileDigest: authority.profileDigest,
        revision: toolCall.walletContextSession.revision,
        sessionId: toolCall.walletContextSession.sessionId,
        threadId: context.threadId,
      },
    });
    logDebug('AgentV2 wallet query', {
      stage: 'projection_completed',
      toolCallId: toolCall.id,
      operation: result.operation,
      resultStatus: result.status,
    });
    return result;
  }

  private assertAdmission(
    toolCall: AgentToolCall,
    contract: AgentV2ToolContractMetadata,
    context: AgentV2ToolExecutionContext,
  ) {
    throwIfAborted(context.signal);
    if (toolCall.scopes.length !== 1 || toolCall.scopes[0] !== contract.scopes[0]) {
      throw new WalletToolError('tool_scope_mismatch', 'The wallet tool scope is invalid.', false);
    }
    const isToolSupported = this.dependencies.session.buildContext().capabilities.supportedTools
      .some(({ name, version }) => name === toolCall.name && version === toolCall.version);
    if (!isToolSupported) {
      throw new WalletToolError('capability_unsupported', 'This wallet tool is not available.', false);
    }
    const snapshot = this.dependencies.session.snapshot();
    const active = getActiveAccount(snapshot.host);
    const activeRef = active ? snapshot.accountRefs.get(active.accountId) : undefined;
    if (toolCall.name === 'wallet.directory.query') {
      const session = toolCall.directorySession;
      const grant = toolCall.directoryGrant;
      if (
        !active
        || active.state !== 'active'
        || !activeRef
        || !session
        || !grant
        || toolCall.intentSource?.kind !== 'userMessage'
        || toolCall.intentSource.messageId !== context.messageId
        || grant.messageId !== context.messageId
        || grant.sessionId !== session.sessionId
        || grant.revision !== session.revision
        || session.sessionId !== snapshot.sessionId
        || session.revision !== snapshot.revision
        || session.activeAccountRef !== activeRef
      ) throw new WalletToolError('tool_scope_mismatch', 'The wallet directory authority is invalid.', false);
      return;
    }
    const walletSession = toolCall.walletContextSession;
    if (
      !active
      || active.state !== 'active'
      || !activeRef
      || !walletSession
      || walletSession.sessionId !== snapshot.sessionId
      || walletSession.revision !== snapshot.revision
      || walletSession.activeAccountRef !== activeRef
      || walletSession.activeNetwork !== snapshot.host?.activeNetwork
    ) throw new WalletToolError('wallet_context_changed', 'The active wallet changed.', false);
  }

  private async captureAuthority(toolCall: AgentToolCall) {
    const authority = await this.dependencies.session.walletAuthorityBinding();
    const session = toolCall.name === 'wallet.directory.query'
      ? toolCall.directorySession
      : toolCall.walletContextSession;
    if (
      !session
      || authority.sessionId !== session.sessionId
      || authority.revision !== session.revision
    ) throw new WalletToolError('wallet_context_changed', 'The active wallet changed.', false);
    return authority;
  }

  private async assertConsentAndAuthority(
    toolCall: AgentToolCall,
    expected: Awaited<ReturnType<AgentV2WalletSession['walletAuthorityBinding']>>,
  ) {
    if (!await this.dependencies.getConsent()) {
      throw new WalletToolError('consent_required', 'Agent consent is required.', false);
    }
    const current = await this.captureAuthority(toolCall);
    if (authorityBinding(current) !== authorityBinding(expected)) {
      throw new WalletToolError('wallet_context_changed', 'The active wallet changed.', false);
    }
  }

  private captureSpamSnapshot(
    toolCall: AgentToolCall,
    threadId: string,
    request: AgentToolResultRequestV2,
  ) {
    if (toolCall.name !== 'wallet.data.query'
      || request.status !== 'success' || request.toolName !== 'wallet.data.query') return;
    const result = request.result.result;
    if (result.status !== 'resolved'
      || (result.operation !== 'positions.list' && result.operation !== 'portfolio.aggregate')) return;
    const assetRefs = result.positions.flatMap((position) => (
      position.riskVerdict === 'spam' && position.assetRef ? [position.assetRef] : []
    ));
    if (!assetRefs.length) return;
    this.retainedState.set(SPAM_SNAPSHOT_NAMESPACE, toolCall.id, {
      threadId,
      sourceToolCallId: toolCall.id,
      sessionId: toolCall.walletContextSession.sessionId,
      revision: toolCall.walletContextSession.revision,
      accountRef: toolCall.walletContextSession.activeAccountRef,
      assetRefs: [...new Set(assetRefs)],
    }, { threadId });
  }

  private resolveHideSpamAction(
    threadId: string,
    messageId: string,
    action: Extract<AgentActionProposal, { kind: 'hideSpamAssets' }>,
  ): AgentV2ResolvedAction {
    const binding = this.retainedState.get<SpamActionBinding>(SPAM_ACTION_NAMESPACE, action.id);
    const snapshot = this.dependencies.session.snapshot();
    const active = getActiveAccount(snapshot.host);
    const activeRef = active ? snapshot.accountRefs.get(active.accountId) : undefined;
    if (
      !binding
      || binding.threadId !== threadId
      || binding.messageId !== messageId
      || binding.sourceToolCallId !== action.sourceToolCallId
      || binding.sessionId !== snapshot.sessionId
      || binding.revision !== snapshot.revision
      || binding.accountRef !== activeRef
      || action.contextBinding.sessionId !== snapshot.sessionId
      || action.contextBinding.revision !== snapshot.revision
      || action.contextBinding.activeAccountRef !== activeRef
      || action.assetRefs.length !== binding.assetRefs.length
      || !action.assetRefs.every((assetRef, index) => assetRef === binding.assetRefs[index])
      || !active
    ) return { kind: 'inactive' };
    const slugs: string[] = [];
    for (const assetRef of action.assetRefs) {
      const asset = this.dependencies.session.resolveAssetRef(assetRef);
      const holding = asset && active.holdings.find(({ asset: candidate }) => (
        candidate.slug === asset.slug && candidate.chain === asset.chain
      ));
      if (!asset || asset.accountId !== active.accountId || holding?.riskVerdict !== 'spam') {
        return { kind: 'inactive' };
      }
      slugs.push(asset.slug);
    }
    return { kind: 'hideSpamAssets', slugs: [...new Set(slugs)] };
  }

  private resolveSendFormAction(
    action: Extract<AgentActionProposal, { kind: 'send'; effect: 'open_send' }>,
  ): AgentV2ResolvedAction {
    const binding = this.resolveSendFormBinding(action);
    return binding ? {
      kind: 'sendForm',
      tokenSlug: binding.asset.slug,
      toAddress: binding.destination.raw,
    } : { kind: 'inactive' };
  }

  private resolveSendFormBinding(
    action: Extract<AgentActionProposal, { kind: 'send'; effect: 'open_send' }>,
  ) {
    const snapshot = this.dependencies.session.snapshot();
    const host = snapshot.host;
    const active = getActiveAccount(host);
    const accountRef = active ? snapshot.accountRefs.get(active.accountId) : undefined;
    if (
      !host
      || !active
      || active.state !== 'active'
      || active.isViewOnly
      || action.contextBinding.sessionId !== snapshot.sessionId
      || action.contextBinding.revision !== snapshot.revision
      || action.contextBinding.activeAccountRef !== accountRef
      || action.contextBinding.activeNetwork !== host.activeNetwork
      || action.asset.chain !== host.activeNetwork
    ) return undefined;
    const asset = uniqueAssets(active.holdings.map(({ asset: holdingAsset }) => holdingAsset)).find((candidate) => (
      candidate.slug === action.asset.slug
      && candidate.chain === action.asset.chain
      && (candidate.tokenAddress ?? undefined) === (action.asset.tokenAddress ?? undefined)
    ));
    if (!asset) return undefined;
    try {
      const network = requireApiChain(host.activeNetwork);
      const destination = resolveSendDestination(this.dependencies.session, active, action.recipient, network);
      return { active, asset, destination, network };
    } catch {
      return undefined;
    }
  }

  private async prepareSend(
    toolCall: AgentToolCall,
    completedAt: string,
    threadId: string,
    authority: Awaited<ReturnType<AgentV2WalletSession['walletAuthorityBinding']>>,
    signal: AbortSignal,
  ) {
    const threadGeneration = this.threadGeneration;
    const checker = this.dependencies.checkTransactionDraft;
    if (!checker) throw new WalletToolError('capability_unsupported', 'Send preparation is not available.', false);
    const snapshot = this.dependencies.session.snapshot();
    const host = snapshot.host!;
    const active = getActiveAccount(host)!;
    if (active.isViewOnly) {
      throw new WalletToolError('view_only_prepare_forbidden', 'Send is not available for this account.', false);
    }
    const network = requireApiChain(host.activeNetwork);
    if (!active.chains.includes(network)) {
      throw new WalletToolError('capability_unsupported', 'Send is not supported on this network.', false);
    }
    const args = toolCall.arguments as ActionSendPrepareArgs;
    const asset = uniqueAssets(active.holdings.map(({ asset: holdingAsset }) => holdingAsset)).find((candidate) => (
      candidate.slug === args.asset.slug
      && candidate.chain === args.asset.chain
      && (candidate.tokenAddress ?? undefined) === (args.asset.tokenAddress ?? undefined)
    ));
    if (!asset || asset.chain !== network || asset.decimals === undefined || !Number.isInteger(asset.decimals)) {
      throw new WalletToolError('validation_failed', 'The selected asset is not available.', false);
    }
    const amount = decimalToAtomic(args.amount.value, asset.decimals);
    if (amount <= 0n) throw new WalletToolError('invalid_amount', 'The transfer amount is invalid.', false);
    const destination = resolveSendDestination(this.dependencies.session, active, args.recipient, network);
    let checkResult: ApiCheckTransactionDraftResult;
    try {
      checkResult = await checker(network, {
        accountId: active.accountId,
        toAddress: destination.raw,
        amount,
        ...(asset.tokenAddress ? { tokenAddress: asset.tokenAddress } : {}),
        ...(args.comment ? { payload: { type: 'comment', text: args.comment, shouldEncrypt: false } as const } : {}),
      }, signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (isRetryableWalletSourceError(error)) {
        throw new WalletToolError(
          'offline_prepare_unavailable', 'Send preparation is temporarily unavailable.', true, 'error',
        );
      }
      throw error;
    }
    await this.assertConsentAndAuthority(toolCall, authority);
    if (checkResult.error) {
      throw new WalletToolError(
        sendDraftErrorCode(checkResult.error), 'The transfer draft is invalid.', false, 'error',
      );
    }
    if (checkResult.isMemoRequired && !args.comment) {
      throw new WalletToolError('memo_required', 'A transfer memo is required.', false, 'error');
    }
    const draftId = this.randomUuid();
    const actionId = this.randomUuid();
    const expiresAt = this.now() + SEND_DRAFT_TTL_MS;
    const accountRef = snapshot.accountRefs.get(active.accountId)!;
    const sendWarnings = [
      ...(checkResult.isScam ? [{ code: 'scam_suspected' as const, disposition: 'review' as const }] : []),
      ...(checkResult.isToAddressNew ? [{ code: 'new_address' as const, disposition: 'review' as const }] : []),
      ...(checkResult.isMemoRequired ? [{ code: 'memo_required' as const, disposition: 'review' as const }] : []),
    ];
    const draft: SendDraft = {
      draftId,
      threadId,
      accountId: active.accountId,
      actionId,
      sourceToolCallId: toolCall.id,
      expiresAt,
      authorityBinding: buildAgentV2SendAuthorityKey(snapshot.host)!,
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      accountRef,
      network,
      presentation: {
        kind: 'send',
        status: 'active',
        amount: { value: args.amount.value, symbol: safeWalletQueryAssetSymbol(asset) },
        network,
        accountLabel: safeWalletQueryAccountLabel(active),
        recipient: destination.presentation,
        feeStatus: 'calculated_in_wallet',
        warningCodes: sendWarnings.map(({ code }) => code),
        expiresAt: new Date(expiresAt).toISOString(),
      },
      review: {
        tokenSlug: asset.slug,
        amountAtomic: amount.toString(),
        toAddress: checkResult.resolvedAddress ?? destination.raw,
        ...(args.comment ? { comment: args.comment } : {}),
      },
    };
    const generation = this.generation;
    const token = this.retainedState.set(SEND_DRAFT_NAMESPACE, draftId, draft, { expiresAt, threadId });
    await this.dependencies.sendDraftStore?.put(draft).catch(() => undefined);
    throwIfAborted(signal);
    await this.assertConsentAndAuthority(toolCall, authority);
    if (
      generation !== this.generation
      || threadGeneration !== this.threadGeneration
      || !this.retainedState.isCurrent(SEND_DRAFT_NAMESPACE, draftId, token)
    ) {
      await this.dependencies.sendDraftStore?.delete(draftId).catch(() => undefined);
      throw new WalletToolError('wallet_context_changed', 'The active wallet changed.', false);
    }
    const draftExpiresAt = new Date(expiresAt).toISOString();
    return successEnvelope({
      draftId,
      draftExpiresAt,
      action: {
        id: actionId,
        kind: 'send' as const,
        labelCode: 'review_transfer' as const,
        draftId,
        draftExpiresAt,
        sourceToolCallId: toolCall.id,
        effect: 'open_wallet_review' as const,
        localDraftRequired: true as const,
        requiresConfirmation: true as const,
      },
      summary: {
        account: {
          accountRef,
          label: safeWalletQueryAccountLabel(active),
          accountType: active.accountType,
          isViewOnly: false,
          chains: active.chains,
        },
        primaryAmount: money(asset, args.amount.value),
        feeStatus: 'calculated_in_wallet' as const,
        destination: destination.summary,
        ...(sendWarnings.length ? { sendWarnings } : {}),
      },
    }, completedAt);
  }

  private getBoundSendDraft(
    threadId: string,
    messageId: string,
    action: AgentActionProposal | AgentPersistedActionV2,
  ): SendDraft | undefined {
    if (action.kind !== 'send' || action.effect !== 'open_wallet_review') return undefined;
    const draft = this.retainedState.get<SendDraft>(SEND_DRAFT_NAMESPACE, action.draftId);
    const snapshot = this.dependencies.session.snapshot();
    const active = getActiveAccount(snapshot.host);
    const isExpired = Boolean(draft && draft.expiresAt <= this.now());
    if (isExpired) this.retainedState.delete(SEND_DRAFT_NAMESPACE, action.draftId);
    if (
      !draft
      || isExpired
      || draft.threadId !== threadId
      || draft.actionId !== action.id
      || draft.sourceToolCallId !== action.sourceToolCallId
      || draft.assistantMessageId !== messageId
      || draft.network !== snapshot.host?.activeNetwork
      || draft.authorityBinding !== buildAgentV2SendAuthorityKey(snapshot.host)
      || !active
      || draft.accountId !== active.accountId
      || active.state !== 'active'
      || active.isViewOnly
    ) return undefined;
    return draft;
  }
}

class WalletToolError extends Error {
  constructor(
    readonly code: Extract<AgentToolResultRequestV2, { status: 'error' }>['error']['code'],
    message: string,
    readonly retryable: boolean,
    readonly status: 'error' | 'rejected' | 'cancelled' = 'rejected',
  ) {
    super(message);
  }
}

function authorityBinding(authority: Awaited<ReturnType<AgentV2WalletSession['walletAuthorityBinding']>>) {
  return JSON.stringify([
    authority.accountDigest,
    authority.profileDigest,
    authority.revision,
    authority.sessionId,
  ]);
}

function getWalletQueryPreflightMessage(failure: WalletQueryPreflightFailure) {
  switch (failure.reason) {
    case 'duplicate_transaction_row_id':
      return 'Wallet transaction identifiers are invalid.';
    case 'invalid_transaction_quantity':
      return 'Wallet transaction amounts are invalid.';
    case 'non_monotonic_transaction_order':
      return 'Wallet transactions are not in a valid order.';
    case 'transaction_timestamp_out_of_bounds':
      return 'Wallet transaction timestamps are outside the requested range.';
    case 'transaction_detail_hash_leaked':
      return 'Wallet transaction details contain a full transaction hash.';
  }
}

type ToolResultBase = Pick<
  AgentToolResultRequestV2,
  'protocolVersion' | 'runId' | 'threadId' | 'toolCallId' | 'clientToolResultId' | 'completedAt'
>;
type ToolResultFailureStatus = 'error' | 'rejected' | 'cancelled';
type StakingOfferFailure = Extract<AgentToolResultRequestV2, {
  toolName: 'staking.offer.read';
  status: ToolResultFailureStatus;
}>;

function failure(
  base: ToolResultBase,
  toolCall: AgentToolCall,
  code: Extract<AgentToolResultRequestV2, { status: 'error' }>['error']['code'],
  retryable: boolean,
  status: ToolResultFailureStatus = 'rejected',
): AgentToolResultRequestV2 {
  if (toolCall.name === 'wallet.directory.query') {
    return {
      ...base,
      directorySession: toolCall.directorySession,
      toolName: toolCall.name,
      status,
      error: { code, retryable },
    } satisfies AgentToolResultRequestV2;
  }
  if (toolCall.name === 'staking.offer.read') {
    return {
      ...base,
      walletContextSession: toolCall.walletContextSession,
      toolName: toolCall.name,
      status,
      error: { code: stakingOfferErrorCode(code), retryable },
    } satisfies AgentToolResultRequestV2;
  }

  const resultBase = {
    ...base,
    walletContextSession: toolCall.walletContextSession,
    toolName: toolCall.name,
    error: { code, retryable },
  };
  switch (status) {
    case 'error':
      return { ...resultBase, status: 'error' } satisfies AgentToolResultRequestV2;
    case 'rejected':
      return { ...resultBase, status: 'rejected' } satisfies AgentToolResultRequestV2;
    case 'cancelled':
      return { ...resultBase, status: 'cancelled' } satisfies AgentToolResultRequestV2;
  }
}

function stakingOfferErrorCode(
  code: Extract<AgentToolResultRequestV2, { status: 'error' }>['error']['code'],
): StakingOfferFailure['error']['code'] {
  switch (code) {
    case 'consent_required':
    case 'tool_unsupported':
    case 'capability_unsupported':
    case 'invalid_arguments':
    case 'validation_failed':
    case 'result_too_large':
    case 'tool_scope_mismatch':
    case 'wallet_context_changed':
    case 'tool_timeout':
    case 'tool_failed':
      return code;
    default:
      return 'tool_failed';
  }
}

function stakingOfferUnavailable(
  reason: Extract<AgentStakingOfferReadResultV1, { status: 'unavailable' }>['reason'],
  readAt: string,
): AgentStakingOfferReadResultV1 {
  return { schemaVersion: 1, status: 'unavailable', reason, readAt };
}

function stakingCatalogUnavailable(readAt: string): AgentStakingOffersListResultV1 {
  return { schemaVersion: 1, status: 'unavailable', reason: 'state_unavailable', readAt };
}

function matchesAgentAssetIdentitySelector(asset: AgentAssetIdentityV2, selector: AgentAssetIdentityV2) {
  return asset.slug === selector.slug
    && asset.chain === selector.chain
    && asset.symbol === selector.symbol
    && (selector.name === undefined || asset.name === selector.name)
    && (selector.tokenAddress === undefined || asset.tokenAddress === selector.tokenAddress)
    && (selector.decimals === undefined || asset.decimals === selector.decimals);
}

function successEnvelope<T>(
  result: T,
  completedAt: string,
  metadata?: {
    freshness?: AgentToolFreshness;
    omittedFields?: string[];
    maxResultBytes?: number;
    redactionLevel?: 'minimal' | 'scoped';
    warnings?: { code: 'partial_coverage' }[];
  },
) {
  return {
    schemaVersion: 1 as const,
    freshness: metadata?.freshness ?? storeFreshness(completedAt),
    redaction: {
      level: metadata?.redactionLevel ?? 'scoped' as const,
      omittedFields: metadata?.omittedFields ?? ['rawAccountId', 'address', 'walletAddress'],
      maxResultBytes: metadata?.maxResultBytes ?? MAX_RESULT_BYTES,
    },
    ...(metadata?.warnings?.length ? { warnings: metadata.warnings } : {}),
    result,
  };
}

function directorySuccessEnvelope(
  result: AgentWalletDirectoryResultV1,
  completedAt: string,
  maxResultBytes = MAX_RESULT_BYTES,
): AgentWalletDirectorySuccessV1 {
  return {
    schemaVersion: 1,
    freshness: storeFreshness(completedAt),
    redaction: {
      level: 'scoped',
      omittedFields: [],
      maxResultBytes,
    },
    result,
  };
}

function multiplyPositiveDecimals(left?: string | number, right?: string | number) {
  if (!left || !right) return undefined;
  try {
    const result = new Big(left).mul(right);
    return result.gt(0) ? result.toFixed() : undefined;
  } catch {
    return undefined;
  }
}

function dividePositiveDecimals(left?: string | number, right?: string | number) {
  if (!left || !right) return undefined;
  try {
    const divisor = new Big(right);
    if (!divisor.gt(0)) return undefined;
    const result = new Big(left).div(divisor);
    return result.gt(0) ? result.toFixed() : undefined;
  } catch {
    return undefined;
  }
}

function canonicalDecimal(value?: string | number) {
  if (value === undefined) return undefined;
  try {
    const result = new Big(value);
    return result.eq(0) ? '0' : result.toFixed();
  } catch {
    return undefined;
  }
}

function canonicalBoundedYield(value: string | number) {
  const result = canonicalDecimal(value);
  if (result === undefined) return undefined;
  const numeric = new Big(result);
  return numeric.gte(0) && numeric.lte(100_000) ? result : undefined;
}

function serializedByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function storeFreshness(asOf: string) {
  return { asOf, source: 'store' as const, isStale: false as const };
}

function sendDraftErrorCode(error: ApiAnyDisplayError): AgenticWalletToolErrorCode {
  switch (error) {
    case ApiTransactionDraftError.InvalidAmount:
      return 'invalid_amount';
    case ApiCommonError.InvalidAddress:
    case ApiTransactionDraftError.InvalidToAddress:
    case ApiTransactionDraftError.InvalidAddressFormat:
      return 'invalid_recipient';
    case ApiCommonError.DomainNotResolved:
      return 'recipient_unresolved';
    case ApiTransactionDraftError.InactiveContract:
      return 'recipient_inactive';
    case ApiTransactionDraftError.InsufficientBalance:
      return 'insufficient_balance';
    case ApiTransactionDraftError.WalletNotInitialized:
      return 'wallet_not_initialized';
    case ApiCommonError.UnsupportedVersion:
      return 'capability_unsupported';
    case ApiTransactionDraftError.InvalidStateInit:
    case ApiTransactionDraftError.MfaNftBatchLimit:
      return 'validation_failed';
    default:
      return 'tool_failed';
  }
}

function uniqueAssets(assets: AgentAssetIdentityV2[]) {
  const unique = new Map<string, AgentAssetIdentityV2>();
  assets.forEach((asset) => unique.set([asset.slug, asset.chain, asset.tokenAddress ?? ''].join('\0'), asset));
  return [...unique.values()];
}

function money(asset: AgentAssetIdentityV2 & { decimals?: number }, value: string) {
  if (!isDecimal(value)) throw new WalletToolError('validation_failed', 'A wallet balance is invalid.', false);
  return {
    value,
    valueType: 'decimal' as const,
    decimals: asset.decimals ?? 0,
    symbol: safeWalletQueryAssetSymbol(asset),
    slug: asset.slug,
    chain: asset.chain,
    ...(asset.tokenAddress ? { tokenAddress: asset.tokenAddress } : {}),
  };
}

function getActiveAccount(host?: AgentV2HostContextSnapshot) {
  return host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
}

function isDecimal(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value);
}

function decimalToAtomic(value: string, decimals: number) {
  if (!isDecimal(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new WalletToolError('invalid_amount', 'The transfer amount is invalid.', false);
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new WalletToolError('invalid_amount', 'The transfer amount precision is invalid.', false);
  }
  return BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
}

function resolveSendDestination(
  session: AgentV2WalletSession,
  active: AgentV2HostAccount,
  recipient: ActionSendPrepareArgs['recipient'],
  network: ApiChain,
) {
  if (recipient.kind === 'savedAddress') {
    const snapshot = session.snapshot();
    const raw = snapshot.addresses.get(recipient.addressRef);
    const entry = (active.savedAddresses ?? []).find((candidate) => (
      session.resolveSavedAddressRefs(active.accountId, candidate.id)?.addressRef === recipient.addressRef
    )) ?? snapshot.host?.savedAddresses.find((candidate) => (
      snapshot.addressRefs.get(`saved:${candidate.id}`) === recipient.addressRef
    ));
    const ownAccount = snapshot.host?.accounts.find((account) => (
      account.accountId !== active.accountId
      && session.resolveWalletAddressRefs(account.accountId, network)?.addressRef === recipient.addressRef
    ));
    if (!raw || (!entry && !ownAccount) || (entry && entry.chain !== network)) {
      throw new WalletToolError('invalid_recipient', 'The saved recipient is invalid.', false);
    }
    const label = ownAccount
      ? safeWalletQueryAccountLabel(ownAccount)
      : safeWalletQueryIdentifierDisplay(entry?.name, raw, 80);
    return {
      raw,
      summary: {
        kind: 'savedAddress' as const,
        label,
        chain: network,
        addressRef: recipient.addressRef,
        disclosure: 'hidden' as const,
      },
      presentation: {
        kind: 'savedAddress' as const,
        label,
      },
    };
  }
  if (recipient.chain !== network) {
    throw new WalletToolError('invalid_recipient', 'The recipient network is invalid.', false);
  }
  const raw = recipient.kind === 'address' ? recipient.address : recipient.domain;
  if (!raw.trim()) throw new WalletToolError('invalid_recipient', 'The recipient is invalid.', false);
  return {
    raw,
    summary: {
      kind: recipient.kind === 'address' ? 'external' as const : 'domain' as const,
      chain: network,
      disclosure: 'hidden' as const,
    },
    presentation: { kind: recipient.kind === 'address' ? 'external' as const : 'domain' as const },
  };
}

function requireApiChain(value?: string): ApiChain {
  if (!getIsSupportedChain(value)) {
    throw new WalletToolError('capability_unsupported', 'The active network is not supported.', false);
  }
  return value;
}
