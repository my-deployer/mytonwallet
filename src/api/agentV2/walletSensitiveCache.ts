import { AGENT_WALLET_SENSITIVE_CACHE_DATABASE_NAME } from '../../config';

export const AGENT_WALLET_SENSITIVE_CACHE_DATABASE_VERSION = 3;
export const AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE = 'keys';
export const AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE = 'wallet-contexts';
export const AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE = 'wallet-scopes';
export const AGENT_WALLET_SENSITIVE_CACHE_AUTHORITY_KEY_ID = 'wallet-authority-aes-gcm-v1';
export const AGENT_WALLET_SCOPE_CACHE_FORMAT = 'wallet-scope-v2';
export const AGENT_WALLET_CONTEXT_CACHE_FORMAT = 'wallet-context-v3';

const LEGACY_ENTRY_STORE = 'cards';
const LEGACY_KEY_ID = 'data-card-aes-gcm-v1';
const LEGACY_PAGINATION_STORE = 'pagination';
const LEGACY_CONTINUITY_KEY_ID = 'wallet-pagination-continuity-hmac-v1';
const MAX_CONTEXT_ENTRIES = 32;
const MAX_SCOPE_ENTRIES = 20;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

export type AgentWalletSensitiveCacheStore =
  | typeof AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE
  | typeof AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE;

const PROTOCOL_STATE_STORES: AgentWalletSensitiveCacheStore[] = [
  AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
  AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
];

export interface AgentWalletSensitiveCacheEntry {
  ciphertext: Uint8Array;
  createdAt: number;
  expiresAt: number;
  formatVersion: string;
  id: string;
  iv: Uint8Array;
  lastAccessedAt: number;
  size: number;
}

export interface AgentWalletSensitiveCacheKeyStorage {
  getOrCreateKey(
    keyId: string,
    generate: () => Promise<CryptoKey>,
  ): Promise<CryptoKey>;
}

