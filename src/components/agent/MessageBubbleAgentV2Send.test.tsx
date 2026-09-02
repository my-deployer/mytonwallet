import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import type { AgentActionProposal } from '../../api/agentV2/protocol/types';
import type { AgentV2ActionPresentation } from '../../api/agentV2/types';
import type { AgentMessage } from '../../global/types';

import { pause } from '../../util/schedulers';

import AgentV2IncomingMessage from '../agentV2/AgentV2IncomingMessage';
import MessageBubble from './MessageBubble';

const COPY: Record<string, string> = {
  $agent_notice_wallet_unavailable: 'Wallet data is unavailable right now.',
  $agent_semantic_web_digest: 'Web results',
  $agent_action_review_transfer: 'Review transfer',
  $agent_action_open_receive: 'Open receive',
  $agent_action_open_send: 'Open Send',
  $agent_action_hide_spam: 'Hide spam assets',
  $agent_action_open_link: 'Open link',
  $agent_action_open_token: 'Open token',
  $agent_action_open_transaction: 'Open transaction',
  $agent_action_open_agent: 'Open Agent',
};
const ACTIVE_DRAFT_EXPIRES_AT = new Date(Date.now() + 10 * 60_000).toISOString();

jest.mock('../../hooks/useLang', () => ({
  __esModule: true,
  default: () => (key: string) => COPY[key] ?? key,
}));

