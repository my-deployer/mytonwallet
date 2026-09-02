import type { AgentNoticeContentV1 } from '../../api/agentV2/protocol/types';
import type { LangFn } from '../../util/langProvider';

import {
  getAgentV2ActionLabel,
  getAgentV2InputContinuationLabel,
  getAgentV2NoticeTexts,
} from './agentV2Copy';

const lang = ((key: string, value?: unknown) => {
  const values = Array.isArray(value) ? value.join('|') : '';
  return values ? `${key}:${values}` : key;
}) as LangFn;
lang.code = 'en';

function receiveNotice(argumentsValue?: AgentNoticeContentV1['arguments']): AgentNoticeContentV1 {
  return {
    kind: 'notice',
    schemaVersion: 1,
    code: 'receive_unavailable',
    ...(argumentsValue && { arguments: argumentsValue }),
  };
}

function notice(
  code: AgentNoticeContentV1['code'],
  argumentsValue?: AgentNoticeContentV1['arguments'],
): AgentNoticeContentV1 {
  return {
    kind: 'notice',
    schemaVersion: 1,
    code,
    ...(argumentsValue && { arguments: argumentsValue }),
  };
}

describe('Agent V2 action copy', () => {
  it('distinguishes opening Send from reviewing a prepared transfer', () => {
    expect(getAgentV2ActionLabel('open_send', lang)).toBe('$agent_action_open_send');
    expect(getAgentV2ActionLabel('review_transfer', lang)).toBe('$agent_action_review_transfer');
  });

  it('maps the staking entry action to frontend-owned copy', () => {
    expect(getAgentV2ActionLabel('open_staking', lang)).toBe('$agent_action_open_staking');
  });

  it('maps the Swap entry action to frontend-owned copy', () => {
    expect(getAgentV2ActionLabel('open_swap', lang)).toBe('$agent_action_open_swap');
  });
});

describe('Agent V2 input continuation copy', () => {
  it('maps Swap clarification controls to frontend-owned copy', () => {
    expect(getAgentV2InputContinuationLabel('prepare_swap_destination_asset', lang))
      .toBe('$agent_input_asset');
    expect(getAgentV2InputContinuationLabel('prepare_swap_direction', lang))
      .toBe('$agent_input_swap_details');
  });
});

describe('Agent V2 Staking notice copy', () => {
  it.each([
    ['planning_unavailable', '$agent_notice_staking_planning_unavailable'],
    ['active_account_unavailable', '$agent_notice_staking_active_account_unavailable'],
    ['view_only_staking_forbidden', '$agent_notice_staking_view_only'],
    ['client_staking_unavailable', '$agent_notice_staking_client_unavailable'],
    ['asset_unavailable', '$agent_notice_staking_asset_unavailable'],
    ['amount_invalid', '$agent_notice_staking_amount_invalid'],
    ['wallet_context_changed', '$agent_notice_staking_wallet_context_changed'],
  ] as const)('maps %s to deterministic copy', (stakeFailure, expected) => {
    expect(getAgentV2NoticeTexts(notice('staking_unavailable', { stakeFailure }), lang)).toEqual([expected]);
  });

  it('keeps ready and unavailable generic fallbacks', () => {
    expect(getAgentV2NoticeTexts(notice('staking_ready'), lang)).toEqual(['$agent_notice_staking_ready']);
    expect(getAgentV2NoticeTexts(notice('staking_unavailable'), lang))
      .toEqual(['$agent_notice_staking_unavailable']);
  });
});

