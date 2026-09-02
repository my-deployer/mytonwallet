package org.mytonwallet.app_air.uibrowser.viewControllers.search.cells

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletcontext.utils.colorWithAlpha

@SuppressLint("ViewConstructor")
class SearchBestMatchCell(context: Context, val contentCell: WCell) :
    WCell(context, LayoutParams(MATCH_PARENT, WRAP_CONTENT)),
    WThemedView {

    private val titleLabel = WLabel(context).apply {
        setStyle(14f, WFont.Medium)
        setSingleLine()
        setTextColor(WColor.Tint)
    }

    override fun setupViews() {
        super.setupViews()

        addView(titleLabel, LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        addView(contentCell, LayoutParams(MATCH_PARENT, 60.dp))
        setConstraints {
            toStart(titleLabel, 20f)
            toTop(titleLabel, 16f)
            toStart(contentCell)
            toEnd(contentCell)
            topToBottom(contentCell, titleLabel, 7f)
            toBottom(contentCell)
        }
        updateTheme()
    }

    fun configure(title: String) {
        titleLabel.text = title
        updateTheme()
    }

    override fun updateTheme() {
        setBackgroundColor(
            WColor.PrimaryText.color.colorWithAlpha(15),
            ViewConstants.BLOCK_RADIUS.dp
        )
        titleLabel.setTextColor(WColor.Tint)
    }
}