describe('MessageBubble Agent V2 actions', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    TeactDOM.render(undefined, root);
    root.remove();
  });

  it('renders prepared Send as the standard action button and invokes the typed action', async () => {
    const action = sendAction();
    const onAction = jest.fn();
    TeactDOM.render(
      <MessageBubble
        message={message(action, sendPresentation())}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toBe('Review transfer');
    expect(root.querySelector('section')).toBeNull();
    const reviewButton = getReviewButton(root);
    expect(reviewButton.disabled).toBe(false);

    reviewButton.click();
    await pause(0);
    expect(onAction).toHaveBeenCalledWith(1, action);
  });

  it('disables prepared Send with parent blocking or an inactive presentation', async () => {
    const action = sendAction();
    const onAction = jest.fn();
    TeactDOM.render(
      <MessageBubble
        message={message(action, sendPresentation())}
        areLinksEnabled={false}
        isDisabled
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    expect(getReviewButton(root).disabled).toBe(true);

    TeactDOM.render(
      <MessageBubble
        message={message(action, { kind: 'inactive' })}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toBe('Review transfer');
    expect(getReviewButton(root).disabled).toBe(true);
    getReviewButton(root).click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps a prepared Send enabled when its expiry is further out than a timer can hold', async () => {
    const action = sendAction();
    // Just past the 32-bit ceiling, where the delay wraps to a negative number and fires at once.
    const farFuture = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();
    TeactDOM.render(
      <MessageBubble
        message={message(action, { ...sendPresentation(), expiresAt: farFuture })}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={jest.fn()}
      />,
      root,
    );
    await pause(20);

    expect(getReviewButton(root).disabled).toBe(false);
  });

  it('disables a prepared Send whose presentation is already expired', async () => {
    const action = sendAction();
    TeactDOM.render(
      <MessageBubble
        message={message(action, { ...sendPresentation(), expiresAt: '2000-01-01T00:00:00.000Z' })}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={jest.fn()}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toBe('Review transfer');
    expect(getReviewButton(root).disabled).toBe(true);
  });

  it('renders every non-Send action and dispatches only after a click', async () => {
    const actions = nonSendActions();
    const onAction = jest.fn();
    TeactDOM.render(
      <MessageBubble
        message={messageWithActions(actions)}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('Open receive');
    expect(root.textContent).toContain('Hide spam assets');
    expect(root.textContent).toContain('Open link');
    expect(root.textContent).toContain('Open token');
    expect(root.textContent).toContain('Open transaction');
    expect(root.textContent).toContain('Open Agent');
    expect(onAction).not.toHaveBeenCalled();

    Array.from(root.querySelectorAll('button')).forEach((button) => button.click());
    await pause(0);

    expect(onAction.mock.calls).toEqual(actions.map((action) => [1, action]));
  });

  it('disables a non-Send action after local resolution marks it inactive', async () => {
    const action = nonSendActions()[0];
    const onAction = jest.fn();
    const inactiveMessage = messageWithActions([action]);
    inactiveMessage.actionPresentations = { [action.id]: { kind: 'inactive' } };

    TeactDOM.render(
      <MessageBubble
        message={inactiveMessage}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    const button = root.querySelector('button')!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders an incomplete Send action as the existing Open Send button', async () => {
    const action = sendFormAction();
    const onAction = jest.fn();
    TeactDOM.render(
      <MessageBubble
        message={message(action, {
          kind: 'send',
          status: 'active',
          network: 'ton',
          accountLabel: 'Main Wallet',
          recipient: { kind: 'savedAddress', label: 'DeFi' },
          feeStatus: 'calculated_in_wallet',
          warningCodes: [],
        })}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        onAction={onAction}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('Open Send');
    expect(root.textContent).not.toContain('Amount—');
    expect(root.textContent).not.toContain('DeFi');
    root.querySelector('button')?.click();
    await pause(0);
    expect(onAction).toHaveBeenCalledWith(1, action);
  });

  it('renders semantic notices as standard incoming text', async () => {
    TeactDOM.render(
      <MessageBubble
        message={{
          id: 1,
          text: '',
          isOutgoing: false,
          timestamp: Date.now(),
          semanticContent: { kind: 'notice', schemaVersion: 1, code: 'wallet_data_unavailable' },
        }}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
      />,
      root,
    );
    await pause(20);

    const incomingMessage = root.querySelector('[data-agent-v2-message-role="assistant"]');
    expect(incomingMessage?.textContent).toBe('Wallet data is unavailable right now.');
    expect(incomingMessage?.querySelector('section')).toBeNull();
  });

  it('renders model-authored deeplinks as passive text', async () => {
    TeactDOM.render(
      <MessageBubble
        message={{
          id: 1,
          text: '[Open Agent](mtw://agent)',
          isOutgoing: false,
          timestamp: Date.now(),
        }}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('Open Agent');
    expect(root.querySelector('button')).toBeNull();
  });

  it('forwards V2 reveal completion after the response settles', async () => {
    const onTextRevealComplete = jest.fn();
    TeactDOM.render(
      <MessageBubble
        message={{
          id: 1,
          text: 'Completed answer',
          isOutgoing: false,
          timestamp: Date.now(),
        }}
        areLinksEnabled={false}
        isDisabled={false}
        incomingMessageComponent={AgentV2IncomingMessage}
        shouldRenderStreamingText
        textRevealPresentation={{
          key: 'v2:1:1',
          status: 'active',
          shouldRevealFromStart: true,
        }}
        onTextRevealComplete={onTextRevealComplete}
      />,
      root,
    );
    await pause(20);

    expect(onTextRevealComplete).toHaveBeenCalledTimes(1);
  });
});

function sendAction() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    kind: 'send' as const,
    labelCode: 'review_transfer' as const,
    draftId: '77777777-7777-4777-8777-777777777777',
    draftExpiresAt: ACTIVE_DRAFT_EXPIRES_AT,
    sourceToolCallId: '88888888-8888-4888-8888-888888888888',
    effect: 'open_wallet_review' as const,
    localDraftRequired: true as const,
    requiresConfirmation: true as const,
  };
}

function sendFormAction(): Extract<AgentActionProposal, { kind: 'send'; effect: 'open_send' }> {
  return {
    id: '66666666-6666-4666-8666-666666666660',
    kind: 'send',
    labelCode: 'open_send',
    effect: 'open_send',
    contextBinding: {
      sessionId: '99999999-9999-4999-8999-999999999999',
      revision: 1,
      activeAccountRef: 'current',
      activeNetwork: 'ton',
    },
    asset: { slug: 'gram', chain: 'ton' },
    recipient: { kind: 'savedAddress', addressRef: 'address-defi' },
    localDraftRequired: false,
    requiresConfirmation: false,
  };
}

function sendPresentation(): Extract<AgentV2ActionPresentation, { kind: 'send' }> {
  return {
    kind: 'send',
    status: 'active',
    amount: { value: '1.5', symbol: 'TON' },
    network: 'ton',
    accountLabel: 'Main Wallet',
    recipient: { kind: 'savedAddress', label: 'Mom' },
    feeStatus: 'calculated_in_wallet',
    warningCodes: ['new_address'],
    expiresAt: ACTIVE_DRAFT_EXPIRES_AT,
  };
}

function message(
  action: Extract<AgentActionProposal, { kind: 'send' }>,
  presentation: AgentV2ActionPresentation,
): AgentMessage {
  return {
    id: 1,
    text: '',
    isOutgoing: false,
    timestamp: Date.now(),
    actions: [action],
    actionPresentations: { [action.id]: presentation },
  };
}

function messageWithActions(actions: AgentActionProposal[]): AgentMessage {
  return {
    id: 1,
    text: '',
    isOutgoing: false,
    timestamp: Date.now(),
    actions,
  };
}

function nonSendActions(): AgentActionProposal[] {
  return [
    {
      id: '66666666-6666-4666-8666-666666666661',
      kind: 'receive',
      labelCode: 'open_receive',
      effect: 'open_receive',
      contextBinding: {
        sessionId: '99999999-9999-4999-8999-999999999999',
        revision: 1,
        activeAccountRef: 'current',
        activeNetwork: 'ton',
      },
      localDraftRequired: false,
      requiresConfirmation: false,
    },
    {
      id: '66666666-6666-4666-8666-666666666662',
      kind: 'hideSpamAssets',
      labelCode: 'hide_spam_assets',
      sourceToolCallId: '88888888-8888-4888-8888-888888888888',
      assetRefs: ['spam-one'],
      contextBinding: {
        sessionId: '99999999-9999-4999-8999-999999999999',
        revision: 1,
        activeAccountRef: 'current',
      },
      effect: 'hide_spam_assets',
      localMutationRequired: true,
      requiresConfirmation: false,
    },
    {
      id: '66666666-6666-4666-8666-666666666663',
      kind: 'openUrl',
      labelCode: 'open_external_link',
      url: 'https://example.com/help',
      requiresConfirmation: true,
    },
    {
      id: '66666666-6666-4666-8666-666666666664',
      kind: 'openToken',
      labelCode: 'open_token',
      slug: 'toncoin',
      chain: 'ton',
      requiresConfirmation: true,
    },
    {
      id: '66666666-6666-4666-8666-666666666665',
      kind: 'openTransaction',
      labelCode: 'open_transaction',
      chain: 'ton',
      transactionRef: 'transaction-hash',
      requiresConfirmation: true,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'openAgent',
      labelCode: 'open_agent',
      entryPoint: { kind: 'agentTab' },
      requiresConfirmation: true,
    },
  ];
}

function getReviewButton(root: HTMLElement) {
  const button = Array.from(root.querySelectorAll('button'))
    .find(({ textContent }) => textContent === 'Review transfer');
  if (!button) throw new Error('Review transfer button was not rendered');
  return button;
}
