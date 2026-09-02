import type {
  AgentActionProposal,
  AgentPersistedActionV2,
} from '../types';
import type {
  JsonObject,
} from '../wireReader';

import {
  AgentV2CompatibilityError,
  array,
  boolean,
  boundedInteger,
  boundedString,
  extensibleOneOf,
  extensibleVersion,
  fail,
  integer,
  literal,
  object,
  oneOf,
  strictKeys,
  string,
  timestamp,
} from '../wireReader';
import {
  uuid,
} from './readers';

const ACTION_KINDS = new Set([
  'send',
  'receive',
  'stake',
  'swap',
  'hideSpamAssets',
  'openUrl',
  'openToken',
  'openTransaction',
  'openAgent',
]);
const PERSISTED_ACTION_KINDS = new Set([...ACTION_KINDS, 'openSend']);
const AGENT_WALLET_CHAINS = new Set(['ton', 'tron', 'solana', 'ethereum']);
const NAVIGATION_CHAINS = new Set([
  'ton',
  'tron',
  'solana',
  'ethereum',
  'base',
  'bnb',
  'polygon',
  'arbitrum',
  'monad',
  'avalanche',
  'hyperliquid',
  'robinhood',
]);
const SEND_RECIPIENT_KINDS = new Set(['address', 'domain', 'savedAddress']);

function receiveBinding(value: unknown, path: string) {
  const result = object(value, path);
  uuid(result.sessionId, `${path}.sessionId`);
  integer(result.revision, `${path}.revision`);
  string(result.activeAccountRef, `${path}.activeAccountRef`);
  string(result.activeNetwork, `${path}.activeNetwork`);
}

function stakeBinding(value: unknown, path: string) {
  const result = object(value, path);
  strictKeys(result, path, ['sessionId', 'revision', 'activeAccountRef']);
  uuid(result.sessionId, `${path}.sessionId`);
  boundedInteger(result.revision, `${path}.revision`, 1, Number.MAX_SAFE_INTEGER);
  boundedString(result.activeAccountRef, `${path}.activeAccountRef`, 1, 128);
}

function swapAsset(value: unknown, path: string) {
  const result = object(value, path);
  strictKeys(result, path, ['slug', 'chain', 'symbol', 'name', 'tokenAddress', 'decimals']);
  boundedString(result.slug, `${path}.slug`, 1, 128);
  agentWalletChain(result.chain, `${path}.chain`);
  boundedString(result.symbol, `${path}.symbol`, 1, 32);
  if (result.name !== undefined) boundedString(result.name, `${path}.name`, 1, 160);
  if (result.tokenAddress !== undefined) boundedString(result.tokenAddress, `${path}.tokenAddress`, 1, 256);
  if (result.decimals !== undefined) boundedInteger(result.decimals, `${path}.decimals`, 0, 255);
}

function swapAmount(value: unknown, path: string) {
  const result = object(value, path);
  strictKeys(result, path, ['value', 'valueType', 'side']);
  const amount = boundedString(result.value, `${path}.value`, 1, 128);
  if (!/^[0-9]+(?:\.[0-9]+)?$/u.test(amount) || !/[1-9]/u.test(amount)) fail(`${path}.value`);
  literal(result.valueType, 'decimal', `${path}.valueType`);
  oneOf(result.side, new Set(['source', 'destination']), `${path}.side`);
}

function stakeAmount(value: unknown, path: string) {
  const result = object(value, path);
  const kind = oneOf(result.kind, new Set(['exact', 'all']), `${path}.kind`);
  if (kind === 'all') {
    strictKeys(result, path, ['kind']);
    return;
  }
  strictKeys(result, path, ['kind', 'value']);
  const amount = boundedString(result.value, `${path}.value`, 1, 128);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(amount)) fail(`${path}.value`);
}

function stakingProductId(value: unknown, path: string) {
  const productId = boundedString(value, path, 1, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(productId)) fail(path);
}

function sendRecipient(value: unknown, path: string) {
  const result = object(value, path);
  const kind = oneOf(result.kind, SEND_RECIPIENT_KINDS, `${path}.kind`);
  if (kind === 'savedAddress') {
    strictKeys(result, path, ['kind', 'addressRef']);
    boundedString(result.addressRef, `${path}.addressRef`, 1, 128);
    return;
  }
  strictKeys(result, path, ['kind', 'chain', kind]);
  agentWalletChain(result.chain, `${path}.chain`);
  boundedString(result[kind], `${path}.${kind}`, 1, kind === 'address' ? 256 : 253);
}

