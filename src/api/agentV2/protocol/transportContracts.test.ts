import type { AgentMarketFearGreedRegimeV1, AgentMarketPriceZoneV1, AgentToolCall } from './types';

import compatibilityFixture from '../../../../tests/fixtures/agentV2/client-wire-compatibility.v1.json';
import navigationFixture from '../../../../tests/fixtures/agentV2/navigation-action-projection.v1.json';
import contractManifest from '../generated/manifest.json';
import { buildAgentMarketAnalysisV6Fixture } from './agentMarketAnalysisTestFixture';
import {
  AgentV2CompatibilityError,
  AgentV2ContractError,
  decodeAgentV2FeatureCapabilities,
  decodeAgentV2Hints,
  decodeAgentV2Messages,
  decodeAgentV2PersistedAction,
  decodeAgentV2StreamEvent,
  decodeAgentV2StreamFrame,
  decodeAgentV2ToolArguments,
  decodeAgentV2WalletQueryCapabilitiesV2,
} from './transportContracts';
import { array as readWireArray, object as readWireObject } from './wireReader';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const TOOL_CALL_ID = '44444444-4444-4444-8444-444444444444';
const WALLET_SESSION_ID = '55555555-5555-4555-8555-555555555555';

interface CompatibilityFixtureGroup {
  schema: string;
  values: unknown[];
}

describe('Agent V2 client wire compatibility contract', () => {
  it('decodes every fixture group with its live transport reader', () => {
    expect(compatibilityFixture.schemaVersion).toBe(1);
    compatibilityFixture.fixtures.forEach(decodeCompatibilityFixtureGroup);
  });

  it('rejects unsupported fixture schemas', () => {
    expect(() => decodeCompatibilityFixtureGroup({
      schema: 'AgentUnknownV2',
      values: [],
    })).toThrow('Unsupported Agent V2 compatibility fixture: AgentUnknownV2');
  });
});

describe('Agent V2 feature capability negotiation', () => {
  it('treats an omitted staking offer capability as disabled', () => {
    expect(decodeAgentV2FeatureCapabilities({
      protocolVersion: 2,
      portfolioPositions: 'disabled',
    })).toEqual({
      protocolVersion: 2,
      portfolioPositions: 'disabled',
      stakingCatalog: 'disabled',
      stakingOffer: 'disabled',
      walletQuery: 'disabled',
    });
  });

  it('accepts an explicitly available staking offer capability', () => {
    expect(decodeAgentV2FeatureCapabilities({
      protocolVersion: 2,
      portfolioPositions: 'disabled',
      stakingOffer: 'available',
    })).toMatchObject({ stakingOffer: 'available' });
  });

  it('accepts an explicitly available global staking catalog capability', () => {
    expect(decodeAgentV2FeatureCapabilities({
      protocolVersion: 2,
      portfolioPositions: 'disabled',
      stakingCatalog: 'available',
    })).toMatchObject({ stakingCatalog: 'available' });
  });
});

describe('Agent V2 staking offer tool contract', () => {
  const toolCall = {
    id: TOOL_CALL_ID,
    name: 'staking.offer.read',
    version: 1,
    arguments: {
      schemaVersion: 1,
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
    },
    scopes: ['staking.data.read'],
    timeoutMs: 15_000,
    maxResultBytes: 16_384,
    walletContextSession: {
      sessionId: WALLET_SESSION_ID,
      revision: 1,
      accountScope: 'current',
      activeAccountRef: 'account-current',
      activeNetwork: 'ton',
    },
  } as const;

  it('decodes only the exact read-only staking offer tool', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall,
    }))).toMatchObject({ type: 'tool_call', toolCall });
  });

  it.each([
    ['wrong scope', { scopes: ['wallet.data.read'] }],
    ['wrong timeout', { timeoutMs: 5_001 }],
    ['wrong result bound', { maxResultBytes: 16_385 }],
  ])('rejects a staking offer tool call with %s', (_case, override) => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall: { ...toolCall, ...override },
    }))).toThrow(AgentV2ContractError);
  });

  it('rejects unsafe staking offer arguments before execution', () => {
    expect(() => decodeAgentV2ToolArguments({
      ...toolCall,
      arguments: { ...toolCall.arguments, productId: 'unsafe product' },
    } as unknown as AgentToolCall)).toThrow(AgentV2ContractError);
  });
});

