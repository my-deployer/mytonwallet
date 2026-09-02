export type AgentProtocolVersion = 'v1' | 'v2';
export type AgentOverride = 'no_override' | AgentProtocolVersion;

export function parseAgentOverride(value?: string): AgentOverride {
  const override = value ?? 'no_override';
  if (override === 'no_override' || override === 'v1' || override === 'v2') {
    return override;
  }

  throw new Error(`Unsupported AGENT_OVERRIDE value: ${override}`);
}

export function parseAgentProtocolVersion(value: unknown): AgentProtocolVersion | undefined {
  return value === 'v1' || value === 'v2' ? value : undefined;
}

export function resolveAgentProtocolVersion(
  override: AgentOverride,
  backendVersion?: AgentProtocolVersion,
): AgentProtocolVersion {
  return override === 'no_override' ? backendVersion ?? 'v1' : override;
}
