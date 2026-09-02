import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import { pause } from '../../util/schedulers';

import {
  AgentComposerStatus,
  AgentQuotaStatus,
  AgentRunFailure,
} from './AgentStatusNotice';

jest.mock('../../hooks/useLang', () => ({
  __esModule: true,
  default: () => (key: string, values?: string | number | unknown[]) => (
    values === undefined ? key : `${key}:${Array.isArray(values) ? values.join(',') : String(values)}`
  ),
}));

describe('Agent V2 failure and composer status notices', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    TeactDOM.render(undefined, root);
    root.remove();
  });

  it('renders a historical failure without a live status role', async () => {
    TeactDOM.render(
      <AgentRunFailure
        error={{ code: 'provider_error', retryable: true }}
        hasPartialResponse={false}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('$agent_response_failed_title');
    expect(root.textContent).toContain('$agent_error_generic');
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('labels a partial response as interrupted and exposes only an authorized retry', async () => {
    const onRetry = jest.fn();
    TeactDOM.render(
      <AgentRunFailure
        error={{ code: 'agent_capacity_exhausted', retryable: true }}
        hasPartialResponse
        onRetry={onRetry}
      />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('$agent_response_interrupted_title');
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('$agent_retry_request');
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('announces only the current composer status and keeps countdown updates quiet', async () => {
    TeactDOM.render(
      <AgentComposerStatus
        status={{ kind: 'capacity', mode: 'blocked', resetAt: Date.now() + 120_000 }}
      />,
      root,
    );
    await pause(20);

    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.textContent).toContain('$agent_capacity_limit_title');
    expect(root.textContent).toContain('$agent_capacity_limit_known');
    expect(root.querySelector('[aria-live="off"]')).not.toBeNull();
  });

  it('shows unknown capacity as a non-blocking degraded status', async () => {
    TeactDOM.render(
      <AgentComposerStatus status={{ kind: 'capacity', mode: 'degraded' }} />,
      root,
    );
    await pause(20);

    expect(root.textContent).toContain('$agent_capacity_degraded_title');
    expect(root.textContent).toContain('$agent_capacity_limit_unknown');
    expect(root.querySelector('button')).toBeNull();
  });

  it('does not expose quota details as a live status', async () => {
    TeactDOM.render(
      <AgentQuotaStatus quota={{
        limit: 20,
        used: 1,
        remaining: 19,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
      }}
      />,
      root,
    );
    await pause(20);

    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});
