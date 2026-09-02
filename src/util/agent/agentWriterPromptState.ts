import { APP_ENV } from '../../config';
import { IS_WEB } from '../windowEnvironment';

const AGENT_WRITER_PROMPT_QUERY_PARAMETER = 'agentWriterPrompt';
const AGENT_WRITER_PROMPT_ENABLED_STORAGE_KEY = 'agentV2WriterPromptEnabled';
const AGENT_WRITER_PROMPT_VALUE_STORAGE_KEY = 'agentV2WriterPrompt';

let isEditorEnabled = false;

export function initAgentWriterPrompt() {
  isEditorEnabled = false;
  if (!IS_WEB) return;

  const url = new URL(window.location.href);
  const queryValue = url.searchParams.get(AGENT_WRITER_PROMPT_QUERY_PARAMETER);
  const isAllowedEnvironment = APP_ENV === 'development' || APP_ENV === 'staging';
  if (!isAllowedEnvironment) {
    sessionStorage.removeItem(AGENT_WRITER_PROMPT_ENABLED_STORAGE_KEY);
    clearStoredAgentWriterPrompt();
  } else if (queryValue === '1' || queryValue === '0') {
    sessionStorage.setItem(AGENT_WRITER_PROMPT_ENABLED_STORAGE_KEY, queryValue);
    if (queryValue === '0') clearStoredAgentWriterPrompt();
  }

  if (queryValue === '1' || queryValue === '0') {
    url.searchParams.delete(AGENT_WRITER_PROMPT_QUERY_PARAMETER);
    window.history.replaceState(window.history.state, '', url.toString());
  }

  isEditorEnabled = isAllowedEnvironment
    && sessionStorage.getItem(AGENT_WRITER_PROMPT_ENABLED_STORAGE_KEY) === '1';
}

export function isAgentWriterPromptEditorEnabled(): boolean {
  return isEditorEnabled;
}

export function getStoredAgentWriterPrompt(): string | undefined {
  return sessionStorage.getItem(AGENT_WRITER_PROMPT_VALUE_STORAGE_KEY) ?? undefined;
}

export function setStoredAgentWriterPrompt(instruction: string) {
  sessionStorage.setItem(AGENT_WRITER_PROMPT_VALUE_STORAGE_KEY, instruction);
}

export function clearStoredAgentWriterPrompt() {
  sessionStorage.removeItem(AGENT_WRITER_PROMPT_VALUE_STORAGE_KEY);
}
