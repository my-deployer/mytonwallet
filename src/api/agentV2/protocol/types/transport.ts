import type {
  AgentActionEvent,
} from './actions';
import type {
  AgentCapabilities,
  AgentContext,
  AgentEntryPoint,
  AgentRunInputV2,
  AgentScopeIntentV2,
  AgentUserQuotaV2,
} from './coreRun';
import type {
  AgentFollowupsEvent,
  AgentInputContinuationsEventV1,
  AgentMessageContentEndEvent,
  AgentMessageEndEvent,
  AgentMessageStartEvent,
  AgentRunFollowupRef,
  AgentRunInputContinuationRefV1,
  AgentThreadEvent,
  AgentThreadSummaryV2,
} from './messages';
import type {
  AgentPortfolioPositionsFeatureStatusV1,
  AgentSemanticContentEvent,
} from './semantic';
import type {
  AgentErrorCodeV2,
  UtcTimestampMs,
  Uuid,
  UuidInput,
} from './shared';
import type {
  AgentStakingCatalogFeatureStatusV1,
  AgentStakingOfferFeatureStatusV1,
  AgentToolCallEvent,
  AgentToolStatusEvent,
  AgentWalletContextV2,
  AgentWalletConversationContextV5,
  AgentWalletQueryFeatureStatusV1,
  AgentWalletScopeSelectionRefV2,
} from './wallet';

export type AgentAvailabilityResponseV2 =
  | {
    protocolVersion: 2;
    state: 'available';
  }
  | {
    protocolVersion: 2;
    state: 'capacity_exhausted';
    resetAt?: UtcTimestampMs;
  };

export type AgentErrorEvent = Record<string, unknown> & {
  type: 'error';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  code: AgentErrorCodeV2;
  retryable: boolean;
  messageId?: Uuid;
  retryAfterMs?: number;
  resetAt?: UtcTimestampMs;
  toolCallId?: Uuid;
  createdAt?: UtcTimestampMs;
};

export type AgentRateLimitEvent = (
  | {
    retryAfterMs: number;
  }
  | {
    resetAt: UtcTimestampMs;
  }
) & {
  type: 'rate_limit';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  code: 'rate_limited';
  retryAfterMs?: number;
  resetAt?: UtcTimestampMs;
  createdAt?: UtcTimestampMs;
};

export type AgentStreamEventV2 =
  | AgentRunStartEvent
  | AgentThreadEvent
  | AgentMessageStartEvent
  | AgentTextDeltaEvent
  | AgentToolCallEvent
  | AgentToolStatusEvent
  | AgentRunActivityEvent
  | AgentActionEvent
  | AgentFollowupsEvent
  | AgentInputContinuationsEventV1
  | AgentSemanticContentEvent
  | AgentMessageContentEndEvent
  | AgentMessageEndEvent
  | AgentRateLimitEvent
  | AgentErrorEvent;

export type AgentRunActivityCodeV1 =
  | 'request.planning'
  | 'web.searching'
  | 'web.reading_sources'
  | 'data.reading_market'
  | 'analysis.checking_freshness'
  | 'analysis.computing'
  | 'answer.writing';

export interface AgentRunActivityEvent {
  type: 'run_activity';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  code: AgentRunActivityCodeV1;
  status: 'active' | 'completed';
  detail?: { kind: 'source_count'; count: number };
  createdAt?: UtcTimestampMs;
}

export interface AgentDeviceTokenIssueResponseV2 {
  protocolVersion: 2;
  deviceId: Uuid;
  deviceToken: string;
  expiresAt: UtcTimestampMs;
}

export interface AgentFeatureCapabilitiesResponseV2 {
  protocolVersion: 2;
  portfolioPositions: AgentPortfolioPositionsFeatureStatusV1;
  stakingOffer?: AgentStakingOfferFeatureStatusV1;
  stakingCatalog?: AgentStakingCatalogFeatureStatusV1;
  walletQuery?: AgentWalletQueryFeatureStatusV1;
}

export interface AgentRunCancelResponseV2 {
  protocolVersion: 2;
  runId: Uuid;
  state: 'completed' | 'completed_with_tool_error' | 'failed' | 'cancelled' | 'run_interrupted';
  lastSequence: number;
  thread: AgentThreadSummaryV2;
  duplicate?: boolean;
}

export interface AgentRunRequestWireV2 {
  protocolVersion: 2;
  clientRunId: UuidInput;
  threadId?: UuidInput;
  expectedThreadRevision: number;
  resumeAfterSequence?: number;
  walletBucketHash?: string;
  entryPoint?: AgentEntryPoint;
  followupOf?: AgentRunFollowupRef;
  continuationOf?: AgentRunInputContinuationRefV1;
  input: AgentRunInputV2;
  context: AgentContext;
  capabilities: AgentCapabilities;
  walletContext: AgentWalletContextV2;
  walletConversationContext?: AgentWalletConversationContextV5;
  walletScopeSelectionOf?: AgentWalletScopeSelectionRefV2;
  scopeIntent?: AgentScopeIntentV2;
}

export interface AgentRunStartEvent {
  type: 'run_start';
  protocolVersion: 2;
  sequence: 1;
  runId: Uuid;
  clientRunId: Uuid;
  threadId: Uuid;
  threadRevision: number;
  createdAt?: UtcTimestampMs;
}

export interface AgentTextDeltaEvent {
  type: 'text_delta';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  delta: string;
  createdAt?: UtcTimestampMs;
}

export interface AgentUserQuotaResponseV2 {
  protocolVersion: 2;
  quota: AgentUserQuotaV2;
}
