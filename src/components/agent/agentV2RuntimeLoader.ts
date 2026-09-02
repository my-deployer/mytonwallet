type AgentV2ClassicComponent = typeof import('../agentV2/AgentV2Classic').default;
type AgentV2HostComponent = typeof import('../agentV2/AgentV2HostContextBridge').default;

let agentV2ClassicPromise: Promise<AgentV2ClassicComponent> | undefined;
let agentV2HostPromise: Promise<AgentV2HostComponent> | undefined;

export function loadAgentV2Classic() {
  agentV2ClassicPromise ||= loadAgentV2Host().then(() => (
    import(/* webpackChunkName: "agent-v2-ui" */ '../agentV2/AgentV2Classic')
      .then((module) => module.default)
  ));
  return agentV2ClassicPromise;
}

export function loadAgentV2Host() {
  agentV2HostPromise ||= import(
    /* webpackChunkName: "agent-v2-host" */ '../agentV2/AgentV2HostContextBridge',
  ).then((module) => module.default);
  return agentV2HostPromise;
}
