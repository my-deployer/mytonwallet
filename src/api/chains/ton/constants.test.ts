import { KnownContracts } from './constants';

// `getContractInfo` picks the first entry whose `hash` or `oldHash` matches the code on chain, so a hash
// shared by two entries would make the match depend on object order, and a hash of the wrong length
// can never match anything and silently leaves the contract unknown.
describe('KnownContracts', () => {
  const entries = Object.values(KnownContracts);

  it('keys every entry by its own name', () => {
    for (const [key, info] of Object.entries(KnownContracts)) {
      expect(info.name).toBe(key);
    }
  });

  it('stores every hash as 32 bytes of lowercase hex', () => {
    for (const info of entries) {
      for (const hash of [info.hash, info.oldHash]) {
        if (hash !== undefined) {
          expect(hash).toMatch(/^[0-9a-f]{64}$/);
        }
      }
      expect(info.hash ?? info.oldHash).toBeDefined();
    }
  });

  it('never lets two entries claim the same code', () => {
    const seen = new Map<string, string>();
    for (const info of entries) {
      for (const hash of [info.hash, info.oldHash]) {
        if (hash === undefined) continue;
        expect(seen.get(hash)).toBeUndefined();
        seen.set(hash, info.name);
      }
    }
  });
});
