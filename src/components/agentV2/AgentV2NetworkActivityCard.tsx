import React, { memo } from '../../lib/teact/teact';

import type { AgentNetworkActivityContentPayloadV1 } from '../../api/agentV2/protocol/types';

import buildClassName from '../../util/buildClassName';
import { formatCurrency } from '../../util/formatNumber';
import getChainNetworkName from '../../util/swap/getChainNetworkName';
import { getAgentV2SemanticRowText } from './agentV2Copy';
import { getPortfolioPositionLabels } from './agentV2PortfolioPositionLabels';

import useLang from '../../hooks/useLang';

import styles from './AgentV2PortfolioCards.module.scss';

function AgentV2NetworkActivityCard({ payload }: { payload: AgentNetworkActivityContentPayloadV1 }) {
  const lang = useLang();
  const labels = getPortfolioPositionLabels(lang.code);
  const chain = getChainNetworkName(payload.chain);
  const title = labels.history(chain);
  const rows = payload.rows.slice(0, 10);
  return (
    <section className={styles.card} aria-label={title}>
      <strong className={styles.title}>{title}</strong>
      {payload.rows.length === 0
        ? <p className={styles.notice}>{labels.noActivity}</p>
        : (
          <div className={styles.rows}>
            {rows.map((row, index) => (
              <div
                key={`${row.timestamp}:${index}`}
                className={buildClassName(styles.row, index === rows.length - 1 && styles.lastRow)}
              >
                <span className={styles.asset}>
                  <strong>{row.asset?.symbol ?? getAgentV2SemanticRowText(row.kind, lang)}</strong>
                  <small className={styles.assetDescription}>
                    {row.safeDescription ?? new Date(row.timestamp).toLocaleString(lang.code)}
                  </small>
                </span>
                {row.amount && (
                  <span className={styles.amount}>
                    {formatCurrency(row.amount.value, row.amount.symbol, row.amount.decimals)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      {payload.status === 'partial' && (
        <p className={styles.notice}>{labels.partial}</p>
      )}
    </section>
  );
}

export default memo(AgentV2NetworkActivityCard);
