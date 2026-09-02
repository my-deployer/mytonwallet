import type {
  AgentActionLabelCodeV1,
  AgentErrorCodeV2,
  AgentInputContinuationCodeV1,
  AgentMarketQuoteNoticeV1,
  AgentNetworkActivityRowV1,
  AgentNoticeCodeV1,
  AgentNoticeContentV1,
  AgentSemanticAssetV1,
  AgentStarterHintIdV2,
  AgentSwapDetailsRequiredV1,
  AgentSwapFailureV1,
  AgentSwapReadyV1,
  AgentWalletQueryPositionRowV1,
  AgentWalletQueryTransactionRowV1,
} from '../../api/agentV2/protocol/types';
import type { LangFn } from '../../util/langProvider';

import getChainNetworkName from '../../util/swap/getChainNetworkName';

const HINT_KEYS: Record<AgentStarterHintIdV2, [string, string]> = {
  'portfolio.performance': ['$agent_hint_portfolio_title', '$agent_hint_portfolio_prompt'],
  'learn.swap': ['$agent_hint_swap_title', '$agent_hint_swap_prompt'],
  'learn.staking': ['$agent_hint_staking_title', '$agent_hint_staking_prompt'],
  'learn.security': ['$agent_hint_security_title', '$agent_hint_security_prompt'],
  'receive.tokens': ['$agent_hint_receive_title', '$agent_hint_receive_prompt'],
};

const ACTION_KEYS: Record<AgentActionLabelCodeV1, string> = {
  review_transfer: '$agent_action_review_transfer',
  open_receive: '$agent_action_open_receive',
  open_send: '$agent_action_open_send',
  open_staking: '$agent_action_open_staking',
  open_swap: '$agent_action_open_swap',
  hide_spam_assets: '$agent_action_hide_spam',
  open_external_link: '$agent_action_open_link',
  open_agent: '$agent_action_open_agent',
  open_token: '$agent_action_open_token',
  open_transaction: '$agent_action_open_transaction',
};

const INPUT_KEYS: Record<AgentInputContinuationCodeV1, string> = {
  asset_search_asset: '$agent_input_asset',
  market_insight_asset: '$agent_input_asset',
  market_insight_timeframe: '$agent_input_timeframe',
  market_quote_asset: '$agent_input_asset',
  prepare_send_amount: '$agent_input_amount',
  prepare_send_asset: '$agent_input_asset',
  prepare_send_recipient: '$agent_input_recipient',
  prepare_swap_amount: '$agent_input_amount',
  prepare_swap_destination_asset: '$agent_input_asset',
  prepare_swap_direction: '$agent_input_swap_details',
  prepare_swap_source_asset: '$agent_input_asset',
};

const NOTICE_KEYS: Record<AgentNoticeCodeV1, string> = {
  agent_unavailable: '$agent_notice_agent_unavailable',
  analysis_unavailable: '$agent_notice_analysis_unavailable',
  asset_not_found: '$agent_notice_asset_not_found',
  clarification_required: '$agent_notice_clarification_required',
  consent_required: '$agent_notice_consent_required',
  content_over_budget: '$agent_notice_content_over_budget',
  empty_result: '$agent_notice_empty_result',
  market_analysis_asset_unsupported: '$agent_notice_market_analysis_asset_unsupported',
  market_analysis_timeframe_unsupported: '$agent_notice_market_analysis_timeframe_unsupported',
  market_analysis_unavailable: '$agent_notice_market_analysis_unavailable',
  market_data_unavailable: '$agent_notice_market_unavailable',
  market_quote: '$agent_notice_market_quote_unavailable',
  portfolio_unavailable: '$agent_notice_portfolio_unavailable',
  receive_details_required: '$agent_notice_receive_details_required',
  receive_ready: '$agent_notice_receive_ready',
  receive_unavailable: '$agent_notice_receive_unavailable',
  retry_required: '$agent_notice_retry_required',
  send_details_required: '$agent_notice_send_details_required',
  send_form_amount_required: '$agent_notice_send_form_amount_required',
  send_ready: '$agent_notice_send_ready',
  send_unavailable: '$agent_notice_send_unavailable',
  staking_ready: '$agent_notice_staking_ready',
  staking_unavailable: '$agent_notice_staking_unavailable',
  swap_details_required: '$agent_notice_swap_details_direction',
  swap_ready: '$agent_notice_swap_ready_price_unavailable',
  swap_unavailable: '$agent_notice_swap_unavailable',
  tool_unavailable: '$agent_notice_tool_unavailable',
  wallet_data_unavailable: '$agent_notice_wallet_unavailable',
  wallet_filter_ambiguous: '$agent_notice_wallet_filter_ambiguous',
  web_search_unavailable: '$agent_notice_web_unavailable',
};

