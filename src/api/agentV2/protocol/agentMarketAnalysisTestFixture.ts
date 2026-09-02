import type {
  AgentMarketAnalysisEvidenceV6,
  AgentMarketAnalysisOutputV4,
  AgentMarketContentV1,
  AgentMarketForecastHorizonV1,
  AgentMarketPriceZoneV1,
  AgentMarketScenarioPathV1,
  AgentMarketStructureSnapshotV1,
  AgentMarketVolumeProfileKindV6,
  AgentMarketVolumeProfileSlotV6,
} from './types';

const AS_OF = '2026-08-09T12:00:00.000Z';
const TARGET_AT = {
  '3d': '2026-08-12T12:00:00.000Z',
  '7d': '2026-08-16T12:00:00.000Z',
  '30d': '2026-09-08T12:00:00.000Z',
} as const;
const DURATION_DAYS = { '3d': 3, '7d': 7, '30d': 30 } as const;
const PREVIOUS_WEEK_HVN_REF = 'profile.previous_week.hvn.1';
const PREVIOUS_WEEK_LVN_REF = 'profile.previous_week.lvn.1';

export function buildAgentMarketAnalysisV6Fixture(): Extract<
  AgentMarketContentV1, { view: 'analysis' }
> & { evidence: AgentMarketAnalysisEvidenceV6; analysis: AgentMarketAnalysisOutputV4 } {
  const horizons = ['3d', '7d', '30d'] as const;
  const profileRefs = [
    'profile.previous_week.poc',
    'profile.previous_week.val',
    'profile.previous_week.vah',
    PREVIOUS_WEEK_HVN_REF,
    PREVIOUS_WEEK_LVN_REF,
  ];
  const catalog = [
    ...Array.from({ length: 45 }, (_, index) => ({
      id: `indicator.fixture.${index}`,
      family: 'indicator' as const,
      available: true,
      claimable: true,
    })),
    ...profileRefs.map((id) => ({ id, family: 'profile' as const, available: true, claimable: true })),
  ];
  const evidence: AgentMarketAnalysisEvidenceV6 = {
    schemaVersion: 6,
    requestedHorizons: [...horizons],
    primaryDisplayHorizon: '7d',
    technicalEvidence: {
      schemaVersion: 4,
      asset: { slug: 'ethereum', chain: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
      primaryTimeframe: '1d',
      quote: { price: '1857.44000000', quoteCurrency: 'USDT', asOf: AS_OF },
      quoteSource: {
        provider: 'binance', endpoint: 'binance.ticker_price', attributionRequired: true,
        attributionLabel: 'Binance', attributionUrl: 'https://www.binance.com/',
      },
      asOf: AS_OF,
      timeframes: [
        timeframeSlot('1d', '-1.26740000'),
        timeframeSlot('4h', '0.44210000'),
        timeframeSlot('1h', '-0.23010000'),
      ],
      coverage: {
        requestedTimeframeCount: 3, availableTimeframeCount: 3,
        requestedIndicatorCount: 39, availableIndicatorCount: 38, complete: false,
      },
    },
    structures: [
      structureSlot('1d', 'lower_highs_lower_lows', 'break_down'),
      structureSlot('4h', 'transition', 'none'),
      structureSlot('1h', 'range', 'none'),
    ],
    levelMaps: Object.fromEntries(horizons.map((horizon) => [horizon, levelMap(horizon)])) as never,
    expectedMoves: Object.fromEntries(horizons.map((horizon) => [horizon, expectedMove(horizon)])) as never,
    scenarioTrees: Object.fromEntries(horizons.map((horizon) => [horizon, scenarioTree(horizon)])) as never,
    volumeProfileCoverage: {
      requestedProfileCount: 4,
      availableProfileCount: 4,
      complete: true,
      profiles: [
        profile('current_day', '1834.00000000', '1795.00000000', '1882.00000000', 'developing'),
        profile('previous_day', '1848.00000000', '1808.00000000', '1894.00000000', 'closed'),
        profile('previous_week', '1860.00000000', '1780.00000000', '1935.00000000', 'closed'),
        profile('rolling_30d', '2020.00000000', '1750.00000000', '2290.00000000', 'developing'),
      ],
    },
    evidenceCatalog: catalog,
    coverage: {
      structureTimeframeCount: 3,
      availableLevelMapCount: 3,
      eligibleScenarioCount: 9,
      complete: true,
    },
  };
  const analysis: AgentMarketAnalysisOutputV4 = {
    schemaVersion: 4,
    consideredEvidence: catalog.map(({ id }) => id),
    summary: 'The confirmed regime is range balance, while the bearish path remains conditional.',
    summaryEvidence: ['indicator.fixture.0', 'profile.previous_week.poc'],
    timeframeViews: [
      { timeframe: '1d', text: 'Daily structure remains bearish.', evidence: ['indicator.fixture.0'] },
      { timeframe: '4h', text: 'The four-hour structure is transitional.', evidence: ['indicator.fixture.1'] },
      { timeframe: '1h', text: 'The hourly structure is balanced.', evidence: ['indicator.fixture.2'] },
    ],
    factors: [
      {
        category: 'structure', role: 'supporting', stance: 'bearish',
        text: 'Daily structure continues to form lower highs and lower lows.',
        evidence: ['indicator.fixture.0'],
      },
      {
        category: 'levels', role: 'opposing', stance: 'bearish',
        text: 'Price remains below the nearest confirmed resistance zone.',
        evidence: ['indicator.fixture.1'],
      },
      {
        category: 'volume', role: 'risk', stance: 'neutral',
        text: 'The previous-week volume area can absorb directional momentum.',
        evidence: ['profile.previous_week.poc'],
      },
    ],
    materialRisk: {
      text: 'A confirmed daily close above resistance would invalidate the bearish continuation path.',
      evidence: ['indicator.fixture.1'],
    },
    horizons: {
      '3d': { rationale: 'Short-term structure remains conditional.', evidence: ['indicator.fixture.1'] },
      '7d': { rationale: 'Daily structure controls the weekly path.', evidence: ['indicator.fixture.0'] },
      '30d': {
        rationale: 'Longer-horizon volatility keeps the terminal zone broad.',
        evidence: ['indicator.fixture.2'],
      },
    },
  };
  return { kind: 'market', schemaVersion: 1, view: 'analysis', outcome: 'complete', evidence, analysis };
}

function timeframeSlot(timeframe: '1d' | '4h' | '1h', percent: string) {
  return {
    status: 'available' as const,
    timeframe,
    evidence: {
      change: {
        timeframe,
        fromAt: '2026-08-08T00:00:00.000Z',
        toAt: '2026-08-09T00:00:00.000Z',
        absolute: '-24.00000000',
        percent,
        quoteCurrency: 'USDT' as const,
      },
      freshness: freshness(),
    },
  };
}

function structureSlot(
  timeframe: '1d' | '4h' | '1h',
  direction: AgentMarketStructureSnapshotV1['direction'],
  event: AgentMarketStructureSnapshotV1['event'],
) {
  return {
    timeframe,
    snapshot: {
      timeframe,
      direction,
      event,
      liveState: timeframe === '4h' ? 'approaching_upper' as const : 'inside_structure' as const,
      freshness: freshness(),
    },
  };
}

function levelMap(horizon: AgentMarketForecastHorizonV1) {
  const support = zone(`level.${horizon}.support`, '1780.00000000', '1800.00000000', 'support');
  const resistance = zone(`level.${horizon}.resistance`, '1920.00000000', '1940.00000000', 'resistance');
  if (horizon === '7d') {
    support.sources.push({
      kind: 'volume_profile_val', timeframe: 'period', evidenceRef: 'profile.previous_week.val',
    });
    support.sources.push({
      kind: 'volume_profile_hvn', timeframe: 'profile', evidenceRef: PREVIOUS_WEEK_HVN_REF,
    });
    resistance.sources.push({
      kind: 'volume_profile_vah', timeframe: 'period', evidenceRef: 'profile.previous_week.vah',
    });
  }
  return {
    status: 'available' as const,
    horizon,
    tolerance: '20.00000000',
    supports: [support],
    resistances: [resistance],
    equilibrium: {
      ...zone(`level.${horizon}.poc`, '1850.00000000', '1870.00000000', 'transition'),
      sources: horizon === '7d' ? [{
        kind: 'volume_profile_poc' as const, timeframe: 'period' as const,
        evidenceRef: 'profile.previous_week.poc',
      }] : [{
        kind: 'range_midpoint' as const, timeframe: 'period' as const,
        evidenceRef: `level.${horizon}.midpoint`,
      }],
    },
    coverage: { candidateCount: 7, zoneCount: 3, actionableZoneCount: 2, complete: true },
    policyVersion: 'market-level-map-v2',
  };
}

function expectedMove(horizon: AgentMarketForecastHorizonV1) {
  const multiplier = horizon === '3d' ? 1 : horizon === '7d' ? 2 : 4;
  return {
    status: 'available' as const,
    horizon,
    durationDays: DURATION_DAYS[horizon],
    targetAt: TARGET_AT[horizon],
    movePct: `${(5 * multiplier).toFixed(8)}`,
    ranges: {
      bearish: { lower: `${1500 - 10 * multiplier}.00000000`, upper: `${1700 - 10 * multiplier}.00000000` },
      base: { lower: `${1700 - 10 * multiplier}.00000000`, upper: `${2000 + 10 * multiplier}.00000000` },
      bullish: { lower: `${2000 + 10 * multiplier}.00000000`, upper: `${2200 + 20 * multiplier}.00000000` },
    },
  };
}

function scenarioTree(horizon: AgentMarketForecastHorizonV1) {
  const map = levelMap(horizon);
  const paths = [
    scenarioPath(horizon, 'bullish_breakout', map.resistances[0], 'alternative'),
    scenarioPath(horizon, 'range_balance', map.equilibrium, 'tail'),
    scenarioPath(horizon, 'bearish_breakdown', map.supports[0], 'primary'),
  ] as [AgentMarketScenarioPathV1, AgentMarketScenarioPathV1, AgentMarketScenarioPathV1];
  return {
    horizon,
    targetAt: TARGET_AT[horizon],
    directionalState: 'bearish' as const,
    activeScenario: 'range_balance' as const,
    primaryScenario: 'bearish_breakdown' as const,
    paths,
    policyVersion: 'market-structural-scenarios-v2',
  };
}

function scenarioPath(
  horizon: AgentMarketForecastHorizonV1,
  kind: Extract<AgentMarketScenarioPathV1, { status: 'eligible' }>['kind'],
  terminalZone: AgentMarketPriceZoneV1,
  priority: Extract<AgentMarketScenarioPathV1, { status: 'eligible' }>['priority'],
): Extract<AgentMarketScenarioPathV1, { status: 'eligible' }> {
  const isBearish = kind === 'bearish_breakdown';
  const isRange = kind === 'range_balance';
  const hasLvnTransit = horizon === '7d' && isBearish && priority === 'primary';
  const finalZone = hasLvnTransit
    ? zone(`expected.${horizon}.bearish`, '1650.00000000', '1670.00000000', 'support')
    : terminalZone;
  const path = hasLvnTransit ? [
    {
      zone: terminalZone,
      role: 'acceptance' as const,
      expectedConfirmation: '1d_close' as const,
      insideExpectedMove: true,
    },
    {
      zone: {
        ...zone(PREVIOUS_WEEK_LVN_REF, '1720.00000000', '1740.00000000', 'transition'),
        strength: 'context' as const,
        sources: [{
          kind: 'volume_profile_lvn' as const,
          timeframe: 'profile' as const,
          evidenceRef: PREVIOUS_WEEK_LVN_REF,
        }],
        touchCount: 0,
        rejectionCount: 0,
        state: 'untested' as const,
      },
      role: 'transit' as const,
      expectedConfirmation: '1d_close' as const,
      insideExpectedMove: true,
    },
    {
      zone: finalZone,
      role: 'target' as const,
      expectedConfirmation: '1d_close' as const,
      insideExpectedMove: true,
    },
  ] : [{
    zone: terminalZone,
    role: isRange ? 'test' as const : 'acceptance' as const,
    expectedConfirmation: horizon === '3d' ? '4h_close' as const : '1d_close' as const,
    insideExpectedMove: true,
  }];
  return {
    status: 'eligible',
    kind,
    priority,
    horizon,
    targetAt: TARGET_AT[horizon],
    activation: {
      zoneIds: [terminalZone.id],
      direction: isRange ? 'inside' : isBearish ? 'below' : 'above',
      confirmationBasis: horizon === '3d' ? '4h_close' : '1d_close',
      state: isRange ? 'triggered' : 'not_triggered',
    },
    path,
    terminalZone: finalZone,
    invalidation: {
      zoneIds: [terminalZone.id],
      direction: isRange ? 'outside' : isBearish ? 'above' : 'below',
      confirmationBasis: horizon === '3d' ? '4h_close' : '1d_close',
      state: 'not_triggered',
    },
    expectedMove: { movePct: '10.00000000', lower: '1650.00000000', upper: '2050.00000000' },
    evidenceRefs: [
      `scenario.${horizon}.${kind}`,
      ...(hasLvnTransit ? [PREVIOUS_WEEK_HVN_REF, PREVIOUS_WEEK_LVN_REF] : []),
    ],
    confidence: horizon === '7d' ? 'medium' : 'low',
  };
}

function zone(
  id: string,
  lower: string,
  upper: string,
  role: AgentMarketPriceZoneV1['role'],
): AgentMarketPriceZoneV1 {
  return {
    id,
    lower,
    upper,
    role,
    strength: 'secondary',
    sources: [{
      kind: role === 'support' ? 'swing_low' : role === 'resistance' ? 'swing_high' : 'range_midpoint',
      timeframe: role === 'transition' ? 'period' : '1d',
      evidenceRef: `${id}.source`,
    }],
    touchCount: 2,
    rejectionCount: 1,
    state: 'holding',
  };
}

function profile(
  kind: AgentMarketVolumeProfileKindV6,
  pointOfControl: string,
  valueAreaLow: string,
  valueAreaHigh: string,
  state: 'developing' | 'closed',
): Extract<AgentMarketVolumeProfileSlotV6, { status: 'available' }> {
  return {
    kind,
    status: 'available',
    position: 'inside_value_area',
    pointOfControl,
    valueAreaLow,
    valueAreaHigh,
    valueAreaCoveragePct: '70.00000000',
    periodStartAt: '2026-07-11T00:00:00.000Z',
    periodEndAt: '2026-08-10T00:00:00.000Z',
    asOf: AS_OF,
    state,
    source: { venue: 'binance_spot' },
    freshness: freshness(),
    evidenceRefs: {
      pointOfControl: `profile.${kind}.poc`,
      valueAreaLow: `profile.${kind}.val`,
      valueAreaHigh: `profile.${kind}.vah`,
    },
  };
}

function freshness() {
  return {
    isStale: false as const,
    source: 'memory_cache' as const,
    asOf: AS_OF,
    maxStaleMs: 600_000,
  };
}