describe('Agent V2 semantic public contract', () => {
  it('decodes required Receive fields and ignores future display-only arguments', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_details_required',
        arguments: {
          receiveFields: ['asset', 'network'],
          futureDisplay: { emphasis: 'funding' },
        },
      },
    }))).toMatchObject({
      content: {
        code: 'receive_details_required',
        arguments: { receiveFields: ['asset', 'network'] },
      },
    });
  });

  it.each([
    undefined,
    [],
    ['asset', 'asset'],
    ['asset', 'future_field'],
  ])('rejects invalid required Receive fields: %j', (receiveFields) => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_details_required',
        ...(receiveFields === undefined ? {} : { arguments: { receiveFields } }),
      },
    }))).toThrow(AgentV2ContractError);
  });

  it.each([
    'quote_currency',
    'staking_product',
    'time_horizon',
    'price_assumption',
  ] as const)('decodes the %s analysis clarification field', (field) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'clarification_required',
        arguments: { field },
      },
    }))).toMatchObject({ content: { arguments: { field } } });
  });

  it.each([
    'unrecognized_input',
    'ambiguous_request',
    'multiple_requests',
  ] as const)('decodes the %s conversational repair reason', (repairReason) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'clarification_required',
        arguments: { field: 'query', repairReason },
      },
    }))).toMatchObject({ content: { arguments: { field: 'query', repairReason } } });
  });

  it('ignores an unknown future conversational repair reason', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'clarification_required',
        arguments: { field: 'query', repairReason: 'future_reason' },
      },
    }))).toMatchObject({ content: { arguments: { field: 'query' } } });
  });

  it('rejects a conversational repair reason on a targeted field clarification', () => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'clarification_required',
        arguments: { field: 'asset', repairReason: 'ambiguous_request' },
      },
    }))).toThrow(AgentV2ContractError);
  });

  it.each([
    'planning_unavailable',
    'source_unavailable',
    'stale_evidence',
    'inconsistent_snapshot',
    'compute_failed',
    'deadline_exceeded',
    'result_too_large',
    'answer_generation_failed',
  ] as const)('decodes the %s analysis failure', (analysisFailure) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'analysis_unavailable',
        arguments: { analysisFailure },
      },
    }))).toMatchObject({ content: { arguments: { analysisFailure } } });
  });

  it('rejects an analysis-unavailable notice without its closed failure reason', () => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: { kind: 'notice', schemaVersion: 1, code: 'analysis_unavailable' },
    }))).toThrow(AgentV2ContractError);
  });

  it('accepts contentKind and ignores an obsolete optional display marker', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'message_start', sequence: 2, messageId: MESSAGE_ID, role: 'assistant',
      contentKind: 'semantic', textFormat: 'agentMarkdownV2',
    }))).toMatchObject({ contentKind: 'semantic' });
  });

  it.each(semanticContents())('accepts semantic content variant $kind', (content) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ type: 'semantic_content', content });
  });

  it('validates optional fiat metadata in portfolio activity amounts', () => {
    const content = {
      kind: 'portfolio',
      schemaVersion: 1,
      view: 'networkActivity',
      outcome: 'complete',
      payload: {
        id: MESSAGE_ID,
        status: 'complete',
        accountScope: 'current',
        chain: 'ton',
        generatedAt: '2026-08-06T12:00:00.000Z',
        hasMore: false,
        rows: [{
          kind: 'transfer',
          timestamp: '2026-08-06T11:00:00.000Z',
          status: 'completed',
          amount: {
            value: '1',
            valueType: 'decimal',
            decimals: 9,
            symbol: 'TON',
            slug: 'toncoin',
            chain: 'ton',
            fiat: {
              value: '5.25',
              currency: 'USD',
              rate: '5.25',
              asOf: '2026-08-06T11:00:00.000Z',
            },
          },
        }],
      },
    } as const;

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content });
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        ...content,
        payload: {
          ...content.payload,
          rows: [{
            ...content.payload.rows[0],
            amount: {
              ...content.payload.rows[0].amount,
              fiat: { ...content.payload.rows[0].amount.fiat, value: 'not-a-number' },
            },
          }],
        },
      },
    }))).toThrow(AgentV2ContractError);
  });

  it('decodes typed Receive failures and ignores future display-only arguments', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_unavailable',
        arguments: {
          receiveFailure: 'chain_unsupported',
          requestedChain: 'tron',
          activeChain: 'ton',
          futureDisplay: { emphasis: 'network' },
        },
      },
    }))).toMatchObject({
      type: 'semantic_content',
      content: {
        arguments: {
          receiveFailure: 'chain_unsupported',
          requestedChain: 'tron',
          activeChain: 'ton',
        },
      },
    });
  });

  it('decodes persisted targeted Receive V3 without wallet authority fields', () => {
    const action = {
      id: TOOL_CALL_ID,
      schemaVersion: 3,
      kind: 'receive',
      labelCode: 'open_receive',
      effect: 'open_receive',
      targetNetwork: 'tron',
      localDraftRequired: false,
      requiresConfirmation: false,
    } as const;

    expect(decodeAgentV2PersistedAction(action)).toEqual(action);
    expect(() => decodeAgentV2PersistedAction({
      ...action,
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'account-current',
        activeNetwork: 'ton',
      },
    })).toThrow();
  });

  it('rejects retired live and persisted Stake V1 actions', () => {
    const liveAction = {
      id: TOOL_CALL_ID,
      kind: 'stake',
      labelCode: 'open_staking',
      effect: 'open_staking',
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'account-current',
      },
      localDraftRequired: false,
      requiresConfirmation: false,
    } as const;

    expect(() => decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action: liveAction,
    }))).toThrow(AgentV2ContractError);

    const { contextBinding: _contextBinding, ...persistedAction } = liveAction;
    expect(() => decodeAgentV2PersistedAction(persistedAction)).toThrow(AgentV2ContractError);
  });

  it('decodes exact Stake V2 targets and closes their executable fields', () => {
    const liveAction = {
      id: TOOL_CALL_ID,
      schemaVersion: 2,
      kind: 'stake',
      labelCode: 'open_staking',
      effect: 'open_staking',
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'account-current',
      },
      productId: 'ethena',
      asset: {
        slug: 'ton-eqaib6kmdf', chain: 'ton', symbol: 'USDe', decimals: 6,
      },
      amount: { kind: 'exact', value: '125.5' },
      localDraftRequired: false,
      requiresConfirmation: false,
    } as const;
    expect(decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action: liveAction,
    }))).toMatchObject({ type: 'action', action: liveAction });

    const { contextBinding: _contextBinding, ...persistedAction } = liveAction;
    expect(decodeAgentV2PersistedAction({
      ...persistedAction,
      amount: { kind: 'all' },
    })).toMatchObject({ productId: 'ethena', amount: { kind: 'all' } });

    expect(() => decodeAgentV2PersistedAction({
      ...persistedAction,
      amount: { kind: 'exact', value: '01' },
    })).toThrow(AgentV2ContractError);
  });

  it.each([
    { kind: 'savedAddress', addressRef: 'address-mother' },
    { kind: 'address', chain: 'ton', address: 'EQ-user-authored-address' },
    { kind: 'domain', chain: 'ton', domain: 'mother.ton' },
  ] as const)('decodes a live Send-form action with recipient kind $kind', (recipient) => {
    const action = {
      id: TOOL_CALL_ID,
      kind: 'send',
      labelCode: 'open_send',
      effect: 'open_send',
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'account-current',
        activeNetwork: 'ton',
      },
      asset: { slug: 'gram', chain: 'ton' },
      recipient,
      localDraftRequired: false,
      requiresConfirmation: false,
    } as const;

    expect(decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action,
    }))).toMatchObject({ action });
  });

  it('rejects a live Send-form action without a resolved recipient', () => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'action',
      sequence: 3,
      messageId: MESSAGE_ID,
      action: {
        id: TOOL_CALL_ID,
        kind: 'send',
        labelCode: 'open_send',
        effect: 'open_send',
        contextBinding: {
          sessionId: WALLET_SESSION_ID,
          revision: 1,
          activeAccountRef: 'account-current',
          activeNetwork: 'ton',
        },
        asset: { slug: 'gram', chain: 'ton' },
        localDraftRequired: false,
        requiresConfirmation: false,
      },
    }))).toThrow(AgentV2ContractError);
  });

  it('decodes bounded Staking failures and fails soft for future reasons', () => {
    const content = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'staking_unavailable',
      arguments: { stakeFailure: 'view_only_staking_forbidden', futureDisplay: 'compact' },
    } as const;
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { arguments: { stakeFailure: 'view_only_staking_forbidden' } } });

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        ...content,
        arguments: { stakeFailure: 'future_staking_policy' },
      },
    }))).toMatchObject({ content: { code: 'staking_unavailable', arguments: {} } });
  });

  it('decodes Swap display extensions while keeping executable action fields closed', () => {
    const semanticContent = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'swap_ready',
      arguments: {
        swapReady: {
          sourceAsset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', futureLabel: 'Gram' },
          destinationAsset: { slug: 'usdton', chain: 'ton', symbol: 'USDT' },
          amount: { value: '10', valueType: 'decimal', side: 'source', futureUnit: 'token' },
          quote: {
            status: 'unavailable',
            reason: 'price_unavailable',
            observedAt: '2026-08-18T12:00:00.000Z',
            futureDisplay: { emphasis: 'estimate' },
          },
          futureDisplay: { density: 'compact' },
        },
      },
    } as const;
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: semanticContent,
    }))).toMatchObject({
      content: {
        code: 'swap_ready',
        arguments: {
          swapReady: {
            sourceAsset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
            amount: { value: '10', side: 'source' },
            quote: { status: 'unavailable', reason: 'price_unavailable' },
          },
        },
      },
    });

    const action = swapActionFixture();
    expect(decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 4, messageId: MESSAGE_ID, action,
    }))).toMatchObject({ action });
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 4, messageId: MESSAGE_ID,
      action: { ...action, url: 'https://my.tt/swap' },
    }))).toThrow(AgentV2ContractError);
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 4, messageId: MESSAGE_ID,
      action: { ...action, sourceAsset: { ...action.sourceAsset, chain: 'base' } },
    }))).toThrow(AgentV2ContractError);

    const { sourceToolCallId: _sourceToolCallId, contextBinding: _contextBinding, ...persisted } = action;
    expect(decodeAgentV2PersistedAction(persisted)).toEqual(persisted);
    expect(() => decodeAgentV2PersistedAction({ ...persisted, sourceToolCallId: TOOL_CALL_ID }))
      .toThrow(AgentV2ContractError);
  });

  it('decodes the Receive memo requirement and ignores unknown future values', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_ready',
        arguments: { receiveMemoRequirement: 'not_required' },
      },
    }))).toMatchObject({
      type: 'semantic_content',
      content: { arguments: { receiveMemoRequirement: 'not_required' } },
    });
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_ready',
        arguments: { receiveMemoRequirement: 'future_policy' },
      },
    }))).toMatchObject({
      type: 'semantic_content',
      content: { code: 'receive_ready', arguments: {} },
    });
  });

  it('decodes a network-specific clarification field', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'clarification_required',
        arguments: { field: 'network' },
      },
    }))).toMatchObject({
      type: 'semantic_content',
      content: { arguments: { field: 'network' } },
    });
  });

  it.each([
    { receiveFailure: 'future_reason', requestedChain: 'tron', activeChain: 'ton' },
    { receiveFailure: 'chain_unsupported', requestedChain: '', activeChain: 'ton' },
    { receiveFailure: 'active_network_mismatch', requestedChain: 'tron' },
  ])('fails soft for unknown or incomplete Receive arguments: %#', (argumentsValue) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'receive_unavailable',
        arguments: argumentsValue,
      },
    }))).toMatchObject({
      type: 'semantic_content',
      content: { code: 'receive_unavailable' },
    });
  });

  it.each([
    ['empty market overview evidence', () => ({ ...marketOverviewContent(), evidence: {} })],
    ['market overview without coverage', () => {
      const content = cloneJson(marketOverviewContent());
      const { coverage: _coverage, ...evidence } = content.evidence;
      return { ...content, evidence };
    }],
    ['portfolio analysis without account scope', () => {
      const content = cloneJson(portfolioAnalysisContent());
      const { accountScope: _accountScope, ...payload } = content.payload;
      return { ...content, payload };
    }],
    ['portfolio analysis without total value timestamp', () => {
      const content = cloneJson(portfolioAnalysisContent());
      const { asOf: _asOf, ...totalValue } = content.payload.totalValue;
      return { ...content, payload: { ...content.payload, totalValue } };
    }],
    ['portfolio analysis without signals', () => {
      const content = cloneJson(portfolioAnalysisContent());
      const { signals: _signals, ...payload } = content.payload;
      return { ...content, payload };
    }],
    ['portfolio analysis without freshness', () => {
      const content = cloneJson(portfolioAnalysisContent());
      const { freshness: _freshness, ...dataQuality } = content.payload.dataQuality;
      return { ...content, payload: { ...content.payload, dataQuality } };
    }],
  ] as const)('rejects incomplete required semantic fields: %s', (_label, buildContent) => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: buildContent(),
    }))).toThrow(AgentV2ContractError);
  });

  it('keeps historical V5 market analysis compatible', () => {
    const content = {
      kind: 'market', schemaVersion: 1, view: 'analysis', outcome: 'partial',
      evidence: { schemaVersion: 5, futureDisplay: { mode: 'historical' } },
    };
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content });
  });

  it('accepts bounded V6 market analysis and ignores future display-only fields', () => {
    const content = readWireObject(buildAgentMarketAnalysisV6Fixture(), '$');
    const evidence = readWireObject(content.evidence, '$.evidence');
    const levelMaps = readWireObject(evidence.levelMaps, '$.evidence.levelMaps');
    evidence.futureDisplay = { density: 'compact' };
    readWireObject(levelMaps['7d'], '$.evidence.levelMaps.7d').futureLabel = 'weekly';

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6, futureDisplay: { density: 'compact' } } } });
  });

  it('validates the optional active scenario against exactly one confirmed path', () => {
    const mismatched = cloneJson(buildAgentMarketAnalysisV6Fixture());
    mismatched.evidence.scenarioTrees['7d'].activeScenario = 'bearish_breakdown';
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: mismatched,
    }))).toThrow('Invalid Agent V2 contract at $.content.evidence.scenarioTrees.7d.activeScenario');

    const ambiguous = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const bearish = ambiguous.evidence.scenarioTrees['7d'].paths.find(({ kind }) => kind === 'bearish_breakdown');
    if (!bearish || bearish.status !== 'eligible') throw new Error('Expected bearish path');
    bearish.activation.state = 'triggered';
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: ambiguous,
    }))).toThrow('Invalid Agent V2 contract at $.content.evidence.scenarioTrees.7d.activeScenario');

    const absent = cloneJson(buildAgentMarketAnalysisV6Fixture());
    delete absent.evidence.scenarioTrees['7d'].activeScenario;
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: absent,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6 } } });
  });

  it('accepts the optional Fear & Greed regime and tolerates future display-only fields', () => {
    const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
    content.fearGreedRegime = {
      ...fearGreedRegime(),
      futureDisplay: { emphasis: 'compact' },
    } as AgentMarketFearGreedRegimeV1;

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({
      content: {
        evidence: { schemaVersion: 6 },
        fearGreedRegime: {
          latestValue: 63,
          regime: 'risk_on',
          futureDisplay: { emphasis: 'compact' },
        },
      },
    });
  });

  it.each([
    ['invalid date', (value: Record<string, unknown>) => { value.asOfDate = '2026-02-30'; }],
    ['out-of-range index', (value: Record<string, unknown>) => { value.latestValue = 101; }],
    ['non-fixed SMA', (value: Record<string, unknown>) => { value.sma30 = '58.25'; }],
    ['out-of-range SMA', (value: Record<string, unknown>) => { value.sma365 = '100.00000001'; }],
    ['unknown regime', (value: Record<string, unknown>) => { value.regime = 'bullish'; }],
    ['non-canonical digest', (value: Record<string, unknown>) => { value.seriesDigest = 'A'.repeat(64); }],
    ['forged source', (value: Record<string, unknown>) => {
      value.source = { ...readWireObject(value.source, '$.source'), provider: 'coingecko' };
    }],
  ] as const)('drops a malformed optional Fear & Greed regime fail-soft: %s', (_label, mutate) => {
    const content = readWireObject(cloneJson(buildAgentMarketAnalysisV6Fixture()), '$');
    const regime = readWireObject(fearGreedRegime(), '$.fearGreedRegime');
    mutate(regime);
    content.fearGreedRegime = regime;

    const decoded = decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }));
    expect(decoded).toMatchObject({ content: { kind: 'market', evidence: { schemaVersion: 6 } } });
    expect(decoded).not.toHaveProperty('content.fearGreedRegime');
  });

  it('accepts a validated node on a hidden third map zone without cataloging it', () => {
    const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available') throw new Error('Expected available fixture level map');
    const fillerZone = cloneJson(map.resistances[0]);
    fillerZone.id = 'level.7d.resistance.visible-filler';
    fillerZone.lower = '1920.00000000';
    fillerZone.upper = '1940.00000000';
    removeMarketNodeSources(fillerZone);
    const hiddenZone = cloneJson(map.resistances[0]);
    hiddenZone.id = 'level.7d.resistance.hidden-hvn';
    hiddenZone.lower = '1950.00000000';
    hiddenZone.upper = '1970.00000000';
    hiddenZone.sources.push({
      kind: 'volume_profile_hvn',
      timeframe: 'profile',
      evidenceRef: 'profile.previous_week.hvn.2',
    });
    map.resistances.push(fillerZone, hiddenZone);
    map.coverage.candidateCount += 2;
    map.coverage.zoneCount += 2;

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6 } } });
  });

  it('accepts up to 72 sources in a V6 market price zone', () => {
    const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available') throw new Error('Expected available fixture level map');
    const zone = map.resistances[0];
    const source = zone.sources[0];
    zone.sources = Array.from({ length: 72 }, () => ({ ...source }));

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6 } } });
  });

  it('accepts cataloged node evidence from a range condition zone outside the rendered path', () => {
    const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available') throw new Error('Expected available fixture level map');
    const scenario = content.evidence.scenarioTrees['7d'].paths.find(({ kind }) => kind === 'range_balance');
    if (!scenario || scenario.status !== 'eligible') throw new Error('Expected eligible range scenario');
    const conditionZoneIds = [map.supports[0].id, map.resistances[0].id];
    scenario.activation.zoneIds = conditionZoneIds;
    scenario.invalidation.zoneIds = conditionZoneIds;
    scenario.evidenceRefs.push('profile.previous_week.hvn.1');

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6 } } });
  });

  it('rejects more than 72 sources in a V6 market price zone', () => {
    const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available') throw new Error('Expected available fixture level map');
    const zone = map.resistances[0];
    const source = zone.sources[0];
    zone.sources = Array.from({ length: 73 }, () => ({ ...source }));

    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toThrow('Invalid Agent V2 contract at $.content.evidence.levelMaps.7d.resistances[0].sources');
  });

  it('keeps historical V6 level and scenario policy V1 compatible', () => {
    const content = historicalMarketAnalysisV6Fixture();

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ content: { evidence: { schemaVersion: 6 } } });
  });

  it('rejects mismatched, cross-horizon, unbounded and invented V6 node refs', () => {
    const mutations: Array<(content: ReturnType<typeof buildAgentMarketAnalysisV6Fixture>) => void> = [
      (content) => { getFixtureHvnSource(content).evidenceRef = 'profile.previous_week.lvn.1'; },
      (content) => { getFixtureHvnSource(content).evidenceRef = 'profile.current_day.hvn.1'; },
      (content) => { getFixtureHvnSource(content).evidenceRef = 'profile.previous_week.hvn.3'; },
      (content) => { getFixtureHvnSource(content).timeframe = 'period'; },
      (content) => {
        content.evidence.evidenceCatalog.push({
          id: 'profile.previous_week.hvn.2', family: 'profile', available: true, claimable: true,
        });
      },
      (content) => {
        getFixturePrimaryPath(content).evidenceRefs.push('profile.previous_week.hvn.2');
      },
    ];

    mutations.forEach((mutate) => {
      const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
      mutate(content);
      expect(() => decodeAgentV2StreamEvent(event({
        type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
      }))).toThrow(AgentV2ContractError);
    });
  });

  it('rejects B2 node semantics under V1 policies and LVN outside a primary transit step', () => {
    const v1Map = cloneJson(buildAgentMarketAnalysisV6Fixture());
    v1Map.evidence.levelMaps['7d'].policyVersion = 'market-level-map-v1';
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: v1Map,
    }))).toThrow(AgentV2ContractError);

    const v1Tree = cloneJson(buildAgentMarketAnalysisV6Fixture());
    v1Tree.evidence.scenarioTrees['7d'].policyVersion = 'market-structural-scenarios-v1';
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: v1Tree,
    }))).toThrow(AgentV2ContractError);

    const nonTransitLvn = cloneJson(buildAgentMarketAnalysisV6Fixture());
    const transit = getFixturePrimaryPath(nonTransitLvn).path.find(({ role }) => role === 'transit');
    if (!transit) throw new Error('Expected fixture transit step');
    transit.role = 'target';
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: nonTransitLvn,
    }))).toThrow(AgentV2ContractError);

    const mixedPolicies = historicalMarketAnalysisV6Fixture();
    for (const horizon of ['3d', '7d', '30d'] as const) {
      mixedPolicies.evidence.scenarioTrees[horizon].policyVersion = 'market-structural-scenarios-v2';
    }
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: mixedPolicies,
    }))).toThrow(AgentV2ContractError);
  });

  it('rejects malformed or misplaced LVN transit evidence', () => {
    const mutations: Array<(content: ReturnType<typeof buildAgentMarketAnalysisV6Fixture>) => void> = [
      (content) => {
        const transit = getFixtureTransit(content);
        transit.zone.id = 'profile.previous_week.lvn.2';
      },
      (content) => {
        const transit = getFixtureTransit(content);
        transit.zone.lower = '1660.00000000';
        transit.zone.upper = '1680.00000000';
      },
      (content) => {
        getFixtureTransit(content).zone.touchCount = 1;
      },
      (content) => {
        const path = getFixturePrimaryPath(content);
        path.evidenceRefs = path.evidenceRefs.filter((reference) => (
          reference !== 'profile.previous_week.lvn.1'
        ));
      },
      (content) => {
        const transit = getFixtureTransit(content);
        transit.zone.upper = transit.zone.lower;
      },
    ];

    mutations.forEach((mutate) => {
      const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
      mutate(content);
      expect(() => decodeAgentV2StreamEvent(event({
        type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
      }))).toThrow(AgentV2ContractError);
    });
  });

  it('rejects reordered horizons and malformed required V6 market facts', () => {
    const reordered = readWireObject(cloneJson(buildAgentMarketAnalysisV6Fixture()), '$');
    const reorderedEvidence = readWireObject(reordered.evidence, '$.evidence');
    reorderedEvidence.requestedHorizons = ['7d', '3d', '30d'];
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: reordered,
    }))).toThrow(AgentV2ContractError);

    const malformed = readWireObject(cloneJson(buildAgentMarketAnalysisV6Fixture()), '$');
    const malformedEvidence = readWireObject(malformed.evidence, '$.evidence');
    const structures = readWireArray(malformedEvidence.structures, '$.evidence.structures');
    const firstStructure = readWireObject(structures[0], '$.evidence.structures[0]');
    readWireObject(firstStructure.snapshot, '$.evidence.structures[0].snapshot').points = [{ close: '1857' }];
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: malformed,
    }))).toThrow(AgentV2ContractError);
  });

  it('rejects unsafe diagnostic model text in V6 market analysis', () => {
    const content = readWireObject(cloneJson(buildAgentMarketAnalysisV6Fixture()), '$');
    const analysis = readWireObject(content.analysis, '$.analysis');
    analysis.summary = 'Raw OBV 123.12345678 from https://provider.example';

    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toThrow(AgentV2ContractError);
  });

  it('preserves bounded web-search failure reasons and rejects unknown ones', () => {
    const content = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'web_search_unavailable',
      arguments: { webSearchFailure: 'synthesis_timeout' },
    };

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ type: 'semantic_content', content });

    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        ...content,
        arguments: { webSearchFailure: 'private_provider_error' },
      },
    }))).toThrow(AgentV2ContractError);
  });

  it('preserves bounded Send failure reasons and validates aggregate ordering', () => {
    const content = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'send_unavailable',
      arguments: { sendFailure: 'recipient_ambiguous' },
    };

    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ type: 'semantic_content', content });

    const namedRecipientContent = {
      ...content,
      arguments: { sendFailure: 'recipient_not_found', recipientLabel: 'Pavel Durov' },
    };
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: namedRecipientContent,
    }))).toMatchObject({ type: 'semantic_content', content: namedRecipientContent });
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        ...namedRecipientContent,
        arguments: {
          ...namedRecipientContent.arguments,
          recipientLabel: 'x'.repeat(513),
        },
      },
    }))).toThrow(AgentV2ContractError);

    const aggregateContent = {
      ...content,
      arguments: {
        sendFailure: 'recipient_ambiguous',
        sendFailures: ['recipient_ambiguous', 'insufficient_balance'],
      },
    };
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content: aggregateContent,
    }))).toMatchObject({ type: 'semantic_content', content: aggregateContent });

    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        ...content,
        arguments: { sendFailure: 'private_matcher_error' },
      },
    }))).toThrow(AgentV2ContractError);

    for (const sendFailures of [
      ['insufficient_balance', 'recipient_ambiguous'],
      ['recipient_ambiguous', 'recipient_ambiguous'],
      ['recipient_ambiguous'],
      ['recipient_ambiguous', 'prepare_unavailable'],
      ['recipient_not_found', 'recipient_ambiguous'],
      ['asset_not_held', 'insufficient_balance'],
    ]) {
      expect(() => decodeAgentV2StreamEvent(event({
        type: 'semantic_content',
        sequence: 3,
        messageId: MESSAGE_ID,
        content: { ...content, arguments: { ...aggregateContent.arguments, sendFailures } },
      }))).toThrow(AgentV2ContractError);
    }
  });

  it('redacts unknown semantic variants and keeps the known-event decoder strict', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID,
      content: { kind: 'futureContent', schemaVersion: 8, raw: 'must-not-survive' },
    }))).toMatchObject({ content: { kind: 'clientUnsupported', schemaVersion: 1 } });
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'widget', sequence: 3, messageId: MESSAGE_ID,
      widget: { kind: 'legacyWidget', version: 1, payload: {} },
    }))).toThrow(AgentV2CompatibilityError);
    expect(decodeAgentV2StreamFrame(event({
      type: 'widget', sequence: 3, messageId: MESSAGE_ID,
      widget: { kind: 'legacyWidget', version: 1, payload: {} },
    }))).toEqual({
      disposition: 'ignore',
      envelope: { protocolVersion: 2, runId: RUN_ID, sequence: 3 },
      wireType: 'widget',
    });
  });

  it.each([
    { type: '', sequence: 3 },
    { type: 'x'.repeat(65), sequence: 3 },
    { type: 'future_optional', sequence: 0 },
    { type: 'future_optional', sequence: 3, runId: 'invalid' },
    { type: 'future_optional', sequence: 3, createdAt: 'invalid' },
  ])('rejects an unknown event with a malformed V2 envelope', (wireEvent) => {
    expect(() => decodeAgentV2StreamFrame(event(wireEvent))).toThrow(AgentV2ContractError);
  });

  it('does not soften unknown protocol versions or executable tool names', () => {
    expect(() => decodeAgentV2StreamFrame({
      ...event({ type: 'future_optional', sequence: 3 }),
      protocolVersion: 3,
    })).toThrow(AgentV2CompatibilityError);
    expect(() => decodeAgentV2StreamFrame(event({
      type: 'tool_call',
      sequence: 3,
      toolCall: {
        id: TOOL_CALL_ID,
        name: 'future.tool',
        version: 1,
        scopes: ['wallet.data.read'],
        timeoutMs: 1_000,
        walletContextSession: {
          sessionId: WALLET_SESSION_ID,
          revision: 1,
          accountScope: 'current',
          activeAccountRef: 'account_current',
        },
        arguments: {},
      },
    }))).toThrow();
  });

  it.each([
    { kind: 'notice', schemaVersion: 1, code: 'future_notice' },
    { kind: 'notice', schemaVersion: 1, code: 'market_quote', arguments: { marketQuote: { status: 'future' } } },
    { kind: 'walletQuery', schemaVersion: 1, queryKind: 'future', outcome: 'complete' },
    { kind: 'portfolio', schemaVersion: 1, view: 'future' },
    { kind: 'market', schemaVersion: 1, view: 'overview', outcome: 'future' },
    { kind: 'assetSearch', schemaVersion: 1, outcome: 'future' },
    { kind: 'webDigest', schemaVersion: 1, outcome: 'future' },
    { kind: 'notice', schemaVersion: 2, code: 'empty_result' },
  ])('maps an unknown semantic renderer extension to clientUnsupported', (content) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({
      content: { kind: 'clientUnsupported', schemaVersion: 1 },
    });
  });

  it('rejects malformed payload for a known semantic renderer branch', () => {
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'semantic_content',
      sequence: 3,
      messageId: MESSAGE_ID,
      content: {
        kind: 'notice',
        schemaVersion: 1,
        code: 'market_quote',
        arguments: { marketQuote: { status: 'resolved' } },
      },
    }))).toThrow(AgentV2ContractError);
  });

  it('decodes markdown and semantic persisted content while ignoring optional extensions', () => {
    const { chains: _chains, ...userWithoutChains } = persistedMessage(
      '44444444-4444-4444-8444-444444444444',
      'user',
      { kind: 'markdown', text: 'Hello' },
    );
    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [
        userWithoutChains,
        persistedMessage(MESSAGE_ID, 'assistant', {
          kind: 'semantic', content: semanticContents()[0],
        }),
      ],
    });
    expect(decoded.messages[0].content).toEqual({ kind: 'markdown', text: 'Hello' });
    expect(decoded.messages[1].content?.kind).toBe('semantic');
    expect(decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [{ ...persistedMessage(MESSAGE_ID, 'assistant'), text: 'legacy' }],
    }).messages).toHaveLength(1);
  });

  it('keeps persisted semantic messages with unsupported renderer content', () => {
    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [persistedMessage(MESSAGE_ID, 'assistant', {
        kind: 'semantic',
        content: { kind: 'notice', schemaVersion: 1, code: 'future_notice' },
      })],
    });

    expect(decoded.messages).toHaveLength(1);
    expect(decoded.messages[0].content).toEqual({
      kind: 'semantic',
      content: { kind: 'clientUnsupported', schemaVersion: 1 },
    });
  });

  it('keeps messages after dropping unknown persisted controls and reports malformed messages', () => {
    const contractMessageId = '77777777-7777-4777-8777-777777777777';
    const compatibilityMessageId = '88888888-8888-4888-8888-888888888888';
    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [
        persistedMessage(contractMessageId, 'assistant', { kind: 'markdown', text: 42 }),
        {
          ...persistedMessage(compatibilityMessageId, 'assistant'),
          actions: [{ id: '99999999-9999-4999-8999-999999999999', kind: 'futureAction' }],
        },
        persistedMessage(MESSAGE_ID, 'assistant', { kind: 'markdown', text: 'Still readable' }),
      ],
    });

    expect(decoded.messages).toHaveLength(2);
    expect(decoded.messages[0]).toMatchObject({ id: compatibilityMessageId });
    expect(decoded.messages[0].actions).toBeUndefined();
    expect(decoded.messages[1].id).toBe(MESSAGE_ID);
    expect(decoded.incompatibleMessages).toEqual([
      {
        index: 0,
        category: 'contract',
        boundary: '$.messages[0].content.text',
        messageId: contractMessageId,
      },
    ]);
  });

  it('filters unknown live controls and normalizes unknown progress and terminal values', () => {
    const supportedFollowup = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'suggested_prompt',
      text: 'Help me open staking.',
    };
    expect(decodeAgentV2StreamFrame(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action: { kind: 'futureAction' },
    }))).toMatchObject({ disposition: 'ignore', wireType: 'action' });
    expect(decodeAgentV2StreamFrame(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID,
      action: { kind: 'receive', schemaVersion: 4 },
    }))).toMatchObject({ disposition: 'ignore', wireType: 'action' });
    expect(() => decodeAgentV2StreamFrame(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action: { kind: 'openUrl' },
    }))).toThrow(AgentV2ContractError);
    expect(decodeAgentV2StreamFrame(event({
      type: 'followups', sequence: 3, messageId: MESSAGE_ID,
      items: [{ kind: 'futureFollowup' }, supportedFollowup],
    }))).toMatchObject({
      disposition: 'handle',
      event: { items: [supportedFollowup] },
    });
    expect(decodeAgentV2StreamFrame(event({
      type: 'input_continuations', sequence: 3, messageId: MESSAGE_ID,
      items: [{ kind: 'futureContinuation' }],
    }))).toMatchObject({ disposition: 'ignore', wireType: 'input_continuations' });
    expect(decodeAgentV2StreamFrame(event({
      type: 'tool_status', sequence: 3, toolCallId: TOOL_CALL_ID, status: 'future',
    }))).toMatchObject({ disposition: 'ignore', wireType: 'tool_status' });
    const toolStatus = decodeAgentV2StreamFrame(event({
      type: 'tool_status', sequence: 3, toolCallId: TOOL_CALL_ID,
      status: 'running', detailCode: 'future_detail',
    }));
    expect(toolStatus).toMatchObject({
      disposition: 'handle',
      event: { status: 'running' },
    });
    if (toolStatus.disposition !== 'handle') throw new Error('Expected handled tool status');
    expect(toolStatus.event).not.toHaveProperty('detailCode');
    expect(decodeAgentV2StreamFrame(event({
      type: 'run_activity', sequence: 3, code: 'future.phase', status: 'active',
    }))).toMatchObject({ disposition: 'ignore', wireType: 'run_activity' });
    expect(decodeAgentV2StreamFrame(event({
      type: 'run_activity', sequence: 3, code: 'web.reading_sources', status: 'completed',
      detail: { kind: 'source_count', count: 4 },
    }))).toMatchObject({
      disposition: 'handle',
      event: {
        type: 'run_activity',
        code: 'web.reading_sources',
        status: 'completed',
        detail: { kind: 'source_count', count: 4 },
      },
    });
    expect(() => decodeAgentV2StreamFrame(event({
      type: 'run_activity', sequence: 3, code: 'web.reading_sources', status: 'completed',
      detail: { kind: 'source_count', count: 12 },
    }))).toThrow(AgentV2ContractError);
    const retryableError = decodeAgentV2StreamFrame(event({
      type: 'error', sequence: 3, code: 'future_retryable', retryable: true,
      retryAfterMs: 'not-applicable', resetAt: 'not-applicable',
    }));
    expect(retryableError).toMatchObject({
      disposition: 'handle',
      event: { code: 'internal_error', retryable: true },
    });
    if (retryableError.disposition !== 'handle') throw new Error('Expected handled error');
    expect(retryableError.event).not.toHaveProperty('retryAfterMs');
    expect(retryableError.event).not.toHaveProperty('resetAt');
    expect(decodeAgentV2StreamFrame(event({
      type: 'error', sequence: 3, code: 'future_terminal', retryable: false,
    }))).toMatchObject({
      disposition: 'handle',
      event: { code: 'invalid_event', retryable: false },
    });
    const messageEnd = decodeAgentV2StreamFrame(event({
      type: 'message_end', sequence: 3, messageId: MESSAGE_ID,
      finishReason: 'future_finish', walletConversationContext: { malformed: true },
    }));
    expect(messageEnd).toMatchObject({
      disposition: 'handle',
      event: { finishReason: 'run_interrupted' },
    });
    if (messageEnd.disposition !== 'handle') throw new Error('Expected handled message end');
    expect(messageEnd.event).not.toHaveProperty('walletConversationContext');
  });

  it('decodes a bounded model-owned follow-up', () => {
    const marketFollowup = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'suggested_prompt',
      text: 'Explain market analysis.',
    };

    expect(decodeAgentV2StreamFrame(event({
      type: 'followups', sequence: 3, messageId: MESSAGE_ID, items: [marketFollowup],
    }))).toMatchObject({ disposition: 'handle', event: { items: [marketFollowup] } });
  });

  it('decodes the visible-content boundary independently from the terminal event', () => {
    expect(decodeAgentV2StreamFrame(event({
      type: 'message_content_end', sequence: 3, messageId: MESSAGE_ID,
    }))).toMatchObject({
      disposition: 'handle',
      event: { type: 'message_content_end', messageId: MESSAGE_ID },
    });
  });

  it.each([
    { text: '' },
    { text: ' Detailed analysis' },
    { text: 'Detailed\nanalysis' },
    { text: '**Detailed analysis**' },
    { text: 'x'.repeat(81) },
    { extra: true },
  ])('filters an invalid model-owned follow-up item: %o', (override) => {
    expect(decodeAgentV2StreamFrame(event({
      type: 'followups',
      sequence: 3,
      messageId: MESSAGE_ID,
      items: [{
        id: 'adadadad-adad-4dad-8dad-adadadadadad',
        kind: 'suggested_prompt',
        text: 'Explain market analysis.',
        ...override,
      }],
    }))).toMatchObject({ disposition: 'ignore', wireType: 'followups' });
  });

  it('keeps the first three unique valid follow-ups without failing the message', () => {
    const first = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'suggested_prompt',
      text: 'Explain staking risks.',
    };
    const second = {
      id: 'bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd',
      kind: 'suggested_prompt',
      text: 'How do staking rewards work?',
    };
    const third = {
      id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      kind: 'suggested_prompt',
      text: 'Compare staking options.',
    };
    const fourth = {
      id: 'dededede-dede-4ede-8ede-dededededede',
      kind: 'suggested_prompt',
      text: 'How do I unstake?',
    };

    expect(decodeAgentV2StreamFrame(event({
      type: 'followups',
      sequence: 3,
      messageId: MESSAGE_ID,
      items: [
        { kind: 'deterministic', code: 'prepare_stake' },
        first,
        { ...first, text: 'Duplicate id.' },
        second,
        third,
        fourth,
      ],
    }))).toMatchObject({
      disposition: 'handle',
      event: { items: [first, second, third] },
    });
  });

  it.each([
    'Explore staking risks.',
    'Риски стейкинга подробнее.',
  ] as const)('decodes server copy in the current request language', (text) => {
    const followup = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'suggested_prompt',
      text,
    };

    expect(decodeAgentV2StreamFrame(event({
      type: 'followups', sequence: 3, messageId: MESSAGE_ID, items: [followup],
    }))).toMatchObject({ disposition: 'handle', event: { items: [followup] } });
  });

  it('accepts server copy above the preferred display length', () => {
    const followup = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'suggested_prompt',
      text: 'x'.repeat(33),
    };

    expect(decodeAgentV2StreamFrame(event({
      type: 'followups', sequence: 3, messageId: MESSAGE_ID, items: [followup],
    }))).toMatchObject({ disposition: 'handle', event: { items: [followup] } });
  });

  it('filters controls with unknown behavioral selectors from live and persisted output', () => {
    const unsupportedFollowup = {
      id: 'adadadad-adad-4dad-8dad-adadadadadad',
      kind: 'deterministic',
      code: 'prepare_stake',
      intent: 'future_intent',
    };
    const unsupportedKindFollowup = {
      id: 'bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd',
      kind: 'futureFollowup',
      title: 'Future',
      prompt: 'Future prompt',
      intent: 'future_intent',
    };
    const unsupportedScenarioContinuation = {
      id: 'future-scenario-continuation',
      kind: 'collect_input',
      code: 'prepare_send_amount',
      scenario: 'future-scenario',
      field: 'amount',
    };
    const unsupportedFieldContinuation = {
      id: 'future-field-continuation',
      kind: 'collect_input',
      code: 'prepare_send_amount',
      scenario: 'prepare-send',
      field: 'future-field',
    };

    expect(decodeAgentV2StreamFrame(event({
      type: 'followups', sequence: 3, messageId: MESSAGE_ID,
      items: [unsupportedFollowup, unsupportedKindFollowup],
    }))).toMatchObject({ disposition: 'ignore', wireType: 'followups' });
    expect(decodeAgentV2StreamFrame(event({
      type: 'input_continuations', sequence: 3, messageId: MESSAGE_ID,
      items: [unsupportedScenarioContinuation, unsupportedFieldContinuation],
    }))).toMatchObject({ disposition: 'ignore', wireType: 'input_continuations' });

    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [{
        ...persistedMessage(MESSAGE_ID, 'assistant'),
        followups: [unsupportedFollowup, unsupportedKindFollowup],
        inputContinuations: [unsupportedScenarioContinuation, unsupportedFieldContinuation],
      }],
    });
    expect(decoded.messages).toHaveLength(1);
    expect(decoded.messages[0].followups).toBeUndefined();
    expect(decoded.messages[0].inputContinuations).toBeUndefined();
  });

  it.each([
    { type: 'followups', sequence: 3, messageId: MESSAGE_ID, items: [] },
    { type: 'input_continuations', sequence: 3, messageId: MESSAGE_ID, items: [] },
    { type: 'followups', sequence: 3, items: [{ kind: 'futureFollowup' }] },
    {
      type: 'input_continuations',
      sequence: 3,
      messageId: 'invalid',
      items: [{ kind: 'futureContinuation' }],
    },
  ])('rejects malformed known control output before compatibility filtering', (wireEvent) => {
    expect(() => decodeAgentV2StreamFrame(event(wireEvent))).toThrow(AgentV2ContractError);
  });

  it('normalizes unknown persisted errors without preserving timing extensions', () => {
    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [{
        ...persistedMessage(MESSAGE_ID, 'assistant'),
        error: { code: 'future_error', retryable: true, retryAfterMs: 'future' },
      }],
    });

    expect(decoded.messages[0].error).toEqual({ code: 'internal_error', retryable: true });
  });

  it('decodes persisted input continuations', () => {
    const message = {
      ...persistedMessage(MESSAGE_ID, 'assistant'),
      inputContinuations: [{
        id: 'prepare-send-amount',
        kind: 'collect_input',
        code: 'prepare_send_amount',
        scenario: 'prepare-send',
        field: 'amount',
      }, {
        id: 'prepare-swap-destination',
        kind: 'collect_input',
        code: 'prepare_swap_destination_asset',
        scenario: 'prepare-swap',
        field: 'asset',
      }],
    };

    expect(decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [message],
    }).messages[0].inputContinuations).toEqual(message.inputContinuations);
  });

  it.each([
    'market-analysis-details',
    'adadadad-adad-5dad-8dad-adadadadadad',
    'adadadad-adad-7dad-8dad-adadadadadad',
  ])('filters malformed or unsupported follow-up id %s', (id) => {
    expect(decodeAgentV2StreamFrame(event({
      type: 'followups',
      sequence: 3,
      messageId: MESSAGE_ID,
      items: [{
        id,
        kind: 'suggested_prompt',
        text: 'Help me open staking.',
      }],
    }))).toMatchObject({ disposition: 'ignore', wireType: 'followups' });
  });

  it.each(navigationFixture.projectionCases)(
    'decodes executable live and persisted V3 navigation action $id',
    ({ live, expectedPersisted }) => {
      expect(decodeAgentV2StreamEvent(event({
        type: 'action', sequence: 3, messageId: MESSAGE_ID, action: live,
      }))).toMatchObject({ action: live });
      expect(decodeAgentV2Messages({
        protocolVersion: 2,
        threadId: THREAD_ID,
        messages: [{ ...persistedMessage(MESSAGE_ID, 'assistant'), actions: [expectedPersisted] }],
      }).messages[0].actions).toEqual([expectedPersisted]);
    },
  );

  it('accepts configured navigation chains while rejecting unknown and wallet-only chain expansion', () => {
    const navigationAction = {
      id: TOOL_CALL_ID,
      schemaVersion: 3,
      kind: 'openTransaction',
      labelCode: 'open_transaction',
      chain: 'robinhood',
      transactionRef: 'transaction-1',
      requiresConfirmation: true,
    } as const;
    expect(decodeAgentV2PersistedAction(navigationAction)).toEqual(navigationAction);
    expect(() => decodeAgentV2PersistedAction({
      ...navigationAction,
      chain: 'bitcoin',
    })).toThrow(AgentV2ContractError);

    const sendAction = {
      id: TOOL_CALL_ID,
      kind: 'send',
      labelCode: 'open_send',
      effect: 'open_send',
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'account-current',
        activeNetwork: 'robinhood',
      },
      asset: { slug: 'robinhood', chain: 'robinhood' },
      recipient: {
        kind: 'address',
        chain: 'robinhood',
        address: '0x0000000000000000000000000000000000000000',
      },
      localDraftRequired: false,
      requiresConfirmation: false,
    } as const;
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'action', sequence: 3, messageId: MESSAGE_ID, action: sendAction,
    }))).toThrow(AgentV2ContractError);
  });

  it.each(navigationFixture.legacyReadCases)(
    'keeps legacy navigation readable for $kind',
    (legacy) => {
      expect(decodeAgentV2Messages({
        protocolVersion: 2,
        threadId: THREAD_ID,
        messages: [{ ...persistedMessage(MESSAGE_ID, 'assistant'), actions: [legacy] }],
      }).messages[0].actions).toEqual([legacy]);
    },
  );

  it('drops a persisted action with an unknown schema version without deleting its message', () => {
    const decoded = decodeAgentV2Messages({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [{
        ...persistedMessage(MESSAGE_ID, 'assistant'),
        actions: [navigationFixture.invalidV3[0]],
      }],
    });

    expect(decoded.messages).toHaveLength(1);
    expect(decoded.messages[0].actions).toBeUndefined();
  });

  it.each(navigationFixture.invalidV3.slice(1).map((action, index) => [index + 1, action] as const))(
    'skips a message with malformed persisted V3 navigation action %s',
    (_index, action) => {
      const decoded = decodeAgentV2Messages({
        protocolVersion: 2,
        threadId: THREAD_ID,
        messages: [{ ...persistedMessage(MESSAGE_ID, 'assistant'), actions: [action] }],
      });
      expect(decoded.messages).toEqual([]);
      expect(decoded.incompatibleMessages).toEqual([
        expect.objectContaining({
          index: 0,
          category: 'contract',
          messageId: MESSAGE_ID,
        }),
      ]);
    },
  );

  it('accepts code-only hints and ignores optional server-authored fields', () => {
    expect(decodeAgentV2Hints({
      protocolVersion: 2,
      catalogVersion: 'agent-starter-hints-v1',
      items: [{ id: 'receive.tokens', requiredCapabilities: ['receive_action'] }],
    }).items).toHaveLength(1);
    expect(decodeAgentV2Hints({
      protocolVersion: 2,
      catalogVersion: 'agent-starter-hints-v1',
      items: [{
        id: 'receive.tokens', requiredCapabilities: ['receive_action'],
        title: 'Receive', prompt: 'Receive tokens',
      }],
    }).items).toHaveLength(1);
  });

  it('accepts wallet-query capabilities without presentation negotiation', () => {
    const value = {
      protocolVersion: 2,
      status: 'available',
      supportedToolVersions: [5],
      filterCatalog: { version: 1, digest: 'a'.repeat(64), requiresClientTimeZone: true },
    };
    expect(decodeAgentV2WalletQueryCapabilitiesV2(value)).toEqual(value);
    expect(decodeAgentV2WalletQueryCapabilitiesV2({
      ...value,
      presentation: { textFormat: 'agentMarkdownV2', walletConversationContext: 'message_end_v1' },
    })).toMatchObject(value);
  });

  it('accepts the flat backend wallet-query V5 transaction frame', () => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      maxResultBytes: 98_304,
      intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'account_current',
        activeNetwork: 'ton',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'transactions.list',
        accountSelector: { kind: 'current' },
        chains: [],
        filters: {
          schemaVersion: 1,
          catalogDigest: contractManifest.walletFilterCatalogSha256,
          clauses: [],
        },
        riskMode: 'only',
        pageSize: 10,
      },
    };

    expect(decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall,
    }))).toMatchObject({ type: 'tool_call', toolCall });
    const decoded = decodeAgentV2StreamEvent(event({
      type: 'tool_call',
      sequence: 3,
      toolCall: {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          riskMode: 'future',
        },
      },
    }));
    if (decoded.type !== 'tool_call') throw new Error('Expected tool_call');
    expect(() => decodeAgentV2ToolArguments(decoded.toolCall)).toThrow(AgentV2ContractError);
  });

  it('accepts an explicit-all portfolio view-only filter and rejects it for current scope', () => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      maxResultBytes: 98_304,
      intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
      scopeIntent: { messageId: MESSAGE_ID, reason: 'explicit_all_wallet_query' },
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'explicitAll',
        activeAccountRef: 'account_current',
        activeNetwork: 'ton',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'portfolio.aggregate',
        accountSelector: { kind: 'explicitAll' },
        accountFilter: { viewOnly: 'exclude' },
        chains: [],
        range: '3m',
        groupBy: ['account', 'asset', 'network'],
        riskMode: 'all',
        visibilityMode: 'all',
      },
    };

    const decoded = decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall,
    }));
    if (decoded.type !== 'tool_call') throw new Error('Expected tool_call');
    expect(decodeAgentV2ToolArguments(decoded.toolCall)).toMatchObject({
      arguments: toolCall.arguments,
    });
    const invalid = decodeAgentV2StreamEvent(event({
      type: 'tool_call',
      sequence: 3,
      toolCall: {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          accountSelector: { kind: 'current' },
        },
      },
    }));
    if (invalid.type !== 'tool_call') throw new Error('Expected tool_call');
    expect(() => decodeAgentV2ToolArguments(invalid.toolCall)).toThrow(AgentV2ContractError);
  });

  it('accepts a current-wallet transaction list query without filters', () => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      maxResultBytes: 98_304,
      intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'account_current',
        activeNetwork: 'ton',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'transactions.list',
        accountSelector: { kind: 'current' },
        chains: [],
        filters: {
          schemaVersion: 1,
          catalogDigest: contractManifest.walletFilterCatalogSha256,
          clauses: [],
        },
        riskMode: 'exclude',
        pageSize: 50,
      },
    };

    const decoded = decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall,
    }));
    if (decoded.type !== 'tool_call') throw new Error('Expected tool_call');
    expect(decodeAgentV2ToolArguments(decoded.toolCall)).toMatchObject({
      arguments: toolCall.arguments,
    });
  });

  it('accepts the backend wallet-query V5 position policy fields', () => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      maxResultBytes: 98_304,
      intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'account_current',
        activeNetwork: 'ton',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'positions.list',
        accountSelector: { kind: 'current' },
        assetSelectors: [],
        chains: [],
        positionKinds: ['fungible'],
        riskMode: 'exclude',
        visibilityMode: 'visible',
        includeZero: false,
        sort: 'wallet_order',
        pageSize: 100,
      },
    };

    expect(decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3, toolCall,
    }))).toMatchObject({ type: 'tool_call', toolCall });
    const decoded = decodeAgentV2StreamEvent(event({
      type: 'tool_call', sequence: 3,
      toolCall: {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          riskMode: 'future',
        },
      },
    }));
    if (decoded.type !== 'tool_call') throw new Error('Expected tool_call');
    expect(() => decodeAgentV2ToolArguments(decoded.toolCall)).toThrow(AgentV2ContractError);
  });

  it.each([
    'a'.repeat(42),
    'aaaaaaaa…aaaaaaaa',
    `0x${'a'.repeat(40)}`,
  ])('rejects a shortened or masked transaction detail hash', (hash) => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      maxResultBytes: 98_304,
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'account_current',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'transactions.detail',
        accountSelector: { kind: 'current' },
        hash,
      },
    } as AgentToolCall;

    expect(() => decodeAgentV2ToolArguments(toolCall)).toThrow(AgentV2ContractError);
  });

  it('accepts a full EVM detail hash with an uppercase prefix', () => {
    const toolCall = {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      scopes: ['wallet.data.read'],
      timeoutMs: 30_000,
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'account_current',
      },
      arguments: {
        schemaVersion: 5,
        operation: 'transactions.detail',
        accountSelector: { kind: 'current' },
        hash: `0X${'A'.repeat(64)}`,
      },
    } as AgentToolCall;

    expect(decodeAgentV2ToolArguments(toolCall)).toBe(toolCall);
  });

  it.each([
    {
      kind: 'walletQuery',
      schemaVersion: 1,
      queryKind: 'transactions',
      outcome: 'complete',
      hasMore: false,
      omittedRows: { count: 3, accuracy: 'lower_bound' },
      policySummary: {
        presentation: 'quarantine',
        suspicious: { count: 1, accuracy: 'lower_bound' },
      },
      rows: [{
        chain: 'ton',
        transactionType: 'transfer',
        status: 'completed',
        timestamp: '2026-08-07T15:15:00.000Z',
        assetLabelStatus: 'redacted_unsafe',
      }],
    },
    {
      kind: 'walletQuery',
      schemaVersion: 1,
      queryKind: 'positions',
      outcome: 'partial',
      hasMore: false,
      policySummary: {
        presentation: 'standard',
        omittedSpam: { count: 2, accuracy: 'exact' },
        omittedHidden: { count: 1, accuracy: 'exact' },
      },
      rows: [{
        chain: 'ton',
        positionKind: 'fungible',
        assetLabelStatus: 'redacted_unsafe',
      }],
    },
    {
      kind: 'walletQuery',
      schemaVersion: 1,
      queryKind: 'positions',
      outcome: 'complete',
      hasMore: false,
      policySummary: {
        presentation: 'hidden_review',
        suspicious: { count: 1, accuracy: 'exact' },
      },
      rows: [{
        chain: 'ton',
        positionKind: 'fungible',
        assetName: 'Gram Event',
        assetSymbol: 'GRAM AT GRAMEVENT.ORG',
        assetLabelStatus: 'untrusted_plaintext',
        quantity: '100',
      }],
    },
  ])('accepts wallet-query policy semantic content for $queryKind', (content) => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID, content,
    }))).toMatchObject({ type: 'semantic_content', content });
  });

  it('decodes account overview rows tolerantly and marks malformed neighbors partial', () => {
    const decoded = decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID,
      content: {
        kind: 'walletQuery', schemaVersion: 1, queryKind: 'accounts',
        outcome: 'complete', hasMore: false, futureDisplay: true,
        rows: [{
          accountLabel: 'Main | **literal**', accessMode: 'regular',
          portfolioTotalStatus: 'complete', futureDisplay: 'ok',
          portfolioTotal: { value: '42.5', baseCurrency: 'USD', unpricedCount: 0, futureRate: 'ok' },
        }, {
          accountLabel: 'Watch', accessMode: 'view_only',
          portfolioTotalStatus: 'unavailable',
        }, {
          accountLabel: 'Broken', accessMode: 'regular',
          portfolioTotalStatus: 'complete',
        }],
      },
    }));

    expect(decoded).toMatchObject({
      content: {
        queryKind: 'accounts', outcome: 'partial',
        rows: [{
          accountLabel: 'Main | **literal**', accessMode: 'regular',
          portfolioTotal: { value: '42.5', baseCurrency: 'USD', unpricedCount: 0 },
        }, {
          accountLabel: 'Watch', accessMode: 'view_only', portfolioTotalStatus: 'unavailable',
        }],
      },
    });
  });

  it('accepts the choice-only backend wallet conversation context V5 shape', () => {
    const context = {
      schemaVersion: 5,
      sourceAssistantMessageId: MESSAGE_ID,
      sessionId: WALLET_SESSION_ID,
      revision: 1,
      operation: 'positions.list',
      query: {
        schemaVersion: 5,
        operation: 'positions.list',
        accountSelector: { kind: 'named', label: 'Savings' },
        assetSelectors: [],
        chains: [],
        positionKinds: ['fungible'],
        riskMode: 'exclude',
        visibilityMode: 'visible',
        includeZero: false,
        sort: 'wallet_order',
        pageSize: 100,
      },
      scopeChoices: [{
        choiceId: `choice_${'a'.repeat(22)}`,
        scopeAnchor: `scope_${'b'.repeat(22)}`,
        label: 'Savings',
        ordinal: 2,
        chains: ['ton'],
      }],
      expiresAt: '2026-08-07T15:15:00.000Z',
    };

    expect(decodeAgentV2StreamEvent(event({
      type: 'message_end', sequence: 8, messageId: MESSAGE_ID, finishReason: 'complete',
      walletConversationContext: context,
    }))).toMatchObject({ walletConversationContext: context });
    expect(() => decodeAgentV2StreamEvent(event({
      type: 'message_end', sequence: 8, messageId: MESSAGE_ID, finishReason: 'complete',
      walletConversationContext: {
        ...context,
        query: { ...context.query, riskMode: 'future' },
      },
    }))).toThrow(AgentV2ContractError);
  });

  it('accepts code-only terminal errors and ignores optional server extensions', () => {
    expect(decodeAgentV2StreamEvent(event({
      type: 'error', sequence: 4, code: 'tool_failed', retryable: true, messageId: MESSAGE_ID,
    }))).toMatchObject({ code: 'tool_failed' });
    expect(decodeAgentV2StreamEvent(event({
      type: 'error', sequence: 4, code: 'tool_failed', retryable: true,
      userMessage: 'Server-authored copy',
    }))).toMatchObject({ code: 'tool_failed' });
  });

  it('keeps safe wallet rows when a neighboring display row is malformed', () => {
    const decoded = decodeAgentV2StreamEvent(event({
      type: 'semantic_content', sequence: 3, messageId: MESSAGE_ID,
      content: {
        kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions',
        outcome: 'complete', hasMore: false, futureDisplay: true,
        rows: [
          {
            chain: 'ton', transactionType: 'transfer', status: 'completed',
            timestamp: '2026-08-07T15:15:00.000Z', assetSymbol: 'TON', futureDisplay: 'ok',
          },
          { chain: 'ton', transactionType: 'transfer', status: 'completed', timestamp: 'invalid' },
        ],
      },
    }));

    expect(decoded).toMatchObject({
      content: {
        outcome: 'partial',
        rows: [{ assetSymbol: 'TON' }],
      },
    });
  });
});