type WebSearchFailure = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['webSearchFailure']
>;

type MarketQuoteUnavailableReason = Extract<
  AgentMarketQuoteNoticeV1,
  { status: 'unavailable' }
>['reason'];

type SendFailure = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['sendFailure']
>;

type ReceiveFailure = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['receiveFailure']
>;

type ReceiveInputField = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['receiveFields']
>[number];

type StakeFailure = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['stakeFailure']
>;

type SendInputField = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['fields']
>[number];

type ClarificationField = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['field']
>;

type RepairReason = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['repairReason']
>;

type AnalysisFailure = NonNullable<
  NonNullable<AgentNoticeContentV1['arguments']>['analysisFailure']
>;

const CLARIFICATION_FIELD_KEYS: Partial<Record<ClarificationField, string>> = {
  asset: '$agent_notice_clarification_asset',
  network: '$agent_notice_clarification_network',
  price_assumption: '$agent_notice_clarification_price_assumption',
  query: '$agent_notice_clarification_query',
  quote_currency: '$agent_notice_clarification_quote_currency',
  staking_product: '$agent_notice_clarification_staking_product',
  time_horizon: '$agent_notice_clarification_time_horizon',
};

const REPAIR_REASON_KEYS: Record<RepairReason, string> = {
  unrecognized_input: '$agent_notice_repair_unrecognized_input',
  ambiguous_request: '$agent_notice_repair_ambiguous_request',
  multiple_requests: '$agent_notice_repair_multiple_requests',
};

const ANALYSIS_FAILURE_KEYS: Record<AnalysisFailure, string> = {
  planning_unavailable: '$agent_notice_analysis_planning_unavailable',
  source_unavailable: '$agent_notice_analysis_source_unavailable',
  stale_evidence: '$agent_notice_analysis_stale_evidence',
  inconsistent_snapshot: '$agent_notice_analysis_inconsistent_snapshot',
  compute_failed: '$agent_notice_analysis_compute_failed',
  deadline_exceeded: '$agent_notice_analysis_deadline_exceeded',
  result_too_large: '$agent_notice_analysis_result_too_large',
  answer_generation_failed: '$agent_notice_analysis_answer_generation_failed',
};

const SEND_MISSING_FIELD_NOTICE_KEYS: Record<SendInputField, string> = {
  amount: '$agent_notice_send_missing_amount',
  asset: '$agent_notice_send_missing_asset',
  recipient: '$agent_notice_send_missing_recipient',
};

const SEND_FAILURE_KEYS: Record<SendFailure, string> = {
  no_sendable_balance: '$agent_notice_send_no_sendable_balance',
  asset_not_held: '$agent_notice_send_asset_not_held',
  insufficient_balance: '$agent_notice_send_insufficient_balance',
  recipient_not_found: '$agent_notice_send_recipient_not_found',
  recipient_ambiguous: '$agent_notice_send_recipient_ambiguous',
  address_book_unavailable: '$agent_notice_send_address_book_unavailable',
  recipient_matching_unavailable: '$agent_notice_send_recipient_matching_unavailable',
  intent_extraction_unavailable: '$agent_notice_send_intent_extraction_unavailable',
  intent_provider_unavailable: '$agent_notice_send_intent_provider_unavailable',
  invalid_recipient: '$agent_notice_send_invalid_recipient',
  recipient_unresolved: '$agent_notice_send_recipient_unresolved',
  recipient_inactive: '$agent_notice_send_recipient_inactive',
  memo_required: '$agent_notice_send_memo_required',
  wallet_not_initialized: '$agent_notice_send_wallet_not_initialized',
  active_account_unavailable: '$agent_notice_send_active_account_unavailable',
  chain_unsupported: '$agent_notice_send_chain_unsupported',
  client_send_unavailable: '$agent_notice_send_client_unavailable',
  view_only_prepare_forbidden: '$agent_notice_send_view_only',
  offline_prepare_unavailable: '$agent_notice_send_offline',
  wallet_context_changed: '$agent_notice_send_wallet_context_changed',
  source_wallet_selection_required: '$agent_notice_send_source_wallet_selection_required',
  validation_failed: '$agent_notice_send_validation_failed',
  prepare_unavailable: '$agent_notice_send_unavailable',
};

