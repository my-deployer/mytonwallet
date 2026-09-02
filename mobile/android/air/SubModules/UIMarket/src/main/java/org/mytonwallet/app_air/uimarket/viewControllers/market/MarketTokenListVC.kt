package org.mytonwallet.app_air.uimarket.viewControllers.market

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.lang.ref.WeakReference
import org.mytonwallet.app_air.uicomponents.base.WRecyclerViewAdapter
import org.mytonwallet.app_air.uicomponents.base.WViewController
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.extensions.setPaddingLocalized
import org.mytonwallet.app_air.uicomponents.helpers.LastItemPaddingDecoration
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WRecyclerView
import org.mytonwallet.app_air.uimarket.viewControllers.market.cells.MarketTokenListCell
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletcontext.utils.IndexPath
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.WalletEvent

@SuppressLint("ViewConstructor")
class MarketTokenListVC(
    context: Context,
    private val screenTitle: String,
    private val tokens: List<MarketToken>
) : WViewController(context),
    WRecyclerViewAdapter.WRecyclerViewDataSource {
    @Suppress("PropertyName")
    override val TAG = "MarketTokenList"

    override val shouldDisplayBottomBar = true

    private val rvAdapter = WRecyclerViewAdapter(WeakReference(this), arrayOf(TOKEN_CELL))
    private val recyclerView by lazy {
        WRecyclerView(this).apply {
            adapter = rvAdapter
            layoutManager = LinearLayoutManager(context)
            itemAnimator = null
            addItemDecoration(
                LastItemPaddingDecoration(
                    navigationController?.getSystemBars()?.bottom ?: 0
                )
            )
            clipToPadding = false
        }
    }

    override fun setupViews() {
        super.setupViews()
        setupNavBar(true)
        setNavTitle(LocaleController.getString(screenTitle))
        view.addView(recyclerView, ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        view.setConstraints {
            allEdges(recyclerView)
        }
        updateRecyclerViewInsets()
        updateTheme()
    }

    override fun updateTheme() {
        super.updateTheme()
        view.setBackgroundColor(WColor.SecondaryBackground.color)
        rvAdapter.updateTheme()
    }

    override fun insetsUpdated() {
        super.insetsUpdated()
        updateRecyclerViewInsets()
        recyclerView.removeItemDecorationAt(0)
        recyclerView.addItemDecoration(
            LastItemPaddingDecoration(
                navigationController?.bottomInset ?: 0
            )
        )
    }

    private fun updateRecyclerViewInsets() {
        recyclerView.setPaddingLocalized(
            ViewConstants.HORIZONTAL_PADDINGS.dp + additionalTabletPadding + systemBarStartInset,
            navigationBar?.calculatedMinHeight ?: 0,
            ViewConstants.HORIZONTAL_PADDINGS.dp + systemBarEndInset,
            0
        )
    }

    override fun scrollToTop() {
        recyclerView.smoothScrollToPosition(0)
    }

    override fun recyclerViewNumberOfSections(rv: RecyclerView): Int = 1

    override fun recyclerViewNumberOfItems(rv: RecyclerView, section: Int): Int = tokens.size

    override fun recyclerViewCellType(rv: RecyclerView, indexPath: IndexPath): WCell.Type =
        TOKEN_CELL

    override fun recyclerViewCellView(rv: RecyclerView, cellType: WCell.Type): WCell =
        MarketTokenListCell(context) {
            WalletCore.notifyEvent(WalletEvent.OpenToken(it.id))
        }

    override fun recyclerViewConfigureCell(
        rv: RecyclerView,
        cellHolder: WCell.Holder,
        indexPath: IndexPath
    ) {
        (cellHolder.cell as MarketTokenListCell).configure(tokens[indexPath.row])
    }

    private companion object {
        val TOKEN_CELL = WCell.Type(1)
    }
}
