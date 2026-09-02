import type {
  AgentClientUnsupportedContentV1,
  EntryPoint,
  Freshness,
} from './coreRun';
import type {
  AgentApiChain,
  AgentMoneyAmount,
  AgentPublicFollowUpOpaqueIdV2,
  AgentSemanticAssetV1,
  UtcTimestampMs,
  Uuid,
} from './shared';
import type {
  AgentAssetIdentityV2,
  AgentAssetSearchContentV1,
  AgentSwapAmountV1,
  AgentSwapIndicativeQuoteV1,
  AgentWalletQueryContentV1,
} from './wallet';

export type AgentPortfolioPositionsFeatureStatusV1 = 'available' | 'disabled';

export type AgentMarketAnalysisEvidenceRefsV4 = string[];

export type AgentMarketAnalysisTimeframeV2 = '1h' | '4h' | '1d';

export type AgentMarketSourceRefV2 =
  | {
    provider: 'binance';
    endpoint: 'binance.ticker_price' | 'binance.klines';
    attributionRequired: true;
    attributionLabel: 'Binance';
    attributionUrl: 'https://www.binance.com/';
  }
  | {
    provider: 'bybit';
    endpoint: 'bybit.tickers' | 'bybit.klines';
    attributionRequired: true;
    attributionLabel: 'Bybit';
    attributionUrl: 'https://www.bybit.com/';
  }
  | {
    provider: 'coingecko';
    endpoint:
      | 'coingecko.global'
      | 'coingecko.simple_price'
      | 'coingecko.global_market_cap_chart'
      | 'coingecko.coin_market_chart';
    attributionRequired: true;
    attributionLabel: 'CoinGecko';
    attributionUrl: 'https://www.coingecko.com/';
  }
  | {
    provider: 'alternative_me';
    endpoint: 'alternative.fng';
    attributionRequired: true;
    attributionLabel: 'Alternative.me';
    attributionUrl: 'https://alternative.me/crypto/fear-and-greed-index/';
  };

export type AgentMarketAssetIdentityV1 = Record<string, unknown> & {
  resolverVersion: 'market-asset-resolver-v1';
  identityKey: string;
  assetClass: 'native' | 'token';
  slug: string;
  chain: AgentMarketCanonicalChainV1;
  symbol: string;
  name?: string;
  tokenAddress?: string;
  providerBindings: {
    binance?: string;
    alternative_me?: string;
    coingecko?: string;
  };
};

export type AgentMarketCanonicalChainV1 =
  | 'ton'
  | 'tron'
  | 'solana'
  | 'bitcoin'
  | 'ethereum'
  | 'base'
  | 'bnb'
  | 'polygon'
  | 'arbitrum'
  | 'monad'
  | 'avalanche'
  | 'hyperliquid';

export type AgentMarketContentV1 =
  | {
    kind: 'market';
    schemaVersion: 1;
    view: 'overview';
    outcome: 'complete' | 'partial';
    evidence: AgentMarketOverviewEvidenceV2;
    narrativeMarkdown?: string;
  }
  | {
    kind: 'market';
    schemaVersion: 1;
    view: 'analysis';
    outcome: 'complete' | 'partial';
    evidence: AgentMarketAnalysisEvidenceV5 | AgentMarketAnalysisEvidenceV6;
    analysis?: AgentMarketAnalysisOutputV4;
    fearGreedRegime?: AgentMarketFearGreedRegimeV1;
  };

export interface AgentMarketFearGreedRegimeV1 {
  schemaVersion: 1;
  policyVersion: 'fear-greed-sma-regime-v1';
  basis: 'closed_utc_daily';
  asOfDate: string;
  latestValue: number;
  sma30: string;
  sma365: string;
  regime: 'risk_on' | 'risk_off' | 'neutral';
  seriesDigest: string;
  source: Extract<AgentMarketSourceRefV2, { provider: 'alternative_me' }>;
}

export type AgentMarketLimitationCodeV1 =
  | 'asset_ambiguous'
  | 'asset_unresolved'
  | 'asset_metadata_rejected'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_schema_mismatch'
  | 'upstream_contract_mismatch'
  | 'insufficient_ohlcv'
  | 'insufficient_signal_coverage'
  | 'synthetic_series_forbidden'
  | 'stale_data'
  | 'future_timestamp'
  | 'provider_conflict'
  | 'unsupported_range'
  | 'unsupported_base_currency'
  | 'market_request_too_large'
  | 'provider_disabled'
  | 'attribution_capability_missing';

