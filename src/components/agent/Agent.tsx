import React, { memo, useEffect, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { AgentHint, AnimationLevel } from '../../global/types';

import { fetchAgentHints } from '../../util/agent/agentApi';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import { useAgentV1Messages } from './hooks/useAgentMessages';

import AgentConversationShell from './AgentConversationShell';
import MessageBubble from './MessageBubble';

interface OwnProps {
  isActive: boolean;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

interface StateProps {
  animationLevel: AnimationLevel;
  agentHints?: AgentHint[];
  agentMessageCount?: number;
}

function Agent({
  isActive,
  animationLevel,
  agentHints,
  agentMessageCount,
  onScroll,
}: OwnProps & StateProps) {
  const { setAgentHints, switchToWallet } = getActions();
  const lang = useLang();
  const {
    messages,
    hints,
    isInitialLoadComplete,
    isInputDisabled,
    textRevealPresentations,
    sendMessage,
    consumeTextRevealSession,
    settleTextRevealSession,
    clearChat,
  } = useAgentV1Messages({
    isActive,
    lang,
    agentHints,
    agentMessageCount,
  });

  useEffect(() => {
    void fetchAgentHints(lang.code).then((nextHints) => {
      if (nextHints) setAgentHints({ hints: nextHints });
    });
  }, [lang.code, setAgentHints]);

  const sendHint = useLastCallback((hint: AgentHint) => {
    sendMessage(hint.prompt);
  });

  const renderMessage = useLastCallback((message, context) => (
    <MessageBubble
      key={message.id}
      message={message}
      areLinksEnabled
      isDisabled={isInputDisabled}
      shouldAnimateTextStreaming={context.shouldAnimateTextStreaming}
      textRevealPresentation={context.textRevealPresentation}
      onEdit={context.onEditMessage}
      onTextRevealSessionConsumed={consumeTextRevealSession}
      onTextRevealSessionSettled={settleTextRevealSession}
      onTextRevealProgress={context.onTextRevealProgress}
      onTextRevealComplete={context.onTextRevealProgress}
    />
  ));

  const conversation = useMemo(() => ({
    messages,
    hints,
    isInitialLoadComplete,
    textRevealPresentations,
    renderMessage,
  }), [hints, isInitialLoadComplete, messages, renderMessage, textRevealPresentations]);
  const composer = useMemo(() => ({
    isDisabled: isInputDisabled,
    onSendMessage: sendMessage,
    onSendHint: sendHint,
  }), [isInputDisabled, sendHint, sendMessage]);
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
      actions={actions}
    />
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    animationLevel: global.settings.animationLevel,
    agentHints: global.agentHints,
    agentMessageCount: global.agentMeta?.messageCount,
  };
})(Agent));
