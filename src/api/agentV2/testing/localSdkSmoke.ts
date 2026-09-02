import type { Storage } from '../../storages/types';
import type { AgentEntryPoint } from '../protocol/types';
import type {
  AgentV2ClientUpdate,
  AgentV2HostContextSnapshot,
  AgentV2RunCommandInput,
} from '../types';

import { AgentV2Runtime } from '../runtime';
import { AgentV2WalletSession } from '../walletSession';
import { AgentV2WalletToolDispatcher } from '../walletTools';

const originA = process.env.AGENT_V2_LOCAL_BASE_URL_A ?? 'http://127.0.0.1:3001';
const originB = process.env.AGENT_V2_LOCAL_BASE_URL_B ?? 'http://127.0.0.1:3002';
const baseUrl = `${originA}/api/v2`;
const smokeNonce = process.env.AGENT_V2_LOCAL_SMOKE_NONCE ?? 'default';
const PRIVATE_ADDRESS = `EQ-sdk-private-owner-address-${smokeNonce}`;
const PRIVATE_WATCH_ADDRESS = `EQ-sdk-private-watch-address-${smokeNonce}`;
const PRIVATE_CONTACT = 'EQ-sdk-private-contact-address';
const PRIVATE_CURRENT_BALANCE = '10.000000001';
const PRIVATE_WATCH_BALANCE = '0.125000009';
const PRIVATE_CURRENT_LABEL = 'SDK Wallet';
const PRIVATE_WATCH_LABEL = 'Watch Wallet';

