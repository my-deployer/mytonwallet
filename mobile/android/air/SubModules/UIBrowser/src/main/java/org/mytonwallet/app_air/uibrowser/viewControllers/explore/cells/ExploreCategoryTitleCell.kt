package org.mytonwallet.app_air.uibrowser.viewControllers.explore.cells

import android.annotation.SuppressLint
import android.content.Context
import android.text.TextUtils
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.extensions.setPaddingLocalized
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.WView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

@SuppressLint("ViewConstructor")
class ExploreCategoryTitleCell(context: Context) :
    WCell(context, LayoutParams(MATCH_PARENT, WRAP_CONTENT)),
    WThemedView {
    private val titleLabel: WLabel by lazy {
        WLabel(context).apply {
            setStyle(14f, WFont.Medium)
            setSingleLine()
            ellipsize = TextUtils.TruncateAt.END
        }
    }

    private val containerView: WView by lazy {
        WView(context).apply {
            addView(titleLabel, LayoutParams(0, WRAP_CONTENT))
            setConstraints {
                toStart(titleLabel, 20f)
                toEnd(titleLabel, 20f)
                toTop(titleLabel, 2f)
                toBottom(titleLabel)
            }
        }
    }

    init {
        setPaddingLocalized(
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            0,
            ViewConstants.HORIZONTAL_PADDINGS.dp,
            0
        )
        addView(containerView, ViewGroup.LayoutParams(MATCH_PARENT, 48.dp))
        setConstraints { allEdges(containerView) }
    }

    override fun updateTheme() {
        titleLabel.setTextColor(WColor.Tint.color)
        containerView.setBackgroundColor(
            WColor.Background.color,
            ViewConstants.BLOCK_RADIUS.dp,
            0f
        )
    }

    fun configure(title: String) {
        titleLabel.text = title
        updateTheme()
    }
}
