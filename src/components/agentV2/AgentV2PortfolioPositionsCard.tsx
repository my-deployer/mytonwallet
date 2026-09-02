import React, { memo } from '../../lib/teact/teact';

import type { AgentPortfolioPositionsContentPayloadV1 } from '../../api/agentV2/protocol/types';
import type { ApiBaseCurrency } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { formatCurrency, getShortCurrencySymbol } from '../../util/formatNumber';
import getChainNetworkName from '../../util/swap/getChainNetworkName';
import { getPortfolioPositionLabels } from './agentV2PortfolioPositionLabels';

import useLang from '../../hooks/useLang';

import styles from './AgentV2PortfolioCards.module.scss';

function AgentV2PortfolioPositionsCard({ payload }: { payload: AgentPortfolioPositionsContentPayloadV1 }) {
  const lang = useLang();
  const labels = getPortfolioPositionLabels(lang.code);
  const positions = payload.positions.slice(0, 5);
  const unpricedPositions = payload.unpriced.slice(0, 3);
  return (
    <section className={styles.card} aria-label={labels.title}>
      <strong className={styles.title}>{labels.title}</strong>
      <div className={styles.rows}>
        {positions.map((position, index) => (
          <div
            key={position.assetRef}
            className={buildClassName(styles.row, index === positions.length - 1 && styles.lastRow)}
          >
            <span className={styles.asset}>
              <strong>{position.asset.symbol}</strong>
              <small className={styles.assetDescription}>{getChainNetworkName(position.asset.chain)}</small>
            </span>
            <span className={styles.amount}>
              {formatCurrency(
                position.amount.value,
                getShortCurrencySymbol(position.amount.currency as ApiBaseCurrency),
              )}
            </span>
          </div>
        ))}
      </div>
      {payload.unpriced.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{labels.unpriced}</h3>
          {unpricedPositions.map((position, index) => (
            <div
              key={position.assetRef}
              className={buildClassName(
                styles.row,
                index === unpricedPositions.length - 1
                && payload.omittedUnpricedAssetCount === 0
                && styles.lastRow,
              )}
            >
              <span className={styles.asset}>
                <strong>{position.asset.symbol}</strong>
                <small className={styles.assetDescription}>{getChainNetworkName(position.asset.chain)}</small>
              </span>
              <span className={styles.unpriced}>{labels.unpricedValue}</span>
            </div>
          ))}
          {payload.omittedUnpricedAssetCount > 0 && (
            <p className={styles.more}>{labels.more(payload.omittedUnpricedAssetCount)}</p>
          )}
        </section>
      )}
      {payload.dataQuality.coverage === 'partial' && (
        <p className={styles.notice}>{labels.partial}</p>
      )}
    </section>
  );
}

export default memo(AgentV2PortfolioPositionsCard);
