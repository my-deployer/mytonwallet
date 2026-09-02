import type { ApiUpdateAgentV2PortfolioHistory } from '../../../api/agentV2/types';
import type { GlobalState } from '../../types';

import { publishAgentV2Update } from '../../../util/agentV2Updates';
import { areDeepEqual } from '../../../util/areDeepEqual';
import { addActionHandler, setGlobal } from '../../index';
import { updateHistoryBundle, updatePortfolio } from '../../reducers';

addActionHandler('apiUpdate', (global, actions, update) => {
  if (update.type === 'agentV2') {
    publishAgentV2Update(update.update);
    return;
  }
  if (update.type !== 'agentV2PortfolioHistory') return;
  applyPortfolioHistoryUpdate(global, update);
});

function applyPortfolioHistoryUpdate(
  global: GlobalState,
  update: ApiUpdateAgentV2PortfolioHistory,
) {
  const historyByAccountId = global.portfolio?.historyByAccountId ?? {};
  const existing = historyByAccountId[update.accountId]?.[update.baseCurrency]?.[update.range];
  if ((existing?.fetchedAtSlot ?? -Infinity) > update.fetchedAtSlot) return;

  const nextBundle = {
    ...existing,
    netWorth: update.netWorth,
    fetchedAtSlot: update.fetchedAtSlot,
  };
  if (existing && areDeepEqual(existing, nextBundle)) return;

  setGlobal(updatePortfolio(global, {
    historyByAccountId: updateHistoryBundle(
      historyByAccountId,
      update.accountId,
      update.baseCurrency,
      update.range,
      nextBundle,
    ),
  }));
}
