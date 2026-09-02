import type {
  AgentToolCall,
  AgentWalletAccountChoiceV1,
  AgentWalletDataQueryArgsV5,
  AgentWalletResolvedScopeV1,
} from './protocol/types';
import type { AgentV2HostAccount } from './types';
import type { AgentWalletScopeBinding, AgentWalletScopeStore } from './walletScopeStore';
import type { AgentV2WalletSession } from './walletSession';

import { matchesPortfolioAccountFilter } from './walletQueryAccountFilter';
import { WalletQueryProjectionError } from './walletQueryErrors';
import {
  safeWalletQueryAccountLabel,
  type WalletQueryMaterializationScope,
} from './walletQueryMaterializer';
import { WalletScopeError } from './walletScopeStore';

export interface WalletQueryScopeDependencies {
  args: Exclude<AgentWalletDataQueryArgsV5, { operation: 'assets.search' }>;
  authorityBinding: Omit<AgentWalletScopeBinding, 'queryDigest'>;
  call: AgentToolCall;
  queryDigest: string;
  scopeStore?: AgentWalletScopeStore;
  session: AgentV2WalletSession;
}

export type WalletQueryScopeResolution =
  | {
    kind: 'resolved';
    materializationScope: WalletQueryMaterializationScope;
    resolvedScope: AgentWalletResolvedScopeV1;
  }
  | {
    choices: AgentWalletAccountChoiceV1[];
    kind: 'required';
    reason: 'ambiguous' | 'not_found';
  };

export async function resolveWalletQueryScope(
  dependencies: WalletQueryScopeDependencies,
): Promise<WalletQueryScopeResolution> {
  assertScopeAuthority(dependencies);
  const snapshot = dependencies.session.snapshot();
  const host = snapshot.host;
  if (!host) throw unavailable();
  const selector = dependencies.args.accountSelector;
  const rawInventoryAccounts = host.accounts.slice(0, 100);
  const inventoryAccounts = filterPortfolioAccounts(rawInventoryAccounts, dependencies.args);
  const dataAccounts = inventoryAccounts.filter(({ state }) => state === 'active');
  const metadataOnlyInventory = dependencies.args.operation === 'account.inventory'
    && !dependencies.args.includePortfolioTotals;
  const accounts = metadataOnlyInventory ? inventoryAccounts : dataAccounts;
  const totalsInventory = dependencies.args.operation === 'account.inventory'
    && dependencies.args.includePortfolioTotals;
  if (!rawInventoryAccounts.length
    || (!inventoryAccounts.length && dependencies.args.operation === 'portfolio.aggregate')
    || (!accounts.length && (
      selector.kind !== 'explicitAll' || totalsInventory
    ))) {
    throw unavailable();
  }
  const binding = scopeBinding(dependencies);

  if (selector.kind === 'current') {
    const account = accounts.find(({ accountId }) => accountId === host.activeAccountId);
    if (!account) throw unavailable();
    return resolved('current', [account], snapshot.accountRefs);
  }
  if (selector.kind === 'explicitAll') {
    if (metadataOnlyInventory) return resolved('explicitAll', inventoryAccounts, snapshot.accountRefs);
    if (dependencies.args.operation === 'account.inventory') {
      return resolved('explicitAll', dataAccounts, snapshot.accountRefs);
    }
    return resolved('explicitAll', inventoryAccounts, snapshot.accountRefs, dataAccounts);
  }
  if (selector.kind === 'anchored') {
    const scopeStore = requireScopeStore(dependencies);
    let stored: Awaited<ReturnType<AgentWalletScopeStore['resolve']>>;
    try {
      stored = await scopeStore.resolve(selector.scopeAnchor, binding, selector.label);
    } catch (error) {
      await assertCurrentAuthority(dependencies);
      if (error instanceof WalletScopeError) throw invalidArguments();
      throw error;
    }
    await assertCurrentAuthority(dependencies);
    const accountId = snapshot.accountIds.get(stored.accountRef);
    const account = accounts.find((candidate) => candidate.accountId === accountId);
    if (!account || normalizeLabel(safeWalletQueryAccountLabel(account)) !== normalizeLabel(stored.label)) {
      throw invalidArguments();
    }
    return resolved('named', [account], snapshot.accountRefs);
  }
  if (selector.kind === 'ordinal') {
    const account = accounts[selector.index - 1];
    if (!account) {
      return required('not_found', await choices(dependencies, binding, accounts, accounts.slice(0, 5)));
    }
    return resolved('ordinal', [account], snapshot.accountRefs);
  }

  const exact = accounts.filter(({ label }) => normalizeLabel(label) === normalizeLabel(selector.label));
  if (exact.length === 1) {
    return resolved('named', exact, snapshot.accountRefs);
  }
  if (exact.length > 1) {
    return required('ambiguous', await choices(dependencies, binding, accounts, exact.slice(0, 5)));
  }
  return required(
    'not_found',
    await choices(
      dependencies, binding, accounts, rankSuggestions(accounts, selector.label).slice(0, 5),
    ),
  );
}