export type AgentMarketProviderNameV1 = 'main_backend' | 'binance' | 'alternative_me' | 'coingecko';

export type AgentMarketPublicSignalKindV1 =
  | 'fear_greed'
  | 'btc_dominance'
  | 'total_market_cap'
  | 'stablecoin_dominance'
  | 'market_volatility'
  | 'technical_overextension'
  | 'market_coverage_gap'
  | 'quote_stale';

export type AgentSemanticContentV1 =
  | AgentNoticeContentV1
  | AgentWalletQueryContentV1
  | AgentPortfolioContentV1
  | AgentMarketContentV1
  | AgentAssetSearchContentV1
  | AgentWebDigestContentV1
  | AgentClientUnsupportedContentV1;

export type AgentNoticeCodeV1 =
  | 'agent_unavailable'
  | 'analysis_unavailable'
  | 'asset_not_found'
  | 'clarification_required'
  | 'consent_required'
  | 'content_over_budget'
  | 'empty_result'
  | 'market_analysis_asset_unsupported'
  | 'market_analysis_timeframe_unsupported'
  | 'market_analysis_unavailable'
  | 'market_data_unavailable'
  | 'market_quote'
  | 'portfolio_unavailable'
  | 'receive_details_required'
  | 'receive_ready'
  | 'receive_unavailable'
  | 'retry_required'
  | 'send_details_required'
  | 'send_form_amount_required'
  | 'send_ready'
  | 'send_unavailable'
  | 'staking_ready'
  | 'staking_unavailable'
  | 'swap_details_required'
  | 'swap_ready'
  | 'swap_unavailable'
  | 'tool_unavailable'
  | 'wallet_data_unavailable'
  | 'wallet_filter_ambiguous'
  | 'web_search_unavailable';

export type AgentPortfolioContentV1 =
  | {
    kind: 'portfolio';
    schemaVersion: 1;
    view: 'analysis';
    outcome: 'complete' | 'partial' | 'insufficient_data';
    payload: AgentPortfolioAnalysisContentPayloadV1;
    narrativeStatus: 'provider_accepted' | 'provider_rejected';
    narrativeMarkdown?: string;
  }
  | {
    kind: 'portfolio';
    schemaVersion: 1;
    view: 'positions';
    outcome: 'complete' | 'partial';
    payload: AgentPortfolioPositionsContentPayloadV1;
  }
  | {
    kind: 'portfolio';
    schemaVersion: 1;
    view: 'networkActivity';
    outcome: 'complete' | 'partial';
    payload: AgentNetworkActivityContentPayloadV1;
  };

export type AgentPortfolioAnalysisContentPayloadV1 = Record<string, unknown> & {
  id: AgentPublicFollowUpOpaqueIdV2;
  status: 'complete' | 'partial' | 'insufficient_data';
  accountScope: 'current';
  baseCurrency: string;
  entryPoint?: EntryPoint;
  range: '1d' | '7d' | '1m' | '3m' | '1y' | 'all';
  generatedAt: UtcTimestampMs;
  snapshotId?: string;
  totalValue: TotalValue;
  rangeChange?: RangeChange;
  performance?: PortfolioPerformanceProjectionV1;
  /**
   * @minItems 1
   * @maxItems 3
   */
  topPositions?: PortfolioAnalysisTopPosition[];
  /**
   * @minItems 1
   * @maxItems 5
   */
  signals: PortfolioAnalysisSemanticSignalV1[];
  dataQuality: PortfolioAnalysisDataQuality;
};

export type PortfolioPerformanceProjectionV1 = Record<string, unknown> & {
  calculationVersion: 'portfolio-performance-v1';
  sourceDensity: '5m' | '1h' | '4h' | '1d';
  sourceDensityMs: 300000 | 3600000 | 14400000 | 86400000;
  chart: PortfolioPerformanceChartV1;
  comparison: Record<string, unknown>;
  topContributor?: {
    asset: AgentAssetIdentityV2;
    semantics: 'net_worth_change';
    amount: string;
    currency: string;
    direction: 'up' | 'down' | 'flat';
  };
};

export type PortfolioAnalysisDataLimitationCodeV1 =
  | 'stale_wallet_snapshot'
  | 'partial_wallet_coverage'
  | 'partial_market_coverage'
  | 'market_data_unavailable'
  | 'activity_unavailable'
  | 'performance_unavailable'
  | 'market_assets_omitted'
  | 'material_market_asset_missing';

