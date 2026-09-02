import React, { memo, useMemo, useState } from '../../lib/teact/teact';

import type {
  AgentAssetSearchContentV1,
  AgentMarketContentV1,
  AgentPortfolioContentV1,
  AgentSemanticContentV1,
  AgentWalletQueryContentV1,
} from '../../api/agentV2/protocol/types';
import type { ApiBaseCurrency } from '../../api/types';
import type { LangFn } from '../../util/langProvider';

import buildClassName from '../../util/buildClassName';
import { formatCurrency, getShortCurrencySymbol } from '../../util/formatNumber';
import renderMarkdown, { renderDeterministicMarkdownTable } from '../../util/renderMarkdown';
import getChainNetworkName from '../../util/swap/getChainNetworkName';
import { getAgentV2SemanticRowText } from './agentV2Copy';

import useLang from '../../hooks/useLang';

import AgentV2MarketAnalysisCard from './AgentV2MarketAnalysisCard';
import AgentV2NetworkActivityCard from './AgentV2NetworkActivityCard';
import AgentV2PortfolioPositionsCard from './AgentV2PortfolioPositionsCard';

import styles from './AgentV2SemanticContent.module.scss';

const WALLET_QUERY_PAGE_SIZE = 10;

export type AgentV2RichSemanticContent = Exclude<AgentSemanticContentV1, { kind: 'notice' | 'webDigest' }>;

interface OwnProps {
  content: AgentV2RichSemanticContent;
}

function AgentV2SemanticContent({ content }: OwnProps) {
  const lang = useLang();

  switch (content.kind) {
    case 'walletQuery':
      return <WalletQueryContent content={content} />;
    case 'portfolio':
      return <PortfolioContent content={content} />;
    case 'market':
      return <MarketContent content={content} />;
    case 'assetSearch':
      return <AssetSearchContent content={content} />;
    case 'clientUnsupported':
      return <section className={styles.card}>{lang('$agent_semantic_update_required')}</section>;
    default:
      return assertUnreachable(content);
  }
}

