import type {
  ActionSendPrepareArgs,
  ActionSendPrepareSuccessV1,
} from './actions';
import type {
  AgentIntentSource,
} from './coreRun';
import type {
  AgentApiChain,
  AgentMoneyAmount,
  AgentSemanticAssetV1,
  AgentToolFreshness,
  AgentToolRedaction,
  AgentToolScope,
  AgentToolSuccessEnvelopeBaseV1,
  UtcTimestampMs,
  Uuid,
  UuidInput,
} from './shared';

export type AgentWalletSemanticOperationV2 =
  | 'account.inventory'
  | 'assets.search'
  | 'positions.list'
  | 'portfolio.aggregate'
  | 'transactions.list'
  | 'transactions.detail'
  | 'value.series'
  | 'contacts.list';

export interface AgentWalletPortfolioAggregateArgsV5 {
  schemaVersion: 5;
  operation: 'portfolio.aggregate';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  accountFilter?: AgentWalletAccountFilterV1;
  chains: AgentApiChain[];
  range: AgentWalletQueryHistoryRangeV1;
  groupBy: ('account' | 'asset' | 'network' | 'position_type')[];
  riskMode: AgentWalletRiskModeV1;
  visibilityMode: AgentWalletVisibilityModeV1;
}

export interface AgentWalletAccountFilterV1 {
  viewOnly: 'include' | 'exclude' | 'only';
}

export interface AgentWalletPortfolioAggregateResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'portfolio.aggregate';
  policySummary: AgentWalletDataPolicySummaryV1;
  total: AgentWalletPortfolioTotalV1;
  rangePnl?: AgentWalletPortfolioRangePnlV1;
  allocations: AgentWalletPortfolioAllocationV1[];
  positions: AgentWalletDataPositionRowV3[];
  aggregates: AgentWalletDataAggregateRowV2[];
  series: AgentWalletDataSeriesV1[];
}

export interface AgentWalletPortfolioRangePnlV1 {
  semantics: 'portfolio_pnl';
  range: AgentWalletQueryHistoryRangeV1;
  amount: string;
  percent?: string;
  baseCurrency: string;
  startAt: UtcTimestampMs;
  endAt: UtcTimestampMs;
}

export interface AgentWalletPortfolioTotalV1 {
  value: string;
  baseCurrency: string;
  unpricedCount: number;
}

export interface AgentWalletPortfolioAllocationV1 {
  asset: AgentAssetIdentityV2;
  value: string;
  baseCurrency: string;
  percent: string;
}

export type AgentAssetSearchContentV1 =
  | {
    kind: 'assetSearch';
    schemaVersion: 1;
    outcome: 'complete_matches' | 'partial_matches';
    asset: AgentSemanticAssetV1;
    coverage: AgentAssetSearchPublicCoverageV1;
    /**
       * @minItems 1
       * @maxItems 100
       */
    holdings: AgentAssetSearchHoldingV1[];
  }
  | {
    kind: 'assetSearch';
    schemaVersion: 1;
    outcome: 'complete_absent' | 'incomplete_unconfirmed';
    asset: AgentSemanticAssetV1;
    coverage: AgentAssetSearchPublicCoverageV1;
  }
  | {
    kind: 'assetSearch';
    schemaVersion: 1;
    outcome: 'ambiguous';
    /**
       * @minItems 2
       * @maxItems 10
       */
    candidates: AgentSemanticAssetV1[];
  }
  | {
    kind: 'assetSearch';
    schemaVersion: 1;
    outcome: 'scope_denied';
    reason: 'consent_required' | 'account_scope_not_allowed';
  };

export type AgentWalletQueryFeatureStatusV1 = 'available' | 'disabled';

export type AgentStakingOfferFeatureStatusV1 = 'available' | 'disabled';

export type AgentStakingCatalogFeatureStatusV1 = 'available' | 'disabled';

export type AgenticWalletToolErrorCode =
  | 'consent_required'
  | 'tool_unsupported'
  | 'capability_unsupported'
  | 'invalid_arguments'
  | 'invalid_amount'
  | 'invalid_recipient'
  | 'recipient_unresolved'
  | 'recipient_inactive'
  | 'memo_required'
  | 'wallet_not_initialized'
  | 'account_scope_not_allowed'
  | 'view_only_prepare_forbidden'
  | 'asset_ambiguous'
  | 'address_ambiguous'
  | 'validation_failed'
  | 'insufficient_balance'
  | 'quote_unavailable'
  | 'offline_prepare_unavailable'
  | 'stale_data_unavailable'
  | 'draft_expired'
  | 'draft_invalidated'
  | 'result_too_large'
  | 'tool_scope_mismatch'
  | 'wallet_context_changed'
  | 'tool_timeout'
  | 'tool_failed';

