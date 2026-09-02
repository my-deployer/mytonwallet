import React from '../../lib/teact/teact';
import TeactDOM from '../../lib/teact/teact-dom';

import type {
  AgentMarketFearGreedRegimeV1,
  AgentSemanticContentV1,
} from '../../api/agentV2/protocol/types';

import { pause } from '../../util/schedulers';
import { buildAgentMarketAnalysisV6Fixture } from '../../api/agentV2/protocol/agentMarketAnalysisTestFixture';

import AgentV2SemanticContent, { type AgentV2RichSemanticContent } from './AgentV2SemanticContent';

let mockLocale: 'en' | 'ru' = 'en';
const EMPTY_MARKET_HORIZON = JSON.parse('null') as null;
const mockCopy: Record<string, Record<string, string>> = {
  en: {
    $agent_semantic_transactions: 'Transactions',
    $agent_semantic_wallets: 'Wallets',
    $agent_semantic_wallet: 'Wallet',
    $agent_semantic_balance: 'Balance',
    $agent_semantic_balance_unavailable: '—',
    $agent_semantic_access_regular: 'Regular',
    $agent_semantic_access_view_only: 'View only',
    $agent_semantic_wallets_unpriced: '%amount% positions have no price.',
    $agent_semantic_wallets_stale: 'Some wallet balances may be outdated.',
    $agent_semantic_wallets_unavailable: 'Some wallet balances are unavailable.',
    $agent_semantic_wallets_partial: 'Some wallet data is incomplete.',
    $agent_semantic_status: 'Status',
    $agent_semantic_quantity: 'Quantity',
    $agent_semantic_time: 'Time',
    $agent_wallet_page_navigation: 'Wallet data pages',
    $agent_wallet_page_previous: '← Previous',
    $agent_wallet_page_next: 'Next →',
    $agent_wallet_page_indicator: '%current% of %total%',
    $agent_portfolio_asset: 'Asset',
    $agent_semantic_fungible: 'Token',
    $agent_portfolio_analysis: 'Portfolio analysis',
    $agent_semantic_market: 'Market overview',
    $agent_market_analysis_title: 'Market analysis',
    $agent_market_as_of: 'As of',
    $agent_market_closed_1d: 'Latest closed 1D candle',
    $agent_market_thesis: 'Technical thesis',
    $agent_market_fear_greed_sentiment: 'Bitcoin-based market sentiment',
    $agent_market_fear_greed_index: 'Fear & Greed index (0–100)',
    $agent_market_fear_greed_sma_30: 'SMA 30',
    $agent_market_fear_greed_sma_365: 'SMA 365',
    $agent_market_fear_greed_regime: 'Market regime',
    $agent_market_fear_greed_risk_on: 'Risk-on sentiment',
    $agent_market_fear_greed_risk_off: 'Risk-off sentiment',
    $agent_market_fear_greed_neutral: 'Neutral sentiment',
    $agent_market_fear_greed_source: 'Source',
    $agent_market_timeframes: 'Market structure',
    $agent_market_structure_bullish: 'Higher highs and higher lows',
    $agent_market_structure_bearish: 'Lower highs and lower lows',
    $agent_market_structure_range: 'Range',
    $agent_market_structure_transition: 'Transition',
    $agent_market_structure_unavailable: 'Structure unavailable',
    $agent_market_event_break_down: 'Break below structure',
    $agent_market_live_approaching_upper: 'Approaching the upper boundary',
    $agent_market_level_map: 'Key levels',
    $agent_market_level_primary: 'Primary level',
    $agent_market_level_secondary: 'Secondary level',
    $agent_market_level_context: 'Context level',
    $agent_market_levels_unavailable: 'Confirmed structural levels are unavailable.',
    $agent_market_profile_poc_full: 'volume center (POC)',
    $agent_market_profile_value_area_full: 'value-area boundaries (VAL/VAH)',
    $agent_market_profile_hvn_full: 'high-volume area (HVN)',
    $agent_market_profile_lvn_full: 'low-volume corridor (LVN)',
    $agent_market_profile_previous_week: 'Previous UTC week',
    $agent_market_profile_inside: 'Price inside the value area',
    $agent_market_factors: 'Key factors',
    $agent_market_factor_structure: 'Daily structure: %direction%',
    $agent_market_factor_levels: '%supports% support and %resistances% resistance zones are confirmed.',
    $agent_market_factor_profile: 'Volume distribution: %position%.',
    $agent_market_factor_profile_unavailable: 'Volume Profile is unavailable.',
    $agent_market_factor_timeframe_alignment: 'Timeframe structure — 1D: %daily%; 4H: %fourHour%; 1H: %hourly%.',
    $agent_market_factor_current_scenario:
      'Current regime: %active%. Conditional scenario: %conditional% after %activation%.',
    $agent_market_factor_no_active_scenario:
      'No scenario is confirmed. Conditional scenario: %conditional% after %activation%.',
    $agent_market_primary_scenario: 'Primary scenario',
    $agent_market_current_regime: 'Current confirmed regime',
    $agent_market_conditional_scenario: 'Conditional scenario',
    $agent_market_no_active_scenario: 'No scenario is currently confirmed.',
    $agent_market_calculated_fallback: 'Calculated analysis: the model explanation is temporarily unavailable.',
    $agent_market_other_horizons: 'Other requested horizons',
    $agent_market_horizon_3d: '3 days',
    $agent_market_horizon_7d: '7 days',
    $agent_market_horizon_30d: '30 days',
    $agent_market_scenario_bullish: 'Bullish breakout',
    $agent_market_scenario_range: 'Range balance',
    $agent_market_scenario_bearish: 'Bearish breakdown',
    $agent_market_scenario_unavailable: 'Structural scenario is unavailable for this horizon.',
    $agent_market_confidence: 'Confidence',
    $agent_market_confidence_low: 'Low',
    $agent_market_confidence_medium: 'Medium',
    $agent_market_activation: 'Activation',
    $agent_market_path: 'Path',
    $agent_market_terminal: 'Terminal zone',
    $agent_market_invalidation: 'Invalidation',
    $agent_market_expected_range: 'Scenario range',
    $agent_market_rationale: 'Rationale',
    $agent_market_condition_above: 'close above',
    $agent_market_condition_below: 'close below',
    $agent_market_condition_inside: 'close inside',
    $agent_market_condition_outside: 'close outside',
    $agent_market_condition_waiting: 'Waiting for confirmation',
    $agent_market_expected_move: 'Volatility envelope',
    $agent_market_volatility_envelope: 'Overall volatility envelope',
    $agent_market_expected_move_note: 'Conditional move, not a probability',
    $agent_market_risk_caveat: 'Scenarios are conditional and do not constitute a trading recommendation.',
    $agent_market_partial_coverage: 'Part of the market evidence is unavailable; confidence is limited.',
    $agent_market_thesis_range: 'Price remains balanced between confirmed support and resistance.',
    $agent_market_thesis_unconfirmed:
      'No scenario is confirmed; wait for a structural boundary close before adopting a directional case.',
    $agent_semantic_asset_search: 'Asset search',
    $agent_semantic_no_results: 'No results',
    $agent_semantic_partial: 'Some data is unavailable.',
    $agent_notice_consent_required: 'Allow wallet data access to continue.',
    $agent_notice_tool_unavailable: 'This operation is unavailable in the current client.',
    $agent_notice_wallet_unavailable: 'Wallet data is unavailable right now.',
    $agent_semantic_completed: 'Completed',
    $agent_semantic_spam_transactions: 'Spam transactions',
    $agent_semantic_spam_assets: 'Spam assets',
    $agent_semantic_hidden_assets: 'Hidden assets',
    $agent_semantic_hidden_assets_warning:
      'Hidden asset names may be misleading. They are shown as plain text and cannot be opened as links.',
    $agent_semantic_quarantine_warning: 'These items were reported as spam.',
    $agent_semantic_redacted_asset: 'Name hidden',
    $agent_semantic_omitted_spam: 'Filtered spam: %amount%',
    $agent_semantic_omitted_spam_minimum: 'Filtered spam: at least %amount%',
    $agent_semantic_omitted_hidden: 'Hidden assets omitted: %amount%',
    $agent_semantic_omitted_hidden_minimum: 'Hidden assets omitted: at least %amount%',
    $agent_semantic_suspicious: 'Unsafe names hidden: %amount%',
    $agent_semantic_suspicious_minimum: 'Unsafe names hidden: at least %amount%',
    $agent_semantic_suspicious_shown: 'Potentially unsafe names: %amount%',
    $agent_semantic_suspicious_shown_minimum: 'Potentially unsafe names: at least %amount%',
    $agent_semantic_omitted_rows: '%amount% more rows were not included. Narrow the period or filters.',
    $agent_semantic_omitted_rows_minimum:
      'At least %amount% more rows were not included. Narrow the period or filters.',
    $agent_semantic_update_required: 'Update the app to display this response.',
  },
  ru: {
    $agent_semantic_transactions: 'Операции',
    $agent_semantic_wallets: 'Кошельки',
    $agent_semantic_wallet: 'Кошелёк',
    $agent_semantic_balance: 'Баланс',
    $agent_semantic_balance_unavailable: '—',
    $agent_semantic_access_regular: 'Обычный',
    $agent_semantic_access_view_only: 'View only',
    $agent_semantic_wallets_unpriced: 'Без цены: %amount%',
    $agent_semantic_wallets_stale: 'Некоторые балансы устарели.',
    $agent_semantic_wallets_unavailable: 'Некоторые балансы недоступны.',
    $agent_semantic_wallets_partial: 'Часть данных неполная.',
    $agent_semantic_status: 'Статус',
    $agent_semantic_quantity: 'Количество',
    $agent_semantic_time: 'Время',
    $agent_wallet_page_navigation: 'Страницы данных кошелька',
    $agent_wallet_page_previous: '← Назад',
    $agent_wallet_page_next: 'Вперёд →',
    $agent_wallet_page_indicator: '%current% из %total%',
    $agent_market_analysis_title: 'Анализ рынка',
    $agent_market_as_of: 'Данные на',
    $agent_market_closed_1d: 'Последняя закрытая свеча 1D',
    $agent_market_thesis: 'Технический тезис',
    $agent_market_fear_greed_sentiment: 'Настроение рынка на основе биткоина',
    $agent_market_fear_greed_index: 'Индекс страха и жадности (0–100)',
    $agent_market_fear_greed_sma_30: 'SMA за 30 дней',
    $agent_market_fear_greed_sma_365: 'SMA за 365 дней',
    $agent_market_fear_greed_regime: 'Режим рынка',
    $agent_market_fear_greed_risk_on: 'Настроение risk-on',
    $agent_market_fear_greed_risk_off: 'Настроение risk-off',
    $agent_market_fear_greed_neutral: 'Нейтральное настроение',
    $agent_market_fear_greed_source: 'Источник',
    $agent_market_timeframes: 'Структура рынка',
    $agent_market_structure_bearish: 'Понижающиеся максимумы и минимумы',
    $agent_market_structure_transition: 'Переходный режим',
    $agent_market_structure_range: 'Диапазон',
    $agent_market_event_break_down: 'Пробой структуры вниз',
    $agent_market_live_approaching_upper: 'Цена приближается к верхней границе',
    $agent_market_level_map: 'Ключевые уровни',
    $agent_market_level_secondary: 'Вторичный уровень',
    $agent_market_level_context: 'Контекстный уровень',
    $agent_market_profile_poc_full: 'центр объёма (POC)',
    $agent_market_profile_value_area_full: 'границы зоны стоимости (VAL/VAH)',
    $agent_market_profile_hvn_full: 'область высокого объёма (HVN)',
    $agent_market_profile_lvn_full: 'коридор низкого объёма (LVN)',
    $agent_market_profile_previous_week: 'Предыдущая неделя UTC',
    $agent_market_profile_inside: 'Цена внутри зоны стоимости',
    $agent_market_factors: 'Ключевые факторы',
    $agent_market_factor_timeframe_alignment:
      'Структура таймфреймов — 1D: %daily%; 4H: %fourHour%; 1H: %hourly%.',
    $agent_market_factor_current_scenario:
      'Текущий режим: %active%. Условный сценарий: %conditional% после условия «%activation%».',
    $agent_market_factor_no_active_scenario:
      'Подтверждённого сценария нет. Условный сценарий: %conditional% после условия «%activation%».',
    $agent_market_primary_scenario: 'Основной сценарий',
    $agent_market_current_regime: 'Текущий подтверждённый режим',
    $agent_market_conditional_scenario: 'Условный сценарий',
    $agent_market_no_active_scenario: 'Сейчас ни один сценарий не подтверждён.',
    $agent_market_calculated_fallback: 'Расчётный анализ: текстовое объяснение временно недоступно.',
    $agent_market_other_horizons: 'Другие запрошенные горизонты',
    $agent_market_horizon_3d: '3 дня',
    $agent_market_horizon_7d: '7 дней',
    $agent_market_horizon_30d: '30 дней',
    $agent_market_scenario_bullish: 'Бычий пробой',
    $agent_market_scenario_range: 'Баланс в диапазоне',
    $agent_market_scenario_bearish: 'Медвежий пробой',
    $agent_market_confidence: 'Уверенность',
    $agent_market_confidence_low: 'Низкая',
    $agent_market_confidence_medium: 'Средняя',
    $agent_market_activation: 'Активация',
    $agent_market_path: 'Развитие',
    $agent_market_terminal: 'Конечная зона',
    $agent_market_invalidation: 'Отмена сценария',
    $agent_market_expected_range: 'Диапазон сценария',
    $agent_market_rationale: 'Обоснование',
    $agent_market_condition_above: 'закрытие выше',
    $agent_market_condition_below: 'закрытие ниже',
    $agent_market_condition_inside: 'закрытие внутри',
    $agent_market_condition_outside: 'закрытие вне',
    $agent_market_condition_waiting: 'Ожидает подтверждения',
    $agent_market_expected_move: 'Диапазон волатильности',
    $agent_market_volatility_envelope: 'Общий диапазон волатильности',
    $agent_market_expected_move_note: 'Условное движение, а не вероятность',
    $agent_market_thesis_range: 'Цена остаётся в равновесии между подтверждёнными поддержкой и сопротивлением.',
    $agent_market_thesis_unconfirmed:
      'Сценарий пока не подтверждён; направленный вывод требует закрытия за границей структуры.',
  },
};

