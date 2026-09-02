import {
  parseAgentOverride,
  parseAgentProtocolVersion,
  resolveAgentProtocolVersion,
} from './agentOverride';

describe('Agent override', () => {
  it.each([
    [undefined, 'no_override'],
    ['no_override', 'no_override'],
    ['v1', 'v1'],
    ['v2', 'v2'],
  ] as const)('parses %s as %s', (value, expected) => {
    expect(parseAgentOverride(value)).toBe(expected);
  });

  it('rejects unsupported build values', () => {
    expect(() => parseAgentOverride('future')).toThrow('Unsupported AGENT_OVERRIDE value: future');
  });

  it.each([
    ['v1', 'v1'],
    ['v2', 'v2'],
    ['v3', undefined],
    [undefined, undefined],
  ] as const)('normalizes backend protocol version %s to %s', (value, expected) => {
    expect(parseAgentProtocolVersion(value)).toBe(expected);
  });

  it.each([
    { override: 'v1', backendVersion: 'v2', expected: 'v1' },
    { override: 'v2', backendVersion: 'v1', expected: 'v2' },
    { override: 'no_override', backendVersion: 'v2', expected: 'v2' },
    { override: 'no_override', backendVersion: 'v1', expected: 'v1' },
    { override: 'no_override', backendVersion: undefined, expected: 'v1' },
  ] as const)('resolves $override with backend $backendVersion as $expected', ({
    override,
    backendVersion,
    expected,
  }) => {
    expect(resolveAgentProtocolVersion(override, backendVersion)).toBe(expected);
  });
});