export interface AgentMarketAnalysisEvidenceCatalogEntryV5 {
  id: string;
  family: 'indicator' | 'structure' | 'period' | 'level' | 'scenario' | 'coverage';
  available: boolean;
  claimable: boolean;
}

export interface AgentMarketAnalysisEvidenceCatalogEntryV6 {
  id: string;
  family: AgentMarketAnalysisEvidenceCatalogEntryV5['family'] | 'profile';
  available: boolean;
  claimable: boolean;
}

export interface Quote {
  price: string;
  quoteCurrency: 'USDT';
  asOf: UtcTimestampMs;
}

export interface AgentMarketAnalysisEvidenceV4 {
  schemaVersion: 4;
  asset: AgentAssetIdentityV2;
  primaryTimeframe: AgentMarketAnalysisTimeframeV2;
  quote: Quote;
  quoteSource: AgentMarketSourceRefV2;
  asOf: UtcTimestampMs;
  /**
   * @minItems 3
   * @maxItems 3
   */
  timeframes: [
    AgentMarketAnalysisEvidenceSlotV4,
    AgentMarketAnalysisEvidenceSlotV4,
    AgentMarketAnalysisEvidenceSlotV4,
  ];
  coverage: {
    requestedTimeframeCount: 3;
    availableTimeframeCount: number;
    requestedIndicatorCount: 39;
    availableIndicatorCount: number;
    complete: boolean;
  };
}

export type AgentMarketAnalysisEvidenceSlotV4 = {
  status: 'available';
  timeframe: AgentMarketAnalysisTimeframeV2;
  evidence: {
    change: {
      timeframe: AgentMarketAnalysisTimeframeV2;
      fromAt: UtcTimestampMs;
      toAt: UtcTimestampMs;
      absolute: string;
      percent: string;
      quoteCurrency: 'USDT';
    };
    freshness: Freshness;
    [key: string]: unknown;
  };
} | {
  status: 'unavailable';
  timeframe: AgentMarketAnalysisTimeframeV2;
  reason: 'context_unavailable' | 'evidence_invalid';
};

export interface AgentMarketAnalysisEvidenceV5 {
  schemaVersion: 5;
  technicalEvidence: AgentMarketAnalysisEvidenceV4;
  /**
   * @minItems 3
   * @maxItems 3
   */
  structures: never[];
  periodLevels?: Record<string, never>;
  levelMaps: {
    '3d': Record<string, never>;
    '7d': Record<string, never>;
    '30d': Record<string, never>;
  };
  expectedMoves: {
    '3d': Record<string, never>;
    '7d': Record<string, never>;
    '30d': Record<string, never>;
  };
  scenarioTrees: {
    '3d': Record<string, never>;
    '7d': Record<string, never>;
    '30d': Record<string, never>;
  };
  /**
   * @minItems 48
   * @maxItems 128
   */
  evidenceCatalog: AgentMarketAnalysisEvidenceCatalogEntryV5[];
  coverage: {
    structureTimeframeCount: number;
    availableLevelMapCount: number;
    eligibleScenarioCount: number;
    complete: boolean;
  };
}

export type AgentMarketForecastHorizonV1 = '3d' | '7d' | '30d';

export interface AgentMarketStructureSnapshotV1 {
  timeframe: AgentMarketAnalysisTimeframeV2;
  direction:
    | 'higher_highs_higher_lows'
    | 'lower_highs_lower_lows'
    | 'range'
    | 'transition'
    | 'insufficient_data';
  event: 'none' | 'break_up' | 'break_down' | 'retest_up' | 'retest_down';
  liveState: 'inside_structure' | 'approaching_upper' | 'approaching_lower';
  freshness: Freshness;
  [key: string]: unknown;
}

export interface AgentMarketStructureEvidenceSlotV6 {
  timeframe: AgentMarketAnalysisTimeframeV2;
  snapshot?: AgentMarketStructureSnapshotV1;
}

export type AgentMarketLevelKindV1 =
  | 'swing_high'
  | 'swing_low'
  | 'previous_period_high'
  | 'previous_period_low'
  | 'anchored_vwap'
  | 'moving_average'
  | 'channel_boundary'
  | 'round_number'
  | 'volume_profile_poc'
  | 'volume_profile_val'
  | 'volume_profile_vah'
  | 'volume_profile_hvn'
  | 'volume_profile_lvn'
  | 'expected_move_boundary'
  | 'range_midpoint';