jest.mock('../../hooks/useLang', () => ({
  __esModule: true,
  default: () => Object.assign(
    (key: string, values?: Record<string, unknown>) => {
      const copy = mockCopy[mockLocale][key] ?? mockCopy.en[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`%${name}%`, String(value)),
        copy,
      );
    },
    { code: mockLocale },
  ),
}));

describe('Agent V2 semantic content renderer', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    mockLocale = 'en';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    TeactDOM.render(undefined, root);
    root.remove();
  });

  it.each(contents())('renders the $kind semantic variant', async (content) => {
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);
    expect(root.querySelector('section')).not.toBeNull();
  });

  it('renders wallet query rows as accessible HTML tables', async () => {
    const content = contents()[0];
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(3);
    expect(root.textContent).toContain('TON');
  });

  it('replaces wallet rows through local navigation without a continuation action', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      chain: 'ton' as const,
      transactionType: 'transfer' as const,
      status: 'completed' as const,
      timestamp: new Date(Date.UTC(2026, 7, 7, 12, index)).toISOString(),
      assetSymbol: `ROW-${String(index + 1).padStart(3, '0')}`,
      quantity: String(index + 1),
    }));
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions', outcome: 'complete', hasMore: false,
      rows,
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    const buttons = root.querySelectorAll('nav button');
    expect(buttons).toHaveLength(2);
    expect(root.textContent).toContain('1 of 3');
    expect(root.textContent).toContain('ROW-001');
    expect(root.textContent).toContain('ROW-010');
    expect(root.textContent).not.toContain('ROW-011');

    (buttons[1] as HTMLButtonElement).click();
    await pause(20);

    expect(root.textContent).toContain('2 of 3');
    expect(root.textContent).not.toContain('ROW-001');
    expect(root.textContent).toContain('ROW-011');
    expect(root.textContent).toContain('ROW-020');
    expect(root.textContent).not.toContain('ROW-021');
  });

  it('builds a localized account Markdown table without allowing label injection', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'accounts', outcome: 'partial', hasMore: false,
      rows: [{
        accountLabel: 'Main | **bold**\n<script>', accessMode: 'view_only',
        portfolioTotalStatus: 'partial',
        portfolioTotal: { value: '42.5', baseCurrency: 'USD', unpricedCount: 1 },
      }, {
        accountLabel: 'Watch', accessMode: 'regular', portfolioTotalStatus: 'unavailable',
      }],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.querySelectorAll('table')).toHaveLength(1);
    expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(3);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(3);
    expect(root.textContent).toContain('Main | **bold** <script>');
    expect(root.textContent).toContain('View only');
    expect(root.textContent).toContain('1 positions have no price.');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('strong strong')).toBeNull();

    mockLocale = 'ru';
    TeactDOM.render(<AgentV2SemanticContent content={{ ...content }} />, root);
    await pause(20);
    expect(root.textContent).toContain('Кошелёк');
    expect(root.textContent).toContain('Обычный');
  });

  it('keeps only concrete wallet-account limitations', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'accounts', outcome: 'partial', hasMore: false,
      rows: [{
        accountLabel: 'Main', accessMode: 'regular', portfolioTotalStatus: 'partial',
        portfolioTotal: { value: '42.5', baseCurrency: 'USD', unpricedCount: 0 },
      }, {
        accountLabel: 'Watch', accessMode: 'view_only', portfolioTotalStatus: 'unavailable',
      }],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Some wallet balances are unavailable.');
    expect(root.textContent).not.toContain('Some wallet balances may be outdated.');
    expect(root.textContent).not.toContain('Some wallet data is incomplete.');
  });

  it('uses explicit asset-search outcomes instead of treating missing rows as no results', async () => {
    const asset = { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', name: 'Toncoin' };
    const coverage = {
      totalVisibleAccountCount: 2, checkedAccountCount: 2, inaccessibleAccountCount: 0,
      matchingAccountCount: 0, omittedHoldingCount: 0, isComplete: true,
    };

    TeactDOM.render(
      <AgentV2SemanticContent
        content={{ kind: 'assetSearch', schemaVersion: 1, outcome: 'complete_absent', asset, coverage }}
      />,
      root,
    );
    await pause(20);
    expect(root.textContent).toContain('No results');
    expect(root.textContent).not.toContain('Toncoin');

    TeactDOM.render(
      <AgentV2SemanticContent
        content={{
          kind: 'assetSearch', schemaVersion: 1, outcome: 'incomplete_unconfirmed', asset,
          coverage: { ...coverage, checkedAccountCount: 1, inaccessibleAccountCount: 1, isComplete: false },
        }}
      />,
      root,
    );
    await pause(20);
    expect(root.textContent).toContain('Wallet data is unavailable right now.');
    expect(root.textContent).not.toContain('No results');

    TeactDOM.render(
      <AgentV2SemanticContent
        content={{ kind: 'assetSearch', schemaVersion: 1, outcome: 'scope_denied', reason: 'consent_required' }}
      />,
      root,
    );
    await pause(20);
    expect(root.textContent).toContain('Allow wallet data access to continue.');
    expect(root.textContent).not.toContain('No results');

    TeactDOM.render(
      <AgentV2SemanticContent
        content={{
          kind: 'assetSearch', schemaVersion: 1, outcome: 'scope_denied', reason: 'account_scope_not_allowed',
        }}
      />,
      root,
    );
    await pause(20);
    expect(root.textContent).toContain('This operation is unavailable in the current client.');
    expect(root.textContent).not.toContain('No results');
  });

  it('paginates account Markdown tables locally', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'accounts', outcome: 'complete', hasMore: false,
      rows: Array.from({ length: 11 }, (_, index) => ({
        accountLabel: `Wallet ${index + 1}`,
        accessMode: 'regular' as const,
        portfolioTotalStatus: 'complete' as const,
        portfolioTotal: { value: String(index + 1), baseCurrency: 'USD', unpricedCount: 0 },
      })),
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(root.textContent).toContain('Wallet 1');
    expect(root.textContent).not.toContain('Wallet 11');
    expect(root.textContent).toContain('1 of 2');

    (root.querySelectorAll('nav button')[1] as HTMLButtonElement).click();
    await pause(20);

    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelector('tbody td')?.textContent).toBe('Wallet 11');
    expect(root.textContent).toContain('2 of 2');
  });

  it('explains when the embedded result was truncated', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions', outcome: 'partial', hasMore: false,
      omittedRows: { count: 7, accuracy: 'lower_bound' },
      rows: [],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('At least 7 more rows were not included');
    expect(root.textContent).toContain('Narrow the period or filters');
  });

  it('renders unsafe quarantine rows without raw names or links and keeps lower-bound counters', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions', outcome: 'partial', hasMore: true,
      policySummary: {
        presentation: 'quarantine',
        suspicious: { count: 1, accuracy: 'lower_bound' },
      },
      rows: [{
        chain: 'ton', transactionType: 'transfer', status: 'completed', timestamp: '2026-08-06T12:00:00.000Z',
        assetLabelStatus: 'redacted_unsafe', quantity: '1',
      }],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Spam transactions');
    expect(root.textContent).toContain('These items were reported as spam');
    expect(root.textContent).toContain('Name hidden');
    expect(root.textContent).toContain('Unsafe names hidden: at least 1');
    expect(root.textContent).not.toContain('GRAMEVENT.ORG');
    expect(root.querySelector('a')).toBeNull();
  });

  it('renders full hidden-asset labels as warned plaintext without creating links', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'positions', outcome: 'complete', hasMore: false,
      policySummary: {
        presentation: 'hidden_review',
        suspicious: { count: 1, accuracy: 'exact' },
      },
      rows: [{
        chain: 'robinhood', positionKind: 'fungible', quantity: '100',
        assetName: 'Gram Event', assetSymbol: 'GRAM AT GRAMEVENT.ORG',
        assetLabelStatus: 'untrusted_plaintext',
      }],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Hidden assets');
    expect(root.textContent).toContain('shown as plain text');
    expect(root.textContent).toContain('Gram Event (GRAM AT GRAMEVENT.ORG)');
    expect(root.textContent).toContain('Robinhood · Token');
    expect(root.textContent).toContain('Potentially unsafe names: 1');
    expect(root.querySelector('a')).toBeNull();
  });

  it('preserves unknown chain identifiers in hidden-asset labels', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'positions', outcome: 'complete', hasMore: false,
      policySummary: { presentation: 'hidden_review' },
      rows: [{
        chain: 'future_chain', positionKind: 'fungible', quantity: '1', assetSymbol: 'FUTURE',
      }],
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('future_chain · Token');
    expect(root.textContent).not.toContain('FUTURE_CHAIN');
  });

  it('renders a safe update placeholder without raw unsupported content', async () => {
    const content: AgentSemanticContentV1 = { kind: 'clientUnsupported', schemaVersion: 1 };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toBe('Update the app to display this response.');
    expect(root.textContent).not.toContain('raw');
    expect(root.querySelector('a')).toBeNull();
  });

  it('renders V6 market structure, profile levels and backend-selected scenarios without raw diagnostics', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Ethereum (ETH)');
    expect(root.textContent).toContain('1,857 USDT');
    expect(root.textContent).toContain('Latest closed 1D candle: -1.3%');
    expect(root.textContent).toContain('volume center (POC)');
    expect(root.textContent).toContain('value-area boundaries (VAL/VAH)');
    expect(root.textContent).toContain('high-volume area (HVN)');
    expect(root.textContent).toContain('low-volume corridor (LVN) 1,720–1,740');
    expect(root.textContent).toContain('Previous UTC week');
    expect(root.textContent).not.toContain('Current UTC day');
    expect(root.textContent?.match(/volume center \(POC\)/g)).toHaveLength(1);
    expect(root.textContent?.match(/value-area boundaries \(VAL\/VAH\)/g)).toHaveLength(1);
    expect(root.textContent?.match(/Previous UTC week/g)).toHaveLength(1);
    expect(root.textContent?.match(/low-volume corridor \(LVN\)/g)).toHaveLength(1);
    expect(root.textContent?.match(/1,720–1,740/g)).toHaveLength(1);
    expect(root.textContent).not.toContain('1,780–1,935');
    expect(root.textContent).not.toContain('1,860 ·');
    expect(root.textContent).toContain('Current confirmed regime · 7 days');
    expect(root.textContent).toContain('Range balance');
    expect(root.textContent).toContain('Conditional scenario');
    expect(root.textContent).toContain('Bearish breakdown');
    expect(root.textContent).toContain('S1');
    expect(root.textContent).toContain('R1');
    expect(root.textContent).toContain('S1 → low-volume corridor (LVN) 1,720–1,740 → T1');
    expect(root.querySelectorAll('ol li')).toHaveLength(3);
    expect(root.textContent?.match(/1,780–1,800/g)).toHaveLength(1);
    expect(root.textContent).not.toContain('1857.44000000');
    expect(root.textContent?.toLowerCase()).not.toContain('obv');
    expect(root.textContent?.toLowerCase()).not.toContain('prominence');
    expect(root.textContent).not.toContain('https://');
    const levelSection = [...root.querySelectorAll('section')].find((section) => (
      section.querySelector('h3')?.textContent?.startsWith('Key levels')
    ));
    expect(levelSection?.textContent).not.toContain('LVN');
    expect(root.textContent).not.toContain('Bitcoin-based market sentiment');
  });

  it.each([
    ['risk_on', 'Risk-on sentiment'],
    ['risk_off', 'Risk-off sentiment'],
    ['neutral', 'Neutral sentiment'],
  ] as const)('renders the optional Fear & Greed %s regime', async (regime, stateLabel) => {
    const content = buildAgentMarketAnalysisV6Fixture();
    content.fearGreedRegime = fearGreedRegime(regime);
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    const sentimentSection = [...root.querySelectorAll('section')].find((section) => (
      section.querySelector('h3')?.textContent === 'Bitcoin-based market sentiment'
    ));
    expect(sentimentSection).toBeDefined();
    expect(sentimentSection?.textContent).toContain(stateLabel);
    expect(sentimentSection?.textContent).toContain('Fear & Greed index (0–100)');
    expect(sentimentSection?.textContent).toContain('63 / 100');
    expect(sentimentSection?.textContent).toContain('SMA 3058.25');
    expect(sentimentSection?.textContent).toContain('SMA 36551.5');
    expect(sentimentSection?.textContent).toContain('Aug 9, 2026');
    expect(sentimentSection?.textContent).not.toContain('2026-08-09');
    expect(sentimentSection?.textContent).not.toContain('%');
    expect(sentimentSection?.textContent).toContain('Source: Alternative.me');
    expect(sentimentSection?.querySelector('a')).toBeNull();

    const sectionTitles = [...root.querySelectorAll('h3')].map(({ textContent }) => textContent);
    expect(sectionTitles.indexOf('Bitcoin-based market sentiment'))
      .toBeGreaterThan(sectionTitles.indexOf('Technical thesis'));
    expect(sectionTitles.indexOf('Bitcoin-based market sentiment'))
      .toBeLessThan(sectionTitles.indexOf('Market structure'));
  });

  it('abbreviates later HVN mentions inside displayed levels', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available') throw new Error('Expected available fixture level map');
    map.resistances[0].sources.push({
      kind: 'volume_profile_hvn',
      timeframe: 'profile',
      evidenceRef: 'profile.previous_week.hvn.2',
    });
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent?.match(/high-volume area \(HVN\)/g)).toHaveLength(1);
    expect(root.textContent?.match(/HVN/g)).toHaveLength(2);
    expect([...root.querySelectorAll('small')].map(({ textContent }) => textContent))
      .toContain('Secondary level · VAL/VAH · HVN');
  });

  it('localizes the first V6 Volume Profile explanation in Russian', async () => {
    mockLocale = 'ru';
    const content = buildAgentMarketAnalysisV6Fixture();
    content.fearGreedRegime = fearGreedRegime('risk_off');
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Технический тезис');
    expect(root.textContent).toContain('центр объёма (POC)');
    expect(root.textContent).toContain('границы зоны стоимости (VAL/VAH)');
    expect(root.textContent).toContain('область высокого объёма (HVN)');
    expect(root.textContent).toContain('коридор низкого объёма (LVN) 1 720–1 740');
    expect(root.textContent?.match(/центр объёма \(POC\)/g)).toHaveLength(1);
    expect(root.textContent?.match(/границы зоны стоимости \(VAL\/VAH\)/g)).toHaveLength(1);
    expect(root.textContent).toContain('Текущий подтверждённый режим · 7 дней');
    expect(root.textContent).toContain('Баланс в диапазоне');
    expect(root.textContent).toContain('Условный сценарий');
    expect(root.textContent).toContain('Медвежий пробой');
    expect(root.textContent).toContain('Настроение рынка на основе биткоина');
    expect(root.textContent).toContain('Настроение risk-off');
    expect(root.textContent).toContain('Источник: Alternative.me');
    expect(root.textContent).not.toContain('2026-08-09');
  });

  it('renders local fallback factors without an analysis payload', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    delete (content as Partial<typeof content>).analysis;
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.querySelectorAll('ol li')).toHaveLength(3);
    expect(root.textContent).toContain('Calculated analysis: the model explanation is temporarily unavailable.');
    expect(root.textContent).toContain('Price remains balanced between confirmed support and resistance.');
    expect(root.textContent).toContain('Timeframe structure — 1D:');
    expect(root.textContent).toContain('Current regime: Range balance. Conditional scenario: Bearish breakdown');
    expect(root.textContent).toContain('Price inside the value area');
    expect(root.textContent).not.toContain('Part of the market evidence is unavailable');
  });

  it('does not invent an active scenario for a historical V6 payload', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    delete content.evidence.scenarioTrees['7d'].activeScenario;
    delete (content as Partial<typeof content>).analysis;
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('No scenario is currently confirmed.');
    expect(root.textContent).toContain(
      'No scenario is confirmed; wait for a structural boundary close before adopting a directional case.',
    );
    expect(root.textContent).toContain('Conditional scenario');
    expect(root.textContent).toContain('Bearish breakdown');
  });

  it('merges overlapping support and POC presentation zones while preserving scenario labels', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    const map = content.evidence.levelMaps['7d'];
    if (map.status !== 'available' || !map.equilibrium) throw new Error('Expected available map fixture');
    map.supports.push({
      ...map.supports[0],
      id: 'level.7d.support.overlap',
      lower: '1790.00000000',
      upper: '1810.00000000',
    });
    map.equilibrium.lower = '1930.00000000';
    map.equilibrium.upper = '1950.00000000';
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    const levelSection = [...root.querySelectorAll('section')].find((section) => (
      section.querySelector('h3')?.textContent?.startsWith('Key levels')
    ));
    expect(levelSection?.textContent).toContain('1,780–1,810');
    expect(levelSection?.textContent).toContain('1,920–1,950');
    expect(levelSection?.textContent).not.toContain('POC1,930');
    expect(root.textContent).toContain('R1');
  });

  it('keeps historical V5 analysis on the compact summary renderer', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'market', schemaVersion: 1, view: 'analysis', outcome: 'complete',
      evidence: {
        schemaVersion: 5,
        technicalEvidence: {} as never,
        structures: [],
        levelMaps: { '3d': {}, '7d': {}, '30d': {} },
        expectedMoves: { '3d': {}, '7d': {}, '30d': {} },
        scenarioTrees: { '3d': {}, '7d': {}, '30d': {} },
        evidenceCatalog: [],
        coverage: {
          structureTimeframeCount: 0, availableLevelMapCount: 0, eligibleScenarioCount: 0, complete: false,
        },
      },
      analysis: {
        schemaVersion: 4,
        consideredEvidence: [],
        summary: 'Historical structural summary',
        summaryEvidence: [],
        timeframeViews: [],
        factors: [],
        materialRisk: { text: 'Historical risk', evidence: [] },
        horizons: {
          '3d': EMPTY_MARKET_HORIZON,
          '7d': EMPTY_MARKET_HORIZON,
          '30d': EMPTY_MARKET_HORIZON,
        },
      },
    };
    TeactDOM.render(<AgentV2SemanticContent content={content} />, root);
    await pause(20);

    expect(root.textContent).toContain('Historical structural summary');
    expect(root.textContent).not.toContain('Primary scenario');
  });
});

