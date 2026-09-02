package org.mytonwallet.app_air.uibrowser.viewControllers.explore.cells

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.lang.ref.WeakReference
import org.mytonwallet.app_air.uicomponents.base.WRecyclerViewAdapter
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.extensions.setPaddingLocalized
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WRecyclerView
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.WView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletcontext.utils.IndexPath
import org.mytonwallet.app_air.walletcore.moshi.ApiDapp

@SuppressLint("ViewConstructor")
class ExploreConnectedCell(
    context: Context,
    val dAppPressed: (it: ApiDapp?) -> Unit,
    val configurePressed: () -> Unit
) : WCell(context, LayoutParams(MATCH_PARENT, WRAP_CONTENT)),
    WRecyclerViewAdapter.WRecyclerViewDataSource,
    WThemedView {

    companion object {
        val CONNECTED_CELL = Type(1)
    }

    private val rvAdapter =
        WRecyclerViewAdapter(WeakReference(this), arrayOf(CONNECTED_CELL))

    private val recyclerView = WRecyclerView(context).apply {
        layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false)
        adapter = rvAdapter
        setPaddingLocalized(10.dp, 0, 10.dp, 12.dp)
        clipToPadding = false
    }

    private val containerView = WView(context).apply {
        addView(recyclerView, ViewGroup.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        setConstraints { allEdges(recyclerView) }
    }

    init {
        setPaddingLocalized(
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            0,
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            12.dp
        )
        addView(containerView, ViewGroup.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        setConstraints { allEdges(containerView) }
        updateTheme()
    }

    private var connectedApps: Array<ApiDapp> = emptyArray()
    fun configure(dApps: Array<ApiDapp>) {
        this.connectedApps = dApps
        rvAdapter.reloadData()
        updateTheme()
    }

    override fun updateTheme() {
        containerView.setBackgroundColor(
            WColor.Background.color,
            0f,
            ViewConstants.BLOCK_RADIUS.dp
        )
    }

    override fun recyclerViewNumberOfSections(rv: RecyclerView): Int = 2

    override fun recyclerViewNumberOfItems(rv: RecyclerView, section: Int): Int = when (section) {
        0 -> connectedApps.size
        else -> 1
    }

    override fun recyclerViewCellType(rv: RecyclerView, indexPath: IndexPath): Type = CONNECTED_CELL

    override fun recyclerViewCellView(rv: RecyclerView, cellType: Type): WCell =
        ExploreLargeConnectedItemCell(context, 72.dp) {
            if (it != null) dAppPressed(it) else configurePressed()
        }

    override fun recyclerViewConfigureCell(
        rv: RecyclerView,
        cellHolder: Holder,
        indexPath: IndexPath
    ) {
        (cellHolder.cell as ExploreLargeConnectedItemCell).configure(
            if (indexPath.section == 0) connectedApps[indexPath.row] else null
        )
    }
}