export interface AgentMarketLevelSourceV1 {
  kind: AgentMarketLevelKindV1;
  timeframe: AgentMarketAnalysisTimeframeV2 | 'period' | 'profile';
  evidenceRef: string;
}

export interface AgentMarketPriceZoneV1 {
  id: string;
  lower: string;
  upper: string;
  role: 'support' | 'resistance' | 'transition';
  strength: 'primary' | 'secondary' | 'context';
  sources: AgentMarketLevelSourceV1[];
  touchCount: number;
  rejectionCount: number;
  lastInteractionAt?: UtcTimestampMs;
  state: 'untested' | 'holding' | 'broken' | 'retested';
}

export type AgentMarketLevelMapV1 = {
  status: 'available';
  horizon: AgentMarketForecastHorizonV1;
  tolerance: string;
  supports: AgentMarketPriceZoneV1[];
  resistances: AgentMarketPriceZoneV1[];
  equilibrium?: AgentMarketPriceZoneV1;
  coverage: {
    candidateCount: number;
    zoneCount: number;
    actionableZoneCount: number;
    complete: boolean;
  };
  policyVersion: 'market-level-map-v1' | 'market-level-map-v2';
} | {
  status: 'insufficient_data';
  horizon: AgentMarketForecastHorizonV1;
  reason: 'required_timeframe_unavailable' | 'atr_unavailable' | 'invalid_levels';
  policyVersion: 'market-level-map-v1' | 'market-level-map-v2';
};

export type AgentMarketExpectedMoveV1 = {
  status: 'available';
  horizon: AgentMarketForecastHorizonV1;
  durationDays: 3 | 7 | 30;
  targetAt: UtcTimestampMs;
  movePct: string;
  ranges: {
    bearish: AgentMarketPriceRangeV1;
    base: AgentMarketPriceRangeV1;
    bullish: AgentMarketPriceRangeV1;
  };
  [key: string]: unknown;
} | {
  status: 'insufficient_data';
  horizon: AgentMarketForecastHorizonV1;
  durationDays: 3 | 7 | 30;
  targetAt: UtcTimestampMs;
  reason: string;
};

export interface AgentMarketPriceRangeV1 {
  lower: string;
  upper: string;
}

export interface AgentMarketScenarioConditionV1 {
  zoneIds: string[];
  direction: 'above' | 'below' | 'inside' | 'outside';
  confirmationBasis: '4h_close' | '1d_close';
  state: 'not_triggered' | 'approaching' | 'triggered';
}

export interface AgentMarketScenarioStepV1 {
  zone: AgentMarketPriceZoneV1;
  role: 'test' | 'acceptance' | 'rejection' | 'transit' | 'target';
  expectedConfirmation: '4h_close' | '1d_close';
  insideExpectedMove: boolean;
}

export type AgentMarketScenarioPathV1 = {
  status: 'eligible';
  kind: AgentMarketStructuralScenarioKindV1;
  priority: 'primary' | 'alternative' | 'tail';
  horizon: AgentMarketForecastHorizonV1;
  targetAt: UtcTimestampMs;
  activation: AgentMarketScenarioConditionV1;
  path: AgentMarketScenarioStepV1[];
  terminalZone: AgentMarketPriceZoneV1;
  invalidation: AgentMarketScenarioConditionV1;
  expectedMove: {
    movePct: string;
    lower: string;
    upper: string;
  };
  evidenceRefs: string[];
  confidence: 'low' | 'medium';
} | {
  status: 'insufficient_data';
  kind: AgentMarketStructuralScenarioKindV1;
  priority: 'primary' | 'alternative' | 'tail';
  horizon: AgentMarketForecastHorizonV1;
  reason: 'forecast_unavailable' | 'level_map_unavailable' | 'activation_level_unavailable';
};

export type AgentMarketStructuralScenarioKindV1
  = 'bullish_breakout' | 'range_balance' | 'bearish_breakdown';

export interface AgentMarketHorizonScenarioTreeV1 {
  horizon: AgentMarketForecastHorizonV1;
  targetAt: UtcTimestampMs;
  directionalState: 'bullish' | 'bearish' | 'range' | 'mixed' | 'insufficient_data';
  activeScenario?: AgentMarketStructuralScenarioKindV1;
  primaryScenario?: AgentMarketStructuralScenarioKindV1;
  paths: [AgentMarketScenarioPathV1, AgentMarketScenarioPathV1, AgentMarketScenarioPathV1];
  policyVersion: 'market-structural-scenarios-v1' | 'market-structural-scenarios-v2';
}

