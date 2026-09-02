import type { AgentWalletSensitiveStorage } from './walletSensitiveStorage';

import {
  AGENT_WALLET_SCOPE_CACHE_FORMAT,
  getOrCreateAgentWalletAuthorityKey,
} from './walletSensitiveCache';
import { IndexedDbAgentWalletSensitiveStorage } from './walletSensitiveStorage';

const SCOPE_PREFIX = 'scope_';
const REFERENCE_BYTES = 24;
const IV_BYTES = 12;
const TTL_MS = 15 * 60_000;

export interface AgentWalletScopeBinding {
  accountDigest: string;
  accountScope: 'current' | 'selected' | 'explicitAll';
  activeAccountRef: string;
  deviceId: string;
  messageId: string;
  profileDigest: string;
  queryDigest: string;
  revision: number;
  sessionId: string;
  threadId: string;
}

interface StoredScopePayload {
  version: 2;
  binding: AgentWalletScopeBinding;
  accountRef: string;
  label: string;
  expiresAt: number;
}

export interface AgentWalletScopeStore {
  clear(): Promise<void>;
  issue(binding: AgentWalletScopeBinding, accountRef: string, label: string): Promise<string>;
  resolve(
    scopeAnchor: string,
    binding: AgentWalletScopeBinding,
    label: string,
  ): Promise<{ accountRef: string; label: string }>;
}

export class EncryptedAgentWalletScopeStore implements AgentWalletScopeStore {
  constructor(
    private readonly storage: AgentWalletSensitiveStorage,
    private readonly now: () => number = Date.now,
    private readonly webCrypto: Crypto = crypto,
  ) {}

  async issue(binding: AgentWalletScopeBinding, accountRef: string, label: string) {
    const scopeAnchor = `${SCOPE_PREFIX}${toBase64Url(
      this.webCrypto.getRandomValues(new Uint8Array(REFERENCE_BYTES)),
    )}`;
    const payload: StoredScopePayload = {
      version: 2,
      binding,
      accountRef,
      label,
      expiresAt: this.now() + TTL_MS,
    };
    await this.write(scopeAnchor, payload);
    if (!await this.storage.getEntry(scopeAnchor)) throw new WalletScopeError('scope_expired');
    return scopeAnchor;
  }

  async resolve(scopeAnchor: string, binding: AgentWalletScopeBinding, label: string) {
    if (!/^scope_[A-Za-z0-9_-]{32}$/u.test(scopeAnchor)) throw new WalletScopeError('scope_invalid');
    const entry = await this.storage.getEntry(scopeAnchor);
    if (!entry) throw new WalletScopeError('scope_invalid');
    if (entry.expiresAt <= this.now()) {
      await this.storage.deleteEntry(scopeAnchor);
      throw new WalletScopeError('scope_expired');
    }
    try {
      const key = await this.getOrCreateKey();
      const plaintext = await this.webCrypto.subtle.decrypt({
        name: 'AES-GCM', iv: entry.iv, additionalData: utf8(scopeAnchor),
      }, key, entry.ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as StoredScopePayload;
      if (
        payload.version !== 2
        || payload.expiresAt <= this.now()
        || canonicalBinding(payload.binding) !== canonicalBinding(binding)
        || normalizeLabel(payload.label) !== normalizeLabel(label)
      ) throw new WalletScopeError('scope_invalid');
      await this.storage.putEntry({ ...entry, lastAccessedAt: this.now() });
      return { accountRef: payload.accountRef, label: payload.label };
    } catch (error) {
      if (error instanceof WalletScopeError) throw error;
      await this.storage.deleteEntry(scopeAnchor);
      throw new WalletScopeError('scope_invalid');
    }
  }

  async clear() {
    const entries = await this.storage.listEntries();
    await Promise.all(entries.map(({ id }) => this.storage.deleteEntry(id)));
  }

  private async write(scopeAnchor: string, payload: StoredScopePayload) {
    const key = await this.getOrCreateKey();
    const iv = this.webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = utf8(JSON.stringify(payload));
    const ciphertext = new Uint8Array(await this.webCrypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: utf8(scopeAnchor),
    }, key, plaintext));
    const currentTime = this.now();
    await this.storage.putEntryAndPrune({
      id: scopeAnchor,
      createdAt: currentTime,
      expiresAt: payload.expiresAt,
      formatVersion: AGENT_WALLET_SCOPE_CACHE_FORMAT,
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

export class WalletScopeError extends Error {
  constructor(readonly code: 'scope_invalid' | 'scope_expired') {
    super(code);
  }
}

export function createAgentWalletScopeStore(now: () => number = Date.now) {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  return new EncryptedAgentWalletScopeStore(
    new IndexedDbAgentWalletSensitiveStorage(), now, crypto,
  );
}

function canonicalBinding(binding: AgentWalletScopeBinding) {
  return JSON.stringify([
    binding.accountDigest,
    binding.accountScope,
    binding.activeAccountRef,
    binding.deviceId,
    binding.messageId,
    binding.profileDigest,
    binding.queryDigest,
    binding.revision,
    binding.sessionId,
    binding.threadId,
  ]);
}

function normalizeLabel(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
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
