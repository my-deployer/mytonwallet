import type { AgentV2OperationError } from '../../api/agentV2/types';
import type { LangFn } from '../../util/langProvider';

export interface AgentV2HydrationError {
  code: AgentV2OperationError['code'];
  message: string;
  isRetryable: boolean;
}

export function buildAgentV2HydrationError(
  error: AgentV2OperationError | undefined,
  lang: LangFn,
): AgentV2HydrationError {
  const code = error?.code ?? 'network_error';
  return {
    code,
    message: lang(code === 'network_error'
      ? '$agent_connection_interrupted'
      : '$agent_history_unavailable'),
    isRetryable: error?.retryable ?? true,
  };
}