describe('Agent V2 Receive notice copy', () => {
  it.each([
    [['asset'], '$agent_notice_receive_asset_required'],
    [['network'], '$agent_notice_receive_network_required'],
    [['asset', 'network'], '$agent_notice_receive_details_required'],
  ] as const)('renders required Receive fields %j', (receiveFields, expected) => {
    expect(getAgentV2NoticeTexts(notice('receive_details_required', {
      receiveFields: [...receiveFields],
    }), lang)).toEqual([expected]);
  });

  it.each([
    ['asset', '$agent_notice_clarification_asset'],
    ['network', '$agent_notice_clarification_network'],
    ['query', '$agent_notice_clarification_query'],
    ['quote_currency', '$agent_notice_clarification_quote_currency'],
    ['staking_product', '$agent_notice_clarification_staking_product'],
    ['time_horizon', '$agent_notice_clarification_time_horizon'],
    ['price_assumption', '$agent_notice_clarification_price_assumption'],
  ] as const)('renders an actionable %s clarification', (field, expected) => {
    expect(getAgentV2NoticeTexts(notice('clarification_required', { field }), lang)).toEqual([expected]);
  });

  it.each([
    ['unrecognized_input', '$agent_notice_repair_unrecognized_input'],
    ['ambiguous_request', '$agent_notice_repair_ambiguous_request'],
    ['multiple_requests', '$agent_notice_repair_multiple_requests'],
  ] as const)('renders the %s conversational repair', (repairReason, expected) => {
    expect(getAgentV2NoticeTexts(notice('clarification_required', {
      field: 'query',
      repairReason,
    }), lang)).toEqual([expected]);
  });

  it('maps a funding memo requirement to frontend-owned deterministic copy', () => {
    expect(getAgentV2NoticeTexts(notice('receive_ready', {
      receiveMemoRequirement: 'not_required',
    }), lang)).toEqual([
      '$agent_notice_receive_memo_not_required',
    ]);
  });

  it('keeps the generic Receive-ready fallback without memo metadata', () => {
    expect(getAgentV2NoticeTexts(notice('receive_ready'), lang)).toEqual([
      '$agent_notice_receive_ready',
    ]);
  });

  it('formats an unsupported network with the requested and active network names', () => {
    expect(getAgentV2NoticeTexts(receiveNotice({
      receiveFailure: 'chain_unsupported',
      requestedChain: 'tron',
      activeChain: 'ton',
    }), lang)).toEqual([
      '$agent_notice_receive_chain_unsupported:TRON|TON',
    ]);
  });

  it('formats an inactive supported network with active network first', () => {
    expect(getAgentV2NoticeTexts(receiveNotice({
      receiveFailure: 'active_network_mismatch',
      requestedChain: 'tron',
      activeChain: 'ton',
    }), lang)).toEqual([
      '$agent_notice_receive_active_network_mismatch:TON|TRON',
    ]);
  });

  it.each([
    ['planning_unavailable', '$agent_notice_receive_planning_unavailable'],
    ['active_account_unavailable', '$agent_notice_receive_active_account_unavailable'],
    ['client_receive_unavailable', '$agent_notice_receive_client_unavailable'],
  ] as const)('maps %s to deterministic copy', (receiveFailure, expected) => {
    expect(getAgentV2NoticeTexts(receiveNotice({ receiveFailure }), lang)).toEqual([expected]);
  });

  it('falls back to generic copy for legacy and incomplete network arguments', () => {
    expect(getAgentV2NoticeTexts(receiveNotice(), lang)).toEqual([
      '$agent_notice_receive_unavailable',
    ]);
    expect(getAgentV2NoticeTexts(receiveNotice({
      receiveFailure: 'chain_unsupported',
      requestedChain: 'tron',
    }), lang)).toEqual([
      '$agent_notice_receive_unavailable',
    ]);
  });
});

describe('Agent V2 analysis unavailable notice copy', () => {
  it.each([
    ['planning_unavailable', '$agent_notice_analysis_planning_unavailable'],
    ['source_unavailable', '$agent_notice_analysis_source_unavailable'],
    ['stale_evidence', '$agent_notice_analysis_stale_evidence'],
    ['inconsistent_snapshot', '$agent_notice_analysis_inconsistent_snapshot'],
    ['compute_failed', '$agent_notice_analysis_compute_failed'],
    ['deadline_exceeded', '$agent_notice_analysis_deadline_exceeded'],
    ['result_too_large', '$agent_notice_analysis_result_too_large'],
    ['answer_generation_failed', '$agent_notice_analysis_answer_generation_failed'],
  ] as const)('maps %s to deterministic frontend copy', (analysisFailure, expected) => {
    expect(getAgentV2NoticeTexts(notice('analysis_unavailable', { analysisFailure }), lang)).toEqual([expected]);
  });
});