function filterPortfolioAccounts(
  accounts: AgentV2HostAccount[],
  args: Exclude<AgentWalletDataQueryArgsV5, { operation: 'assets.search' }>,
): AgentV2HostAccount[] {
  const viewOnlyMode = args.operation === 'portfolio.aggregate'
    ? args.accountFilter?.viewOnly
    : undefined;
  if (args.operation !== 'portfolio.aggregate'
    || args.accountSelector.kind !== 'explicitAll'
    || !viewOnlyMode
    || viewOnlyMode === 'include') return accounts;
  return accounts.filter((account) => matchesPortfolioAccountFilter(account, args.accountFilter));
}

function assertScopeAuthority(dependencies: WalletQueryScopeDependencies) {
  const selector = dependencies.args.accountSelector;
  const expectedScope = selector.kind === 'current'
    ? 'current'
    : selector.kind === 'explicitAll' ? 'explicitAll' : 'selected';
  const context = dependencies.call.walletContextSession;
  const authority = dependencies.authorityBinding;
  if (
    dependencies.call.name !== 'wallet.data.query'
    || !context
    || context.accountScope !== expectedScope
    || authority.accountScope !== expectedScope
    || context.activeAccountRef !== authority.activeAccountRef
    || context.revision !== authority.revision
    || context.sessionId !== authority.sessionId
  ) throw invalidArguments();
  if (
    expectedScope === 'explicitAll'
    && (
      dependencies.call.scopeIntent?.reason !== 'explicit_all_wallet_query'
      || dependencies.call.scopeIntent.messageId !== dependencies.call.intentSource?.messageId
    )
  ) throw invalidArguments();
  if (
    expectedScope === 'selected'
    && (
      dependencies.call.scopeIntent?.reason !== 'selected_wallet_query'
      || dependencies.call.scopeIntent.messageId !== dependencies.call.intentSource?.messageId
    )
  ) throw invalidArguments();
  if (expectedScope === 'current' && dependencies.call.scopeIntent !== undefined) throw invalidArguments();
}

function resolved(
  kind: AgentWalletResolvedScopeV1['kind'],
  accounts: AgentV2HostAccount[],
  accountRefs: ReadonlyMap<string, string>,
  materializedAccounts: AgentV2HostAccount[] = accounts,
): Extract<WalletQueryScopeResolution, { kind: 'resolved' }> {
  const accountScope = kind === 'current' ? 'current'
    : kind === 'explicitAll' ? 'explicitAll' : 'selected';
  return {
    kind: 'resolved',
    materializationScope: {
      accountIds: materializedAccounts.map(({ accountId }) => accountId),
      accountScope,
      accountsRequested: accounts.length,
    },
    resolvedScope: {
      kind,
      accounts: accounts.map((account) => ({
        accountRef: requireAccountRef(accountRefs, account.accountId),
        accountLabel: safeWalletQueryAccountLabel(account),
      })),
    },
  };
}

function required(
  reason: 'ambiguous' | 'not_found',
  choices: AgentWalletAccountChoiceV1[],
): Extract<WalletQueryScopeResolution, { kind: 'required' }> {
  return { kind: 'required', reason, choices };
}

