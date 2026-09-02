import type { AgentV2HostContextSnapshot } from './types';

type AgentV2Platform = AgentV2HostContextSnapshot['platform'];

export function supportsAgentV2StakingAction(platform?: AgentV2Platform) {
  return platform === 'classic' || platform === 'ios';
}

export function supportsAgentV2SwapAction(platform?: AgentV2Platform) {
  return platform === 'classic' || platform === 'ios';
}
