import { canonicalTransactionSourceRowId, canonicalWalletQueryRowId } from './walletQueryRowId';

describe('wallet query row ids', () => {
  it('creates stable bounded identifiers without exposing source identity', () => {
    const source = 'private-account\0EQ-private-wallet-address';
    const first = canonicalWalletQueryRowId('position', source);

    expect(first).toBe(canonicalWalletQueryRowId('position', source));
    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
    expect(first).not.toContain('private');
    expect(first).not.toContain('EQ-');
    expect(first).not.toBe(canonicalWalletQueryRowId('contact', source));
  });

  it('binds transaction rows to both account and activity identity', () => {
    const activityId = `${'a'.repeat(64)}:0`;
    const first = canonicalTransactionSourceRowId('account_one', activityId);

    expect(first).toBe(canonicalTransactionSourceRowId('account_one', activityId));
    expect(first).not.toBe(canonicalTransactionSourceRowId('account_two', activityId));
    expect(first).not.toContain('a'.repeat(16));
  });
});
