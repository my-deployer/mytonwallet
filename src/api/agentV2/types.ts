import type { ApiBaseCurrency, ApiPortfolioHistoryResponse, ApiPriceHistoryPeriod } from '../types';
import type {
  AgentAccountListItem,
  AgentActionProposal,
  AgentApiChain,
  AgentAssetIdentityV2,
  AgentEntryPoint,
  AgentErrorCodeV2,
  AgentHintsResponseV2,
  AgentPersistedMessageV2,
  AgentPublicFollowUpV2,
  AgentPublicInputContinuationV1,
  AgentRunActivityEvent,
  AgentSemanticContentV1,
  AgentStakeAmountV2,
  AgentThreadMessagesPageV2,
  AgentThreadSummaryV2,
  AgentToolName,
  AgentToolStatusEvent,
  AgentUserQuotaV2,
  AgentWalletScopeSelectionRefV2,
  AgentWalletSemanticOperationV2,
} from './protocol/types';

export interface AgentV2WalletConversationControls {
  expiresAt: string;
  scopeChoices: Array<{ choiceId: string; label: string }>;
}

export type AgentV2WalletConversationControl = {
  kind: 'select_wallet';
  choiceId: string;
  label: string;
};

export interface AgentV2HostAsset {
  slug: string;
  chain: AgentApiChain;
  symbol: string;
  name?: string;
  tokenAddress?: string;
  decimals: number;
  priceUsd?: string | number;
  percentChange24h?: string | number;
}

export interface AgentV2HostHolding {
  asset: AgentV2HostAsset;
  balance: string;
  availableBalance?: string;
  fiatValue?: string;
  /** Canonical base-currency quote used only to revalue a read-only refreshed balance. */
  fiatPrice?: string;
  valuationStatus?: 'valued' | 'unpriced';
  visibility?: 'visible' | 'hidden';
  riskVerdict?: 'spam';
}

export interface AgentV2HostStakingOffer {
  productId: string;
  asset: AgentAssetIdentityV2;
  annualYield: string;
  yieldType: 'APY' | 'APR';
  availability: 'available' | 'disabled';
}

export type AgentV2WalletDomain =
  | 'accounts'
  | 'positions'
  | 'transactions'
  | 'value_series'
  | 'contacts';

export interface AgentV2HostDomainState {
  state: 'fresh' | 'stale' | 'notLoaded' | 'unavailable';
  updatedAt?: string;
}

export interface AgentV2HostPosition {
  id: string;
  kind: 'nft' | 'staking' | 'vesting' | 'vault';
  chain: AgentApiChain;
  label: string;
  asset?: AgentV2HostAsset;
  quantity?: string;
  valuationStatus: 'valued' | 'unpriced' | 'not_applicable';
  fiatValue?: string;
  status?: string;
  apy?: string;
  rewards?: string;
  collection?: string;
  isOnSale?: boolean;
  visibility?: 'visible' | 'hidden';
  riskVerdict?: 'spam';
}

export interface AgentV2HostAccount {
  accountId: string;
  label?: string;
  state: 'active' | 'stale' | 'deleted';
  accountType: AgentAccountListItem['accountType'];
  isViewOnly: boolean;
  chains: AgentApiChain[];
  addresses: Partial<Record<AgentApiChain, string>>;
  /** Mainnet-only Portfolio API keys in the canonical `chain:address` form. */
  portfolioWalletKeys?: string[];
  holdings: AgentV2HostHolding[];
  positions?: AgentV2HostPosition[];
  savedAddresses?: AgentV2HostSavedAddress[];
  domainStates?: Partial<Record<AgentV2WalletDomain, AgentV2HostDomainState>>;
}

export interface AgentV2HostSavedAddress {
  id: string;
  name: string;
  chain: AgentApiChain;
  address: string;
}

export interface AgentV2PortfolioHistoryEntry {
  response: ApiPortfolioHistoryResponse;
  fetchedAtSlot: number;
}

export interface AgentV2HostContextSnapshot {
  platform: 'classic' | 'ios' | 'android';
  client: 'web' | 'electron' | 'extension' | 'tma' | 'native' | 'capacitor';
  lang: string;
  baseCurrency: string;
  currencyRate?: string;
  timeZone?: string;
  appVersion?: string;
  theme?: string;
  activeAccountId?: string;
  activeNetwork?: AgentApiChain;
  isTestnet?: boolean;
  /** Ordered frontend-owned staking products. Only eligible identities are projected into the run wallet grant. */
  stakingOffers?: AgentV2HostStakingOffer[];
  accounts: AgentV2HostAccount[];
  /** Bounded local token catalog. It is available to wallet tools and is never sent in a run request. */
  assetCatalog?: AgentV2HostAsset[];
  /** Locally loaded swap catalog used only by the Swap preparation tool. Never sent in a run request. */
  swapAssetCatalog?: AgentV2HostAsset[];
  savedAddresses: AgentV2HostSavedAddress[];
  /** Already loaded Portfolio state. It stays in memory and is never sent in the run request. */
  portfolioHistory?: Partial<Record<
    '1d' | '7d' | '1m' | '3m' | '1y' | 'all',
    AgentV2PortfolioHistoryEntry
  >>;
}

