import type {
  AgentAssetSearchContentV1,
  AgentMarketAnalysisEvidenceV5,
  AgentMarketAnalysisEvidenceV6,
  AgentMarketAnalysisOutputV4,
  AgentMarketContentV1,
  AgentMarketFearGreedRegimeV1,
  AgentMarketOverviewEvidenceV2,
  AgentMarketQuoteNoticeV1,
  AgentMoneyAmount,
  AgentNetworkActivityContentPayloadV1,
  AgentNoticeContentV1,
  AgentPortfolioAnalysisContentPayloadV1,
  AgentPortfolioContentV1,
  AgentPortfolioPositionsContentPayloadV1,
  AgentSemanticContentV1,
  AgentSwapAmountV1,
  AgentSwapDetailsRequiredV1,
  AgentSwapIndicativeQuoteV1,
  AgentSwapReadyV1,
  AgentWalletPolicyCounterV1,
  AgentWalletQueryContentV1,
  AgentWalletQueryPolicySummaryV1,
  AgentWebDigestContentV1,
  EntryPoint,
  PortfolioPerformanceProjectionV1,
} from '../types';
import type {
  JsonObject,
} from '../wireReader';

import {
  AgentV2CompatibilityError,
  AgentV2ContractError,
  array,
  boolean,
  boundedInteger,
  boundedString,
  extensibleOneOf,
  fail,
  integer,
  literal,
  object,
  oneOf,
  timestamp,
} from '../wireReader';
import {
  uuid,
} from './readers';
import {
  isWireNull,
} from './wallet';

const CANONICAL_NONNEGATIVE_DECIMAL_PATTERN = /^[0-9]+(?:\.[0-9]+)?$/u;

const SUPPORTED_SEMANTIC_KINDS: ReadonlySet<string> = new Set([
  'notice',
  'walletQuery',
  'portfolio',
  'market',
  'assetSearch',
  'webDigest',
]);

const SEND_FAILURES = new Set([
  'no_sendable_balance', 'asset_not_held', 'insufficient_balance', 'recipient_not_found', 'recipient_ambiguous',
  'address_book_unavailable', 'recipient_matching_unavailable',
  'intent_extraction_unavailable', 'intent_provider_unavailable', 'invalid_recipient', 'recipient_unresolved',
  'recipient_inactive', 'memo_required', 'wallet_not_initialized',
  'active_account_unavailable', 'chain_unsupported',
  'client_send_unavailable', 'view_only_prepare_forbidden', 'offline_prepare_unavailable',
  'wallet_context_changed', 'source_wallet_selection_required', 'validation_failed', 'prepare_unavailable',
]);

const RECEIVE_FAILURES = new Set([
  'planning_unavailable', 'active_account_unavailable', 'client_receive_unavailable',
  'chain_unsupported', 'active_network_mismatch',
]);

const STAKE_FAILURES = new Set([
  'planning_unavailable', 'active_account_unavailable',
  'view_only_staking_forbidden', 'client_staking_unavailable',
  'asset_unavailable', 'amount_invalid', 'wallet_context_changed',
]);

const SWAP_FAILURES = new Set([
  'planning_unavailable', 'active_account_unavailable', 'view_only_swap_forbidden',
  'client_swap_unavailable', 'wallet_context_changed', 'tool_timeout', 'tool_failed',
  'invalid_tool_result',
]);

const CLARIFICATION_FIELDS = new Set([
  'account', 'address', 'amount', 'asset', 'network', 'price_assumption', 'query',
  'quote_currency', 'recipient', 'scope', 'staking_product', 'time_horizon',
]);

const REPAIR_REASONS = new Set([
  'unrecognized_input', 'ambiguous_request', 'multiple_requests',
]);

const ANALYSIS_FAILURES = new Set([
  'planning_unavailable', 'source_unavailable', 'stale_evidence', 'inconsistent_snapshot',
  'compute_failed', 'deadline_exceeded', 'result_too_large', 'answer_generation_failed',
]);

const MARKET_QUOTE_UNAVAILABLE_REASONS = new Set([
  'planning_unavailable', 'capability_unavailable', 'wallet_context_unavailable',
  'quote_currency_unsupported', 'quote_unavailable', 'wallet_context_changed',
  'tool_timeout', 'tool_failed', 'invalid_result', 'cancelled',
]);

const RECIPIENT_SEND_FAILURES = new Set(['recipient_not_found', 'recipient_ambiguous']);

const BALANCE_SEND_FAILURES = new Set(['asset_not_held', 'insufficient_balance']);

const MARKET_DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

const MARKET_UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

const FEAR_GREED_SMA_PATTERN = /^(?:0|[1-9][0-9]*)\.[0-9]{8}$/u;

const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const MARKET_PROFILE_EVIDENCE_PATTERN
  = /^profile\.(current_day|previous_day|previous_week|rolling_30d)\.(poc|val|vah)$/u;

const MARKET_PROFILE_NODE_EVIDENCE_PATTERN
  = /^profile\.(current_day|previous_day|previous_week|rolling_30d)\.(hvn|lvn)\.([12])$/u;

const MARKET_PROFILE_NODE_EVIDENCE_CANDIDATE_PATTERN = /^profile\.[^.]+\.(?:hvn|lvn)(?:\.|$)/u;

const MARKET_PUBLIC_FORBIDDEN_TEXT_PATTERN = /(?:https?:\/\/|\bobv\b|z-score|\b\d+\.\d{8}\b)/iu;

const MARKET_TIMEFRAMES = ['1d', '4h', '1h'] as const;

const MARKET_HORIZONS = ['3d', '7d', '30d'] as const;

const MARKET_SCENARIO_KINDS = ['bullish_breakout', 'range_balance', 'bearish_breakdown'] as const;

const MARKET_PROFILE_KINDS = ['current_day', 'previous_day', 'previous_week', 'rolling_30d'] as const;

const MARKET_PROFILE_KINDS_BY_HORIZON = {
  '3d': ['current_day', 'previous_day'],
  '7d': ['previous_week'],
  '30d': ['rolling_30d'],
} as const;

type MarketHorizon = typeof MARKET_HORIZONS[number];

type MarketProfileNodeKind = 'hvn' | 'lvn';

type SupportedSemanticKind =
  'notice' | 'walletQuery' | 'portfolio' | 'market' | 'assetSearch' | 'webDigest';

export function semanticContent(value: unknown, path: string): AgentSemanticContentV1 {
  const result = object(value, path);
  const schemaVersion = integer(result.schemaVersion, `${path}.schemaVersion`, 1);
  if (schemaVersion !== 1) {
    return { kind: 'clientUnsupported', schemaVersion: 1 };
  }
  try {
    const kind = extensibleOneOf<SupportedSemanticKind>(
      result.kind,
      SUPPORTED_SEMANTIC_KINDS,
      `${path}.kind`,
    );
    switch (kind) {
      case 'notice':
        return readNoticeContent(result, path);
      case 'walletQuery':
        return readWalletQueryContent(result, path);
      case 'portfolio':
        return readPortfolioContent(result, path);
      case 'market':
        return readMarketContent(result, path);
      case 'assetSearch':
        return readAssetSearchContent(result, path);
      case 'webDigest':
        return readWebDigestContent(result, path);
      default:
        return assertUnreachable(kind);
    }
  } catch (error) {
    if (error instanceof AgentV2CompatibilityError) {
      return { kind: 'clientUnsupported', schemaVersion: 1 };
    }
    throw error;
  }
}

function readNoticeContent(result: JsonObject, path: string): AgentNoticeContentV1 {
  const code = extensibleOneOf<AgentNoticeContentV1['code']>(result.code, new Set([
    'agent_unavailable', 'analysis_unavailable', 'asset_not_found', 'clarification_required', 'consent_required',
    'content_over_budget', 'empty_result', 'market_analysis_asset_unsupported',
    'market_analysis_timeframe_unsupported', 'market_analysis_unavailable', 'market_data_unavailable',
    'market_quote', 'portfolio_unavailable', 'receive_details_required', 'receive_ready',
    'receive_unavailable', 'retry_required',
    'send_details_required', 'send_form_amount_required', 'send_ready', 'send_unavailable',
    'staking_ready', 'staking_unavailable',
    'swap_details_required', 'swap_ready', 'swap_unavailable',
    'tool_unavailable', 'wallet_data_unavailable',
    'wallet_filter_ambiguous', 'web_search_unavailable',
  ]), `${path}.code`);
  const argumentsValue = result.arguments === undefined
    ? undefined
    : readNoticeArguments(result.arguments, `${path}.arguments`);
  if (code === 'market_quote' && !argumentsValue?.marketQuote) fail(`${path}.arguments.marketQuote`);
  if (code !== 'market_quote' && argumentsValue?.marketQuote) fail(`${path}.code`);
  if (argumentsValue?.walletQueryFailure && code !== 'wallet_data_unavailable') fail(`${path}.code`);
  if (code === 'analysis_unavailable' && !argumentsValue?.analysisFailure) {
    fail(`${path}.arguments.analysisFailure`);
  }
  if (code !== 'analysis_unavailable' && argumentsValue?.analysisFailure) fail(`${path}.code`);
  if (
    argumentsValue?.repairReason
    && (code !== 'clarification_required' || argumentsValue.field !== 'query')
  ) fail(`${path}.arguments.repairReason`);
  if (code === 'receive_details_required' && !argumentsValue?.receiveFields) {
    fail(`${path}.arguments.receiveFields`);
  }
  if (code !== 'receive_details_required' && argumentsValue?.receiveFields) fail(`${path}.code`);
  if (argumentsValue?.stakeFailure && code !== 'staking_unavailable') fail(`${path}.code`);
  if (code === 'swap_ready' && !argumentsValue?.swapReady) fail(`${path}.arguments.swapReady`);
  if (code === 'swap_details_required' && !argumentsValue?.swapDetails) fail(`${path}.arguments.swapDetails`);
  if (code === 'swap_unavailable' && !argumentsValue?.swapFailure) fail(`${path}.arguments.swapFailure`);
  if (code !== 'swap_ready' && argumentsValue?.swapReady) fail(`${path}.code`);
  if (code !== 'swap_details_required' && argumentsValue?.swapDetails) fail(`${path}.code`);
  if (code !== 'swap_unavailable' && argumentsValue?.swapFailure) fail(`${path}.code`);
  return {
    kind: 'notice',
    schemaVersion: 1,
    code,
    ...(argumentsValue !== undefined && { arguments: argumentsValue }),
  };
}