export async function run() {
  const updates: AgentV2ClientUpdate[] = [];
  const storage = memoryStorage();
  const session = new AgentV2WalletSession();
  let toolResultPosts = 0;
  const toolResultNames: string[] = [];
  const routedFetch: typeof fetch = (input, init) => {
    const source = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(source);
    if (url.pathname.endsWith('/tool-results') || url.pathname.includes('/threads/')) {
      url.host = new URL(originB).host;
      url.protocol = new URL(originB).protocol;
    }
    if (url.pathname.endsWith('/tool-results')) {
      toolResultPosts += 1;
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { toolName?: string };
        toolResultNames.push(body.toolName ?? 'unknown');
      }
    }
    return fetch(url, init);
  };
  const runtime = new AgentV2Runtime({
    storage,
    baseUrl,
    fetch: routedFetch,
    onUpdate: (update) => updates.push(update),
    walletSession: session,
  });
  const dispatcher = new AgentV2WalletToolDispatcher({
    session,
    getConsent: () => runtime.getConsent(),
    checkTransactionDraft: () => Promise.resolve({ resolvedAddress: PRIVATE_CONTACT, isToAddressNew: true }),
  });
  runtime.setToolExecutor({
    execute: async (call, context) => {
      try {
        return await dispatcher.execute(call, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown tool execution error';
        process.stderr.write(`Agent V2 SDK tool execution failed: ${message}\n`);
        throw error;
      }
    },
    discard: (toolCallId) => dispatcher.discard(toolCallId),
    registerAction: (threadId, messageId, action) => dispatcher.registerAction(threadId, messageId, action),
    hydrateAction: (threadId, messageId, action) => dispatcher.hydrateAction(threadId, messageId, action),
    getActionPresentation: (threadId, messageId, action) => (
      dispatcher.getActionPresentation(threadId, messageId, action)
    ),
    resolveAction: (threadId, messageId, action) => dispatcher.resolveAction(threadId, messageId, action),
    resolvePersistedAction: (threadId, messageId, action) => (
      dispatcher.resolvePersistedAction(threadId, messageId, action)
    ),
    clear: (threadId) => dispatcher.clear(threadId),
  });

  await runtime.acceptConsent();
  await runtime.updateHostContext(hostContext());
  const hints = await runtime.getHints('en');
  assert(hints.items.length === 5, 'Starter hints were not hydrated');

  await append(runtime, updates, 'Local SDK smoke question', { kind: 'agentTab' }, 'general');
  const beforeAssetUpdates = updates.length;
  await append(runtime, updates, 'TON', { kind: 'globalSearch', query: 'TON' }, 'asset-search');
  const assetText = updates.slice(beforeAssetUpdates)
    .filter((update): update is Extract<AgentV2ClientUpdate, { kind: 'textDelta' }> => update.kind === 'textDelta')
    .map(({ delta }) => delta)
    .join('');
  assert(toolResultPosts === 2, `Asset Search posted ${toolResultPosts} query results instead of two: ${assetText}`);

  const receiveHint = hints.items.find(({ id }) => id === 'receive.tokens');
  assert(receiveHint, 'Receive starter hint is missing');
  const beforeReceivePosts = toolResultPosts;
  await append(runtime, updates, 'Help me receive tokens.', {
    kind: 'emptyState',
    surface: 'agentTab',
    hintId: receiveHint.id,
    catalogVersion: hints.catalogVersion,
  }, 'receive');
  assert(toolResultPosts === beforeReceivePosts, 'Receive incorrectly used tool lifecycle');
  const receive = findLatestAction(updates, 'receive');
  assert(receive && runtime.resolveAction(receive.messageId, receive.action.id).kind === 'openReceive',
    'Receive action did not resolve on user gesture');

  const beforeStakePosts = toolResultPosts;
  await append(runtime, updates, 'Stake 2 TON', { kind: 'agentTab' }, 'stake');
  const stake = findLatestAction(updates, 'stake');
  assert(stake && runtime.resolveAction(stake.messageId, stake.action.id).kind === 'openStaking',
    'Staking action did not resolve on iOS');
  assertToolResults(toolResultNames, beforeStakePosts, [], 'Staking');

  const beforeSwapPosts = toolResultPosts;
  await append(runtime, updates, 'Swap 1 TON to USDT', { kind: 'agentTab' }, 'swap');
  const swap = findLatestAction(updates, 'swap');
  assert(swap && runtime.resolveAction(swap.messageId, swap.action.id).kind === 'openSwap',
    'Swap action did not resolve on iOS');
  assertToolResults(toolResultNames, beforeSwapPosts, ['action.swap.prepare'], 'Swap');

  await runtime.updateHostContext({ ...hostContext(), platform: 'classic', client: 'web' });
  const beforeSendPosts = toolResultPosts;
  await append(runtime, updates, 'Send 1.5 TON to Mom', { kind: 'agentTab' }, 'send');
  const send = findLatestAction(updates, 'send');
  assert(send, 'Send action was not emitted');
  const sendPresentation = runtime.getActionPresentation(send.messageId, send.action.id);
  assert(sendPresentation.kind === 'send' && sendPresentation.status === 'active',
    'Classic Send action did not expose an active presentation');
  const sendResolution = runtime.resolveAction(send.messageId, send.action.id);
  assert(sendResolution.kind === 'reviewSend', 'Classic Send action did not join its local draft');
  assertToolResults(toolResultNames, beforeSendPosts, [
    'wallet.directory.query',
    'wallet.data.query',
    'wallet.data.query',
    'wallet.data.query',
    'action.send.prepare',
  ], 'Send');
  await runtime.updateHostContext(hostContext());

  const beforePortfolioPosts = toolResultPosts;
  const beforePortfolioUpdates = updates.length;
  await append(runtime, updates, 'Analyze this portfolio', {
    kind: 'portfolioChart',
    chartId: 'sdk-local-portfolio',
    range: '3m',
    accountScope: 'current',
    source: 'analyzeIt',
  }, 'portfolio');
  const portfolioUpdates = updates.slice(beforePortfolioUpdates);
  const portfolioAnswer = portfolioUpdates
    .filter((update): update is Extract<AgentV2ClientUpdate, { kind: 'textDelta' }> => update.kind === 'textDelta')
    .map(({ delta }) => delta)
    .join('');
  assert(
    portfolioAnswer.includes('25') && portfolioAnswer.toLowerCase().includes('partial'),
    `Portfolio answer did not preserve wallet value and coverage: ${summarizeUpdates(portfolioUpdates)}`,
  );
  assertToolResults(toolResultNames, beforePortfolioPosts, ['wallet.data.query'], 'Portfolio');

  await runtime.updateHostContext({ ...hostContext(), platform: 'classic', client: 'web' });
  const hydration = await currentHydration(runtime);
  const firstUser = hydration.messages.find(({ role }) => role === 'user');
  assert(firstUser, 'Hydration is missing the first user message');
  await runAgainstCurrentThread(runtime, updates, {
    input: { kind: 'edit', targetUserMessageId: firstUser.id, text: 'Edited local SDK smoke question' },
  }, 'edit');
  reportStage('edit passed');

  const defaultThread = await runtime.getDefaultThread();
  const repeatedHydration = await runtime.getMessages(defaultThread.thread.id);
  assert(repeatedHydration.thread.id === defaultThread.thread.id,
    'Repeated hydration changed the default thread binding');
  assert(repeatedHydration.thread.isDefault, 'Default hydration returned a non-default summary');
  reportStage('default thread hydration passed');

  const serializedUpdates = JSON.stringify(updates);
  assert(!serializedUpdates.includes(PRIVATE_ADDRESS), 'Raw wallet address escaped into UI updates');
  assert(!serializedUpdates.includes(PRIVATE_WATCH_ADDRESS), 'Raw watch address escaped into UI updates');
  assert(!serializedUpdates.includes(PRIVATE_CONTACT), 'Raw contact address escaped into UI updates');
  assert(!serializedUpdates.includes('adt_v2.'), 'Bearer token escaped into UI updates');

  const current = await runtime.getDefaultThread();
  await runtime.clearThread(current.thread.id, current.thread.revision);
  const cleared = await runtime.getMessages(current.thread.id);
  assert(cleared.messages.length === 0, 'Thread clear did not remove hydrated history');
  await runtime.destroy({ shouldClearPersistentIdentity: true });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    replicaA: originA,
    replicaB: originB,
    toolResultPosts,
    toolResultNames,
    updateCount: updates.length,
    receiveResolved: true,
    stakeResolved: true,
    swapResolved: true,
    sendDraftResolved: true,
    portfolioAnswered: true,
    classicEditChecked: true,
    defaultThreadChecked: true,
    privacyChecked: true,
  }, undefined, 2)}\n`);
}

async function append(
  runtime: AgentV2Runtime,
  updates: AgentV2ClientUpdate[],
  text: string,
  entryPoint: AgentEntryPoint,
  label: string,
) {
  return runAgainstCurrentThread(runtime, updates, { input: { kind: 'append', text }, entryPoint }, label);
}

async function runAgainstCurrentThread(
  runtime: AgentV2Runtime,
  updates: AgentV2ClientUpdate[],
  command: AgentV2RunCommandInput,
  label: string,
) {
  const updateOffset = updates.length;
  const current = await runtime.getDefaultThread();
  const result = await runtime.startRun({
    ...command,
    threadId: current.thread.id,
    expectedThreadRevision: current.thread.revision,
  });
  if (result.state !== 'completed') {
    const failure = [...updates.slice(updateOffset)].reverse().find((update) => update.kind === 'runFailed');
    const detail = failure?.kind === 'runFailed' ? ` (${failure.code})` : '';
    throw new Error(`${label} run ended as ${result.state}${detail}`);
  }
  return result;
}

async function currentHydration(runtime: AgentV2Runtime) {
  const current = await runtime.getDefaultThread();
  return runtime.getMessages(current.thread.id);
}

function findLatestAction(updates: AgentV2ClientUpdate[], kind: 'send' | 'receive' | 'stake' | 'swap') {
  return [...updates].reverse().find((update): update is Extract<AgentV2ClientUpdate, { kind: 'actionAvailable' }> => (
    update.kind === 'actionAvailable' && update.action.kind === kind
  ));
}

function hostContext(): AgentV2HostContextSnapshot {
  return {
    platform: 'ios',
    client: 'native',
    lang: 'en',
    baseCurrency: 'USD',
    isTestnet: false,
    activeAccountId: 'sdk-account-one',
    activeNetwork: 'ton',
    assetCatalog: [
      { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: '2.5' },
      { slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: '1' },
    ],
    swapAssetCatalog: [
      { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: '2.5' },
      { slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: '1' },
    ],
    stakingOffers: [{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
      annualYield: '4.5',
      yieldType: 'APY',
      availability: 'available',
    }],
    accounts: [
      {
        accountId: 'sdk-account-one',
        label: PRIVATE_CURRENT_LABEL,
        state: 'active',
        accountType: 'regular',
        isViewOnly: false,
        chains: ['ton'],
        addresses: { ton: PRIVATE_ADDRESS },
        savedAddresses: [{ id: 'mom', name: 'Mom', chain: 'ton', address: PRIVATE_CONTACT }],
        domainStates: {
          accounts: { state: 'fresh' },
          positions: { state: 'fresh' },
          transactions: { state: 'stale' },
          value_series: { state: 'stale' },
          contacts: { state: 'fresh' },
        },
        holdings: [{
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'GRAM', name: 'Gram', decimals: 9 },
          balance: PRIVATE_CURRENT_BALANCE,
          availableBalance: PRIVATE_CURRENT_BALANCE,
          fiatValue: '25',
          valuationStatus: 'valued',
        }],
      },
      {
        accountId: 'sdk-account-two',
        label: PRIVATE_WATCH_LABEL,
        state: 'active',
        accountType: 'viewOnly',
        isViewOnly: true,
        chains: ['ton'],
        addresses: { ton: PRIVATE_WATCH_ADDRESS },
        domainStates: {
          accounts: { state: 'fresh' },
          positions: { state: 'fresh' },
          transactions: { state: 'stale' },
          value_series: { state: 'unavailable' },
          contacts: { state: 'fresh' },
        },
        holdings: [{
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'GRAM', name: 'Gram', decimals: 9 },
          balance: PRIVATE_WATCH_BALANCE,
          availableBalance: PRIVATE_WATCH_BALANCE,
          fiatValue: '0.3125',
          valuationStatus: 'valued',
        }],
      },
    ],
    savedAddresses: [{ id: 'mom', name: 'Mom', chain: 'ton', address: PRIVATE_CONTACT }],
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, unknown>();
  return {
    getItem: (key) => Promise.resolve(values.get(key)),
    setItem(key, value) {
      values.set(key, value);
      return Promise.resolve();
    },
    removeItem(key) {
      values.delete(key);
      return Promise.resolve();
    },
    clear() {
      values.clear();
      return Promise.resolve();
    },
  };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertToolResults(
  names: string[],
  offset: number,
  expected: string[],
  label: string,
) {
  const actual = names.slice(offset);
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} posted unexpected tool results: ${actual.join(', ') || 'none'}`,
  );
}

function summarizeUpdates(updates: AgentV2ClientUpdate[]) {
  return updates.map((update) => {
    if (update.kind === 'textDelta') return `text:${update.delta}`;
    if (update.kind === 'semanticContentAvailable') return `semantic:${update.content.kind}`;
    if (update.kind === 'runFailed') return `failed:${update.code}`;
    return update.kind;
  }).join('|').slice(0, 1_000);
}

function reportStage(message: string) {
  process.stdout.write(`Agent V2 SDK local smoke: ${message}\n`);
}
