import React, { memo, useMemo, useRef } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type {
  AgentPublicFollowUpV2,
  AgentPublicInputContinuationV1,
} from '../../api/agentV2/protocol/types';
import type { AgentV2WalletConversationControl } from '../../api/agentV2/types';
import type { AgentHint, AgentMessage, AnimationLevel } from '../../global/types';
import type {
  AgentConversationComposerHeightContext,
  AgentConversationComposerProps,
  AgentConversationHistory,
  AgentConversationMessageContext,
} from '../agent/AgentConversationShell';

import { AGENT_V2_QUOTA_STATUS_ENABLED } from '../../config';
import { isAgentWriterPromptEditorEnabled } from '../../util/agent/agentWriterPromptState';
import { updateAgentV2InputBarSpacing } from './inputBarSpacing';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useAgentV2Messages from '../agent/hooks/useAgentV2Messages';

import AgentConversationShell from '../agent/AgentConversationShell';
import AgentInputBar from '../agent/AgentInputBar';
import AgentRunActivity from '../agent/AgentRunActivity';
import MessageBubble from '../agent/MessageBubble';
import { AgentComposerStatus, AgentQuotaStatus } from './AgentStatusNotice';
import { AgentV2ConsentScreen } from './AgentV2Conversation';
import AgentV2IncomingMessage from './AgentV2IncomingMessage';
import AgentV2WriterPrompt from './AgentV2WriterPrompt';