type AgentV2RunCommandBase = {
  threadId?: string;
  expectedThreadRevision: number;
  /** Private, non-wire staging instruction captured when this run is started. */
  customWriterInstruction?: string;
};

type AgentV2RunCommandWithoutOrigin = {
  entryPoint?: never;
  followupOf?: never;
  continuationOf?: never;
  walletScopeSelectionOf?: never;
};

type AgentV2AppendOrigin = AgentV2RunCommandWithoutOrigin
  | {
    entryPoint: AgentEntryPoint;
    followupOf?: never;
    continuationOf?: never;
    walletScopeSelectionOf?: never;
  }
  | {
    entryPoint?: never;
    followupOf: { messageId: string; followupId: string };
    continuationOf?: never;
    walletScopeSelectionOf?: never;
  }
  | {
    entryPoint?: never;
    followupOf?: never;
    continuationOf: { messageId: string; continuationId: string };
    walletScopeSelectionOf?: never;
  }
  | {
    entryPoint?: never;
    followupOf?: never;
    continuationOf?: never;
    walletScopeSelectionOf: AgentWalletScopeSelectionRefV2;
  };

export type AgentV2AppendRunCommand = AgentV2RunCommandBase
  & { input: { kind: 'append'; text: string } }
  & AgentV2AppendOrigin;

export type AgentV2EditRunCommand = AgentV2RunCommandBase
  & { input: { kind: 'edit'; targetUserMessageId: string; text: string } }
  & AgentV2RunCommandWithoutOrigin;

export type AgentV2RegenerateRunCommand = AgentV2RunCommandBase
  & { input: { kind: 'regenerate'; targetAssistantMessageId: string } }
  & AgentV2RunCommandWithoutOrigin;

export type AgentV2RunCommand = AgentV2AppendRunCommand | AgentV2EditRunCommand | AgentV2RegenerateRunCommand;

type AgentV2RunCommandWithoutThread<T> = T extends AgentV2RunCommand
  ? Omit<T, 'threadId' | 'expectedThreadRevision'>
  : never;

export type AgentV2RunCommandInput = AgentV2RunCommandWithoutThread<AgentV2RunCommand>;

export interface AgentV2RunResult {
  clientRunId: string;
  runId?: string;
  inputMessageId?: string;
  state: 'completed' | 'failed' | 'cancelled' | 'interrupted';
}

export interface AgentV2OperationError {
  code: AgentErrorCodeV2;
  retryable: boolean;
}

export type AgentV2OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AgentV2OperationError };

export interface AgentV2HostContextUpdate {
  authorityChanged: boolean;
  generation: number;
}

export type AgentV2MutationError = AgentV2OperationError;
export type AgentV2MutationResult<T> = AgentV2OperationResult<T>;

export interface AgentV2RuntimeStatus {
  enabled: boolean;
}

export interface AgentV2SendReview {
  tokenSlug: string;
  amountAtomic: string;
  toAddress: string;
  comment?: string;
}

export type AgentV2ResolvedAction =
  | { kind: 'openReceive'; chain: AgentApiChain }
  | {
    kind: 'openStaking';
    productId: string;
    tokenSlug: string;
    amount?: AgentStakeAmountV2;
  }
  | {
    kind: 'openSwap';
    tokenInSlug: string;
    tokenOutSlug: string;
    amount: string;
    amountSide: 'source' | 'destination';
  }
  | { kind: 'sendForm'; tokenSlug: string; toAddress?: string }
  | { kind: 'reviewSend'; draftId: string; chain: AgentApiChain; review: AgentV2SendReview }
  | { kind: 'hideSpamAssets'; slugs: string[] }
  | { kind: 'openUrl'; url: string }
  | { kind: 'openToken'; slug: string; chain: AgentApiChain; tokenAddress?: string }
  | { kind: 'openTransaction'; chain: AgentApiChain; transactionRef: string }
  | { kind: 'openAgent'; entryPoint: AgentEntryPoint }
  | { kind: 'inactive' };

export type AgentV2ActionPresentation =
  | {
    kind: 'send';
    status: 'active';
    amount?: { value: string; symbol: string };
    network: AgentApiChain;
    accountLabel: string;
    recipient?: {
      kind: 'savedAddress' | 'external' | 'domain';
      label?: string;
    };
    feeStatus: 'estimated' | 'calculated_in_wallet';
    warningCodes: Array<'scam_suspected' | 'memo_required' | 'new_address'>;
    expiresAt?: string;
  }
  | { kind: 'inactive' };

type AgentV2BoundRunUpdate<T> = T & {
  clientRunId: string;
  runId: string;
  threadId: string;
};

type AgentV2RunFailure = {
  kind: 'runFailed';
  code: AgentErrorCodeV2;
  retryable: boolean;
  messageId?: string;
  resetAt?: number;
};

