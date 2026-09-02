import type {
  AgentErrorCodeV2,
} from '../types';
import type {
  JsonObject,
} from '../wireReader';

import {
  array,
  fail,
  literal,
  oneOf,
  string,
} from '../wireReader';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLLOWUP_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const ERROR_CODES = new Set([
  'invalid_request',
  'invalid_event',
  'network_error',
  'device_id_invalid',
  'device_token_missing',
  'device_token_invalid',
  'device_token_expired',
  'device_token_rate_limited',
  'profile_id_invalid',
  'idempotency_mismatch',
  'thread_revision_conflict',
  'thread_not_found',
  'thread_run_in_progress',
  'run_not_found',
  'run_interrupted',
  'run_replay_expired',
  'run_budget_exceeded',
  'output_limit_reached',
  'rate_limited',
  'user_quota_exhausted',
  'context_too_large_retryable',
  'tool_unsupported',
  'tool_scope_mismatch',
  'tool_result_already_submitted',
  'tool_rejected',
  'wallet_context_changed',
  'tool_timeout',
  'tool_failed',
  'tool_result_too_large',
  'market_data_unavailable',
  'action_unsupported',
  'message_not_found',
  'message_not_editable',
  'regenerate_target_invalid',
  'followup_reference_invalid',
  'input_continuation_reference_invalid',
  'feedback_target_invalid',
  'feedback_revision_conflict',
  'provider_timeout',
  'provider_unavailable',
  'provider_capability_unavailable',
  'agent_capacity_exhausted',
  'provider_error',
  'empty_response',
  'internal_error',
  'profile_deleted',
]);

export const RETRYABLE_ERROR_CODES = new Set([
  'network_error',
  'device_token_missing',
  'device_token_invalid',
  'device_token_expired',
  'device_token_rate_limited',
  'thread_revision_conflict',
  'thread_run_in_progress',
  'run_interrupted',
  'run_budget_exceeded',
  'output_limit_reached',
  'rate_limited',
  'user_quota_exhausted',
  'context_too_large_retryable',
  'wallet_context_changed',
  'tool_timeout',
  'tool_failed',
  'market_data_unavailable',
  'feedback_revision_conflict',
  'provider_timeout',
  'provider_unavailable',
  'agent_capacity_exhausted',
  'provider_error',
  'empty_response',
  'internal_error',
]);

export function uuid(value: unknown, path: string): string {
  const result = string(value, path);
  if (!UUID_PATTERN.test(result)) fail(path);
  return result;
}

export function followupUuid(value: unknown, path: string): string {
  const result = string(value, path);
  if (!FOLLOWUP_UUID_PATTERN.test(result)) fail(path);
  return result;
}

export function protocol(value: JsonObject, path: string) {
  literal(value.protocolVersion, 2, `${path}.protocolVersion`);
}

export function validateEnumArray(value: unknown, path: string, limit: number, allowed: string[]) {
  const items = array(value, path, limit);
  if (new Set(items).size !== items.length) fail(path);
  items.forEach((item, index) => oneOf(item, new Set(allowed), `${path}[${index}]`));
}

export function validateErrorTiming(code: AgentErrorCodeV2, error: JsonObject, path: string) {
  const hasTiming = error.retryAfterMs !== undefined || error.resetAt !== undefined;
  const isUserRateLimit = code === 'device_token_rate_limited'
    || code === 'rate_limited'
    || code === 'user_quota_exhausted';
  if (isUserRateLimit && !hasTiming) fail(`${path}.retryAfterMs`);
  if (hasTiming && !isUserRateLimit && code !== 'agent_capacity_exhausted') fail(`${path}.code`);
}