function swapActionFixture() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    schemaVersion: 1 as const,
    kind: 'swap' as const,
    labelCode: 'open_swap' as const,
    effect: 'open_swap' as const,
    sourceToolCallId: TOOL_CALL_ID,
    contextBinding: {
      sessionId: WALLET_SESSION_ID,
      revision: 1,
      activeAccountRef: 'account-current',
    },
    sourceAsset: { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 },
    destinationAsset: { slug: 'usdton', chain: 'ton' as const, symbol: 'USDT', decimals: 6 },
    amount: { value: '10', valueType: 'decimal' as const, side: 'source' as const },
    localDraftRequired: false as const,
    requiresConfirmation: false as const,
  };
}

function event(value: Record<string, unknown>) {
  return { protocolVersion: 2, runId: RUN_ID, ...value };
}

function decodeCompatibilityFixtureGroup(fixture: CompatibilityFixtureGroup) {
  switch (fixture.schema) {
    case 'AgentStreamEventV2':
      fixture.values.forEach((value) => expect(decodeAgentV2StreamEvent(value)).toBeDefined());
      break;
    case 'AgentThreadMessagesPageV2':
      fixture.values.forEach((value) => expect(decodeAgentV2Messages(value)).toBeDefined());
      break;
    default:
      throw new Error(`Unsupported Agent V2 compatibility fixture: ${fixture.schema}`);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fearGreedRegime(): AgentMarketFearGreedRegimeV1 {
  return {
    schemaVersion: 1,
    policyVersion: 'fear-greed-sma-regime-v1',
    basis: 'closed_utc_daily',
    asOfDate: '2026-08-09',
    latestValue: 63,
    sma30: '58.25000000',
    sma365: '51.50000000',
    regime: 'risk_on',
    seriesDigest: 'a'.repeat(64),
    source: {
      provider: 'alternative_me',
      endpoint: 'alternative.fng',
      attributionRequired: true,
      attributionLabel: 'Alternative.me',
      attributionUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
    },
  };
}

function isMarketNodeRef(reference: string) {
  return /^profile\.[^.]+\.(?:hvn|lvn)\./u.test(reference);
}

function removeMarketNodeSources(zone: AgentMarketPriceZoneV1) {
  zone.sources = zone.sources.filter(({ evidenceRef }) => !isMarketNodeRef(evidenceRef));
}

function getFixtureHvnSource(content: ReturnType<typeof buildAgentMarketAnalysisV6Fixture>) {
  const map = content.evidence.levelMaps['7d'];
  if (map.status !== 'available') throw new Error('Expected available fixture level map');
  const source = map.supports[0].sources.find(({ kind }) => kind === 'volume_profile_hvn');
  if (!source) throw new Error('Expected fixture HVN source');
  return source;
}

function getFixturePrimaryPath(content: ReturnType<typeof buildAgentMarketAnalysisV6Fixture>) {
  const path = content.evidence.scenarioTrees['7d'].paths.find((candidate) => (
    candidate.status === 'eligible' && candidate.priority === 'primary'
  ));
  if (!path || path.status !== 'eligible') throw new Error('Expected fixture primary path');
  return path;
}

function getFixtureTransit(content: ReturnType<typeof buildAgentMarketAnalysisV6Fixture>) {
  const transit = getFixturePrimaryPath(content).path.find(({ role }) => role === 'transit');
  if (!transit) throw new Error('Expected fixture transit step');
  return transit;
}

function historicalMarketAnalysisV6Fixture() {
  const content = cloneJson(buildAgentMarketAnalysisV6Fixture());
  for (const horizon of ['3d', '7d', '30d'] as const) {
    const map = content.evidence.levelMaps[horizon];
    map.policyVersion = 'market-level-map-v1';
    if (map.status === 'available') {
      [...map.supports, ...map.resistances, ...(map.equilibrium ? [map.equilibrium] : [])]
        .forEach(removeMarketNodeSources);
    }
    const tree = content.evidence.scenarioTrees[horizon];
    delete tree.activeScenario;
    tree.policyVersion = 'market-structural-scenarios-v1';
    tree.paths.forEach((path) => {
      if (path.status !== 'eligible') return;
      path.path = path.path.filter(({ role }) => role !== 'transit');
      path.path.forEach(({ zone }) => removeMarketNodeSources(zone));
      removeMarketNodeSources(path.terminalZone);
      path.evidenceRefs = path.evidenceRefs.filter((reference) => !isMarketNodeRef(reference));
    });
  }
  content.evidence.evidenceCatalog = content.evidence.evidenceCatalog
    .filter(({ id }) => !isMarketNodeRef(id));
  content.analysis.consideredEvidence = content.analysis.consideredEvidence
    .filter((reference) => !isMarketNodeRef(reference));
  return content;
}

function persistedMessage(id: string, role: 'user' | 'assistant', content?: unknown) {
  return {
    id,
    threadId: THREAD_ID,
    role,
    status: 'complete',
    ...(content ? { content } : {}),
    createdAt: '2026-08-06T12:00:00.000Z',
    chains: ['ton'],
  };
}

function semanticContents() {
  return [
    { kind: 'notice', schemaVersion: 1, code: 'wallet_data_unavailable' },
    { kind: 'notice', schemaVersion: 1, code: 'send_form_amount_required' },
    {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions', outcome: 'empty', hasMore: false, rows: [],
    },
    {
      kind: 'portfolio', schemaVersion: 1, view: 'positions', outcome: 'complete',
      payload: {
        id: MESSAGE_ID,
        status: 'complete',
        accountScope: 'current',
        baseCurrency: 'USD',
        generatedAt: '2026-08-06T12:00:00.000Z',
        positions: [],
        unpriced: [],
        omittedUnpricedAssetCount: 0,
        dataQuality: { coverage: 'complete', limitations: [] },
      },
    },
    portfolioAnalysisContent(),
    marketOverviewContent(),
    {
      kind: 'assetSearch', schemaVersion: 1, outcome: 'ambiguous',
      candidates: [
        { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
        { slug: 'wrapped-ton', chain: 'ton', symbol: 'WTON' },
      ],
    },
    { kind: 'webDigest', schemaVersion: 1, outcome: 'empty', items: [] },
  ];
}

function portfolioAnalysisContent() {
  return {
    kind: 'portfolio',
    schemaVersion: 1,
    view: 'analysis',
    outcome: 'complete',
    narrativeStatus: 'provider_accepted',
    payload: {
      id: 'portfolio-analysis-1',
      status: 'complete',
      accountScope: 'current',
      baseCurrency: 'USD',
      range: '1d',
      generatedAt: '2026-08-06T12:00:00.000Z',
      totalValue: { value: '100', currency: 'USD', asOf: '2026-08-06T12:00:00.000Z' },
      signals: [{
        id: 'signal-1',
        category: 'performance',
        severity: 'info',
        confidence: 'high',
        relevance: 'focused',
        code: 'portfolio_stable',
      }],
      dataQuality: {
        freshness: { asOf: '2026-08-06T12:00:00.000Z', isStale: false },
      },
    },
  };
}

function marketOverviewContent() {
  const source = {
    provider: 'binance',
    endpoint: 'binance.ticker_price',
    attributionRequired: true,
    attributionLabel: 'Binance',
    attributionUrl: 'https://www.binance.com/',
  };
  const freshness = {
    source: 'fresh_fetch',
    isStale: false,
    asOf: '2026-08-06T12:00:00.000Z',
    maxStaleMs: 60_000,
  };
  const assetChange = (slug: string, symbol: string) => ({
    asset: { slug, chain: 'ton', symbol },
    quote: { price: '1.25', quoteCurrency: 'USDT', asOf: '2026-08-06T12:00:00.000Z' },
    change: {
      timeframe: '1d',
      fromAt: '2026-08-05T12:00:00.000Z',
      toAt: '2026-08-06T12:00:00.000Z',
      percent: '2.5',
    },
    freshness,
    quoteSource: source,
    changeSource: source,
  });
  return {
    kind: 'market',
    schemaVersion: 1,
    view: 'overview',
    outcome: 'partial',
    evidence: {
      schemaVersion: 2,
      basketVersion: 'market-overview-v2',
      timeframe: '1d',
      quoteCurrency: 'USDT',
      generatedAt: '2026-08-06T12:00:00.000Z',
      scope: 'selected_assets',
      direction: 'up',
      directionBasis: 'latest_closed_candle',
      assets: [assetChange('toncoin', 'TON'), assetChange('bitcoin', 'BTC')],
      coverage: {
        requestedAssetCount: 3,
        usableAssetCount: 2,
        isComplete: false,
        missingAssets: [{ slug: 'ethereum', chain: 'ethereum', symbol: 'ETH' }],
      },
      limitations: ['partial_asset_coverage'],
    },
  };
}
