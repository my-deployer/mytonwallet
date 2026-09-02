import React, { memo } from '../../lib/teact/teact';

import type {
  AgentMarketAnalysisEvidenceV6,
  AgentMarketAnalysisOutputV4,
  AgentMarketFearGreedRegimeV1,
  AgentMarketForecastHorizonV1,
  AgentMarketHorizonScenarioTreeV1,
  AgentMarketLevelMapV1,
  AgentMarketPriceZoneV1,
  AgentMarketScenarioConditionV1,
  AgentMarketScenarioPathV1,
  AgentMarketScenarioStepV1,
  AgentMarketStructureSnapshotV1,
  AgentMarketVolumeProfileKindV6,
  AgentMarketVolumeProfileSlotV6,
} from '../../api/agentV2/protocol/types';
import type { LangFn } from '../../util/langProvider';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import styles from './AgentV2MarketAnalysisCard.module.scss';

const MARKET_TIMEFRAMES = ['1d', '4h', '1h'] as const;
const PROFILE_KINDS_BY_HORIZON = {
  '3d': ['current_day', 'previous_day'],
  '7d': ['previous_week'],
  '30d': ['rolling_30d'],
} as const satisfies Record<AgentMarketForecastHorizonV1, readonly AgentMarketVolumeProfileKindV6[]>;

interface OwnProps {
  evidence: AgentMarketAnalysisEvidenceV6;
  analysis?: AgentMarketAnalysisOutputV4;
  fearGreedRegime?: AgentMarketFearGreedRegimeV1;
  className: string;
}

interface ZonePresentation {
  labels: Map<string, string>;
  rows: Array<{ label: string; metadata: string; zone: AgentMarketPriceZoneV1 }>;
}

interface MarketFactorPresentation {
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  text: string;
}

