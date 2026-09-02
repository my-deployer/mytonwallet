import type { AgentV2OperationResult } from './types';

import { AgentV2HttpError } from './identity';

export async function runSafeAgentV2Operation<T>(
  operation: () => Promise<T>,
): Promise<AgentV2OperationResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    if (error instanceof AgentV2HttpError) {
      return {
        ok: false,
        error: {
          code: error.code,
          retryable: error.retryable,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'network_error',
        retryable: true,
      },
    };
  }
}
