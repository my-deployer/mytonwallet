import type { TeactNode } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { removeExtraClass, toggleExtraClass } from '../../lib/teact/teact-dom';

import type { AgentHint, AgentMessage, AnimationLevel } from '../../global/types';
import type { TextRevealPresentation, TextRevealPresentations } from './hooks/textRevealPresentation';
import { LoadMoreDirection } from '../../global/types';

import { ANIMATION_LEVEL_MIN } from '../../config';
import { requestForcedReflow, requestMeasure, requestMutation } from '../../lib/fasterdom/fasterdom';
import buildClassName from '../../util/buildClassName';
import { formatHumanDay } from '../../util/dateFormat';
import { stopEvent } from '../../util/domEvents';
import { openUrl } from '../../util/openUrl';
import buildMessageIds, { DATE_ITEM_ID_PREFIX } from './helpers/buildMessageIds';

import useFlag from '../../hooks/useFlag';
import useHistoryBack from '../../hooks/useHistoryBack';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useScrolledState from '../../hooks/useScrolledState';
import useShowTransition from '../../hooks/useShowTransition';
import useScrollResetOnResize from './hooks/useScrollResetOnResize';
import useScrollToBottomOnReveal from './hooks/useScrollToBottomOnReveal';
import useShouldAnimateText from './hooks/useShouldAnimateText';

import InfiniteScroll from '../ui/InfiniteScroll';
import AgentHeader from './AgentHeader';
import AgentHints from './AgentHints';
import AgentInputBar from './AgentInputBar';
import ClearAgentChatModal from './ClearAgentChatModal';
import { MESSAGE_LIST_ITEM_SELECTOR } from './MessageBubble';
import ScrollToBottomButton from './ScrollToBottomButton';

import styles from './Agent.module.scss';

const PRELOAD_BACKWARD_SLICE = 30;
const CONTINUOUS_HISTORY_MAX_VIEWPORT_SIZE = 60;
const SCROLL_FLICKER_THRESHOLD = 10;
const SCROLL_BOTTOM_THRESHOLD = 100;
const CLOSE_HINTS_DURATION = 250;
const BOTTOM_STICK_LAYOUT_PASSES = 2;

export interface AgentConversationMessageContext {
  shouldAnimateTextStreaming: boolean;
  textRevealPresentation?: TextRevealPresentation;
  onEditMessage: (id: number, text: string) => void;
  onFocusComposer: NoneToVoidFunction;
  onTextRevealProgress: NoneToVoidFunction;
  onRequestBottomStick: NoneToVoidFunction;
}

export interface AgentConversationComposerProps {
  inputRef: React.RefObject<HTMLTextAreaElement | undefined>;
  inputValue: string;
  hints?: AgentHint[];
  isDisabled: boolean;
  onInput: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSend: NoneToVoidFunction;
  onClearInput: NoneToVoidFunction;
  onHintsToggle: NoneToVoidFunction;
  onHeightChange?: (height: number) => void;
}

export interface AgentConversationComposerHeightContext {
  messagesElement: HTMLDivElement;
  getIsAtBottom: () => boolean;
  onTextRevealProgress: NoneToVoidFunction;
}

export interface AgentConversation {
  messages: AgentMessage[];
  hints?: AgentHint[];
  isInitialLoadComplete: boolean;
  textRevealPresentations: TextRevealPresentations;
  renderMessage: (message: AgentMessage, context: AgentConversationMessageContext) => TeactNode;
}

export interface AgentConversationComposer {
  isDisabled: boolean;
  shouldHide?: boolean;
  onSendMessage: (text: string, editingMessageId?: number) => void;
  onSendHint: (hint: AgentHint) => void;
  onReset?: NoneToVoidFunction;
  onHeightChange?: (height: number, context: AgentConversationComposerHeightContext) => void;
  render?: (props: AgentConversationComposerProps) => TeactNode;
}

export interface AgentConversationHistory {
  hasOlderMessages: boolean;
  isLoading: boolean;
  mode: 'continuous' | 'windowed';
  loadOlderMessages: () => void | Promise<void>;
}

export interface AgentConversationSlots {
  body?: TeactNode;
  messageListFooter?: TeactNode;
  beforeComposer?: TeactNode;
  bottomStickDependency?: unknown;
}