const RECEIVE_FAILURE_KEYS: Record<Exclude<
  ReceiveFailure,
  'chain_unsupported' | 'active_network_mismatch'
>, string> = {
  planning_unavailable: '$agent_notice_receive_planning_unavailable',
  active_account_unavailable: '$agent_notice_receive_active_account_unavailable',
  client_receive_unavailable: '$agent_notice_receive_client_unavailable',
};

const RECEIVE_INPUT_FIELD_KEYS: Record<ReceiveInputField, string> = {
  asset: '$agent_notice_receive_asset_required',
  network: '$agent_notice_receive_network_required',
};

const STAKE_FAILURE_KEYS: Record<StakeFailure, string> = {
  planning_unavailable: '$agent_notice_staking_planning_unavailable',
  active_account_unavailable: '$agent_notice_staking_active_account_unavailable',
  view_only_staking_forbidden: '$agent_notice_staking_view_only',
  client_staking_unavailable: '$agent_notice_staking_client_unavailable',
  asset_unavailable: '$agent_notice_staking_asset_unavailable',
  amount_invalid: '$agent_notice_staking_amount_invalid',
  wallet_context_changed: '$agent_notice_staking_wallet_context_changed',
};

const SWAP_FAILURE_KEYS: Record<AgentSwapFailureV1, string> = {
  planning_unavailable: '$agent_notice_swap_planning_unavailable',
  active_account_unavailable: '$agent_notice_swap_active_account_unavailable',
  view_only_swap_forbidden: '$agent_notice_swap_view_only',
  client_swap_unavailable: '$agent_notice_swap_client_unavailable',
  wallet_context_changed: '$agent_notice_swap_wallet_context_changed',
  tool_timeout: '$agent_notice_swap_timeout',
  tool_failed: '$agent_notice_swap_tool_failed',
  invalid_tool_result: '$agent_notice_swap_invalid_result',
};

const SWAP_DETAIL_KEYS: Record<AgentSwapDetailsRequiredV1['field'], string> = {
  source_asset: '$agent_notice_swap_details_source_asset',
  destination_asset: '$agent_notice_swap_details_destination_asset',
  amount: '$agent_notice_swap_details_amount',
  direction: '$agent_notice_swap_details_direction',
};

const WEB_SEARCH_FAILURE_KEYS: Record<WebSearchFailure, string> = {
  capability_unavailable: '$agent_notice_web_capability_unavailable',
  planning_failed: '$agent_notice_web_planning_failed',
  budget_denied: '$agent_notice_web_budget_denied',
  provider_rate_limited: '$agent_notice_web_provider_rate_limited',
  provider_unavailable: '$agent_notice_web_provider_unavailable',
  no_results: '$agent_notice_web_no_results',
  invalid_sources: '$agent_notice_web_invalid_sources',
  synthesis_timeout: '$agent_notice_web_synthesis_timeout',
  synthesis_invalid: '$agent_notice_web_synthesis_invalid',
  synthesis_unavailable: '$agent_notice_web_synthesis_unavailable',
  policy_rejected: '$agent_notice_web_policy_rejected',
};

const MARKET_QUOTE_FAILURE_KEYS: Record<MarketQuoteUnavailableReason, string> = {
  planning_unavailable: '$agent_notice_market_quote_planning_unavailable',
  capability_unavailable: '$agent_notice_market_quote_capability_unavailable',
  wallet_context_unavailable: '$agent_notice_market_quote_wallet_context_unavailable',
  quote_currency_unsupported: '$agent_notice_market_quote_currency_unsupported',
  quote_unavailable: '$agent_notice_market_quote_unavailable',
  wallet_context_changed: '$agent_notice_market_quote_wallet_context_changed',
  tool_timeout: '$agent_notice_market_quote_timeout',
  tool_failed: '$agent_notice_market_quote_tool_failed',
  invalid_result: '$agent_notice_market_quote_invalid_result',
  cancelled: '$agent_notice_market_quote_cancelled',
};

