import type { TeactNode } from '../../lib/teact/teact';
import React, { memo } from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import type { AgentHint, AgentMessage, AnimationLevel } from '../../global/types';
import type {
  AgentConversation,
  AgentConversationComposer,
  AgentConversationComposerHeightContext,
} from './AgentConversationShell';

import {
  disableStrict, enableStrict, setHandler, setPhase,
} from '../../lib/fasterdom/stricterdom';

import { AgentV2AssistantText } from '../agentV2/AgentV2Conversation';
import AgentConversationShell from './AgentConversationShell';

jest.mock('../../hooks/useLang', () => ({
  __esModule: true,
  default: () => Object.assign((key: string) => key, { isRtl: false }),
}));
jest.mock('../../util/dateFormat', () => ({
  ...jest.requireActual('../../util/dateFormat'),
  formatHumanDay: () => 'DATE_SEPARATOR',
}));

const MESSAGE: AgentMessage = {
  id: 1,
  text: 'Hello',
  isOutgoing: false,
  timestamp: Date.UTC(2026, 7, 11),
};

const SECOND_MESSAGE: AgentMessage = {
  ...MESSAGE,
  id: 2,
  text: 'Second answer',
  timestamp: MESSAGE.timestamp + 1,
};

const HINT: AgentHint = {
  id: 'hint-1',
  langCode: 'en',
  title: 'Hint title',
  subtitle: 'Hint subtitle',
  prompt: 'Hint prompt',
};
const messageRenderSpy = jest.fn();

const MemoizedTestMessage = memo(function MemoizedTestMessage({
  message,
  onEdit,
}: {
  message: AgentMessage;
  onEdit: (id: number, text: string) => void;
}) {
  messageRenderSpy(message.id);

  return (
    <button type="button" data-message-id={message.id} onClick={() => onEdit(message.id, message.text)}>
      {message.text}
    </button>
  );
});

interface RenderShellOptions {
  isActive?: boolean;
  animationLevel?: AnimationLevel;
  messages?: AgentMessage[];
  hints?: AgentHint[];
  isInitialLoadComplete?: boolean;
  isInputDisabled?: boolean;
  textRevealPresentations?: AgentConversation['textRevealPresentations'];
  noComposer?: boolean;
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  historyMode?: 'continuous' | 'windowed';
  conversationSlot?: TeactNode;
  messageListFooter?: TeactNode;
  beforeComposerSlot?: TeactNode;
  bottomStickDependency?: unknown;
  loadOlderMessages?: () => void | Promise<void>;
  onBack?: NoneToVoidFunction;
  onSendMessage?: AgentConversationComposer['onSendMessage'];
  onSendHint?: AgentConversationComposer['onSendHint'];
  onClearChat?: NoneToVoidFunction;
  onComposerReset?: NoneToVoidFunction;
  onComposerHeightChange?: (height: number, context: AgentConversationComposerHeightContext) => void;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  renderMessage?: AgentConversation['renderMessage'];
  renderComposer?: AgentConversationComposer['render'];
}

let nextAnimationFrameId = 0;
let pendingAnimationFrames = new Map<number, FrameRequestCallback>();

