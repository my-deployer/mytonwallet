import { webcrypto } from 'node:crypto';

import type {
  AgentWalletSensitiveStorage,
  AgentWalletSensitiveStorageEntry,
} from './walletSensitiveStorage';

import { EncryptedAgentV2SendDraftStore } from './sendDraftStore';

const DRAFT_ID = '99999999-9999-4999-8999-999999999999';

describe('encrypted Agent V2 send-draft store', () => {
  it('encrypts review authority and restores a live draft', async () => {
    const storage = new MemorySensitiveStorage();
    const store = new EncryptedAgentV2SendDraftStore(
      storage, () => 1_000, webcrypto as unknown as Crypto,
    );
    const draft = sendDraft(11_000);

    await store.put(draft);

    const rawEntries = JSON.stringify([...storage.entries.values()]);
    expect(rawEntries).not.toContain(draft.review.toAddress);
    expect(rawEntries).not.toContain(draft.authorityBinding);
    expect([...storage.entries.keys()]).toEqual([`send_draft_${DRAFT_ID}`]);
    await expect(store.get(DRAFT_ID)).resolves.toEqual(draft);
    await expect(webcrypto.subtle.exportKey('raw', storage.key!)).rejects.toThrow();
  });

  it('deletes expired and tampered drafts', async () => {
    let now = 1_000;
    const storage = new MemorySensitiveStorage();
    const store = new EncryptedAgentV2SendDraftStore(
      storage, () => now, webcrypto as unknown as Crypto,
    );
    await store.put(sendDraft(2_000));
    now = 2_000;

    await expect(store.get(DRAFT_ID)).resolves.toBeUndefined();
    expect(storage.entries).toEqual(new Map());

    now = 1_000;
    await store.put(sendDraft(2_000));
    const entry = storage.entries.get(`send_draft_${DRAFT_ID}`)!;
    entry.ciphertext[0] ^= 1;
    await expect(store.get(DRAFT_ID)).resolves.toBeUndefined();
    expect(storage.entries).toEqual(new Map());
  });

  it('clears only send drafts from the shared sensitive store', async () => {
    const storage = new MemorySensitiveStorage();
    const store = new EncryptedAgentV2SendDraftStore(
      storage, () => 1_000, webcrypto as unknown as Crypto,
    );
    await store.put(sendDraft(2_000));
    storage.entries.set('scope_anchor', {
      ...storage.entries.get(`send_draft_${DRAFT_ID}`)!,
      id: 'scope_anchor',
    });

    await store.clear();

    expect([...storage.entries.keys()]).toEqual(['scope_anchor']);
  });
});

function sendDraft(expiresAt: number) {
  return {
    draftId: DRAFT_ID,
    threadId: '22222222-2222-4222-8222-222222222222',
    accountId: 'account-main',
    actionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceToolCallId: '44444444-4444-4444-8444-444444444444',
    expiresAt,
    authorityBinding: 'private-authority',
    sessionId: '11111111-1111-4111-8111-111111111111',
    revision: 7,
    accountRef: 'account_private',
    network: 'ton',
    assistantMessageId: '33333333-3333-4333-8333-333333333333',
    presentation: {
      kind: 'send' as const,
      status: 'active' as const,
      amount: { value: '1', symbol: 'TON' },
      network: 'ton',
      accountLabel: 'Main',
      recipient: { kind: 'external' as const },
      feeStatus: 'calculated_in_wallet' as const,
      warningCodes: [],
      expiresAt: new Date(expiresAt).toISOString(),
    },
    review: {
      tokenSlug: 'toncoin',
      amountAtomic: '1000000000',
      toAddress: 'EQ-private-recipient',
    },
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
    this.key ??= await generate();
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
