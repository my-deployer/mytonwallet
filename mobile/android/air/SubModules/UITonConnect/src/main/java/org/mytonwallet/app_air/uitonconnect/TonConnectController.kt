package org.mytonwallet.app_air.uitonconnect

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.lifecycleScope
import java.lang.ref.WeakReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.mytonwallet.app_air.uicomponents.base.WNavigationController
import org.mytonwallet.app_air.uicomponents.base.WWindow
import org.mytonwallet.app_air.uicomponents.base.showAlert
import org.mytonwallet.app_air.uicomponents.extensions.startActivityCatching
import org.mytonwallet.app_air.uitonconnect.viewControllers.connect.TonConnectRequestConnectVC
import org.mytonwallet.app_air.uitonconnect.viewControllers.send.requestSend.TonConnectRequestSendVC
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.logger.Logger
import org.mytonwallet.app_air.walletcontext.WalletContextManager
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.helpers.DappDeeplinkReturnTracker
import org.mytonwallet.app_air.walletcore.helpers.TonConnectHelper
import org.mytonwallet.app_air.walletcore.moshi.ApiConnectionType
import org.mytonwallet.app_air.walletcore.moshi.ReturnStrategy
import org.mytonwallet.app_air.walletcore.moshi.api.ApiMethod
import org.mytonwallet.app_air.walletcore.moshi.api.ApiUpdate

class TonConnectController(private val window: WWindow) : WalletCore.UpdatesObserver {
    companion object {
        private var loadingConnectRequestViewController:
            WeakReference<TonConnectRequestConnectVC>? = null
        private var loadingSendRequestViewController: WeakReference<TonConnectRequestSendVC>? =
            null

        private class PendingReturn(val promiseId: String, val strategy: ReturnStrategy)
        private class PendingError(val promiseId: String, val error: String)

        private var pendingReturn: PendingReturn? = null
        private var pendingError: PendingError? = null

        fun handleRequestSettled(
            window: WWindow,
            promiseId: String,
            returnStrategy: String,
            error: String?
        ) {
            val isRequestNavPresented = window.navigationControllers.any {
                (it as? DappRequestNavigationController)?.promiseId == promiseId
            }
            if (error != null) {
                pendingReturn = null
                if (isRequestNavPresented) {
                    pendingError = PendingError(promiseId, error)
                } else {
                    WalletContextManager.delegate?.get()?.showError(error)
                }
                return
            }
            val strategy = ReturnStrategy.fromDeeplinkValue(returnStrategy)
            if (strategy == ReturnStrategy.None) return
            if (isRequestNavPresented) {
                pendingReturn = PendingReturn(promiseId, strategy)
            } else {
                performReturnStrategy(window, strategy)
            }
        }

        internal fun onRequestNavDismissed(nav: DappRequestNavigationController) {
            pendingError?.let { pending ->
                if (pending.promiseId != nav.promiseId) return@let
                pendingError = null
                nav.window.lifecycleScope.launch(Dispatchers.Main) {
                    WalletContextManager.delegate?.get()?.showError(pending.error)
                }
                return
            }
            val pending = pendingReturn ?: return
            if (pending.promiseId != nav.promiseId) return
            pendingReturn = null
            performReturnStrategy(nav.window, pending.strategy)
        }

        private fun performReturnStrategy(window: WWindow, strategy: ReturnStrategy) {
            when (strategy) {
                is ReturnStrategy.Url -> {
                    val uri = strategy.uri
                    val opened = uri != null &&
                        window.startActivityCatching(Intent(Intent.ACTION_VIEW, uri))
                    if (!opened) window.moveTaskToBack(true)
                }

                ReturnStrategy.Back, ReturnStrategy.Empty -> window.moveTaskToBack(true)

                ReturnStrategy.None -> {}
            }
        }

        fun setLoadingConnectRequestViewController(vc: TonConnectRequestConnectVC): Boolean {
            if (loadingConnectRequestViewController?.get()?.isDestroyed == false) {
                return false // A loading screen already shown
            }
            loadingConnectRequestViewController = WeakReference(vc)
            return true
        }

        fun setLoadingSendRequestViewController(vc: TonConnectRequestSendVC): Boolean {
            if (loadingSendRequestViewController?.get()?.isDestroyed == false) {
                return false // A loading screen already shown
            }
            loadingSendRequestViewController = WeakReference(vc)
            return true
        }
    }