function readNoticeArguments(
  value: unknown,
  path: string,
): NonNullable<AgentNoticeContentV1['arguments']> {
  const result = object(value, path);
  const marketQuote = result.marketQuote === undefined
    ? undefined
    : readMarketQuoteNotice(result.marketQuote, `${path}.marketQuote`);
  const asset = result.asset === undefined ? undefined : readSemanticAsset(result.asset, `${path}.asset`);
  const chain = result.chain === undefined
    ? undefined
    : boundedString(result.chain, `${path}.chain`, 1, 32);
  const field = result.field === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['field']>>(
      result.field,
      CLARIFICATION_FIELDS,
      `${path}.field`,
    );
  discardInvalidOptionalEnum(result, 'repairReason', [...REPAIR_REASONS]);
  const repairReason = result.repairReason === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['repairReason']>>(
      result.repairReason,
      REPAIR_REASONS,
      `${path}.repairReason`,
    );
  const fields = result.fields === undefined
    ? undefined
    : array(result.fields, `${path}.fields`, 3).map((item, index) => oneOf<
      NonNullable<AgentNoticeContentV1['arguments']>['fields'] extends (infer T)[] | undefined ? T : never
    >(item, new Set(['amount', 'asset', 'recipient']), `${path}.fields[${index}]`));
  if (fields !== undefined && fields.length < 1) fail(`${path}.fields`);
  const receiveFields = result.receiveFields === undefined
    ? undefined
    : array(result.receiveFields, `${path}.receiveFields`, 2).map((item, index) => oneOf<
      NonNullable<AgentNoticeContentV1['arguments']>['receiveFields'] extends (infer T)[] | undefined ? T : never
    >(item, new Set(['asset', 'network']), `${path}.receiveFields[${index}]`));
  if (
    receiveFields !== undefined
    && (receiveFields.length < 1 || new Set(receiveFields).size !== receiveFields.length)
  ) fail(`${path}.receiveFields`);
  const retryAfterMs = result.retryAfterMs === undefined
    ? undefined
    : integer(result.retryAfterMs, `${path}.retryAfterMs`);
  const scope = result.scope === undefined
    ? undefined
    : oneOf<'current' | 'explicitAll'>(result.scope, new Set(['current', 'explicitAll']), `${path}.scope`);
  discardInvalidOptionalEnum(result, 'receiveFailure', [...RECEIVE_FAILURES]);
  discardInvalidOptionalEnum(result, 'stakeFailure', [...STAKE_FAILURES]);
  discardInvalidOptionalEnum(result, 'swapFailure', [...SWAP_FAILURES]);
  discardInvalidOptionalEnum(result, 'analysisFailure', [...ANALYSIS_FAILURES]);
  discardInvalidOptionalEnum(result, 'receiveMemoRequirement', ['not_required']);
  discardInvalidOptionalString(result, 'requestedChain', 32);
  discardInvalidOptionalString(result, 'activeChain', 32);
  const receiveFailure = result.receiveFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['receiveFailure']>>(
      result.receiveFailure,
      RECEIVE_FAILURES,
      `${path}.receiveFailure`,
    );
  const receiveMemoRequirement = result.receiveMemoRequirement === undefined
    ? undefined
    : oneOf<'not_required'>(
      result.receiveMemoRequirement,
      new Set(['not_required']),
      `${path}.receiveMemoRequirement`,
    );
  const stakeFailure = result.stakeFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['stakeFailure']>>(
      result.stakeFailure,
      STAKE_FAILURES,
      `${path}.stakeFailure`,
    );
  const swapReady = result.swapReady === undefined
    ? undefined
    : readSwapReady(result.swapReady, `${path}.swapReady`);
  const swapDetails = result.swapDetails === undefined
    ? undefined
    : readSwapDetails(result.swapDetails, `${path}.swapDetails`);
  const swapFailure = result.swapFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['swapFailure']>>(
      result.swapFailure,
      SWAP_FAILURES,
      `${path}.swapFailure`,
    );
  const requestedChain = result.requestedChain === undefined
    ? undefined
    : boundedString(result.requestedChain, `${path}.requestedChain`, 1, 32);
  const activeChain = result.activeChain === undefined
    ? undefined
    : boundedString(result.activeChain, `${path}.activeChain`, 1, 32);
  const recipientLabel = result.recipientLabel === undefined
    ? undefined
    : boundedString(result.recipientLabel, `${path}.recipientLabel`, 1, 512);
  const sendFailure = result.sendFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['sendFailure']>>(
      result.sendFailure,
      SEND_FAILURES,
      `${path}.sendFailure`,
    );
  let sendFailures: NonNullable<AgentNoticeContentV1['arguments']>['sendFailures'];
  if (result.sendFailures !== undefined) {
    const values = array(result.sendFailures, `${path}.sendFailures`, 2);
    if (values.length !== 2) fail(`${path}.sendFailures`);
    const recipientFailure = oneOf<'recipient_not_found' | 'recipient_ambiguous'>(
      values[0], RECIPIENT_SEND_FAILURES, `${path}.sendFailures[0]`,
    );
    const balanceFailure = oneOf<'asset_not_held' | 'insufficient_balance'>(
      values[1], BALANCE_SEND_FAILURES, `${path}.sendFailures[1]`,
    );
    if (recipientFailure !== sendFailure) fail(`${path}.sendFailures`);
    sendFailures = [recipientFailure, balanceFailure];
  }
  const webSearchFailure = result.webSearchFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['webSearchFailure']>>(
      result.webSearchFailure,
      new Set([
        'capability_unavailable', 'planning_failed', 'budget_denied',
        'provider_rate_limited', 'provider_unavailable', 'no_results', 'invalid_sources',
        'synthesis_timeout', 'synthesis_invalid', 'synthesis_unavailable', 'policy_rejected',
      ]),
      `${path}.webSearchFailure`,
    );
  const walletQueryFailure = result.walletQueryFailure === undefined
    ? undefined
    : literal(result.walletQueryFailure, 'result_not_presentable', `${path}.walletQueryFailure`);
  const analysisFailure = result.analysisFailure === undefined
    ? undefined
    : oneOf<NonNullable<NonNullable<AgentNoticeContentV1['arguments']>['analysisFailure']>>(
      result.analysisFailure,
      ANALYSIS_FAILURES,
      `${path}.analysisFailure`,
    );
  return {
    ...(asset !== undefined && { asset }),
    ...(chain !== undefined && { chain }),
    ...(field !== undefined && { field }),
    ...(repairReason !== undefined && { repairReason }),
    ...(fields !== undefined && { fields }),
    ...(retryAfterMs !== undefined && { retryAfterMs }),
    ...(scope !== undefined && { scope }),
    ...(receiveFailure !== undefined && { receiveFailure }),
    ...(receiveFields !== undefined && { receiveFields }),
    ...(receiveMemoRequirement !== undefined && { receiveMemoRequirement }),
    ...(requestedChain !== undefined && { requestedChain }),
    ...(activeChain !== undefined && { activeChain }),
    ...(marketQuote !== undefined && { marketQuote }),
    ...(recipientLabel !== undefined && { recipientLabel }),
    ...(sendFailure !== undefined && { sendFailure }),
    ...(sendFailures !== undefined && { sendFailures }),
    ...(stakeFailure !== undefined && { stakeFailure }),
    ...(swapReady !== undefined && { swapReady }),
    ...(swapDetails !== undefined && { swapDetails }),
    ...(swapFailure !== undefined && { swapFailure }),
    ...(webSearchFailure !== undefined && { webSearchFailure }),
    ...(walletQueryFailure !== undefined && { walletQueryFailure }),
    ...(analysisFailure !== undefined && { analysisFailure }),
  };
}

function readSwapReady(value: unknown, path: string): AgentSwapReadyV1 {
  const result = object(value, path);
  const amount = readSwapAmount(result.amount, `${path}.amount`);
  return {
    sourceAsset: readSemanticAsset(result.sourceAsset, `${path}.sourceAsset`),
    destinationAsset: readSemanticAsset(result.destinationAsset, `${path}.destinationAsset`),
    amount,
    quote: readSwapQuote(result.quote, `${path}.quote`),
  };
}

function readSwapDetails(value: unknown, path: string): AgentSwapDetailsRequiredV1 {
  const result = object(value, path);
  const field = oneOf<AgentSwapDetailsRequiredV1['field']>(
    result.field,
    new Set(['source_asset', 'destination_asset', 'amount', 'direction']),
    `${path}.field`,
  );
  if (result.candidates === undefined) {
    if (result.hasMore !== undefined) fail(`${path}.hasMore`);
    return { field };
  }
  if (field !== 'source_asset' && field !== 'destination_asset') fail(`${path}.field`);
  const candidates = array(result.candidates, `${path}.candidates`, 3);
  if (candidates.length < 2) fail(`${path}.candidates`);
  return {
    field,
    candidates: candidates.map((candidate, index) => (
      readSemanticAsset(candidate, `${path}.candidates[${index}]`)
    )),
    hasMore: boolean(result.hasMore, `${path}.hasMore`),
  };
}

function readSwapQuote(value: unknown, path: string): AgentSwapIndicativeQuoteV1 {
  const result = object(value, path);
  const status = oneOf<'resolved' | 'unavailable'>(
    result.status,
    new Set(['resolved', 'unavailable']),
    `${path}.status`,
  );
  const observedAt = timestamp(result.observedAt, `${path}.observedAt`);
  if (status === 'unavailable') {
    literal(result.reason, 'price_unavailable', `${path}.reason`);
    return { status, reason: 'price_unavailable', observedAt };
  }
  literal(result.kind, 'indicative_spot', `${path}.kind`);
  return {
    status,
    kind: 'indicative_spot',
    from: readAgentMoneyAmount(result.from, `${path}.from`),
    to: readAgentMoneyAmount(result.to, `${path}.to`),
    observedAt,
  };
}

function readSwapAmount(value: unknown, path: string): AgentSwapAmountV1 {
  const result = object(value, path);
  const amount = boundedString(result.value, `${path}.value`, 1, 128);
  if (!CANONICAL_NONNEGATIVE_DECIMAL_PATTERN.test(amount) || !/[1-9]/u.test(amount)) fail(`${path}.value`);
  return {
    value: amount,
    valueType: literal(result.valueType, 'decimal', `${path}.valueType`),
    side: oneOf(result.side, new Set(['source', 'destination']), `${path}.side`),
  };
}

function readMarketQuoteNotice(value: unknown, path: string): AgentMarketQuoteNoticeV1 {
  const result = object(value, path);
  const status = extensibleOneOf<AgentMarketQuoteNoticeV1['status']>(
    result.status,
    new Set(['resolved', 'price_unavailable', 'ambiguous', 'not_found', 'unavailable']),
    `${path}.status`,
  );
  switch (status) {
    case 'resolved': {
      rejectPresent(result, path, ['candidates', 'hasMore', 'reason']);
      const price = boundedString(result.price, `${path}.price`, 1, 128);
      const percentChange24h = boundedString(result.percentChange24h, `${path}.percentChange24h`, 1, 32);
      const quoteCurrency = boundedString(result.quoteCurrency, `${path}.quoteCurrency`, 3, 8);
      if (!MARKET_UNSIGNED_DECIMAL_PATTERN.test(price)) fail(`${path}.price`);
      if (!MARKET_DECIMAL_PATTERN.test(percentChange24h)) fail(`${path}.percentChange24h`);
      if (!/^[A-Z]{3,8}$/u.test(quoteCurrency)) fail(`${path}.quoteCurrency`);
      return {
        status,
        asset: readSemanticAsset(result.asset, `${path}.asset`),
        price,
        quoteCurrency,
        percentChange24h,
        asOf: timestamp(result.asOf, `${path}.asOf`),
      };
    }
    case 'price_unavailable':
      rejectPresent(result, path, ['price', 'quoteCurrency', 'percentChange24h', 'candidates', 'hasMore', 'reason']);
      return {
        status,
        asset: readSemanticAsset(result.asset, `${path}.asset`),
        asOf: timestamp(result.asOf, `${path}.asOf`),
      };
    case 'ambiguous': {
      rejectPresent(result, path, ['asset', 'price', 'quoteCurrency', 'percentChange24h', 'reason']);
      const candidates = array(result.candidates, `${path}.candidates`, 3);
      if (candidates.length < 2) fail(`${path}.candidates`);
      return {
        status,
        candidates: candidates.map((candidate, index) => (
          readSemanticAsset(candidate, `${path}.candidates[${index}]`)
        )),
        hasMore: boolean(result.hasMore, `${path}.hasMore`),
        asOf: timestamp(result.asOf, `${path}.asOf`),
      };
    }
    case 'not_found':
      rejectPresent(result, path, [
        'asset', 'price', 'quoteCurrency', 'percentChange24h', 'candidates', 'hasMore', 'reason',
      ]);
      return { status, asOf: timestamp(result.asOf, `${path}.asOf`) };
    case 'unavailable':
      rejectPresent(result, path, [
        'asset', 'price', 'quoteCurrency', 'percentChange24h', 'candidates', 'hasMore', 'asOf',
      ]);
      return {
        status,
        reason: oneOf(
          result.reason,
          MARKET_QUOTE_UNAVAILABLE_REASONS,
          `${path}.reason`,
        ),
      };
    default:
      return assertUnreachable(status);
  }
}

function rejectPresent(result: JsonObject, path: string, keys: string[]): void {
  for (const key of keys) {
    if (result[key] !== undefined) fail(`${path}.${key}`);
  }
}

function readWalletQueryContent(result: JsonObject, path: string): AgentWalletQueryContentV1 {
  const queryKind = extensibleOneOf<AgentWalletQueryContentV1['queryKind']>(
    result.queryKind, new Set(['accounts', 'transactions', 'positions']), `${path}.queryKind`,
  );
  const outcome = extensibleOneOf<AgentWalletQueryContentV1['outcome']>(
    result.outcome, new Set(['complete', 'empty', 'partial']), `${path}.outcome`,
  );
  const hasMore = boolean(result.hasMore, `${path}.hasMore`);
  const omittedRows = result.omittedRows === undefined
    ? undefined
    : readWalletPolicyCounter(result.omittedRows, `${path}.omittedRows`);
  const sourceRows = array(result.rows, `${path}.rows`, 100);
  if (queryKind === 'accounts') {
    type AccountRow = Extract<
      AgentWalletQueryContentV1,
      { queryKind: 'accounts' }
    >['rows'][number];
    const rows = sourceRows.flatMap<AccountRow>((row, index) => {
      const itemPath = `${path}.rows[${index}]`;
      try {
        const item = object(row, itemPath);
        const accountLabel = boundedString(item.accountLabel, `${itemPath}.accountLabel`, 1, 80);
        const accessMode = oneOf<'regular' | 'view_only'>(
          item.accessMode, new Set(['regular', 'view_only']), `${itemPath}.accessMode`,
        );
        const portfolioTotalStatus = oneOf<'complete' | 'partial' | 'unavailable'>(
          item.portfolioTotalStatus,
          new Set(['complete', 'partial', 'unavailable']),
          `${itemPath}.portfolioTotalStatus`,
        );
        const accountLabelStatus = item.accountLabelStatus === undefined
          ? undefined
          : literal(item.accountLabelStatus, 'redacted_unsafe', `${itemPath}.accountLabelStatus`);
        if (portfolioTotalStatus === 'unavailable') {
          if (item.portfolioTotal !== undefined) fail(`${itemPath}.portfolioTotal`);
          return [{
            accountLabel, accessMode, portfolioTotalStatus,
            ...(accountLabelStatus !== undefined && { accountLabelStatus }),
          }];
        }
        const total = object(item.portfolioTotal, `${itemPath}.portfolioTotal`);
        const value = boundedString(total.value, `${itemPath}.portfolioTotal.value`, 1, 128);
        if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) fail(`${itemPath}.portfolioTotal.value`);
        const baseCurrency = boundedString(
          total.baseCurrency, `${itemPath}.portfolioTotal.baseCurrency`, 3, 8,
        );
        const unpricedCount = boundedInteger(
          total.unpricedCount, `${itemPath}.portfolioTotal.unpricedCount`, 0, Number.MAX_SAFE_INTEGER,
        );
        return [{
          accountLabel, accessMode, portfolioTotalStatus,
          ...(accountLabelStatus !== undefined && { accountLabelStatus }),
          portfolioTotal: { value, baseCurrency, unpricedCount },
        }];
      } catch (error) {
        if (error instanceof AgentV2ContractError) return [];
        throw error;
      }
    });
    return {
      kind: 'walletQuery', schemaVersion: 1, queryKind, hasMore, rows,
      outcome: rows.length === sourceRows.length ? outcome : 'partial',
      ...(omittedRows !== undefined && { omittedRows }),
    };
  }
  const policySummary = result.policySummary === undefined
    ? undefined
    : readWalletQueryPolicySummary(result.policySummary, `${path}.policySummary`);
  if (queryKind === 'transactions') {
    const rows = sourceRows.flatMap((row, index) => {
      const itemPath = `${path}.rows[${index}]`;
      try {
        const item = object(row, itemPath);
        const chain = boundedString(item.chain, `${itemPath}.chain`, 1, 32);
        type TransactionType = Extract<
          AgentWalletQueryContentV1,
          { queryKind: 'transactions' }
        >['rows'][number]['transactionType'];
        const transactionType = oneOf<TransactionType>(
          item.transactionType, new Set([
            'transfer', 'swap', 'stake', 'unstake', 'unstakeRequest', 'callContract', 'excess',
            'contractDeploy', 'bounced', 'mint', 'burn', 'auctionBid', 'nftTrade',
            'dnsChangeAddress', 'dnsChangeSite', 'dnsChangeSubdomains', 'dnsChangeStorage',
            'dnsDelete', 'dnsRenew', 'liquidityDeposit', 'liquidityWithdraw',
          ]), `${itemPath}.transactionType`);
        type TransactionStatus = Extract<
          AgentWalletQueryContentV1,
          { queryKind: 'transactions' }
        >['rows'][number]['status'];
        const status = oneOf<TransactionStatus>(
          item.status, new Set([
            'pending', 'pendingTrusted', 'confirmed', 'completed', 'failed', 'expired',
          ]), `${itemPath}.status`);
        const rowTimestamp = timestamp(item.timestamp, `${itemPath}.timestamp`);
        discardInvalidOptionalEnum(item, 'direction', ['incoming', 'outgoing', 'self']);
        discardInvalidOptionalEnum(item, 'assetLabelStatus', ['redacted_unsafe']);
        for (const key of ['assetSymbol', 'quantity', 'fee', 'hash'] as const) {
          discardInvalidOptionalString(item, key, 256);
        }
        const direction = item.direction === undefined
          ? undefined
          : oneOf<'incoming' | 'outgoing' | 'self'>(
            item.direction, new Set(['incoming', 'outgoing', 'self']), `${itemPath}.direction`,
          );
        const assetLabelStatus = item.assetLabelStatus === undefined
          ? undefined
          : literal(item.assetLabelStatus, 'redacted_unsafe', `${itemPath}.assetLabelStatus`);
        return [{
          chain, transactionType, status, timestamp: rowTimestamp,
          ...readOptionalBoundedStrings(item, itemPath, ['assetSymbol', 'quantity', 'fee', 'hash']),
          ...(direction !== undefined && { direction }),
          ...(assetLabelStatus !== undefined && { assetLabelStatus }),
        }];
      } catch (error) {
        if (error instanceof AgentV2ContractError) return [];
        throw error;
      }
    });
    return {
      kind: 'walletQuery', schemaVersion: 1, queryKind, hasMore, rows,
      outcome: rows.length === sourceRows.length ? outcome : 'partial',
      ...(omittedRows !== undefined && { omittedRows }),
      ...(policySummary !== undefined && { policySummary }),
    };
  }
  const rows = sourceRows.flatMap((row, index) => {
    const itemPath = `${path}.rows[${index}]`;
    try {
      const item = object(row, itemPath);
      const chain = boundedString(item.chain, `${itemPath}.chain`, 1, 32);
      type PositionKind = Extract<
        AgentWalletQueryContentV1,
        { queryKind: 'positions' }
      >['rows'][number]['positionKind'];
      const positionKind = oneOf<PositionKind>(
        item.positionKind,
        new Set(['fungible', 'nft', 'staking', 'vesting', 'vault']),
        `${itemPath}.positionKind`,
      );
      discardInvalidOptionalEnum(item, 'status', ['active', 'unstaking', 'ready', 'frozen', 'locked']);
      discardInvalidOptionalEnum(item, 'assetLabelStatus', ['redacted_unsafe', 'untrusted_plaintext']);
      discardInvalidOptionalString(item, 'assetName', 160);
      for (const key of ['assetSymbol', 'quantity'] as const) discardInvalidOptionalString(item, key, 256);
      const status = item.status === undefined
        ? undefined
        : oneOf<'active' | 'unstaking' | 'ready' | 'frozen' | 'locked'>(
          item.status, new Set(['active', 'unstaking', 'ready', 'frozen', 'locked']), `${itemPath}.status`,
        );
      const assetLabelStatus = item.assetLabelStatus === undefined
        ? undefined
        : oneOf<'redacted_unsafe' | 'untrusted_plaintext'>(
          item.assetLabelStatus,
          new Set(['redacted_unsafe', 'untrusted_plaintext']),
          `${itemPath}.assetLabelStatus`,
        );
      return [{
        chain, positionKind,
        ...readOptionalBoundedStrings(item, itemPath, ['assetSymbol', 'assetName', 'quantity']),
        ...(status !== undefined && { status }),
        ...(assetLabelStatus !== undefined && { assetLabelStatus }),
      }];
    } catch (error) {
      if (error instanceof AgentV2ContractError) return [];
      throw error;
    }
  });
  return {
    kind: 'walletQuery', schemaVersion: 1, queryKind, hasMore, rows,
    outcome: rows.length === sourceRows.length ? outcome : 'partial',
    ...(omittedRows !== undefined && { omittedRows }),
    ...(policySummary !== undefined && { policySummary }),
  };
}