export type AgentMarketVolumeProfileKindV6
  = 'current_day' | 'previous_day' | 'previous_week' | 'rolling_30d';

export type AgentMarketVolumeProfileSlotV6 = {
  kind: AgentMarketVolumeProfileKindV6;
  status: 'available';
  position: 'above_value_area' | 'inside_value_area' | 'below_value_area';
  pointOfControl: string;
  valueAreaLow: string;
  valueAreaHigh: string;
  valueAreaCoveragePct: string;
  periodStartAt: UtcTimestampMs;
  periodEndAt: UtcTimestampMs;
  asOf: UtcTimestampMs;
  state: 'developing' | 'closed';
  freshness: Freshness;
  evidenceRefs: {
    pointOfControl: string;
    valueAreaLow: string;
    valueAreaHigh: string;
  };
  [key: string]: unknown;
} | {
  kind: AgentMarketVolumeProfileKindV6;
  status: 'unavailable';
  reason: 'missing_data' | 'stale' | 'gap_detected' | 'oversized' | 'invalid';
};

export interface AgentMarketVolumeProfileCoverageV6 {
  requestedProfileCount: number;
  availableProfileCount: number;
  complete: boolean;
  profiles: AgentMarketVolumeProfileSlotV6[];
}

export interface AgentMarketAnalysisEvidenceV6 {
  schemaVersion: 6;
  requestedHorizons: AgentMarketForecastHorizonV1[];
  primaryDisplayHorizon: AgentMarketForecastHorizonV1;
  technicalEvidence: AgentMarketAnalysisEvidenceV4;
  structures: [
    AgentMarketStructureEvidenceSlotV6,
    AgentMarketStructureEvidenceSlotV6,
    AgentMarketStructureEvidenceSlotV6,
  ];
  periodLevels?: Record<string, unknown>;
  levelMaps: Record<AgentMarketForecastHorizonV1, AgentMarketLevelMapV1>;
  expectedMoves: Record<AgentMarketForecastHorizonV1, AgentMarketExpectedMoveV1>;
  scenarioTrees: Record<AgentMarketForecastHorizonV1, AgentMarketHorizonScenarioTreeV1>;
  volumeProfileCoverage: AgentMarketVolumeProfileCoverageV6;
  evidenceCatalog: AgentMarketAnalysisEvidenceCatalogEntryV6[];
  coverage: AgentMarketAnalysisEvidenceV5['coverage'];
}

export interface AgentMarketAnalysisFactorV4 {
  category: 'trend' | 'momentum' | 'range' | 'volatility' | 'volume' | 'risk' | 'structure' | 'levels';
  role: 'supporting' | 'opposing' | 'risk';
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  text: string;
  evidence: AgentMarketAnalysisEvidenceRefsV4;
}

export interface AgentMarketAnalysisHorizonRationaleV4 {
  rationale: string;
  evidence: AgentMarketAnalysisEvidenceRefsV4;
}

export interface AgentMarketAnalysisOutputV4 {
  schemaVersion: 4;
  /**
   * @minItems 48
   * @maxItems 128
   */
  consideredEvidence: string[];
  summary: string;
  summaryEvidence: AgentMarketAnalysisEvidenceRefsV4;
  /**
   * @minItems 1
   * @maxItems 3
   */
  timeframeViews: AgentMarketAnalysisTimeframeViewV4[];
  /**
   * @minItems 3
   * @maxItems 3
   */
  factors: AgentMarketAnalysisFactorV4[];
  materialRisk: {
    text: string;
    evidence: AgentMarketAnalysisEvidenceRefsV4;
  };
  horizons: {
    '3d': AgentMarketAnalysisHorizonRationaleV4 | null;
    '7d': AgentMarketAnalysisHorizonRationaleV4 | null;
    '30d': AgentMarketAnalysisHorizonRationaleV4 | null;
  };
}

export interface AgentMarketAnalysisTimeframeViewV4 {
  timeframe: AgentMarketAnalysisTimeframeV2;
  text: string;
  evidence: AgentMarketAnalysisEvidenceRefsV4;
}