    fun connectStart(link: String) {
        WalletCore.call(
            ApiMethod.DApp.TonConnectHandleDeepLink(
                url = link,
                identifier = TonConnectHelper.generateId()
            )
        ) { _, err ->
            if (err != null) {
                Logger.e(Logger.LogTag.TON_CONNECT, "handleDeeplink: $err")
            }
        }
    }

    override fun onBridgeUpdate(update: ApiUpdate) {
        when (update) {
            is ApiUpdate.ApiUpdateDappConnect -> {
                DappDeeplinkReturnTracker.bindTonConnectRequest(
                    update.dapp.sse?.appClientId,
                    update.promiseId
                )
                window.doOnWalletReady {
                    WalletCore.recordTonConnectEvent(
                        "wallet-connect-request-ui-displayed",
                        update.promiseId
                    )
                    val loadingVC = loadingConnectRequestViewController?.get()
                        ?.takeIf { !it.isDestroyed }
                    if (loadingVC != null) {
                        (loadingVC.navigationController as? DappRequestNavigationController)
                            ?.promiseId = update.promiseId
                        loadingVC.setDappUpdate(update)
                        loadingConnectRequestViewController = null
                    } else {
                        if (window.isAnimating) {
                            WalletCore.call(
                                ApiMethod.DApp.CancelDappRequest(
                                    promiseId = update.promiseId,
                                    reason = LocaleController.getString("Canceled by the user")
                                )
                            ) { _, _ ->
                                if (DappDeeplinkReturnTracker.consumeCompletedRequest(
                                        update.promiseId
                                    )
                                ) {
                                    window.moveTaskToBack(true)
                                }
                            }
                            return@doOnWalletReady
                        }
                        val navVC = DappRequestNavigationController(
                            window,
                            WNavigationController.PresentationConfig(
                                style = WNavigationController.PresentationStyle.BottomSheet
                            )
                        )
                        navVC.promiseId = update.promiseId
                        navVC.setRoot(TonConnectRequestConnectVC(window, update))
                        window.presentOnWalletReady(navVC)
                    }
                }
            }

            is ApiUpdate.ApiUpdateDappSendTransactions -> {
                DappDeeplinkReturnTracker.bindTonConnectRequest(
                    update.dapp.sse?.appClientId,
                    update.promiseId
                )
                WalletCore.ensureAccountActivated(update.accountId) { accountChanged ->
                    window.doOnWalletReady {
                        WalletCore.recordTonConnectEvent(
                            "wallet-transaction-confirmation-ui-displayed",
                            update.promiseId
                        )
                        val loadingVC = loadingSendRequestViewController?.get()
                            ?.takeIf { !it.isDestroyed }
                        if (accountChanged) {
                            while (window.navigationControllers.size > 1 &&
                                window.navigationControllers[1].viewControllers.lastOrNull() !=
                                loadingVC
                            ) {
                                window.dismissNav(1)
                            }
                        }
                        if (loadingVC != null) {
                            (loadingVC.navigationController as? DappRequestNavigationController)
                                ?.promiseId = update.promiseId
                            loadingVC.setUpdate(update)
                            loadingSendRequestViewController = null
                        } else {
                            val navVC = DappRequestNavigationController(
                                window,
                                WNavigationController.PresentationConfig.PreferredFullScreen
                            )
                            navVC.promiseId = update.promiseId
                            navVC.setRoot(
                                TonConnectRequestSendVC(
                                    window,
                                    ApiConnectionType.SEND_TRANSACTION,
                                    update
                                )
                            )
                            window.presentOnWalletReady(navVC)
                        }
                    }
                }
            }

            is ApiUpdate.ApiUpdateDappSignData -> {
                DappDeeplinkReturnTracker.bindTonConnectRequest(
                    update.dapp.sse?.appClientId,
                    update.promiseId
                )
                WalletCore.ensureAccountActivated(update.accountId) { accountChanged ->
                    WalletCore.recordTonConnectEvent(
                        "wallet-sign-data-confirmation-ui-displayed",
                        update.promiseId
                    )
                    val loadingVC = loadingSendRequestViewController?.get()
                        ?.takeIf { !it.isDestroyed }
                    if (accountChanged) {
                        while (window.navigationControllers.size > 1 &&
                            window.navigationControllers[1].viewControllers.lastOrNull() !=
                            loadingVC
                        ) {
                            window.dismissNav(1)
                        }
                    }
                    if (loadingVC != null) {
                        (loadingVC.navigationController as? DappRequestNavigationController)
                            ?.promiseId = update.promiseId
                        loadingVC.setUpdate(update)
                        loadingSendRequestViewController = null
                    } else {
                        val navVC = DappRequestNavigationController(
                            window,
                            WNavigationController.PresentationConfig.PreferredFullScreen
                        )
                        navVC.promiseId = update.promiseId
                        navVC.setRoot(
                            TonConnectRequestSendVC(
                                window,
                                ApiConnectionType.SIGN_DATA,
                                update
                            )
                        )
                        window.presentOnWalletReady(navVC)
                    }
                }
            }

            is ApiUpdate.ApiUpdateDappAlreadyConnected -> {
                val url = update.url
                window.topViewController?.showAlert(
                    title = LocaleController.getString("Already Connected"),
                    text = LocaleController.getString(
                        "Return to the dapp to proceed, or reconnect."
                    ),
                    button = LocaleController.getString("OK"),
                    buttonPressed = { url?.let { openExternalUri(Uri.parse(it)) } },
                    secondaryButton = if (url !=
                        null
                    ) {
                        LocaleController.getString("Cancel")
                    } else {
                        null
                    }
                )
            }

            is ApiUpdate.ApiUpdateDappRequestSettled -> {
                handleRequestSettled(window, update.promiseId, update.returnStrategy, update.error)
            }

            is ApiUpdate.ApiUpdateDappDisconnected -> {
                val url = update.url
                window.topViewController?.showAlert(
                    title = LocaleController.getString("Dapp Disconnected"),
                    text = LocaleController.getString(
                        "Please reconnect your wallet from the dapp."
                    ),
                    button = LocaleController.getString("OK"),
                    buttonPressed = { url?.let { openExternalUri(Uri.parse(it)) } },
                    secondaryButton = if (url !=
                        null
                    ) {
                        LocaleController.getString("Cancel")
                    } else {
                        null
                    }
                )
            }

            else -> {}
        }
    }

