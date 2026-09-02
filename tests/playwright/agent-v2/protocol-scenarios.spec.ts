import { expect, getAgentV2Conversation, test } from './fixtures';

test.describe('Agent V2 deterministic protocol scenarios', () => {
  test('shows one active server progress line until the answer starts', async ({ agentV2, page }) => {
    await page.setViewportSize({ width: 1160, height: 447 });
    await agentV2.reset('run-activity');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Research the latest TON update');
    await expect(page.getByRole('status')).toHaveText('Searching the web…');
    await expect(page.getByRole('status')).toHaveText('Reviewing sources…');
    await expect(page.getByRole('status')).toHaveText('Writing the answer…');
    const activityLayout = await page.getByRole('status').evaluate((status) => {
      const conversation = status.closest('.custom-scroll')!;
      const composer = document.querySelector('textarea')!;
      const statusRect = status.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();

      return {
        statusHeight: statusRect.height,
        statusBottom: statusRect.bottom,
        composerTop: composerRect.top,
        childCount: status.children.length,
        distanceToBottom: conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight,
      };
    });
    expect(activityLayout.statusHeight).toBeLessThanOrEqual(24);
    expect(activityLayout.childCount).toBe(2);
    expect(activityLayout.statusBottom).toBeLessThanOrEqual(activityLayout.composerTop);
    expect(activityLayout.distanceToBottom).toBeLessThanOrEqual(1);
    await expect(page.getByText('Answer plan ready', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Relevant sources found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Sources reviewed: 4', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Checking data freshness…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Calculations complete', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Research the latest TON update', { exact: true })).toBeVisible();
    await expect(page.getByText(
      'Deterministic response: Research the latest TON update', { exact: true },
    )).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('keeps conversation position stable as the composer changes height', async ({ agentV2, page }) => {
    await page.setViewportSize({ width: 390, height: 447 });
    await agentV2.reset();
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    const input = page.getByRole('textbox', { name: 'Ask anything' });
    for (let index = 1; index <= 4; index++) {
      const prompt = `Layout message ${index}`;
      await agentV2.send(prompt);
      await expect(page.locator('[data-agent-v2-message-role="assistant"]').filter({
        hasText: `Deterministic response: ${prompt}`,
      }))
        .toHaveAttribute('data-agent-v2-message-status', 'complete');
      await expect(input).toBeEnabled();
    }

    const conversation = getAgentV2Conversation(page);
    const enterMultilineText = async () => {
      const lines = Array.from({ length: 7 }, (_, index) => `Line ${index + 1}`);
      await input.click();
      for (const [index, line] of lines.entries()) {
        if (index) await input.press('Shift+Enter');
        await input.pressSequentially(line);
      }
    };
    const readLayout = () => conversation.evaluate((element) => {
      const composerInput = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Ask anything"]');
      if (!composerInput) throw new Error('Agent composer was not found');

      let composerWrapper: HTMLElement | null = composerInput.parentElement;
      while (composerWrapper && getComputedStyle(composerWrapper).position !== 'absolute') {
        composerWrapper = composerWrapper.parentElement;
      }

      const messages = Array.from(element.querySelectorAll<HTMLElement>('[data-agent-v2-message-role]'));
      const lastMessage = messages.at(-1);
      if (!composerWrapper || !lastMessage) throw new Error('Agent conversation layout was not found');

      const wrapperRect = composerWrapper.getBoundingClientRect();
      return {
        inputHeight: composerInput.getBoundingClientRect().height,
        wrapperHeight: wrapperRect.height,
        paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
        gap: wrapperRect.top - lastMessage.getBoundingClientRect().bottom,
        scrollTop: element.scrollTop,
        distanceToBottom: element.scrollHeight - element.scrollTop - element.clientHeight,
      };
    });

    const singleLine = await readLayout();
    await enterMultilineText();
    await expect.poll(async () => {
      const layout = await readLayout();
      return layout.inputHeight > singleLine.inputHeight
        && layout.wrapperHeight > singleLine.wrapperHeight
        && layout.paddingBottom > singleLine.paddingBottom
        && layout.gap >= -1
        && layout.distanceToBottom <= 1;
    }).toBe(true);
    const multiline = await readLayout();

    expect(multiline.wrapperHeight).toBeGreaterThan(singleLine.wrapperHeight);
    expect(multiline.paddingBottom).toBeGreaterThan(singleLine.paddingBottom);
    expect(multiline.gap).toBeGreaterThanOrEqual(-1);
    expect(multiline.distanceToBottom).toBeLessThanOrEqual(1);

    const quotaButton = page.getByRole('button', { name: /^Agent quota:/u });
    await quotaButton.click();
    await expect(page.getByText(/Daily quota resets in/u)).toBeVisible();
    await expect.poll(async () => {
      const layout = await readLayout();
      return layout.wrapperHeight > multiline.wrapperHeight
        && layout.paddingBottom > multiline.paddingBottom
        && layout.gap >= -1
        && layout.distanceToBottom <= 1;
    }).toBe(true);
    const withQuota = await readLayout();

    expect(withQuota.paddingBottom).toBeGreaterThan(multiline.paddingBottom);
    expect(withQuota.gap).toBeGreaterThanOrEqual(-1);
    expect(withQuota.distanceToBottom).toBeLessThanOrEqual(1);

    await input.fill('');
    await quotaButton.click();
    await expect(page.getByText(/Daily quota resets in/u)).toHaveCount(0);
    await input.click();
    const scrolledUpTop = await conversation.evaluate((element) => {
      const nextScrollTop = (element.scrollHeight - element.clientHeight) / 2;
      element.scrollTo({ top: nextScrollTop, behavior: 'instant' });
      element.dispatchEvent(new Event('scroll'));
      return element.scrollTop;
    });
    expect(scrolledUpTop).toBeGreaterThan(0);

    const collapsed = await readLayout();
    await enterMultilineText();
    await expect.poll(async () => {
      const layout = await readLayout();
      return layout.inputHeight > collapsed.inputHeight
        && layout.paddingBottom > collapsed.paddingBottom;
    }).toBe(true);
    const afterScrolledUpResize = await readLayout();
    expect(afterScrolledUpResize.scrollTop).toBeCloseTo(scrolledUpTop, 0);
  });

  test('retries an admitted quota failure exactly, then starts an independent send', async ({ agentV2, page }) => {
    await agentV2.reset('quota-retry');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('First quota request');
    await expect(page.getByText('Not enough Agent quota', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry request', exact: true }).click();
    await expect(page.getByText('Quota request completed: First quota request', { exact: true })).toBeVisible();

    await agentV2.send('Second independent request');
    await expect(page.getByText('Quota request completed: Second independent request', { exact: true })).toBeVisible();

    const { runBodies } = await agentV2.getState();
    expect(runBodies).toHaveLength(3);
    expect(runBodies[1]).toEqual(runBodies[0]);
    expect(runBodies[2].clientRunId).not.toBe(runBodies[0].clientRunId);
    expect(runBodies[2].input.message.text).toBe('Second independent request');
  });

  test('shows a rejected admission as one assistant message and retries its exact request', async ({
    agentV2,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 447 });
    await agentV2.reset('admission-retry');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Retry after provider recovery');
    await expect(page.getByText('Couldn’t get a response', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent connection was interrupted. Try again.', { exact: true }))
      .toBeVisible();
    await expect(page.locator('[data-agent-v2-message-role="assistant"]')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Couldn’t get a response' })).toHaveCount(0);
    await expect(page.getByText('Retry after provider recovery', { exact: true })).toHaveCount(1);

    const layout = await getAgentV2Conversation(page).evaluate((messages) => {
      const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Ask anything"]');
      const failure = messages.querySelector<HTMLElement>('[data-agent-v2-message-role="assistant"]');
      if (!input || !failure) throw new Error('Agent admission failure layout was not found');
      let composerWrapper: HTMLElement | null = input.parentElement;
      while (composerWrapper && getComputedStyle(composerWrapper).position !== 'absolute') {
        composerWrapper = composerWrapper.parentElement;
      }
      if (!composerWrapper) throw new Error('Agent composer wrapper was not found');
      return composerWrapper.getBoundingClientRect().top - failure.getBoundingClientRect().bottom;
    });
    expect(layout).toBeGreaterThanOrEqual(-1);

    await page.getByRole('button', { name: 'Retry request', exact: true }).click();
    await expect(page.getByText(
      'Recovered response: Retry after provider recovery',
      { exact: true },
    )).toBeVisible();

    const { runBodies } = await agentV2.getState();
    expect(runBodies).toHaveLength(4);
    expect(runBodies.slice(1)).toEqual([runBodies[0], runBodies[0], runBodies[0]]);
  });

  test('does not commit an action or trailing events after a terminal stream error', async ({ agentV2, page }) => {
    await agentV2.reset('terminal-action-error');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Trigger terminal error');
    await expect(page.getByText('This response will fail.', { exact: true })).toBeVisible();
    await expect(page.getByText('Response interrupted', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent could not complete the request. Please try again.', { exact: true }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open receive', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open link', exact: true })).toHaveCount(0);
    await expect(page.getByText('Choose a wallet action.', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toBeEnabled();
    await expect(page.getByText('Response interrupted', { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-agent-v2-message-role="assistant"]')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Couldn’t get a response' })).toHaveCount(0);

    await agentV2.open();
    await expect(page.getByText('This response will fail.', { exact: true })).toBeVisible();
    await expect(page.getByText('Response interrupted', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent could not complete the request. Please try again.', { exact: true }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Open Menu', exact: true }).click();
    await page.getByText('Clear Chat', { exact: true }).last().click();
    await page.locator('#agent-clear-chat-confirm:visible').click();
    await expect.poll(async () => (await agentV2.getState()).clearBodies.length).toBe(1);
    const state = await agentV2.getState();
    expect(state.clearBodies[0].expectedThreadRevision).toBe(1);
  });

  test('keeps a failed response and current capacity status distinct across reload', async ({ agentV2, page }) => {
    await page.setViewportSize({ width: 390, height: 447 });
    await agentV2.reset('capacity-error');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Trigger capacity failure');
    await expect(page.getByText('A partial response was started.', { exact: true })).toBeVisible();
    await expect(page.getByText('Response interrupted', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent is temporarily unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeDisabled();

    const readLayout = () => getAgentV2Conversation(page).evaluate((messages) => {
      const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Ask anything"]');
      const lastMessage = Array.from(
        messages.querySelectorAll<HTMLElement>('[data-agent-v2-message-role="assistant"]'),
      ).at(-1);
      if (!input || !lastMessage) throw new Error('Agent failure layout was not found');
      let composerWrapper: HTMLElement | null = input.parentElement;
      while (composerWrapper && getComputedStyle(composerWrapper).position !== 'absolute') {
        composerWrapper = composerWrapper.parentElement;
      }
      if (!composerWrapper) throw new Error('Agent composer wrapper was not found');
      return {
        gap: composerWrapper.getBoundingClientRect().top - lastMessage.getBoundingClientRect().bottom,
        distanceToBottom: messages.scrollHeight - messages.scrollTop - messages.clientHeight,
      };
    });
    await expect.poll(async () => (await readLayout()).gap).toBeGreaterThanOrEqual(-1);
    expect((await readLayout()).distanceToBottom).toBeLessThanOrEqual(1);

    await agentV2.open();
    await expect(page.getByText('A partial response was started.', { exact: true })).toBeVisible();
    await expect(page.getByText('Response interrupted', { exact: true })).toBeVisible();
    await expect(page.getByText('Agent is temporarily unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeDisabled();
  });

  test('sends the exact input continuation reference and text', async ({ agentV2, page }) => {
    await agentV2.reset('continuation');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Prepare a transfer');
    await page.getByRole('button', { name: 'Enter amount', exact: true }).click();
    await agentV2.send('1.25');
    await expect(page.getByText('Continuation accepted: 1.25', { exact: true })).toBeVisible();

    const { messages, runBodies } = await agentV2.getState();
    const sourceMessage = messages.find((message) => (
      message.role === 'assistant' && message.content?.text === 'How much TON should I prepare?'
    ));
    expect(runBodies[1]).toMatchObject({
      continuationOf: {
        messageId: sourceMessage?.id,
        continuationId: 'continuation-amount',
      },
      input: {
        kind: 'append',
        message: { text: '1.25' },
      },
    });
  });

  test('does not wait for remote cancellation before switching a hanging run to another account', async ({
    agentV2,
    page,
  }) => {
    await agentV2.reset('hanging-run');
    await agentV2.seedWallet(true);
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Hang on the first account');
    await expect(page.getByText('Partial response that must not cross accounts.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Switch Account', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Switch Account', exact: true }).nth(1).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('button[aria-label="Switch Account"]:visible')
      .filter({ hasText: 'Secondary View Wallet' })).toBeVisible();
    await expect(page.locator('textarea[placeholder="Ask anything"]:visible:not(:disabled)')).toBeEnabled();
    await expect(page.locator('[data-agent-v2-message-role="assistant"]:visible')
      .filter({ hasText: 'Partial response that must not cross accounts.' })).toHaveCount(0);
    await expect.poll(async () => (await agentV2.getState()).cancelBodies.length).toBe(1);
    expect((await agentV2.getState()).pendingResponseCount).toBeGreaterThanOrEqual(1);
  });

  test('dispatches receive and URL navigation actions from a completed message', async ({ agentV2, page }) => {
    await agentV2.reset('receive-navigation');
    await agentV2.seedWallet();
    await agentV2.open();
    await agentV2.acceptConsent();

    await agentV2.send('Show wallet actions');
    await page.getByRole('button', { name: 'Open receive', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(/^(Fund|Add)$/u)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Open link', exact: true }).click();
    await expect.poll(() => agentV2.blockedExternalRequests).toContain('https://example.com/agent-v2-action');
  });
});