export function getOrCreateAgentWalletAuthorityKey(
  storage: AgentWalletSensitiveCacheKeyStorage,
  webCrypto: Crypto,
) {
  return storage.getOrCreateKey(
    AGENT_WALLET_SENSITIVE_CACHE_AUTHORITY_KEY_ID,
    () => generateCryptoKey(webCrypto, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
  );
}

export class IndexedDbAgentWalletSensitiveCache {
  private database?: Promise<IDBDatabase>;
  private terminalError?: Error;
  private readonly keyFlights = new Map<string, Promise<CryptoKey>>();

  constructor(private readonly indexedDb: IDBFactory) {}

  clearStore(store: AgentWalletSensitiveCacheStore) {
    return this.transaction([store], 'readwrite', (transaction) => (
      request(transaction.objectStore(store).clear()).then(() => undefined)
    ));
  }

  clearProtocolState() {
    return this.transaction(PROTOCOL_STATE_STORES, 'readwrite', async (transaction) => {
      await Promise.all(PROTOCOL_STATE_STORES.map((store) => request(transaction.objectStore(store).clear())));
    });
  }

  deleteEntry(store: AgentWalletSensitiveCacheStore, id: string) {
    return this.transaction([store], 'readwrite', (transaction) => (
      request(transaction.objectStore(store).delete(id)).then(() => undefined)
    ));
  }

  getEntry<T extends AgentWalletSensitiveCacheEntry>(store: AgentWalletSensitiveCacheStore, id: string) {
    return this.transaction([store], 'readonly', (transaction) => (
      request<T | undefined>(transaction.objectStore(store).get(id))
    ));
  }

  listEntries<T extends AgentWalletSensitiveCacheEntry>(store: AgentWalletSensitiveCacheStore) {
    return this.transaction([store], 'readonly', (transaction) => (
      request<T[]>(transaction.objectStore(store).getAll())
    ));
  }

  putEntry(store: AgentWalletSensitiveCacheStore, entry: AgentWalletSensitiveCacheEntry) {
    return this.transaction([store], 'readwrite', (transaction) => (
      request(transaction.objectStore(store).put(entry, entry.id)).then(() => undefined)
    ));
  }

  putEntryAndPrune(
    store: AgentWalletSensitiveCacheStore,
    entry: AgentWalletSensitiveCacheEntry,
    currentTime: number,
  ) {
    return this.mutateAndPrune(store, entry, currentTime);
  }

  getOrCreateKey(keyId: string, generate: () => Promise<CryptoKey>) {
    const inFlight = this.keyFlights.get(keyId);
    if (inFlight) return inFlight;

    const result = this.resolveKey(keyId, generate);
    this.keyFlights.set(keyId, result);
    void result.finally(() => {
      if (this.keyFlights.get(keyId) === result) this.keyFlights.delete(keyId);
    }).catch(() => undefined);
    return result;
  }

  private async resolveKey(keyId: string, generate: () => Promise<CryptoKey>) {
    const existing = await this.transaction([AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE], 'readonly', (transaction) => (
      request<CryptoKey | undefined>(
        transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE).get(keyId),
      )
    ));
    if (existing) return existing;

    const candidate = await generate();
    return this.commitKeyIfAbsent(keyId, candidate);
  }

  private async commitKeyIfAbsent(keyId: string, candidate: CryptoKey): Promise<CryptoKey> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE], 'readwrite');
      const keyStore = transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE);
      const getRequest = keyStore.get(keyId);
      let selected: CryptoKey | undefined;

      getRequest.onsuccess = () => {
        selected = getRequest.result as CryptoKey | undefined;
        if (selected) return;
        selected = candidate;
        keyStore.put(candidate, keyId);
      };
      getRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        if (selected) resolve(selected);
        else reject(new Error('Agent sensitive-cache key transaction completed without a key'));
      };
      transaction.onabort = () => reject(
        transaction.error ?? getRequest.error ?? new Error('Agent sensitive-cache key transaction aborted'),
      );
      transaction.onerror = () => reject(
        transaction.error ?? new Error('Agent sensitive-cache key transaction failed'),
      );
    });
  }

  private async mutateAndPrune(
    targetStore: AgentWalletSensitiveCacheStore,
    entry: AgentWalletSensitiveCacheEntry,
    currentTime: number,
  ): Promise<void> {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROTOCOL_STATE_STORES, 'readwrite');
      const contextStore = transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE);
      const scopeStore = transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE);
      const storeByName = {
        [AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE]: contextStore,
        [AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE]: scopeStore,
      };
      storeByName[targetStore].put(entry, entry.id);
      const contextRequest = contextStore.getAll();
      const scopeRequest = scopeStore.getAll();
      let contextEntries: AgentWalletSensitiveCacheEntry[] | undefined;
      let scopeEntries: AgentWalletSensitiveCacheEntry[] | undefined;

      const pruneWhenReady = () => {
        if (!contextEntries || !scopeEntries) return;
        const candidates: Array<{
          entry: AgentWalletSensitiveCacheEntry;
          store: AgentWalletSensitiveCacheStore;
        }> = [
          ...contextEntries.map((value) => ({
            entry: value,
            store: AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE as AgentWalletSensitiveCacheStore,
          })),
          ...scopeEntries.map((value) => ({
            entry: value,
            store: AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE as AgentWalletSensitiveCacheStore,
          })),
        ];
        const stale = candidates.filter(({ entry: value, store }) => (
          !isValidEntry(value)
          || value.expiresAt <= currentTime
          || value.formatVersion !== expectedFormatVersion(store)
        ));
        const staleKeys = new Set(stale.map(cacheEntryKey));
        const live = candidates
          .filter((candidate) => !staleKeys.has(cacheEntryKey(candidate)))
          .sort(compareCacheEntries);
        const quota: typeof candidates = [];
        const retained: typeof candidates = [];
        const counts = new Map<AgentWalletSensitiveCacheStore, number>();
        live.forEach((candidate) => {
          const count = (counts.get(candidate.store) ?? 0) + 1;
          counts.set(candidate.store, count);
          const limit = candidate.store === AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE
            ? MAX_CONTEXT_ENTRIES
            : MAX_SCOPE_ENTRIES;
          if (count > limit) quota.push(candidate);
          else retained.push(candidate);
        });
        let bytes = 0;
        retained.forEach((candidate) => {
          if (bytes + candidate.entry.size > MAX_CACHE_BYTES) {
            quota.push(candidate);
          } else {
            bytes += candidate.entry.size;
          }
        });
        [...stale, ...quota].forEach(({ entry: value, store }) => storeByName[store].delete(value.id));
      };

      contextRequest.onsuccess = () => {
        contextEntries = contextRequest.result as AgentWalletSensitiveCacheEntry[];
        pruneWhenReady();
      };
      scopeRequest.onsuccess = () => {
        scopeEntries = scopeRequest.result as AgentWalletSensitiveCacheEntry[];
        pruneWhenReady();
      };
      contextRequest.onerror = () => transaction.abort();
      scopeRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(
        transaction.error
        ?? contextRequest.error
        ?? scopeRequest.error
        ?? new Error('Agent sensitive-cache quota transaction aborted'),
      );
      transaction.onerror = () => reject(
        transaction.error ?? new Error('Agent sensitive-cache quota transaction failed'),
      );
    });
  }

  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>,
  ) {
    const transaction = (await this.open()).transaction(stores, mode);
    const completion = transactionDone(transaction);
    const result = await operation(transaction);
    await completion;
    return result;
  }

  private open(): Promise<IDBDatabase> {
    if (this.terminalError) return Promise.reject(this.terminalError);
    this.database ??= new Promise((resolve, reject) => {
      const openRequest = this.indexedDb.open(
        AGENT_WALLET_SENSITIVE_CACHE_DATABASE_NAME,
        AGENT_WALLET_SENSITIVE_CACHE_DATABASE_VERSION,
      );
      let isSettled = false;
      const fail = (error: Error) => {
        this.terminalError = error;
        if (isSettled) return;
        isSettled = true;
        reject(error);
      };
      openRequest.onupgradeneeded = (event) => migrateSensitiveCache(openRequest, event.oldVersion);
      openRequest.onblocked = () => fail(new Error('Agent sensitive-cache upgrade blocked'));
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        if (isSettled) {
          database.close();
          return;
        }
        isSettled = true;
        database.onversionchange = () => {
          database.close();
          this.terminalError = new Error('Agent sensitive-cache version changed');
        };
        resolve(database);
      };
      openRequest.onerror = () => fail(
        openRequest.error ?? new Error('Agent sensitive cache unavailable'),
      );
    });
    return this.database;
  }
}

