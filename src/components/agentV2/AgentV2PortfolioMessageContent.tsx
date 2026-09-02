import type { TeactNode } from '../../lib/teact/teact';
import React, { useEffect, useState } from '../../lib/teact/teact';

import type {
  AgentPublicFollowUpV2,
  AgentPublicInputContinuationV1,
} from '../../api/agentV2/protocol/types';
import type {
  AgentV2WalletConversationControl,
  AgentV2WalletConversationControls,
} from '../../api/agentV2/types';

import { getAgentV2InputContinuationLabel } from './agentV2Copy';

import useLang from '../../hooks/useLang';

import AgentV2SemanticContent, { type AgentV2RichSemanticContent } from './AgentV2SemanticContent';

import styles from './AgentV2Conversation.module.scss';

const OBSOLETE_INPUT_CONTINUATION_CODES = new Set<AgentPublicInputContinuationV1['code']>([
  'prepare_swap_destination_asset',
  'prepare_swap_source_asset',
]);

interface OwnProps {
  semanticContent?: AgentV2RichSemanticContent;
  walletControls?: AgentV2WalletConversationControls;
  followups?: AgentPublicFollowUpV2[];
  inputContinuations?: AgentPublicInputContinuationV1[];
  isDisabled: boolean;
  onFollowup: (item: AgentPublicFollowUpV2) => void;
  onInputContinuation?: (item: AgentPublicInputContinuationV1) => void;
  onWalletControl?: (control: AgentV2WalletConversationControl) => void;
  children?: TeactNode;
}

function AgentV2PortfolioMessageContent({
  semanticContent,
  walletControls,
  followups,
  inputContinuations,
  isDisabled,
  onFollowup,
  onInputContinuation,
  onWalletControl,
  children,
}: OwnProps) {
  const lang = useLang();
  const [now, setNow] = useState(Date.now());
  const expiresAt = walletControls ? Date.parse(walletControls.expiresAt) : undefined;
  const activeWalletControls = walletControls && expiresAt! > now
    ? walletControls
    : undefined;
  // Older persisted Swap messages can still contain these composer-only controls.
  const visibleInputContinuations = inputContinuations?.filter(({ code }) => (
    !OBSOLETE_INPUT_CONTINUATION_CODES.has(code)
  ));

  useEffect(() => {
    if (expiresAt === undefined || !Number.isFinite(expiresAt) || expiresAt <= now) return undefined;
    const delay = Math.max(1, expiresAt - Date.now() + 1);
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, now]);

  const hasWalletControls = Boolean(activeWalletControls?.scopeChoices.length);
  if (!semanticContent && !hasWalletControls && !followups?.length && !visibleInputContinuations?.length && !children) {
    return undefined;
  }

  return (
    <div className={styles.richContent}>
      {semanticContent && <AgentV2SemanticContent content={semanticContent} />}
      {children}
      {Boolean(hasWalletControls || visibleInputContinuations?.length || followups?.length) && (
        <div className={styles.followupRow}>
          {activeWalletControls?.scopeChoices.map(({ choiceId, label }) => (
            <button
              key={`choice-${choiceId}`}
              type="button"
              className={styles.followupButton}
              disabled={isDisabled}
              onClick={() => onWalletControl?.({ kind: 'select_wallet', choiceId, label })}
            >
              {label}
            </button>
          ))}
          {visibleInputContinuations?.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.followupButton}
              disabled={isDisabled}
              onClick={() => onInputContinuation?.(item)}
            >
              {getAgentV2InputContinuationLabel(item.code, lang)}
            </button>
          ))}
          {followups?.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.followupButton}
              disabled={isDisabled}
              onClick={() => onFollowup(item)}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentV2PortfolioMessageContent;