export type AgentWalletQueryContentV1 =
  | {
    kind: 'walletQuery';
    schemaVersion: 1;
    queryKind: 'accounts';
    outcome: 'complete' | 'empty' | 'partial';
    hasMore: boolean;
    omittedRows?: AgentWalletPolicyCounterV1;
    rows: AgentWalletQueryAccountRowV1[];
  }
  | {
    kind: 'walletQuery';
    schemaVersion: 1;
    queryKind: 'transactions';
    outcome: 'complete' | 'empty' | 'partial';
    hasMore: boolean;
    omittedRows?: AgentWalletPolicyCounterV1;
    policySummary?: AgentWalletQueryPolicySummaryV1;
    /**
       * @maxItems 100
       */
    rows: AgentWalletQueryTransactionRowV1[];
  }
  | {
    kind: 'walletQuery';
    schemaVersion: 1;
    queryKind: 'positions';
    outcome: 'complete' | 'empty' | 'partial';
    hasMore: boolean;
    omittedRows?: AgentWalletPolicyCounterV1;
    policySummary?: AgentWalletQueryPolicySummaryV1;
    /**
       * @maxItems 100
       */
    rows: AgentWalletQueryPositionRowV1[];
  };

export type AgentWalletQueryAccountSelectorV2 =
  | {
    kind: 'current';
  }
  | {
    kind: 'explicitAll';
  }
  | {
    kind: 'named';
    label: string;
  }
  | {
    kind: 'ordinal';
    index: number;
  }
  | {
    kind: 'anchored';
    scopeAnchor: string;
    label: string;
  };

export type AgentWalletFilterClauseV1 =
  | {
    field: 'transaction.status';
    operator: 'in';
    /**
       * @minItems 1
       * @maxItems 6
       */
    values: ('pending' | 'pendingTrusted' | 'confirmed' | 'completed' | 'failed' | 'expired')[];
  }
  | {
    field: 'transaction.direction';
    operator: 'in';
    /**
       * @minItems 1
       * @maxItems 3
       */
    values: ('incoming' | 'outgoing' | 'self')[];
  }
  | {
    field: 'transaction.chain';
    operator: 'in';
    /**
       * @minItems 1
       * @maxItems 16
       */
    values: AgentApiChain[];
  }
  | {
    field: 'transaction.timestamp';
    operator: 'timestamp_range';
    range: AgentWalletTimestampRangeV1;
  }
  | {
    field: 'transaction.asset';
    operator: 'asset_matches_any';
    /**
       * @minItems 1
       * @maxItems 10
       */
    values: AgentAssetSelector[];
  };

export type AgentWalletRiskModeV1 = 'exclude' | 'only' | 'all';

export type AgentWalletVisibilityModeV1 = 'visible' | 'hidden' | 'all';

export type AgentWalletQueryHistoryRangeV1 = '1d' | '7d' | '1m' | '3m' | '1y' | 'all';

export type AgentWalletContextV2 =
  | {
    mode: 'none';
    reason: 'noConsent' | 'noWallet' | 'unsupportedClient';
  }
  | AgentWalletContextGrantV2;

type AgentToolCallBase = Record<string, unknown> & {
  id: Uuid;
  version: 1 | 5;
  maxResultBytes?: number;
  /**
   * @minItems 1
   */
  scopes: AgentToolScope[];
  timeoutMs: number;
  intentSource?: AgentIntentSource;
  scopeIntent?: AgentToolScopeIntentV2;
  reason?: string;
};

