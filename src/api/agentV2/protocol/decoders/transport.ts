import type {
  AgentErrorCodeV2,
  AgentStreamEventV2,
} from '../types';
import type { JsonObject } from '../wireReader';

import {
  AgentV2CompatibilityError,
  array,
  boolean,
  boundedString,
  fail,
  filterUnsupportedItems,
  integer,
  literal,
  object,
  oneOf,
  string,
  timestamp,
} from '../wireReader';
import {
  action,
} from './actions';
import {
  filterFollowups,
  followup,
  inputContinuation,
  threadSummary,
} from './messages';
import {
  ERROR_CODES,
  RETRYABLE_ERROR_CODES,
  uuid,
} from './readers';
import {
  semanticContent,
} from './semantic';
import {
  toolCall,
  walletConversationContextV5,
} from './wallet';

const EVENT_TYPES = new Set([
  'run_start',
  'thread',
  'message_start',
  'text_delta',
  'tool_call',
  'tool_status',
  'run_activity',
  'action',
  'followups',
  'input_continuations',
  'semantic_content',
  'message_content_end',
  'message_end',
  'rate_limit',
  'error',
]);

const TOOL_STATUSES = new Set(['queued', 'running', 'complete', 'failed', 'timeout', 'rejected', 'cancelled']);

const TOOL_STATUS_DETAIL_CODES = new Set([
  'awaiting_wallet', 'processing', 'result_rejected', 'result_timeout', 'result_unavailable',
]);

const RUN_ACTIVITY_CODES = new Set([
  'request.planning',
  'web.searching',
  'web.reading_sources',
  'data.reading_market',
  'analysis.checking_freshness',
  'analysis.computing',
  'answer.writing',
]);

const RUN_ACTIVITY_STATUSES = new Set(['active', 'completed']);

const FINISH_REASONS = new Set([
  'complete',
  'cancelled',
  'error',
  'tool_unavailable',
  'rate_limited',
  'run_interrupted',
  'max_output_tokens',
]);

export interface AgentV2StreamEnvelope {
  protocolVersion: 2;
  runId: string;
  sequence: number;
  createdAt?: string;
}

export type AgentV2StreamFrame = {
  disposition: 'handle';
  event: AgentStreamEventV2;
} | {
  disposition: 'ignore';
  envelope: AgentV2StreamEnvelope;
  wireType: string;
};

export function decodeAgentV2StreamFrame(value: unknown): AgentV2StreamFrame {
  const result = object(value, '$');
  const envelope = readStreamEnvelope(result);
  const wireType = boundedString(result.type, '$.type', 1, 64);
  if (!EVENT_TYPES.has(wireType)) return { disposition: 'ignore', envelope, wireType };

  const normalized = { ...result };
  if (wireType === 'tool_status') {
    uuid(result.toolCallId, '$.toolCallId');
    const status = boundedString(result.status, '$.status', 1, 64);
    if (!TOOL_STATUSES.has(status)) return { disposition: 'ignore', envelope, wireType };
    if (result.detailCode !== undefined) {
      const detailCode = boundedString(result.detailCode, '$.detailCode', 1, 64);
      if (!TOOL_STATUS_DETAIL_CODES.has(detailCode)) delete normalized.detailCode;
    }
  } else if (wireType === 'run_activity') {
    const code = boundedString(result.code, '$.code', 1, 64);
    const status = boundedString(result.status, '$.status', 1, 64);
    if (!RUN_ACTIVITY_CODES.has(code) || !RUN_ACTIVITY_STATUSES.has(status)) {
      return { disposition: 'ignore', envelope, wireType };
    }
  } else if (wireType === 'followups') {
    uuid(result.messageId, '$.messageId');
    normalized.items = filterFollowups(result.items, '$.items', 1);
    if (!(normalized.items as unknown[]).length) return { disposition: 'ignore', envelope, wireType };
  } else if (wireType === 'input_continuations') {
    uuid(result.messageId, '$.messageId');
    normalized.items = filterUnsupportedItems(result.items, '$.items', 3, inputContinuation, 1);
    if (!(normalized.items as unknown[]).length) return { disposition: 'ignore', envelope, wireType };
  } else if (wireType === 'message_end') {
    const finishReason = boundedString(result.finishReason, '$.finishReason', 1, 64);
    if (!FINISH_REASONS.has(finishReason)) {
      normalized.finishReason = 'run_interrupted';
      delete normalized.walletConversationContext;
    }
  } else if (wireType === 'error') {
    const retryable = boolean(result.retryable, '$.retryable');
    const code = boundedString(result.code, '$.code', 1, 128);
    if (!ERROR_CODES.has(code)) {
      normalized.code = retryable ? 'internal_error' : 'invalid_event';
      delete normalized.retryAfterMs;
      delete normalized.resetAt;
    }
  }

  try {
    return { disposition: 'handle', event: decodeAgentV2StreamEvent(normalized) };
  } catch (error) {
    if (wireType === 'action'
      && error instanceof AgentV2CompatibilityError
      && error.boundary.startsWith('$.action.')) {
      return { disposition: 'ignore', envelope, wireType };
    }
    throw error;
  }
}

function readStreamEnvelope(result: JsonObject): AgentV2StreamEnvelope {
  if (result.protocolVersion !== 2) {
    throw new AgentV2CompatibilityError(
      '$.protocolVersion',
      undefined,
      typeof result.protocolVersion === 'number' ? result.protocolVersion : undefined,
    );
  }
  const runId = uuid(result.runId, '$.runId');
  const sequence = integer(result.sequence, '$.sequence', 1);
  const createdAt = result.createdAt === undefined ? undefined : timestamp(result.createdAt, '$.createdAt');
  return {
    protocolVersion: 2,
    runId,
    sequence,
    ...(createdAt !== undefined && { createdAt }),
  };
}

