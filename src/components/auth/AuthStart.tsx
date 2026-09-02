import React, { memo, useLayoutEffect, useRef, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import { type Theme } from '../../global/types';

import {
  APP_INSTALL_URL, APP_NAME, IS_EXPLORER, IS_GRAM_WALLET, NEW_APP_URL,
  PRODUCTION_URL,
} from '../../config';
import renderText from '../../global/helpers/renderText';
import { selectCurrentAccountId } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { stopEvent } from '../../util/domEvents';
import { PARTICLE_BURST_PARAMS, type ParticleConfig, setupParticles } from '../../util/particles';
import {
  IS_LEGACY_APP_HOST, IS_NEW_WALLET_CREATION_HIDDEN, REM,
} from '../../util/windowEnvironment';

import useAppTheme from '../../hooks/useAppTheme';
import { useDeviceScreen } from '../../hooks/useDeviceScreen';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useMediaTransition from '../../hooks/useMediaTransition';
import { CLOSE_DURATION } from '../../hooks/useShowTransition';
import useTimeout from '../../hooks/useTimeout';

import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import { PARTICLE_HEIGHT, PARTICLE_LANDSCAPE_HEIGHT } from '../ui/ImageWithParticles';

import styles from './Auth.module.scss';

import logoWebpPath from '../../assets/logo.webp';
import gramWalletLogoPath from '../../assets/logoGramWallet.svg';

interface OwnProps {
  isActive?: boolean;
}

interface StateProps {
  hasAccounts?: boolean;
  isLoading?: boolean;
  theme: Theme;
}

const PARTICLE_PARAMS: Partial<ParticleConfig> = {
  width: 20.125 * REM,
  height: 12.75 * REM,
  particleCount: 35,
  centerShift: [0, 22] as const,
  distanceLimit: 0.75,
};

const PARTICLE_COLORS_LIGHT = [44 / 255, 146 / 255, 240 / 255] as [number, number, number]; // #2C92F0
const PARTICLE_COLORS_DARK = [70 / 255, 156 / 255, 236 / 255] as [number, number, number]; // #469CEC

const NEW_DOMAIN = new URL(PRODUCTION_URL).hostname;

function AuthStart({
  isActive,
  hasAccounts,
  isLoading,
  theme,
}: OwnProps & StateProps) {
  const {
    startCreatingWallet,
    openAbout,
    resetAuth,
    openAuthImportWalletModal,
    openDisclaimer,
  } = getActions();

  const lang = useLang();
  const canvasRef = useRef<HTMLCanvasElement>();
  const { isLandscape } = useDeviceScreen();
  const appTheme = useAppTheme(theme);
  const [isLogoReady, markLogoReady] = useFlag();
  const [isLogoAnimated, markLogoAnimated] = useFlag();
  const logoRef = useMediaTransition<HTMLImageElement>(isLogoReady);
  const [isAccepted, setIsAccepted] = useState(false);

  useTimeout(markLogoAnimated, isLogoReady ? CLOSE_DURATION : undefined, [isLogoReady]);

  useLayoutEffect(() => {
    if (!isActive) return;

    return setupParticles(canvasRef.current!, {
      color: appTheme === 'light' ? PARTICLE_COLORS_LIGHT : PARTICLE_COLORS_DARK,
      ...PARTICLE_PARAMS,
      height: isLandscape ? PARTICLE_LANDSCAPE_HEIGHT : PARTICLE_HEIGHT,
    });
  }, [appTheme, isActive, isLandscape]);

  const handleParticlesClick = useLastCallback(() => {
    setupParticles(canvasRef.current!, {
      color: appTheme === 'light' ? PARTICLE_COLORS_LIGHT : PARTICLE_COLORS_DARK,
      ...PARTICLE_PARAMS,
      ...PARTICLE_BURST_PARAMS,
      height: isLandscape ? PARTICLE_LANDSCAPE_HEIGHT : PARTICLE_HEIGHT,
    });
  });

  function handleDisclaimerClick(e: React.MouseEvent<HTMLAnchorElement>) {
    stopEvent(e);

    openDisclaimer();
  }

  return (
    <>
      {IS_LEGACY_APP_HOST && (
        <div className={styles.legacyBar}>
          {lang('This version is deprecated. Re-import your wallets on %new_domain% or %download_app%.', {
            new_domain: (
              <a href={NEW_APP_URL} target="_blank" rel="noopener noreferrer" className={styles.legacyBarLink}>
                {NEW_DOMAIN}
              </a>
            ),
            download_app: (
              <a href={APP_INSTALL_URL} target="_blank" rel="noopener noreferrer" className={styles.legacyBarLink}>
                {lang('download the app')}
              </a>
            ),
          })}
        </div>
      )}
      <div className={buildClassName(
        styles.container, 'custom-scroll', IS_LEGACY_APP_HOST && styles.containerWithLegacyBar,
      )}
      >
        {hasAccounts && (
          <Button isSimple isText onClick={resetAuth} className={styles.headerBack}>
            <i className={buildClassName(styles.iconChevron, 'icon-chevron-left')} aria-hidden />
            <span>{lang('Back')}</span>
          </Button>
        )}

        <div
          className={styles.logoContainer}
          tabIndex={-1}
          role="button"
          onClick={handleParticlesClick}
        >
          <canvas ref={canvasRef} className={styles.logoParticles} />
          <img
            ref={logoRef}
            src={IS_GRAM_WALLET ? gramWalletLogoPath : logoWebpPath}
            alt={APP_NAME}
            className={buildClassName(
              styles.logo,
              isLogoAnimated && styles.logoReadyToScale,
            )}
            onLoad={markLogoReady}
          />
        </div>

        <div className={buildClassName(styles.appName, 'brand-font')}>{APP_NAME}</div>
        {IS_EXPLORER ? (
          <div className={styles.info}>
            {lang('Waiting for a View deeplink to display a wallet address.')}
          </div>
        ) : (
          <>
            <div className={styles.info}>
              {renderText(lang('$auth_intro'))}
            </div>

            <Button
              isText
              className={buildClassName(styles.btn, styles.btn_about)}
              onClick={openAbout}
            >
              {lang('More about %app_name%', { app_name: APP_NAME })}{' '}›
            </Button>
            <div className={styles.buttons}>
              <Checkbox
                checked={isAccepted}
                onChange={setIsAccepted}
                className={styles.responsibilityCheckbox}
                contentClassName={styles.responsibilityCheckboxContent}
              >
                {lang('$accept_terms_with_link', {
                  link: (
                    <a
                      href="#"
                      target="_blank"
                      rel="noreferrer"
                      className={styles.responsibilityCheckboxLink}
                      onClick={handleDisclaimerClick}
                    >
                      {lang('use the wallet responsibly')}
                    </a>
                  ) },
                )}
              </Checkbox>
              {!IS_NEW_WALLET_CREATION_HIDDEN && (
                <Button
                  isPrimary
                  isDisabled={!isAccepted}
                  className={styles.btn}
                  isLoading={isLoading}
                  onClick={!isLoading ? startCreatingWallet : undefined}
                >
                  {lang('Create New Wallet')}
                </Button>
              )}
              <Button
                isText
                isDisabled={!isAccepted}
                className={buildClassName(styles.btn, styles.btn_text)}
                onClick={!isLoading ? openAuthImportWalletModal : undefined}
              >
                {lang('Import Existing Wallet')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    hasAccounts: Boolean(selectCurrentAccountId(global)),
    isLoading: global.auth.isLoading,
    theme: global.settings.theme,
  };
})(AuthStart));