export type AgentToolCall = AgentToolCallBase & (
  | {
    name: 'wallet.directory.query';
    version: 1;
    arguments: AgentWalletDirectoryQueryArgsV1;
    directorySession: AgentWalletDirectorySessionV1;
    directoryGrant: AgentWalletDirectoryGrantV1;
    walletContextSession?: never;
    scopeIntent?: never;
  }
  | {
    name: 'wallet.data.query';
    version: 5;
    arguments: AgentWalletDataQueryArgsV5;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
  | {
    name: 'action.send.prepare';
    version: 1;
    arguments: ActionSendPrepareArgs;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
  | {
    name: 'action.swap.prepare';
    version: 1;
    arguments: ActionSwapPrepareArgsV1;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
  | {
    name: 'market.asset.quote';
    version: 1;
    arguments: AgentMarketQuoteArgsV1;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
  | {
    name: 'staking.offer.read';
    version: 1;
    arguments: AgentStakingOfferReadArgsV1;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
  | {
    name: 'staking.offers.list';
    version: 1;
    arguments: AgentStakingOffersListArgsV1;
    walletContextSession: AgentToolWalletContextSessionV2;
    directorySession?: never;
    directoryGrant?: never;
  }
);

export type AgentToolName =
  | 'wallet.data.query'
  | 'wallet.directory.query'
  | 'action.send.prepare'
  | 'action.swap.prepare'
  | 'market.asset.quote'
  | 'staking.offer.read'
  | 'staking.offers.list';

export interface AgentSwapSelectorV1 {
  kind: 'query';
  query: string;
  chain?: AgentApiChain;
}

export interface AgentSwapAmountV1 {
  value: string;
  valueType: 'decimal';
  side: 'source' | 'destination';
}

export interface ActionSwapPrepareArgsV1 {
  schemaVersion: 1;
  sourceSelector: AgentSwapSelectorV1;
  destinationSelector: AgentSwapSelectorV1;
  amount: AgentSwapAmountV1;
}

export type AgentSwapIndicativeQuoteV1 =
  | {
    status: 'resolved';
    kind: 'indicative_spot';
    from: AgentMoneyAmount;
    to: AgentMoneyAmount;
    observedAt: UtcTimestampMs;
  }
  | {
    status: 'unavailable';
    reason: 'price_unavailable';
    observedAt: UtcTimestampMs;
  };

export type ActionSwapPrepareResultV1 =
  | {
    schemaVersion: 1;
    status: 'ready';
    sourceAsset: AgentAssetIdentityV2;
    destinationAsset: AgentAssetIdentityV2;
    amount: AgentSwapAmountV1;
    quote: AgentSwapIndicativeQuoteV1;
  }
  | {
    schemaVersion: 1;
    status: 'asset_not_found';
    side: 'source' | 'destination';
    observedAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'asset_ambiguous';
    side: 'source' | 'destination';
    candidates: AgentAssetIdentityV2[];
    hasMore: boolean;
    observedAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'same_asset';
    asset: AgentAssetIdentityV2;
    observedAt: UtcTimestampMs;
  };

export type ActionSwapPrepareSuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  result: ActionSwapPrepareResultV1;
};

export type AgentMarketQuoteSelectorV1 =
  | { kind: 'query'; query: string; chain?: AgentApiChain }
  | { kind: 'asset'; asset: AgentAssetIdentityV2 };

export type AgentMarketQuoteArgsV1 =
  | {
    schemaVersion: 1;
    quoteCurrency: string;
    selector: AgentMarketQuoteSelectorV1;
  }
  | {
    schemaVersion: 1;
    quoteAsset: AgentAssetIdentityV2;
    selector: AgentMarketQuoteSelectorV1;
  };

export type AgentMarketQuoteResultV1 =
  | {
    schemaVersion: 1;
    status: 'resolved';
    asset: AgentAssetIdentityV2;
    price: string;
    quoteCurrency: string;
    percentChange24h: string;
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'price_unavailable';
    asset: AgentAssetIdentityV2;
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'resolved';
    asset: AgentAssetIdentityV2;
    price: string;
    quoteAsset: AgentAssetIdentityV2;
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'ambiguous';
    candidates: AgentAssetIdentityV2[];
    hasMore: boolean;
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'not_found';
    readAt: UtcTimestampMs;
  };

export type AgentMarketQuoteSuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  result: AgentMarketQuoteResultV1;
};

export interface AgentStakingOfferReadArgsV1 {
  schemaVersion: 1;
  productId: string;
  asset: AgentAssetIdentityV2;
}

export type AgentStakingOfferReadResultV1 =
  | {
    schemaVersion: 1;
    status: 'available';
    productId: string;
    asset: AgentAssetIdentityV2;
    yieldType: 'APY' | 'APR';
    depositAvailability?: 'available' | 'disabled';
    annualYield: string;
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'unavailable';
    reason: 'product_not_found' | 'asset_mismatch' | 'staking_disabled' | 'state_unavailable';
    readAt: UtcTimestampMs;
  };

export type AgentStakingOfferReadSuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  result: AgentStakingOfferReadResultV1;
};

export interface AgentStakingOffersListArgsV1 {
  schemaVersion: 1;
}

export interface AgentStakingCatalogOfferV1 {
  productId: string;
  asset: AgentAssetIdentityV2;
  annualYield: string;
  yieldType: 'APY' | 'APR';
  depositAvailability: 'available' | 'disabled';
  disabledReason?: 'deposits_closed' | 'protocol_disabled';
}

export type AgentStakingOffersListResultV1 =
  | {
    schemaVersion: 1;
    status: 'resolved';
    offers: AgentStakingCatalogOfferV1[];
    readAt: UtcTimestampMs;
  }
  | {
    schemaVersion: 1;
    status: 'unavailable';
    reason: 'state_unavailable';
    readAt: UtcTimestampMs;
  };

export type AgentStakingOffersListSuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  result: AgentStakingOffersListResultV1;
};

export type AgentWalletDataQueryArgsV5 =
  | AgentWalletAccountInventoryArgsV5
  | AgentWalletAssetsSearchArgsV5
  | AgentWalletPositionsListArgsV5
  | AgentWalletPortfolioAggregateArgsV5
  | AgentWalletTransactionsListArgsV5
  | AgentWalletTransactionsDetailArgsV5
  | AgentWalletContactsListArgsV5
  | AgentWalletValueSeriesArgsV5;

export interface AgentWalletAccountInventoryArgsV5 {
  schemaVersion: 5;
  operation: 'account.inventory';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  chains: AgentApiChain[];
  includePublicAddressReason?: 'receive' | 'wallet_location' | 'prepare_validation';
  includePortfolioTotals?: true;
}

export interface AgentWalletAssetsSearchArgsV5 {
  schemaVersion: 5;
  operation: 'assets.search';
  query: string;
  chains: AgentApiChain[];
  pageSize: number;
}

export interface AgentWalletPositionsListArgsV5 {
  schemaVersion: 5;
  operation: 'positions.list';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  chains: AgentApiChain[];
  assetSelectors: AgentAssetSelector[];
  positionKinds: AgentWalletPositionKindV1[];
  riskMode: AgentWalletRiskModeV1;
  visibilityMode: AgentWalletVisibilityModeV1;
  includeZero: boolean;
  sort: 'wallet_order' | 'value_desc' | 'quantity_desc';
  pageSize: number;
}

export interface AgentWalletTransactionsListArgsV5 {
  schemaVersion: 5;
  operation: 'transactions.list';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  chains: AgentApiChain[];
  filters: AgentWalletFilterSetV1;
  riskMode: AgentWalletRiskModeV1;
  pageSize: number;
}

export interface AgentWalletTransactionsDetailArgsV5 {
  schemaVersion: 5;
  operation: 'transactions.detail';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  hash: string;
}

export interface AgentWalletContactsListArgsV5 {
  schemaVersion: 5;
  operation: 'contacts.list';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  query: string | null;
  chains: AgentApiChain[];
  pageSize: number;
}

export interface AgentWalletValueSeriesArgsV5 {
  schemaVersion: 5;
  operation: 'value.series';
  accountSelector: AgentWalletQueryAccountSelectorV2;
  chains: AgentApiChain[];
  metric: 'portfolio_value' | 'position_value';
  assetSelectors: AgentAssetSelector[];
  range: AgentWalletQueryHistoryRangeV1;
  maxPoints: number;
}

export type AgentWalletPositionKindV1 = 'fungible' | 'nft' | 'staking' | 'vesting' | 'vault';

export type AgentToolError = Record<string, unknown> & {
  code: AgenticWalletToolErrorCode;
  retryable: boolean;
};

export type AgentStakingOfferReadToolErrorCode =
  | 'consent_required'
  | 'tool_unsupported'
  | 'capability_unsupported'
  | 'invalid_arguments'
  | 'validation_failed'
  | 'result_too_large'
  | 'tool_scope_mismatch'
  | 'wallet_context_changed'
  | 'tool_timeout'
  | 'tool_failed';

export type AgentStakingOfferReadToolError = Record<string, unknown> & {
  code: AgentStakingOfferReadToolErrorCode;
  retryable: boolean;
};

export type AgentToolResultRequestV2 =
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    directorySession: AgentWalletDirectorySessionV1;
    toolName: 'wallet.directory.query';
    status: 'success';
    result: AgentWalletDirectorySuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'wallet.data.query';
    status: 'success';
    result: AgentWalletDataQuerySuccessV5;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'action.send.prepare';
    status: 'success';
    result: ActionSendPrepareSuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'action.swap.prepare';
    status: 'success';
    result: ActionSwapPrepareSuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'market.asset.quote';
    status: 'success';
    result: AgentMarketQuoteSuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'staking.offer.read';
    status: 'success';
    result: AgentStakingOfferReadSuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'staking.offers.list';
    status: 'success';
    result: AgentStakingOffersListSuccessV1;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    directorySession: AgentWalletDirectorySessionV1;
    toolName: 'wallet.directory.query';
    status: 'error' | 'rejected' | 'cancelled';
    error: AgentToolError;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: Exclude<AgentToolName, 'wallet.directory.query' | 'staking.offer.read'>;
    status: 'error';
    error: AgentToolError;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: Exclude<AgentToolName, 'wallet.directory.query' | 'staking.offer.read'>;
    status: 'rejected';
    error: AgentToolError;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: Exclude<AgentToolName, 'wallet.directory.query' | 'staking.offer.read'>;
    status: 'cancelled';
    error: AgentToolError;
  }
  | {
    protocolVersion: 2;
    runId: UuidInput;
    threadId: UuidInput;
    toolCallId: UuidInput;
    clientToolResultId: UuidInput;
    completedAt: UtcTimestampMs;
    walletContextSession: AgentToolWalletContextSessionInputV2;
    toolName: 'staking.offer.read';
    status: 'error' | 'rejected' | 'cancelled';
    error: AgentStakingOfferReadToolError;
  };