function WalletQueryContent({ content }: { content: AgentWalletQueryContentV1 }) {
  const lang = useLang();
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(content.rows.length / WALLET_QUERY_PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  if (content.queryKind === 'accounts') {
    return (
      <WalletAccountsContent
        content={content}
        currentPageIndex={currentPageIndex}
        pageCount={pageCount}
        setPageIndex={setPageIndex}
      />
    );
  }
  const visibleRows = content.rows.slice(
    currentPageIndex * WALLET_QUERY_PAGE_SIZE,
    (currentPageIndex + 1) * WALLET_QUERY_PAGE_SIZE,
  );
  const isQuarantine = content.policySummary?.presentation === 'quarantine';
  const isHiddenReview = content.policySummary?.presentation === 'hidden_review';
  const title = isHiddenReview
    ? lang('$agent_semantic_hidden_assets')
    : isQuarantine
      ? lang(content.queryKind === 'transactions'
        ? '$agent_semantic_spam_transactions'
        : '$agent_semantic_spam_assets')
      : lang(content.queryKind === 'transactions'
        ? '$agent_semantic_transactions'
        : '$agent_semantic_positions');
  const policyCounters = [
    content.policySummary?.omittedSpam
      ? formatPolicyCounter(content.policySummary.omittedSpam, lang,
        '$agent_semantic_omitted_spam', '$agent_semantic_omitted_spam_minimum')
      : undefined,
    content.policySummary?.omittedHidden
      ? formatPolicyCounter(content.policySummary.omittedHidden, lang,
        '$agent_semantic_omitted_hidden', '$agent_semantic_omitted_hidden_minimum')
      : undefined,
    content.policySummary?.suspicious
      ? formatPolicyCounter(content.policySummary.suspicious, lang,
        isHiddenReview ? '$agent_semantic_suspicious_shown' : '$agent_semantic_suspicious',
        isHiddenReview ? '$agent_semantic_suspicious_shown_minimum' : '$agent_semantic_suspicious_minimum')
      : undefined,
  ].filter(Boolean);

  return (
    <section className={`${styles.card} ${isQuarantine || isHiddenReview ? styles.quarantine : ''}`}>
      <strong>{title}</strong>
      {isQuarantine && (
        <p className={buildClassName(styles.paragraph, styles.quarantineWarning)}>
          {lang('$agent_semantic_quarantine_warning')}
        </p>
      )}
      {isHiddenReview && (
        <p className={buildClassName(styles.paragraph, styles.quarantineWarning)}>
          {lang('$agent_semantic_hidden_assets_warning')}
        </p>
      )}
      {content.rows.length ? (
        <div className={styles.tableScroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.tableCell} scope="col">
                  {content.queryKind === 'transactions'
                    ? lang('$agent_semantic_time')
                    : lang('$agent_portfolio_asset')}
                </th>
                <th className={styles.tableCell} scope="col">{lang('$agent_semantic_status')}</th>
                <th className={styles.tableCell} scope="col">{lang('$agent_semantic_quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const assetLabel = row.assetLabelStatus === 'redacted_unsafe'
                  ? lang('$agent_semantic_redacted_asset')
                  : formatAssetLabel('positionKind' in row ? row.assetName : undefined, row.assetSymbol);
                const statusLabel = row.status
                  ? getAgentV2SemanticRowText(row.status, lang)
                  : 'positionKind' in row ? getAgentV2SemanticRowText(row.positionKind, lang) : '—';
                return (
                  <tr key={'timestamp' in row ? `${row.timestamp}:${index}` : `${row.chain}:${index}`}>
                    <td
                      className={buildClassName(
                        styles.tableCell,
                        row.assetLabelStatus === 'untrusted_plaintext' && styles.untrustedLabel,
                      )}
                    >
                      {'timestamp' in row
                        ? new Date(row.timestamp).toLocaleString(lang.code)
                        : assetLabel ?? getAgentV2SemanticRowText(row.positionKind, lang)}
                    </td>
                    <td className={styles.tableCell}>{isHiddenReview && 'positionKind' in row
                      ? `${getChainNetworkName(row.chain)} · ${statusLabel}`
                      : statusLabel}
                    </td>
                    <td className={styles.tableCell}>{'timestamp' in row && row.quantity && assetLabel
                      ? `${row.quantity} ${assetLabel}`
                      : row.quantity ?? assetLabel ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.paragraph}>{lang('$agent_semantic_no_results')}</p>}
      <WalletQueryPagination
        currentPageIndex={currentPageIndex}
        pageCount={pageCount}
        setPageIndex={setPageIndex}
      />
      {content.omittedRows && (
        <p className={buildClassName(styles.paragraph, styles.truncationNotice)}>
          {formatPolicyCounter(
            content.omittedRows,
            lang,
            '$agent_semantic_omitted_rows',
            '$agent_semantic_omitted_rows_minimum',
          )}
        </p>
      )}
      {policyCounters.length > 0 && (
        <div
          className={buildClassName(
            styles.policySummary,
            content.rows.length > 0 && !content.omittedRows && styles.policySummaryAfterTable,
          )}
        >
          {policyCounters.map((counter, index) => (
            <p key={index} className={styles.paragraph}>{counter}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function WalletAccountsContent({
  content,
  currentPageIndex,
  pageCount,
  setPageIndex,
}: {
  content: Extract<AgentWalletQueryContentV1, { queryKind: 'accounts' }>;
  currentPageIndex: number;
  pageCount: number;
  setPageIndex: (index: number) => void;
}) {
  const lang = useLang();
  const markdown = useMemo(
    () => buildWalletAccountsMarkdown(content, currentPageIndex, lang),
    [content, currentPageIndex, lang],
  );
  const html = useMemo(() => (
    markdown ? renderDeterministicMarkdownTable(markdown).html : ''
  ), [markdown]);
  const unpricedCount = content.rows.reduce((sum, row) => (
    sum + (row.portfolioTotal?.unpricedCount ?? 0)
  ), 0);
  const hasUnavailable = content.rows.some(({ portfolioTotalStatus }) => (
    portfolioTotalStatus === 'unavailable'
  ));

  return (
    <section className={styles.card}>
      <strong>{lang('$agent_semantic_wallets')}</strong>
      {html ? (
        <div
          className={styles.markdownTable}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : <p className={styles.paragraph}>{lang('$agent_semantic_no_results')}</p>}
      <WalletQueryPagination
        currentPageIndex={currentPageIndex}
        pageCount={pageCount}
        setPageIndex={setPageIndex}
      />
      {unpricedCount > 0 && (
        <p className={buildClassName(styles.paragraph, styles.notice)}>
          {lang('$agent_semantic_wallets_unpriced', { amount: unpricedCount })}
        </p>
      )}
      {hasUnavailable && (
        <p className={buildClassName(styles.paragraph, styles.notice)}>
          {lang('$agent_semantic_wallets_unavailable')}
        </p>
      )}
    </section>
  );
}

function WalletQueryPagination({
  currentPageIndex,
  pageCount,
  setPageIndex,
}: {
  currentPageIndex: number;
  pageCount: number;
  setPageIndex: (index: number) => void;
}) {
  const lang = useLang();
  if (pageCount <= 1) return undefined;

  return (
    <nav className={styles.pagination} aria-label={lang('$agent_wallet_page_navigation')}>
      <button
        type="button"
        className={buildClassName(styles.paginationButton, styles.paginationButtonPrevious)}
        disabled={currentPageIndex === 0}
        onClick={() => setPageIndex(currentPageIndex - 1)}
      >
        {lang('$agent_wallet_page_previous')}
      </button>
      <span className={styles.paginationStatus}>
        {lang('$agent_wallet_page_indicator', { current: currentPageIndex + 1, total: pageCount })}
      </span>
      <button
        type="button"
        className={buildClassName(styles.paginationButton, styles.paginationButtonNext)}
        disabled={currentPageIndex === pageCount - 1}
        onClick={() => setPageIndex(currentPageIndex + 1)}
      >
        {lang('$agent_wallet_page_next')}
      </button>
    </nav>
  );
}

function buildWalletAccountsMarkdown(
  content: Extract<AgentWalletQueryContentV1, { queryKind: 'accounts' }>,
  currentPageIndex: number,
  lang: LangFn,
) {
  if (!content.rows.length) return '';
  const header = [
    lang('$agent_semantic_wallet'),
    lang('$agent_semantic_balance'),
    lang('$agent_semantic_status'),
  ];
  const visibleRows = content.rows.slice(
    currentPageIndex * WALLET_QUERY_PAGE_SIZE,
    (currentPageIndex + 1) * WALLET_QUERY_PAGE_SIZE,
  );
  const rows = visibleRows.map((row) => [
    row.accountLabel,
    row.portfolioTotal
      ? formatCurrency(
        row.portfolioTotal.value,
        getShortCurrencySymbol(row.portfolioTotal.baseCurrency as ApiBaseCurrency),
      )
      : lang('$agent_semantic_balance_unavailable'),
    lang(row.accessMode === 'view_only'
      ? '$agent_semantic_access_view_only'
      : '$agent_semantic_access_regular'),
  ]);
  return [
    markdownTableRow(header),
    '| --- | --- | --- |',
    ...rows.map(markdownTableRow),
  ].join('\n');
}

function markdownTableRow(cells: string[]) {
  return `| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\\/gu, '\\\\')
    .replace(/([|`*_{}()#+.!<>~-])/gu, '\\$1')
    .replace(/\[/gu, '\\[')
    .replace(/\]/gu, '\\]');
}

function formatAssetLabel(name?: string, symbol?: string) {
  if (!name) return symbol;
  if (!symbol || name.toLocaleLowerCase() === symbol.toLocaleLowerCase()) return name;
  return `${name} (${symbol})`;
}

function formatPolicyCounter(
  counter: { count: number; accuracy: 'exact' | 'lower_bound' },
  lang: LangFn,
  exactKey: string,
  lowerBoundKey: string,
) {
  return lang(counter.accuracy === 'exact' ? exactKey : lowerBoundKey, { amount: counter.count });
}

function PortfolioContent({ content }: { content: AgentPortfolioContentV1 }) {
  const lang = useLang();
  if (content.view === 'positions') return <AgentV2PortfolioPositionsCard payload={content.payload} />;
  if (content.view === 'networkActivity') return <AgentV2NetworkActivityCard payload={content.payload} />;

  const total = content.payload.totalValue;
  const change = content.payload.rangeChange;
  return (
    <section className={styles.card} aria-label={lang('$agent_portfolio_analysis')}>
      <strong>{lang('$agent_portfolio_analysis')}</strong>
      <p className={buildClassName(styles.paragraph, styles.metric)}>
        {lang('$agent_portfolio_value_is')}{' '}
        <b>{formatCurrency(total.value, getShortCurrencySymbol(total.currency as ApiBaseCurrency))}</b>
      </p>
      {change?.percent && (
        <p className={buildClassName(styles.paragraph, styles.metric)}>
          {lang('$agent_portfolio_24h_change')}: {formatPercent(change.percent, lang.code ?? 'en')}
        </p>
      )}
      {content.payload.topPositions?.length ? (
        <ul className={styles.list}>
          {content.payload.topPositions.map((position) => (
            <li key={`${position.asset.chain}:${position.asset.slug}`} className={styles.listRow}>
              <span>{position.asset.symbol}</span>
              <b>{formatCurrency(position.value, getShortCurrencySymbol(position.currency as ApiBaseCurrency))}</b>
            </li>
          ))}
        </ul>
      ) : undefined}
      {content.outcome !== 'complete' && (
        <p className={buildClassName(styles.paragraph, styles.notice)}>{lang('$agent_portfolio_partial')}</p>
      )}
    </section>
  );
}

function MarketContent({ content }: { content: AgentMarketContentV1 }) {
  const lang = useLang();
  if (content.view === 'analysis' && content.evidence.schemaVersion === 6) {
    return (
      <AgentV2MarketAnalysisCard
        evidence={content.evidence}
        analysis={content.analysis}
        fearGreedRegime={content.fearGreedRegime}
        className={styles.card}
      />
    );
  }
  const source = content.view === 'analysis' ? content.analysis?.summary : content.narrativeMarkdown;
  const html = useMemo(() => source ? renderMarkdown(source, {
    areLinksEnabled: false,
    profile: 'agentV2',
  }).html : '', [source]);
  return (
    <section className={styles.card}>
      <strong>{lang('$agent_semantic_market')}</strong>
      {content.view === 'overview' && (
        <ul className={styles.list}>
          {content.evidence.assets.map(({ asset, quote, change }) => (
            <li key={`${asset.chain}:${asset.slug}`} className={styles.listRow}>
              <span>{asset.symbol} · {formatCurrency(quote.price, quote.quoteCurrency)}</span>
              <b>{formatPercent(change.percent, lang.code ?? 'en')}</b>
            </li>
          ))}
        </ul>
      )}
      {html && <p className={styles.paragraph} dangerouslySetInnerHTML={{ __html: html }} />}
      {content.outcome === 'partial' && (
        <p className={buildClassName(styles.paragraph, styles.notice)}>{lang('$agent_semantic_partial')}</p>
      )}
    </section>
  );
}

function AssetSearchContent({ content }: { content: AgentAssetSearchContentV1 }) {
  const lang = useLang();
  const assets = content.outcome === 'ambiguous' ? content.candidates
    : content.outcome === 'complete_matches' || content.outcome === 'partial_matches' ? [content.asset] : [];
  const status = content.outcome === 'complete_absent'
    ? lang('$agent_semantic_no_results')
    : content.outcome === 'incomplete_unconfirmed'
      ? lang('$agent_notice_wallet_unavailable')
      : content.outcome === 'scope_denied'
        ? lang(content.reason === 'consent_required'
          ? '$agent_notice_consent_required'
          : '$agent_notice_tool_unavailable')
        : undefined;
  return (
    <section className={styles.card}>
      <strong>{lang('$agent_semantic_asset_search')}</strong>
      {assets.length > 0 && (
        <ul className={styles.list}>
          {assets.map((asset) => (
            <li key={`${asset.chain}:${asset.slug}`} className={styles.listRow}>
              <span>{asset.name ?? asset.symbol}</span>
              <b>{asset.symbol}</b>
            </li>
          ))}
        </ul>
      )}
      {status && <p className={styles.paragraph}>{status}</p>}
      {'holdings' in content && content.holdings.map((holding) => (
        <p key={holding.accountLabel} className={styles.paragraph}>{holding.accountLabel}</p>
      ))}
    </section>
  );
}

function assertUnreachable(value: never): never {
  throw new Error('Unsupported Agent semantic content');
}

function formatPercent(value: string, locale: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(numericValue) + '%'
    : `${value}%`;
}

export default memo(AgentV2SemanticContent);
