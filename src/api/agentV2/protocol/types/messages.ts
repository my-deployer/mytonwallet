import type {
  AgentPersistedActionV2,
} from './actions';
import type {
  AgentServerCapabilitiesV2,
} from './coreRun';
import type {
  AgentSemanticMessageContentV1,
} from './semantic';
import type {
  AgentErrorCodeV2,
  AgentPublicFollowUpOpaqueIdV2,
  AgentStarterHintIdV2,
  UtcTimestampMs,
  Uuid,
  UuidInput,
} from './shared';
import type { AgentWalletConversationContextV5 } from './wallet';

export type AgentFeedbackRatingV2 = 'helpful' | 'unhelpful';

export interface AgentPublicFollowUpV2 {
  id: AgentPublicFollowUpOpaqueIdV2;
  kind: 'suggested_prompt';
  text: string;
}

export type AgentInputContinuationCodeV1 =
  | 'asset_search_asset'
  | 'market_quote_asset'
  | 'market_insight_asset'
  | 'market_insight_timeframe'
  | 'prepare_send_amount'
  | 'prepare_send_asset'
  | 'prepare_send_recipient'
  | 'prepare_swap_amount'
  | 'prepare_swap_destination_asset'
  | 'prepare_swap_direction'
  | 'prepare_swap_source_asset';

export type AgentInputContinuationFieldV1 = 'amount' | 'asset' | 'recipient' | 'network' | 'timeframe' | 'details';

export type AgentInputContinuationScenarioV1 =
  | 'prepare-send'
  | 'prepare-swap'
  | 'asset-search'
  | 'market-insight'
  | 'market-quote';

export type AgentMessageContentV1 = AgentMarkdownMessageContentV1 | AgentSemanticMessageContentV1;

export type AgentMessageCursorV2 = string;

export type AgentMessageEndEvent = Record<string, unknown> & {
  type: 'message_end';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  finishReason:
    'complete' | 'cancelled' | 'error' | 'tool_unavailable' | 'rate_limited' | 'run_interrupted' | 'max_output_tokens';
  usage?: AgentUsage;
  walletConversationContext?: AgentWalletConversationContextV5;
  createdAt?: UtcTimestampMs;
};

export type AgentMessageContentEndEvent = Record<string, unknown> & {
  type: 'message_content_end';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  createdAt?: UtcTimestampMs;
};

export type AgentMessageErrorV2 = Record<string, unknown> & {
  code: AgentErrorCodeV2;
  retryable: boolean;
  retryAfterMs?: number;
  resetAt?: UtcTimestampMs;
};

export type AgentPersistedMessageV2 = Record<string, unknown> & {
  id: Uuid;
  threadId: Uuid;
  role: 'user' | 'assistant';
  status: 'complete' | 'error' | 'cancelled';
  content?: AgentMessageContentV1;
  createdAt: UtcTimestampMs;
  runId?: Uuid;
  error?: AgentMessageErrorV2;
  feedback?: AgentMessageFeedbackV2;
  /**
   * @maxItems 8
   */
  actions?: AgentPersistedActionV2[];
  /**
   * @maxItems 3
   */
  followups?: AgentPublicFollowUpV2[];
  /**
   * @maxItems 3
   */
  inputContinuations?: AgentPublicInputContinuationV1[];
};

export interface AgentDefaultThreadResponseV2 {
  protocolVersion: 2;
  thread: AgentThreadSummaryV2;
  created: boolean;
}

export interface AgentThreadSummaryV2 {
  id: Uuid;
  revision: number;
  metadataRevision: 1;
  titleSource: 'none';
  isPinned: false;
  isDefault: true;
  createdAt: UtcTimestampMs;
  updatedAt: UtcTimestampMs;
  lastActivityAt: UtcTimestampMs;
  clearedAt?: UtcTimestampMs;
  messageCount: number;
}

export interface AgentMessageFeedbackV2 {
  rating: AgentFeedbackRatingV2;
  revision: number;
  updatedAt: UtcTimestampMs;
}

export interface AgentFollowupsEvent {
  type: 'followups';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  /**
   * @minItems 1
   * @maxItems 3
   */
  items: AgentPublicFollowUpV2[];
  createdAt?: UtcTimestampMs;
}

export interface AgentHintsResponseV2 {
  protocolVersion: 2;
  catalogVersion: 'agent-starter-hints-v1';
  /**
   * @maxItems 5
   */
  items: AgentStarterHintV2[];
  serverCapabilities?: AgentServerCapabilitiesV2;
}

export interface AgentStarterHintV2 {
  id: AgentStarterHintIdV2;
  /**
   * @maxItems 2
   */
  requiredCapabilities?: ('wallet_read' | 'receive_action')[];
}

export interface AgentInputContinuationsEventV1 {
  type: 'input_continuations';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  /**
   * @minItems 1
   * @maxItems 3
   */
  items: AgentPublicInputContinuationV1[];
  createdAt: UtcTimestampMs;
}

export interface AgentPublicInputContinuationV1 {
  id: AgentPublicFollowUpOpaqueIdV2;
  kind: 'collect_input';
  code: AgentInputContinuationCodeV1;
  scenario: AgentInputContinuationScenarioV1;
  field: AgentInputContinuationFieldV1;
}

export interface AgentMarkdownMessageContentV1 {
  kind: 'markdown';
  text: string;
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: number;
  provider?: 'anthropic' | 'self_host' | 'cocoon' | 'unknown';
}

export interface AgentMessageStartEvent {
  type: 'message_start';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  role: 'assistant';
  contentKind: 'markdown' | 'semantic';
  createdAt?: UtcTimestampMs;
}

export interface AgentRunFollowupRef {
  messageId: UuidInput;
  followupId: string;
}

export interface AgentRunInputContinuationRefV1 {
  messageId: UuidInput;
  continuationId: string;
}

export interface AgentThreadEvent {
  type: 'thread';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  thread: AgentThreadSummaryV2;
  createdAt?: UtcTimestampMs;
}

export interface AgentThreadClearResponseV2 {
  protocolVersion: 2;
  thread: AgentThreadSummaryV2;
  duplicate: boolean;
}

export interface AgentThreadMessagesPageV2 {
  protocolVersion: 2;
  threadId: Uuid;
  /**
   * @maxItems 100
   */
  messages: AgentPersistedMessageV2[];
  nextCursor?: AgentMessageCursorV2;
}

export interface AgentThreadResponseV2 {
  protocolVersion: 2;
  thread: AgentThreadSummaryV2;
}
