package org.mytonwallet.app_air.uibrowser.viewControllers.search.cells

import android.annotation.SuppressLint
import android.content.Context
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import org.mytonwallet.app_air.uicomponents.commonViews.cells.HeaderCell
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

@SuppressLint("ViewConstructor")
class SearchSelectorHeaderCell(context: Context) :
    WCell(context),
    WThemedView {

    enum class Mode(val titleKey: String) {
        RECENT("\$universal_search_recent"),
        SUGGEST("Suggest"),
        TRENDING("Trending")
    }

    private var topRounding = HeaderCell.TopRounding.ZERO
    private var selectedMode = Mode.RECENT
    private var alternativeMode = Mode.TRENDING

    private val titleLabel = WLabel(context).apply {
        setStyle(14f, WFont.Medium)
        setSingleLine()
        ellipsize = TextUtils.TruncateAt.END
        setTextColor(WColor.Tint)
    }

    private val recentLabel = selectorLabel("")
    private val separatorLabel = selectorLabel(" · ").apply {
        isClickable = false
    }
    private val alternativeLabel = selectorLabel("")

    private val selectorView = LinearLayout(context).apply {
        id = View.generateViewId()
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(recentLabel, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        addView(separatorLabel, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        addView(alternativeLabel, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
    }

    var onModeSelected: ((Mode) -> Unit)? = null

    override fun setupViews() {
        super.setupViews()

        layoutParams.apply {
            height = 40.dp
        }
        addView(
            titleLabel,
            LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                constrainedWidth = true
            }
        )
        addView(selectorView, LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        setConstraints {
            setHorizontalBias(titleLabel.id, 0f)
            toStart(titleLabel, 20f)
            endToStart(titleLabel, selectorView, 12f)
            toTop(titleLabel, 16f)
            toEnd(selectorView, 20f)
            centerYToCenterY(selectorView, titleLabel)
        }

        recentLabel.setOnClickListener { onModeSelected?.invoke(Mode.RECENT) }
        alternativeLabel.setOnClickListener { onModeSelected?.invoke(alternativeMode) }
        updateTheme()
    }

    fun configure(
        title: String,
        showsSelector: Boolean,
        selectedMode: Mode,
        alternativeMode: Mode,
        topRounding: HeaderCell.TopRounding,
        onModeSelected: (Mode) -> Unit
    ) {
        this.selectedMode = selectedMode
        this.alternativeMode = alternativeMode
        this.topRounding = topRounding
        this.onModeSelected = onModeSelected
        titleLabel.text = title
        recentLabel.text = LocaleController.getString(Mode.RECENT.titleKey)
        alternativeLabel.text = LocaleController.getString(alternativeMode.titleKey)
        selectorView.visibility = if (showsSelector) View.VISIBLE else View.GONE
        updateTheme()
    }

    override fun updateTheme() {
        setBackgroundColor(
            WColor.Background.color,
            when (topRounding) {
                HeaderCell.TopRounding.FIRST_ITEM -> ViewConstants.TOOLBAR_RADIUS.dp
                HeaderCell.TopRounding.NORMAL -> ViewConstants.BLOCK_RADIUS.dp
                HeaderCell.TopRounding.ZERO -> 0f
            },
            0f
        )
        titleLabel.updateTheme()
        recentLabel.setStyle(
            14f,
            if (selectedMode == Mode.RECENT) WFont.Bold else WFont.Regular
        )
        recentLabel.setTextColor(
            if (selectedMode == Mode.RECENT) WColor.SecondaryText else WColor.Tint
        )
        separatorLabel.setStyle(14f, WFont.Regular)
        separatorLabel.setTextColor(WColor.SecondaryText)
        alternativeLabel.setStyle(
            14f,
            if (selectedMode == alternativeMode) WFont.Bold else WFont.Regular
        )
        alternativeLabel.setTextColor(
            if (selectedMode == alternativeMode) WColor.SecondaryText else WColor.Tint
        )
    }

    private fun selectorLabel(title: String) = WLabel(context).apply {
        text = title
        setStyle(14f, WFont.Regular)
        setSingleLine()
    }
}
