import type { AgentProtocolVersion } from './agentOverride';

import { AGENT_OVERRIDE } from '../../config';
import { IS_WEB } from '../windowEnvironment';
import { parseAgentProtocolVersion, resolveAgentProtocolVersion } from './agentOverride';

const AGENT_PROTOCOL_QUERY_PARAMETER = 'agent';
const AGENT_PROTOCOL_STORAGE_KEY = 'agentProtocolVersion';

let agentOverride = AGENT_OVERRIDE;
let backendVersion: AgentProtocolVersion | undefined;
const listeners = new Set<(version: AgentProtocolVersion) => void>();

export function initAgentProtocolVersion() {
  agentOverride = AGENT_OVERRIDE;
  backendVersion = undefined;

  if (!IS_WEB || agentOverride !== 'no_override') return;

  const url = new URL(window.location.href);
  const queryVersion = parseAgentProtocolVersion(url.searchParams.get(AGENT_PROTOCOL_QUERY_PARAMETER));
  if (queryVersion) {
    localStorage.setItem(AGENT_PROTOCOL_STORAGE_KEY, queryVersion);
    agentOverride = queryVersion;
    url.searchParams.delete(AGENT_PROTOCOL_QUERY_PARAMETER);
    window.history.replaceState(window.history.state, '', url.toString());
    return;
  }

  const storedVersion = parseAgentProtocolVersion(localStorage.getItem(AGENT_PROTOCOL_STORAGE_KEY));
  if (storedVersion) {
    agentOverride = storedVersion;
  }
}

export function getAgentOverride() {
  return agentOverride;
}

export function getAgentProtocolVersion() {
  return resolveAgentProtocolVersion(agentOverride, backendVersion);
}

export function setBackendAgentProtocolVersion(version?: AgentProtocolVersion) {
  const previousVersion = getAgentProtocolVersion();
  backendVersion = version;
  const nextVersion = getAgentProtocolVersion();
  if (nextVersion === previousVersion) return;

  listeners.forEach((listener) => listener(nextVersion));
}

export function addAgentProtocolVersionListener(listener: (version: AgentProtocolVersion) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