function AgentV2MarketAnalysisCard({
  evidence,
  analysis,
  fearGreedRegime,
  className,
}: OwnProps) {
  const lang = useLang();
  const locale = normalizeLocale(lang.code);
  const primaryHorizon = evidence.primaryDisplayHorizon;
  const primaryMap = evidence.levelMaps[primaryHorizon];
  const primaryTree = evidence.scenarioTrees[primaryHorizon];
  const activePath = findActivePath(primaryTree);
  const primaryPath = findPrimaryPath(primaryTree);
  const zonePresentation = buildZonePresentation(primaryMap, [activePath, primaryPath], lang);
  const dailyChange = getDailyChange(evidence);
  const factors: MarketFactorPresentation[] = analysis?.factors
    ?? buildFallbackFactors(evidence, primaryTree, zonePresentation.labels, lang);
  const areProfilesPartial = evidence.volumeProfileCoverage.availableProfileCount
    < evidence.volumeProfileCoverage.requestedProfileCount;

  return (
    <section className={`${className} ${styles.analysisCard}`} aria-label={lang('$agent_market_analysis_title')}>
      <header className={styles.header}>
        <div className={styles.assetLine}>
          <strong className={styles.assetName}>{formatAssetName(evidence)}</strong>
          <b className={styles.price}>
            {formatMarketNumber(evidence.technicalEvidence.quote.price, locale)} USDT
          </b>
        </div>
        <div className={styles.asOf}>
          {lang('$agent_market_as_of')}: {formatMarketDate(evidence.technicalEvidence.asOf, locale)}
          {dailyChange && (
            <span className={styles.dailyChange}>
              {' · '}{lang('$agent_market_closed_1d')}: {formatMarketPercent(dailyChange, locale)}
            </span>
          )}
        </div>
      </header>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{lang('$agent_market_thesis')}</h3>
        <p className={buildClassName(styles.paragraph, styles.thesis)}>
          {analysis?.summary ?? getFallbackThesis(primaryTree, lang)}
        </p>
        {!analysis && (
          <p className={buildClassName(styles.paragraph, styles.partial)}>
            {lang('$agent_market_calculated_fallback')}
          </p>
        )}
      </section>

      {fearGreedRegime && (
        <FearGreedRegime
          evidence={fearGreedRegime}
          locale={locale}
        />
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{lang('$agent_market_timeframes')}</h3>
        <div className={styles.timeframes}>
          {MARKET_TIMEFRAMES.map((timeframe) => {
            const slot = evidence.structures.find((candidate) => candidate.timeframe === timeframe);
            const modelView = analysis?.timeframeViews.find((view) => view.timeframe === timeframe);
            return (
              <div className={styles.timeframe} key={timeframe}>
                <b className={styles.timeframeLabel}>{timeframe.toUpperCase()}</b>
                <span className={styles.timeframeValue}>
                  {formatStructure(slot?.snapshot, lang)}
                  {modelView ? ` · ${modelView.text}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {lang('$agent_market_level_map')} · {formatHorizon(primaryHorizon, lang)}
        </h3>
        {zonePresentation.rows.length ? (
          <div className={styles.levelGrid}>
            {zonePresentation.rows.map(({ label, metadata, zone }) => (
              <div className={styles.level} key={zone.id}>
                <span className={styles.levelLabel}>{label}</span>
                <b className={styles.levelPrice}>{formatMarketZone(zone, locale)}</b>
                <small className={styles.levelMeta}>{metadata}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={buildClassName(styles.paragraph, styles.muted)}>
            {lang('$agent_market_levels_unavailable')}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{lang('$agent_market_factors')}</h3>
        <ol className={styles.factors}>
          {factors.slice(0, 3).map((factor, index) => (
            <li className={styles.factor} key={`${factor.stance}:${index}`}>
              <span className={`${styles.factorMarker} ${getStanceClass(factor.stance)}`} />
              <span>{factor.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${styles.section} ${styles.scenarioSection}`}>
        <h3 className={styles.sectionTitle}>
          {lang('$agent_market_current_regime')} · {formatHorizon(primaryHorizon, lang)}
          {' · '}{formatMarketDate(primaryTree.targetAt, locale, true)}
        </h3>
        {activePath ? (
          <PrimaryScenario
            path={activePath}
            labels={zonePresentation.labels}
            locale={locale}
            rationale={activePath.kind === primaryPath?.kind
              ? analysis?.horizons[primaryHorizon]?.rationale : undefined}
          />
        ) : (
          <p className={buildClassName(styles.paragraph, styles.muted)}>
            {lang('$agent_market_no_active_scenario')}
          </p>
        )}
        {primaryPath && primaryPath.kind !== activePath?.kind && (
          <>
            <div className={styles.scenarioHeadline}>
              <b>{lang('$agent_market_conditional_scenario')}</b>
            </div>
            <PrimaryScenario
              path={primaryPath}
              labels={zonePresentation.labels}
              locale={locale}
              rationale={analysis?.horizons[primaryHorizon]?.rationale}
            />
          </>
        )}
        <ExpectedMove evidence={evidence} horizon={primaryHorizon} locale={locale} />
      </section>

      {evidence.requestedHorizons.filter((horizon) => horizon !== primaryHorizon).length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{lang('$agent_market_other_horizons')}</h3>
          <div className={styles.secondaryHorizons}>
            {evidence.requestedHorizons.filter((horizon) => horizon !== primaryHorizon).map((horizon) => (
              <SecondaryHorizon
                analysis={analysis}
                evidence={evidence}
                horizon={horizon}
                locale={locale}
                key={horizon}
              />
            ))}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <p className={buildClassName(styles.paragraph, styles.risk)}>
          {analysis?.materialRisk.text ?? lang('$agent_market_risk_caveat')}
        </p>
        {(!evidence.coverage.complete || areProfilesPartial) && (
          <p className={buildClassName(styles.paragraph, styles.partial)}>
            {lang('$agent_market_partial_coverage')}
          </p>
        )}
      </footer>
    </section>
  );
}

function FearGreedRegime({
  evidence,
  locale,
}: {
  evidence: AgentMarketFearGreedRegimeV1;
  locale: string;
}) {
  const lang = useLang();
  return (
    <section className={`${styles.section} ${styles.sentimentSection}`}>
      <div className={styles.sentimentHeading}>
        <h3 className={styles.sectionTitle}>{lang('$agent_market_fear_greed_sentiment')}</h3>
        <span className={`${styles.sentimentRegime} ${getFearGreedRegimeClass(evidence.regime)}`}>
          {formatFearGreedRegime(evidence.regime, lang)}
        </span>
      </div>
      <div className={styles.sentimentMetrics}>
        <div className={styles.sentimentMetric}>
          <span className={styles.sentimentLabel}>{lang('$agent_market_fear_greed_index')}</span>
          <b className={styles.sentimentValue}>
            {formatMarketNumber(String(evidence.latestValue), locale, 0)} / 100
          </b>
        </div>
        <div className={styles.sentimentMetric}>
          <span className={styles.sentimentLabel}>{lang('$agent_market_fear_greed_sma_30')}</span>
          <b className={styles.sentimentValue}>
            {formatMarketNumber(evidence.sma30, locale, 2)}
          </b>
        </div>
        <div className={styles.sentimentMetric}>
          <span className={styles.sentimentLabel}>{lang('$agent_market_fear_greed_sma_365')}</span>
          <b className={styles.sentimentValue}>
            {formatMarketNumber(evidence.sma365, locale, 2)}
          </b>
        </div>
      </div>
      <p className={buildClassName(styles.paragraph, styles.sentimentMeta)}>
        {lang('$agent_market_as_of')}: {formatMarketUtcDate(evidence.asOfDate, locale)}
        {' · '}{lang('$agent_market_fear_greed_source')}:{' '}
        {evidence.source.attributionLabel}
      </p>
    </section>
  );
}

function PrimaryScenario({
  path,
  labels,
  locale,
  rationale,
}: {
  path: Extract<AgentMarketScenarioPathV1, { status: 'eligible' }>;
  labels: Map<string, string>;
  locale: string;
  rationale?: string;
}) {
  const lang = useLang();
  return (
    <div className={styles.scenario}>
      <div className={styles.scenarioHeadline}>
        <b>{formatScenarioKind(path.kind, lang)}</b>
        <span className={styles.confidence}>
          {lang('$agent_market_confidence')}: {formatConfidence(path.confidence, lang)}
        </span>
      </div>
      <dl className={styles.scenarioFacts}>
        <div className={styles.scenarioFact}>
          <dt className={styles.scenarioTerm}>{lang('$agent_market_activation')}</dt>
          <dd className={styles.scenarioDescription}>{formatCondition(path.activation, labels, lang)}</dd>
        </div>
        <div className={styles.scenarioFact}>
          <dt className={styles.scenarioTerm}>{lang('$agent_market_path')}</dt>
          <dd className={styles.scenarioDescription}>
            {path.path.map((step) => formatScenarioStep(step, labels, locale, lang)).join(' → ')}
          </dd>
        </div>
        <div className={styles.scenarioFact}>
          <dt className={styles.scenarioTerm}>{lang('$agent_market_terminal')}</dt>
          <dd className={styles.scenarioDescription}>
            {labels.get(path.terminalZone.id) ?? formatMarketZone(path.terminalZone, locale)}
          </dd>
        </div>
        <div className={styles.scenarioFact}>
          <dt className={styles.scenarioTerm}>{lang('$agent_market_invalidation')}</dt>
          <dd className={styles.scenarioDescription}>{formatCondition(path.invalidation, labels, lang)}</dd>
        </div>
        <div className={styles.scenarioFact}>
          <dt className={styles.scenarioTerm}>{lang('$agent_market_expected_range')}</dt>
          <dd className={styles.scenarioDescription}>
            {formatMarketRange(path.expectedMove.lower, path.expectedMove.upper, locale)}
          </dd>
        </div>
        {rationale && (
          <div className={styles.scenarioFact}>
            <dt className={styles.scenarioTerm}>{lang('$agent_market_rationale')}</dt>
            <dd className={styles.scenarioDescription}>{rationale}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function ExpectedMove({
  evidence,
  horizon,
  locale,
}: {
  evidence: AgentMarketAnalysisEvidenceV6;
  horizon: AgentMarketForecastHorizonV1;
  locale: string;
}) {
  const lang = useLang();
  const expectedMove = evidence.expectedMoves[horizon];
  if (expectedMove.status !== 'available') return undefined;
  return (
    <p className={buildClassName(styles.paragraph, styles.expectedMove)}>
      {lang('$agent_market_volatility_envelope')}: ±{formatMarketNumber(expectedMove.movePct, locale, 1)}%
      {' · '}{lang('$agent_market_expected_move_note')}
    </p>
  );
}

function SecondaryHorizon({
  analysis,
  evidence,
  horizon,
  locale,
}: {
  analysis?: AgentMarketAnalysisOutputV4;
  evidence: AgentMarketAnalysisEvidenceV6;
  horizon: AgentMarketForecastHorizonV1;
  locale: string;
}) {
  const lang = useLang();
  const tree = evidence.scenarioTrees[horizon];
  const active = findActivePath(tree);
  const primary = findPrimaryPath(tree);
  const expectedMove = evidence.expectedMoves[horizon];
  const rationale = analysis?.horizons[horizon]?.rationale;
  return (
    <div className={styles.secondaryHorizon}>
      <div className={styles.secondaryHeading}>
        <b>{formatHorizon(horizon, lang)}</b>
        <span>{formatMarketDate(tree.targetAt, locale, true)}</span>
      </div>
      {active ? (
        <p className={buildClassName(styles.paragraph, styles.secondaryText)}>
          {lang('$agent_market_current_regime')}: {formatScenarioKind(active.kind, lang)}
          {' · '}{formatConfidence(active.confidence, lang)}
        </p>
      ) : (
        <p className={buildClassName(styles.paragraph, styles.secondaryText)}>
          {lang('$agent_market_no_active_scenario')}
        </p>
      )}
      {primary && primary.kind !== active?.kind && (
        <p className={buildClassName(styles.paragraph, styles.secondaryText)}>
          {lang('$agent_market_conditional_scenario')}: {formatScenarioKind(primary.kind, lang)}
          {' · '}{formatConfidence(primary.confidence, lang)}
        </p>
      )}
      {rationale && (
        <p className={buildClassName(styles.paragraph, styles.secondaryText)}>
          {rationale}
        </p>
      )}
      {expectedMove.status === 'available' && (
        <small className={styles.secondaryMove}>
          {lang('$agent_market_volatility_envelope')}: ±{formatMarketNumber(expectedMove.movePct, locale, 1)}%
        </small>
      )}
    </div>
  );
}

function buildZonePresentation(
  map: AgentMarketLevelMapV1,
  paths: Array<Extract<AgentMarketScenarioPathV1, { status: 'eligible' }> | undefined>,
  lang: LangFn,
): ZonePresentation {
  const labels = new Map<string, string>();
  const rows: Array<Omit<ZonePresentation['rows'][number], 'metadata'> & { constituentIds: string[] }> = [];
  if (map.status === 'available') {
    mergeOverlappingZones(map.supports).slice(0, 2)
      .forEach((group, index) => addZoneGroup(rows, labels, group, `S${index + 1}`));
    mergeOverlappingZones(map.resistances).slice(0, 2)
      .forEach((group, index) => addZoneGroup(rows, labels, group, `R${index + 1}`));
    if (map.equilibrium) {
      const isProfile = map.equilibrium.sources.some(({ kind }) => kind === 'volume_profile_poc');
      mergeEquilibrium(rows, labels, map.equilibrium, isProfile ? 'POC' : 'EQ');
    }
  }
  paths.filter((path): path is Extract<AgentMarketScenarioPathV1, { status: 'eligible' }> => Boolean(path))
    .forEach((path) => {
      [...path.path.filter((step) => !isLvnTransitStep(step)).map(({ zone }) => zone), path.terminalZone]
        .forEach((zone) => {
          if (!labels.has(zone.id)) {
            addZoneGroup(rows, labels, { constituentIds: [zone.id], zone }, `T${countTargetLabels(labels) + 1}`);
          }
        });
    });
  const mentionedProfileConcepts = new Set<'poc' | 'value_area' | 'hvn'>();
  const mentionedProfileKinds = new Set<AgentMarketVolumeProfileKindV6>();
  return {
    labels,
    rows: rows.map(({ label, zone }) => ({
      label,
      metadata: formatLevelMetadata(zone, mentionedProfileConcepts, mentionedProfileKinds, lang),
      zone,
    })),
  };
}

function addZoneGroup(
  rows: Array<Omit<ZonePresentation['rows'][number], 'metadata'> & { constituentIds: string[] }>,
  labels: Map<string, string>,
  group: { constituentIds: string[]; zone: AgentMarketPriceZoneV1 },
  label: string,
) {
  group.constituentIds.forEach((id) => labels.set(id, label));
  rows.push({ label, ...group });
}

function mergeOverlappingZones(zones: readonly AgentMarketPriceZoneV1[]) {
  const groups: Array<{ constituentIds: string[]; zone: AgentMarketPriceZoneV1 }> = [];
  zones.forEach((zone) => {
    const matches = groups.flatMap((group, index) => (
      zonesOverlap(group.zone, zone) ? [index] : []
    ));
    if (!matches.length) {
      groups.push({ constituentIds: [zone.id], zone });
      return;
    }
    const first = matches[0];
    const merged = matches.slice(1).reduce((group, index) => ({
      constituentIds: [...group.constituentIds, ...groups[index].constituentIds],
      zone: mergeZoneValues(group.zone, groups[index].zone),
    }), {
      constituentIds: [...groups[first].constituentIds, zone.id],
      zone: mergeZoneValues(groups[first].zone, zone),
    });
    matches.slice(1).reverse().forEach((index) => groups.splice(index, 1));
    groups[first] = merged;
  });
  return groups;
}

function mergeEquilibrium(
  rows: Array<Omit<ZonePresentation['rows'][number], 'metadata'> & { constituentIds: string[] }>,
  labels: Map<string, string>,
  equilibrium: AgentMarketPriceZoneV1,
  fallbackLabel: string,
) {
  const matches = rows.flatMap((row, index) => zonesOverlap(row.zone, equilibrium) ? [index] : []);
  if (!matches.length) {
    addZoneGroup(rows, labels, { constituentIds: [equilibrium.id], zone: equilibrium }, fallbackLabel);
    return;
  }
  const first = matches[0];
  const merged = matches.slice(1).reduce((row, index) => ({
    ...row,
    constituentIds: [...row.constituentIds, ...rows[index].constituentIds],
    zone: mergeZoneValues(row.zone, rows[index].zone),
  }), {
    ...rows[first],
    constituentIds: [...rows[first].constituentIds, equilibrium.id],
    zone: mergeZoneValues(rows[first].zone, equilibrium),
  });
  matches.slice(1).reverse().forEach((index) => rows.splice(index, 1));
  rows[first] = merged;
  merged.constituentIds.forEach((id) => labels.set(id, merged.label));
}

function zonesOverlap(left: AgentMarketPriceZoneV1, right: AgentMarketPriceZoneV1) {
  return Number(left.lower) <= Number(right.upper) && Number(right.lower) <= Number(left.upper);
}

function mergeZoneValues(
  left: AgentMarketPriceZoneV1,
  right: AgentMarketPriceZoneV1,
): AgentMarketPriceZoneV1 {
  const strength = ['context', 'secondary', 'primary'] as const;
  const sources = [...left.sources, ...right.sources].filter((source, index, all) => (
    all.findIndex((candidate) => candidate.kind === source.kind
      && candidate.timeframe === source.timeframe
      && candidate.evidenceRef === source.evidenceRef) === index
  ));
  return {
    ...left,
    lower: Number(left.lower) <= Number(right.lower) ? left.lower : right.lower,
    upper: Number(left.upper) >= Number(right.upper) ? left.upper : right.upper,
    strength: strength[Math.max(strength.indexOf(left.strength), strength.indexOf(right.strength))],
    sources,
    touchCount: Math.max(left.touchCount, right.touchCount),
    rejectionCount: Math.max(left.rejectionCount, right.rejectionCount),
  };
}

function countTargetLabels(labels: Map<string, string>) {
  return [...labels.values()].filter((label) => label.startsWith('T')).length;
}

function findPrimaryPath(tree: AgentMarketHorizonScenarioTreeV1) {
  return tree.paths.find((path): path is Extract<AgentMarketScenarioPathV1, { status: 'eligible' }> => (
    path.status === 'eligible' && path.priority === 'primary'
  ));
}

function findActivePath(tree: AgentMarketHorizonScenarioTreeV1) {
  return tree.paths.find((path): path is Extract<AgentMarketScenarioPathV1, { status: 'eligible' }> => (
    path.status === 'eligible'
    && path.kind === tree.activeScenario
    && path.activation.state === 'triggered'
    && path.invalidation.state !== 'triggered'
  ));
}

function relevantProfiles(
  evidence: AgentMarketAnalysisEvidenceV6,
  horizon: AgentMarketForecastHorizonV1,
) {
  const kinds = new Set<AgentMarketVolumeProfileKindV6>(PROFILE_KINDS_BY_HORIZON[horizon]);
  return evidence.volumeProfileCoverage.profiles.filter((profile): profile is Extract<
    AgentMarketVolumeProfileSlotV6, { status: 'available' }
  > => profile.status === 'available' && kinds.has(profile.kind));
}

function getDailyChange(evidence: AgentMarketAnalysisEvidenceV6) {
  const daily = evidence.technicalEvidence.timeframes.find(({ timeframe }) => timeframe === '1d');
  return daily?.status === 'available' ? daily.evidence.change.percent : undefined;
}

function buildFallbackFactors(
  evidence: AgentMarketAnalysisEvidenceV6,
  tree: AgentMarketHorizonScenarioTreeV1,
  labels: Map<string, string>,
  lang: LangFn,
): MarketFactorPresentation[] {
  const snapshots = MARKET_TIMEFRAMES.map((timeframe) => evidence.structures
    .find((candidate) => candidate.timeframe === timeframe)?.snapshot);
  const structureStances = snapshots.map(structureStance);
  const active = findActivePath(tree);
  const primary = findPrimaryPath(tree);
  const profile = relevantProfiles(evidence, evidence.primaryDisplayHorizon)[0];
  return [
    {
      stance: new Set(structureStances).size === 1 ? structureStances[0] : 'mixed',
      text: lang('$agent_market_factor_timeframe_alignment', {
        daily: formatStructureDirection(snapshots[0]?.direction, lang),
        fourHour: formatStructureDirection(snapshots[1]?.direction, lang),
        hourly: formatStructureDirection(snapshots[2]?.direction, lang),
      }) as string,
    },
    {
      stance: active ? scenarioKindStance(active.kind) : scenarioTreeStance(tree.directionalState),
      text: lang(active ? '$agent_market_factor_current_scenario' : '$agent_market_factor_no_active_scenario', {
        active: active ? formatScenarioKind(active.kind, lang) : lang('$agent_market_no_active_scenario'),
        conditional: primary ? formatScenarioKind(primary.kind, lang) : lang('$agent_market_scenario_unavailable'),
        activation: primary ? formatCondition(primary.activation, labels, lang)
          : lang('$agent_market_scenario_unavailable'),
      }) as string,
    },
    profile ? {
      stance: profilePositionStance(profile.position),
      text: lang('$agent_market_factor_profile', {
        position: formatProfilePosition(profile.position, lang),
      }) as string,
    } : {
      stance: 'neutral',
      text: lang('$agent_market_factor_profile_unavailable'),
    },
  ];
}

function formatAssetName(evidence: AgentMarketAnalysisEvidenceV6) {
  const { name, symbol } = evidence.technicalEvidence.asset;
  return name && name.toLocaleLowerCase() !== symbol.toLocaleLowerCase()
    ? `${name} (${symbol})` : symbol;
}

function formatStructure(snapshot: AgentMarketStructureSnapshotV1 | undefined, lang: LangFn) {
  if (!snapshot) return lang('$agent_market_structure_unavailable');
  const parts = [formatStructureDirection(snapshot.direction, lang)];
  if (snapshot.event !== 'none') parts.push(formatStructureEvent(snapshot.event, lang));
  if (snapshot.liveState !== 'inside_structure') parts.push(formatLiveState(snapshot.liveState, lang));
  return parts.join(' · ');
}

function formatStructureDirection(
  direction: AgentMarketStructureSnapshotV1['direction'] | undefined,
  lang: LangFn,
) {
  const keys = {
    higher_highs_higher_lows: '$agent_market_structure_bullish',
    lower_highs_lower_lows: '$agent_market_structure_bearish',
    range: '$agent_market_structure_range',
    transition: '$agent_market_structure_transition',
    insufficient_data: '$agent_market_structure_unavailable',
  } as const;
  return lang(direction ? keys[direction] : '$agent_market_structure_unavailable');
}

function formatStructureEvent(event: AgentMarketStructureSnapshotV1['event'], lang: LangFn) {
  const keys = {
    none: '$agent_market_event_none',
    break_up: '$agent_market_event_break_up',
    break_down: '$agent_market_event_break_down',
    retest_up: '$agent_market_event_retest_up',
    retest_down: '$agent_market_event_retest_down',
  } as const;
  return lang(keys[event]);
}

function formatLiveState(state: AgentMarketStructureSnapshotV1['liveState'], lang: LangFn) {
  return lang(state === 'approaching_upper'
    ? '$agent_market_live_approaching_upper' : '$agent_market_live_approaching_lower');
}

function formatLevelMetadata(
  zone: AgentMarketPriceZoneV1,
  mentionedProfileConcepts: Set<'poc' | 'value_area' | 'hvn'>,
  mentionedProfileKinds: Set<AgentMarketVolumeProfileKindV6>,
  lang: LangFn,
) {
  const profileSources = zone.sources.filter(({ kind }) => kind.startsWith('volume_profile_'));
  const profileConcepts = new Set<'poc' | 'value_area' | 'hvn'>();
  profileSources.forEach(({ kind }) => {
    if (kind === 'volume_profile_poc') profileConcepts.add('poc');
    else if (kind === 'volume_profile_val' || kind === 'volume_profile_vah') profileConcepts.add('value_area');
    else if (kind === 'volume_profile_hvn') profileConcepts.add('hvn');
  });
  const parts = [formatLevelStrength(zone.strength, lang)];

  profileConcepts.forEach((concept) => {
    const isFirstMention = !mentionedProfileConcepts.has(concept);
    const abbreviated = concept === 'poc' ? 'POC' : concept === 'value_area' ? 'VAL/VAH' : 'HVN';
    const full = concept === 'poc' ? lang('$agent_market_profile_poc_full')
      : concept === 'value_area' ? lang('$agent_market_profile_value_area_full')
        : lang('$agent_market_profile_hvn_full');
    parts.push(isFirstMention ? full : abbreviated);
    mentionedProfileConcepts.add(concept);
  });

  const profileKinds = new Set(profileSources
    .map(({ evidenceRef }) => parseProfileKind(evidenceRef))
    .filter((kind): kind is AgentMarketVolumeProfileKindV6 => kind !== undefined));
  profileKinds.forEach((kind) => {
    if (!mentionedProfileKinds.has(kind)) parts.push(formatProfileKind(kind, lang));
    mentionedProfileKinds.add(kind);
  });
  return parts.join(' · ');
}

function isLvnTransitStep(step: AgentMarketScenarioStepV1) {
  return step.role === 'transit'
    && step.zone.sources.some(({ kind }) => kind === 'volume_profile_lvn');
}

function formatScenarioStep(
  step: AgentMarketScenarioStepV1,
  labels: Map<string, string>,
  locale: string,
  lang: LangFn,
) {
  if (isLvnTransitStep(step)) {
    return `${lang('$agent_market_profile_lvn_full')} ${formatMarketZone(step.zone, locale)}`;
  }
  return labels.get(step.zone.id) ?? formatMarketZone(step.zone, locale);
}

function parseProfileKind(evidenceRef: string): AgentMarketVolumeProfileKindV6 | undefined {
  const kind = evidenceRef.split('.')[1];
  if (kind === 'current_day' || kind === 'previous_day'
    || kind === 'previous_week' || kind === 'rolling_30d') return kind;
  return undefined;
}

function formatProfileKind(kind: AgentMarketVolumeProfileKindV6, lang: LangFn) {
  const keys = {
    current_day: '$agent_market_profile_current_day',
    previous_day: '$agent_market_profile_previous_day',
    previous_week: '$agent_market_profile_previous_week',
    rolling_30d: '$agent_market_profile_rolling_30d',
  } as const;
  return lang(keys[kind]);
}

function formatProfilePosition(
  position: Extract<AgentMarketVolumeProfileSlotV6, { status: 'available' }>['position'],
  lang: LangFn,
) {
  const keys = {
    above_value_area: '$agent_market_profile_above',
    inside_value_area: '$agent_market_profile_inside',
    below_value_area: '$agent_market_profile_below',
  } as const;
  return lang(keys[position]);
}

function formatCondition(
  condition: AgentMarketScenarioConditionV1,
  labels: Map<string, string>,
  lang: LangFn,
) {
  const zoneLabels = condition.zoneIds.map((id) => labels.get(id) ?? lang('$agent_market_scenario_zone')).join('–');
  const directionKeys = {
    above: '$agent_market_condition_above',
    below: '$agent_market_condition_below',
    inside: '$agent_market_condition_inside',
    outside: '$agent_market_condition_outside',
  } as const;
  const stateKeys = {
    not_triggered: '$agent_market_condition_waiting',
    approaching: '$agent_market_condition_approaching',
    triggered: '$agent_market_condition_triggered',
  } as const;
  const confirmation = condition.confirmationBasis === '4h_close' ? '4H' : '1D';
  return `${confirmation} ${lang(directionKeys[condition.direction])} ${zoneLabels}`
    + ` · ${lang(stateKeys[condition.state])}`;
}

function formatScenarioKind(
  kind: Extract<AgentMarketScenarioPathV1, { status: 'eligible' }>['kind'],
  lang: LangFn,
) {
  const keys = {
    bullish_breakout: '$agent_market_scenario_bullish',
    range_balance: '$agent_market_scenario_range',
    bearish_breakdown: '$agent_market_scenario_bearish',
  } as const;
  return lang(keys[kind]);
}

function formatHorizon(horizon: AgentMarketForecastHorizonV1, lang: LangFn) {
  const keys = {
    '3d': '$agent_market_horizon_3d',
    '7d': '$agent_market_horizon_7d',
    '30d': '$agent_market_horizon_30d',
  } as const;
  return lang(keys[horizon]);
}

function formatConfidence(confidence: 'low' | 'medium', lang: LangFn) {
  return lang(confidence === 'low' ? '$agent_market_confidence_low' : '$agent_market_confidence_medium');
}

function formatMarketZone(zone: AgentMarketPriceZoneV1, locale: string) {
  return formatMarketRange(zone.lower, zone.upper, locale);
}

function formatMarketRange(lowerValue: string, upperValue: string, locale: string) {
  const lower = formatMarketNumber(lowerValue, locale);
  const upper = formatMarketNumber(upperValue, locale);
  return lower === upper ? lower : `${lower}–${upper}`;
}

function formatLevelStrength(strength: AgentMarketPriceZoneV1['strength'], lang: LangFn) {
  const keys = {
    primary: '$agent_market_level_primary',
    secondary: '$agent_market_level_secondary',
    context: '$agent_market_level_context',
  } as const;
  return lang(keys[strength]);
}

function formatMarketNumber(value: string, locale: string, fixedMaximum?: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';
  const absoluteValue = Math.abs(numericValue);
  const maximumFractionDigits = fixedMaximum ?? (absoluteValue >= 100 ? 0
    : absoluteValue >= 1 ? 2 : absoluteValue >= 0.01 ? 4 : 6);
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(numericValue);
}

function formatMarketPercent(value: string, locale: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(numericValue)}%`;
}

function formatMarketDate(value: string, locale: string, isDateOnly = false) {
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = isDateOnly
    ? { dateStyle: 'medium' }
    : { dateStyle: 'medium', timeStyle: 'short' };
  try {
    options.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(date);
  }
}

function formatMarketUtcDate(value: string, locale: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  }
}

function normalizeLocale(locale?: string) {
  return locale?.replace('-raw', '') || 'en';
}

function getFallbackThesis(
  tree: AgentMarketHorizonScenarioTreeV1,
  lang: LangFn,
) {
  const active = findActivePath(tree);
  if (!active) return lang('$agent_market_thesis_unconfirmed');
  const state = active.kind === 'bullish_breakout' ? 'bullish'
    : active.kind === 'bearish_breakdown' ? 'bearish' : 'range';
  const keys = {
    bullish: '$agent_market_thesis_bullish',
    bearish: '$agent_market_thesis_bearish',
    range: '$agent_market_thesis_range',
  } as const;
  return lang(keys[state]);
}

function structureStance(snapshot?: AgentMarketStructureSnapshotV1) {
  if (snapshot?.direction === 'higher_highs_higher_lows') return 'bullish' as const;
  if (snapshot?.direction === 'lower_highs_lower_lows') return 'bearish' as const;
  if (snapshot?.direction === 'transition') return 'mixed' as const;
  return 'neutral' as const;
}

function scenarioTreeStance(state: AgentMarketHorizonScenarioTreeV1['directionalState']) {
  if (state === 'bullish' || state === 'bearish' || state === 'mixed') return state;
  return 'neutral' as const;
}

function scenarioKindStance(kind: AgentMarketHorizonScenarioTreeV1['activeScenario']) {
  if (kind === 'bullish_breakout') return 'bullish' as const;
  if (kind === 'bearish_breakdown') return 'bearish' as const;
  return 'neutral' as const;
}

function formatFearGreedRegime(
  regime: AgentMarketFearGreedRegimeV1['regime'],
  lang: LangFn,
) {
  const keys = {
    risk_on: '$agent_market_fear_greed_risk_on',
    risk_off: '$agent_market_fear_greed_risk_off',
    neutral: '$agent_market_fear_greed_neutral',
  } as const;
  return lang(keys[regime]);
}

function getFearGreedRegimeClass(regime: AgentMarketFearGreedRegimeV1['regime']) {
  if (regime === 'risk_on') return styles.riskOn;
  if (regime === 'risk_off') return styles.riskOff;
  return styles.sentimentNeutral;
}

function profilePositionStance(
  position: Extract<AgentMarketVolumeProfileSlotV6, { status: 'available' }>['position'],
) {
  if (position === 'above_value_area') return 'bullish' as const;
  if (position === 'below_value_area') return 'bearish' as const;
  return 'neutral' as const;
}

function getStanceClass(stance: MarketFactorPresentation['stance']) {
  if (stance === 'bullish') return styles.bullish;
  if (stance === 'bearish') return styles.bearish;
  if (stance === 'mixed') return styles.mixed;
  return styles.neutral;
}

export default memo(AgentV2MarketAnalysisCard);
