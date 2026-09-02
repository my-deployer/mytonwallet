import { getIsSupportedChain } from './chain';

describe('getIsSupportedChain', () => {
  it('recognizes configured chains in the legacy browser baseline', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn')!;
    Object.defineProperty(Object, 'hasOwn', { ...descriptor, value: undefined });

    try {
      expect(getIsSupportedChain('ton')).toBe(true);
      expect(getIsSupportedChain('robinhood')).toBe(true);
      expect(getIsSupportedChain('bitcoin')).toBe(false);
      expect(getIsSupportedChain('constructor')).toBe(false);
    } finally {
      Object.defineProperty(Object, 'hasOwn', descriptor);
    }
  });
});
