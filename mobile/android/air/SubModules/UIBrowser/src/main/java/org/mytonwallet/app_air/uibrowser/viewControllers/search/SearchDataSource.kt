package org.mytonwallet.app_air.uibrowser.viewControllers.search

import androidx.recyclerview.widget.RecyclerView
import org.mytonwallet.app_air.uibrowser.viewControllers.explore.ExploreVM
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.GapCell
import org.mytonwallet.app_air.uicomponents.base.WRecyclerViewAdapter
import org.mytonwallet.app_air.uicomponents.commonViews.cells.HeaderCell
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.walletcontext.utils.IndexPath
import org.mytonwallet.app_air.walletcore.models.InAppBrowserConfig
import org.mytonwallet.app_air.walletcore.models.MTokenBalance
import org.mytonwallet.app_air.walletcore.moshi.IDapp

internal abstract class SearchDataSource(protected val searchVC: SearchVC) :
    WRecyclerViewAdapter.WRecyclerViewDataSource {

    enum class BestMatchResult {
        OPENED,
        PENDING,
        NOT_FOUND
    }

    protected val context get() = searchVC.context
    protected val searchResult get() = searchVC.searchResult
    protected val searchQuery get() = searchVC.searchQuery
    protected val rvAdapter get() = searchVC.rvAdapter

    fun sectionItemCounts(rv: RecyclerView): IntArray =
        IntArray(recyclerViewNumberOfSections(rv)) { section ->
            recyclerViewNumberOfItems(rv, section)
        }

    open fun openBestMatch(): BestMatchResult = BestMatchResult.NOT_FOUND

    open fun onSearchStateChanged() = Unit

    final override fun recyclerViewCellView(rv: RecyclerView, cellType: WCell.Type): WCell =
        searchVC.createCell(cellType)

    protected fun topRounding(indexPath: IndexPath): HeaderCell.TopRounding =
        if (rvAdapter.indexPathToPosition(indexPath) == 0) {
            HeaderCell.TopRounding.FIRST_ITEM
        } else {
            HeaderCell.TopRounding.NORMAL
        }

    protected fun configureGapCell(
        rv: RecyclerView,
        cellHolder: WCell.Holder,
        indexPath: IndexPath
    ): Boolean {
        val cell = cellHolder.cell as? GapCell ?: return false
        val isLastVisibleSection = (indexPath.section + 1 until recyclerViewNumberOfSections(rv))
            .none { recyclerViewNumberOfItems(rv, it) > 0 }
        cell.configure(searchVC.usesGlobalSearchOverlay && isLastVisibleSection)
        return true
    }

    protected fun createCell(cellType: WCell.Type): WCell = searchVC.createCell(cellType)

    protected fun openOwnWallet(match: ExploreVM.MyWalletMatch) = searchVC.openOwnWallet(match)

    protected fun openWalletInfo(match: ExploreVM.WalletInfoMatch) = searchVC.openWalletInfo(match)

    protected fun openCollectible(match: ExploreVM.CollectibleMatch) =
        searchVC.openCollectible(match)

    protected fun openToken(tokenBalance: MTokenBalance) = searchVC.openToken(tokenBalance)

    protected fun openDapp(app: IDapp) = searchVC.openDapp(app)

    protected fun openInAppBrowser(config: InAppBrowserConfig) = searchVC.openInAppBrowser(config)
}