export type AgentV2AvailabilityState =
  | { state: 'available' }
  | { state: 'capacity_exhausted'; resetAt?: number };

export type AgentV2RateLimitState = {
  kind: 'rateLimit';
  resetAt: number;
  clientRunId: string;
};

export type AgentV2ComposerStatus =
  | { kind: 'capacity'; mode: 'blocked'; resetAt: number }
  | { kind: 'capacity'; mode: 'degraded' }
  | {
    kind: 'userQuota';
    mode: 'blocked' | 'informational';
    quota: AgentUserQuotaV2;
    resetAt: number;
    clientRunId?: string;
  }
  | (AgentV2RateLimitState & { mode: 'blocked' | 'informational' });

export type AgentV2ClientUpdate =
  | {
    kind: 'runtimeReady';
    generation: number;
    clientRunId?: never;
    runId?: never;
    threadId?: never;
  }
  | AgentV2BoundRunUpdate<{
    kind: 'runStarted';
    threadRevision: number;
    inputMessageId?: string;
  }>
  | AgentV2BoundRunUpdate<{
    kind: 'messageStarted';
    messageId: string;
    contentKind: 'markdown' | 'semantic';
  }>
  | AgentV2BoundRunUpdate<{ kind: 'textDelta'; messageId: string; delta: string }>
  | AgentV2BoundRunUpdate<{ kind: 'messageContentEnded'; messageId: string }>
  | AgentV2BoundRunUpdate<{
    kind: 'messageCompleted';
    messageId: string;
    finishReason: string;
    walletControls?: AgentV2WalletConversationControls;
  }>
  | AgentV2BoundRunUpdate<{ kind: 'actionAvailable'; messageId: string; action: AgentActionProposal }>
  | AgentV2BoundRunUpdate<{
    kind: 'followupsAvailable';
    messageId: string;
    items: AgentPublicFollowUpV2[];
  }>
  | AgentV2BoundRunUpdate<{
    kind: 'inputContinuationsAvailable';
    messageId: string;
    items: AgentPublicInputContinuationV1[];
  }>
  | AgentV2BoundRunUpdate<{
    kind: 'semanticContentAvailable';
    messageId: string;
    content: AgentSemanticContentV1;
  }>
  | AgentV2BoundRunUpdate<{
    kind: 'toolActivityChanged';
    toolCallId: string;
    toolName: AgentToolName;
    operation?: AgentWalletSemanticOperationV2;
    status: AgentToolStatusEvent['status'];
  }>
  | AgentV2BoundRunUpdate<{
    kind: 'runActivityChanged';
    event: AgentRunActivityEvent;
  }>
  | AgentV2BoundRunUpdate<AgentV2RunFailure>
  | AgentV2RunFailure & {
    clientRunId: string;
    runId?: never;
    threadId?: string;
  }
  | AgentV2BoundRunUpdate<{ kind: 'runCancelled' }>
  | {
    kind: 'availabilityChanged';
    availability: AgentV2AvailabilityState;
    clientRunId?: never;
    runId?: never;
    threadId?: never;
  }
  | {
    kind: 'userQuotaChanged';
    quota?: AgentUserQuotaV2;
    clientRunId?: never;
    runId?: never;
    threadId?: never;
  }
  | {
    kind: 'walletAuthorityChanged';
    clientRunId?: never;
    runId?: never;
    threadId?: string;
  }
  | {
    kind: 'walletContextChanged';
    clientRunId?: never;
    runId?: never;
    threadId?: never;
  }
  | AgentV2BoundRunUpdate<{ kind: 'threadChanged'; thread: AgentThreadSummaryV2 }>
  | {
    kind: 'threadChanged';
    threadId: string;
    clientRunId?: never;
    runId?: never;
    thread: AgentThreadSummaryV2;
  };

export interface AgentV2ThreadHydration {
  thread: AgentThreadSummaryV2;
  messages: AgentV2HydratedMessage[];
  nextCursor?: AgentThreadMessagesPageV2['nextCursor'];
  incompatibleMessages?: AgentV2IncompatibleHistoryMessage[];
}

export interface AgentV2IncompatibleHistoryMessage {
  index: number;
  category: 'contract' | 'compatibility';
  boundary: string;
  messageId?: string;
}

export type AgentV2HydratedMessage = AgentPersistedMessageV2 & {
  walletControls?: AgentV2WalletConversationControls;
};

export type AgentV2Hints = AgentHintsResponseV2;

export type ApiUpdateAgentV2 = {
  type: 'agentV2';
  update: AgentV2ClientUpdate;
};

export type ApiUpdateAgentV2PortfolioHistory = {
  type: 'agentV2PortfolioHistory';
  accountId: string;
  baseCurrency: ApiBaseCurrency;
  range: ApiPriceHistoryPeriod;
  fetchedAtSlot: number;
  netWorth: ApiPortfolioHistoryResponse;
};
