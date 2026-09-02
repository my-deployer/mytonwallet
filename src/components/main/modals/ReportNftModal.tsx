import React, { memo } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import { selectCurrentAccountState } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';

import modalStyles from '../../ui/Modal.module.scss';

interface StateProps {
  isOpen?: boolean;
}

function ReportNftModal({
  isOpen,
}: StateProps) {
  const { hideNft, closeReportNftModal } = getActions();

  const lang = useLang();

  const handleHideAndReport = useLastCallback(() => {
    hideNft({ shouldReport: true });
  });

  const handleHide = useLastCallback(() => {
    hideNft();
  });

  return (
    <Modal
      isOpen={isOpen}
      isCompact
      onClose={closeReportNftModal}
      title={lang('Hide NFT')}
    >
      <p className={modalStyles.text}>
        {lang('Do you also want to report this NFT as inappropriate?'
          + ' It will be then permanently removed on this device.')}
      </p>
      <div className={buildClassName(modalStyles.footerButtons, modalStyles.footerButtonsVertical)}>
        <Button isDestructive onClick={handleHideAndReport} className={modalStyles.buttonFullWidth}>
          {lang('Hide and Report')}
        </Button>
        <Button onClick={handleHide} className={modalStyles.buttonFullWidth}>
          {lang('Only Hide')}
        </Button>
        <Button isText onClick={closeReportNftModal} className={modalStyles.buttonFullWidth}>
          {lang('Cancel')}
        </Button>
      </div>
    </Modal>
  );
}

export default memo(withGlobal((global): StateProps => {
  const { selectedNftToReport } = selectCurrentAccountState(global) ?? {};

  return {
    isOpen: Boolean(selectedNftToReport),
  };
})(ReportNftModal));
