// Dependency-free Agent V2 wire primitives and shared DTOs

export type AgentActionKind =
  | 'send'
  | 'receive'
  | 'stake'
  | 'swap'
  | 'hideSpamAssets'
  | 'openUrl'
  | 'openAgent'
  | 'openToken'
  | 'openTransaction';

// Frontend-owned post-parse DTOs and locally constructed Agent V2 wire payloads

export type AgentApiChain = string;

export type Uuid = string;

export type UtcTimestampMs = string;

export type UuidInput = string;

export type AgentErrorCodeV2 =
  | 'invalid_request'
  | 'invalid_event'
  | 'client_update_required'
  | 'network_error'
  | 'device_id_invalid'
  | 'device_token_missing'
  | 'device_token_invalid'
  | 'device_token_expired'
  | 'device_token_rate_limited'
  | 'profile_id_invalid'
  | 'idempotency_mismatch'
  | 'thread_revision_conflict'
  | 'thread_not_found'
  | 'thread_run_in_progress'
  | 'run_not_found'
  | 'run_interrupted'
  | 'run_replay_expired'
  | 'run_budget_exceeded'
  | 'output_limit_reached'
  | 'rate_limited'
  | 'user_quota_exhausted'
  | 'agent_capacity_exhausted'
  | 'context_too_large_retryable'
  | 'tool_unsupported'
  | 'tool_scope_mismatch'
  | 'tool_result_already_submitted'
  | 'tool_rejected'
  | 'wallet_context_changed'
  | 'tool_timeout'
  | 'tool_failed'
  | 'tool_result_too_large'
  | 'market_data_unavailable'
  | 'action_unsupported'
  | 'message_not_found'
  | 'message_not_editable'
  | 'regenerate_target_invalid'
  | 'followup_reference_invalid'
  | 'input_continuation_reference_invalid'
  | 'feedback_target_invalid'
  | 'feedback_revision_conflict'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_capability_unavailable'
  | 'provider_error'
  | 'empty_response'
  | 'internal_error'
  | 'profile_deleted';

export type AgentStarterHintIdV2 =
  'portfolio.performance' | 'learn.swap' | 'learn.staking' | 'learn.security' | 'receive.tokens';

export type AgentPublicFollowUpOpaqueIdV2 = string;

export interface AgentRunUserMessage {
  id: UuidInput;
  text: string;
}

export interface AgentSemanticAssetV1 {
  slug: string;
  chain: AgentApiChain;
  symbol: string;
  name?: string;
}

export type AgentEventType =
  | 'run_start'
  | 'thread'
  | 'message_start'
  | 'text_delta'
  | 'tool_call'
  | 'tool_status'
  | 'run_activity'
  | 'action'
  | 'followups'
  | 'input_continuations'
  | 'semantic_content'
  | 'message_content_end'
  | 'message_end'
  | 'rate_limit'
  | 'error';

export type AgentAddressRef = Record<string, unknown> & {
  kind: 'wallet' | 'savedAddress' | 'external' | 'domain';
  label?: string;
  chain: AgentApiChain;
  addressRef?: string;
  address?: string;
  displayAddress?: string;
  disclosure: 'hidden' | 'masked' | 'public';
  disclosureReason?: 'receive' | 'wallet_location' | 'prepare_validation' | 'user_supplied_destination';
};

export type AgentToolFreshness = Record<string, unknown> & {
  asOf: UtcTimestampMs;
  source: 'store' | 'store_refreshed' | 'network' | 'offline_cache';
  isStale: boolean;
  staleReason?: 'ttl_expired' | 'offline' | 'refresh_failed';
};

export type AgentToolCapability = Record<string, unknown> & {
  name:
    | 'wallet.data.query'
    | 'wallet.directory.query'
    | 'action.send.prepare'
    | 'action.swap.prepare'
    | 'market.asset.quote'
    | 'staking.offer.read'
    | 'staking.offers.list';
  version: 1 | 5;
  /**
   * @minItems 1
   */
  scopes: AgentToolScope[];
  maxResultBytes: number;
  timeoutMs: number;
};

export type AgentToolScope =
  | 'wallet.data.read'
  | 'wallet.directory.read'
  | 'action.send.prepare'
  | 'action.swap.prepare'
  | 'market.data.read'
  | 'staking.data.read';

export interface AgentAssetRefV2 {
  slug: string;
  chain: AgentApiChain;
  tokenAddress?: string;
}

export interface AgentMoneyAmount {
  value: string;
  valueType: 'atomic' | 'decimal';
  decimals: number;
  symbol: string;
  slug: string;
  chain: AgentApiChain;
  tokenAddress?: string;
  fiat?: {
    value: string;
    currency: string;
    rate?: string;
    asOf: UtcTimestampMs;
  };
}

export interface AgentToolWarning {
  code: 'stale_data' | 'partial_coverage' | 'omitted_optional_data' | 'refresh_failed';
}

export interface AgentToolSuccessEnvelopeBaseV1 {
  schemaVersion: 1;
  freshness: AgentToolFreshness;
  redaction: AgentToolRedaction;
  /**
   * @maxItems 8
   */
  warnings?: AgentToolWarning[];
}

export interface AgentToolRedaction {
  level: 'minimal' | 'scoped';
  /**
   * @maxItems 32
   */
  omittedFields?: string[];
  maxResultBytes: number;
}
