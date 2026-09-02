import type { ElementRef, FC } from '../../lib/teact/teact';
import React, { memo, useMemo, useRef } from '../../lib/teact/teact';

import type {
  AgentActionProposal,
  AgentPersistedActionV2,
  AgentPublicFollowUpV2,
  AgentPublicInputContinuationV1,
} from '../../api/agentV2/protocol/types';
import type { AgentV2WalletConversationControl } from '../../api/agentV2/types';
import type { AgentMessage, IAnchorPosition } from '../../global/types';
import type { Layout } from '../../hooks/useMenuPosition';
import type { DropdownItem } from '../ui/Dropdown';
import type { TextRevealPresentation } from './hooks/textRevealPresentation';

import buildClassName from '../../util/buildClassName';
import { copyTextToClipboard } from '../../util/clipboard';
import { processDeeplink } from '../../util/deeplink';
import { SELF_PROTOCOL } from '../../util/deeplink/constants';
import { parseMarkdownActions } from '../../util/renderMarkdown';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import { useDeviceScreen } from '../../hooks/useDeviceScreen';
import useLastCallback from '../../hooks/useLastCallback';

import DropdownMenu from '../ui/DropdownMenu';
import MenuBackdrop from '../ui/MenuBackdrop';
import IncomingMessage from './IncomingMessage';

import styles from './MessageBubble.module.scss';

export interface AgentV2IncomingMessageProps {
  message: AgentMessage;
  visibleIncomingText: string;
  contentRef: ElementRef<HTMLDivElement>;
  isDisabled: boolean;
  shouldAnimateTextStreaming: boolean;
  textRevealPresentation?: TextRevealPresentation;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onFollowup?: (messageId: number, followup: AgentPublicFollowUpV2) => void;
  onInputContinuation?: (messageId: number, continuation: AgentPublicInputContinuationV1) => void;
  onWalletControl?: (messageId: number, control: AgentV2WalletConversationControl) => void;
  onAction?: (
    messageId: number,
    action: AgentActionProposal | AgentPersistedActionV2,
  ) => void;
  onRetry?: (messageId: number) => void;
  onTextRevealSessionConsumed?: (messageId: number, key: string) => void;
  onTextRevealSessionSettled?: (messageId: number, key: string) => void;
  onTextRevealProgress?: NoneToVoidFunction;
  onTextRevealComplete?: NoneToVoidFunction;
}

interface OwnProps {
  message: AgentMessage;
  areLinksEnabled: boolean;
  isDisabled: boolean;
  incomingMessageComponent?: FC<AgentV2IncomingMessageProps>;
  shouldRenderStreamingText?: boolean;
  shouldAnimateTextStreaming?: boolean;
  textRevealPresentation?: TextRevealPresentation;
  onEdit?: (id: number, text: string) => void;
  onFollowup?: (messageId: number, followup: AgentPublicFollowUpV2) => void;
  onInputContinuation?: (messageId: number, continuation: AgentPublicInputContinuationV1) => void;
  onWalletControl?: (messageId: number, control: AgentV2WalletConversationControl) => void;
  onAction?: (
    messageId: number,
    action: AgentActionProposal | AgentPersistedActionV2,
  ) => void;
  onRetry?: (messageId: number) => void;
  onTextRevealSessionConsumed?: (messageId: number, key: string) => void;
  onTextRevealSessionSettled?: (messageId: number, key: string) => void;
  onTextRevealProgress?: NoneToVoidFunction;
  onTextRevealComplete?: NoneToVoidFunction;
}

type ContextMenuHandler = 'copy' | 'edit';

const INCOMING_MENU_ITEMS: DropdownItem<ContextMenuHandler>[] = [
  { value: 'copy', name: 'Copy Text', fontIcon: 'menu-copy' },
];

const OUTGOING_MENU_ITEMS: DropdownItem<ContextMenuHandler>[] = [
  { value: 'copy', name: 'Copy Text', fontIcon: 'menu-copy' },
  { value: 'edit', name: 'Edit Message', fontIcon: 'menu-rename' },
];

const CONTEXT_MENU_VERTICAL_SHIFT_PX = 4;
export const MESSAGE_LIST_ITEM_SELECTOR = `.${styles.message}`;