export interface AgentMarketOverviewEvidenceV2 {
  schemaVersion: 2;
  basketVersion: 'market-overview-v2';
  timeframe: '1d';
  quoteCurrency: 'USDT';
  generatedAt: UtcTimestampMs;
  scope: 'selected_assets';
  direction: 'up' | 'down' | 'flat' | 'mixed';
  directionBasis: 'latest_closed_candle';
  /**
   * @minItems 2
   * @maxItems 3
   */
  assets: AgentMarketOverviewAssetChangeV2[];
  fearGreed?: AgentMarketOverviewFearGreedV2;
  coverage: {
    requestedAssetCount: 3;
    usableAssetCount: number;
    isComplete: boolean;
    /**
     * @maxItems 1
     */
    missingAssets?: AgentAssetIdentityV2[];
  };
  /**
   * @maxItems 3
   */
  limitations: ('partial_asset_coverage' | 'stale_within_maximum' | 'fear_greed_unavailable')[];
}

export interface AgentMarketOverviewAssetChangeV2 {
  asset: AgentAssetIdentityV2;
  quote: {
    price: string;
    quoteCurrency: 'USDT';
    asOf: UtcTimestampMs;
  };
  change: {
    timeframe: '1d';
    fromAt: UtcTimestampMs;
    toAt: UtcTimestampMs;
    percent: string;
  };
  freshness: Freshness;
  quoteSource: AgentMarketSourceRefV2;
  changeSource: AgentMarketSourceRefV2;
}

export interface AgentMarketOverviewFearGreedV2 {
  value: number;
  zone: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  zoneVersion: 'fear-greed-zones-v1';
  asOf: UtcTimestampMs;
  freshness: Freshness;
  source: AgentMarketSourceRefV2 & {
    provider?: 'alternative_me';
    endpoint?: 'alternative.fng';
  };
}

export interface AgentMarketLimitationV1 {
  code: AgentMarketLimitationCodeV1;
  provider?: AgentMarketProviderNameV1;
  asset?: AgentMarketAssetIdentityV1;
}

export interface AgentSemanticMessageContentV1 {
  kind: 'semantic';
  content: AgentSemanticContentV1;
}

export interface AgentNoticeContentV1 {
  kind: 'notice';
  schemaVersion: 1;
  code: AgentNoticeCodeV1;
  arguments?: AgentNoticeArgumentsV1;
}

export type AgentMarketQuoteNoticeV1 =
  | {
    status: 'resolved';
    asset: AgentSemanticAssetV1;
    price: string;
    quoteCurrency: string;
    percentChange24h: string;
    asOf: UtcTimestampMs;
  }
  | {
    status: 'price_unavailable';
    asset: AgentSemanticAssetV1;
    asOf: UtcTimestampMs;
  }
  | {
    status: 'ambiguous';
    /** @minItems 2 @maxItems 3 */
    candidates: AgentSemanticAssetV1[];
    hasMore: boolean;
    asOf: UtcTimestampMs;
  }
  | {
    status: 'not_found';
    asOf: UtcTimestampMs;
  }
  | {
    status: 'unavailable';
    reason: AgentMarketQuoteUnavailableReasonV1;
  };

export type AgentMarketQuoteUnavailableReasonV1 =
  | 'planning_unavailable'
  | 'capability_unavailable'
  | 'wallet_context_unavailable'
  | 'quote_currency_unsupported'
  | 'quote_unavailable'
  | 'wallet_context_changed'
  | 'tool_timeout'
  | 'tool_failed'
  | 'invalid_result'
  | 'cancelled';

