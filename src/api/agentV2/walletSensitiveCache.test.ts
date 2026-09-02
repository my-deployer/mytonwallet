import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { deserialize, serialize } from 'node:v8';

import type { EncryptedWalletContextEntry } from './walletConversationContextCache';

import { IndexedDbAgentV2WalletContextCacheStorage } from './walletConversationContextCache';
import {
  AGENT_WALLET_CONTEXT_CACHE_FORMAT,
  AGENT_WALLET_SCOPE_CACHE_FORMAT,
  AGENT_WALLET_SENSITIVE_CACHE_AUTHORITY_KEY_ID,
  AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
  AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
  clearAgentV2WalletSensitiveProtocolState,
  getOrCreateAgentWalletAuthorityKey,
  IndexedDbAgentWalletSensitiveCache,
} from './walletSensitiveCache';
import { IndexedDbAgentWalletSensitiveStorage } from './walletSensitiveStorage';

const MAX_CACHE_BYTES = 2 * 1024 * 1024;

describe('Agent V2 shared sensitive cache', () => {
  it('enforces per-store entry quotas and one two-MiB byte quota', async () => {
    await withFakeIndexedDb(async (indexedDb) => {
      const contexts = new IndexedDbAgentV2WalletContextCacheStorage();
      const scopes = new IndexedDbAgentWalletSensitiveStorage();
      const cache = new IndexedDbAgentWalletSensitiveCache(indexedDb);
      let timestamp = 1_000;

      for (let index = 0; index < 33; index++) {
        await contexts.putEntryAndPrune(
          encryptedEntry(`context-${index}`, timestamp++, 64),
          timestamp,
        );
      }
      for (let index = 0; index < 21; index++) {
        await scopes.putEntryAndPrune(
          encryptedEntry(`scope_${index}`, timestamp++, 64),
          timestamp,
        );
      }

      const contextEntries = await cache.listEntries<EncryptedWalletContextEntry>(
        AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
      );
      const countBoundEntries = [
        ...contextEntries,
        ...await scopes.listEntries(),
      ];
      expect(contextEntries).toHaveLength(32);
      expect(await scopes.listEntries()).toHaveLength(20);
      expect(countBoundEntries).toHaveLength(52);
      expect(countBoundEntries.reduce((sum, entry) => sum + entry.size, 0)).toBeLessThanOrEqual(
        MAX_CACHE_BYTES,
      );

      await contexts.putEntryAndPrune(
        encryptedEntry('large-context', timestamp++, 1_100_000),
        timestamp,
      );
      await scopes.putEntryAndPrune(
        encryptedEntry('scope_large', timestamp++, 1_100_000),
        timestamp,
      );

      const updatedContextEntries = await cache.listEntries<EncryptedWalletContextEntry>(
        AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
      );
      const byteBoundEntries = [
        ...updatedContextEntries,
        ...await scopes.listEntries(),
      ];
      expect(byteBoundEntries.reduce((sum, entry) => sum + entry.size, 0)).toBeLessThanOrEqual(
        MAX_CACHE_BYTES,
      );
      expect(JSON.stringify(byteBoundEntries)).not.toContain('exact-wallet-row');
    });
  });

  it('atomically creates one shared encryption key during concurrent first writes', async () => {
    await withFakeIndexedDb(async () => {
      const contexts = new IndexedDbAgentV2WalletContextCacheStorage();
      const scopes = new IndexedDbAgentWalletSensitiveStorage();
      const crypto = webcrypto as unknown as Crypto;
      const [contextKey, scopeKey] = await Promise.all([
        getOrCreateAgentWalletAuthorityKey(contexts, crypto),
        getOrCreateAgentWalletAuthorityKey(scopes, crypto),
      ]);
      const contextIv = crypto.getRandomValues(new Uint8Array(12));
      const scopeIv = crypto.getRandomValues(new Uint8Array(12));
      const contextId = 'context-authority';
      const scopeId = 'scope_authority';
      const [contextCiphertext, scopeCiphertext] = await Promise.all([
        encrypt(contextKey, contextIv, contextId, 'context-only-authority', crypto),
        encrypt(scopeKey, scopeIv, scopeId, 'scope-only-authority', crypto),
      ]);

      await Promise.all([
        contexts.putEntryAndPrune({
          ...encryptedEntry(contextId, 1_000, contextCiphertext.byteLength + contextIv.byteLength),
          ciphertext: contextCiphertext,
          iv: contextIv,
        }, 1_000),
        scopes.putEntryAndPrune({
          ...encryptedEntry(scopeId, 1_001, scopeCiphertext.byteLength + scopeIv.byteLength),
          ciphertext: scopeCiphertext,
          iv: scopeIv,
        }, 1_001),
      ]);

      const coldKey = await getOrCreateAgentWalletAuthorityKey(
        new IndexedDbAgentV2WalletContextCacheStorage(),
        crypto,
      );
      await expect(decrypt(coldKey, contextIv, contextId, contextCiphertext, crypto))
        .resolves.toBe('context-only-authority');
      await expect(decrypt(coldKey, scopeIv, scopeId, scopeCiphertext, crypto))
        .resolves.toBe('scope-only-authority');
      await expect(webcrypto.subtle.exportKey('raw', coldKey)).rejects.toThrow();
    });
  });

  it('upgrades V2 by deleting pagination state and continuity authority while preserving AES authority', async () => {
    await withFakeIndexedDb(async (indexedDb) => {
      const crypto = webcrypto as unknown as Crypto;
      const authorityKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      const legacyDatabase = await openDatabase(indexedDb, 2, (database) => {
        database.createObjectStore('keys');
        database.createObjectStore('pagination');
        database.createObjectStore('wallet-contexts');
      });
      const legacyTransaction = legacyDatabase.transaction(
        ['keys', 'pagination', 'wallet-contexts'],
        'readwrite',
      );
      legacyTransaction.objectStore('keys').put(authorityKey, AGENT_WALLET_SENSITIVE_CACHE_AUTHORITY_KEY_ID);
      legacyTransaction.objectStore('keys').put('continuity-key', 'wallet-pagination-continuity-hmac-v1');
      legacyTransaction.objectStore('pagination').put({ privatePage: true }, 'page_private');
      legacyTransaction.objectStore('wallet-contexts').put({ privateContext: true }, 'context_private');
      await completeTransaction(legacyTransaction);
      legacyDatabase.close();

      const scopes = new IndexedDbAgentWalletSensitiveStorage();
      await expect(scopes.listEntries()).resolves.toEqual([]);

      const upgradedDatabase = await openDatabase(indexedDb, 3);
      expect([...upgradedDatabase.objectStoreNames]).toEqual(['keys', 'wallet-contexts', 'wallet-scopes']);
      const verification = upgradedDatabase.transaction(
        ['keys', 'wallet-contexts', 'wallet-scopes'],
        'readonly',
      );
      await expect(readRequest(
        verification.objectStore('keys').get(AGENT_WALLET_SENSITIVE_CACHE_AUTHORITY_KEY_ID),
      )).resolves.toBe(authorityKey);
      await expect(readRequest(
        verification.objectStore('keys').get('wallet-pagination-continuity-hmac-v1'),
      )).resolves.toBeUndefined();
      await expect(readRequest(verification.objectStore('wallet-contexts').getAll())).resolves.toEqual([]);
      await expect(readRequest(verification.objectStore('wallet-scopes').getAll())).resolves.toEqual([]);
      await completeTransaction(verification);
      await expect(getOrCreateAgentWalletAuthorityKey(scopes, crypto)).resolves.toBe(authorityKey);
      upgradedDatabase.close();
    });
  });

  it('clears protocol state without deleting the shared authority key', async () => {
    await withFakeIndexedDb(async (indexedDb) => {
      const contexts = new IndexedDbAgentV2WalletContextCacheStorage();
      const scopes = new IndexedDbAgentWalletSensitiveStorage();
      const cache = new IndexedDbAgentWalletSensitiveCache(indexedDb);
      const crypto = webcrypto as unknown as Crypto;
      const key = await getOrCreateAgentWalletAuthorityKey(contexts, crypto);
      await Promise.all([
        contexts.putEntry(encryptedEntry('context', 1_000, 2)),
        scopes.putEntry(encryptedEntry('scope_anchor', 1_000, 2)),
      ]);

      await clearAgentV2WalletSensitiveProtocolState(indexedDb);

      await expect(cache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE)).resolves.toEqual([]);
      await expect(scopes.listEntries()).resolves.toEqual([]);
      await expect(getOrCreateAgentWalletAuthorityKey(scopes, crypto)).resolves.toBe(key);
    });
  });

  it('fails closed when the V3 upgrade is blocked', async () => {
    await withFakeIndexedDb(async (indexedDb) => {
      const legacyDatabase = await openDatabase(indexedDb, 2, (database) => {
        database.createObjectStore('keys');
        database.createObjectStore('pagination');
        database.createObjectStore('wallet-contexts');
      });
      const cache = new IndexedDbAgentWalletSensitiveCache(indexedDb);

      await expect(cache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE))
        .rejects.toThrow('upgrade blocked');

      legacyDatabase.close();
    });
  });

  it('fails closed after a later database version change', async () => {
    await withFakeIndexedDb(async (indexedDb) => {
      const cache = new IndexedDbAgentWalletSensitiveCache(indexedDb);
      await expect(cache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE)).resolves.toEqual([]);

      const futureDatabase = await openDatabase(indexedDb, 4);

      await expect(cache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE))
        .rejects.toThrow('version changed');
      futureDatabase.close();
    });
  });
});

