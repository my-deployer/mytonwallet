import React, { memo, useEffect, useState } from '../../lib/teact/teact';

import { loadAgentV2Host } from './agentV2RuntimeLoader';
import useAgentProtocolVersion from './useAgentProtocolVersion';

function AgentV2HostContextBridgeRuntime() {
  const agentProtocolVersion = useAgentProtocolVersion();
  const [AgentV2HostContextBridge, setAgentV2HostContextBridge] = useState<
    typeof import('../agentV2/AgentV2HostContextBridge').default
  >();

  useEffect(() => {
    if (agentProtocolVersion === 'v1') return undefined;

    let isActive = true;
    void loadAgentV2Host().then((Component) => {
      if (isActive) setAgentV2HostContextBridge(() => Component);
    });

    return () => {
      isActive = false;
    };
  }, [agentProtocolVersion]);

  return agentProtocolVersion === 'v2' && AgentV2HostContextBridge ? <AgentV2HostContextBridge /> : undefined;
}

export default memo(AgentV2HostContextBridgeRuntime);