const indexedDbSensitiveCaches = new WeakMap<IDBFactory, IndexedDbAgentWalletSensitiveCache>();

export function getIndexedDbAgentWalletSensitiveCache(indexedDb: IDBFactory) {
  let cache = indexedDbSensitiveCaches.get(indexedDb);
  if (!cache) {
    cache = new IndexedDbAgentWalletSensitiveCache(indexedDb);
    indexedDbSensitiveCaches.set(indexedDb, cache);
  }
  return cache;
}

export function clearAgentV2WalletSensitiveProtocolState(indexedDbFactory?: IDBFactory) {
  const factory = indexedDbFactory
    ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  if (!factory) return Promise.resolve();
  return getIndexedDbAgentWalletSensitiveCache(factory).clearProtocolState();
}

function migrateSensitiveCache(openRequest: IDBOpenDBRequest, oldVersion: number) {
  const database = openRequest.result;
  const transaction = openRequest.transaction!;
  const hasLegacyEntryStore = database.objectStoreNames.contains(LEGACY_ENTRY_STORE);
  if (!database.objectStoreNames.contains(AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE)) {
    database.createObjectStore(AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE);
  }
  if (!database.objectStoreNames.contains(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE)) {
    database.createObjectStore(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE);
  }
  if (!database.objectStoreNames.contains(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE)) {
    database.createObjectStore(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE);
  }
  const keyStore = transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_KEY_STORE);
  if (oldVersion < 2) {
    keyStore.delete(LEGACY_KEY_ID);
    if (hasLegacyEntryStore) database.deleteObjectStore(LEGACY_ENTRY_STORE);
  }
  if (oldVersion < 3) {
    keyStore.delete(LEGACY_CONTINUITY_KEY_ID);
    transaction.objectStore(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE).clear();
    if (database.objectStoreNames.contains(LEGACY_PAGINATION_STORE)) {
      database.deleteObjectStore(LEGACY_PAGINATION_STORE);
    }
  }
}

async function generateCryptoKey(
  webCrypto: Crypto,
  algorithm: AesKeyGenParams,
  usages: KeyUsage[],
) {
  const key = await webCrypto.subtle.generateKey(algorithm, false, usages);
  if (!('type' in key)) throw new Error('Agent sensitive cache requires a symmetric key');
  return key;
}

function isValidEntry(entry: AgentWalletSensitiveCacheEntry) {
  return typeof entry.id === 'string'
    && typeof entry.formatVersion === 'string'
    && Number.isFinite(entry.createdAt)
    && Number.isFinite(entry.expiresAt)
    && Number.isFinite(entry.lastAccessedAt)
    && Number.isSafeInteger(entry.size)
    && entry.size >= 0;
}

function expectedFormatVersion(store: AgentWalletSensitiveCacheStore) {
  return store === AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE
    ? AGENT_WALLET_CONTEXT_CACHE_FORMAT
    : AGENT_WALLET_SCOPE_CACHE_FORMAT;
}

function cacheEntryKey(candidate: {
  entry: AgentWalletSensitiveCacheEntry;
  store: AgentWalletSensitiveCacheStore;
}) {
  return `${candidate.store}\0${candidate.entry.id}`;
}

function compareCacheEntries(
  left: { entry: AgentWalletSensitiveCacheEntry; store: AgentWalletSensitiveCacheStore },
  right: { entry: AgentWalletSensitiveCacheEntry; store: AgentWalletSensitiveCacheStore },
) {
  return right.entry.lastAccessedAt - left.entry.lastAccessedAt
    || right.entry.createdAt - left.entry.createdAt
    || cacheEntryKey(left).localeCompare(cacheEntryKey(right), 'en-US');
}

function request<T = undefined>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('Agent sensitive-cache request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Agent sensitive-cache transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Agent sensitive-cache transaction failed'));
  });
}
