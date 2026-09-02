import type { AgentToolCapability, AgentToolName, AgentToolScope } from './types';

export interface AgentV2ToolContractMetadata {
  maxResultBytes: number;
  name: AgentToolName;
  scopes: [AgentToolScope];
  timeoutMs: number;
  version: AgentToolCapability['version'];
}

export const AGENT_V2_TOOL_CONTRACTS: readonly AgentV2ToolContractMetadata[] = [
  tool('wallet.data.query', 'wallet.data.read', 5),
  tool('wallet.directory.query', 'wallet.directory.read'),
  tool('action.send.prepare', 'action.send.prepare'),
  tool('action.swap.prepare', 'action.swap.prepare'),
  tool('market.asset.quote', 'market.data.read'),
  tool('staking.offer.read', 'staking.data.read'),
  tool('staking.offers.list', 'staking.data.read'),
];

function tool(
  name: AgentToolName,
  scope: AgentToolScope,
  version: AgentToolCapability['version'] = 1,
): AgentV2ToolContractMetadata {
  return {
    name,
    version,
    scopes: [scope],
    maxResultBytes: name === 'wallet.directory.query'
      ? 32_768
      : name === 'market.asset.quote' || name.startsWith('staking.') || name === 'action.swap.prepare'
        ? 16_384
        : 98_304,
    timeoutMs: name === 'wallet.data.query' || name === 'wallet.directory.query'
      ? 30_000
      : name === 'market.asset.quote'
        ? 5_000
        : 15_000,
  };
}