function encryptedEntry(
  id: string,
  timestamp: number,
  size: number,
): EncryptedWalletContextEntry {
  return {
    id,
    createdAt: timestamp,
    expiresAt: timestamp + 60_000,
    formatVersion: cacheFormat(id),
    lastAccessedAt: timestamp,
    size,
    iv: new Uint8Array([1]),
    ciphertext: new Uint8Array(size),
  };
}

function cacheFormat(id: string) {
  if (id.startsWith('scope_')) return AGENT_WALLET_SCOPE_CACHE_FORMAT;
  return AGENT_WALLET_CONTEXT_CACHE_FORMAT;
}

async function encrypt(key: CryptoKey, iv: Uint8Array, id: string, value: string, crypto: Crypto) {
  return new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(id),
  }, key, new TextEncoder().encode(value)));
}

async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  id: string,
  ciphertext: Uint8Array,
  crypto: Crypto,
) {
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(id),
  }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function withFakeIndexedDb(run: (indexedDb: IDBFactory) => Promise<void>) {
  const previousIndexedDb = global.indexedDB;
  const previousStructuredClone = global.structuredClone;
  const indexedDb = new IDBFactory();
  Object.defineProperty(global, 'indexedDB', { configurable: true, value: indexedDb });
  Object.defineProperty(global, 'structuredClone', {
    configurable: true,
    value: <T>(value: T): T => (
      value && (value as { constructor?: { name?: string } }).constructor?.name === 'CryptoKey'
        ? value
        : deserialize(serialize(value)) as T
    ),
  });
  try {
    await run(indexedDb);
  } finally {
    Object.defineProperty(global, 'indexedDB', { configurable: true, value: previousIndexedDb });
    Object.defineProperty(global, 'structuredClone', { configurable: true, value: previousStructuredClone });
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
