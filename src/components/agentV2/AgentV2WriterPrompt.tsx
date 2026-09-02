import React, { useState } from '../../lib/teact/teact';

import {
  applyAgentV2CustomWriterInstruction,
  clearAgentV2CustomWriterInstruction,
  getAppliedAgentV2CustomWriterInstruction,
} from '../../util/agent/agentWriterPrompt';
import {
  AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES,
  canonicalizeAgentV2CustomWriterInstruction,
  utf8ByteLength,
} from '../../api/agentV2/customWriterInstruction';

import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';

import styles from './AgentV2WriterPrompt.module.scss';

export default function AgentV2WriterPrompt() {
  const initialInstruction = getAppliedAgentV2CustomWriterInstruction() ?? '';
  const [draft, setDraft] = useState(initialInstruction);
  const [appliedInstruction, setAppliedInstruction] = useState(initialInstruction);
  const [isOpen, setIsOpen] = useState(!initialInstruction);
  const byteLength = utf8ByteLength(draft);
  let canonicalDraft: string | undefined;
  try {
    canonicalDraft = canonicalizeAgentV2CustomWriterInstruction(draft);
  } catch {
    canonicalDraft = undefined;
  }
  const isApplyDisabled = canonicalDraft === undefined || canonicalDraft === appliedInstruction;

  const toggleOpen = useLastCallback(() => setIsOpen((current) => !current));
  const apply = useLastCallback(() => {
    const canonical = applyAgentV2CustomWriterInstruction(draft);
    setDraft(canonical);
    setAppliedInstruction(canonical);
  });
  const clear = useLastCallback(() => {
    clearAgentV2CustomWriterInstruction();
    setDraft('');
    setAppliedInstruction('');
  });

  return (
    <aside className={styles.root} data-agent-v2-writer-prompt>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        onClick={toggleOpen}
      >
        <span>Writer prompt</span>
        {appliedInstruction && <span className={styles.active}>Active</span>}
        <i className={isOpen ? 'icon-chevron-down' : 'icon-chevron-up'} aria-hidden />
      </button>
      {isOpen && (
        <div className={styles.panel}>
          <textarea
            className={styles.input}
            value={draft}
            rows={5}
            maxLength={AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES}
            placeholder="Extra presentation instruction for new informational answers"
            aria-label="Custom Writer instruction"
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
          <div className={styles.meta}>
            <span>New informational runs only. Do not paste secrets.</span>
            <span className={byteLength > AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES ? styles.invalid : undefined}>
              {byteLength}/{AGENT_V2_CUSTOM_WRITER_INSTRUCTION_MAX_BYTES} bytes
            </span>
          </div>
          <div className={styles.actions}>
            <Button isSmall isDisabled={!appliedInstruction && !draft} onClick={clear}>Clear</Button>
            <Button isSmall isPrimary isDisabled={isApplyDisabled} onClick={apply}>Apply</Button>
          </div>
        </div>
      )}
    </aside>
  );
}
