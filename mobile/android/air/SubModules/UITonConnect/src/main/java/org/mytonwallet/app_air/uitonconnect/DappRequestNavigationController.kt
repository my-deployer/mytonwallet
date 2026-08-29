package org.mytonwallet.app_air.uitonconnect

import android.annotation.SuppressLint
import org.mytonwallet.app_air.uicomponents.base.WNavigationController
import org.mytonwallet.app_air.uicomponents.base.WWindow

@SuppressLint("ViewConstructor")
class DappRequestNavigationController(window: WWindow, presentationConfig: PresentationConfig) :
    WNavigationController(window, presentationConfig) {
    // The dapp request this modal displays; null until the request update is bound.
    var promiseId: String? = null

    override fun onDestroy() {
        super.onDestroy()
        TonConnectController.onRequestNavDismissed(this)
    }
}
