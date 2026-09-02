import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { deserialize, serialize } from 'node:v8';

import type { AgentWalletConversationContextV5 } from './protocol/types';

import {
  type AgentV2WalletContextCacheBinding,
  type AgentV2WalletContextCacheStorage,
  EncryptedAgentV2WalletConversationContextCache,
  type EncryptedWalletContextEntry,
  IndexedDbAgentV2WalletContextCacheStorage,
} from './walletConversationContextCache';
import {
  AGENT_WALLET_CONTEXT_CACHE_FORMAT,
  AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
  IndexedDbAgentWalletSensitiveCache,
} from './walletSensitiveCache';

const CONTEXT = {
  schemaVersion: 5,
  sourceAssistantMessageId: '55555555-5555-4555-8555-555555555555',
  sessionId: '88888888-8888-4888-8888-888888888888',
  revision: 1,
  operation: 'account.inventory',
  query: {
    schemaVersion: 5,
    operation: 'account.inventory',
    accountSelector: { kind: 'named', label: 'Savings' },
    chains: ['ton'],
  },
  scopeChoices: [{
    choiceId: `choice_${'a'.repeat(32)}`,
    scopeAnchor: `scope_${'b'.repeat(32)}`,
    label: 'Savings',
    ordinal: 1,
    chains: ['ton'],
  }],
  expiresAt: '2026-08-05T13:00:00.000Z',
} satisfies AgentWalletConversationContextV5;

const BINDING: AgentV2WalletContextCacheBinding = {
  accountDigest: 'account-digest',
  profileDigest: 'profile-digest',
  deviceId: '11111111-1111-4111-8111-111111111111',
  messageId: CONTEXT.sourceAssistantMessageId,
  revision: CONTEXT.revision,
  sessionId: CONTEXT.sessionId,
  threadId: '44444444-4444-4444-8444-444444444444',
};