function readPortfolioContent(result: JsonObject, path: string): AgentPortfolioContentV1 {
  const view = extensibleOneOf<AgentPortfolioContentV1['view']>(
    result.view, new Set(['analysis', 'positions', 'networkActivity']), `${path}.view`,
  );
  if (view === 'analysis') {
    const outcome = extensibleOneOf<'complete' | 'partial' | 'insufficient_data'>(
      result.outcome, new Set(['complete', 'partial', 'insufficient_data']), `${path}.outcome`,
    );
    const payload = object(result.payload, `${path}.payload`);
    const narrativeStatus = oneOf<'provider_accepted' | 'provider_rejected'>(
      result.narrativeStatus,
      new Set(['provider_accepted', 'provider_rejected']),
      `${path}.narrativeStatus`,
    );
    const analysisPayload = readPortfolioAnalysisPayload(payload, `${path}.payload`);
    if (analysisPayload.status !== outcome) fail(`${path}.payload.status`);
    const narrativeMarkdown = result.narrativeMarkdown === undefined
      ? undefined
      : boundedString(result.narrativeMarkdown, `${path}.narrativeMarkdown`, 1, 20_000);
    return {
      kind: 'portfolio', schemaVersion: 1, view, outcome, payload: analysisPayload, narrativeStatus,
      ...(narrativeMarkdown !== undefined && { narrativeMarkdown }),
    };
  }
  if (view === 'positions') {
    const outcome = extensibleOneOf<'complete' | 'partial'>(
      result.outcome, new Set(['complete', 'partial']), `${path}.outcome`,
    );
    const payload = object(result.payload, `${path}.payload`);
    assertLivePortfolioPositionsPayload(payload, `${path}.payload`);
    return { kind: 'portfolio', schemaVersion: 1, view, outcome, payload };
  }
  const outcome = extensibleOneOf<'complete' | 'partial'>(
    result.outcome, new Set(['complete', 'partial']), `${path}.outcome`,
  );
  const payload = object(result.payload, `${path}.payload`);
  assertLiveNetworkActivityPayload(payload, `${path}.payload`);
  return { kind: 'portfolio', schemaVersion: 1, view, outcome, payload };
}

function readMarketContent(result: JsonObject, path: string): AgentMarketContentV1 {
  const view = extensibleOneOf<AgentMarketContentV1['view']>(
    result.view, new Set(['overview', 'analysis']), `${path}.view`,
  );
  const outcome = extensibleOneOf<AgentMarketContentV1['outcome']>(
    result.outcome, new Set(['complete', 'partial']), `${path}.outcome`,
  );
  if (view === 'overview') {
    const evidence = readMarketOverviewEvidence(result.evidence, `${path}.evidence`);
    const narrativeMarkdown = result.narrativeMarkdown === undefined
      ? undefined
      : boundedString(result.narrativeMarkdown, `${path}.narrativeMarkdown`, 1, 20_000);
    return {
      kind: 'market', schemaVersion: 1, view, outcome, evidence,
      ...(narrativeMarkdown !== undefined && { narrativeMarkdown }),
    };
  }
  const evidence = object(result.evidence, `${path}.evidence`);
  const publishedNodeRefs = validateMarketAnalysisEvidence(evidence, `${path}.evidence`);
  assertMarketAnalysisEvidence(evidence);
  let analysis: AgentMarketAnalysisOutputV4 | undefined;
  if (result.analysis !== undefined) {
    const analysisObject = object(result.analysis, `${path}.analysis`);
    validateMarketAnalysisOutput(analysisObject, `${path}.analysis`, publishedNodeRefs);
    assertMarketAnalysisOutput(analysisObject);
    analysis = analysisObject;
  }
  discardInvalidFearGreedRegime(result, `${path}.fearGreedRegime`);
  let fearGreedRegime: AgentMarketFearGreedRegimeV1 | undefined;
  if (result.fearGreedRegime !== undefined) {
    const regime = object(result.fearGreedRegime, `${path}.fearGreedRegime`);
    assertMarketFearGreedRegime(regime);
    fearGreedRegime = regime;
  }
  return {
    ...result,
    kind: 'market', schemaVersion: 1, view, outcome, evidence,
    ...(analysis !== undefined && { analysis }),
    ...(fearGreedRegime !== undefined && { fearGreedRegime }),
  };
}

function readAssetSearchContent(result: JsonObject, path: string): AgentAssetSearchContentV1 {
  const outcome = extensibleOneOf<AgentAssetSearchContentV1['outcome']>(result.outcome, new Set([
    'complete_matches', 'partial_matches', 'complete_absent', 'incomplete_unconfirmed', 'ambiguous', 'scope_denied',
  ]), `${path}.outcome`);
  if (outcome === 'scope_denied') {
    return {
      kind: 'assetSearch', schemaVersion: 1, outcome,
      reason: oneOf<'consent_required' | 'account_scope_not_allowed'>(
        result.reason, new Set(['consent_required', 'account_scope_not_allowed']), `${path}.reason`,
      ),
    };
  }
  if (outcome === 'ambiguous') {
    const candidates = array(result.candidates, `${path}.candidates`, 10)
      .map((candidate, index) => readSemanticAsset(candidate, `${path}.candidates[${index}]`));
    if (candidates.length < 2) fail(`${path}.candidates`);
    return { kind: 'assetSearch', schemaVersion: 1, outcome, candidates };
  }
  const asset = readSemanticAsset(result.asset, `${path}.asset`);
  const coverage = readAssetSearchCoverage(result.coverage, `${path}.coverage`);
  if (outcome === 'complete_matches' || outcome === 'partial_matches') {
    const holdings = array(result.holdings, `${path}.holdings`, 100).map((holding, index) => {
      const item = object(holding, `${path}.holdings[${index}]`);
      return { accountLabel: boundedString(item.accountLabel, `${path}.holdings[${index}].accountLabel`, 1, 160) };
    });
    if (!holdings.length) fail(`${path}.holdings`);
    return { kind: 'assetSearch', schemaVersion: 1, outcome, asset, coverage, holdings };
  }
  return { kind: 'assetSearch', schemaVersion: 1, outcome, asset, coverage };
}

function readWebDigestContent(result: JsonObject, path: string): AgentWebDigestContentV1 {
  const outcome = extensibleOneOf<AgentWebDigestContentV1['outcome']>(
    result.outcome, new Set(['complete', 'partial', 'empty']), `${path}.outcome`,
  );
  const summary = result.summary === undefined
    ? undefined
    : boundedString(result.summary, `${path}.summary`, 1, 2_000);
  const items = array(result.items, `${path}.items`, 20).map((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    const digest = object(item, itemPath);
    const publishedAt = digest.publishedAt === undefined
      ? undefined
      : timestamp(digest.publishedAt, `${itemPath}.publishedAt`);
    const itemSummary = digest.summary === undefined
      ? undefined
      : boundedString(digest.summary, `${itemPath}.summary`, 1, 2_000);
    return {
      headline: boundedString(digest.headline, `${itemPath}.headline`, 1, 512),
      url: boundedString(digest.url, `${itemPath}.url`, 1, 2_048),
      ...(itemSummary !== undefined && { summary: itemSummary }),
      ...(publishedAt !== undefined && { publishedAt }),
    };
  });
  return {
    kind: 'webDigest', schemaVersion: 1, outcome, items,
    ...(summary !== undefined && { summary }),
  };
}

function readSemanticAsset(value: unknown, path: string) {
  const result = object(value, path);
  const name = result.name === undefined
    ? undefined
    : boundedString(result.name, `${path}.name`, 1, 160);
  return {
    slug: boundedString(result.slug, `${path}.slug`, 1, 128),
    chain: boundedString(result.chain, `${path}.chain`, 1, 32),
    symbol: boundedString(result.symbol, `${path}.symbol`, 1, 32),
    ...(name !== undefined && { name }),
  };
}

function readAssetSearchCoverage(value: unknown, path: string) {
  const result = object(value, path);
  const totalVisibleAccountCount = boundedInteger(
    result.totalVisibleAccountCount, `${path}.totalVisibleAccountCount`, 0, 100,
  );
  const checkedAccountCount = boundedInteger(result.checkedAccountCount, `${path}.checkedAccountCount`, 0, 100);
  const inaccessibleAccountCount = boundedInteger(
    result.inaccessibleAccountCount, `${path}.inaccessibleAccountCount`, 0, 100,
  );
  const matchingAccountCount = boundedInteger(result.matchingAccountCount, `${path}.matchingAccountCount`, 0, 100);
  const omittedHoldingCount = boundedInteger(result.omittedHoldingCount, `${path}.omittedHoldingCount`, 0, 10_000);
  const isComplete = boolean(result.isComplete, `${path}.isComplete`);
  if (checkedAccountCount + inaccessibleAccountCount !== totalVisibleAccountCount) fail(path);
  if (isComplete && (inaccessibleAccountCount !== 0 || omittedHoldingCount !== 0)) fail(path);
  return {
    totalVisibleAccountCount,
    checkedAccountCount,
    inaccessibleAccountCount,
    matchingAccountCount,
    omittedHoldingCount,
    isComplete,
  };
}

