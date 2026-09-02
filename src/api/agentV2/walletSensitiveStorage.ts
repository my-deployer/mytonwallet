import type {
  AgentWalletSensitiveCacheEntry,
  AgentWalletSensitiveCacheKeyStorage,
} from './walletSensitiveCache';

import {
  AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
  getIndexedDbAgentWalletSensitiveCache,
} from './walletSensitiveCache';

export type AgentWalletSensitiveStorageEntry = AgentWalletSensitiveCacheEntry;

export interface AgentWalletSensitiveStorage extends AgentWalletSensitiveCacheKeyStorage {
  deleteEntry(id: string): Promise<void>;
  getEntry(id: string): Promise<AgentWalletSensitiveStorageEntry | undefined>;
  listEntries(): Promise<AgentWalletSensitiveStorageEntry[]>;
  putEntry(entry: AgentWalletSensitiveStorageEntry): Promise<void>;
  putEntryAndPrune(
    entry: AgentWalletSensitiveStorageEntry,
    currentTime: number,
  ): Promise<void>;
}

export class IndexedDbAgentWalletSensitiveStorage implements AgentWalletSensitiveStorage {
  private readonly cache = getIndexedDbAgentWalletSensitiveCache(indexedDB);

  deleteEntry(id: string) {
    return this.cache.deleteEntry(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE, id);
  }

  getEntry(id: string) {
    return this.cache.getEntry<AgentWalletSensitiveStorageEntry>(
      AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
      id,
    );
  }

  listEntries() {
    return this.cache.listEntries<AgentWalletSensitiveStorageEntry>(
      AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
    );
  }

  putEntry(entry: AgentWalletSensitiveStorageEntry) {
    return this.cache.putEntry(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE, entry);
  }

  putEntryAndPrune(entry: AgentWalletSensitiveStorageEntry, currentTime: number) {
    return this.cache.putEntryAndPrune(
      AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
      entry,
      currentTime,
    );
  }

  getOrCreateKey(keyId: string, generate: () => Promise<CryptoKey>) {
    return this.cache.getOrCreateKey(keyId, generate);
  }
}
