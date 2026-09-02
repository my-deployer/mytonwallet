import {
  canonicalizeAgentV2CustomWriterInstruction,
} from '../../api/agentV2/customWriterInstruction';
import {
  clearStoredAgentWriterPrompt,
  getStoredAgentWriterPrompt,
  isAgentWriterPromptEditorEnabled,
  setStoredAgentWriterPrompt,
} from './agentWriterPromptState';

export function getAppliedAgentV2CustomWriterInstruction(): string | undefined {
  if (!isAgentWriterPromptEditorEnabled()) return undefined;
  const stored = getStoredAgentWriterPrompt();
  if (stored === undefined) return undefined;
  try {
    return canonicalizeAgentV2CustomWriterInstruction(stored);
  } catch {
    clearStoredAgentWriterPrompt();
    return undefined;
  }
}

export function applyAgentV2CustomWriterInstruction(instruction: string): string {
  if (!isAgentWriterPromptEditorEnabled()) throw new Error('Agent V2 custom Writer prompt is not enabled');
  const canonical = canonicalizeAgentV2CustomWriterInstruction(instruction);
  setStoredAgentWriterPrompt(canonical);
  return canonical;
}

export function clearAgentV2CustomWriterInstruction() {
  clearStoredAgentWriterPrompt();
}
