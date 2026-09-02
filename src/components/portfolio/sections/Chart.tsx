import React, { memo } from '../../../lib/teact/teact';

import type { ChartData } from '../helpers/graphKitAdapter';

import buildClassName from '../../../util/buildClassName';
import { SWIPE_DISABLED_CLASS_NAME } from '../../../util/swipeController';
import useLovelyChart from '../helpers/useLovelyChart';

import useShowTransition from '../../../hooks/useShowTransition';

import ChartSkeleton from './ChartSkeleton';
import SectionHeader from './SectionHeader';

import styles from './Chart.module.scss';

const ZOOMED_CLASS = 'portfolio-chart-card-zoomed';

interface OwnProps {
  title: string;
  dateRange?: string;
  data?: ChartData;
  cardClassName?: string;
  noAnimation?: boolean;
}

function Chart({
  title, dateRange, data, cardClassName, noAnimation,
}: OwnProps) {
  const isZoomable = Boolean(data?.params.isPercentage);
  const { containerRef, isReady, isZoomed } = useLovelyChart(data?.params, isZoomable);
  const { ref: skeletonRef, shouldRender: shouldRenderSkeleton } = useShowTransition({
    isOpen: !isReady,
    withShouldRender: true,
    className: 'slow',
    noMountTransition: true,
    noCloseTransition: noAnimation,
  });

  return (
    <section
      className={buildClassName(
        styles.root,
        'portfolio-chart-card',
        cardClassName,
        SWIPE_DISABLED_CLASS_NAME,
        isZoomed && ZOOMED_CLASS,
      )}
    >
      <SectionHeader title={title} range={dateRange} />

      <div className={styles.card}>
        <div ref={containerRef} className={styles.chartContainer} data-stricterdom-ignore />

        {shouldRenderSkeleton && (
          <div ref={skeletonRef} className={styles.skeletonLayer}>
            <ChartSkeleton />
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(Chart);
