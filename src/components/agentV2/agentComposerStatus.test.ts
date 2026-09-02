import {
  isAgentV2ComposerBlocked,
  selectAgentV2ComposerStatus,
} from './agentComposerStatus';

const RESET_AT = '2026-07-30T00:00:00.000Z';
const RESET_TIMESTAMP = Date.parse(RESET_AT);

describe('Agent V2 composer status', () => {
  it('prioritizes active blockers before degraded and informational states', () => {
    const quota = { limit: 20, used: 20, remaining: 0, resetAt: RESET_AT };
    const rateLimit = {
      kind: 'rateLimit' as const,
      resetAt: RESET_TIMESTAMP + 60_000,
      clientRunId: 'rate-run',
    };

    expect(selectAgentV2ComposerStatus(
      { state: 'capacity_exhausted', resetAt: RESET_TIMESTAMP + 120_000 },
      quota,
      { clientRunId: 'quota-run', resetAt: RESET_TIMESTAMP + 90_000 },
      rateLimit,
      RESET_TIMESTAMP,
    )).toEqual({
      kind: 'capacity',
      mode: 'blocked',
      resetAt: RESET_TIMESTAMP + 120_000,
    });
    expect(selectAgentV2ComposerStatus(
      { state: 'capacity_exhausted' },
      quota,
      { clientRunId: 'quota-run', resetAt: RESET_TIMESTAMP + 90_000 },
      rateLimit,
      RESET_TIMESTAMP,
    )).toMatchObject({ kind: 'userQuota', mode: 'blocked', clientRunId: 'quota-run' });
    expect(selectAgentV2ComposerStatus(
      { state: 'capacity_exhausted' },
      { ...quota, used: 19, remaining: 1 },
      { clientRunId: 'quota-run', resetAt: RESET_TIMESTAMP - 1 },
      rateLimit,
      RESET_TIMESTAMP,
    )).toEqual({ ...rateLimit, mode: 'blocked' });
  });

  it('treats unknown or expired capacity as degraded and non-blocking', () => {
    const unknown = selectAgentV2ComposerStatus(
      { state: 'capacity_exhausted' },
      undefined,
      undefined,
      undefined,
      RESET_TIMESTAMP,
    );
    const expired = selectAgentV2ComposerStatus(
      { state: 'capacity_exhausted', resetAt: RESET_TIMESTAMP },
      undefined,
      undefined,
      undefined,
      RESET_TIMESTAMP,
    );

    expect(unknown).toEqual({ kind: 'capacity', mode: 'degraded' });
    expect(expired).toEqual({ kind: 'capacity', mode: 'degraded' });
    expect(isAgentV2ComposerBlocked(unknown)).toBe(false);
    expect(isAgentV2ComposerBlocked(expired)).toBe(false);
  });

  it('blocks active quota and rate limits and makes an expired rate retry informational', () => {
    const quota = { limit: 20, used: 20, remaining: 0, resetAt: RESET_AT };
    const quotaStatus = selectAgentV2ComposerStatus(
      { state: 'available' },
      quota,
      { clientRunId: 'quota-run', resetAt: RESET_TIMESTAMP },
      undefined,
      RESET_TIMESTAMP - 1,
    );
    const rateStatus = selectAgentV2ComposerStatus(
      { state: 'available' },
      undefined,
      undefined,
      { kind: 'rateLimit', resetAt: RESET_TIMESTAMP, clientRunId: 'rate-run' },
      RESET_TIMESTAMP - 1,
    );

    expect(isAgentV2ComposerBlocked(quotaStatus)).toBe(true);
    expect(isAgentV2ComposerBlocked(rateStatus)).toBe(true);
    expect(selectAgentV2ComposerStatus(
      { state: 'available' },
      undefined,
      undefined,
      { kind: 'rateLimit', resetAt: RESET_TIMESTAMP, clientRunId: 'rate-run' },
      RESET_TIMESTAMP,
    )).toEqual({
      kind: 'rateLimit',
      mode: 'informational',
      resetAt: RESET_TIMESTAMP,
      clientRunId: 'rate-run',
    });
  });

  it('keeps an exact quota retry informational after its blocking window', () => {
    const quota = { limit: 20, used: 19, remaining: 1, resetAt: RESET_AT };

    expect(selectAgentV2ComposerStatus(
      { state: 'available' },
      quota,
      { clientRunId: 'quota-run', resetAt: RESET_TIMESTAMP },
      undefined,
      RESET_TIMESTAMP,
    )).toEqual({
      kind: 'userQuota',
      mode: 'informational',
      quota,
      resetAt: RESET_TIMESTAMP,
      clientRunId: 'quota-run',
    });
  });
});
