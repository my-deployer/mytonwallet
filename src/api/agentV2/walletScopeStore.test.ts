import { webcrypto } from 'node:crypto';

import type {
  AgentWalletSensitiveStorage,
  AgentWalletSensitiveStorageEntry,
} from './walletSensitiveStorage';

import {
  type AgentWalletScopeBinding,
  EncryptedAgentWalletScopeStore,
  WalletScopeError,
} from './walletScopeStore';
import { AGENT_WALLET_SCOPE_CACHE_FORMAT } from './walletSensitiveCache';

const BINDING: AgentWalletScopeBinding = {
  accountDigest: 'accounts-v1',
  accountScope: 'selected',
  activeAccountRef: 'account-active',
  deviceId: '22222222-2222-4222-8222-222222222222',
  messageId: '33333333-3333-4333-8333-333333333333',
  profileDigest: 'profile-v1',
  queryDigest: 'query-v1',
  revision: 7,
  sessionId: '11111111-1111-4111-8111-111111111111',
  threadId: '44444444-4444-4444-8444-444444444444',
};

describe('encrypted wallet scope store', () => {
  it('keeps labels and account refs encrypted and normalizes the selected label', async () => {
    const storage = new MemorySensitiveStorage();
    const store = createStore(storage, () => 1_000);

    const anchor = await store.issue(BINDING, 'account_private_ref', '  Чейто  ');

    expect(anchor).toMatch(/^scope_[A-Za-z0-9_-]{32}$/u);
    expect(JSON.stringify([...storage.entries.values()])).not.toMatch(/Чейто|account_private_ref/u);
    await expect(webcrypto.subtle.exportKey('raw', storage.key!)).rejects.toThrow();
    await expect(store.resolve(anchor, BINDING, 'чейто')).resolves.toEqual({
      accountRef: 'account_private_ref',
      label: '  Чейто  ',
    });
  });

  it('rejects forged, expired, relabelled and rebound anchors', async () => {
    let now = 1_000;
    const storage = new MemorySensitiveStorage();
    const store = createStore(storage, () => now);
    const anchor = await store.issue(BINDING, 'account_ref', 'Savings');

    await expect(store.resolve('scope_forged', BINDING, 'Savings')).rejects.toBeInstanceOf(WalletScopeError);
    const rebound: Array<Partial<AgentWalletScopeBinding>> = [
      { accountDigest: 'other-accounts' },
      { accountScope: 'current' },
      { activeAccountRef: 'other-active' },
      { deviceId: '55555555-5555-4555-8555-555555555555' },
      { messageId: '66666666-6666-4666-8666-666666666666' },
      { profileDigest: 'other-profile' },
      { queryDigest: 'other-query' },
      { revision: 8 },
      { sessionId: '77777777-7777-4777-8777-777777777777' },
      { threadId: '88888888-8888-4888-8888-888888888888' },
    ];
    for (const changed of rebound) {
      await expect(store.resolve(anchor, { ...BINDING, ...changed }, 'Savings')).rejects
        .toMatchObject({ code: 'scope_invalid' });
    }
    await expect(store.resolve(anchor, BINDING, 'Main')).rejects.toMatchObject({ code: 'scope_invalid' });

    now += 15 * 60_000;
    await expect(store.resolve(anchor, BINDING, 'Savings')).rejects.toMatchObject({ code: 'scope_expired' });
  });

  it('clears every entry from its dedicated scope store', async () => {
    const storage = new MemorySensitiveStorage();
    const store = createStore(storage, () => 1_000);
    const anchor = await store.issue(BINDING, 'account_ref', 'Savings');
    storage.entries.set('corrupt-entry', encryptedEntry('corrupt-entry'));

    await store.clear();

    expect(storage.entries.has(anchor)).toBe(false);
    expect(storage.entries).toEqual(new Map());
  });
});

function createStore(storage: MemorySensitiveStorage, now: () => number) {
  return new EncryptedAgentWalletScopeStore(storage, now, webcrypto as unknown as Crypto);
}

function encryptedEntry(id: string): AgentWalletSensitiveStorageEntry {
  return {
    id,
    createdAt: 1_000,
    expiresAt: 901_000,
    formatVersion: AGENT_WALLET_SCOPE_CACHE_FORMAT,
    lastAccessedAt: 1_000,
    size: 2,
    iv: new Uint8Array([1]),
    ciphertext: new Uint8Array([2]),
  };
}

class MemorySensitiveStorage implements AgentWalletSensitiveStorage {
  key?: CryptoKey;
  entries = new Map<string, AgentWalletSensitiveStorageEntry>();

  deleteEntry(id: string) {
    this.entries.delete(id);
    return Promise.resolve();
  }

  getEntry(id: string) {
    return Promise.resolve(this.entries.get(id));
  }

  async getOrCreateKey(_keyId: string, generate: () => Promise<CryptoKey>) {
    if (!this.key) this.key = await generate();
    return this.key;
  }

  listEntries() {
    return Promise.resolve([...this.entries.values()]);
  }

  putEntry(entry: AgentWalletSensitiveStorageEntry) {
    this.entries.set(entry.id, entry);
    return Promise.resolve();
  }

  putEntryAndPrune(entry: AgentWalletSensitiveStorageEntry) {
    this.entries.set(entry.id, entry);
    return Promise.resolve();
  }
}