function readPortfolioAnalysisPayload(
  value: JsonObject,
  path: string,
): AgentPortfolioAnalysisContentPayloadV1 {
  const id = boundedString(value.id, `${path}.id`, 1, 128);
  const status = oneOf<AgentPortfolioAnalysisContentPayloadV1['status']>(
    value.status, new Set(['complete', 'partial', 'insufficient_data']), `${path}.status`,
  );
  literal(value.accountScope, 'current', `${path}.accountScope`);
  const baseCurrency = boundedString(value.baseCurrency, `${path}.baseCurrency`, 3, 8);
  const range = oneOf<AgentPortfolioAnalysisContentPayloadV1['range']>(
    value.range, new Set(['1d', '7d', '1m', '3m', '1y', 'all']), `${path}.range`,
  );
  const generatedAt = timestamp(value.generatedAt, `${path}.generatedAt`);
  const totalValueObject = object(value.totalValue, `${path}.totalValue`);
  const totalValue = {
    value: boundedString(totalValueObject.value, `${path}.totalValue.value`, 1, 128),
    currency: boundedString(totalValueObject.currency, `${path}.totalValue.currency`, 3, 8),
    asOf: timestamp(totalValueObject.asOf, `${path}.totalValue.asOf`),
  };
  const signals = array(value.signals, `${path}.signals`, 5).map((signal, index) => {
    const itemPath = `${path}.signals[${index}]`;
    const item = object(signal, itemPath);
    const asset = item.asset === undefined ? undefined : readSemanticAsset(item.asset, `${itemPath}.asset`);
    const signalValue = item.value === undefined
      ? undefined
      : boundedString(item.value, `${itemPath}.value`, 1, 128);
    const asOf = item.asOf === undefined ? undefined : timestamp(item.asOf, `${itemPath}.asOf`);
    return {
      id: boundedString(item.id, `${itemPath}.id`, 1, 128),
      category: oneOf<'performance' | 'concentration' | 'chain_split' | 'data_quality'>(
        item.category,
        new Set(['performance', 'concentration', 'chain_split', 'data_quality']),
        `${itemPath}.category`,
      ),
      severity: oneOf<'info' | 'watch' | 'important'>(
        item.severity, new Set(['info', 'watch', 'important']), `${itemPath}.severity`,
      ),
      confidence: oneOf<'low' | 'medium' | 'high'>(
        item.confidence, new Set(['low', 'medium', 'high']), `${itemPath}.confidence`,
      ),
      relevance: oneOf<'focused' | 'general'>(
        item.relevance, new Set(['focused', 'general']), `${itemPath}.relevance`,
      ),
      code: boundedString(item.code, `${itemPath}.code`, 1, 128),
      ...(asset !== undefined && { asset }),
      ...(signalValue !== undefined && { value: signalValue }),
      ...(asOf !== undefined && { asOf }),
    };
  });
  if (!signals.length) fail(`${path}.signals`);
  const dataQualityObject = object(value.dataQuality, `${path}.dataQuality`);
  const freshnessObject = object(dataQualityObject.freshness, `${path}.dataQuality.freshness`);
  const staleInputs = freshnessObject.staleInputs === undefined
    ? undefined
    : array(freshnessObject.staleInputs, `${path}.dataQuality.freshness.staleInputs`, 6).map(
      (item, index) => oneOf<NonNullable<
        AgentPortfolioAnalysisContentPayloadV1['dataQuality']['freshness']['staleInputs']
      >[number]>(
        item,
        new Set([
          'wallet_snapshot', 'portfolio_history', 'market_quotes',
          'market_ohlcv', 'public_signals', 'activity',
        ]),
        `${path}.dataQuality.freshness.staleInputs[${index}]`,
      ),
    );
  const omittedData = dataQualityObject.omittedData === undefined
    ? undefined
    : readPortfolioOmittedData(dataQualityObject.omittedData, `${path}.dataQuality.omittedData`);
  const limitations = dataQualityObject.limitations === undefined
    ? undefined
    : readPortfolioLimitations(dataQualityObject.limitations, `${path}.dataQuality.limitations`);
  const dataQuality: AgentPortfolioAnalysisContentPayloadV1['dataQuality'] = {
    freshness: {
      asOf: timestamp(freshnessObject.asOf, `${path}.dataQuality.freshness.asOf`),
      isStale: boolean(freshnessObject.isStale, `${path}.dataQuality.freshness.isStale`),
      ...(staleInputs !== undefined && { staleInputs }),
    },
    ...(omittedData !== undefined && { omittedData }),
    ...(limitations !== undefined && { limitations }),
  };
  const snapshotId = value.snapshotId === undefined
    ? undefined
    : boundedString(value.snapshotId, `${path}.snapshotId`, 1, 256);
  const entryPoint = value.entryPoint === undefined
    ? undefined
    : readEntryPoint(value.entryPoint, `${path}.entryPoint`);
  const rangeChange = value.rangeChange === undefined
    ? undefined
    : readPortfolioRangeChange(value.rangeChange, `${path}.rangeChange`);
  const topPositions = value.topPositions === undefined
    ? undefined
    : readPortfolioTopPositions(value.topPositions, `${path}.topPositions`);
  const performance = value.performance === undefined
    ? undefined
    : readPortfolioPerformance(value.performance, `${path}.performance`);
  if (dataQualityObject.marketCoverage !== undefined) {
    validatePortfolioMarketCoverage(dataQualityObject.marketCoverage, `${path}.dataQuality.marketCoverage`);
  }
  return {
    id,
    status,
    accountScope: 'current',
    baseCurrency,
    range,
    generatedAt,
    totalValue,
    signals,
    dataQuality,
    ...(entryPoint !== undefined && { entryPoint }),
    ...(snapshotId !== undefined && { snapshotId }),
    ...(rangeChange !== undefined && { rangeChange }),
    ...(performance !== undefined && { performance }),
    ...(topPositions !== undefined && { topPositions }),
  };
}

function readEntryPoint(value: unknown, path: string): EntryPoint {
  const result = object(value, path);
  const chartId = result.chartId === undefined
    ? undefined
    : boundedString(result.chartId, `${path}.chartId`, 1, 256);
  const source = result.source === undefined
    ? undefined
    : oneOf<'analyzeIt' | 'manual'>(result.source, new Set(['analyzeIt', 'manual']), `${path}.source`);
  return {
    kind: oneOf<EntryPoint['kind']>(result.kind, new Set(['portfolioChart', 'agentTab']), `${path}.kind`),
    ...(chartId !== undefined && { chartId }),
    ...(source !== undefined && { source }),
  };
}

function readPortfolioRangeChange(value: unknown, path: string) {
  const result = object(value, path);
  const amount = result.amount === undefined ? undefined : boundedString(result.amount, `${path}.amount`, 1, 128);
  const percent = result.percent === undefined
    ? undefined
    : boundedString(result.percent, `${path}.percent`, 1, 128);
  return {
    range: literal(result.range, '1d', `${path}.range`),
    semantics: literal(result.semantics, 'net_worth_change', `${path}.semantics`),
    direction: oneOf<'up' | 'down' | 'flat' | 'unknown'>(
      result.direction, new Set(['up', 'down', 'flat', 'unknown']), `${path}.direction`,
    ),
    ...(amount !== undefined && { amount }),
    ...(percent !== undefined && { percent }),
  };
}

function readPortfolioTopPositions(value: unknown, path: string) {
  const values = array(value, path, 3).map((position, index) => {
    const itemPath = `${path}[${index}]`;
    const item = object(position, itemPath);
    return {
      asset: readSemanticAsset(item.asset, `${itemPath}.asset`),
      value: boundedString(item.value, `${itemPath}.value`, 1, 128),
      currency: boundedString(item.currency, `${itemPath}.currency`, 3, 8),
      percent: boundedString(item.percent, `${itemPath}.percent`, 1, 128),
    };
  });
  if (!values.length) fail(path);
  return values;
}

function readPortfolioPerformance(value: unknown, path: string): PortfolioPerformanceProjectionV1 {
  const result = object(value, path);
  const sourceDensity = oneOf<PortfolioPerformanceProjectionV1['sourceDensity']>(
    result.sourceDensity, new Set(['5m', '1h', '4h', '1d']), `${path}.sourceDensity`,
  );
  const sourceDensityMs = integer(result.sourceDensityMs, `${path}.sourceDensityMs`);
  if (![300000, 3600000, 14400000, 86400000].includes(sourceDensityMs)) fail(`${path}.sourceDensityMs`);
  const chartObject = object(result.chart, `${path}.chart`);
  const timestamps = array(chartObject.timestamps, `${path}.chart.timestamps`, 32).map((item, index) => (
    integer(item, `${path}.chart.timestamps[${index}]`)
  ));
  if (timestamps.length < 2) fail(`${path}.chart.timestamps`);
  const series = array(chartObject.series, `${path}.chart.series`, 8).map((item, index) => {
    const itemPath = `${path}.chart.series[${index}]`;
    const seriesObject = object(item, itemPath);
    const values = array(seriesObject.values, `${itemPath}.values`, 32).map((point, pointIndex) => (
      boundedString(point, `${itemPath}.values[${pointIndex}]`, 1, 128)
    ));
    if (values.length < 2 || values.length !== timestamps.length) fail(`${itemPath}.values`);
    return { asset: readWalletAsset(seriesObject.asset, `${itemPath}.asset`), values };
  });
  if (!series.length) fail(`${path}.chart.series`);
  const topContributorObject = result.topContributor === undefined
    ? undefined
    : object(result.topContributor, `${path}.topContributor`);
  const topContributor = topContributorObject === undefined ? undefined : {
    asset: readWalletAsset(topContributorObject.asset, `${path}.topContributor.asset`),
    semantics: literal(
      topContributorObject.semantics, 'net_worth_change', `${path}.topContributor.semantics`,
    ),
    amount: boundedString(topContributorObject.amount, `${path}.topContributor.amount`, 1, 128),
    currency: boundedString(topContributorObject.currency, `${path}.topContributor.currency`, 3, 8),
    direction: oneOf<'up' | 'down' | 'flat'>(
      topContributorObject.direction, new Set(['up', 'down', 'flat']), `${path}.topContributor.direction`,
    ),
  };
  return {
    calculationVersion: literal(
      result.calculationVersion, 'portfolio-performance-v1', `${path}.calculationVersion`,
    ),
    sourceDensity,
    sourceDensityMs: readPortfolioSourceDensityMs(sourceDensityMs, `${path}.sourceDensityMs`),
    chart: {
      kind: literal(chartObject.kind, 'stacked_net_worth', `${path}.chart.kind`),
      range: oneOf<PortfolioPerformanceProjectionV1['chart']['range']>(
        chartObject.range, new Set(['1d', '7d', '1m', '3m', '1y', 'all']), `${path}.chart.range`,
      ),
      baseCurrency: boundedString(chartObject.baseCurrency, `${path}.chart.baseCurrency`, 3, 8),
      timestamps,
      series,
      coverage: object(chartObject.coverage, `${path}.chart.coverage`),
    },
    comparison: object(result.comparison, `${path}.comparison`),
    ...(topContributor !== undefined && { topContributor }),
  };
}

function validatePortfolioMarketCoverage(value: unknown, path: string) {
  const result = object(value, path);
  if (result.missingMaterialAssets !== undefined) {
    array(result.missingMaterialAssets, `${path}.missingMaterialAssets`, 10);
  }
  if (result.staleSignals !== undefined) array(result.staleSignals, `${path}.staleSignals`, 9);
  if (result.providerLimitations !== undefined) array(result.providerLimitations, `${path}.providerLimitations`, 10);
}

function readPortfolioOmittedData(value: unknown, path: string) {
  return array(value, path, 6).map((item, index) => oneOf<NonNullable<
    AgentPortfolioAnalysisContentPayloadV1['dataQuality']['omittedData']
  >[number]>(item, new Set([
    'holdings_over_limit', 'activity_not_requested', 'activity_unavailable',
    'performance_unavailable', 'market_assets_over_limit', 'market_indicators_unavailable',
  ]), `${path}[${index}]`));
}

function readPortfolioLimitations(value: unknown, path: string) {
  return array(value, path, 8).map((item, index) => oneOf<NonNullable<
    AgentPortfolioAnalysisContentPayloadV1['dataQuality']['limitations']
  >[number]>(item, new Set([
    'stale_wallet_snapshot', 'partial_wallet_coverage', 'partial_market_coverage',
    'market_data_unavailable', 'activity_unavailable', 'performance_unavailable',
    'market_assets_omitted', 'material_market_asset_missing',
  ]), `${path}[${index}]`));
}

function readPortfolioSourceDensityMs(
  value: number,
  path: string,
): PortfolioPerformanceProjectionV1['sourceDensityMs'] {
  if (value === 300000 || value === 3600000 || value === 14400000 || value === 86400000) return value;
  return fail(path);
}

function readMarketOverviewEvidence(value: unknown, path: string): AgentMarketOverviewEvidenceV2 {
  const result = object(value, path);
  const assets = array(result.assets, `${path}.assets`, 3)
    .map((asset, index) => readMarketOverviewAsset(asset, `${path}.assets[${index}]`));
  if (assets.length < 2) fail(`${path}.assets`);
  const coverageObject = object(result.coverage, `${path}.coverage`);
  const missingAssets = coverageObject.missingAssets === undefined
    ? undefined
    : array(coverageObject.missingAssets, `${path}.coverage.missingAssets`, 1)
      .map((asset, index) => readWalletAsset(asset, `${path}.coverage.missingAssets[${index}]`));
  const coverage = {
    requestedAssetCount: literal(
      coverageObject.requestedAssetCount, 3, `${path}.coverage.requestedAssetCount`,
    ),
    usableAssetCount: boundedInteger(coverageObject.usableAssetCount, `${path}.coverage.usableAssetCount`, 0, 3),
    isComplete: boolean(coverageObject.isComplete, `${path}.coverage.isComplete`),
    ...(missingAssets !== undefined && { missingAssets }),
  };
  if (coverage.usableAssetCount !== assets.length) fail(`${path}.coverage.usableAssetCount`);
  if (coverage.isComplete !== (coverage.usableAssetCount === coverage.requestedAssetCount)) {
    fail(`${path}.coverage.isComplete`);
  }
  const limitations = array(result.limitations, `${path}.limitations`, 3).map((limitation, index) => oneOf<
    AgentMarketOverviewEvidenceV2['limitations'][number]
  >(
    limitation,
    new Set(['partial_asset_coverage', 'stale_within_maximum', 'fear_greed_unavailable']),
    `${path}.limitations[${index}]`,
  ));
  const fearGreed = result.fearGreed === undefined
    ? undefined
    : readMarketOverviewFearGreed(result.fearGreed, `${path}.fearGreed`);
  return {
    schemaVersion: literal(result.schemaVersion, 2, `${path}.schemaVersion`),
    basketVersion: literal(result.basketVersion, 'market-overview-v2', `${path}.basketVersion`),
    timeframe: literal(result.timeframe, '1d', `${path}.timeframe`),
    quoteCurrency: literal(result.quoteCurrency, 'USDT', `${path}.quoteCurrency`),
    generatedAt: timestamp(result.generatedAt, `${path}.generatedAt`),
    scope: literal(result.scope, 'selected_assets', `${path}.scope`),
    direction: oneOf<AgentMarketOverviewEvidenceV2['direction']>(
      result.direction, new Set(['up', 'down', 'flat', 'mixed']), `${path}.direction`,
    ),
    directionBasis: literal(result.directionBasis, 'latest_closed_candle', `${path}.directionBasis`),
    assets,
    coverage,
    limitations,
    ...(fearGreed !== undefined && { fearGreed }),
  };
}