export interface AgentNoticeArgumentsV1 {
  asset?: AgentSemanticAssetV1;
  chain?: AgentApiChain;
  field?:
    | 'account'
    | 'address'
    | 'amount'
    | 'asset'
    | 'network'
    | 'price_assumption'
    | 'query'
    | 'quote_currency'
    | 'recipient'
    | 'scope'
    | 'staking_product'
    | 'time_horizon';
  repairReason?: 'unrecognized_input' | 'ambiguous_request' | 'multiple_requests';
  /**
   * @minItems 1
   * @maxItems 3
   */
  fields?: ('amount' | 'asset' | 'recipient')[];
  retryAfterMs?: number;
  scope?: 'current' | 'explicitAll';
  receiveFailure?: AgentReceiveFailureV1;
  /**
   * @minItems 1
   * @maxItems 2
   */
  receiveFields?: ('asset' | 'network')[];
  receiveMemoRequirement?: 'not_required';
  requestedChain?: AgentApiChain;
  activeChain?: AgentApiChain;
  marketQuote?: AgentMarketQuoteNoticeV1;
  recipientLabel?: string;
  sendFailure?:
    | 'no_sendable_balance'
    | 'asset_not_held'
    | 'insufficient_balance'
    | 'recipient_not_found'
    | 'recipient_ambiguous'
    | 'address_book_unavailable'
    | 'recipient_matching_unavailable'
    | 'intent_extraction_unavailable'
    | 'intent_provider_unavailable'
    | 'invalid_recipient'
    | 'recipient_unresolved'
    | 'recipient_inactive'
    | 'memo_required'
    | 'wallet_not_initialized'
    | 'active_account_unavailable'
    | 'chain_unsupported'
    | 'client_send_unavailable'
    | 'view_only_prepare_forbidden'
    | 'offline_prepare_unavailable'
    | 'wallet_context_changed'
    | 'source_wallet_selection_required'
    | 'validation_failed'
    | 'prepare_unavailable';
  /**
   * @minItems 2
   * @maxItems 2
   */
  sendFailures?: [
    'recipient_not_found' | 'recipient_ambiguous',
    'asset_not_held' | 'insufficient_balance',
  ];
  stakeFailure?: AgentStakeFailureV1;
  swapReady?: AgentSwapReadyV1;
  swapDetails?: AgentSwapDetailsRequiredV1;
  swapFailure?: AgentSwapFailureV1;
  webSearchFailure?:
    | 'capability_unavailable'
    | 'planning_failed'
    | 'budget_denied'
    | 'provider_rate_limited'
    | 'provider_unavailable'
    | 'no_results'
    | 'invalid_sources'
    | 'synthesis_timeout'
    | 'synthesis_invalid'
    | 'synthesis_unavailable'
    | 'policy_rejected';
  walletQueryFailure?: 'result_not_presentable';
  analysisFailure?:
    | 'planning_unavailable'
    | 'source_unavailable'
    | 'stale_evidence'
    | 'inconsistent_snapshot'
    | 'compute_failed'
    | 'deadline_exceeded'
    | 'result_too_large'
    | 'answer_generation_failed';
}

export type AgentReceiveFailureV1 =
  | 'planning_unavailable'
  | 'active_account_unavailable'
  | 'client_receive_unavailable'
  | 'chain_unsupported'
  | 'active_network_mismatch';

export type AgentStakeFailureV1 =
  | 'planning_unavailable'
  | 'active_account_unavailable'
  | 'view_only_staking_forbidden'
  | 'client_staking_unavailable'
  | 'asset_unavailable'
  | 'amount_invalid'
  | 'wallet_context_changed';

export interface AgentSwapReadyV1 {
  sourceAsset: AgentSemanticAssetV1;
  destinationAsset: AgentSemanticAssetV1;
  amount: AgentSwapAmountV1;
  quote: AgentSwapIndicativeQuoteV1;
}

export interface AgentSwapDetailsRequiredV1 {
  field: 'source_asset' | 'destination_asset' | 'amount' | 'direction';
  candidates?: AgentSemanticAssetV1[];
  hasMore?: boolean;
}

export type AgentSwapFailureV1 =
  | 'planning_unavailable'
  | 'active_account_unavailable'
  | 'view_only_swap_forbidden'
  | 'client_swap_unavailable'
  | 'wallet_context_changed'
  | 'tool_timeout'
  | 'tool_failed'
  | 'invalid_tool_result';

export interface TotalValue {
  value: string;
  currency: string;
  asOf: UtcTimestampMs;
}

export interface RangeChange {
  range: '1d';
  semantics: 'net_worth_change';
  amount?: string;
  percent?: string;
  direction: 'up' | 'down' | 'flat' | 'unknown';
}