async function choices(
  dependencies: WalletQueryScopeDependencies,
  binding: AgentWalletScopeBinding,
  allAccounts: AgentV2HostAccount[],
  accounts: AgentV2HostAccount[],
) {
  const scopeStore = requireScopeStore(dependencies);
  const snapshot = dependencies.session.snapshot();
  try {
    return await Promise.all(accounts.map(async (account) => {
      const label = safeWalletQueryAccountLabel(account);
      return {
        choiceId: `choice_${randomReference()}`,
        scopeAnchor: await scopeStore.issue(
          binding, requireAccountRef(snapshot.accountRefs, account.accountId), label,
        ),
        label,
        ordinal: allAccounts.indexOf(account) + 1,
        chains: [...new Set(account.chains)],
      } satisfies AgentWalletAccountChoiceV1;
    }));
  } finally {
    await assertCurrentAuthority(dependencies);
  }
}

async function assertCurrentAuthority(dependencies: WalletQueryScopeDependencies) {
  const current = await dependencies.session.walletAuthorityBinding();
  const expected = dependencies.authorityBinding;
  if (
    current.accountDigest !== expected.accountDigest
    || current.profileDigest !== expected.profileDigest
    || current.revision !== expected.revision
    || current.sessionId !== expected.sessionId
  ) throw new WalletQueryProjectionError('wallet_context_changed', 'The active wallet changed.', false);
}

function requireScopeStore(dependencies: WalletQueryScopeDependencies) {
  if (!dependencies.scopeStore) throw unavailable();
  return dependencies.scopeStore;
}

function scopeBinding(dependencies: WalletQueryScopeDependencies): AgentWalletScopeBinding {
  const authority = dependencies.authorityBinding;
  return {
    accountDigest: authority.accountDigest,
    accountScope: authority.accountScope,
    activeAccountRef: authority.activeAccountRef,
    deviceId: authority.deviceId,
    messageId: authority.messageId,
    profileDigest: authority.profileDigest,
    queryDigest: dependencies.queryDigest,
    revision: authority.revision,
    sessionId: authority.sessionId,
    threadId: authority.threadId,
  };
}

function rankSuggestions<T extends { label?: string }>(accounts: T[], query: string): T[] {
  const normalizedQuery = normalizeLabel(query);
  return [...accounts].sort((left, right) => {
    const leftLabel = normalizeLabel(left.label);
    const rightLabel = normalizeLabel(right.label);
    const leftRank = suggestionRank(leftLabel, normalizedQuery);
    const rightRank = suggestionRank(rightLabel, normalizedQuery);
    return leftRank.match - rightRank.match
      || rightRank.prefix - leftRank.prefix
      || leftRank.distance - rightRank.distance
      || leftLabel.localeCompare(rightLabel);
  });
}

function suggestionRank(label: string, query: string) {
  let prefix = 0;
  while (prefix < label.length && prefix < query.length && label[prefix] === query[prefix]) prefix += 1;
  return {
    match: label.includes(query) || query.includes(label) ? 0 : 1,
    prefix,
    distance: editDistance(label, query),
  };
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, above, previous[rightIndex - 1]) + 1;
      diagonal = above;
    }
  }
  return previous[right.length];
}

function normalizeLabel(value?: string) {
  return sanitizeLabel(value).normalize('NFKC').toLocaleLowerCase('en-US');
}

function sanitizeLabel(value?: string) {
  return (value || 'Wallet').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ').trim().slice(0, 80) || 'Wallet';
}

function requireAccountRef(refs: ReadonlyMap<string, string>, accountId: string) {
  const ref = refs.get(accountId);
  if (!ref) throw invalidArguments();
  return ref;
}

function randomReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function invalidArguments() {
  return new WalletQueryProjectionError('invalid_arguments', 'The grounded wallet request is invalid.', false);
}

function unavailable() {
  return new WalletQueryProjectionError('stale_data_unavailable', 'Wallet data is unavailable.', true);
}
