import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import { pause } from '../../util/schedulers';
import useAgentProtocolVersion from './useAgentProtocolVersion';

import AgentV2Classic from '../agentV2/AgentV2Classic';
import Agent from './Agent';
import AgentRuntime from './AgentRuntime';

jest.mock('./useAgentProtocolVersion', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../agentV2/AgentV2Classic', () => ({
  __esModule: true,
  default: jest.fn(() => 'agent-v2-classic'),
}));
jest.mock('./Agent', () => ({
  __esModule: true,
  default: jest.fn(() => 'agent-v1'),
}));

const AgentMock = jest.mocked(Agent);
const AgentV2ClassicMock = jest.mocked(AgentV2Classic);
const useAgentProtocolVersionMock = jest.mocked(useAgentProtocolVersion);

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  useAgentProtocolVersionMock.mockReturnValue('v1');
  AgentMock.mockClear();
  AgentV2ClassicMock.mockClear();
});

afterEach(() => {
  TeactDOM.render(undefined, root);
  root.remove();
});

describe('AgentRuntime', () => {
  it.each([
    { version: 'v1', expected: 'agent-v1' },
    { version: 'v2', expected: 'agent-v2-classic' },
  ] as const)('routes Agent $version to $expected', async ({ version, expected }) => {
    useAgentProtocolVersionMock.mockReturnValue(version);

    TeactDOM.render(<AgentRuntime isActive />, root);
    if (version === 'v2') {
      expect(root.textContent).toBe('');
      expect(AgentMock).not.toHaveBeenCalled();
    }
    await pause(100);

    expect(root.textContent).toBe(expected);
    expect(AgentMock).toHaveBeenCalledTimes(expected === 'agent-v1' ? 1 : 0);
    expect(AgentV2ClassicMock).toHaveBeenCalledTimes(expected === 'agent-v2-classic' ? 1 : 0);
  });
});
