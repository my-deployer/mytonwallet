import type { AgentSwapSelectorV1 } from './protocol/types';
import type { AgentV2HostAsset } from './types';

import { matchAgentMarketQuoteAsset } from './marketQuoteMatcher';

export function matchAgentSwapAsset(
  selector: AgentSwapSelectorV1,
  catalog: readonly AgentV2HostAsset[],
) {
  return matchAgentMarketQuoteAsset(selector, catalog);
}
