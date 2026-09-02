import { IDBFactory } from 'fake-indexeddb';
import { deserialize, serialize } from 'node:v8';

import type { Storage } from '../storages/types';

import { clearAgentV2PersistentState } from './persistentState';
import {
  AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
  AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE,
  getIndexedDbAgentWalletSensitiveCache,
} from './walletSensitiveCache';

const WALLET_SESSION_STORAGE_KEY = 'agentV2WalletSession';

describe('Agent V2 persistent state', () => {
  it('clears account-bound state without an active runtime', async () => {
    await runWithStructuredClone(async () => {
      const storage = createMemoryStorage({
        agentV2DeviceIdentity: 'identity',
        agentV2Consent: 'consent',
        agentV2WalletProtocolVersion: '5',
      });
      const indexedDb = new IDBFactory();
      const sensitiveCache = getIndexedDbAgentWalletSensitiveCache(indexedDb);
      const entry = {
        id: 'private-entry',
        createdAt: 1,
        expiresAt: 2,
        formatVersion: 'test',
        lastAccessedAt: 1,
        size: 2,
        iv: new Uint8Array([1]),
        ciphertext: new Uint8Array([2]),
      };
      await Promise.all([
        sensitiveCache.putEntry(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE, entry),
        sensitiveCache.putEntry(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE, entry),
      ]);
      sessionStorage.setItem(WALLET_SESSION_STORAGE_KEY, 'session');

      await clearAgentV2PersistentState(storage, indexedDb);

      await expect(storage.getItem('agentV2DeviceIdentity')).resolves.toBeUndefined();
      await expect(storage.getItem('agentV2Consent')).resolves.toBeUndefined();
      await expect(storage.getItem('agentV2WalletProtocolVersion')).resolves.toBe('5');
      expect(sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
      await expect(sensitiveCache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE))
        .resolves.toEqual([]);
      await expect(sensitiveCache.listEntries(AGENT_WALLET_SENSITIVE_CACHE_SCOPE_STORE))
        .resolves.toEqual([]);
    });
  });
});

async function runWithStructuredClone(operation: () => Promise<void>) {
  const previousStructuredClone = global.structuredClone;
  Object.defineProperty(global, 'structuredClone', {
    configurable: true,
    value: <T>(value: T): T => deserialize(serialize(value)) as T,
  });
  try {
    await operation();
  } finally {
    Object.defineProperty(global, 'structuredClone', {
      configurable: true,
      value: previousStructuredClone,
    });
  }
}

function createMemoryStorage(initial: Partial<Record<string, unknown>>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (name) => Promise.resolve(values.get(name)),
    setItem: (name, value) => {
      values.set(name, value);
      return Promise.resolve();
    },
    removeItem: (name) => {
      values.delete(name);
      return Promise.resolve();
    },
    clear: () => {
      values.clear();
      return Promise.resolve();
    },
  };
}