describe('encrypted Agent V2 wallet-conversation context cache', () => {
  it('stores only encrypted V5 authority under its full binding', async () => {
    const storage = new MemoryContextStorage();
    const cache = createCache(storage, () => Date.parse('2026-08-05T12:00:00.000Z'));

    await cache.put(BINDING, CONTEXT);

    expect(storage.entries.size).toBe(1);
    expect(JSON.stringify([...storage.entries.values()])).not.toContain('transactions');
    await expect(webcrypto.subtle.exportKey('raw', storage.key!)).rejects.toThrow();
    await expect(cache.get(BINDING)).resolves.toEqual(CONTEXT);
    await expect(createCache(storage, () => Date.parse('2026-08-05T12:00:01.000Z')).get(BINDING))
      .resolves.toEqual(CONTEXT);
    await cache.delete(BINDING);
    await expect(cache.get(BINDING)).resolves.toBeUndefined();
  });

  it('round-trips unknown server-owned context fields without interpreting them', async () => {
    const storage = new MemoryContextStorage();
    const cache = createCache(storage, () => Date.parse('2026-08-05T12:00:00.000Z'));
    const contextWithExtension = {
      ...CONTEXT,
      futureControl: { mode: 'server-owned' },
      query: {
        ...CONTEXT.query,
        accountSelector: { ...CONTEXT.query.accountSelector, futureLabel: 'opaque' },
      },
    } as unknown as AgentWalletConversationContextV5;

    await cache.put(BINDING, contextWithExtension);

    await expect(cache.get(BINDING)).resolves.toEqual(contextWithExtension);
  });

  it('fails closed across profile, device, session, revision and contract changes', async () => {
    const changes: Array<Partial<AgentV2WalletContextCacheBinding>> = [
      { accountDigest: 'other-account' },
      { profileDigest: 'other-profile' },
      { deviceId: '22222222-2222-4222-8222-222222222222' },
      { threadId: '33333333-3333-4333-8333-333333333333' },
      { messageId: '66666666-6666-4666-8666-666666666666' },
      { sessionId: '77777777-7777-4777-8777-777777777777' },
      { revision: 2 },
    ];

    for (const changed of changes) {
      const storage = new MemoryContextStorage();
      const cache = createCache(storage, () => Date.parse('2026-08-05T12:00:00.000Z'));
      await cache.put(BINDING, CONTEXT);
      await expect(cache.get({ ...BINDING, ...changed })).resolves.toBeUndefined();
    }
  });

  it('expires, bounds entries to thirty-two, and clears contexts without deleting the shared key', async () => {
    const storage = new MemoryContextStorage();
    let now = Date.parse('2026-08-05T12:00:00.000Z');
    const cache = createCache(storage, () => now++);
    for (let index = 0; index < 33; index++) {
      const messageId = `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`;
      await cache.put(
        { ...BINDING, messageId },
        { ...CONTEXT, sourceAssistantMessageId: messageId },
      );
    }
    expect(storage.entries.size).toBe(32);

    await cache.clear();
    expect(storage.entries.size).toBe(0);
    expect(storage.key).toBeDefined();

    await cache.put(BINDING, CONTEXT);
    now = Date.parse('2026-08-05T12:31:00.000Z');
    await expect(cache.get(BINDING)).resolves.toBeUndefined();
  });

  it('migrates the real IndexedDB cache from V1 cards to V3 contexts', async () => {
    const previousIndexedDb = global.indexedDB;
    const previousStructuredClone = global.structuredClone;
    const indexedDb = new IDBFactory();
    Object.defineProperty(global, 'indexedDB', { configurable: true, value: indexedDb });
    Object.defineProperty(global, 'structuredClone', {
      configurable: true,
      value: <T>(value: T): T => deserialize(serialize(value)) as T,
    });

    try {
      const legacyDatabase = await openDatabase(indexedDb, 1, (database) => {
        database.createObjectStore('keys');
        database.createObjectStore('cards');
        database.createObjectStore('pagination');
      });
      const legacyTransaction = legacyDatabase.transaction(['keys', 'cards'], 'readwrite');
      legacyTransaction.objectStore('keys').put('legacy-key', 'data-card-aes-gcm-v1');
      legacyTransaction.objectStore('cards').put({ privateWalletData: true }, 'legacy-card');
      await completeTransaction(legacyTransaction);
      legacyDatabase.close();

      const storage = new IndexedDbAgentV2WalletContextCacheStorage();
      const sensitiveCache = new IndexedDbAgentWalletSensitiveCache(indexedDb);
      await expect(sensitiveCache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE))
        .resolves.toEqual([]);
      await storage.putEntry({
        id: 'context-entry',
        createdAt: 1,
        expiresAt: 2,
        formatVersion: AGENT_WALLET_CONTEXT_CACHE_FORMAT,
        lastAccessedAt: 1,
        size: 2,
        iv: new Uint8Array([1]),
        ciphertext: new Uint8Array([2]),
      });

      const upgradedDatabase = await openDatabase(indexedDb, 3);
      expect([...upgradedDatabase.objectStoreNames]).toEqual(['keys', 'wallet-contexts', 'wallet-scopes']);
      const verification = upgradedDatabase.transaction(['keys', 'wallet-contexts'], 'readonly');
      await expect(readRequest(verification.objectStore('keys').get('data-card-aes-gcm-v1')))
        .resolves.toBeUndefined();
      await expect(readRequest(verification.objectStore('wallet-contexts').get('context-entry')))
        .resolves.toMatchObject({ id: 'context-entry', formatVersion: AGENT_WALLET_CONTEXT_CACHE_FORMAT });
      await completeTransaction(verification);
      upgradedDatabase.close();
    } finally {
      Object.defineProperty(global, 'indexedDB', { configurable: true, value: previousIndexedDb });
      Object.defineProperty(global, 'structuredClone', { configurable: true, value: previousStructuredClone });
    }
  });
});

function createCache(storage: MemoryContextStorage, now: () => number) {
  return new EncryptedAgentV2WalletConversationContextCache(
    storage,
    validateContext,
    now,
    webcrypto as unknown as Crypto,
  );
}

function validateContext(value: unknown): AgentWalletConversationContextV5 {
  const context = value as AgentWalletConversationContextV5;
  if (context.schemaVersion !== 5) throw new Error('Invalid wallet conversation context');
  return context;
}

class MemoryContextStorage implements AgentV2WalletContextCacheStorage {
  key?: CryptoKey;
  entries = new Map<string, EncryptedWalletContextEntry>();

  clearContexts() {
    this.entries.clear();
    return Promise.resolve();
  }

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

  putEntry(entry: EncryptedWalletContextEntry) {
    this.entries.set(entry.id, entry);
    return Promise.resolve();
  }

  putEntryAndPrune(entry: EncryptedWalletContextEntry, currentTime: number) {
    this.entries.set(entry.id, entry);
    const live = [...this.entries.values()]
      .filter((candidate) => (
        candidate.expiresAt > currentTime
        && candidate.formatVersion === AGENT_WALLET_CONTEXT_CACHE_FORMAT
      ))
      .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt);
    this.entries.clear();
    let bytes = 0;
    live.forEach((candidate, index) => {
      bytes += candidate.size;
      if (index < 32 && bytes <= 2 * 1024 * 1024) this.entries.set(candidate.id, candidate);
    });
    return Promise.resolve();
  }
}

function openDatabase(
  indexedDb: IDBFactory,
  version: number,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDb.open('mytonwallet-agent-v2-sensitive-cache', version);
    openRequest.onupgradeneeded = () => upgrade?.(openRequest.result);
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });
}

function readRequest<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