export function action(value: unknown, path: string): asserts value is AgentActionProposal {
  const result = object(value, path);
  const kind = extensibleOneOf(result.kind, ACTION_KINDS, `${path}.kind`);
  if (result.schemaVersion !== undefined) {
    if (kind === 'receive') extensibleVersion(result.schemaVersion, 3, `${path}.schemaVersion`);
    else if (kind === 'stake') extensibleVersion(result.schemaVersion, 2, `${path}.schemaVersion`);
    else if (kind === 'swap') extensibleVersion(result.schemaVersion, 1, `${path}.schemaVersion`);
    else throw new AgentV2CompatibilityError(`${path}.schemaVersion`);
  }
  uuid(result.id, `${path}.id`);
  const labelCodes = {
    receive: 'open_receive',
    stake: 'open_staking',
    swap: 'open_swap',
    hideSpamAssets: 'hide_spam_assets',
    openUrl: 'open_external_link',
    openToken: 'open_token',
    openTransaction: 'open_transaction',
    openAgent: 'open_agent',
  } as const;
  if (kind !== 'send') {
    literal(result.labelCode, labelCodes[kind as keyof typeof labelCodes], `${path}.labelCode`);
  }
  boolean(result.requiresConfirmation, `${path}.requiresConfirmation`);

  if (kind === 'send') {
    if (result.effect === 'open_wallet_review') {
      literal(result.labelCode, 'review_transfer', `${path}.labelCode`);
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'draftId', 'draftExpiresAt', 'sourceToolCallId',
        'effect', 'localDraftRequired', 'requiresConfirmation',
      ]);
      uuid(result.draftId, `${path}.draftId`);
      timestamp(result.draftExpiresAt, `${path}.draftExpiresAt`);
      uuid(result.sourceToolCallId, `${path}.sourceToolCallId`);
      literal(result.localDraftRequired, true, `${path}.localDraftRequired`);
      literal(result.requiresConfirmation, true, `${path}.requiresConfirmation`);
    } else if (result.effect === 'open_send') {
      literal(result.labelCode, 'open_send', `${path}.labelCode`);
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'effect', 'contextBinding', 'asset', 'recipient',
        'localDraftRequired', 'requiresConfirmation',
      ]);
      receiveBinding(result.contextBinding, `${path}.contextBinding`);
      const asset = object(result.asset, `${path}.asset`);
      strictKeys(asset, `${path}.asset`, ['slug', 'chain', 'tokenAddress']);
      boundedString(asset.slug, `${path}.asset.slug`, 1, 128);
      agentWalletChain(asset.chain, `${path}.asset.chain`);
      if (asset.tokenAddress !== undefined) {
        boundedString(asset.tokenAddress, `${path}.asset.tokenAddress`, 1, 256);
      }
      sendRecipient(result.recipient, `${path}.recipient`);
      literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
      literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
    } else {
      fail(`${path}.effect`);
    }
  } else if (kind === 'receive') {
    if (result.schemaVersion === undefined) {
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'effect', 'contextBinding', 'localDraftRequired',
        'requiresConfirmation',
      ]);
    } else {
      strictKeys(result, path, [
        'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'contextBinding',
        'targetNetwork', 'localDraftRequired', 'requiresConfirmation',
      ]);
      extensibleVersion(result.schemaVersion, 3, `${path}.schemaVersion`);
      boundedString(result.targetNetwork, `${path}.targetNetwork`, 1, 32);
    }
    literal(result.effect, 'open_receive', `${path}.effect`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    receiveBinding(result.contextBinding, `${path}.contextBinding`);
  } else if (kind === 'stake') {
    strictKeys(result, path, [
      'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'contextBinding',
      'productId', 'asset', 'amount', 'localDraftRequired', 'requiresConfirmation',
    ]);
    literal(result.schemaVersion, 2, `${path}.schemaVersion`);
    stakingProductId(result.productId, `${path}.productId`);
    swapAsset(result.asset, `${path}.asset`);
    if (result.amount !== undefined) stakeAmount(result.amount, `${path}.amount`);
    literal(result.effect, 'open_staking', `${path}.effect`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
    stakeBinding(result.contextBinding, `${path}.contextBinding`);
  } else if (kind === 'swap') {
    strictKeys(result, path, [
      'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'sourceToolCallId',
      'contextBinding', 'sourceAsset', 'destinationAsset', 'amount',
      'localDraftRequired', 'requiresConfirmation',
    ]);
    literal(result.schemaVersion, 1, `${path}.schemaVersion`);
    literal(result.effect, 'open_swap', `${path}.effect`);
    uuid(result.sourceToolCallId, `${path}.sourceToolCallId`);
    stakeBinding(result.contextBinding, `${path}.contextBinding`);
    swapAsset(result.sourceAsset, `${path}.sourceAsset`);
    swapAsset(result.destinationAsset, `${path}.destinationAsset`);
    swapAmount(result.amount, `${path}.amount`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (kind === 'hideSpamAssets') {
    strictKeys(result, path, [
      'id', 'kind', 'labelCode', 'sourceToolCallId', 'assetRefs', 'contextBinding',
      'effect', 'localMutationRequired', 'requiresConfirmation',
    ]);
    uuid(result.sourceToolCallId, `${path}.sourceToolCallId`);
    const assetRefs = array(result.assetRefs, `${path}.assetRefs`, 20);
    if (!assetRefs.length) fail(`${path}.assetRefs`);
    assetRefs.forEach((assetRef, index) => (
      boundedString(assetRef, `${path}.assetRefs[${index}]`, 1, 256)
    ));
    if (new Set(assetRefs).size !== assetRefs.length) fail(`${path}.assetRefs`);
    const binding = object(result.contextBinding, `${path}.contextBinding`);
    strictKeys(binding, `${path}.contextBinding`, ['sessionId', 'revision', 'activeAccountRef']);
    uuid(binding.sessionId, `${path}.contextBinding.sessionId`);
    boundedInteger(binding.revision, `${path}.contextBinding.revision`, 0, Number.MAX_SAFE_INTEGER);
    boundedString(binding.activeAccountRef, `${path}.contextBinding.activeAccountRef`, 1, 256);
    literal(result.effect, 'hide_spam_assets', `${path}.effect`);
    literal(result.localMutationRequired, true, `${path}.localMutationRequired`);
  } else {
    navigationAction(result, kind as NavigationActionKind, path, false);
  }
}

function navigationAction(
  result: JsonObject,
  kind: NavigationActionKind,
  path: string,
  isPersisted: boolean,
) {
  const commonKeys = ['id', ...(isPersisted ? ['schemaVersion'] : []), 'kind', 'labelCode'];
  literal(result.requiresConfirmation, true, `${path}.requiresConfirmation`);
  if (isPersisted) literal(result.schemaVersion, 3, `${path}.schemaVersion`);
  switch (kind) {
    case 'openUrl': {
      strictKeys(result, path, [...commonKeys, 'url', 'requiresConfirmation']);
      const url = string(result.url, `${path}.url`);
      if (!url.startsWith('https://')) fail(`${path}.url`);
      return;
    }
    case 'openToken':
      strictKeys(result, path, [...commonKeys, 'slug', 'chain', 'tokenAddress', 'requiresConfirmation']);
      boundedString(result.slug, `${path}.slug`, 1, 128);
      apiChain(result.chain, `${path}.chain`);
      if (result.tokenAddress !== undefined) {
        boundedString(result.tokenAddress, `${path}.tokenAddress`, 1, 256);
      }
      return;
    case 'openTransaction':
      strictKeys(result, path, [...commonKeys, 'chain', 'transactionRef', 'requiresConfirmation']);
      apiChain(result.chain, `${path}.chain`);
      boundedString(result.transactionRef, `${path}.transactionRef`, 1, 256);
      return;
    case 'openAgent':
      strictKeys(result, path, [...commonKeys, 'entryPoint', 'requiresConfirmation']);
      entryPoint(result.entryPoint, `${path}.entryPoint`);
      return;
    default:
      return assertUnreachableContract(kind, `${path}.kind`);
  }
}

type NavigationActionKind = 'openUrl' | 'openToken' | 'openTransaction' | 'openAgent';

type EntryPointKind = 'agentTab' | 'portfolioChart' | 'tokenScreen' | 'globalSearch' | 'emptyState';

function entryPoint(value: unknown, path: string) {
  const result = object(value, path);
  const kind = oneOf<EntryPointKind>(
    result.kind,
    new Set<EntryPointKind>(['agentTab', 'portfolioChart', 'tokenScreen', 'globalSearch', 'emptyState']),
    `${path}.kind`,
  );
  switch (kind) {
    case 'agentTab':
      strictKeys(result, path, ['kind']);
      return;
    case 'portfolioChart': {
      strictKeys(result, path, ['kind', 'source', 'chartId', 'range', 'accountScope', 'datasetFocus']);
      if (result.source !== undefined) oneOf(result.source, new Set(['analyzeIt', 'manual']), `${path}.source`);
      boundedString(result.chartId, `${path}.chartId`, 1, 64);
      oneOf(result.range, new Set(['1d', '7d', '1m', '3m', '1y', 'all']), `${path}.range`);
      if (result.accountScope !== undefined) literal(result.accountScope, 'current', `${path}.accountScope`);
      if (result.datasetFocus !== undefined) {
        const focus = object(result.datasetFocus, `${path}.datasetFocus`);
        strictKeys(focus, `${path}.datasetFocus`, ['datasetId', 'assetSlug', 'chain']);
        if (focus.datasetId !== undefined) boundedString(focus.datasetId, `${path}.datasetFocus.datasetId`, 1, 128);
        if (focus.assetSlug !== undefined) boundedString(focus.assetSlug, `${path}.datasetFocus.assetSlug`, 1, 128);
        if (focus.chain !== undefined) apiChain(focus.chain, `${path}.datasetFocus.chain`);
      }
      return;
    }
    case 'tokenScreen': {
      strictKeys(result, path, ['kind', 'asset']);
      const asset = object(result.asset, `${path}.asset`);
      strictKeys(asset, `${path}.asset`, ['slug', 'chain', 'tokenAddress']);
      boundedString(asset.slug, `${path}.asset.slug`, 1, 128);
      apiChain(asset.chain, `${path}.asset.chain`);
      if (asset.tokenAddress !== undefined) boundedString(asset.tokenAddress, `${path}.asset.tokenAddress`, 1, 256);
      return;
    }
    case 'globalSearch':
      strictKeys(result, path, ['kind', 'query']);
      boundedString(result.query, `${path}.query`, 1, Number.MAX_SAFE_INTEGER);
      return;
    case 'emptyState':
      strictKeys(result, path, ['kind', 'surface', 'hintId', 'catalogVersion']);
      literal(result.surface, 'agentTab', `${path}.surface`);
      if (result.hintId !== undefined) {
        oneOf(result.hintId, new Set([
          'portfolio.performance', 'learn.swap', 'learn.staking', 'learn.security', 'receive.tokens',
        ]), `${path}.hintId`);
      }
      if (result.catalogVersion !== undefined) {
        const version = string(result.catalogVersion, `${path}.catalogVersion`);
        if (!/^agent-starter-hints-v[1-9][0-9]*$/u.test(version)) fail(`${path}.catalogVersion`);
      }
      return;
    default:
      return assertUnreachableContract(kind, `${path}.kind`);
  }
}

function assertUnreachableContract(_value: never, path: string): never {
  fail(path);
}

function agentWalletChain(value: unknown, path: string) {
  const chain = boundedString(value, path, 1, 32);
  if (!AGENT_WALLET_CHAINS.has(chain)) fail(path);
  return chain;
}

function apiChain(value: unknown, path: string) {
  return oneOf(value, NAVIGATION_CHAINS, path);
}

export function persistedAction(value: unknown, path: string): asserts value is AgentPersistedActionV2 {
  const result = object(value, path);
  const kind = extensibleOneOf(result.kind, PERSISTED_ACTION_KINDS, `${path}.kind`);
  if (result.schemaVersion !== undefined) {
    if (kind === 'stake') extensibleVersion(result.schemaVersion, 2, `${path}.schemaVersion`);
    else if (kind === 'swap') extensibleVersion(result.schemaVersion, 1, `${path}.schemaVersion`);
    else extensibleVersion(result.schemaVersion, 3, `${path}.schemaVersion`);
    const supportsVersion = kind === 'receive'
      || kind === 'stake'
      || kind === 'swap'
      || kind === 'openUrl'
      || kind === 'openToken'
      || kind === 'openTransaction'
      || kind === 'openAgent';
    if (!supportsVersion) throw new AgentV2CompatibilityError(`${path}.schemaVersion`);
  }
  uuid(result.id, `${path}.id`);
  const labelCodes = {
    openSend: 'open_send',
    receive: 'open_receive',
    stake: 'open_staking',
    swap: 'open_swap',
    hideSpamAssets: 'hide_spam_assets',
    openUrl: 'open_external_link',
    openToken: 'open_token',
    openTransaction: 'open_transaction',
    openAgent: 'open_agent',
  } as const;
  if (kind !== 'send') {
    literal(result.labelCode, labelCodes[kind as keyof typeof labelCodes], `${path}.labelCode`);
  }
  if (kind === 'send') {
    if (result.effect === 'open_wallet_review') {
      literal(result.labelCode, 'review_transfer', `${path}.labelCode`);
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'draftId', 'draftExpiresAt', 'sourceToolCallId',
        'effect', 'localDraftRequired', 'requiresConfirmation',
      ]);
      uuid(result.draftId, `${path}.draftId`);
      timestamp(result.draftExpiresAt, `${path}.draftExpiresAt`);
      uuid(result.sourceToolCallId, `${path}.sourceToolCallId`);
      literal(result.localDraftRequired, true, `${path}.localDraftRequired`);
      literal(result.requiresConfirmation, true, `${path}.requiresConfirmation`);
    } else if (result.effect === 'live_only') {
      literal(result.labelCode, 'open_send', `${path}.labelCode`);
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'effect', 'localDraftRequired', 'requiresConfirmation',
      ]);
      literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
      literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
    } else {
      fail(`${path}.effect`);
    }
  } else if (kind === 'openSend') {
    strictKeys(result, path, ['id', 'kind', 'labelCode', 'effect', 'requiresConfirmation']);
    literal(result.effect, 'live_only', `${path}.effect`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (kind === 'receive') {
    if (result.schemaVersion === undefined) {
      strictKeys(result, path, [
        'id', 'kind', 'labelCode', 'effect', 'localDraftRequired', 'requiresConfirmation',
      ]);
    } else {
      strictKeys(result, path, [
        'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'targetNetwork',
        'localDraftRequired', 'requiresConfirmation',
      ]);
      extensibleVersion(result.schemaVersion, 3, `${path}.schemaVersion`);
      boundedString(result.targetNetwork, `${path}.targetNetwork`, 1, 32);
    }
    literal(result.effect, 'open_receive', `${path}.effect`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (kind === 'stake') {
    strictKeys(result, path, [
      'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'productId', 'asset',
      'amount', 'localDraftRequired', 'requiresConfirmation',
    ]);
    literal(result.schemaVersion, 2, `${path}.schemaVersion`);
    stakingProductId(result.productId, `${path}.productId`);
    swapAsset(result.asset, `${path}.asset`);
    if (result.amount !== undefined) stakeAmount(result.amount, `${path}.amount`);
    literal(result.effect, 'open_staking', `${path}.effect`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (kind === 'swap') {
    strictKeys(result, path, [
      'id', 'schemaVersion', 'kind', 'labelCode', 'effect', 'sourceAsset',
      'destinationAsset', 'amount', 'localDraftRequired', 'requiresConfirmation',
    ]);
    literal(result.schemaVersion, 1, `${path}.schemaVersion`);
    literal(result.effect, 'open_swap', `${path}.effect`);
    swapAsset(result.sourceAsset, `${path}.sourceAsset`);
    swapAsset(result.destinationAsset, `${path}.destinationAsset`);
    swapAmount(result.amount, `${path}.amount`);
    literal(result.localDraftRequired, false, `${path}.localDraftRequired`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (kind === 'hideSpamAssets') {
    strictKeys(result, path, ['id', 'kind', 'labelCode', 'effect', 'requiresConfirmation']);
    literal(result.effect, 'live_only', `${path}.effect`);
    literal(result.requiresConfirmation, false, `${path}.requiresConfirmation`);
  } else if (result.schemaVersion === undefined) {
    strictKeys(result, path, ['id', 'kind', 'labelCode', 'requiresConfirmation']);
    literal(result.requiresConfirmation, true, `${path}.requiresConfirmation`);
  } else {
    navigationAction(result, kind as NavigationActionKind, path, true);
  }
}

export function decodeAgentV2Action(value: unknown): AgentActionProposal {
  const result = object(value, '$');
  action(result, '$');
  return result;
}

export function decodeAgentV2PersistedAction(value: unknown): AgentPersistedActionV2 {
  const result = object(value, '$');
  persistedAction(result, '$');
  return result;
}
