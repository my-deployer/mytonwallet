import type { AgentWalletAccountFilterV1 } from './protocol/types';
import type { AgentV2HostAccount } from './types';

export function matchesPortfolioAccountFilter(
  account: Pick<AgentV2HostAccount, 'isViewOnly'>,
  filter: AgentWalletAccountFilterV1 | undefined,
) {
  if (!filter || filter.viewOnly === 'include') return true;
  return filter.viewOnly === 'only' ? account.isViewOnly : !account.isViewOnly;
}