describe('AgentConversationShell', () => {
  let root: HTMLDivElement;
  let portals: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    messageRenderSpy.mockClear();
    pendingAnimationFrames = new Map();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextAnimationFrameId;
      pendingAnimationFrames.set(id, callback);
      return id;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      pendingAnimationFrames.delete(id);
    });
    root = document.createElement('div');
    portals = document.createElement('div');
    portals.id = 'portals';
    document.body.appendChild(root);
    document.body.appendChild(portals);
  });

  afterEach(async () => {
    TeactDOM.render(undefined, root);
    await flushUi();
    root.remove();
    portals.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('preserves V1 composer, edit, send, hints, date-separator, and clear behavior', async () => {
    const onSendMessage = jest.fn();
    const onSendHint = jest.fn();
    const onClearChat = jest.fn();
    let messageContext: Parameters<AgentConversation['renderMessage']>[1] | undefined;

    renderShell({
      messages: [MESSAGE, SECOND_MESSAGE],
      hints: [HINT],
      onSendMessage,
      onSendHint,
      onClearChat,
      renderMessage: (message, context) => {
        messageContext = context;
        return <div key={message.id} data-message-id={message.id}>{message.text}</div>;
      },
      renderComposer: (props) => (
        <div>
          <span data-composer-value>{props.inputValue}</span>
          <button type="button" data-fill onClick={() => props.onInput('New question')}>Fill</button>
          <button type="button" data-send onClick={props.onSend}>Send</button>
          <button type="button" data-hints onClick={props.onHintsToggle}>Hints</button>
        </div>
      ),
    });
    await flushUi();

    expect(root.querySelector('[data-message-id="1"]')?.textContent).toBe('Hello');
    expect(root.textContent).toContain('DATE_SEPARATOR');
    expect(messageContext).toBeDefined();

    messageContext!.onEditMessage(1, 'Edited question');
    await flushUi();
    expect(root.querySelector('[data-composer-value]')?.textContent).toBe('Edited question');

    (root.querySelector('[data-fill]') as HTMLButtonElement).click();
    await flushUi();
    (root.querySelector('[data-send]') as HTMLButtonElement).click();
    await flushUi();
    expect(onSendMessage).toHaveBeenCalledWith('New question', 1);
    expect(root.querySelector('[data-composer-value]')?.textContent).toBe('');

    (root.querySelector('[data-hints]') as HTMLButtonElement).click();
    await flushUi();
    const hintButton = Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(HINT.title));
    expect(hintButton).toBeDefined();
    hintButton!.click();
    await flushUi();
    expect(onSendHint).toHaveBeenCalledWith(HINT);

    (root.querySelector('[aria-label="Open Menu"]') as HTMLButtonElement).click();
    await flushUi();
    const clearMenuItem = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Clear Chat'));
    expect(clearMenuItem).toBeDefined();
    clearMenuItem!.click();
    await flushUi();
    (document.getElementById('agent-clear-chat-confirm') as HTMLButtonElement).click();
    await flushUi();
    expect(onClearChat).toHaveBeenCalledTimes(1);
  });

  it('lets a message control focus the composer inside the click gesture', async () => {
    renderShell({
      messages: [MESSAGE],
      renderMessage: (message, context) => (
        <button
          key={message.id}
          type="button"
          data-focus-composer
          onClick={context.onFocusComposer}
        >
          Continue
        </button>
      ),
      renderComposer: (props) => (
        <textarea
          ref={props.inputRef}
          data-composer
          value={props.inputValue}
          onInput={() => undefined}
        />
      ),
    });
    await flushUi();

    (root.querySelector('[data-focus-composer]') as HTMLButtonElement).click();

    expect(document.activeElement).toBe(root.querySelector('[data-composer]'));
  });

  it('lets the submit owner consume a composer extension before it is reset', async () => {
    let composerExtension: { scenario: string } | undefined = { scenario: 'prepare-swap' };
    let submittedExtension: { scenario: string } | undefined;
    const onComposerReset = jest.fn(() => {
      composerExtension = undefined;
    });
    const onSendMessage = jest.fn(() => {
      submittedExtension = composerExtension;
      composerExtension = undefined;
    });

    renderShell({
      onComposerReset,
      onSendMessage,
      renderComposer: (props) => (
        <div>
          <button type="button" data-fill onClick={() => props.onInput('2.5')}>Fill</button>
          <button type="button" data-send onClick={props.onSend}>Send</button>
        </div>
      ),
    });
    await flushUi();

    (root.querySelector('[data-fill]') as HTMLButtonElement).click();
    await flushUi();
    (root.querySelector('[data-send]') as HTMLButtonElement).click();
    await flushUi();

    expect(onSendMessage).toHaveBeenCalledWith('2.5', undefined);
    expect(submittedExtension).toEqual({ scenario: 'prepare-swap' });
    expect(composerExtension).toBeUndefined();
    expect(onComposerReset).not.toHaveBeenCalled();
  });

  it('renders extension slots and keeps continuous remote pagination', async () => {
    const loadOlderMessages = jest.fn();

    renderShell({
      messages: [MESSAGE],
      hasOlderMessages: true,
      loadOlderMessages,
      historyMode: 'continuous',
      messageListFooter: <div data-activity-slot>Working</div>,
      beforeComposerSlot: <div data-limit-slot>Limit</div>,
      renderMessage: (message) => (
        <AgentV2AssistantText
          key={message.id}
          messageId={message.id}
          text={message.text}
          isStreaming={false}
          shouldAnimate={false}
        />
      ),
      renderComposer: () => <div data-v2-composer>Composer</div>,
    });

    const messagesElement = root.querySelector('.custom-scroll') as HTMLDivElement;
    Object.defineProperties(messagesElement, {
      scrollTop: { configurable: true, value: 0 },
      scrollHeight: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 200 },
    });
    await flushUi();

    expect(root.querySelector('[data-activity-slot]')?.textContent).toBe('Working');
    expect(root.querySelector('[data-limit-slot]')?.textContent).toBe('Limit');
    expect(root.querySelector('[data-v2-composer]')?.textContent).toBe('Composer');
    expect(loadOlderMessages).toHaveBeenCalled();
  });

  it('scrolls to reveal follow-up controls after animated text settles', async () => {
    const messages = [MESSAGE];
    const renderMessage: AgentConversation['renderMessage'] = (message, context) => (
      <div key={message.id} data-message-id={message.id}>
        {message.text}
        {context.textRevealPresentation?.status === 'settled' && (
          <div data-followups>Follow-ups</div>
        )}
      </div>
    );
    const activePresentation = {
      [MESSAGE.id]: { key: 'reveal-1', status: 'active' as const, shouldRevealFromStart: true },
    };

    renderShell({ messages, textRevealPresentations: activePresentation, noComposer: true, renderMessage });
    await flushUi();

    const messagesElement = root.querySelector('.custom-scroll') as HTMLDivElement;
    let scrollHeight = 500;
    let scrollTop = 300;
    const directScrollAssignments = jest.fn((value: number) => {
      scrollTop = value;
    });
    const scrollTo = jest.fn(({ top }: ScrollToOptions) => {
      scrollTop = top ?? scrollTop;
    });
    Object.defineProperties(messagesElement, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: directScrollAssignments,
      },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 200 },
      scrollTo: { configurable: true, value: scrollTo },
    });

    scrollHeight = 550;
    renderShell({
      messages,
      textRevealPresentations: {
        [MESSAGE.id]: { ...activePresentation[MESSAGE.id], status: 'settled' },
      },
      noComposer: true,
      renderMessage,
    });
    await flushUi();

    expect(root.querySelector('[data-followups]')).not.toBeNull();
    expect(scrollTop).toBe(scrollHeight);
    expect(directScrollAssignments).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: scrollHeight, behavior: 'instant' });
  });

  it('does not rerender an unchanged message when another message streams', async () => {
    const renderMessage: AgentConversation['renderMessage'] = (message, context) => (
      <MemoizedTestMessage key={message.id} message={message} onEdit={context.onEditMessage} />
    );

    renderShell({ messages: [MESSAGE, SECOND_MESSAGE], noComposer: true, renderMessage });
    await flushUi();
    expect(messageRenderSpy.mock.calls).toEqual([[MESSAGE.id], [SECOND_MESSAGE.id]]);

    messageRenderSpy.mockClear();
    renderShell({
      messages: [MESSAGE, { ...SECOND_MESSAGE, text: 'Streaming update', isStreaming: true }],
      noComposer: true,
      renderMessage,
    });
    await flushUi();

    expect(messageRenderSpy.mock.calls).toEqual([[SECOND_MESSAGE.id]]);
  });

  it('keeps shared active-state ownership around a replacement body', async () => {
    renderShell({ conversationSlot: <div data-consent-slot>Consent</div> });
    await flushUi();

    expect(document.documentElement.classList.contains('is-agent-active')).toBe(true);
    expect(root.textContent).toContain('Agent');
    expect(root.querySelector('[data-consent-slot]')?.textContent).toBe('Consent');
    expect(root.querySelector('[aria-label="Open Menu"]')).toBeNull();
    expect(root.querySelector('textarea')).toBeNull();
  });

  it('opens an initialized conversation at the bottom without implicit smooth scrolling', async () => {
    const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
    const errors: Error[] = [];

    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
    disableStrict();
    setPhase('measure');
    setHandler((error) => errors.push(error));
    enableStrict();

    try {
      setPhase('mutate');
      renderShell({ messages: [MESSAGE] });
      const messagesElement = root.querySelector('.custom-scroll') as HTMLDivElement;
      let scrollTop = 0;
      const directScrollAssignments = jest.fn((value: number) => {
        scrollTop = value;
      });
      const scrollTo = jest.fn(({ top }: ScrollToOptions) => {
        scrollTop = top ?? scrollTop;
      });
      Object.defineProperties(messagesElement, {
        scrollTop: {
          configurable: true,
          get: () => scrollTop,
          set: directScrollAssignments,
        },
        scrollHeight: { configurable: true, value: 500 },
        scrollTo: { configurable: true, value: scrollTo },
      });
      await Promise.resolve();
      setPhase('measure');
      await flushUi();

      expect(errors).toEqual([]);
      expect(scrollTop).toBe(500);
      expect(directScrollAssignments).not.toHaveBeenCalled();
      expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'instant' });
    } finally {
      disableStrict();
      setHandler();
      setPhase('measure');
      restoreProperty(Element.prototype, 'scrollTo', originalScrollTo);
    }
  });

  it('keeps a long V1 conversation bounded while navigating earlier history', async () => {
    const messages = Array.from({ length: 100 }, (_, index): AgentMessage => ({
      ...MESSAGE,
      id: index + 1,
      text: `Message ${index + 1}`,
      timestamp: MESSAGE.timestamp + index,
    }));
    const loadOlderMessages = jest.fn();
    const renderLongConversation = (isLoadingOlderMessages: boolean) => renderShell({
      messages,
      hasOlderMessages: true,
      isLoadingOlderMessages,
      loadOlderMessages,
      noComposer: true,
      renderMessage: (message) => (
        <div key={message.id} data-message-id={message.id}>{message.text}</div>
      ),
    });

    renderLongConversation(false);
    const messagesElement = root.querySelector('.custom-scroll') as HTMLDivElement;
    Object.defineProperties(messagesElement, {
      scrollTop: { configurable: true, writable: true, value: 0 },
      scrollHeight: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 900 },
      offsetHeight: { configurable: true, value: 900 },
    });
    await flushUi();

    renderLongConversation(true);
    await flushUi();
    renderLongConversation(false);
    await flushUi();

    const renderedIds = Array.from(root.querySelectorAll<HTMLElement>('[data-message-id]'))
      .map(({ dataset }) => Number(dataset.messageId));
    expect(renderedIds).toHaveLength(60);
    expect(renderedIds.at(-1)).toBe(100);
  });

  function renderShell({
    isActive = true,
    animationLevel = 0,
    messages = [],
    hints,
    isInitialLoadComplete = true,
    isInputDisabled = false,
    textRevealPresentations = {},
    noComposer = false,
    hasOlderMessages = false,
    isLoadingOlderMessages = false,
    historyMode = 'windowed',
    conversationSlot,
    messageListFooter,
    beforeComposerSlot,
    bottomStickDependency,
    loadOlderMessages = jest.fn(),
    onBack = jest.fn(),
    onSendMessage = jest.fn(),
    onSendHint = jest.fn(),
    onClearChat = jest.fn(),
    onComposerReset,
    onComposerHeightChange,
    onScroll,
    renderMessage = (message) => <div key={message.id}>{message.text}</div>,
    renderComposer,
  }: RenderShellOptions = {}) {
    TeactDOM.render(
      <AgentConversationShell
        isActive={isActive}
        animationLevel={animationLevel}
        conversation={{
          messages,
          hints,
          isInitialLoadComplete,
          textRevealPresentations,
          renderMessage,
        }}
        composer={{
          isDisabled: isInputDisabled,
          shouldHide: noComposer,
          onSendMessage,
          onSendHint,
          onReset: onComposerReset,
          onHeightChange: onComposerHeightChange,
          render: renderComposer,
        }}
        history={hasOlderMessages ? {
          hasOlderMessages,
          isLoading: isLoadingOlderMessages,
          mode: historyMode,
          loadOlderMessages,
        } : undefined}
        slots={{
          body: conversationSlot,
          messageListFooter,
          beforeComposer: beforeComposerSlot,
          bottomStickDependency,
        }}
        actions={{ onBack, onClearChat, onScroll }}
      />,
      root,
    );
  }
});

async function flushUi() {
  for (let i = 0; i < 20; i++) {
    await jest.advanceTimersByTimeAsync(20);
    const callbacks = Array.from(pendingAnimationFrames.values());
    pendingAnimationFrames.clear();
    callbacks.forEach((callback) => callback(i * 16));
    await Promise.resolve();
  }
}

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}
