import { AgentV2HttpError } from './identity';
import { runSafeAgentV2Operation } from './mutation';

describe('Agent V2 worker mutation results', () => {
  it('returns a typed success value', async () => {
    await expect(runSafeAgentV2Operation(() => Promise.resolve({ duplicate: true }))).resolves.toEqual({
      ok: true,
      value: { duplicate: true },
    });
  });

  it('allowlists safe HTTP error fields', async () => {
    const failure = new AgentV2HttpError(
      409,
      'thread_revision_conflict',
      'Refresh the chat and try again.',
      true,
    );

    await expect(runSafeAgentV2Operation(() => Promise.reject(failure))).resolves.toEqual({
      ok: false,
      error: {
        code: 'thread_revision_conflict',
        retryable: true,
      },
    });
  });

  it('sanitizes unknown failures', async () => {
    await expect(runSafeAgentV2Operation(() => Promise.reject(new Error('raw transport detail')))).resolves.toEqual({
      ok: false,
      error: { code: 'network_error', retryable: true },
    });
  });
});
