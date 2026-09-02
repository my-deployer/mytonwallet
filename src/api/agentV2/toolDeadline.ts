const TOOL_RESULT_RESERVE_MS = 5_000;
const TOOL_RESULT_RESERVE_RATIO = 6;

export function getAgentToolExecutionTimeout(timeoutMs: number) {
  const reserveMs = Math.min(TOOL_RESULT_RESERVE_MS, timeoutMs / TOOL_RESULT_RESERVE_RATIO);
  return Math.max(0, timeoutMs - reserveMs);
}