export interface AgentConversationActions {
  onBack: NoneToVoidFunction;
  onClearChat: NoneToVoidFunction;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

export interface AgentConversationShellProps {
  isActive: boolean;
  animationLevel: AnimationLevel;
  conversation: AgentConversation;
  composer: AgentConversationComposer;
  history?: AgentConversationHistory;
  slots?: AgentConversationSlots;
  actions: AgentConversationActions;
}

function AgentConversationShell({
  isActive,
  animationLevel,
  conversation,
  composer,
  history,
  slots,
  actions,
}: AgentConversationShellProps) {
  const {
    messages, hints, isInitialLoadComplete, textRevealPresentations, renderMessage,
  } = conversation;
  const {
    isDisabled: isInputDisabled,
    shouldHide: shouldHideComposer = false,
    onSendMessage,
    onSendHint,
    onReset: onComposerReset,
    onHeightChange: onComposerHeightChange,
    render: renderComposer,
  } = composer;
  const {
    onBack, onClearChat, onScroll: onExternalScroll,
  } = actions;
  const hasOlderMessages = history?.hasOlderMessages ?? false;
  const isLoadingOlderMessages = history?.isLoading ?? false;
  const loadOlderMessages = history?.loadOlderMessages;
  const shouldUseContinuousHistory = history?.mode === 'continuous';
  const conversationSlot = slots?.body;
  const messageListFooter = slots?.messageListFooter;
  const beforeComposerSlot = slots?.beforeComposer;
  const bottomStickDependency = slots?.bottomStickDependency;
  const lang = useLang();
  const [inputValue, setInputValue] = useState('');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [areHintsOpen, setAreHintsOpen] = useState(false);
  const [isConfirmClearOpen, openClearConfirm, closeClearConfirm] = useFlag();
  const [isReadyToShow, markReadyToShow] = useFlag();
  const [editingMessageId, setEditingMessageId] = useState<number | undefined>();
  const messagesRef = useRef<HTMLDivElement>();
  const inputRef = useRef<HTMLTextAreaElement>();
  const isAtBottomRef = useRef(true);
  const stickToBottomLayoutPassesRef = useRef(0);
  const pendingHintRef = useRef<AgentHint | undefined>();
  const shouldSmoothNextStickToBottomRef = useRef(false);

  useHistoryBack({ isActive, onBack });
  useScrollResetOnResize(messagesRef, isAtBottomRef);

  useLayoutEffect(() => {
    toggleExtraClass(document.documentElement, 'is-agent-active', isActive);

    return () => {
      removeExtraClass(document.documentElement, 'is-agent-active');
    };
  }, [isActive]);

  const shouldAnimateTextStreaming = useShouldAnimateText(animationLevel);
  const { isScrolled, handleScroll: handleMessagesScroll, update: updateScrolledState } = useScrolledState();

  const requestBottomStick = useLastCallback((shouldSmooth = false) => {
    isAtBottomRef.current = true;
    stickToBottomLayoutPassesRef.current = BOTTOM_STICK_LAYOUT_PASSES;
    shouldSmoothNextStickToBottomRef.current = shouldSmooth;
  });

  const sendSelectedHint = useLastCallback((hint: AgentHint, shouldAnimate = false) => {
    onComposerReset?.();
    requestBottomStick(shouldAnimate);
    onSendHint(hint);
  });

  const flushPendingHint = useLastCallback(() => {
    const hint = pendingHintRef.current;
    pendingHintRef.current = undefined;
    if (hint) sendSelectedHint(hint, true);
  });

  useShowTransition<HTMLDivElement>({
    ref: messagesRef,
    isOpen: areHintsOpen && Boolean(hints?.length),
    className: false,
    prefix: 'hints-',
    closeDuration: CLOSE_HINTS_DURATION,
    onCloseAnimationEnd: flushPendingHint,
  });

  useEffect(() => {
    if (!isInitialLoadComplete || messages.length > 0) return;

    setAreHintsOpen(true);
    setIsScrolledUp(false);
    isAtBottomRef.current = true;
    requestMeasure(() => updateScrolledState(messagesRef.current));
  }, [isInitialLoadComplete, messages.length, updateScrolledState]);

  const allIds = useMemo(() => buildMessageIds(messages), [messages]);
  const messagesById = useMemo(() => {
    const nextMessagesById: Record<number, AgentMessage> = {};

    for (const message of messages) {
      nextMessagesById[message.id] = message;
    }

    return nextMessagesById;
  }, [messages]);

  const [viewportIds, getMore, resetScroll] = useInfiniteScroll({
    loadMoreForwards: hasOlderMessages && !isLoadingOlderMessages ? loadOlderMessages : undefined,
    listIds: allIds.length > 0 ? allIds : undefined,
    isActive,
    startFromEnd: true,
    shouldKeepViewportAtEnd: isAtBottomRef.current || stickToBottomLayoutPassesRef.current > 0,
    shouldPreserveViewport: shouldUseContinuousHistory,
    maxPreservedViewportSize: shouldUseContinuousHistory ? CONTINUOUS_HISTORY_MAX_VIEWPORT_SIZE : undefined,
  });
  const lastAllId = allIds[allIds.length - 1];
  const lastMessage = messages[messages.length - 1];
  const lastViewportId = viewportIds?.[viewportIds.length - 1];
  const isViewportAtEnd = !lastAllId || lastAllId === lastViewportId;

  const scrollToBottom = useLastCallback((isSmooth = false) => {
    requestMeasure(() => {
      const element = messagesRef.current;
      if (!element) return;

      const behavior = isSmooth && animationLevel !== ANIMATION_LEVEL_MIN ? 'smooth' : 'instant';
      element.scrollTo({ top: element.scrollHeight, behavior });
    });
  });

  useLayoutEffect(() => {
    if (isActive && isViewportAtEnd) scrollToBottom();
  }, [isActive, isViewportAtEnd, scrollToBottom]);

  useLayoutEffect(() => {
    if (!isActive || !isInitialLoadComplete || isReadyToShow) return;

    requestForcedReflow(() => {
      const element = messagesRef.current;
      const scrollHeight = element?.scrollHeight;

      return () => {
        if (element && scrollHeight !== undefined) {
          element.scrollTo({ top: scrollHeight, behavior: 'instant' });
        }
        markReadyToShow();
      };
    });
  }, [isActive, isInitialLoadComplete, isReadyToShow, markReadyToShow]);

  useEffect(() => {
    if (!isActive || isViewportAtEnd || !isAtBottomRef.current) return;
    getMore?.({ direction: LoadMoreDirection.Backwards });
  }, [getMore, isActive, isViewportAtEnd, lastAllId, lastViewportId]);

  useEffect(() => {
    if (!isActive || !isInitialLoadComplete || !hasOlderMessages || isLoadingOlderMessages) return;

    requestMeasure(() => {
      const element = messagesRef.current;
      if (element && element.scrollHeight <= element.clientHeight) {
        getMore?.({ direction: LoadMoreDirection.Forwards });
      }
    });
  }, [allIds.length, getMore, hasOlderMessages, isActive, isInitialLoadComplete, isLoadingOlderMessages]);

  const handleTextRevealProgress = useScrollToBottomOnReveal(isAtBottomRef, scrollToBottom);

  const handleScrollToBottomClick = useLastCallback(() => {
    isAtBottomRef.current = true;
    setIsScrolledUp(false);

    if (!isViewportAtEnd) {
      resetScroll?.();
      scrollToBottom();
    } else {
      scrollToBottom(true);
    }
  });

  useLayoutEffect(() => {
    const shouldUseFollowUpSnaps = stickToBottomLayoutPassesRef.current > 0;
    if (shouldUseFollowUpSnaps) stickToBottomLayoutPassesRef.current -= 1;
    if (!shouldUseFollowUpSnaps && !isAtBottomRef.current) return;

    requestForcedReflow(() => {
      const element = messagesRef.current;
      const scrollHeight = element?.scrollHeight;

      return () => {
        if (!element || scrollHeight === undefined) return;

        if (shouldSmoothNextStickToBottomRef.current && animationLevel !== ANIMATION_LEVEL_MIN) {
          shouldSmoothNextStickToBottomRef.current = false;
          requestMeasure(() => scrollToBottom(true));
        } else {
          element.scrollTo({ top: scrollHeight, behavior: 'instant' });
          if (shouldUseFollowUpSnaps) requestMeasure(scrollToBottom);
        }
        isAtBottomRef.current = true;
      };
    });
  }, [
    animationLevel,
    bottomStickDependency,
    lastAllId,
    lastMessage,
    messages,
    scrollToBottom,
    textRevealPresentations,
  ]);

  const handleScroll = useLastCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.target as HTMLDivElement;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    isAtBottomRef.current = distanceToBottom < SCROLL_FLICKER_THRESHOLD;
    setIsScrolledUp(distanceToBottom > SCROLL_BOTTOM_THRESHOLD);
    handleMessagesScroll(event);
    onExternalScroll?.(event);
  });

  const handleSend = useLastCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    const messageId = editingMessageId;
    setInputValue('');
    setEditingMessageId(undefined);
    setAreHintsOpen(false);
    requestBottomStick(true);
    onSendMessage(text, messageId);
  });

  const handleKeyDown = useLastCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    stopEvent(event);
    handleSend();
  });

  const handleInput = useLastCallback((value: string) => {
    setInputValue(value);
    if (!value) setEditingMessageId(undefined);
  });

  const handleClearInput = useLastCallback(() => {
    setInputValue('');
    setEditingMessageId(undefined);
    onComposerReset?.();
    inputRef.current?.focus();
  });

  const handleEditMessage = useLastCallback((id: number, text: string) => {
    setInputValue(text);
    setEditingMessageId(id);
    onComposerReset?.();

    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(text.length, text.length);
    });
  });

  const handleFocusComposer = useLastCallback(() => {
    setEditingMessageId(undefined);
    inputRef.current?.focus();
  });

  const handleHintsToggle = useLastCallback(() => {
    setAreHintsOpen((areOpen) => {
      const shouldOpen = !areOpen;
      if (shouldOpen) {
        pendingHintRef.current = undefined;
        scrollToBottom();
      }
      return shouldOpen;
    });
  });

  const handleHintClick = useLastCallback((hint: AgentHint) => {
    if (document.activeElement) (document.activeElement as HTMLElement).blur();
    setAreHintsOpen(false);

    if (animationLevel === ANIMATION_LEVEL_MIN) {
      pendingHintRef.current = undefined;
      requestMutation(() => sendSelectedHint(hint));
      return;
    }

    pendingHintRef.current = hint;
  });

  const handleConfirmClear = useLastCallback(() => {
    closeClearConfirm();
    setIsScrolledUp(false);
    onComposerReset?.();
    onClearChat();
  });

  const handleMessageLinkClick = useLastCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const href = target.closest('a')?.getAttribute('href');
    if (!href?.startsWith('https://')) return;
    stopEvent(event);
    void openUrl(href);
  });

  useEffect(() => {
    if (!isActive || !onExternalScroll || !messagesRef.current) return;
    const element = messagesRef.current;
    const syntheticEvent = {
      target: element,
      currentTarget: element,
    } as unknown as React.UIEvent<HTMLDivElement>;
    onExternalScroll(syntheticEvent);
  }, [isActive, onExternalScroll]);

  const handleComposerHeightChange = useLastCallback((height: number) => {
    const messagesElement = messagesRef.current;
    if (!messagesElement || !onComposerHeightChange) return;
    onComposerHeightChange(height, {
      messagesElement,
      getIsAtBottom: () => isAtBottomRef.current,
      onTextRevealProgress: handleTextRevealProgress,
    });
  });

  const composerProps: AgentConversationComposerProps = {
    inputRef,
    inputValue,
    hints,
    isDisabled: isInputDisabled,
    onInput: handleInput,
    onKeyDown: handleKeyDown,
    onSend: handleSend,
    onClearInput: handleClearInput,
    onHintsToggle: handleHintsToggle,
    onHeightChange: onComposerHeightChange ? handleComposerHeightChange : undefined,
  };

  function renderItem(id: string) {
    if (id.startsWith(DATE_ITEM_ID_PREFIX)) {
      const timestamp = Number(id.slice(DATE_ITEM_ID_PREFIX.length));
      return <div key={id} className={styles.dateSeparator}>{formatHumanDay(lang, timestamp)}</div>;
    }

    const message = messagesById[Number(id)];
    if (!message) return undefined;

    return renderMessage(message, {
      shouldAnimateTextStreaming,
      textRevealPresentation: textRevealPresentations[message.id],
      onEditMessage: handleEditMessage,
      onFocusComposer: handleFocusComposer,
      onTextRevealProgress: handleTextRevealProgress,
      onRequestBottomStick: requestBottomStick,
    });
  }

  if (conversationSlot !== undefined) {
    return (
      <div className={styles.root}>
        <AgentHeader isScrolled={false} isMenuVisible={false} onClearChat={openClearConfirm} />
        {conversationSlot}
        <ClearAgentChatModal
          isOpen={isConfirmClearOpen}
          onClose={closeClearConfirm}
          onConfirm={handleConfirmClear}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <AgentHeader isScrolled={isScrolled} isMenuVisible={messages.length > 0} onClearChat={openClearConfirm} />

      <InfiniteScroll
        ref={messagesRef}
        className={buildClassName(styles.messages, !isReadyToShow && styles.hidden, 'custom-scroll')}
        items={viewportIds}
        itemSelector={MESSAGE_LIST_ITEM_SELECTOR}
        loadMoreStrategy={shouldUseContinuousHistory ? 'scrollDirection' : 'anchorMovement'}
        preloadBackwards={PRELOAD_BACKWARD_SLICE}
        noScrollRestore={stickToBottomLayoutPassesRef.current > 0}
        onLoadMore={getMore}
        onScroll={handleScroll}
        onClick={handleMessageLinkClick}
      >
        <div key="spacer" className={styles.spacer} />
        {viewportIds?.map(renderItem)}
        {messageListFooter}
        <AgentHints key="hints" isOpen={areHintsOpen} hints={hints} onHintClick={handleHintClick} />
      </InfiniteScroll>

      {!shouldHideComposer && beforeComposerSlot}
      {!shouldHideComposer && (renderComposer ? renderComposer(composerProps) : <AgentInputBar {...composerProps} />)}

      <ScrollToBottomButton
        className={styles.scrollToBottom}
        isVisible={isScrolledUp}
        onClick={handleScrollToBottomClick}
      />

      <ClearAgentChatModal
        isOpen={isConfirmClearOpen}
        onClose={closeClearConfirm}
        onConfirm={handleConfirmClear}
      />
    </div>
  );
}

export default memo(AgentConversationShell);