type SemanticRowCode = AgentWalletQueryTransactionRowV1['status']
  | NonNullable<AgentWalletQueryPositionRowV1['status']>
  | AgentWalletQueryPositionRowV1['positionKind']
  | AgentNetworkActivityRowV1['kind'];

const SEMANTIC_ROW_KEYS: Record<SemanticRowCode, string> = {
  pending: '$agent_semantic_pending',
  pendingTrusted: '$agent_semantic_pending',
  confirmed: '$agent_semantic_confirmed',
  completed: '$agent_semantic_completed',
  failed: '$agent_semantic_failed',
  expired: '$agent_semantic_expired',
  active: '$agent_semantic_active',
  unstaking: '$agent_semantic_unstaking',
  ready: '$agent_semantic_ready',
  frozen: '$agent_semantic_frozen',
  locked: '$agent_semantic_locked',
  fungible: '$agent_semantic_fungible',
  nft: '$agent_semantic_nft',
  staking: '$agent_semantic_staking',
  vesting: '$agent_semantic_vesting',
  vault: '$agent_semantic_vault',
  transfer: '$agent_semantic_transfer',
  swap: '$agent_semantic_swap',
  stake: '$agent_semantic_stake',
  unstake: '$agent_semantic_unstake',
  contract: '$agent_semantic_contract',
  unknown: '$agent_semantic_unknown',
};

export function getAgentV2HintCopy(id: AgentStarterHintIdV2, lang: LangFn) {
  const [titleKey, promptKey] = HINT_KEYS[id];
  return { title: lang(titleKey), prompt: lang(promptKey) };
}

export function getAgentV2ActionLabel(code: AgentActionLabelCodeV1, lang: LangFn) {
  return lang(ACTION_KEYS[code]);
}

export function getAgentV2InputContinuationLabel(code: AgentInputContinuationCodeV1, lang: LangFn) {
  return lang(INPUT_KEYS[code]);
}

export function getAgentV2NoticeTexts(content: AgentNoticeContentV1, lang: LangFn): string[] {
  if (content.code === 'clarification_required') {
    const repairReason = content.arguments?.repairReason;
    if (repairReason) return [lang(REPAIR_REASON_KEYS[repairReason])];
    const field = content.arguments?.field;
    const key = field ? CLARIFICATION_FIELD_KEYS[field] : undefined;
    if (key) return [lang(key)];
  }
  if (content.code === 'analysis_unavailable' && content.arguments?.analysisFailure) {
    return [lang(ANALYSIS_FAILURE_KEYS[content.arguments.analysisFailure])];
  }
  if (content.code === 'swap_ready' && content.arguments?.swapReady) {
    return [formatSwapReady(content.arguments.swapReady, lang)];
  }
  if (content.code === 'swap_details_required' && content.arguments?.swapDetails) {
    return [formatSwapDetails(content.arguments.swapDetails, lang)];
  }
  if (content.code === 'swap_unavailable' && content.arguments?.swapFailure) {
    return [lang(SWAP_FAILURE_KEYS[content.arguments.swapFailure])];
  }
  const marketQuote = content.arguments?.marketQuote;
  if (content.code === 'market_quote' && marketQuote) {
    return [formatMarketQuoteNotice(marketQuote, lang)];
  }
  if (content.code === 'receive_details_required' && content.arguments?.receiveFields?.length) {
    const receiveFields = content.arguments.receiveFields;
    return receiveFields.length === 2
      ? [lang('$agent_notice_receive_details_required')]
      : [lang(RECEIVE_INPUT_FIELD_KEYS[receiveFields[0]])];
  }
  if (content.code === 'receive_ready'
    && content.arguments?.receiveMemoRequirement === 'not_required') {
    return [lang('$agent_notice_receive_memo_not_required')];
  }
  const requiredSendFields = content.arguments?.fields;
  if (content.code === 'send_details_required' && requiredSendFields?.length) {
    return requiredSendFields.map((field) => lang(SEND_MISSING_FIELD_NOTICE_KEYS[field]));
  }
  if (content.code === 'send_ready' && content.arguments?.asset) {
    return [lang('$agent_notice_send_ready_inferred_asset', [
      escapeAgentMarkdownLiteral(content.arguments.asset.symbol),
    ]) as string];
  }
  const sendFailures = content.arguments?.sendFailures;
  if (content.code === 'send_unavailable' && sendFailures) {
    return sendFailures.map((sendFailure) => getSendFailureText(
      lang,
      sendFailure,
      content.arguments?.recipientLabel,
    ));
  }
  const sendFailure = content.arguments?.sendFailure;
  if (content.code === 'send_unavailable' && sendFailure) {
    return [getSendFailureText(lang, sendFailure, content.arguments?.recipientLabel)];
  }
  const webSearchFailure = content.arguments?.webSearchFailure;
  if (content.code === 'web_search_unavailable' && webSearchFailure) {
    return [lang(WEB_SEARCH_FAILURE_KEYS[webSearchFailure])];
  }
  const receiveFailure = content.arguments?.receiveFailure;
  if (content.code === 'receive_unavailable' && receiveFailure) {
    if (receiveFailure === 'chain_unsupported' || receiveFailure === 'active_network_mismatch') {
      const requestedChain = content.arguments?.requestedChain;
      const activeChain = content.arguments?.activeChain;
      if (!requestedChain || !activeChain) return [lang(NOTICE_KEYS.receive_unavailable)];
      const requestedName = getChainNetworkName(requestedChain);
      const activeName = getChainNetworkName(activeChain);
      return receiveFailure === 'chain_unsupported'
        ? [lang('$agent_notice_receive_chain_unsupported', [requestedName, activeName]) as string]
        : [lang('$agent_notice_receive_active_network_mismatch', [activeName, requestedName]) as string];
    }
    return [lang(RECEIVE_FAILURE_KEYS[receiveFailure])];
  }
  const stakeFailure = content.arguments?.stakeFailure;
  if (content.code === 'staking_unavailable' && stakeFailure) {
    return [lang(STAKE_FAILURE_KEYS[stakeFailure])];
  }
  return [lang(NOTICE_KEYS[content.code])];
}

