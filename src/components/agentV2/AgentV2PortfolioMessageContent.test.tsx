import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import type { AgentPublicInputContinuationV1 } from '../../api/agentV2/protocol/types';

import { pause } from '../../util/schedulers';

import AgentV2PortfolioMessageContent from './AgentV2PortfolioMessageContent';

jest.mock('../../hooks/useLang', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

describe('AgentV2PortfolioMessageContent', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    TeactDOM.render(undefined, root);
    root.remove();
  });

  it('hides obsolete Swap asset continuations while preserving other input controls', async () => {
    const continuations: AgentPublicInputContinuationV1[] = [
      continuation('swap-source', 'prepare_swap_source_asset', 'prepare-swap', 'asset'),
      continuation('swap-destination', 'prepare_swap_destination_asset', 'prepare-swap', 'asset'),
      continuation('swap-amount', 'prepare_swap_amount', 'prepare-swap', 'amount'),
      continuation('send-asset', 'prepare_send_asset', 'prepare-send', 'asset'),
    ];

    TeactDOM.render(
      <AgentV2PortfolioMessageContent
        inputContinuations={continuations}
        isDisabled={false}
        onFollowup={jest.fn()}
        onInputContinuation={jest.fn()}
      />,
      root,
    );
    await pause(20);

    expect(Array.from(root.querySelectorAll('button'), ({ textContent }) => textContent)).toEqual([
      '$agent_input_amount',
      '$agent_input_asset',
    ]);
  });
});

function continuation(
  id: string,
  code: AgentPublicInputContinuationV1['code'],
  scenario: AgentPublicInputContinuationV1['scenario'],
  field: AgentPublicInputContinuationV1['field'],
): AgentPublicInputContinuationV1 {
  return { id, kind: 'collect_input', code, scenario, field };
}