export interface AgentWalletDirectoryQueryArgsV1 {
  schemaVersion: 1;
  purpose: 'send_wallet_resolution';
}

export interface AgentWalletDirectoryGrantV1 {
  schemaVersion: 1;
  kind: 'send_wallet_resolution';
  sourceCapabilityId: 'wallet.send-prepare';
  messageId: Uuid;
  sessionId: Uuid;
  revision: number;
}

export interface AgentWalletDirectorySessionV1 {
  sessionId: Uuid;
  revision: number;
  activeAccountRef: string;
}

export interface AgentWalletDirectoryAccountRowV1 {
  accountRef: string;
  label: string;
  isCurrent: boolean;
  state: 'active' | 'stale';
  chains: AgentApiChain[];
}

export interface AgentWalletDirectoryResultV1 {
  schemaVersion: 1;
  status: 'complete';
  generatedAt: UtcTimestampMs;
  coverage: {
    accountsRequested: number;
    accountsIncluded: number;
    rowsOmitted: 0;
  };
  sessionId: Uuid;
  revision: number;
  accounts: AgentWalletDirectoryAccountRowV1[];
}

export type AgentWalletDirectorySuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  freshness: AgentToolFreshness & { source: 'store' | 'store_refreshed'; isStale: false };
  redaction: AgentToolRedaction & { level: 'scoped'; omittedFields: []; maxResultBytes: number };
  result: AgentWalletDirectoryResultV1;
};