interface OwnProps {
  isActive: boolean;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

interface StateProps {
  animationLevel: AnimationLevel;
}

export function AgentV2Classic({
  isActive,
  animationLevel,
  onScroll,
}: OwnProps & StateProps) {
  const { switchToWallet } = getActions();
  const lang = useLang();
  const inputContinuationRef = useRef<{
    messageId: number;
    continuation: AgentPublicInputContinuationV1;
  }>();
  const focusComposerRef = useRef<NoneToVoidFunction>();
  const requestBottomStickRef = useRef<NoneToVoidFunction>();
  const {
    messages,
    hints,
    activity,
    isInitialLoadComplete,
    isInputDisabled,
    isConsentAccepted,
    textRevealPresentations,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    sendMessage,
    sendHint,
    sendFollowup,
    sendWalletControl,
    clearChat,
    acceptConsent,
    composerStatus,
    userQuota,
    retryMessage,
    retryAdmission,
    refreshExpiredComposerStatus,
    activateAction,
    consumeTextRevealSession,
    settleTextRevealSession,
  } = useAgentV2Messages({ isActive, lang });

  const resetComposerExtension = useLastCallback(() => {
    inputContinuationRef.current = undefined;
  });

  const sendComposerMessage = useLastCallback((text: string, editingMessageId?: number) => {
    const selectedInputContinuation = inputContinuationRef.current;
    inputContinuationRef.current = undefined;
    sendMessage(text, editingMessageId, selectedInputContinuation);
  });

  const sendSelectedHint = useLastCallback((hint: AgentHint) => {
    inputContinuationRef.current = undefined;
    sendHint(hint);
  });

  const handleInputContinuation = useLastCallback((
    messageId: number,
    continuation: AgentPublicInputContinuationV1,
  ) => {
    inputContinuationRef.current = { messageId, continuation };
    focusComposerRef.current?.();
  });

  const handleFollowup = useLastCallback((messageId: number, followup: AgentPublicFollowUpV2) => {
    inputContinuationRef.current = undefined;
    requestBottomStickRef.current?.();
    sendFollowup(messageId, followup);
  });

  const handleWalletControl = useLastCallback((
    messageId: number,
    control: AgentV2WalletConversationControl,
  ) => {
    inputContinuationRef.current = undefined;
    requestBottomStickRef.current?.();
    sendWalletControl(messageId, control);
  });

  const handleRetryMessage = useLastCallback((messageId: number) => {
    inputContinuationRef.current = undefined;
    retryMessage(messageId);
  });

  const renderMessage = useLastCallback((
    message: AgentMessage,
    context: AgentConversationMessageContext,
  ) => {
    focusComposerRef.current = context.onFocusComposer;
    requestBottomStickRef.current = context.onRequestBottomStick;

    return (
      <MessageBubble
        key={message.id}
        message={message}
        areLinksEnabled={false}
        isDisabled={isInputDisabled}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        shouldAnimateTextStreaming={context.shouldAnimateTextStreaming}
        textRevealPresentation={context.textRevealPresentation}
        onEdit={context.onEditMessage}
        onFollowup={handleFollowup}
        onInputContinuation={handleInputContinuation}
        onWalletControl={handleWalletControl}
        onAction={activateAction}
        onRetry={message.isRetryAvailable ? handleRetryMessage : undefined}
        onTextRevealSessionConsumed={consumeTextRevealSession}
        onTextRevealSessionSettled={settleTextRevealSession}
        onTextRevealProgress={context.onTextRevealProgress}
        onTextRevealComplete={context.onTextRevealProgress}
      />
    );
  });

  const handleComposerHeightChange = useLastCallback((
    height: number,
    context: AgentConversationComposerHeightContext,
  ) => {
    updateAgentV2InputBarSpacing(
      context.messagesElement,
      height,
      context.getIsAtBottom,
      context.messagesElement.parentElement ?? context.messagesElement,
      context.onTextRevealProgress,
    );
  });

  const isInputVisible = isConsentAccepted === true;
  const visibleComposerStatus = isInputVisible ? composerStatus : undefined;
  const canRetryAdmission = visibleComposerStatus?.kind === 'rateLimit'
    || (visibleComposerStatus?.kind === 'userQuota' && Boolean(visibleComposerStatus.clientRunId));
  const statusSlot = visibleComposerStatus ? (
    <AgentComposerStatus
      status={visibleComposerStatus}
      isRetryDisabled={isInputDisabled}
      onRetry={canRetryAdmission ? retryAdmission : undefined}
      onExpired={refreshExpiredComposerStatus}
    />
  ) : undefined;

  const renderComposer = useLastCallback((props: AgentConversationComposerProps) => (
    <AgentInputBar
      {...props}
      userQuota={AGENT_V2_QUOTA_STATUS_ENABLED ? userQuota : undefined}
      quotaStatus={AGENT_V2_QUOTA_STATUS_ENABLED && userQuota
        ? <AgentQuotaStatus quota={userQuota} />
        : undefined}
      statusNotice={statusSlot}
    />
  ));
  const shouldShowWriterPrompt = isAgentWriterPromptEditorEnabled();
  const conversation = useMemo(() => ({
    messages,
    hints,
    isInitialLoadComplete,
    textRevealPresentations,
    renderMessage,
  }), [hints, isInitialLoadComplete, messages, renderMessage, textRevealPresentations]);
  const composer = useMemo(() => ({
    isDisabled: isInputDisabled,
    shouldHide: !isInputVisible,
    onSendMessage: sendComposerMessage,
    onSendHint: sendSelectedHint,
    onReset: resetComposerExtension,
    onHeightChange: handleComposerHeightChange,
    render: renderComposer,
  }), [
    handleComposerHeightChange, isInputDisabled, isInputVisible, renderComposer, resetComposerExtension,
    sendComposerMessage, sendSelectedHint,
  ]);
  const history = useMemo<AgentConversationHistory>(() => ({
    hasOlderMessages,
    isLoading: isLoadingOlderMessages,
    mode: 'continuous',
    loadOlderMessages,
  }), [hasOlderMessages, isLoadingOlderMessages, loadOlderMessages]);
  const slots = useMemo(() => ({
    body: isConsentAccepted === false ? <AgentV2ConsentScreen onAccept={acceptConsent} /> : undefined,
    messageListFooter: activity && <AgentRunActivity key="activity" activity={activity} />,
    beforeComposer: shouldShowWriterPrompt ? <AgentV2WriterPrompt /> : undefined,
    bottomStickDependency: activity,
  }), [acceptConsent, activity, isConsentAccepted, shouldShowWriterPrompt]);
  const actions = useMemo(() => ({
    onBack: switchToWallet,
    onClearChat: clearChat,
    onScroll,
  }), [clearChat, onScroll, switchToWallet]);

  return (
    <AgentConversationShell
      isActive={isActive}
      animationLevel={animationLevel}
      conversation={conversation}
      composer={composer}
      history={history}
      slots={slots}
      actions={actions}
    />
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    animationLevel: global.settings.animationLevel,
  };
})(AgentV2Classic));
