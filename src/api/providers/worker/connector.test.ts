import { isAgentV2Method, isSilenceConclusive } from './connector';

describe('Agent V2 worker policy', () => {
  it.each([
    'getAgentV2Messages',
    'clearAgentV2Thread',
    'startAgentV2Run',
    'cancelAgentV2Run',
    'getAgentV2ActionPresentation',
    'resolveAgentV2Action',
  ])('redacts %s arguments and results from debug logs', (method) => {
    expect(isAgentV2Method(method)).toBe(true);
  });

  it('does not redact unrelated API methods', () => {
    expect(isAgentV2Method('getWallet')).toBe(false);
  });
});

describe('iOS worker health check', () => {
  // The guard this pins used to measure age from page load rather than from worker creation,
  // so every worker created more than the budget after startup was terminated on its first
  // unanswered ping - while still inside its own init. In the simulator one app switch
  // destroyed three workers that way, and the app came up only on the fourth.
  const BUDGET = 5000;

  it('does not read a booting worker as dead', () => {
    expect(isSilenceConclusive(false, 0)).toBe(false);
    expect(isSilenceConclusive(false, 150)).toBe(false);
    expect(isSilenceConclusive(false, BUDGET - 1)).toBe(false);
  });

  it('reads silence as death once the worker has had its whole boot budget', () => {
    expect(isSilenceConclusive(false, BUDGET)).toBe(true);
    expect(isSilenceConclusive(false, BUDGET * 10)).toBe(true);
  });

  it('reads silence as death immediately from a worker that already answered', () => {
    expect(isSilenceConclusive(true, 0)).toBe(true);
    expect(isSilenceConclusive(true, 150)).toBe(true);
  });
});