export type AgentWalletDataQuerySuccessV5 = AgentToolSuccessEnvelopeBaseV1 & {
  result: AgentWalletDataQueryResultV5;
};

export type AgentWalletDataQueryResultV5 =
  | AgentWalletAccountInventoryResultV5
  | AgentWalletAssetsSearchResultV5
  | AgentWalletPositionsListResultV5
  | AgentWalletPortfolioAggregateResultV5
  | AgentWalletTransactionsListResultV5
  | AgentWalletTransactionsDetailResultV5
  | AgentWalletContactsListResultV5
  | AgentWalletValueSeriesResultV5
  | AgentWalletScopeResolutionRequiredResultV5;

export interface AgentWalletResolvedResultBaseV5 {
  schemaVersion: 5;
  status: 'resolved';
  generatedAt: UtcTimestampMs;
  freshness: AgentWalletDataFreshnessV2;
  coverage: AgentWalletDataCoverageV5;
}

export interface AgentWalletScopedResolvedResultBaseV5 extends AgentWalletResolvedResultBaseV5 {
  resolvedScope: AgentWalletResolvedScopeV1;
}

export interface AgentWalletAccountInventoryResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'account.inventory';
  accounts: AgentWalletDataAccountRowV3[];
}

export interface AgentWalletAssetsSearchResultV5 extends AgentWalletResolvedResultBaseV5 {
  operation: 'assets.search';
  assets: AgentWalletAssetSearchRowV1[];
  resolution: 'no_match' | 'unique' | 'ambiguous';
}

export interface AgentWalletAssetSearchRowV1 {
  asset: AgentAssetIdentityV2;
  matchQuality: 'exact' | 'prefix' | 'partial' | 'fuzzy';
  matchedOn: 'symbol' | 'name' | 'slug' | 'address';
}

export interface AgentWalletPositionsListResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'positions.list';
  policySummary: AgentWalletDataPolicySummaryV1;
  positions: AgentWalletDataPositionRowV3[];
}

export interface AgentWalletTransactionsListResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'transactions.list';
  policySummary: AgentWalletDataPolicySummaryV1;
  appliedFilterDigest: string;
  transactions: AgentWalletDataTransactionRowV3[];
}

export interface AgentWalletTransactionsDetailResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'transactions.detail';
  transaction: AgentWalletDataTransactionRowV3 | null;
}

export interface AgentWalletContactsListResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'contacts.list';
  contacts: AgentWalletDataContactRowV3[];
}

export interface AgentWalletValueSeriesResultV5 extends AgentWalletScopedResolvedResultBaseV5 {
  operation: 'value.series';
  series: AgentWalletDataSeriesV1[];
}

export interface AgentWalletScopeResolutionRequiredResultV5 {
  schemaVersion: 5;
  operation: Exclude<AgentWalletSemanticOperationV2, 'assets.search'>;
  status: 'scope_resolution_required';
  reason: 'ambiguous' | 'not_found';
  choices: AgentWalletAccountChoiceV1[];
}

