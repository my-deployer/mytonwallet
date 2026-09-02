import {
  AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES,
  canonicalizeAgentV2CustomWriterInstruction,
  encodeAgentV2CustomWriterInstructionHeader,
} from './customWriterInstruction';

describe('Agent V2 custom Writer instruction transport', () => {
  it('canonicalizes and encodes Unicode as a versioned base64url header', () => {
    const instruction = '  Отвечай кратко.\r\nЗаверши словом «готово».  ';
    const header = encodeAgentV2CustomWriterInstructionHeader(instruction);

    expect(header).toMatch(/^v1\.[A-Za-z0-9_-]+$/u);
    expect(decodeHeader(header!)).toBe('Отвечай кратко.\nЗаверши словом «готово».');
    expect(canonicalizeAgentV2CustomWriterInstruction(instruction)).toBe(
      'Отвечай кратко.\nЗаверши словом «готово».',
    );
  });

  it('omits an instruction that was not captured for a run', () => {
    expect(encodeAgentV2CustomWriterInstructionHeader(undefined)).toBeUndefined();
  });

  it.each([
    ['empty', ' \r\n '],
    ['control character', 'Be concise.\u0000'],
    ['oversized UTF-8', '🙂'.repeat(AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES / 4 + 1)],
  ])('rejects an %s instruction', (_case, instruction) => {
    expect(() => encodeAgentV2CustomWriterInstructionHeader(instruction)).toThrow(
      'Invalid Agent V2 custom Writer instruction',
    );
  });
});

function decodeHeader(header: string): string {
  const payload = header.slice('v1.'.length).replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