export function decodeAgentV2StreamEvent(value: unknown): AgentStreamEventV2 {
  const result = object(value, '$');
  validateAgentV2StreamEvent(result);
  return result;
}

function validateAgentV2StreamEvent(
  result: JsonObject,
): asserts result is JsonObject & AgentStreamEventV2 {
  if (result.protocolVersion !== 2) {
    throw new AgentV2CompatibilityError(
      '$.protocolVersion',
      undefined,
      typeof result.protocolVersion === 'number' ? result.protocolVersion : undefined,
    );
  }
  if (typeof result.type !== 'string' || !EVENT_TYPES.has(result.type)) {
    throw new AgentV2CompatibilityError(
      '$.type',
      typeof result.type === 'string' ? result.type.slice(0, 64) : undefined,
      2,
    );
  }
  const type = result.type;
  uuid(result.runId, '$.runId');
  const sequence = integer(result.sequence, '$.sequence', 1);
  if (result.createdAt !== undefined) timestamp(result.createdAt, '$.createdAt');

  switch (type) {
    case 'run_start':
      literal(sequence, 1, '$.sequence');
      uuid(result.clientRunId, '$.clientRunId');
      uuid(result.threadId, '$.threadId');
      integer(result.threadRevision, '$.threadRevision', 1);
      break;
    case 'thread':
      threadSummary(result.thread, '$.thread');
      break;
    case 'message_start':
      uuid(result.messageId, '$.messageId');
      literal(result.role, 'assistant', '$.role');
      oneOf(result.contentKind, new Set(['markdown', 'semantic']), '$.contentKind');
      break;
    case 'text_delta':
      uuid(result.messageId, '$.messageId');
      string(result.delta, '$.delta');
      break;
    case 'tool_call':
      toolCall(result.toolCall, '$.toolCall');
      break;
    case 'tool_status':
      uuid(result.toolCallId, '$.toolCallId');
      oneOf(result.status, TOOL_STATUSES, '$.status');
      if (result.detailCode !== undefined) {
        oneOf(result.detailCode, TOOL_STATUS_DETAIL_CODES, '$.detailCode');
      }
      break;
    case 'run_activity': {
      const code = oneOf(result.code, RUN_ACTIVITY_CODES, '$.code');
      const status = oneOf(result.status, RUN_ACTIVITY_STATUSES, '$.status');
      if (result.detail !== undefined) {
        if (code !== 'web.reading_sources' || status !== 'completed') fail('$.detail');
        const detail = object(result.detail, '$.detail');
        literal(detail.kind, 'source_count', '$.detail.kind');
        const count = integer(detail.count, '$.detail.count', 1);
        if (count > 11) fail('$.detail.count');
      }
      break;
    }
    case 'action':
      uuid(result.messageId, '$.messageId');
      action(result.action, '$.action');
      break;
    case 'followups':
      uuid(result.messageId, '$.messageId');
      array(result.items, '$.items', 3).forEach((item, index) => followup(item, `$.items[${index}]`));
      break;
    case 'input_continuations':
      uuid(result.messageId, '$.messageId');
      array(result.items, '$.items', 3).forEach((item, index) => {
        inputContinuation(item, `$.items[${index}]`);
      });
      break;
    case 'semantic_content':
      uuid(result.messageId, '$.messageId');
      result.content = semanticContent(result.content, '$.content');
      break;
    case 'message_content_end':
      uuid(result.messageId, '$.messageId');
      break;
    case 'message_end':
      uuid(result.messageId, '$.messageId');
      oneOf(result.finishReason, FINISH_REASONS, '$.finishReason');
      if (result.walletConversationContext !== undefined) {
        if (result.finishReason !== 'complete') fail('$.walletConversationContext');
        walletConversationContextV5(result.walletConversationContext, '$.walletConversationContext');
      }
      break;
    case 'rate_limit':
      literal(result.code, 'rate_limited', '$.code');
      if (result.retryAfterMs === undefined && result.resetAt === undefined) fail('$.retryAfterMs');
      if (result.retryAfterMs !== undefined) integer(result.retryAfterMs, '$.retryAfterMs', 1);
      if (result.resetAt !== undefined) timestamp(result.resetAt, '$.resetAt');
      break;
    case 'error': {
      const code = oneOf<AgentErrorCodeV2>(result.code, ERROR_CODES, '$.code');
      const retryable = boolean(result.retryable, '$.retryable');
      if (retryable !== RETRYABLE_ERROR_CODES.has(code)) fail('$.retryable');
      if (result.messageId !== undefined) uuid(result.messageId, '$.messageId');
      if (result.toolCallId !== undefined) uuid(result.toolCallId, '$.toolCallId');
      if (result.retryAfterMs !== undefined) integer(result.retryAfterMs, '$.retryAfterMs', 1);
      if (result.resetAt !== undefined) timestamp(result.resetAt, '$.resetAt');
      if ((result.retryAfterMs !== undefined || result.resetAt !== undefined)
        && code !== 'agent_capacity_exhausted'
        && code !== 'user_quota_exhausted') {
        fail('$.code');
      }
      break;
    }
    default:
      throw new AgentV2CompatibilityError('$.type', type, 2);
  }
}