function readMarketOverviewAsset(value: unknown, path: string) {
  const result = object(value, path);
  const quote = object(result.quote, `${path}.quote`);
  const change = object(result.change, `${path}.change`);
  return {
    asset: readWalletAsset(result.asset, `${path}.asset`),
    quote: {
      price: readMarketDecimal(quote.price, `${path}.quote.price`, true),
      quoteCurrency: literal(quote.quoteCurrency, 'USDT', `${path}.quote.quoteCurrency`),
      asOf: timestamp(quote.asOf, `${path}.quote.asOf`),
    },
    change: {
      timeframe: literal(change.timeframe, '1d', `${path}.change.timeframe`),
      fromAt: timestamp(change.fromAt, `${path}.change.fromAt`),
      toAt: timestamp(change.toAt, `${path}.change.toAt`),
      percent: readMarketDecimal(change.percent, `${path}.change.percent`, false),
    },
    freshness: readMarketFreshness(result.freshness, `${path}.freshness`),
    quoteSource: readMarketSource(result.quoteSource, `${path}.quoteSource`),
    changeSource: readMarketSource(result.changeSource, `${path}.changeSource`),
  };
}

function readWalletAsset(value: unknown, path: string) {
  const result = object(value, path);
  const name = result.name === undefined ? undefined : boundedString(result.name, `${path}.name`, 1, 160);
  const tokenAddress = result.tokenAddress === undefined
    ? undefined
    : boundedString(result.tokenAddress, `${path}.tokenAddress`, 1, 256);
  const decimals = result.decimals === undefined
    ? undefined
    : boundedInteger(result.decimals, `${path}.decimals`, 0, 255);
  return {
    slug: boundedString(result.slug, `${path}.slug`, 1, 128),
    chain: boundedString(result.chain, `${path}.chain`, 1, 32),
    symbol: boundedString(result.symbol, `${path}.symbol`, 1, 32),
    ...(name !== undefined && { name }),
    ...(tokenAddress !== undefined && { tokenAddress }),
    ...(decimals !== undefined && { decimals }),
  };
}

function readMarketFreshness(value: unknown, path: string) {
  const result = object(value, path);
  const source = oneOf<'fresh_fetch' | 'memory_cache' | 'stale_cache'>(
    result.source, new Set(['fresh_fetch', 'memory_cache', 'stale_cache']), `${path}.source`,
  );
  const isStale = boolean(result.isStale, `${path}.isStale`);
  if ((source === 'stale_cache') !== isStale) fail(`${path}.isStale`);
  const asOf = timestamp(result.asOf, `${path}.asOf`);
  const maxStaleMs = integer(result.maxStaleMs, `${path}.maxStaleMs`);
  return source === 'stale_cache'
    ? { source, isStale: true as const, asOf, maxStaleMs }
    : { source, isStale: false as const, asOf, maxStaleMs };
}

function readMarketSource(value: unknown, path: string) {
  const result = object(value, path);
  const provider = oneOf<'binance' | 'bybit' | 'coingecko' | 'alternative_me'>(
    result.provider, new Set(['binance', 'bybit', 'coingecko', 'alternative_me']), `${path}.provider`,
  );
  literal(result.attributionRequired, true, `${path}.attributionRequired`);
  const expected = {
    binance: {
      endpoints: new Set(['binance.ticker_price', 'binance.klines']),
      label: 'Binance', url: 'https://www.binance.com/',
    },
    bybit: {
      endpoints: new Set(['bybit.tickers', 'bybit.klines']),
      label: 'Bybit', url: 'https://www.bybit.com/',
    },
    coingecko: {
      endpoints: new Set([
        'coingecko.global', 'coingecko.simple_price', 'coingecko.global_market_cap_chart',
        'coingecko.coin_market_chart',
      ]),
      label: 'CoinGecko', url: 'https://www.coingecko.com/',
    },
    alternative_me: {
      endpoints: new Set(['alternative.fng']),
      label: 'Alternative.me', url: 'https://alternative.me/crypto/fear-and-greed-index/',
    },
  }[provider];
  oneOf(result.endpoint, expected.endpoints, `${path}.endpoint`);
  literal(result.attributionLabel, expected.label, `${path}.attributionLabel`);
  literal(result.attributionUrl, expected.url, `${path}.attributionUrl`);
  assertMarketSource(result);
  return result;
}

