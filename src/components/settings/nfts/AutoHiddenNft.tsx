import { memo } from '../../../lib/teact/teact';
import React from '../../../lib/teact/teactn';
import { getActions } from '../../../global';

import { type ApiNft } from '../../../api/types';
import { type AppTheme, type HiddenNftsSection, MediaType } from '../../../global/types';

import { stopEvent } from '../../../util/domEvents';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Image from '../../ui/Image';
import Switcher from '../../ui/Switcher';

import styles from '../Settings.module.scss';

import noImageSrcDark from '../../../assets/nftNoImageDark.svg';
import noImageSrcLight from '../../../assets/nftNoImageLight.svg';

interface OwnProps {
  nft: ApiNft;
  appTheme: AppTheme;
  section: HiddenNftsSection;
  isWhitelisted?: boolean;
  shouldConfirmUnhide?: boolean;
  style?: string;
}

function AutoHiddenNft({
  nft, appTheme, section, isWhitelisted, shouldConfirmUnhide, style,
}: OwnProps) {
  const {
    openMediaViewer, removeNftSpecialStatus, openUnhideNftModal, addNftsToWhitelist,
  } = getActions();
  const lang = useLang();
  const [isImageBroken, markImageBroken] = useFlag();

  const handleNftClick = useLastCallback(() => {
    openMediaViewer({
      mediaId: nft.address, mediaType: MediaType.Nft, hiddenNfts: section,
    });
  });

  // The switcher inside the row is focusable on its own, and its own Space press must not open the viewer
  const handleNftKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.code !== 'Enter' && e.code !== 'Space') || e.target !== e.currentTarget) return;

    stopEvent(e);
    handleNftClick();
  });

  const handleSwitcherClick = useLastCallback((e: React.ChangeEvent) => {
    e.stopPropagation();
    if (isWhitelisted) {
      removeNftSpecialStatus({ address: nft.address });
    } else if (shouldConfirmUnhide) {
      openUnhideNftModal({ address: nft.address, name: nft.name! });
    } else {
      addNftsToWhitelist({ addresses: [nft.address] });
    }
  });

  return (
    <div
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
        <span className={styles.nftName}>{nft.name}</span>
        {nft.collectionName && <span className={styles.nftCollection}>{nft.collectionName}</span>}
      </div>

      <Switcher
        className={styles.menuSwitcher}
        label={lang('Show')}
        checked={isWhitelisted}
        onChange={handleSwitcherClick}
        shouldStopPropagation
      />
    </div>
  );
}

export default memo(AutoHiddenNft);
