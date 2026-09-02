import { useEffect, useState } from '../../lib/teact/teact';

import type { AgentProtocolVersion } from '../../util/agent/agentOverride';

import {
  addAgentProtocolVersionListener,
  getAgentProtocolVersion,
} from '../../util/agent/agentProtocolVersion';

export default function useAgentProtocolVersion() {
  const [version, setVersion] = useState<AgentProtocolVersion>(getAgentProtocolVersion());

  useEffect(() => addAgentProtocolVersionListener(setVersion), []);

  return version;
}
