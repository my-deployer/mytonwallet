import type { AgentV2HostContextSnapshot } from './types';

export function buildAgentV2SendAuthorityKey(host?: AgentV2HostContextSnapshot) {
  const activeAccount = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
  const activeNetwork = host?.activeNetwork;
  const activeAddress = activeNetwork ? activeAccount?.addresses[activeNetwork] : undefined;
  if (
    !activeAccount
    || !activeNetwork
    || !activeAddress
    || activeAccount.state !== 'active'
    || activeAccount.isViewOnly
  ) {
    return undefined;
  }

  return JSON.stringify({
    accountId: activeAccount.accountId,
    accountType: activeAccount.accountType,
    network: activeNetwork,
    address: activeAddress,
    chains: [...activeAccount.chains].sort(),
  });
}
