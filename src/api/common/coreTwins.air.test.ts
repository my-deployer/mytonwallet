import type { ApiAccountAny } from '../types';

jest.mock('../storages', () => ({
  storage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

// Force the Gram Air flavor: native storage never held auto-mirrored twins, while a user may have deliberately
// added the same mnemonic on both networks - so `purgeCoreTwins` must gate out entirely and touch nothing.
jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  IS_GRAM_WALLET: true,
  IS_AIR_APP: true,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { storage } = require('../storages') as {
  storage: { getItem: jest.Mock; setItem: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { purgeCoreTwins } = require('./coreTwins') as typeof import('./coreTwins');

function tonAccount(publicKey: string): ApiAccountAny {
  return {
    type: 'ton',
    mnemonicEncrypted: `enc-${publicKey}`,
    byChain: { ton: { address: `addr-${publicKey}`, publicKey, index: 0, version: 'v4R2' } },
  } as ApiAccountAny;
}

describe('purgeCoreTwins on the Gram Air build', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns early without purging and without setting the marker', async () => {
    const db: Record<string, any> = {
      accounts: { '0-ton-mainnet': tonAccount('P'), '0-ton-testnet': tonAccount('P') },
    };
    storage.getItem.mockImplementation((key: string) => db[key]);
    storage.setItem.mockImplementation((key: string, value: any) => {
      db[key] = value;
    });
    const onUpdate = jest.fn();

    await purgeCoreTwins(onUpdate);

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(Object.keys(db.accounts)).toEqual(['0-ton-mainnet', '0-ton-testnet']);
    expect(db.coreTwinsPurged).toBeUndefined();
  });
});