    fun onCreate() {
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappConnect::class.java, this)
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappSendTransactions::class.java, this)
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappSignData::class.java, this)
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappAlreadyConnected::class.java, this)
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappDisconnected::class.java, this)
        WalletCore.subscribeToApiUpdates(ApiUpdate.ApiUpdateDappRequestSettled::class.java, this)
    }

    fun onDestroy() {
        WalletCore.unsubscribeFromApiUpdates(ApiUpdate.ApiUpdateDappConnect::class.java, this)
        WalletCore.unsubscribeFromApiUpdates(
            ApiUpdate.ApiUpdateDappSendTransactions::class.java,
            this
        )
        WalletCore.unsubscribeFromApiUpdates(
            ApiUpdate.ApiUpdateDappSignData::class.java,
            this
        )
        WalletCore.unsubscribeFromApiUpdates(
            ApiUpdate.ApiUpdateDappAlreadyConnected::class.java,
            this
        )
        WalletCore.unsubscribeFromApiUpdates(
            ApiUpdate.ApiUpdateDappDisconnected::class.java,
            this
        )
        WalletCore.unsubscribeFromApiUpdates(
            ApiUpdate.ApiUpdateDappRequestSettled::class.java,
            this
        )
    }

    private fun openExternalUri(uri: Uri) {
        window.startActivityCatching(Intent(Intent.ACTION_VIEW, uri))
    }
}
