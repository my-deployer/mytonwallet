import React, { memo, useMemo, useRef } from '../../../lib/teact/teact';

import type { ApiNft } from '../../../api/types';
import type { LoadMoreDirection } from '../../../global/types';

import buildClassName from '../../../util/buildClassName';
import { buildCollectionByKey } from '../../../util/iteratees';
import { REM } from '../../../util/windowEnvironment';

import useInfiniteScroll from '../../../hooks/useInfiniteScroll';
import useLastCallback from '../../../hooks/useLastCallback';
import useUniqueId from '../../../hooks/useUniqueId';

import InfiniteScroll from '../../ui/InfiniteScroll';

import styles from '../Settings.module.scss';

interface OwnProps {
  nfts: ApiNft[];
  isActive?: boolean;
  /** Must set the given `style` on the row root - it positions the row inside the virtualized list */
  renderNft: (nft: ApiNft, style: string) => TeactJsx;
}

const LIST_SLICE = 30;
// Keep in sync with the actual `.item` height: 0.625rem paddings around the 2.625rem image
const ROW_HEIGHT_REM = 3.875;
const SCROLL_CONTAINER_SELECTOR = '.custom-scroll';

function HiddenNftList({ nfts, isActive, renderNft }: OwnProps) {
  const containerRef = useRef<HTMLDivElement>();
  const uniqueId = useUniqueId();
  const addresses = useMemo(() => nfts.map(({ address }) => address), [nfts]);
  const nftByAddress = useMemo(() => buildCollectionByKey(nfts, 'address'), [nfts]);

  const [viewportAddresses, getMore] = useInfiniteScroll({
    listIds: addresses,
    isActive,
    listSlice: LIST_SLICE,
  });

  const viewportIndex = viewportAddresses?.length ? addresses.indexOf(viewportAddresses[0]) : 0;

  // Re-center the viewport slice around the current scroll position in a single hop instead of
  // shifting by `LIST_SLICE` per cycle - a fast-scroll jump would otherwise show a long blank gap
  const handleGetMore = useLastCallback((args: { direction: LoadMoreDirection }) => {
    if (!getMore || !addresses.length) return;

    const container = containerRef.current;
    const host = container?.closest<HTMLDivElement>(SCROLL_CONTAINER_SELECTOR);
    if (!container || !host) {
      getMore(args);
      return;
    }

    const listTop = container.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    const visibleCenterPx = host.scrollTop + host.offsetHeight / 2 - listTop;
    const targetIndex = Math.max(0, Math.min(
      addresses.length - 1,
      Math.floor(visibleCenterPx / (ROW_HEIGHT_REM * REM)),
    ));
    getMore({ direction: args.direction, offsetId: addresses[targetIndex] });
  });

  return (
    <InfiniteScroll
      ref={containerRef}
      withAbsolutePositioning
      className={buildClassName(styles.virtualizedBlock, `hidden-nft-list-${uniqueId}`)}
      maxHeight={`${nfts.length * ROW_HEIGHT_REM}rem`}
      items={viewportAddresses}
      itemSelector={`.hidden-nft-list-${uniqueId} .${styles.item}`}
      preloadBackwards={LIST_SLICE}
      scrollContainerClosest={SCROLL_CONTAINER_SELECTOR}
      onLoadMore={handleGetMore}
    >
      {viewportAddresses?.map((address, index) => renderNft(
        nftByAddress[address],
        `top: ${(viewportIndex + index) * ROW_HEIGHT_REM}rem;`,
      ))}
    </InfiniteScroll>
  );
}

export default memo(HiddenNftList);