function contents(): AgentV2RichSemanticContent[] {
  return [
    {
      kind: 'walletQuery', schemaVersion: 1, queryKind: 'transactions', outcome: 'complete', hasMore: false,
      rows: [{
        chain: 'ton', transactionType: 'transfer', status: 'completed', timestamp: '2026-08-06T12:00:00.000Z',
        assetSymbol: 'TON', quantity: '1.5',
      }],
    },
    {
      kind: 'portfolio', schemaVersion: 1, view: 'positions', outcome: 'complete',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'complete', accountScope: 'current', baseCurrency: 'USD',
        generatedAt: '2026-08-06T12:00:00.000Z', positions: [], unpriced: [],
        omittedUnpricedAssetCount: 0, dataQuality: { coverage: 'complete', limitations: [] },
      },
    },
    {
      kind: 'market', schemaVersion: 1, view: 'overview', outcome: 'partial',
      evidence: {
        assets: [{
          asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
          quote: { price: '3.25', quoteCurrency: 'USDT' },
          change: { percent: '1.5' },
        }],
      } as never,
      narrativeMarkdown: 'Market summary',
    },
    {
      kind: 'assetSearch', schemaVersion: 1, outcome: 'ambiguous',
      candidates: [
        { slug: 'toncoin', chain: 'ton', symbol: 'TON' },
        { slug: 'wrapped-ton', chain: 'ton', symbol: 'WTON' },
      ],
    },
  ];
}

function fearGreedRegime(
  regime: AgentMarketFearGreedRegimeV1['regime'],
): AgentMarketFearGreedRegimeV1 {
  return {
    schemaVersion: 1,
    policyVersion: 'fear-greed-sma-regime-v1',
    basis: 'closed_utc_daily',
    asOfDate: '2026-08-09',
    latestValue: 63,
    sma30: '58.25000000',
    sma365: '51.50000000',
    regime,
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
