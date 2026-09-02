import './agentV2';

import type { ApiUpdateAgentV2PortfolioHistory } from '../../../api/agentV2/types';
import type { GlobalState } from '../../types';

import { addActionHandler, setGlobal } from '../../index';

jest.mock('../../../util/agentV2Updates', () => ({
  publishAgentV2Update: jest.fn(),
}));
jest.mock('../../index', () => ({
  addActionHandler: jest.fn(),
  setGlobal: jest.fn(),
}));

type ApiUpdateHandler = (
  global: GlobalState,
  actions: AnyLiteral,
  update: ApiUpdateAgentV2PortfolioHistory,
) => void;

const FRESH_HISTORY = {
  status: 'ok',
  base: 'usd',
  density: '1d',
  datasets: [{
    assetId: 1,
    symbol: 'TON',
    contractAddress: '',
    points: [[1_752_796_800, 100] as [number, number]],
  }],
};

describe('Agent V2 Portfolio history api update', () => {
  beforeEach(() => {
    (setGlobal as jest.Mock).mockClear();
  });

  it('merges accepted net-worth history without changing Portfolio UI state', () => {
    const global = portfolioGlobal(10);

    getApiUpdateHandler()(global, {}, update(11));

    const [nextGlobal] = (setGlobal as jest.Mock).mock.calls.at(-1)! as [GlobalState];
    expect(nextGlobal.portfolio).toMatchObject({
      activeRange: '3M',
      isLoading: true,
      isRefreshing: true,
      error: 'Existing error',
      historyByAccountId: {
        account: {
          USD: {
            '1D': {
              fetchedAtSlot: 11,
              netWorth: FRESH_HISTORY,
              pnl: { status: 'ok' },
            },
          },
        },
      },
    });
  });

  it('does not overwrite a newer cache slot', () => {
    const global = portfolioGlobal(12);

    getApiUpdateHandler()(global, {}, update(11));

    expect(setGlobal).not.toHaveBeenCalled();
  });
});

function getApiUpdateHandler() {
  const call = (addActionHandler as jest.Mock).mock.calls.find(([name]) => name === 'apiUpdate');
  return call![1] as ApiUpdateHandler;
}

function update(fetchedAtSlot: number): ApiUpdateAgentV2PortfolioHistory {
  return {
    type: 'agentV2PortfolioHistory',
    accountId: 'account',
    baseCurrency: 'USD',
    range: '1D',
    fetchedAtSlot,
    netWorth: FRESH_HISTORY,
  };
}

function portfolioGlobal(fetchedAtSlot: number): GlobalState {
  return {
    portfolio: {
      activeRange: '3M',
      isLoading: true,
      isRefreshing: true,
      error: 'Existing error',
      historyByAccountId: {
        account: {
          USD: {
            '1D': {
              fetchedAtSlot,
              netWorth: {
                status: 'old',
                base: 'usd',
                density: '1d',
                datasets: [],
              },
              pnl: { status: 'ok' },
            },
          },
        },
      },
    },
  } as unknown as GlobalState;
}