function getSendFailureText(
  lang: LangFn,
  sendFailure: NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['sendFailure']>,
  recipientLabel?: string,
): string {
  if (sendFailure === 'recipient_not_found' && recipientLabel) {
    return lang('$agent_notice_send_recipient_not_found_named', [
      escapeAgentMarkdownLiteral(recipientLabel),
    ]) as string;
  }
  return lang(SEND_FAILURE_KEYS[sendFailure]);
}

function formatSwapReady(content: AgentSwapReadyV1, lang: LangFn): string {
  if (content.quote.status === 'unavailable') {
    return lang('$agent_notice_swap_ready_price_unavailable', [
      escapeAgentMarkdownLiteral(content.sourceAsset.symbol),
      escapeAgentMarkdownLiteral(content.destinationAsset.symbol),
    ]) as string;
  }
  return lang('$agent_notice_swap_ready_indicative', [
    escapeAgentMarkdownLiteral(content.quote.from.value),
    escapeAgentMarkdownLiteral(content.quote.from.symbol),
    escapeAgentMarkdownLiteral(content.quote.to.value),
    escapeAgentMarkdownLiteral(content.quote.to.symbol),
  ]) as string;
}

function formatSwapDetails(content: AgentSwapDetailsRequiredV1, lang: LangFn): string {
  const base = lang(SWAP_DETAIL_KEYS[content.field]);
  if (!content.candidates?.length) return base;
  const candidates = content.candidates.map((asset) => (
    `${formatMarketQuoteAsset(asset)} — ${escapeAgentMarkdownLiteral(getChainNetworkName(asset.chain))}`
  )).join(', ');
  return lang('$agent_notice_swap_details_candidates', [base, candidates]) as string;
}

function formatMarketQuoteNotice(content: AgentMarketQuoteNoticeV1, lang: LangFn): string {
  switch (content.status) {
    case 'resolved':
      return lang('$agent_notice_market_quote_resolved', [
        formatMarketQuoteAsset(content.asset),
        formatMarketQuoteNumber(content.price, marketQuotePricePrecision(content.price), lang),
        content.quoteCurrency,
        formatMarketQuoteChange(content.percentChange24h, lang),
      ]) as string;
    case 'price_unavailable':
      return lang('$agent_notice_market_quote_price_unavailable', [
        formatMarketQuoteAsset(content.asset),
      ]) as string;
    case 'ambiguous': {
      const candidates = content.candidates.map((asset) => (
        `${formatMarketQuoteAsset(asset)} — ${escapeAgentMarkdownLiteral(getChainNetworkName(asset.chain))}`
      )).join(', ');
      return lang('$agent_notice_market_quote_ambiguous', [candidates]) as string;
    }
    case 'not_found':
      return lang('$agent_notice_market_quote_not_found');
    case 'unavailable':
      return lang(MARKET_QUOTE_FAILURE_KEYS[content.reason]);
    default:
      return assertUnreachable(content);
  }
}

