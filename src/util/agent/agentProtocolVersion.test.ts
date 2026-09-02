const AGENT_PROTOCOL_STORAGE_KEY = 'agentProtocolVersion';

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  window.history.replaceState(undefined, '', '/');
});

describe('Agent protocol version', () => {
  it.each([
    { buildOverride: 'no_override', expected: 'v1' },
    { buildOverride: 'v1', expected: 'v1' },
    { buildOverride: 'v2', expected: 'v2' },
  ] as const)('starts with $expected for the $buildOverride build override', ({ buildOverride, expected }) => {
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride });

    agentProtocolVersion.initAgentProtocolVersion();

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe(expected);
    expect(agentProtocolVersion.getAgentOverride()).toBe(buildOverride);
  });

  it('persists a V2 query override and removes only the recognized parameter', () => {
    window.history.replaceState(undefined, '', '/wallet?agent=v2&r=team#agent');
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride: 'no_override' });

    agentProtocolVersion.initAgentProtocolVersion();

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe('v2');
    expect(agentProtocolVersion.getAgentOverride()).toBe('v2');
    expect(localStorage.getItem(AGENT_PROTOCOL_STORAGE_KEY)).toBe('v2');
    expect(window.location.pathname).toBe('/wallet');
    expect(window.location.search).toBe('?r=team');
    expect(window.location.hash).toBe('#agent');
  });

  it('uses the persisted override after reload', () => {
    localStorage.setItem(AGENT_PROTOCOL_STORAGE_KEY, 'v2');
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride: 'no_override' });

    agentProtocolVersion.initAgentProtocolVersion();

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe('v2');
  });

  it('keeps a build override ahead of Web profile overrides', () => {
    localStorage.setItem(AGENT_PROTOCOL_STORAGE_KEY, 'v2');
    window.history.replaceState(undefined, '', '/?agent=v2');
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride: 'v1' });

    agentProtocolVersion.initAgentProtocolVersion();

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe('v1');
    expect(window.location.search).toBe('?agent=v2');
  });

  it('follows backend changes and notifies listeners without an override', () => {
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride: 'no_override' });
    agentProtocolVersion.initAgentProtocolVersion();
    const listener = jest.fn();
    agentProtocolVersion.addAgentProtocolVersionListener(listener);

    agentProtocolVersion.setBackendAgentProtocolVersion('v2');
    agentProtocolVersion.setBackendAgentProtocolVersion('v2');
    agentProtocolVersion.setBackendAgentProtocolVersion(undefined);

    expect(listener).toHaveBeenNthCalledWith(1, 'v2');
    expect(listener).toHaveBeenNthCalledWith(2, 'v1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores backend changes when a version is forced', () => {
    const agentProtocolVersion = loadAgentProtocolVersion({ buildOverride: 'v1' });
    agentProtocolVersion.initAgentProtocolVersion();
    const listener = jest.fn();
    agentProtocolVersion.addAgentProtocolVersionListener(listener);

    agentProtocolVersion.setBackendAgentProtocolVersion('v2');

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe('v1');
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores Web profile overrides outside the Web app', () => {
    localStorage.setItem(AGENT_PROTOCOL_STORAGE_KEY, 'v2');
    window.history.replaceState(undefined, '', '/?agent=v2');
    const agentProtocolVersion = loadAgentProtocolVersion({
      buildOverride: 'no_override',
      isWeb: false,
    });

    agentProtocolVersion.initAgentProtocolVersion();

    expect(agentProtocolVersion.getAgentProtocolVersion()).toBe('v1');
    expect(window.location.search).toBe('?agent=v2');
  });
});

function loadAgentProtocolVersion({
  buildOverride,
  isWeb = true,
}: {
  buildOverride: 'no_override' | 'v1' | 'v2';
  isWeb?: boolean;
}) {
  jest.doMock('../../config', () => ({
    AGENT_OVERRIDE: buildOverride,
  }));
  jest.doMock('../windowEnvironment', () => ({ IS_WEB: isWeb }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./agentProtocolVersion') as typeof import('./agentProtocolVersion');
}
