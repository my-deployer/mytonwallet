import type { AgentV2ActionPresentation, AgentV2SendReview } from './types';
import type { AgentWalletSensitiveStorage } from './walletSensitiveStorage';

import {
  AGENT_WALLET_SCOPE_CACHE_FORMAT,
  getOrCreateAgentWalletAuthorityKey,
} from './walletSensitiveCache';
import { IndexedDbAgentWalletSensitiveStorage } from './walletSensitiveStorage';

const DRAFT_PREFIX = 'send_draft_';
const IV_BYTES = 12;

export interface AgentV2StoredSendDraft {
  draftId: string;
  threadId: string;
  accountId: string;
  actionId: string;
  sourceToolCallId: string;
  expiresAt: number;
  authorityBinding: string;
  sessionId: string;
  revision: number;
  accountRef: string;
  network: string;
  assistantMessageId?: string;
  presentation: Extract<AgentV2ActionPresentation, { kind: 'send' }>;
  review: AgentV2SendReview;
}

interface StoredSendDraftPayload {
  version: 1;
  draft: AgentV2StoredSendDraft;
}

export interface AgentV2SendDraftStore {
  clear(): Promise<void>;
  delete(draftId: string): Promise<void>;
  get(draftId: string): Promise<AgentV2StoredSendDraft | undefined>;
  put(draft: AgentV2StoredSendDraft): Promise<void>;
}

export class EncryptedAgentV2SendDraftStore implements AgentV2SendDraftStore {
  constructor(
    private readonly storage: AgentWalletSensitiveStorage,
    private readonly now: () => number = Date.now,
    private readonly webCrypto: Crypto = crypto,
  ) {}

  async clear() {
    const entries = await this.storage.listEntries();
    await Promise.all(entries.flatMap(({ id }) => (
      id.startsWith(DRAFT_PREFIX) ? [this.storage.deleteEntry(id)] : []
    )));
  }

  async delete(draftId: string) {
    await this.storage.deleteEntry(getDraftKey(draftId));
  }

  async get(draftId: string) {
    const id = getDraftKey(draftId);
    const entry = await this.storage.getEntry(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now() || entry.formatVersion !== AGENT_WALLET_SCOPE_CACHE_FORMAT) {
      await this.storage.deleteEntry(id);
      return undefined;
    }
    try {
      const key = await getOrCreateAgentWalletAuthorityKey(this.storage, this.webCrypto);
      const plaintext = await this.webCrypto.subtle.decrypt({
        name: 'AES-GCM', iv: entry.iv, additionalData: utf8(id),
      }, key, entry.ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as StoredSendDraftPayload;
      if (
        payload.version !== 1
        || payload.draft.draftId !== draftId
        || !payload.draft.accountId
        || payload.draft.expiresAt !== entry.expiresAt
        || payload.draft.expiresAt <= this.now()
      ) {
        await this.storage.deleteEntry(id);
        return undefined;
      }
      await this.storage.putEntry({ ...entry, lastAccessedAt: this.now() });
      return payload.draft;
    } catch {
      await this.storage.deleteEntry(id);
      return undefined;
    }
  }

  async put(draft: AgentV2StoredSendDraft) {
    const id = getDraftKey(draft.draftId);
    const key = await getOrCreateAgentWalletAuthorityKey(this.storage, this.webCrypto);
    const iv = this.webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = utf8(JSON.stringify({ version: 1, draft } satisfies StoredSendDraftPayload));
    const ciphertext = new Uint8Array(await this.webCrypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: utf8(id),
    }, key, plaintext));
    const currentTime = this.now();
    await this.storage.putEntryAndPrune({
      id,
      createdAt: currentTime,
      expiresAt: draft.expiresAt,
      formatVersion: AGENT_WALLET_SCOPE_CACHE_FORMAT,
      lastAccessedAt: currentTime,
      size: ciphertext.byteLength + iv.byteLength,
      iv,
      ciphertext,
    }, currentTime);
  }
}

export function createAgentV2SendDraftStore(now: () => number = Date.now) {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  return new EncryptedAgentV2SendDraftStore(
    new IndexedDbAgentWalletSensitiveStorage(), now, crypto,
  );
}

function getDraftKey(draftId: string) {
  return `${DRAFT_PREFIX}${draftId}`;
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}