function formatMarketQuoteAsset(asset: AgentSemanticAssetV1): string {
  const name = normalizeMarketQuoteLabel(asset.name);
  const symbol = normalizeMarketQuoteLabel(asset.symbol) || 'Asset';
  const label = name && name.toLocaleLowerCase() !== symbol.toLocaleLowerCase()
    ? `${name} (${symbol})`
    : symbol;
  return escapeAgentMarkdownLiteral(label);
}

function normalizeMarketQuoteLabel(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  return normalized || undefined;
}

function marketQuotePricePrecision(value: string): number {
  const numeric = Math.abs(Number(value));
  if (numeric >= 1) return 2;
  if (numeric >= 0.01) return 4;
  if (numeric >= 0.0001) return 6;
  return 8;
}

function formatMarketQuoteNumber(value: string, maximumFractionDigits: number, lang: LangFn): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat(lang.code ?? 'en', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(numeric);
}

function formatMarketQuoteChange(value: string, lang: LangFn): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value.startsWith('-') ? value : `+${value}`;
  if (numeric === 0) return formatMarketQuoteNumber('0', 2, lang);
  const magnitude = formatMarketQuoteNumber(String(Math.abs(numeric)), 2, lang);
  return numeric < 0 ? `-${magnitude}` : `+${magnitude}`;
}

function escapeAgentMarkdownLiteral(value: string): string {
  return value.replace(/([\\|`*_{}[\]()#+.!~-])/gu, '\\$1');
}

export function getAgentV2SemanticRowText(code: SemanticRowCode, lang: LangFn) {
  return lang(SEMANTIC_ROW_KEYS[code]);
}

export function getAgentV2ErrorText(code: AgentErrorCodeV2, lang: LangFn) {
  switch (code) {
    case 'client_update_required':
      return lang('$agent_error_update_required');
    case 'device_token_missing':
    case 'device_token_invalid':
    case 'device_token_expired':
    case 'profile_id_invalid':
    case 'profile_deleted':
      return lang('$agent_error_session');
    case 'rate_limited':
    case 'user_quota_exhausted':
    case 'agent_capacity_exhausted':
    case 'run_budget_exceeded':
    case 'output_limit_reached':
    case 'context_too_large_retryable':
    case 'device_token_rate_limited':
      return lang('$agent_error_limit');
    case 'tool_unsupported':
    case 'tool_scope_mismatch':
    case 'tool_result_already_submitted':
    case 'tool_rejected':
    case 'wallet_context_changed':
    case 'tool_timeout':
    case 'tool_failed':
    case 'tool_result_too_large':
    case 'action_unsupported':
      return lang('$agent_error_tool');
    case 'market_data_unavailable':
      return lang('$agent_notice_market_unavailable');
    case 'network_error':
    case 'provider_timeout':
    case 'provider_unavailable':
      return lang('$agent_connection_interrupted');
    case 'thread_revision_conflict':
      return lang('$agent_error_conversation_updated');
    case 'invalid_request':
    case 'invalid_event':
    case 'device_id_invalid':
    case 'idempotency_mismatch':
    case 'thread_not_found':
    case 'thread_run_in_progress':
    case 'run_not_found':
    case 'run_interrupted':
    case 'run_replay_expired':
    case 'message_not_found':
    case 'message_not_editable':
    case 'regenerate_target_invalid':
    case 'followup_reference_invalid':
    case 'input_continuation_reference_invalid':
    case 'feedback_target_invalid':
    case 'feedback_revision_conflict':
    case 'provider_capability_unavailable':
    case 'provider_error':
    case 'empty_response':
    case 'internal_error':
      return lang('$agent_error_generic');
    default:
      return assertUnreachable(code);
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`Unsupported Agent V2 copy code: ${String(value)}`);
}