export type AgentWalletDataCoverageV5 = Record<string, unknown> & {
  status: 'complete' | 'partial' | 'unavailable';
  emptyReason?: 'no_matching_rows';
  accountsRequested: number;
  accountsIncluded: number;
  rowsOmitted: number;
  /**
   * @maxItems 8
   */
  limitations: (
    | 'account_limit'
    | 'row_limit'
    | 'history_limit'
    | 'source_partial'
    | 'source_unavailable'
    | 'stale_data'
    | 'unpriced_positions'
    | 'retry_exhausted'
  )[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  sourceOutcomes: AgentWalletSourceOutcomeV1[];
};

export type AgentWalletSourceOutcomeV1 = Record<string, unknown> & {
  domain: 'accounts' | 'assets' | 'positions' | 'portfolio' | 'transactions' | 'value_series' | 'contacts';
  status: 'complete' | 'complete_empty' | 'failed_retryable' | 'failed_terminal' | 'not_loaded' | 'stale';
  attempts: number;
  accountsRequested?: number;
  accountsIncluded?: number;
  reason?:
    | 'timeout'
    | 'transport'
    | 'upstream_unavailable'
    | 'unsupported'
    | 'not_found'
    | 'authorization'
    | 'stale_cache'
    | 'deadline_exceeded'
    | 'unknown';
};

export type AgentWalletDataPositionRowV3 = Record<string, unknown> & {
  rowId: string;
  kind: 'position';
  accountRef: string;
  accountLabel: string;
  assetRef?: string;
  positionKind: 'fungible' | 'nft' | 'staking' | 'vesting' | 'vault';
  chain: AgentApiChain;
  label: string;
  asset: AgentAssetIdentityV2;
  quantity: string;
  decimals: number;
  /** Omitted when spendable quantity is unknown. */
  availableQuantity?: string;
  valuationStatus: 'valued' | 'unpriced' | 'not_applicable';
  fiatValue?: string;
  baseCurrency?: string;
  status?: 'active' | 'unstaking' | 'ready' | 'frozen' | 'locked';
  apy?: string;
  rewards?: string;
  collection?: string;
  isOnSale?: boolean;
  riskVerdict?: 'spam';
};

export type AgentWalletDataSeriesV1 = Record<string, unknown> & {
  seriesId: string;
  metric: 'portfolio_value' | 'position_value';
  label: string;
  baseCurrency: string;
  asset?: AgentAssetIdentityV2;
  /**
   * @minItems 1
   * @maxItems 64
   */
  points: AgentWalletDataSeriesPointV1[];
};

export interface AgentAccountListItem {
  accountRef: string;
  label: string;
  accountType: 'regular' | 'ledger' | 'viewOnly' | 'multisig' | 'unknown';
  isCurrent: boolean;
  state: 'active' | 'stale' | 'deleted';
  isViewOnly: boolean;
  /**
   * @minItems 1
   * @maxItems 16
   */
  chains: AgentApiChain[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  publicAddresses?: AgentAccountPublicAddress[];
}

export interface AgentAccountPublicAddress {
  chain: AgentApiChain;
  address: string;
  displayAddress: string;
  disclosure: 'public';
  disclosureReason: 'receive' | 'wallet_location' | 'prepare_validation';
}

export interface AgentAssetIdentityV2 {
  slug: string;
  chain: AgentApiChain;
  symbol: string;
  name?: string;
  tokenAddress?: string;
  decimals?: number;
}

export interface AgentAssetSearchPublicCoverageV1 {
  totalVisibleAccountCount: number;
  checkedAccountCount: number;
  inaccessibleAccountCount: number;
  matchingAccountCount: number;
  omittedHoldingCount: number;
  isComplete: boolean;
}

export interface AgentAssetSearchHoldingV1 {
  accountLabel: string;
}

export interface AgentAssetSelector {
  slug?: string;
  chain?: AgentApiChain;
  tokenAddress?: string;
  symbol?: string;
}

export interface AgentWalletQueryPolicySummaryV1 {
  presentation: 'standard' | 'quarantine' | 'hidden_review';
  omittedSpam?: AgentWalletPolicyCounterV1;
  omittedHidden?: AgentWalletPolicyCounterV1;
  suspicious?: AgentWalletPolicyCounterV1;
}

export interface AgentWalletPolicyCounterV1 {
  count: number;
  accuracy: 'exact' | 'lower_bound';
}

export interface AgentWalletQueryTransactionRowV1 {
  chain: AgentApiChain;
  transactionType:
    | 'transfer'
    | 'swap'
    | 'stake'
    | 'unstake'
    | 'unstakeRequest'
    | 'callContract'
    | 'excess'
    | 'contractDeploy'
    | 'bounced'
    | 'mint'
    | 'burn'
    | 'auctionBid'
    | 'nftTrade'
    | 'dnsChangeAddress'
    | 'dnsChangeSite'
    | 'dnsChangeSubdomains'
    | 'dnsChangeStorage'
    | 'dnsDelete'
    | 'dnsRenew'
    | 'liquidityDeposit'
    | 'liquidityWithdraw';
  status: 'pending' | 'pendingTrusted' | 'confirmed' | 'completed' | 'failed' | 'expired';
  direction?: 'incoming' | 'outgoing' | 'self';
  timestamp: UtcTimestampMs;
  assetSymbol?: string;
  quantity?: string;
  fee?: string;
  hash?: string;
  assetLabelStatus?: 'redacted_unsafe';
}

export interface AgentWalletQueryPositionRowV1 {
  chain: AgentApiChain;
  positionKind: 'fungible' | 'nft' | 'staking' | 'vesting' | 'vault';
  status?: 'active' | 'unstaking' | 'ready' | 'frozen' | 'locked';
  assetSymbol?: string;
  assetName?: string;
  quantity?: string;
  assetLabelStatus?: 'redacted_unsafe' | 'untrusted_plaintext';
}

export interface AgentWalletConversationContextV5 {
  schemaVersion: 5;
  sourceAssistantMessageId: Uuid;
  sessionId: Uuid;
  revision: number;
  operation: Exclude<AgentWalletSemanticOperationV2, 'assets.search'>;
  query: AgentWalletDataQueryArgsV5;
  /**
   * @maxItems 5
   */
  scopeChoices: AgentWalletAccountChoiceV1[];
  expiresAt: UtcTimestampMs;
}

export interface AgentWalletFilterSetV1 {
  schemaVersion: 1;
  catalogDigest: string;
  /**
   * @maxItems 8
   */
  clauses: AgentWalletFilterClauseV1[];
}

export interface AgentWalletTimestampRangeV1 {
  rangeKind:
    | 'today'
    | 'yesterday'
    | 'current_week'
    | 'previous_week'
    | 'current_month'
    | 'previous_month'
    | 'rolling_days'
    | 'rolling_weeks'
    | 'rolling_months'
    | 'absolute';
  fromInclusive: UtcTimestampMs;
  toExclusive: UtcTimestampMs;
  timeZone: string;
  resolvedAt: UtcTimestampMs;
}

export interface AgentWalletAccountChoiceV1 {
  choiceId: string;
  scopeAnchor: string;
  label: string;
  ordinal: number;
  /**
   * @maxItems 16
   */
  chains?: AgentApiChain[];
}

export interface AgentWalletContextGrantV2 {
  mode: 'wallet';
  sessionId: UuidInput;
  revision: number;
  activeAccount: AgentWalletActiveAccountV2;
  activeNetwork: AgentApiChain;
}

export interface AgentWalletActiveAccountV2 {
  accountRef: string;
  state: 'active' | 'stale' | 'deleted';
  isViewOnly: boolean;
  /**
   * @minItems 1
   * @maxItems 16
   */
  chains: AgentApiChain[];
  /**
   * @maxItems 4
   */
  supportedActions: ('send' | 'receive' | 'stake' | 'swap')[];
  /**
   * @maxItems 8
   */
  stakingOffers?: AgentStakingActionOfferV2[];
  /**
   * Staking products whose current yield may be read for informational use.
   * This list grants no staking action authority.
   * @maxItems 8
   */
  stakingYieldOffers?: AgentStakingYieldOfferV1[];
}

export interface AgentStakingActionOfferV2 {
  productId: string;
  asset: AgentAssetIdentityV2;
}

export interface AgentStakingYieldOfferV1 {
  productId: string;
  asset: AgentAssetIdentityV2;
}

export interface AgentWalletScopeSelectionRefV2 {
  sourceAssistantMessageId: UuidInput;
  choiceId: string;
}

export interface AgentToolCallEvent {
  type: 'tool_call';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  toolCall: AgentToolCall;
  createdAt?: UtcTimestampMs;
}

export interface AgentToolWalletContextSessionV2 {
  sessionId: Uuid;
  revision: number;
  accountScope: 'current' | 'selected' | 'explicitAll';
  activeAccountRef: string;
  activeNetwork?: string;
}

export interface AgentToolScopeIntentV2 {
  messageId: Uuid;
  reason: 'selected_wallet_query' | 'explicit_all_wallet_query';
}

export interface AgentToolStatusEvent {
  type: 'tool_status';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  toolCallId: Uuid;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'timeout' | 'rejected' | 'cancelled';
  detailCode?: 'awaiting_wallet' | 'processing' | 'result_rejected' | 'result_timeout' | 'result_unavailable';
  createdAt?: UtcTimestampMs;
}

export interface AgentToolResultAckV2 {
  protocolVersion: 2;
  runId: Uuid;
  toolCallId: Uuid;
  clientToolResultId: Uuid;
  accepted: true;
  duplicate?: boolean;
}

export interface AgentToolWalletContextSessionInputV2 {
  sessionId: UuidInput;
  revision: number;
  accountScope: 'current' | 'selected' | 'explicitAll';
  activeAccountRef: string;
  activeNetwork?: string;
}

export interface AgentWalletResolvedScopeV1 {
  kind: 'current' | 'explicitAll' | 'named' | 'ordinal';
  /**
   * @minItems 1
   * @maxItems 100
   */
  accounts: {
    accountRef: string;
    accountLabel: string;
  }[];
}

export interface AgentWalletDataFreshnessV2 {
  asOf: UtcTimestampMs;
  source: 'cache' | 'network' | 'mixed';
  isStale: boolean;
}

export interface AgentWalletDataPolicySummaryV1 {
  riskMode: AgentWalletRiskModeV1;
  visibilityMode?: AgentWalletVisibilityModeV1;
  spamMatches: AgentWalletPolicyCounterV1;
  hiddenMatches: AgentWalletPolicyCounterV1;
}

export interface AgentWalletDataAccountRowV3 {
  rowId: string;
  kind: 'account';
  accountRef: string;
  accountLabel: string;
  accountType: 'regular' | 'ledger' | 'viewOnly' | 'multisig' | 'unknown';
  isCurrent: boolean;
  state: 'active' | 'stale' | 'deleted';
  isViewOnly: boolean;
  portfolioTotalStatus?: 'complete' | 'partial' | 'unavailable';
  portfolioTotal?: AgentWalletPortfolioTotalV1;
  /**
   * @minItems 1
   * @maxItems 16
   */
  chains: AgentApiChain[];
  /**
   * @maxItems 16
   */
  publicAddresses?: {
    chain: AgentApiChain;
    address: string;
    disclosureReason: 'receive' | 'wallet_location' | 'prepare_validation';
  }[];
}

export interface AgentWalletQueryAccountRowV1 {
  accountLabel: string;
  accountLabelStatus?: 'redacted_unsafe';
  accessMode: 'regular' | 'view_only';
  portfolioTotalStatus: 'complete' | 'partial' | 'unavailable';
  portfolioTotal?: AgentWalletPortfolioTotalV1;
}

export interface AgentWalletDataAggregateRowV2 {
  rowId: string;
  kind: 'aggregate';
  groupKind: 'total' | 'account' | 'asset' | 'network' | 'position_type';
  label: string;
  value: string;
  baseCurrency: string;
  unpricedCount: number;
}

export interface AgentWalletDataTransactionRowV3 {
  rowId: string;
  kind: 'transaction';
  accountRef: string;
  accountLabel: string;
  chain: AgentApiChain;
  displayHash: string;
  transactionType:
    | 'transfer'
    | 'swap'
    | 'stake'
    | 'unstake'
    | 'unstakeRequest'
    | 'callContract'
    | 'excess'
    | 'contractDeploy'
    | 'bounced'
    | 'mint'
    | 'burn'
    | 'auctionBid'
    | 'nftTrade'
    | 'dnsChangeAddress'
    | 'dnsChangeSite'
    | 'dnsChangeSubdomains'
    | 'dnsChangeStorage'
    | 'dnsDelete'
    | 'dnsRenew'
    | 'liquidityDeposit'
    | 'liquidityWithdraw';
  direction: 'incoming' | 'outgoing' | 'self';
  status: 'pending' | 'pendingTrusted' | 'confirmed' | 'completed' | 'failed' | 'expired';
  timestamp: UtcTimestampMs;
  asset?: AgentAssetIdentityV2;
  quantity?: string;
  decimals?: number;
  fee?: AgentWalletTransactionAmountV1;
  counterparty?: AgentWalletTransactionCounterpartyV1;
  safeDescription: string;
  swapDetails?: AgentWalletTransactionSwapDetailsV1;
  nftDetails?: AgentWalletTransactionNftDetailsV1;
  contractDetails?: AgentWalletTransactionContractDetailsV1;
  stakingDetails?: AgentWalletTransactionStakingDetailsV1;
  failureReason?: string;
  riskVerdict?: 'spam';
}

export interface AgentWalletTransactionAmountV1 {
  asset: AgentAssetIdentityV2;
  quantity: string;
  decimals: number;
}

export interface AgentWalletTransactionCounterpartyV1 {
  kind: 'wallet' | 'contact' | 'external' | 'contract' | 'unknown';
  display: string;
  addressRef?: string;
}

export interface AgentWalletTransactionSwapDetailsV1 {
  from: AgentWalletTransactionAmountV1;
  to: AgentWalletTransactionAmountV1;
}

export interface AgentWalletTransactionNftDetailsV1 {
  action: 'transfer' | 'purchase' | 'sale' | 'mint' | 'burn' | 'other';
  displayName: string;
  collectionName?: string;
}

export interface AgentWalletTransactionContractDetailsV1 {
  contractDisplay: string;
  method?: string;
}

export interface AgentWalletTransactionStakingDetailsV1 {
  action: 'stake' | 'unstake' | 'unstake_request' | 'claim';
  validatorDisplay?: string;
  amount?: AgentWalletTransactionAmountV1;
}

export interface AgentWalletDataContactRowV3 {
  rowId: string;
  kind: 'contact';
  contactRef: string;
  addressRef: string;
  name: string;
  chain: AgentApiChain;
  addressDisplay: string;
}

export interface AgentWalletDataSeriesPointV1 {
  timestamp: UtcTimestampMs;
  value: string;
}
