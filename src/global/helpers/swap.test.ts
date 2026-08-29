import type { GlobalState } from '../types';
import { SwapInputSource } from '../types';

import { getSwapEstimateInputKey, isSwapEstimateInputEqual } from './swap';

type CurrentSwap = GlobalState['currentSwap'];

function makeCurrentSwap(overrides: Partial<CurrentSwap> = {}) {
  return {
    slippage: 5,
    tokenInSlug: 'toncoin',
    tokenOutSlug: 'ton-eqavlwfdxg',
    amountIn: '10',
    amountOut: '20',
    inputSource: SwapInputSource.In,
    ...overrides,
  } as CurrentSwap;
}

function makeGlobal(overrides: Partial<CurrentSwap> = {}) {
  return { currentSwap: makeCurrentSwap(overrides) } as GlobalState;
}

describe('getSwapEstimateInputKey', () => {
  it('matches states that ask the same question', () => {
    expect(getSwapEstimateInputKey(makeCurrentSwap()))
      .toBe(getSwapEstimateInputKey(makeCurrentSwap()));
  });

  it.each<[string, Partial<CurrentSwap>]>([
    ['token in', { tokenInSlug: 'tron-usdt' }],
    ['token out', { tokenOutSlug: 'tron-usdt' }],
    ['slippage', { slippage: 1 }],
    ['input source', { inputSource: SwapInputSource.Out }],
    ['maximum toggle', { isMaxAmount: true }],
    ['active amount', { amountIn: '11' }],
  ])('separates states differing by %s', (_name, overrides) => {
    expect(getSwapEstimateInputKey(makeCurrentSwap(overrides)))
      .not.toBe(getSwapEstimateInputKey(makeCurrentSwap()));
  });

  it('ignores the amount the estimate produced', () => {
    expect(getSwapEstimateInputKey(makeCurrentSwap({ amountOut: '21' })))
      .toBe(getSwapEstimateInputKey(makeCurrentSwap()));
  });

  it('ignores the sold amount when the backend resolves it', () => {
    expect(getSwapEstimateInputKey(makeCurrentSwap({ isMaxAmount: true, amountIn: '11' })))
      .toBe(getSwapEstimateInputKey(makeCurrentSwap({ isMaxAmount: true })));
  });

  it('tells an absent field from an empty one', () => {
    expect(getSwapEstimateInputKey(makeCurrentSwap({ tokenInSlug: undefined })))
      .not.toBe(getSwapEstimateInputKey(makeCurrentSwap({ tokenInSlug: '' })));
  });
});

describe('isSwapEstimateInputEqual', () => {
  it('accepts an estimate made for the same input', () => {
    expect(isSwapEstimateInputEqual(makeGlobal(), makeGlobal({ amountOut: '21' }))).toBe(true);
  });

  it('rejects an estimate made for a different slippage', () => {
    expect(isSwapEstimateInputEqual(makeGlobal(), makeGlobal({ slippage: 1 }))).toBe(false);
  });
});
