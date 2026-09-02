import type {
  AgentDefaultThreadResponseV2,
  AgentErrorCodeV2,
  AgentHintsResponseV2,
  AgentMessageErrorV2,
  AgentPersistedMessageV2,
  AgentServerCapabilitiesV2,
  AgentStarterHintV2,
  AgentThreadClearResponseV2,
  AgentThreadMessagesPageV2,
  AgentThreadResponseV2,
  AgentThreadSummaryV2,
} from '../types';
import type {
  JsonObject,
} from '../wireReader';

import {
  AgentV2CompatibilityError,
  AgentV2ContractError,
  array,
  boolean,
  boundedString,
  extensibleOneOf,
  fail,
  filterUnsupportedItems,
  integer,
  literal,
  object,
  oneOf,
  strictKeys,
  string,
  timestamp,
} from '../wireReader';
import {
  persistedAction,
} from './actions';
import {
  ERROR_CODES,
  followupUuid,
  protocol,
  RETRYABLE_ERROR_CODES,
  uuid,
  validateEnumArray,
  validateErrorTiming,
} from './readers';
import {
  semanticContent,
} from './semantic';

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const FOLLOWUP_MARKDOWN_PATTERN = /(?:[*_~`]|\[[^\]]*\]\(|<\/?[A-Za-z]|^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s)/mu;

export interface AgentV2IncompatiblePersistedMessage {
  index: number;
  category: 'contract' | 'compatibility';
  boundary: string;
  messageId?: string;
}

export interface AgentV2DecodedMessagesPage extends AgentThreadMessagesPageV2 {
  incompatibleMessages?: AgentV2IncompatiblePersistedMessage[];
}

function cursor(value: unknown, path: string): string {
  const result = string(value, path);
  if (!CURSOR_PATTERN.test(result)) fail(path);
  return result;
}

export function threadSummary(value: unknown, path: string): AgentThreadSummaryV2 {
  const result = object(value, path);
  const id = uuid(result.id, `${path}.id`);
  const revision = integer(result.revision, `${path}.revision`, 1);
  literal(result.metadataRevision, 1, `${path}.metadataRevision`);
  literal(result.titleSource, 'none', `${path}.titleSource`);
  literal(result.isPinned, false, `${path}.isPinned`);
  literal(result.isDefault, true, `${path}.isDefault`);
  const createdAt = timestamp(result.createdAt, `${path}.createdAt`);
  const updatedAt = timestamp(result.updatedAt, `${path}.updatedAt`);
  const lastActivityAt = timestamp(result.lastActivityAt, `${path}.lastActivityAt`);
  const clearedAt = result.clearedAt === undefined
    ? undefined
    : timestamp(result.clearedAt, `${path}.clearedAt`);
  const messageCount = integer(result.messageCount, `${path}.messageCount`);

  return {
    id,
    revision,
    metadataRevision: 1,
    titleSource: 'none',
    isPinned: false,
    isDefault: true,
    createdAt,
    updatedAt,
    lastActivityAt,
    ...(clearedAt !== undefined && { clearedAt }),
    messageCount,
  };
}

export function followup(value: unknown, path: string) {
  const result = object(value, path);
  strictKeys(result, path, ['id', 'kind', 'text']);
  extensibleOneOf(result.kind, new Set(['suggested_prompt']), `${path}.kind`);
  followupUuid(result.id, `${path}.id`);
  followupText(result.text, `${path}.text`, 80);
}

function followupText(value: unknown, path: string, maxLength: number) {
  const result = boundedString(value, path, 1, maxLength);
  if (result.trim() !== result || /\p{Cc}/u.test(result) || FOLLOWUP_MARKDOWN_PATTERN.test(result)) fail(path);
}

export function filterFollowups(value: unknown, path: string, minLength = 0) {
  const items = array(value, path);
  if (items.length < minLength) fail(path);
  const result: unknown[] = [];
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    try {
      followup(item, `${path}[${index}]`);
      const id = (item as JsonObject).id as string;
      if (!ids.has(id)) {
        ids.add(id);
        result.push(item);
      }
    } catch (error) {
      if (error instanceof AgentV2CompatibilityError || error instanceof AgentV2ContractError) continue;
      throw error;
    }
    if (result.length === 3) break;
  }
  return result;
}

export function inputContinuation(value: unknown, path: string) {
  const result = object(value, path);
  extensibleOneOf(result.kind, new Set(['collect_input']), `${path}.kind`);
  extensibleOneOf(result.code, new Set([
    'asset_search_asset', 'market_insight_asset', 'market_insight_timeframe', 'market_quote_asset',
    'prepare_send_amount', 'prepare_send_asset', 'prepare_send_recipient',
    'prepare_swap_amount', 'prepare_swap_destination_asset', 'prepare_swap_direction',
    'prepare_swap_source_asset',
  ]), `${path}.code`);
  string(result.id, `${path}.id`);
  extensibleOneOf(
    result.scenario,
    new Set(['prepare-send', 'prepare-swap', 'asset-search', 'market-insight', 'market-quote']),
    `${path}.scenario`,
  );
  extensibleOneOf(
    result.field,
    new Set(['amount', 'asset', 'recipient', 'network', 'timeframe', 'details']),
    `${path}.field`,
  );
}

function persistedMessage(value: unknown, path: string): AgentPersistedMessageV2 {
  const result = object(value, path);
  validatePersistedMessage(result, path);
  return result;
}

function validatePersistedMessage(
  result: JsonObject,
  path: string,
): asserts result is JsonObject & AgentPersistedMessageV2 {
  uuid(result.id, `${path}.id`);
  uuid(result.threadId, `${path}.threadId`);
  oneOf(result.role, new Set(['user', 'assistant']), `${path}.role`);
  oneOf(result.status, new Set(['complete', 'error', 'cancelled']), `${path}.status`);
  if (result.content !== undefined) {
    const content = object(result.content, `${path}.content`);
    const kind = oneOf(content.kind, new Set(['markdown', 'semantic']), `${path}.content.kind`);
    if (kind === 'markdown') {
      if (typeof content.text !== 'string') fail(`${path}.content.text`);
    } else {
      content.content = semanticContent(content.content, `${path}.content.content`);
    }
  }
  timestamp(result.createdAt, `${path}.createdAt`);
  if (result.runId !== undefined) uuid(result.runId, `${path}.runId`);
  if (result.actions !== undefined) {
    const actions = filterUnsupportedItems(result.actions, `${path}.actions`, 8, persistedAction);
    if (actions.length) result.actions = actions;
    else delete result.actions;
  }
  if (result.followups !== undefined) {
    const followups = filterFollowups(result.followups, `${path}.followups`);
    if (followups.length) result.followups = followups;
    else delete result.followups;
  }
  if (result.inputContinuations !== undefined) {
    const continuations = filterUnsupportedItems(
      result.inputContinuations,
      `${path}.inputContinuations`,
      3,
      inputContinuation,
    );
    if (continuations.length) result.inputContinuations = continuations;
    else delete result.inputContinuations;
  }
  if (result.chains !== undefined) {
    validateEnumArray(result.chains, `${path}.chains`, 16, ['ton', 'tron']);
  }
  if (result.error !== undefined) result.error = messageError(result.error, `${path}.error`);
}

function messageError(value: unknown, path: string): AgentMessageErrorV2 {
  const result = object(value, path);
  const retryable = boolean(result.retryable, `${path}.retryable`);
  const wireCode = boundedString(result.code, `${path}.code`, 1, 128);
  if (!ERROR_CODES.has(wireCode)) {
    return {
      code: retryable ? 'internal_error' : 'invalid_event',
      retryable,
    };
  }
  const code = oneOf<AgentErrorCodeV2>(wireCode, ERROR_CODES, `${path}.code`);
  if (retryable !== RETRYABLE_ERROR_CODES.has(code)) fail(`${path}.retryable`);
  if (result.retryAfterMs !== undefined) integer(result.retryAfterMs, `${path}.retryAfterMs`, 1);
  if (result.resetAt !== undefined) timestamp(result.resetAt, `${path}.resetAt`);
  validateErrorTiming(code, result, path);
  return {
    ...result,
    code,
    retryable,
  };
}

export function decodeAgentV2Hints(value: unknown): AgentHintsResponseV2 {
  const result = object(value, '$');
  protocol(result, '$');
  literal(result.catalogVersion, 'agent-starter-hints-v1', '$.catalogVersion');
  let serverCapabilities: AgentServerCapabilitiesV2 | undefined;
  if (result.serverCapabilities !== undefined) {
    const capabilities = object(result.serverCapabilities, '$.serverCapabilities');
    const webSearch = oneOf<AgentServerCapabilitiesV2['webSearch']>(
      capabilities.webSearch,
      new Set(['available', 'disabled', 'unavailable']),
      '$.serverCapabilities.webSearch',
    );
    serverCapabilities = { webSearch };
  }
  const items = array(result.items, '$.items', 5).map((item, index): AgentStarterHintV2 => {
    const hint = object(item, `$.items[${index}]`);
    const id = oneOf<AgentStarterHintV2['id']>(hint.id, new Set([
      'portfolio.performance', 'learn.swap', 'learn.staking', 'learn.security', 'receive.tokens',
    ]), `$.items[${index}].id`);
    let requiredCapabilities: AgentStarterHintV2['requiredCapabilities'];
    if (hint.requiredCapabilities !== undefined) {
      validateEnumArray(
        hint.requiredCapabilities,
        `$.items[${index}].requiredCapabilities`,
        2,
        ['wallet_read', 'receive_action'],
      );
      requiredCapabilities = array(hint.requiredCapabilities, `$.items[${index}].requiredCapabilities`)
        .map((capability) => oneOf<'wallet_read' | 'receive_action'>(
          capability,
          new Set(['wallet_read', 'receive_action']),
          `$.items[${index}].requiredCapabilities`,
        ));
    }
    return { id, ...(requiredCapabilities !== undefined && { requiredCapabilities }) };
  });
  return {
    protocolVersion: 2,
    catalogVersion: 'agent-starter-hints-v1',
    items,
    ...(serverCapabilities !== undefined && { serverCapabilities }),
  };
}

export function decodeAgentV2DefaultThread(value: unknown): AgentDefaultThreadResponseV2 {
  const result = object(value, '$');
  protocol(result, '$');
  return {
    protocolVersion: 2,
    thread: threadSummary(result.thread, '$.thread'),
    created: boolean(result.created, '$.created'),
  };
}

export function decodeAgentV2Thread(value: unknown): AgentThreadResponseV2 {
  const result = object(value, '$');
  protocol(result, '$');
  return { protocolVersion: 2, thread: threadSummary(result.thread, '$.thread') };
}

export function decodeAgentV2Messages(value: unknown): AgentV2DecodedMessagesPage {
  const result = object(value, '$');
  protocol(result, '$');
  const threadId = uuid(result.threadId, '$.threadId');
  const messages: AgentPersistedMessageV2[] = [];
  const incompatibleMessages: AgentV2IncompatiblePersistedMessage[] = [];
  array(result.messages, '$.messages', 100).forEach((item, index) => {
    try {
      messages.push(persistedMessage(item, `$.messages[${index}]`));
    } catch (error) {
      const diagnostic = incompatiblePersistedMessage(error, item, index);
      if (!diagnostic) throw error;
      incompatibleMessages.push(diagnostic);
    }
  });
  const nextCursor = result.nextCursor === undefined ? undefined : cursor(result.nextCursor, '$.nextCursor');
  return {
    protocolVersion: 2,
    threadId,
    messages,
    ...(nextCursor !== undefined && { nextCursor }),
    ...(incompatibleMessages.length && { incompatibleMessages }),
  };
}

function incompatiblePersistedMessage(
  error: unknown,
  value: unknown,
  index: number,
): AgentV2IncompatiblePersistedMessage | undefined {
  const messageId = persistedMessageId(value);
  if (error instanceof AgentV2ContractError) {
    return {
      index,
      category: 'contract',
      boundary: error.path,
      ...(messageId && { messageId }),
    };
  }
  if (error instanceof AgentV2CompatibilityError) {
    return {
      index,
      category: 'compatibility',
      boundary: error.boundary,
      ...(messageId && { messageId }),
    };
  }
  return undefined;
}

function persistedMessageId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    return uuid((value as JsonObject).id, '$.id');
  } catch {
    return undefined;
  }
}

export function decodeAgentV2ThreadClear(value: unknown): AgentThreadClearResponseV2 {
  const result = object(value, '$');
  protocol(result, '$');
  return {
    protocolVersion: 2,
    thread: threadSummary(result.thread, '$.thread'),
    duplicate: boolean(result.duplicate, '$.duplicate'),
  };
}