function MessageBubble({
  message,
  areLinksEnabled,
  isDisabled,
  shouldRenderStreamingText = false,
  shouldAnimateTextStreaming = false,
  incomingMessageComponent: IncomingMessageComponent,
  textRevealPresentation,
  onEdit,
  onFollowup,
  onInputContinuation,
  onWalletControl,
  onAction,
  onRetry,
  onTextRevealSessionConsumed,
  onTextRevealSessionSettled,
  onTextRevealProgress,
  onTextRevealComplete,
}: OwnProps) {
  const {
    id, text, isOutgoing, isTyping, isStreaming, semanticContent, actions,
    walletControls, followups, inputContinuations, error,
  } = message;
  const hasCustomIncomingContent = !isOutgoing && Boolean(IncomingMessageComponent && (
    semanticContent || walletControls || actions?.length || followups?.length || inputContinuations?.length
  ));
  const { isPortrait } = useDeviceScreen();
  const ref = useRef<HTMLDivElement>();
  const menuRef = useRef<HTMLDivElement>();
  const { buttons, renderableText } = useMemo(() => parseMarkdownActions(text, {
    areLinksEnabled,
    shouldBufferIncompleteAction: Boolean(isStreaming),
  }), [areLinksEnabled, isStreaming, text]);
  const hasBufferedAction = Boolean(isStreaming && renderableText !== text && buttons.length === 0);
  const hasRenderableText = Boolean(renderableText.trim());
  const visibleIncomingText = hasRenderableText || (!buttons.length && !hasBufferedAction) ? renderableText : '👇';
  const shouldRenderIncomingBubble = Boolean(isTyping || visibleIncomingText || buttons.length);
  const isVisuallyEmpty = !isOutgoing && !shouldRenderIncomingBubble && !hasCustomIncomingContent && !error;

  const {
    isContextMenuOpen,
    contextMenuAnchor,
    handleBeforeContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  } = useContextMenuHandlers({
    elementRef: ref,
    shouldDisablePropagation: true,
  });

  const getRootElement = useLastCallback(() => document.body);
  const getMenuElement = useLastCallback(() => menuRef.current);
  const getLayout = useLastCallback((): Layout => ({
    withPortal: true,
    topShiftY: CONTEXT_MENU_VERTICAL_SHIFT_PX,
    preferredPositionX: 'left',
  }));

  const handleContextMenuAction = useLastCallback((value: ContextMenuHandler) => {
    if (value === 'copy') {
      void copyTextToClipboard(text);
    } else if (value === 'edit') {
      onEdit?.(id, text);
    }
  });

  const handleDeeplinkButtonClick = useLastCallback((url: string) => {
    if (url.startsWith(SELF_PROTOCOL)) {
      void processDeeplink(url);
    }
  });

  function renderContextMenu(menuAnchor?: IAnchorPosition) {
    if (!menuAnchor) return undefined;

    return (
      <DropdownMenu<ContextMenuHandler>
        ref={menuRef}
        isOpen={isContextMenuOpen}
        withPortal
        shouldTranslateOptions
        items={isOutgoing ? OUTGOING_MENU_ITEMS : INCOMING_MENU_ITEMS}
        menuAnchor={menuAnchor}
        getRootElement={getRootElement}
        getMenuElement={getMenuElement}
        getLayout={getLayout}
        onSelect={handleContextMenuAction}
        onClose={handleContextMenuClose}
        onCloseAnimationEnd={handleContextMenuHide}
      />
    );
  }

  return (
    <div
      className={buildClassName(
        styles.message,
        isOutgoing ? styles.messageOutgoing : styles.messageIncoming,
        isVisuallyEmpty && styles.messageEmpty,
      )}
      data-agent-v2-message-id={shouldRenderStreamingText ? String(id) : undefined}
      data-agent-v2-message-role={shouldRenderStreamingText ? (isOutgoing ? 'user' : 'assistant') : undefined}
      data-agent-v2-message-status={shouldRenderStreamingText
        ? (isTyping || isStreaming ? 'streaming' : error ? 'error' : 'complete')
        : undefined}
    >
      {isPortrait && (
        <MenuBackdrop isMenuOpen={isContextMenuOpen} contentRef={ref} />
      )}
      {isOutgoing ? (
        <div
          ref={ref as ElementRef<HTMLDivElement>}
          onMouseDown={handleBeforeContextMenu}
          onContextMenu={handleContextMenu}
          className={buildClassName(styles.bubble, styles.outgoing)}
        >
          {text}
        </div>
      ) : IncomingMessageComponent ? (
        <IncomingMessageComponent
          message={message}
          visibleIncomingText={visibleIncomingText}
          contentRef={ref}
          isDisabled={isDisabled}
          shouldAnimateTextStreaming={shouldAnimateTextStreaming}
          textRevealPresentation={textRevealPresentation}
          onMouseDown={handleBeforeContextMenu}
          onContextMenu={handleContextMenu}
          onFollowup={onFollowup}
          onInputContinuation={onInputContinuation}
          onWalletControl={onWalletControl}
          onAction={onAction}
          onRetry={onRetry}
          onTextRevealSessionConsumed={onTextRevealSessionConsumed}
          onTextRevealSessionSettled={onTextRevealSessionSettled}
          onTextRevealProgress={onTextRevealProgress}
          onTextRevealComplete={onTextRevealComplete}
        />
      ) : (
        <IncomingMessage
          key={getIncomingMessageKey(textRevealPresentation)}
          messageId={id}
          text={visibleIncomingText}
          isTyping={isTyping}
          isStreaming={isStreaming}
          shouldAnimateTextStreaming={shouldAnimateTextStreaming}
          textRevealPresentation={textRevealPresentation}
          buttons={buttons}
          contentRef={ref}
          onMouseDown={handleBeforeContextMenu}
          onContextMenu={handleContextMenu}
          onActionClick={handleDeeplinkButtonClick}
          onTextRevealSessionConsumed={onTextRevealSessionConsumed}
          onTextRevealSessionSettled={onTextRevealSessionSettled}
          onTextRevealProgress={onTextRevealProgress}
          onTextRevealComplete={onTextRevealComplete}
        />
      )}
      {renderContextMenu(contextMenuAnchor)}
    </div>
  );
}

export function getIncomingMessageKey(presentation?: TextRevealPresentation) {
  if (!presentation) return 'static';
  if (presentation.status === 'error') return `${presentation.key}:error`;
  return presentation.key;
}

export default memo(MessageBubble);