describe('Agent V2 Swap notice copy', () => {
  it('formats a resolved indicative estimate with the explicit Swap-UI caveat key', () => {
    expect(getAgentV2NoticeTexts(notice('swap_ready', {
      swapReady: {
        sourceAsset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
        destinationAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
        amount: { value: '10', valueType: 'decimal', side: 'source' },
        quote: {
          status: 'resolved',
          kind: 'indicative_spot',
          from: {
            value: '10', valueType: 'decimal', decimals: 9, symbol: 'TON', slug: 'toncoin', chain: 'ton',
          },
          to: {
            value: '25', valueType: 'decimal', decimals: 6, symbol: 'USDT', slug: 'usdton', chain: 'ton',
          },
          observedAt: '2026-08-18T12:00:00.000Z',
        },
      },
    }), lang)).toEqual([
      '$agent_notice_swap_ready_indicative:10|TON|25|USDT',
    ]);
  });

  it('keeps the open-Swap path when a local indicative price is unavailable', () => {
    expect(getAgentV2NoticeTexts(notice('swap_ready', {
      swapReady: {
        sourceAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
        destinationAsset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
        amount: { value: '10', valueType: 'decimal', side: 'destination' },
        quote: {
          status: 'unavailable',
          reason: 'price_unavailable',
          observedAt: '2026-08-18T12:00:00.000Z',
        },
      },
    }), lang)).toEqual([
      '$agent_notice_swap_ready_price_unavailable:USDT|TON',
    ]);
  });

  it('formats bounded ambiguous asset candidates', () => {
    expect(getAgentV2NoticeTexts(notice('swap_details_required', {
      swapDetails: {
        field: 'destination_asset',
        candidates: [
          { slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether' },
          { slug: 'trx-usdt', chain: 'tron', symbol: 'USDT', name: 'Tether' },
        ],
        hasMore: false,
      },
    }), lang)).toEqual([
      '$agent_notice_swap_details_candidates:$agent_notice_swap_details_destination_asset'
      + '|Tether \\(USDT\\) — TON, Tether \\(USDT\\) — TRON',
    ]);
  });

  it.each([
    ['planning_unavailable', '$agent_notice_swap_planning_unavailable'],
    ['active_account_unavailable', '$agent_notice_swap_active_account_unavailable'],
    ['view_only_swap_forbidden', '$agent_notice_swap_view_only'],
    ['client_swap_unavailable', '$agent_notice_swap_client_unavailable'],
    ['wallet_context_changed', '$agent_notice_swap_wallet_context_changed'],
    ['tool_timeout', '$agent_notice_swap_timeout'],
    ['tool_failed', '$agent_notice_swap_tool_failed'],
    ['invalid_tool_result', '$agent_notice_swap_invalid_result'],
  ] as const)('maps %s to deterministic copy', (swapFailure, expected) => {
    expect(getAgentV2NoticeTexts(notice('swap_unavailable', { swapFailure }), lang)).toEqual([expected]);
  });
});

describe('Agent V2 notice copy', () => {
  it.each([
    [
      notice('web_search_unavailable', { webSearchFailure: 'synthesis_timeout' }),
      ['$agent_notice_web_synthesis_timeout'],
    ],
    [
      notice('send_unavailable', { sendFailure: 'insufficient_balance' }),
      ['$agent_notice_send_insufficient_balance'],
    ],
    [
      notice('send_unavailable', { sendFailure: 'intent_provider_unavailable' }),
      ['$agent_notice_send_intent_provider_unavailable'],
    ],
    [
      notice('send_unavailable', { sendFailure: 'asset_not_held' }),
      ['$agent_notice_send_asset_not_held'],
    ],
    [
      notice('send_unavailable', { sendFailure: 'no_sendable_balance' }),
      ['$agent_notice_send_no_sendable_balance'],
    ],
    [
      notice('send_unavailable', { sendFailure: 'source_wallet_selection_required' }),
      ['$agent_notice_send_source_wallet_selection_required'],
    ],
    [
      notice('send_details_required', { fields: ['asset'] }),
      ['$agent_notice_send_missing_asset'],
    ],
    [
      notice('send_ready', {
        asset: { slug: 'gram', chain: 'ton', symbol: 'GRAM', name: 'Gram' },
      }),
      ['$agent_notice_send_ready_inferred_asset:GRAM'],
    ],
    [
      notice('send_form_amount_required'),
      ['$agent_notice_send_form_amount_required'],
    ],
    [
      notice('market_analysis_asset_unsupported'),
      ['$agent_notice_market_analysis_asset_unsupported'],
    ],
    [
      notice('market_analysis_timeframe_unsupported'),
      ['$agent_notice_market_analysis_timeframe_unsupported'],
    ],
    [
      notice('market_analysis_unavailable'),
      ['$agent_notice_market_analysis_unavailable'],
    ],
  ])('maps structured notice arguments to deterministic copy', (content, expected) => {
    expect(getAgentV2NoticeTexts(content, lang)).toEqual(expected);
  });

  it('formats a resolved quote with bounded precision, signed change, and literal asset labels', () => {
    expect(getAgentV2NoticeTexts(notice('market_quote', {
      marketQuote: {
        status: 'resolved',
        asset: { slug: 'evil', chain: 'ton', name: '**Evil**', symbol: 'T_ON' },
        price: '0.00123456',
        quoteCurrency: 'USD',
        percentChange24h: '1.236',
        asOf: '2026-08-16T12:00:00.000Z',
      },
    }), lang)).toEqual([
      '$agent_notice_market_quote_resolved:\\*\\*Evil\\*\\* \\(T\\_ON\\)|0.001235|USD|+1.24',
    ]);
  });

  it.each([
    ['price_unavailable', '$agent_notice_market_quote_price_unavailable:Toncoin \\(TON\\)'],
    ['not_found', '$agent_notice_market_quote_not_found'],
  ] as const)('maps the %s quote state', (status, expected) => {
    const marketQuote = status === 'price_unavailable'
      ? {
        status,
        asset: { slug: 'toncoin', chain: 'ton' as const, name: 'Toncoin', symbol: 'TON' },
        asOf: '2026-08-16T12:00:00.000Z',
      }
      : { status, asOf: '2026-08-16T12:00:00.000Z' };
    expect(getAgentV2NoticeTexts(notice('market_quote', { marketQuote }), lang)).toEqual([expected]);
  });

  it('formats bounded ambiguous candidates while keeping hasMore hidden', () => {
    expect(getAgentV2NoticeTexts(notice('market_quote', {
      marketQuote: {
        status: 'ambiguous',
        candidates: [
          { slug: 'usd-ton', chain: 'ton', name: 'USD_T', symbol: 'USDT' },
          { slug: 'usd-tron', chain: 'tron', name: 'Tether', symbol: 'USDT' },
        ],
        hasMore: true,
        asOf: '2026-08-16T12:00:00.000Z',
      },
    }), lang)).toEqual([
      '$agent_notice_market_quote_ambiguous:USD\\_T \\(USDT\\) — TON, Tether \\(USDT\\) — TRON',
    ]);
  });

  it.each([
    ['planning_unavailable', '$agent_notice_market_quote_planning_unavailable'],
    ['capability_unavailable', '$agent_notice_market_quote_capability_unavailable'],
    ['wallet_context_unavailable', '$agent_notice_market_quote_wallet_context_unavailable'],
    ['quote_currency_unsupported', '$agent_notice_market_quote_currency_unsupported'],
    ['quote_unavailable', '$agent_notice_market_quote_unavailable'],
    ['wallet_context_changed', '$agent_notice_market_quote_wallet_context_changed'],
    ['tool_timeout', '$agent_notice_market_quote_timeout'],
    ['tool_failed', '$agent_notice_market_quote_tool_failed'],
    ['invalid_result', '$agent_notice_market_quote_invalid_result'],
    ['cancelled', '$agent_notice_market_quote_cancelled'],
  ] as const)('maps exact quote failure %s without generic retry copy', (reason, expected) => {
    expect(getAgentV2NoticeTexts(notice('market_quote', {
      marketQuote: { status: 'unavailable', reason },
    }), lang)).toEqual([expected]);
  });

  it('preserves every safe Send failure as a separate text block', () => {
    expect(getAgentV2NoticeTexts(notice('send_unavailable', {
      sendFailure: 'recipient_not_found',
      sendFailures: ['recipient_not_found', 'insufficient_balance'],
      recipientLabel: 'Pavel Durov',
    }), lang)).toEqual([
      '$agent_notice_send_recipient_not_found_named:Pavel Durov',
      '$agent_notice_send_insufficient_balance',
    ]);
  });
});