export interface PortfolioPerformanceChartV1 {
  kind: 'stacked_net_worth';
  range: '1d' | '7d' | '1m' | '3m' | '1y' | 'all';
  baseCurrency: string;
  /**
   * @minItems 2
   * @maxItems 32
   */
  timestamps: number[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  series: {
    asset: AgentAssetIdentityV2;
    /**
     * @minItems 2
     * @maxItems 32
     */
    values: string[];
  }[];
  coverage: Record<string, unknown>;
}

export interface PortfolioAnalysisTopPosition {
  asset: PortfolioAnalysisSafeAssetIdentity;
  value: string;
  currency: string;
  percent: string;
}

export interface PortfolioAnalysisSafeAssetIdentity {
  slug: string;
  chain: AgentApiChain;
  symbol: string;
  name?: string;
}

export interface PortfolioAnalysisSemanticSignalV1 {
  id: AgentPublicFollowUpOpaqueIdV2;
  category: 'performance' | 'concentration' | 'chain_split' | 'data_quality';
  severity: 'info' | 'watch' | 'important';
  confidence: 'low' | 'medium' | 'high';
  relevance: 'focused' | 'general';
  code: string;
  asset?: PortfolioAnalysisSafeAssetIdentity;
  value?: string;
  asOf?: UtcTimestampMs;
}

export interface PortfolioAnalysisDataQuality {
  freshness: {
    asOf: UtcTimestampMs;
    isStale: boolean;
    /**
     * @maxItems 6
     */
    staleInputs?: (
      'wallet_snapshot' | 'portfolio_history' | 'market_quotes' | 'market_ohlcv' | 'public_signals' | 'activity'
    )[];
  };
  marketCoverage?: {
    /**
     * @maxItems 10
     */
    missingMaterialAssets?: AgentMarketAssetIdentityV1[];
    /**
     * @maxItems 9
     */
    staleSignals?: AgentMarketPublicSignalKindV1[];
    /**
     * @maxItems 10
     */
    providerLimitations?: AgentMarketLimitationV1[];
  };
  /**
   * @maxItems 6
   */
  omittedData?: (
    | 'holdings_over_limit'
    | 'activity_not_requested'
    | 'activity_unavailable'
    | 'performance_unavailable'
    | 'market_assets_over_limit'
    | 'market_indicators_unavailable'
  )[];
  /**
   * @maxItems 8
   */
  limitations?: PortfolioAnalysisDataLimitationCodeV1[];
}

export interface AgentPortfolioPositionsContentPayloadV1 {
  id: Uuid;
  status: 'complete' | 'partial';
  accountScope: 'current';
  baseCurrency: string;
  generatedAt: UtcTimestampMs;
  /**
   * @maxItems 5
   */
  positions: PortfolioTopPositionRowV1[];
  /**
   * @maxItems 3
   */
  unpriced: PortfolioUnpricedPositionRowV1[];
  omittedUnpricedAssetCount: number;
  dataQuality: AgentPortfolioPositionsDataQualityV1;
}

export interface PortfolioTopPositionRowV1 {
  assetRef: string;
  asset: AgentAssetIdentityV2;
  amount: PortfolioTopPositionValueV1;
}

export interface PortfolioTopPositionValueV1 {
  value: string;
  currency: string;
}

export interface PortfolioUnpricedPositionRowV1 {
  assetRef: string;
  asset: AgentAssetIdentityV2;
}

export interface AgentPortfolioPositionsDataQualityV1 {
  coverage: 'complete' | 'partial';
  /**
   * @maxItems 3
   */
  limitations: ('unpriced_assets' | 'valued_rows_omitted' | 'unpriced_rows_omitted')[];
}

export interface AgentNetworkActivityContentPayloadV1 {
  id: Uuid;
  status: 'complete' | 'partial';
  accountScope: 'current';
  chain: AgentApiChain;
  generatedAt: UtcTimestampMs;
  hasMore: boolean;
  /**
   * @maxItems 10
   */
  rows: AgentNetworkActivityRowV1[];
}

export interface AgentNetworkActivityRowV1 {
  kind: 'transfer' | 'swap' | 'stake' | 'unstake' | 'nft' | 'contract' | 'unknown';
  timestamp: UtcTimestampMs;
  status: 'pending' | 'completed' | 'failed';
  direction?: 'incoming' | 'outgoing';
  asset?: AgentAssetIdentityV2;
  amount?: AgentMoneyAmount;
  safeDescription?: string;
}

export interface AgentWebDigestContentV1 {
  kind: 'webDigest';
  schemaVersion: 1;
  outcome: 'complete' | 'partial' | 'empty';
  summary?: string;
  /**
   * @maxItems 20
   */
  items: AgentWebDigestItemV1[];
}

export interface AgentWebDigestItemV1 {
  headline: string;
  summary?: string;
  url: string;
  publishedAt?: UtcTimestampMs;
}

export interface AgentSemanticContentEvent {
  type: 'semantic_content';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  content: AgentSemanticContentV1;
  createdAt?: UtcTimestampMs;
}
