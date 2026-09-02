import type { AgentWalletConversationContextV5 } from './protocol/types';
import type {
  AgentWalletSensitiveCacheEntry,
  AgentWalletSensitiveCacheKeyStorage,
} from './walletSensitiveCache';

import {
  AGENT_WALLET_CONTEXT_CACHE_FORMAT,
  AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
  getIndexedDbAgentWalletSensitiveCache,
  getOrCreateAgentWalletAuthorityKey,
} from './walletSensitiveCache';

const CACHE_TTL_MS = 30 * 60_000;
const IV_BYTES = 12;

export interface AgentV2WalletContextCacheBinding {
  accountDigest: string;
  profileDigest: string;
  deviceId: string;
  messageId: string;
  revision: number;
  sessionId: string;
  threadId: string;
}

export type EncryptedWalletContextEntry = AgentWalletSensitiveCacheEntry;

interface EncryptedWalletContextPayload {
  version: 3;
  binding: AgentV2WalletContextCacheBinding;
  raw: unknown;
}

export interface AgentV2WalletContextCacheStorage extends AgentWalletSensitiveCacheKeyStorage {
  clearContexts(): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  getEntry(id: string): Promise<EncryptedWalletContextEntry | undefined>;
  putEntry(entry: EncryptedWalletContextEntry): Promise<void>;
  putEntryAndPrune(
    entry: EncryptedWalletContextEntry,
    currentTime: number,
  ): Promise<void>;
}

export interface AgentV2WalletConversationContextCache {
  clear(): Promise<void>;
  delete(binding: AgentV2WalletContextCacheBinding): Promise<void>;
  get(binding: AgentV2WalletContextCacheBinding): Promise<AgentWalletConversationContextV5 | undefined>;
  put(binding: AgentV2WalletContextCacheBinding, context: AgentWalletConversationContextV5): Promise<void>;
}

export class EncryptedAgentV2WalletConversationContextCache implements AgentV2WalletConversationContextCache {
  constructor(
    private readonly storage: AgentV2WalletContextCacheStorage,
    private readonly validateContext: (value: unknown) => AgentWalletConversationContextV5,
    private readonly now: () => number = Date.now,
    private readonly webCrypto: Crypto = crypto,
  ) {}

  clear() {
    return this.storage.clearContexts();
  }

  async delete(binding: AgentV2WalletContextCacheBinding) {
    await this.storage.deleteEntry(await bindingId(binding, this.webCrypto));
  }

  async get(binding: AgentV2WalletContextCacheBinding) {
    const id = await bindingId(binding, this.webCrypto);
    const entry = await this.storage.getEntry(id);
    if (!entry) return undefined;
    const currentTime = this.now();
    if (entry.expiresAt <= currentTime || entry.formatVersion !== AGENT_WALLET_CONTEXT_CACHE_FORMAT) {
      await this.storage.deleteEntry(id);
      return undefined;
    }
    try {
      const key = await this.getOrCreateKey();
      const plaintext = await this.webCrypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: entry.iv,
        additionalData: utf8(id),
      }, key, entry.ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as EncryptedWalletContextPayload;
      if (payload.version !== 3 || canonicalBinding(payload.binding) !== canonicalBinding(binding)) {
        throw new Error('Agent wallet-context cache binding mismatch');
      }
      const context = this.validateContext(payload.raw);
      if (context.sourceAssistantMessageId !== binding.messageId) {
        throw new Error('Agent wallet-context message mismatch');
      }
      await this.storage.putEntry({ ...entry, lastAccessedAt: currentTime });
      return context;
    } catch {
      await this.storage.deleteEntry(id);
      return undefined;
    }
  }

  async put(binding: AgentV2WalletContextCacheBinding, value: AgentWalletConversationContextV5) {
    const context = this.validateContext(value);
    if (
      context.sourceAssistantMessageId !== binding.messageId
      || context.sessionId !== binding.sessionId
      || context.revision !== binding.revision
    ) throw new Error('Agent wallet-context cache authority mismatch');
    const id = await bindingId(binding, this.webCrypto);
    const key = await this.getOrCreateKey();
    const iv = this.webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = utf8(JSON.stringify({
      version: 3,
      binding,
      raw: context,
    } satisfies EncryptedWalletContextPayload));
    const ciphertext = new Uint8Array(await this.webCrypto.subtle.encrypt({
      name: 'AES-GCM',
      iv,
      additionalData: utf8(id),
    }, key, plaintext));
    const currentTime = this.now();
    await this.storage.putEntryAndPrune({
      id,
      createdAt: currentTime,
      expiresAt: Math.min(Date.parse(context.expiresAt), currentTime + CACHE_TTL_MS),
      formatVersion: AGENT_WALLET_CONTEXT_CACHE_FORMAT,
      lastAccessedAt: currentTime,
      size: ciphertext.byteLength + iv.byteLength,
      iv,
      ciphertext,
    }, currentTime);
  }

  private async getOrCreateKey() {
    return getOrCreateAgentWalletAuthorityKey(this.storage, this.webCrypto);
  }
}

export class IndexedDbAgentV2WalletContextCacheStorage implements AgentV2WalletContextCacheStorage {
  private readonly cache = getIndexedDbAgentWalletSensitiveCache(indexedDB);

  clearContexts() {
    return this.cache.clearStore(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE);
  }

  deleteEntry(id: string) {
    return this.cache.deleteEntry(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE, id);
  }

  getEntry(id: string) {
    return this.cache.getEntry<EncryptedWalletContextEntry>(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE, id);
  }

  getOrCreateKey(keyId: string, generate: () => Promise<CryptoKey>) {
    return this.cache.getOrCreateKey(keyId, generate);
  }

  putEntry(entry: EncryptedWalletContextEntry) {
    return this.cache.putEntry(AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE, entry);
  }

  putEntryAndPrune(entry: EncryptedWalletContextEntry, currentTime: number) {
    return this.cache.putEntryAndPrune(
      AGENT_WALLET_SENSITIVE_CACHE_CONTEXT_STORE,
      entry,
      currentTime,
    );
  }
}

export function createAgentV2WalletConversationContextCache(
  validateContext: (value: unknown) => AgentWalletConversationContextV5,
  now: () => number = Date.now,
): AgentV2WalletConversationContextCache | undefined {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  return new EncryptedAgentV2WalletConversationContextCache(
    new IndexedDbAgentV2WalletContextCacheStorage(),
    validateContext,
    now,
    crypto,
  );
}

async function bindingId(binding: AgentV2WalletContextCacheBinding, webCrypto: Crypto) {
  const digest = await webCrypto.subtle.digest('SHA-256', utf8(canonicalBinding(binding)));
  return toBase64Url(new Uint8Array(digest));
}

function canonicalBinding(binding: AgentV2WalletContextCacheBinding) {
  return JSON.stringify([
    binding.accountDigest,
    binding.profileDigest,
    binding.deviceId,
    binding.threadId,
    binding.messageId,
    binding.sessionId,
    binding.revision,
  ]);
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}
