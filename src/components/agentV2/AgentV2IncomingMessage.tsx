import React, {
  memo, useEffect, useState,
} from '../../lib/teact/teact';

import type { AgentV2IncomingMessageProps } from '../agent/MessageBubble';

import buildClassName from '../../util/buildClassName';
import { getAgentV2ActionLabel, getAgentV2NoticeTexts } from './agentV2Copy';

import useLang from '../../hooks/useLang';

import { getIncomingMessageKey } from '../agent/MessageBubble';
import { AgentRunFailure } from './AgentStatusNotice';
import { AgentV2AssistantText } from './AgentV2Conversation';
import AgentV2PortfolioMessageContent from './AgentV2PortfolioMessageContent';

import styles from '../agent/MessageBubble.module.scss';

/** `setTimeout` stores its delay in a 32-bit signed integer. */
const MAX_TIMEOUT_DELAY = 2 ** 31 - 1;

function AgentV2IncomingMessage({
  message,
  visibleIncomingText,
  contentRef,
  isDisabled,
  shouldAnimateTextStreaming,
  textRevealPresentation,
  onMouseDown,
  onContextMenu,
  onFollowup,
  onInputContinuation,
  onWalletControl,
  onAction,
  onRetry,
  onTextRevealSessionConsumed,
  onTextRevealSessionSettled,
  onTextRevealProgress,
  onTextRevealComplete,
}: AgentV2IncomingMessageProps) {
  const {
    id, shouldCommitMarkdownTail, walletControls, isTyping, isStreaming, semanticContent,
    actions, actionPresentations, followups, inputContinuations, error,
  } = message;
  const lang = useLang();
  const noticeContent = semanticContent?.kind === 'notice' ? semanticContent : undefined;
  const richSemanticContent = semanticContent?.kind === 'notice' || semanticContent?.kind === 'webDigest'
    ? undefined
    : semanticContent;
  const noticeText = noticeContent ? getAgentV2NoticeTexts(noticeContent, lang).join('\n\n') : undefined;
  const incomingText = noticeText ?? visibleIncomingText;
  const hasRichContent = Boolean(
    richSemanticContent || walletControls || actions?.length || followups?.length || inputContinuations?.length,
  );
  const shouldRenderIncomingBubble = Boolean(isTyping || incomingText);
  const isTextRevealActive = textRevealPresentation?.status === 'active' && Boolean(incomingText);
  const areRichContentVisible = hasRichContent && !isTextRevealActive;
  const hasPartialResponse = Boolean(incomingText.trim() || hasRichContent);

  return (
    <div
      ref={contentRef}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      className={buildClassName(styles.wrapper, hasRichContent && styles.wrapperRich)}
    >
      {shouldRenderIncomingBubble && (
        <div className={buildClassName(styles.bubble, styles.incoming)}>
          {!isTyping && (
            <AgentV2AssistantText
              key={getIncomingMessageKey(textRevealPresentation)}
              messageId={id}
              text={incomingText}
              isStreaming={Boolean(isStreaming)}
              shouldAnimate={shouldAnimateTextStreaming}
              shouldCommitMarkdownTail={shouldCommitMarkdownTail}
              textRevealPresentation={textRevealPresentation}
              onTextRevealSessionConsumed={onTextRevealSessionConsumed}
              onTextRevealSessionSettled={onTextRevealSessionSettled}
              onRevealProgress={onTextRevealProgress}
              onRevealComplete={onTextRevealComplete}
            />
          )}
        </div>
      )}
      {areRichContentVisible && (
        <AgentV2PortfolioMessageContent
          semanticContent={richSemanticContent}
          walletControls={walletControls}
          followups={followups}
          inputContinuations={inputContinuations}
          isDisabled={isDisabled}
          onFollowup={(followup) => onFollowup?.(id, followup)}
          onInputContinuation={(continuation) => onInputContinuation?.(id, continuation)}
          onWalletControl={(control) => onWalletControl?.(id, control)}
        >
          {actions?.map((action) => {
            const presentation = actionPresentations?.[action.id];
            const requiresActivePresentation = action.kind === 'send' && action.effect === 'open_wallet_review';
            const isActionActive = presentation?.kind !== 'inactive'
              && (!requiresActivePresentation
                || (presentation?.kind === 'send' && presentation.status === 'active'));

            return (
              <AgentV2ActionButton
                key={action.id}
                label={getAgentV2ActionLabel(action.labelCode, lang)}
                expiresAt={presentation?.kind === 'send' ? presentation.expiresAt : undefined}
                isActive={isActionActive}
                isDisabled={isDisabled || !onAction}
                onClick={() => onAction?.(id, action)}
              />
            );
          })}
        </AgentV2PortfolioMessageContent>
      )}
      {error && (
        <div className={styles.failure}>
          <AgentRunFailure
            error={error}
            hasPartialResponse={hasPartialResponse}
            isRetryDisabled={isDisabled}
            onRetry={onRetry ? () => onRetry(id) : undefined}
          />
        </div>
      )}
    </div>
  );
}

interface AgentV2ActionButtonProps {
  expiresAt?: string;
  isActive: boolean;
  isDisabled: boolean;
  label: string;
  onClick: NoneToVoidFunction;
}

function AgentV2ActionButton({
  expiresAt,
  isActive,
  isDisabled,
  label,
  onClick,
}: AgentV2ActionButtonProps) {
  const [isExpired, setIsExpired] = useState(() => isActionExpired(expiresAt));

  useEffect(() => {
    setIsExpired(isActionExpired(expiresAt));
    if (!expiresAt) return undefined;
    const timeout = Date.parse(expiresAt) - Date.now();
    // A delay above the 32-bit ceiling is truncated to its low bits, so it can land in the past and
    // fire at once, disabling a button that is nowhere near expiry. Such an expiry outlives any session.
    if (timeout <= 0 || timeout > MAX_TIMEOUT_DELAY) return undefined;
    const timer = window.setTimeout(() => setIsExpired(true), timeout);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  return (
    <button
      type="button"
      className={styles.actionButton}
      disabled={isDisabled || !isActive || isExpired}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function isActionExpired(expiresAt?: string) {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

export default memo(AgentV2IncomingMessage);
