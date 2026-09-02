export const AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER = 'X-Agent-V2-Custom-Writer-Instruction';
export const AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES = 2 * 1024;

const HEADER_VERSION_PREFIX = 'v1.';

export function canonicalizeAgentV2CustomWriterInstruction(instruction: string): string {
  const canonical = instruction.replace(/\r\n?/gu, '\n').trim();
  if (
    canonical.length === 0
    || hasDisallowedControlCharacter(canonical)
    || utf8ByteLength(canonical) > AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES
  ) {
    throw new Error('Invalid Agent V2 custom Writer instruction');
  }
  return canonical;
}

export function encodeAgentV2CustomWriterInstructionHeader(
  instruction: string | undefined,
): string | undefined {
  if (instruction === undefined) return undefined;
  const bytes = new TextEncoder().encode(canonicalizeAgentV2CustomWriterInstruction(instruction));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `${HEADER_VERSION_PREFIX}${base64.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}`;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hasDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code <= 31 && code !== 9 && code !== 10) || code === 127;
  });
}
