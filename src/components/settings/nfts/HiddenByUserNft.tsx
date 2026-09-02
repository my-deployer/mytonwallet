import { memo } from '../../../lib/teact/teact';
import React from '../../../lib/teact/teactn';
import { getActions } from '../../../global';

import { type ApiNft } from '../../../api/types';
import { type AppTheme, MediaType } from '../../../global/types';

import { stopEvent } from '../../../util/domEvents';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useShowTransition from '../../../hooks/useShowTransition';

import Button from '../../ui/Button';
import Image from '../../ui/Image';

import styles from '../Settings.module.scss';

import noImageSrcDark from '../../../assets/nftNoImageDark.svg';
import noImageSrcLight from '../../../assets/nftNoImageLight.svg';

interface OwnProps {
  nft: ApiNft;
  appTheme: AppTheme;
  style?: string;
}

function HiddenByUserNft({ nft, appTheme, style }: OwnProps) {
  const { openMediaViewer, removeNftSpecialStatus } = getActions();
  const lang = useLang();

  const [isNftHidden, , unmarkNftHidden] = useFlag(true);
  const [isImageBroken, markImageBroken] = useFlag();

  const handleUnhide = useLastCallback(() => {
    removeNftSpecialStatus({ address: nft.address });
  });

  const { ref } = useShowTransition({
    isOpen: isNftHidden,
    onCloseAnimationEnd: handleUnhide,
  });

  function handleNftClick() {
    openMediaViewer({
      mediaId: nft.address, mediaType: MediaType.Nft, hiddenNfts: 'user',
    });
  }

  // The unhide button inside the row is focusable on its own, and its own Space press must not open the viewer
  const handleNftKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.code !== 'Enter' && e.code !== 'Space') || e.target !== e.currentTarget) return;

    stopEvent(e);
    handleNftClick();
  });

  return (
    <div
      ref={ref}
      className={styles.item}
      style={style}
      onClick={handleNftClick}
      onKeyDown={handleNftKeyDown}
      key={nft.address}
      role="button"
      tabIndex={0}
      data-nft-address={nft.address}
    >
      {/* The static wrapper keeps the grid cell in place while the inner image is hidden during loading */}
      <div className={styles.nftImage}>
        {nft.thumbnail && !isImageBroken ? (
          <Image
            url={nft.thumbnail}
            className={styles.nftImageFill}
            imageClassName={styles.nftImageContent}
            onError={markImageBroken}
          />
        ) : (
          <div className={styles.nftImageNoData}>
            <img
              src={appTheme === 'dark' ? noImageSrcDark : noImageSrcLight}
              alt=""
              className={styles.nftNoImageIcon}
            />
          </div>
        )}
      </div>
      <div className={styles.nftPrimaryCell}>
        <span className={styles.nftName}>{nft.name || lang('Untitled')}</span>
        {
          nft.collectionName && <span className={styles.nftCollection}>{nft.collectionName}</span>
        }
      </div>

      <Button
        isSmall
        isPrimary
        isText
        className={styles.nftButtonUnhide}
        onClick={unmarkNftHidden}
        shouldStopPropagation
      >
        {lang('Unhide')}
      </Button>
    </div>
  );
}

export default memo(HiddenByUserNft);
