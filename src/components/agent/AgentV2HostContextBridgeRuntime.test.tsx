import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import { pause } from '../../util/schedulers';
import useAgentProtocolVersion from './useAgentProtocolVersion';

import AgentV2HostContextBridge from '../agentV2/AgentV2HostContextBridge';
import AgentV2HostContextBridgeRuntime from './AgentV2HostContextBridgeRuntime';

jest.mock('./useAgentProtocolVersion', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../agentV2/AgentV2HostContextBridge', () => ({
  __esModule: true,
  default: jest.fn(() => 'agent-v2-host-context'),
}));

const AgentV2HostContextBridgeMock = jest.mocked(AgentV2HostContextBridge);
const useAgentProtocolVersionMock = jest.mocked(useAgentProtocolVersion);

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  useAgentProtocolVersionMock.mockReturnValue('v1');
  AgentV2HostContextBridgeMock.mockClear();
});

afterEach(() => {
  TeactDOM.render(undefined, root);
  root.remove();
});

describe('AgentV2HostContextBridgeRuntime', () => {
  it('does not load the host-context bridge when disabled', async () => {
    TeactDOM.render(<AgentV2HostContextBridgeRuntime />, root);
    await pause(0);

    expect(root.textContent).toBe('');
    expect(AgentV2HostContextBridgeMock).not.toHaveBeenCalled();
  });

  it('loads the host-context bridge when enabled', async () => {
    useAgentProtocolVersionMock.mockReturnValue('v2');
    TeactDOM.render(<AgentV2HostContextBridgeRuntime />, root);
    await pause(100);

    expect(root.textContent).toBe('agent-v2-host-context');
    expect(AgentV2HostContextBridgeMock).toHaveBeenCalledTimes(1);
  });
});
