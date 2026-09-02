package org.mytonwallet.uihome.home.cells

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import androidx.core.view.updateLayoutParams
import org.mytonwallet.app_air.uiassets.viewControllers.assets.AssetsVC
import org.mytonwallet.app_air.uiassets.viewControllers.tokens.TokensVC
import org.mytonwallet.app_air.uicomponents.base.WViewController
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ThemeManager
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

/**
 * Hosts the pooled [TokensVC] as a standalone rounded card, without the segmented control chrome.
 * Used together with a [HomePhoneAssetsCell] built with `excludeTokens = true`, which keeps
 * hosting the collectibles tabs. This cell owns [HomeAssetsVCPool.host] and forwards the
 * collectibles callbacks to [collectiblesHost].
 */
@SuppressLint("ViewConstructor")
class HomeTokensCell(
    context: Context,
    private val pool: HomeAssetsVCPool,
    private var showingAccountId: String,
    private val collectiblesHost: IHomeAssetsHost,
    private val heightChanged: () -> Unit,
    private val onAssetsShown: () -> Unit
) : WCell(context),
    WThemedView,
    IHomeAssetsHost {

    override var areAssetsShown = false
    var onScrollToVisibleRequested: (() -> Unit)? = null

    private val tokensVC: TokensVC get() = pool.tokensVC

    // IHomeAssetsHost ///////////////////////////////////////////////////////////////////////////////
    override fun onVcHeightChanged() {
        updateHeight()
        collectiblesHost.onVcHeightChanged()
    }

    override fun onVcScroll(vc: WViewController) {
        if (vc === tokensVC) updateHeight() else collectiblesHost.onVcScroll(vc)
    }

    override fun onVcAssetsShown(vc: TokensVC) {
        areAssetsShown = true
        onAssetsShown()
    }

    override fun onVcNftsShown(vc: AssetsVC) = collectiblesHost.onVcNftsShown(vc)

    override fun requestReordering(reordering: Boolean) =
        collectiblesHost.requestReordering(reordering)

    fun attachHost() {
        pool.host = this
        tokensVC.onScrollToVisibleRequested = { onScrollToVisibleRequested?.invoke() }
        tokensVC.onShowAllMenuTap = { anchorView -> tokensVC.presentHomeAssetsMenu(anchorView) }
    }

    override fun setupViews() {
        super.setupViews()
        clipChildren = false
        clipToPadding = false
        attachHost()
        mountTokensView()
        updateTheme()
        updateHeight()
    }

    private fun mountTokensView() {
        val vcView = tokensVC.view
        if (vcView.parent === this) return
        (vcView.parent as? ViewGroup)?.removeView(vcView)
        addView(vcView, LayoutParams(MATCH_PARENT, MATCH_PARENT))
        tokensVC.onFullyVisible()
    }

    private var appliedIsDark: Boolean? = null
    private var appliedBigRadius: Float? = null
    override fun updateTheme() {
        val darkModeChanged = ThemeManager.isDark != appliedIsDark
        val radiusChanged = appliedBigRadius != ViewConstants.BLOCK_RADIUS
        appliedIsDark = ThemeManager.isDark
        appliedBigRadius = ViewConstants.BLOCK_RADIUS
        if (darkModeChanged || radiusChanged) {
            setBackgroundColor(WColor.Background.color, ViewConstants.BLOCK_RADIUS.dp, true)
        }
        if (tokensVC.isViewConfigured) tokensVC.updateTheme()
    }

    fun configure(accountId: String?) {
        updateTheme()
        attachHost()
        mountTokensView()
        val accountId = accountId ?: return
        if (showingAccountId == accountId && areAssetsShown) {
            onAssetsShown()
            return
        }
        areAssetsShown = false
        showingAccountId = accountId
        tokensVC.configure(accountId)
        updateHeight()
    }

    fun setAnimations(paused: Boolean) {
        if (paused) tokensVC.onPartiallyVisible() else tokensVC.onFullyVisible()
    }

    private fun updateHeight() {
        val contentHeight = tokensVC.calculatedHeight
        val newHeight = if (contentHeight > 0) contentHeight else 60.dp
        if (newHeight == layoutParams.height) return
        updateLayoutParams { height = newHeight }
        heightChanged()
    }

    /** Detach only; the pool owns the ViewController teardown. */
    fun onDestroy() {
        if (pool.host === this) pool.host = null
        tokensVC.onScrollToVisibleRequested = null
        tokensVC.onShowAllMenuTap = null
        (tokensVC.view.parent as? ViewGroup)?.takeIf { it === this }?.removeView(tokensVC.view)
    }
}