function readMarketOverviewFearGreed(value: unknown, path: string) {
  const result = object(value, path);
  const source = readMarketSource(result.source, `${path}.source`);
  if (source.provider !== 'alternative_me') fail(`${path}.source.provider`);
  return {
    value: boundedInteger(result.value, `${path}.value`, 0, 100),
    zone: oneOf<'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed'>(
      result.zone,
      new Set(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']),
      `${path}.zone`,
    ),
    zoneVersion: literal(result.zoneVersion, 'fear-greed-zones-v1', `${path}.zoneVersion`),
    asOf: timestamp(result.asOf, `${path}.asOf`),
    freshness: readMarketFreshness(result.freshness, `${path}.freshness`),
    source,
  };
}

function readMarketDecimal(value: unknown, path: string, positive: boolean) {
  const result = boundedString(value, path, 1, 128);
  const numeric = Number(result);
  if (!MARKET_DECIMAL_PATTERN.test(result) || !Number.isFinite(numeric) || (positive && numeric <= 0)) fail(path);
  return result;
}

function assertMarketSource(
  value: JsonObject,
): asserts value is JsonObject & AgentMarketOverviewEvidenceV2['assets'][number]['quoteSource'] {
  // The provider-specific endpoint and attribution tuple is validated immediately before this refinement.
}

function assertMarketAnalysisEvidence(
  value: JsonObject,
): asserts value is JsonObject & (AgentMarketAnalysisEvidenceV5 | AgentMarketAnalysisEvidenceV6) {
  // Historical V5 or fully validated V6 evidence reaches this refinement.
}

function assertMarketAnalysisOutput(
  value: JsonObject,
): asserts value is JsonObject & AgentMarketAnalysisOutputV4 {
  // Every required output field and evidence reference is validated immediately before this refinement.
}

function assertMarketFearGreedRegime(
  value: JsonObject,
): asserts value is JsonObject & AgentMarketFearGreedRegimeV1 {
  // Every required regime field is validated immediately before this refinement.
}

function assertUnreachable(value: never): never {
  throw new Error(`Unsupported Agent V2 semantic kind: ${String(value)}`);
}

function validateMarketAnalysisEvidence(value: JsonObject, path: string) {
  if (value.schemaVersion === 5) return undefined;
  literal(value.schemaVersion, 6, `${path}.schemaVersion`);
  const requestedHorizons = validateMarketHorizons(value.requestedHorizons, `${path}.requestedHorizons`);
  const primaryDisplayHorizon = oneOf(
    value.primaryDisplayHorizon,
    new Set(MARKET_HORIZONS),
    `${path}.primaryDisplayHorizon`,
  );
  if (!requestedHorizons.includes(primaryDisplayHorizon)) fail(`${path}.primaryDisplayHorizon`);
  validateMarketTechnicalEvidence(value.technicalEvidence, `${path}.technicalEvidence`);
  validateMarketStructures(value.structures, `${path}.structures`);
  if (value.periodLevels !== undefined) object(value.periodLevels, `${path}.periodLevels`);
  const publishedNodeRefs = validateMarketLevelMaps(value.levelMaps, `${path}.levelMaps`);
  validateMarketExpectedMoves(value.expectedMoves, `${path}.expectedMoves`);
  addSetValues(publishedNodeRefs, validateMarketScenarioTrees(
    value.scenarioTrees,
    `${path}.scenarioTrees`,
    publishedNodeRefs,
  ));
  validateMarketNodePolicyPairing(value.levelMaps, value.scenarioTrees, path);
  validateMarketVolumeProfileCoverage(
    value.volumeProfileCoverage,
    requestedHorizons,
    `${path}.volumeProfileCoverage`,
  );
  validateMarketEvidenceCatalog(value.evidenceCatalog, publishedNodeRefs, `${path}.evidenceCatalog`);
  const coverage = object(value.coverage, `${path}.coverage`);
  boundedInteger(coverage.structureTimeframeCount, `${path}.coverage.structureTimeframeCount`, 0, 3);
  boundedInteger(coverage.availableLevelMapCount, `${path}.coverage.availableLevelMapCount`, 0, 3);
  boundedInteger(coverage.eligibleScenarioCount, `${path}.coverage.eligibleScenarioCount`, 0, 9);
  boolean(coverage.complete, `${path}.coverage.complete`);
  return publishedNodeRefs;
}

function discardInvalidFearGreedRegime(content: JsonObject, path: string) {
  if (content.fearGreedRegime === undefined) return;
  try {
    const regime = object(content.fearGreedRegime, path);
    literal(regime.schemaVersion, 1, `${path}.schemaVersion`);
    literal(regime.policyVersion, 'fear-greed-sma-regime-v1', `${path}.policyVersion`);
    literal(regime.basis, 'closed_utc_daily', `${path}.basis`);
    validateCanonicalUtcDate(regime.asOfDate, `${path}.asOfDate`);
    boundedInteger(regime.latestValue, `${path}.latestValue`, 0, 100);
    validateFearGreedSma(regime.sma30, `${path}.sma30`);
    validateFearGreedSma(regime.sma365, `${path}.sma365`);
    oneOf(regime.regime, new Set(['risk_on', 'risk_off', 'neutral']), `${path}.regime`);
    const seriesDigest = boundedString(regime.seriesDigest, `${path}.seriesDigest`, 64, 64);
    if (!SHA256_PATTERN.test(seriesDigest)) fail(`${path}.seriesDigest`);
    validateAlternativeMeSource(regime.source, `${path}.source`);
  } catch (error) {
    if (!(error instanceof AgentV2ContractError)) throw error;
    delete content.fearGreedRegime;
  }
}

function validateCanonicalUtcDate(value: unknown, path: string) {
  const utcDate = boundedString(value, path, 10, 10);
  const timestamp = Date.parse(`${utcDate}T00:00:00.000Z`);
  if (!UTC_DATE_PATTERN.test(utcDate)
    || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== utcDate) fail(path);
}

function validateFearGreedSma(value: unknown, path: string) {
  const decimal = boundedString(value, path, 10, 12);
  const numericValue = Number(decimal);
  if (!FEAR_GREED_SMA_PATTERN.test(decimal)
    || !Number.isFinite(numericValue)
    || numericValue < 0
    || numericValue > 100) fail(path);
}

function validateAlternativeMeSource(value: unknown, path: string) {
  const source = object(value, path);
  literal(source.provider, 'alternative_me', `${path}.provider`);
  literal(source.endpoint, 'alternative.fng', `${path}.endpoint`);
  literal(source.attributionRequired, true, `${path}.attributionRequired`);
  literal(source.attributionLabel, 'Alternative.me', `${path}.attributionLabel`);
  literal(
    source.attributionUrl,
    'https://alternative.me/crypto/fear-and-greed-index/',
    `${path}.attributionUrl`,
  );
}

function validateMarketHorizons(value: unknown, path: string) {
  const horizons = array(value, path, MARKET_HORIZONS.length).map((item, index) => (
    oneOf<string>(item, new Set(MARKET_HORIZONS), `${path}[${index}]`)
  ));
  if (!horizons.length || new Set(horizons).size !== horizons.length) fail(path);
  const indexes = horizons.map((horizon) => MARKET_HORIZONS.indexOf(horizon as typeof MARKET_HORIZONS[number]));
  if (indexes.some((value, index) => index > 0 && value <= indexes[index - 1])) fail(path);
  return horizons;
}

function validateMarketTechnicalEvidence(value: unknown, path: string) {
  const evidence = object(value, path);
  literal(evidence.schemaVersion, 4, `${path}.schemaVersion`);
  const asset = object(evidence.asset, `${path}.asset`);
  boundedString(asset.slug, `${path}.asset.slug`, 1, 128);
  boundedString(asset.chain, `${path}.asset.chain`, 1, 32);
  boundedString(asset.symbol, `${path}.asset.symbol`, 1, 32);
  if (asset.name !== undefined) boundedString(asset.name, `${path}.asset.name`, 1, 160);
  oneOf(evidence.primaryTimeframe, new Set(MARKET_TIMEFRAMES), `${path}.primaryTimeframe`);
  const quote = object(evidence.quote, `${path}.quote`);
  validateMarketDecimal(quote.price, `${path}.quote.price`, false, true);
  literal(quote.quoteCurrency, 'USDT', `${path}.quote.quoteCurrency`);
  timestamp(quote.asOf, `${path}.quote.asOf`);
  object(evidence.quoteSource, `${path}.quoteSource`);
  timestamp(evidence.asOf, `${path}.asOf`);
  const timeframes = array(evidence.timeframes, `${path}.timeframes`, MARKET_TIMEFRAMES.length);
  if (timeframes.length !== MARKET_TIMEFRAMES.length) fail(`${path}.timeframes`);
  timeframes.forEach((slotValue, index) => {
    const slotPath = `${path}.timeframes[${index}]`;
    const slot = object(slotValue, slotPath);
    literal(slot.timeframe, MARKET_TIMEFRAMES[index], `${slotPath}.timeframe`);
    const status = oneOf(slot.status, new Set(['available', 'unavailable']), `${slotPath}.status`);
    if (status === 'unavailable') {
      oneOf(slot.reason, new Set(['context_unavailable', 'evidence_invalid']), `${slotPath}.reason`);
      return;
    }
    const timeframeEvidence = object(slot.evidence, `${slotPath}.evidence`);
    const change = object(timeframeEvidence.change, `${slotPath}.evidence.change`);
    literal(change.timeframe, MARKET_TIMEFRAMES[index], `${slotPath}.evidence.change.timeframe`);
    timestamp(change.fromAt, `${slotPath}.evidence.change.fromAt`);
    timestamp(change.toAt, `${slotPath}.evidence.change.toAt`);
    validateMarketDecimal(change.absolute, `${slotPath}.evidence.change.absolute`, true);
    validateMarketDecimal(change.percent, `${slotPath}.evidence.change.percent`, true);
    literal(change.quoteCurrency, 'USDT', `${slotPath}.evidence.change.quoteCurrency`);
    validateMarketFreshness(timeframeEvidence.freshness, `${slotPath}.evidence.freshness`);
  });
  const coverage = object(evidence.coverage, `${path}.coverage`);
  literal(coverage.requestedTimeframeCount, 3, `${path}.coverage.requestedTimeframeCount`);
  boundedInteger(coverage.availableTimeframeCount, `${path}.coverage.availableTimeframeCount`, 1, 3);
  literal(coverage.requestedIndicatorCount, 39, `${path}.coverage.requestedIndicatorCount`);
  boundedInteger(coverage.availableIndicatorCount, `${path}.coverage.availableIndicatorCount`, 0, 39);
  boolean(coverage.complete, `${path}.coverage.complete`);
}

function validateMarketFreshness(value: unknown, path: string) {
  const freshness = object(value, path);
  const source = oneOf(freshness.source, new Set(['fresh_fetch', 'memory_cache', 'stale_cache']), `${path}.source`);
  const isStale = boolean(freshness.isStale, `${path}.isStale`);
  if ((source === 'stale_cache') !== isStale) fail(`${path}.isStale`);
  timestamp(freshness.asOf, `${path}.asOf`);
  boundedInteger(freshness.maxStaleMs, `${path}.maxStaleMs`, 0, 604_800_000);
}

function validateMarketStructures(value: unknown, path: string) {
  const structures = array(value, path, MARKET_TIMEFRAMES.length);
  if (structures.length !== MARKET_TIMEFRAMES.length) fail(path);
  structures.forEach((slotValue, index) => {
    const slotPath = `${path}[${index}]`;
    const slot = object(slotValue, slotPath);
    literal(slot.timeframe, MARKET_TIMEFRAMES[index], `${slotPath}.timeframe`);
    if (slot.snapshot === undefined) return;
    const snapshot = object(slot.snapshot, `${slotPath}.snapshot`);
    if (snapshot.points !== undefined) fail(`${slotPath}.snapshot.points`);
    literal(snapshot.timeframe, MARKET_TIMEFRAMES[index], `${slotPath}.snapshot.timeframe`);
    oneOf(snapshot.direction, new Set([
      'higher_highs_higher_lows', 'lower_highs_lower_lows', 'range', 'transition', 'insufficient_data',
    ]), `${slotPath}.snapshot.direction`);
    oneOf(snapshot.event, new Set([
      'none', 'break_up', 'break_down', 'retest_up', 'retest_down',
    ]), `${slotPath}.snapshot.event`);
    oneOf(snapshot.liveState, new Set([
      'inside_structure', 'approaching_upper', 'approaching_lower',
    ]), `${slotPath}.snapshot.liveState`);
    validateMarketFreshness(snapshot.freshness, `${slotPath}.snapshot.freshness`);
  });
}

function validateMarketLevelMaps(value: unknown, path: string) {
  const maps = object(value, path);
  const nodeRefs = new Set<string>();
  MARKET_HORIZONS.forEach((horizon) => {
    addSetValues(nodeRefs, validateMarketLevelMap(maps[horizon], horizon, `${path}.${horizon}`));
  });
  return nodeRefs;
}

function validateMarketLevelMap(value: unknown, horizon: MarketHorizon, path: string) {
  const map = object(value, path);
  literal(map.horizon, horizon, `${path}.horizon`);
  const policyVersion = oneOf(map.policyVersion, new Set([
    'market-level-map-v1', 'market-level-map-v2',
  ]), `${path}.policyVersion`);
  const status = oneOf(map.status, new Set(['available', 'insufficient_data']), `${path}.status`);
  if (status === 'insufficient_data') {
    oneOf(map.reason, new Set([
      'required_timeframe_unavailable', 'atr_unavailable', 'invalid_levels',
    ]), `${path}.reason`);
    return new Set<string>();
  }
  validateMarketDecimal(map.tolerance, `${path}.tolerance`, false, true);
  const supports = array(map.supports, `${path}.supports`, 4);
  const resistances = array(map.resistances, `${path}.resistances`, 4);
  const supportZones = supports.map((zone, index) => validateMarketZone(
    zone, horizon, `${path}.supports[${index}]`, 'support',
  ));
  const resistanceZones = resistances.map((zone, index) => validateMarketZone(
    zone, horizon, `${path}.resistances[${index}]`, 'resistance',
  ));
  const equilibriumZones = map.equilibrium === undefined ? [] : [validateMarketZone(
    map.equilibrium, horizon, `${path}.equilibrium`, 'transition',
  )];
  const zones = [...supportZones, ...resistanceZones, ...equilibriumZones];
  if (zones.some(({ hasLvn }) => hasLvn)) fail(`${path}.policyVersion`);
  if (policyVersion === 'market-level-map-v1' && zones.some(({ nodeRefs }) => nodeRefs.size)) {
    fail(`${path}.policyVersion`);
  }
  const coverage = object(map.coverage, `${path}.coverage`);
  boundedInteger(coverage.candidateCount, `${path}.coverage.candidateCount`, 0, 10_000);
  boundedInteger(coverage.zoneCount, `${path}.coverage.zoneCount`, 0, 9);
  boundedInteger(coverage.actionableZoneCount, `${path}.coverage.actionableZoneCount`, 0, 9);
  boolean(coverage.complete, `${path}.coverage.complete`);
  const nodeRefs = new Set<string>();
  [...supportZones.slice(0, 2), ...resistanceZones.slice(0, 2), ...equilibriumZones]
    .forEach((zone) => addSetValues(nodeRefs, zone.nodeRefs));
  return nodeRefs;
}

interface MarketZoneValidation {
  id: string;
  lower: number;
  upper: number;
  hasHvn: boolean;
  hasLvn: boolean;
  nodeRefs: Set<string>;
}

function validateMarketZone(
  value: unknown,
  horizon: MarketHorizon,
  path: string,
  expectedRole?: string,
): MarketZoneValidation {
  const zone = object(value, path);
  const id = boundedString(zone.id, `${path}.id`, 1, 256);
  const lower = validateMarketDecimal(zone.lower, `${path}.lower`, false, true);
  const upper = validateMarketDecimal(zone.upper, `${path}.upper`, false, true);
  if (lower >= upper) fail(`${path}.upper`);
  const role = oneOf(zone.role, new Set(['support', 'resistance', 'transition']), `${path}.role`);
  if (expectedRole && role !== expectedRole) fail(`${path}.role`);
  const strength = oneOf(zone.strength, new Set(['primary', 'secondary', 'context']), `${path}.strength`);
  const sources = array(zone.sources, `${path}.sources`, 72);
  if (!sources.length) fail(`${path}.sources`);
  let hasHvn = false;
  let hasLvn = false;
  let hasNonNodeSource = false;
  const nodeRefs = new Set<string>();
  sources.forEach((sourceValue, index) => {
    const sourcePath = `${path}.sources[${index}]`;
    const source = object(sourceValue, sourcePath);
    const kind = oneOf(source.kind, new Set([
      'swing_high', 'swing_low', 'previous_period_high', 'previous_period_low', 'anchored_vwap',
      'moving_average', 'channel_boundary', 'round_number', 'volume_profile_poc', 'volume_profile_val',
      'volume_profile_vah', 'volume_profile_hvn', 'volume_profile_lvn', 'expected_move_boundary',
      'range_midpoint',
    ]), `${sourcePath}.kind`);
    const timeframe = oneOf(
      source.timeframe,
      new Set([...MARKET_TIMEFRAMES, 'period', 'profile']),
      `${sourcePath}.timeframe`,
    );
    const evidenceRef = boundedString(source.evidenceRef, `${sourcePath}.evidenceRef`, 1, 256);
    if (kind === 'volume_profile_hvn' || kind === 'volume_profile_lvn') {
      if (timeframe !== 'profile') fail(`${sourcePath}.timeframe`);
      const node = validateMarketProfileNodeEvidenceRef(evidenceRef, horizon, `${sourcePath}.evidenceRef`);
      const expectedKind: MarketProfileNodeKind = kind === 'volume_profile_hvn' ? 'hvn' : 'lvn';
      if (node.kind !== expectedKind) fail(`${sourcePath}.evidenceRef`);
      nodeRefs.add(evidenceRef);
      hasHvn ||= node.kind === 'hvn';
      hasLvn ||= node.kind === 'lvn';
      return;
    }
    if (timeframe === 'profile') fail(`${sourcePath}.timeframe`);
    const profileSuffix = kind === 'volume_profile_poc' ? 'poc'
      : kind === 'volume_profile_val' ? 'val'
        : kind === 'volume_profile_vah' ? 'vah' : undefined;
    if (profileSuffix) {
      if (timeframe !== 'period') fail(`${sourcePath}.timeframe`);
      validateMarketProfileLevelEvidenceRef(
        evidenceRef, horizon, profileSuffix, `${sourcePath}.evidenceRef`,
      );
    } else if (isMarketProfileNodeEvidenceCandidate(evidenceRef)) {
      fail(`${sourcePath}.evidenceRef`);
    }
    hasNonNodeSource = true;
  });
  if (hasHvn && !hasNonNodeSource) fail(`${path}.sources`);
  const touchCount = boundedInteger(zone.touchCount, `${path}.touchCount`, 0, 10_000);
  const rejectionCount = boundedInteger(zone.rejectionCount, `${path}.rejectionCount`, 0, 10_000);
  const hasLastInteractionAt = Object.hasOwn(zone, 'lastInteractionAt');
  if (zone.lastInteractionAt !== undefined) timestamp(zone.lastInteractionAt, `${path}.lastInteractionAt`);
  const state = oneOf(zone.state, new Set(['untested', 'holding', 'broken', 'retested']), `${path}.state`);
  if (hasLvn && (role !== 'transition'
    || hasHvn
    || hasNonNodeSource
    || sources.length !== 1
    || nodeRefs.size !== 1
    || id !== [...nodeRefs][0]
    || strength !== 'context'
    || touchCount !== 0
    || rejectionCount !== 0
    || state !== 'untested'
    || hasLastInteractionAt)) fail(path);
  return { id, lower, upper, hasHvn, hasLvn, nodeRefs };
}

function validateMarketExpectedMoves(value: unknown, path: string) {
  const moves = object(value, path);
  MARKET_HORIZONS.forEach((horizon) => {
    const movePath = `${path}.${horizon}`;
    const move = object(moves[horizon], movePath);
    literal(move.horizon, horizon, `${movePath}.horizon`);
    literal(move.durationDays, horizon === '3d' ? 3 : horizon === '7d' ? 7 : 30, `${movePath}.durationDays`);
    timestamp(move.targetAt, `${movePath}.targetAt`);
    const status = oneOf(move.status, new Set(['available', 'insufficient_data']), `${movePath}.status`);
    if (status === 'insufficient_data') {
      boundedString(move.reason, `${movePath}.reason`, 1, 96);
      return;
    }
    validateMarketDecimal(move.movePct, `${movePath}.movePct`, false, true);
    const ranges = object(move.ranges, `${movePath}.ranges`);
    ['bearish', 'base', 'bullish'].forEach((kind) => {
      const rangePath = `${movePath}.ranges.${kind}`;
      const range = object(ranges[kind], rangePath);
      const lower = validateMarketDecimal(range.lower, `${rangePath}.lower`, false, true);
      const upper = validateMarketDecimal(range.upper, `${rangePath}.upper`, false, true);
      if (lower > upper) fail(`${rangePath}.upper`);
    });
  });
}

function validateMarketScenarioTrees(
  value: unknown,
  path: string,
  publishedLevelNodeRefs: ReadonlySet<string>,
) {
  const trees = object(value, path);
  const nodeRefs = new Set<string>();
  MARKET_HORIZONS.forEach((horizon) => {
    const treePath = `${path}.${horizon}`;
    const tree = object(trees[horizon], treePath);
    literal(tree.horizon, horizon, `${treePath}.horizon`);
    const policyVersion = oneOf(tree.policyVersion, new Set([
      'market-structural-scenarios-v1', 'market-structural-scenarios-v2',
    ]), `${treePath}.policyVersion`);
    timestamp(tree.targetAt, `${treePath}.targetAt`);
    oneOf(tree.directionalState, new Set([
      'bullish', 'bearish', 'range', 'mixed', 'insufficient_data',
    ]), `${treePath}.directionalState`);
    if (tree.primaryScenario !== undefined) {
      oneOf(tree.primaryScenario, new Set(MARKET_SCENARIO_KINDS), `${treePath}.primaryScenario`);
    }
    if (tree.activeScenario !== undefined) {
      oneOf(tree.activeScenario, new Set(MARKET_SCENARIO_KINDS), `${treePath}.activeScenario`);
    }
    const paths = array(tree.paths, `${treePath}.paths`, MARKET_SCENARIO_KINDS.length);
    if (paths.length !== MARKET_SCENARIO_KINDS.length) fail(`${treePath}.paths`);
    let primaryCount = 0;
    const primaryNodeRefs = new Set<string>();
    paths.forEach((pathValue, index) => {
      const scenarioPath = `${treePath}.paths[${index}]`;
      const scenario = object(pathValue, scenarioPath);
      literal(scenario.kind, MARKET_SCENARIO_KINDS[index], `${scenarioPath}.kind`);
      literal(scenario.horizon, horizon, `${scenarioPath}.horizon`);
      const status = oneOf(scenario.status, new Set(['eligible', 'insufficient_data']), `${scenarioPath}.status`);
      const priority = oneOf(
        scenario.priority,
        new Set(['primary', 'alternative', 'tail']),
        `${scenarioPath}.priority`,
      );
      if (priority === 'primary') primaryCount += 1;
      if (status === 'insufficient_data') {
        oneOf(scenario.reason, new Set([
          'forecast_unavailable', 'level_map_unavailable', 'activation_level_unavailable',
        ]), `${scenarioPath}.reason`);
        return;
      }
      timestamp(scenario.targetAt, `${scenarioPath}.targetAt`);
      const activationZoneIds = validateMarketScenarioCondition(
        scenario.activation, `${scenarioPath}.activation`,
      );
      const steps = array(scenario.path, `${scenarioPath}.path`, 3);
      if (!steps.length) fail(`${scenarioPath}.path`);
      const scenarioNodeRefs = new Set<string>();
      const stepZones: MarketZoneValidation[] = [];
      let transitZone: MarketZoneValidation | undefined;
      steps.forEach((stepValue, stepIndex) => {
        const stepPath = `${scenarioPath}.path[${stepIndex}]`;
        const step = object(stepValue, stepPath);
        const zone = validateMarketZone(step.zone, horizon, `${stepPath}.zone`);
        stepZones.push(zone);
        addSetValues(scenarioNodeRefs, zone.nodeRefs);
        const role = oneOf(step.role, new Set([
          'test', 'acceptance', 'rejection', 'transit', 'target',
        ]), `${stepPath}.role`);
        if (role === 'transit') {
          if (policyVersion !== 'market-structural-scenarios-v2'
            || priority !== 'primary'
            || scenario.kind === 'range_balance'
            || stepIndex === 0
            || stepIndex === steps.length - 1
            || transitZone
            || !zone.hasLvn
            || zone.nodeRefs.size !== 1) fail(`${stepPath}.role`);
          transitZone = zone;
        } else if (zone.hasLvn) {
          fail(`${stepPath}.zone.sources`);
        }
        oneOf(step.expectedConfirmation, new Set(['4h_close', '1d_close']), `${stepPath}.expectedConfirmation`);
        const insideExpectedMove = boolean(step.insideExpectedMove, `${stepPath}.insideExpectedMove`);
        if (role === 'transit' && !insideExpectedMove) fail(`${stepPath}.insideExpectedMove`);
      });
      const terminalZone = validateMarketZone(scenario.terminalZone, horizon, `${scenarioPath}.terminalZone`);
      if (terminalZone.hasLvn) fail(`${scenarioPath}.terminalZone.sources`);
      addSetValues(scenarioNodeRefs, terminalZone.nodeRefs);
      const invalidationZoneIds = validateMarketScenarioCondition(
        scenario.invalidation, `${scenarioPath}.invalidation`,
      );
      if (transitZone && (!activationZoneIds.includes(stepZones[0].id)
        || stepZones.at(-1)?.id !== terminalZone.id
        || activationZoneIds.includes(transitZone.id)
        || invalidationZoneIds.includes(transitZone.id))) fail(`${scenarioPath}.path`);
      const expectedMove = object(scenario.expectedMove, `${scenarioPath}.expectedMove`);
      validateMarketDecimal(expectedMove.movePct, `${scenarioPath}.expectedMove.movePct`, false, true);
      const lower = validateMarketDecimal(expectedMove.lower, `${scenarioPath}.expectedMove.lower`, false, true);
      const upper = validateMarketDecimal(expectedMove.upper, `${scenarioPath}.expectedMove.upper`, false, true);
      if (lower > upper) fail(`${scenarioPath}.expectedMove.upper`);
      if (transitZone && (transitZone.lower < lower || transitZone.upper > upper)) {
        fail(`${scenarioPath}.path`);
      }
      if (transitZone) {
        const activationZone = stepZones[0];
        const strictlyInterior = scenario.kind === 'bullish_breakout'
          ? transitZone.lower > activationZone.upper && transitZone.upper < terminalZone.lower
          : transitZone.upper < activationZone.lower && transitZone.lower > terminalZone.upper;
        if (!strictlyInterior) fail(`${scenarioPath}.path`);
      }
      if (policyVersion === 'market-structural-scenarios-v1' && scenarioNodeRefs.size) {
        fail(`${treePath}.policyVersion`);
      }
      const evidenceRefs = validateUniqueBoundedStrings(
        scenario.evidenceRefs, `${scenarioPath}.evidenceRefs`, 256,
      );
      const evidenceNodeRefs = new Set<string>();
      evidenceRefs.forEach((reference, referenceIndex) => {
        if (!isMarketProfileNodeEvidenceCandidate(reference)) return;
        validateMarketProfileNodeEvidenceRef(
          reference, horizon, `${scenarioPath}.evidenceRefs[${referenceIndex}]`,
        );
        if (!scenarioNodeRefs.has(reference) && !publishedLevelNodeRefs.has(reference)) {
          fail(`${scenarioPath}.evidenceRefs[${referenceIndex}]`);
        }
        evidenceNodeRefs.add(reference);
      });
      if ([...scenarioNodeRefs].some((reference) => !evidenceNodeRefs.has(reference))) {
        fail(`${scenarioPath}.evidenceRefs`);
      }
      if (priority === 'primary') addSetValues(primaryNodeRefs, scenarioNodeRefs);
      oneOf(scenario.confidence, new Set(['low', 'medium']), `${scenarioPath}.confidence`);
    });
    if (tree.primaryScenario === undefined) {
      if (primaryCount !== 0) fail(`${treePath}.paths`);
    } else {
      if (primaryCount !== 1) fail(`${treePath}.paths`);
      const primary = paths.map((item) => object(item, treePath)).find((item) => item.priority === 'primary');
      if (primary?.kind !== tree.primaryScenario || primary.status !== 'eligible') fail(`${treePath}.primaryScenario`);
    }
    if (tree.activeScenario !== undefined) {
      const active = paths.map((item) => object(item, treePath)).filter((item) => {
        if (item.status !== 'eligible') return false;
        const activation = object(item.activation, `${treePath}.activeScenario`);
        const invalidation = object(item.invalidation, `${treePath}.activeScenario`);
        return activation.state === 'triggered' && invalidation.state !== 'triggered';
      });
      if (active.length !== 1 || active[0].kind !== tree.activeScenario) fail(`${treePath}.activeScenario`);
    }
    addSetValues(nodeRefs, primaryNodeRefs);
  });
  return nodeRefs;
}

function validateMarketScenarioCondition(value: unknown, path: string) {
  const condition = object(value, path);
  const zoneIds = validateUniqueBoundedStrings(condition.zoneIds, `${path}.zoneIds`, 2);
  oneOf(condition.direction, new Set(['above', 'below', 'inside', 'outside']), `${path}.direction`);
  oneOf(condition.confirmationBasis, new Set(['4h_close', '1d_close']), `${path}.confirmationBasis`);
  oneOf(condition.state, new Set(['not_triggered', 'approaching', 'triggered']), `${path}.state`);
  return zoneIds;
}

function validateMarketProfileLevelEvidenceRef(
  value: unknown,
  horizon: MarketHorizon,
  suffix: 'poc' | 'val' | 'vah',
  path: string,
) {
  const reference = boundedString(value, path, 1, 128);
  const match = MARKET_PROFILE_EVIDENCE_PATTERN.exec(reference);
  if (!match || match[2] !== suffix || !isMarketProfileKindForHorizon(match[1], horizon)) fail(path);
}

function validateMarketProfileNodeEvidenceRef(
  value: unknown,
  horizon: MarketHorizon,
  path: string,
): { kind: MarketProfileNodeKind } {
  const reference = boundedString(value, path, 1, 128);
  const match = MARKET_PROFILE_NODE_EVIDENCE_PATTERN.exec(reference);
  if (!match || !isMarketProfileKindForHorizon(match[1], horizon)) fail(path);
  return { kind: match[2] as MarketProfileNodeKind };
}

function isMarketProfileKindForHorizon(value: string, horizon: MarketHorizon) {
  return (MARKET_PROFILE_KINDS_BY_HORIZON[horizon] as readonly string[]).includes(value);
}

function isMarketProfileNodeEvidenceCandidate(reference: string) {
  return MARKET_PROFILE_NODE_EVIDENCE_CANDIDATE_PATTERN.test(reference);
}

function addSetValues(target: Set<string>, source: Set<string>) {
  source.forEach((value) => target.add(value));
}

function validateMarketNodePolicyPairing(
  levelMapsValue: unknown,
  scenarioTreesValue: unknown,
  path: string,
) {
  const levelMaps = object(levelMapsValue, `${path}.levelMaps`);
  const scenarioTrees = object(scenarioTreesValue, `${path}.scenarioTrees`);
  const levelPolicies = new Set(MARKET_HORIZONS.map((horizon) => oneOf(
    object(levelMaps[horizon], `${path}.levelMaps.${horizon}`).policyVersion,
    new Set(['market-level-map-v1', 'market-level-map-v2']),
    `${path}.levelMaps.${horizon}.policyVersion`,
  )));
  const scenarioPolicies = new Set(MARKET_HORIZONS.map((horizon) => oneOf(
    object(scenarioTrees[horizon], `${path}.scenarioTrees.${horizon}`).policyVersion,
    new Set(['market-structural-scenarios-v1', 'market-structural-scenarios-v2']),
    `${path}.scenarioTrees.${horizon}.policyVersion`,
  )));
  if (levelPolicies.size !== 1 || scenarioPolicies.size !== 1) fail(path);
  const levelPolicy = [...levelPolicies][0];
  const scenarioPolicy = [...scenarioPolicies][0];
  if ((levelPolicy === 'market-level-map-v1')
    !== (scenarioPolicy === 'market-structural-scenarios-v1')) fail(path);
}

function validateMarketVolumeProfileCoverage(
  value: unknown,
  requestedHorizons: readonly string[],
  path: string,
) {
  const coverage = object(value, path);
  const expectedKinds = MARKET_PROFILE_KINDS.filter((kind) => (
    (requestedHorizons.includes('3d') && (kind === 'current_day' || kind === 'previous_day'))
    || (requestedHorizons.includes('7d') && kind === 'previous_week')
    || (requestedHorizons.includes('30d') && kind === 'rolling_30d')
  ));
  literal(coverage.requestedProfileCount, expectedKinds.length, `${path}.requestedProfileCount`);
  const profiles = array(coverage.profiles, `${path}.profiles`, MARKET_PROFILE_KINDS.length);
  if (profiles.length !== expectedKinds.length) fail(`${path}.profiles`);
  let availableCount = 0;
  profiles.forEach((slotValue, index) => {
    const slotPath = `${path}.profiles[${index}]`;
    const slot = object(slotValue, slotPath);
    literal(slot.kind, expectedKinds[index], `${slotPath}.kind`);
    const status = oneOf(slot.status, new Set(['available', 'unavailable']), `${slotPath}.status`);
    if (status === 'unavailable') {
      oneOf(slot.reason, new Set([
        'missing_data', 'stale', 'gap_detected', 'oversized', 'invalid',
      ]), `${slotPath}.reason`);
      return;
    }
    availableCount += 1;
    oneOf(slot.position, new Set([
      'above_value_area', 'inside_value_area', 'below_value_area',
    ]), `${slotPath}.position`);
    const pointOfControl = validateMarketDecimal(slot.pointOfControl, `${slotPath}.pointOfControl`, false, true);
    const valueAreaLow = validateMarketDecimal(slot.valueAreaLow, `${slotPath}.valueAreaLow`, false, true);
    const valueAreaHigh = validateMarketDecimal(slot.valueAreaHigh, `${slotPath}.valueAreaHigh`, false, true);
    if (valueAreaLow > pointOfControl || pointOfControl > valueAreaHigh) fail(`${slotPath}.pointOfControl`);
    validateMarketDecimal(slot.valueAreaCoveragePct, `${slotPath}.valueAreaCoveragePct`, false, true);
    timestamp(slot.periodStartAt, `${slotPath}.periodStartAt`);
    timestamp(slot.periodEndAt, `${slotPath}.periodEndAt`);
    timestamp(slot.asOf, `${slotPath}.asOf`);
    oneOf(slot.state, new Set(['developing', 'closed']), `${slotPath}.state`);
    object(slot.source, `${slotPath}.source`);
    validateMarketFreshness(slot.freshness, `${slotPath}.freshness`);
    const refs = object(slot.evidenceRefs, `${slotPath}.evidenceRefs`);
    validateMarketProfileEvidenceRef(
      refs.pointOfControl, expectedKinds[index], 'poc', `${slotPath}.evidenceRefs.pointOfControl`,
    );
    validateMarketProfileEvidenceRef(
      refs.valueAreaLow, expectedKinds[index], 'val', `${slotPath}.evidenceRefs.valueAreaLow`,
    );
    validateMarketProfileEvidenceRef(
      refs.valueAreaHigh, expectedKinds[index], 'vah', `${slotPath}.evidenceRefs.valueAreaHigh`,
    );
  });
  literal(coverage.availableProfileCount, availableCount, `${path}.availableProfileCount`);
  const isComplete = boolean(coverage.complete, `${path}.complete`);
  if (isComplete !== (availableCount === expectedKinds.length)) fail(`${path}.complete`);
}

function validateMarketProfileEvidenceRef(
  value: unknown,
  kind: string,
  suffix: string,
  path: string,
) {
  const reference = boundedString(value, path, 1, 128);
  if (!MARKET_PROFILE_EVIDENCE_PATTERN.test(reference) || reference !== `profile.${kind}.${suffix}`) fail(path);
}

function validateMarketEvidenceCatalog(value: unknown, publishedNodeRefs: Set<string>, path: string) {
  const catalog = array(value, path, 140);
  if (catalog.length < 48) fail(path);
  const ids = new Set<string>();
  const catalogNodeRefs = new Set<string>();
  catalog.forEach((entryValue, index) => {
    const entryPath = `${path}[${index}]`;
    const entry = object(entryValue, entryPath);
    const id = boundedString(entry.id, `${entryPath}.id`, 1, 256);
    if (ids.has(id)) fail(`${entryPath}.id`);
    ids.add(id);
    const isNodeRef = isMarketProfileNodeEvidenceCandidate(id);
    if (isNodeRef) {
      if (!MARKET_PROFILE_NODE_EVIDENCE_PATTERN.test(id) || !publishedNodeRefs.has(id)) {
        fail(`${entryPath}.id`);
      }
      catalogNodeRefs.add(id);
    }
    const family = oneOf(entry.family, new Set([
      'indicator', 'structure', 'period', 'level', 'scenario', 'profile', 'coverage',
    ]), `${entryPath}.family`);
    const available = boolean(entry.available, `${entryPath}.available`);
    const claimable = boolean(entry.claimable, `${entryPath}.claimable`);
    if (isNodeRef && (family !== 'profile' || !available || !claimable)) fail(entryPath);
  });
  if (catalogNodeRefs.size !== publishedNodeRefs.size
    || [...publishedNodeRefs].some((reference) => !catalogNodeRefs.has(reference))) fail(path);
}

function validateMarketAnalysisOutput(
  value: unknown,
  path: string,
  publishedNodeRefs?: Set<string>,
) {
  const analysis = object(value, path);
  literal(analysis.schemaVersion, 4, `${path}.schemaVersion`);
  const references = validateUniqueBoundedStrings(
    analysis.consideredEvidence, `${path}.consideredEvidence`, 140, 48,
  );
  validateMarketPublicText(analysis.summary, `${path}.summary`, 480);
  references.push(...validateUniqueBoundedStrings(
    analysis.summaryEvidence, `${path}.summaryEvidence`, 12, 1,
  ));
  const timeframeViews = array(analysis.timeframeViews, `${path}.timeframeViews`, 3);
  if (!timeframeViews.length) fail(`${path}.timeframeViews`);
  timeframeViews.forEach((viewValue, index) => {
    const viewPath = `${path}.timeframeViews[${index}]`;
    const view = object(viewValue, viewPath);
    oneOf(view.timeframe, new Set(MARKET_TIMEFRAMES), `${viewPath}.timeframe`);
    validateMarketPublicText(view.text, `${viewPath}.text`, 320);
    references.push(...validateUniqueBoundedStrings(view.evidence, `${viewPath}.evidence`, 12, 1));
  });
  const factors = array(analysis.factors, `${path}.factors`, 3);
  if (factors.length !== 3) fail(`${path}.factors`);
  factors.forEach((factorValue, index) => {
    const factorPath = `${path}.factors[${index}]`;
    const factor = object(factorValue, factorPath);
    oneOf(factor.category, new Set([
      'trend', 'momentum', 'range', 'volatility', 'volume', 'risk', 'structure', 'levels',
    ]), `${factorPath}.category`);
    oneOf(factor.role, new Set(['supporting', 'opposing', 'risk']), `${factorPath}.role`);
    oneOf(factor.stance, new Set(['bullish', 'bearish', 'neutral', 'mixed']), `${factorPath}.stance`);
    validateMarketPublicText(factor.text, `${factorPath}.text`, 360);
    references.push(...validateUniqueBoundedStrings(factor.evidence, `${factorPath}.evidence`, 12, 1));
  });
  const materialRisk = object(analysis.materialRisk, `${path}.materialRisk`);
  validateMarketPublicText(materialRisk.text, `${path}.materialRisk.text`, 360);
  references.push(...validateUniqueBoundedStrings(
    materialRisk.evidence, `${path}.materialRisk.evidence`, 12, 1,
  ));
  const horizons = object(analysis.horizons, `${path}.horizons`);
  MARKET_HORIZONS.forEach((horizon) => {
    if (isWireNull(horizons[horizon])) return;
    const rationale = object(horizons[horizon], `${path}.horizons.${horizon}`);
    validateMarketPublicText(rationale.rationale, `${path}.horizons.${horizon}.rationale`, 420);
    references.push(...validateUniqueBoundedStrings(
      rationale.evidence, `${path}.horizons.${horizon}.evidence`, 12, 1,
    ));
  });
  if (publishedNodeRefs) {
    references.forEach((reference) => {
      if (isMarketProfileNodeEvidenceCandidate(reference)
        && (!MARKET_PROFILE_NODE_EVIDENCE_PATTERN.test(reference) || !publishedNodeRefs.has(reference))) fail(path);
    });
  }
}

function validateMarketPublicText(value: unknown, path: string, maxLength: number) {
  const text = boundedString(value, path, 1, maxLength);
  if (MARKET_PUBLIC_FORBIDDEN_TEXT_PATTERN.test(text)) fail(path);
}

function validateMarketDecimal(value: unknown, path: string, isSigned = false, isPositive = false) {
  const decimal = boundedString(value, path, 1, 128);
  const pattern = isSigned ? MARKET_DECIMAL_PATTERN : MARKET_UNSIGNED_DECIMAL_PATTERN;
  const numericValue = Number(decimal);
  if (!pattern.test(decimal) || !Number.isFinite(numericValue) || (isPositive && numericValue <= 0)) fail(path);
  return numericValue;
}

function validateUniqueBoundedStrings(
  value: unknown,
  path: string,
  maxLength: number,
  minLength = 1,
) {
  const values = array(value, path, maxLength).map((item, index) => (
    boundedString(item, `${path}[${index}]`, 1, 256)
  ));
  if (values.length < minLength || new Set(values).size !== values.length) fail(path);
  return values;
}

function discardInvalidOptionalString(value: JsonObject, key: string, maxLength: number) {
  if (value[key] === undefined) return;
  try {
    boundedString(value[key], key, 1, maxLength);
  } catch (error) {
    if (!(error instanceof AgentV2ContractError)) throw error;
    delete value[key];
  }
}

function discardInvalidOptionalEnum(value: JsonObject, key: string, allowed: readonly string[]) {
  if (value[key] === undefined) return;
  if (typeof value[key] !== 'string' || !allowed.includes(value[key])) delete value[key];
}

function readOptionalBoundedStrings(value: JsonObject, path: string, keys: readonly string[]) {
  return Object.fromEntries(keys.flatMap((key) => (
    value[key] === undefined ? [] : [[key, boundedString(value[key], `${path}.${key}`, 1, 256)]]
  )));
}

function readWalletQueryPolicySummary(value: unknown, path: string): AgentWalletQueryPolicySummaryV1 {
  const result = object(value, path);
  const omittedSpam = result.omittedSpam === undefined
    ? undefined
    : readWalletPolicyCounter(result.omittedSpam, `${path}.omittedSpam`);
  const omittedHidden = result.omittedHidden === undefined
    ? undefined
    : readWalletPolicyCounter(result.omittedHidden, `${path}.omittedHidden`);
  const suspicious = result.suspicious === undefined
    ? undefined
    : readWalletPolicyCounter(result.suspicious, `${path}.suspicious`);
  return {
    presentation: oneOf<AgentWalletQueryPolicySummaryV1['presentation']>(
      result.presentation, new Set(['standard', 'quarantine', 'hidden_review']), `${path}.presentation`,
    ),
    ...(omittedSpam !== undefined && { omittedSpam }),
    ...(omittedHidden !== undefined && { omittedHidden }),
    ...(suspicious !== undefined && { suspicious }),
  };
}

function readWalletPolicyCounter(value: unknown, path: string): AgentWalletPolicyCounterV1 {
  const result = object(value, path);
  return {
    count: integer(result.count, `${path}.count`),
    accuracy: oneOf<AgentWalletPolicyCounterV1['accuracy']>(
      result.accuracy, new Set(['exact', 'lower_bound']), `${path}.accuracy`,
    ),
  };
}

function assertLivePortfolioPositionsPayload(
  value: JsonObject,
  path: string,
): asserts value is JsonObject & AgentPortfolioPositionsContentPayloadV1 {
  uuid(value.id, `${path}.id`);
  oneOf(value.status, new Set(['complete', 'partial']), `${path}.status`);
  literal(value.accountScope, 'current', `${path}.accountScope`);
  boundedString(value.baseCurrency, `${path}.baseCurrency`, 3, 8);
  timestamp(value.generatedAt, `${path}.generatedAt`);
  array(value.positions, `${path}.positions`, 5).forEach((row, index) => {
    const item = object(row, `${path}.positions[${index}]`);
    boundedString(item.assetRef, `${path}.positions[${index}].assetRef`, 1, 256);
    agentAssetIdentity(item.asset, `${path}.positions[${index}].asset`);
    const amount = object(item.amount, `${path}.positions[${index}].amount`);
    const decimal = boundedString(amount.value, `${path}.positions[${index}].amount.value`, 1, 128);
    if (!CANONICAL_NONNEGATIVE_DECIMAL_PATTERN.test(decimal)) fail(`${path}.positions[${index}].amount.value`);
    boundedString(amount.currency, `${path}.positions[${index}].amount.currency`, 3, 8);
  });
  array(value.unpriced, `${path}.unpriced`, 3).forEach((row, index) => {
    const item = object(row, `${path}.unpriced[${index}]`);
    boundedString(item.assetRef, `${path}.unpriced[${index}].assetRef`, 1, 256);
    agentAssetIdentity(item.asset, `${path}.unpriced[${index}].asset`);
  });
  boundedInteger(value.omittedUnpricedAssetCount, `${path}.omittedUnpricedAssetCount`, 0, 10_000);
  const quality = object(value.dataQuality, `${path}.dataQuality`);
  oneOf(quality.coverage, new Set(['complete', 'partial']), `${path}.dataQuality.coverage`);
  const limitations = array(quality.limitations, `${path}.dataQuality.limitations`, 3);
  limitations.forEach((limitation, index) => oneOf(
    limitation,
    new Set(['unpriced_assets', 'valued_rows_omitted', 'unpriced_rows_omitted']),
    `${path}.dataQuality.limitations[${index}]`,
  ));
}

function assertLiveNetworkActivityPayload(
  value: JsonObject,
  path: string,
): asserts value is JsonObject & AgentNetworkActivityContentPayloadV1 {
  uuid(value.id, `${path}.id`);
  oneOf(value.status, new Set(['complete', 'partial']), `${path}.status`);
  literal(value.accountScope, 'current', `${path}.accountScope`);
  boundedString(value.chain, `${path}.chain`, 1, 32);
  timestamp(value.generatedAt, `${path}.generatedAt`);
  boolean(value.hasMore, `${path}.hasMore`);
  array(value.rows, `${path}.rows`, 10).forEach((row, index) => {
    const itemPath = `${path}.rows[${index}]`;
    const item = object(row, itemPath);
    oneOf(
      item.kind,
      new Set(['transfer', 'swap', 'stake', 'unstake', 'nft', 'contract', 'unknown']),
      `${itemPath}.kind`,
    );
    timestamp(item.timestamp, `${itemPath}.timestamp`);
    oneOf(item.status, new Set(['pending', 'completed', 'failed']), `${itemPath}.status`);
    if (item.direction !== undefined) {
      oneOf(item.direction, new Set(['incoming', 'outgoing']), `${itemPath}.direction`);
    }
    if (item.asset !== undefined) agentAssetIdentity(item.asset, `${itemPath}.asset`);
    if (item.amount !== undefined) readAgentMoneyAmount(item.amount, `${itemPath}.amount`);
    if (item.safeDescription !== undefined) boundedString(item.safeDescription, `${itemPath}.safeDescription`, 1, 200);
  });
}

function readAgentMoneyAmount(value: unknown, path: string): AgentMoneyAmount {
  const result = object(value, path);
  const amount = boundedString(result.value, `${path}.value`, 1, 128);
  if (!CANONICAL_NONNEGATIVE_DECIMAL_PATTERN.test(amount)) fail(`${path}.value`);
  const valueType = oneOf<AgentMoneyAmount['valueType']>(
    result.valueType,
    new Set(['atomic', 'decimal']),
    `${path}.valueType`,
  );
  const decimals = boundedInteger(result.decimals, `${path}.decimals`, 0, 255);
  const symbol = boundedString(result.symbol, `${path}.symbol`, 1, 32);
  const slug = boundedString(result.slug, `${path}.slug`, 1, 128);
  const chain = boundedString(result.chain, `${path}.chain`, 1, 32);
  const tokenAddress = result.tokenAddress === undefined
    ? undefined
    : boundedString(result.tokenAddress, `${path}.tokenAddress`, 1, 256);
  let fiat: AgentMoneyAmount['fiat'];
  if (result.fiat !== undefined) {
    const fiatResult = object(result.fiat, `${path}.fiat`);
    const fiatAmount = boundedString(fiatResult.value, `${path}.fiat.value`, 1, 128);
    if (!CANONICAL_NONNEGATIVE_DECIMAL_PATTERN.test(fiatAmount)) fail(`${path}.fiat.value`);
    const currency = boundedString(fiatResult.currency, `${path}.fiat.currency`, 3, 8);
    const rate = fiatResult.rate === undefined
      ? undefined
      : boundedString(fiatResult.rate, `${path}.fiat.rate`, 1, 128);
    if (rate !== undefined && !CANONICAL_NONNEGATIVE_DECIMAL_PATTERN.test(rate)) fail(`${path}.fiat.rate`);
    const asOf = timestamp(fiatResult.asOf, `${path}.fiat.asOf`);
    fiat = {
      value: fiatAmount,
      currency,
      ...(rate !== undefined && { rate }),
      asOf,
    };
  }
  return {
    value: amount,
    valueType,
    decimals,
    symbol,
    slug,
    chain,
    ...(tokenAddress !== undefined && { tokenAddress }),
    ...(fiat !== undefined && { fiat }),
  };
}

function agentAssetIdentity(value: unknown, path: string) {
  const result = object(value, path);
  boundedString(result.slug, `${path}.slug`, 1, 128);
  boundedString(result.chain, `${path}.chain`, 1, 32);
  boundedString(result.symbol, `${path}.symbol`, 1, 32);
  if (result.name !== undefined) boundedString(result.name, `${path}.name`, 1, 160);
  if (result.tokenAddress !== undefined) boundedString(result.tokenAddress, `${path}.tokenAddress`, 1, 256);
  if (result.decimals !== undefined) boundedInteger(result.decimals, `${path}.decimals`, 0, 255);
}
