package org.mytonwallet.app_air.uibrowser.viewControllers.search.cells

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.appcompat.widget.AppCompatImageView
import androidx.constraintlayout.widget.ConstraintSet
import androidx.core.view.isGone
import androidx.core.view.setPadding
import org.mytonwallet.app_air.uibrowser.search.AppSearchEntry
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.helpers.adaptiveFontSize
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.WColorGradients
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.utils.getDrawableCompat

@SuppressLint("ViewConstructor")
class SearchAppItemCell(context: Context, private val onTap: (entry: AppSearchEntry) -> Unit) :
    WCell(context, LayoutParams(MATCH_PARENT, 60.dp)),
    WThemedView {

    private val iconBackground = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        WColorGradients.first()
    ).apply {
        cornerRadius = 8.5f.dp
    }

    private val iconImageView: AppCompatImageView by lazy {
        AppCompatImageView(context).apply {
            id = generateViewId()
        }
    }

    private val titleLabel: WLabel by lazy {
        WLabel(context).apply {
            setStyle(adaptiveFontSize(), WFont.Medium)
            setSingleLine()
            ellipsize = TextUtils.TruncateAt.END
            setTextColor(WColor.PrimaryText)
        }
    }

    private val subtitleLabel: WLabel by lazy {
        WLabel(context).apply {
            setStyle(12f, WFont.Regular)
            setSingleLine()
            ellipsize = TextUtils.TruncateAt.END
            setTextColor(WColor.SecondaryText)
        }
    }

    override fun setupViews() {
        super.setupViews()
        addView(iconImageView, LayoutParams(24.dp, 24.dp))
        addView(titleLabel, LayoutParams(0, WRAP_CONTENT))
        addView(subtitleLabel, LayoutParams(0, WRAP_CONTENT))
        applyLayout()

        setOnClickListener {
            entry?.let(onTap)
        }

        updateTheme()
    }

    private var hasSubtitle = false
    private fun applyLayout() {
        setConstraints {
            clear(titleLabel.id, ConstraintSet.TOP)
            clear(titleLabel.id, ConstraintSet.BOTTOM)
            toStart(iconImageView, 18f)
            toCenterY(iconImageView)
            setHorizontalBias(titleLabel.id, 0f)
            toStart(titleLabel, 56f)
            toEnd(titleLabel, 16f)
            if (hasSubtitle) {
                toTop(titleLabel, 9.5f)
                setHorizontalBias(subtitleLabel.id, 0f)
                toStart(subtitleLabel, 56f)
                toEnd(subtitleLabel, 16f)
                topToBottom(subtitleLabel, titleLabel, 1f)
            } else {
                toCenterY(titleLabel)
            }
        }
    }

    private var entry: AppSearchEntry? = null
    private var isLastItem = false
    private var hasOpaqueBackground = true
    fun configure(entry: AppSearchEntry, isLastItem: Boolean, hasOpaqueBackground: Boolean = true) {
        this.entry = entry
        this.isLastItem = isLastItem
        this.hasOpaqueBackground = hasOpaqueBackground
        titleLabel.text = entry.title
        val subtitle = entry.subtitle
        subtitleLabel.text = subtitle
        subtitleLabel.isGone = subtitle.isNullOrEmpty()
        val subtitleVisible = !subtitle.isNullOrEmpty()
        if (hasSubtitle != subtitleVisible) {
            hasSubtitle = subtitleVisible
            applyLayout()
        }
        if (entry.isAction) {
            iconImageView.background = iconBackground
            iconImageView.setPadding(4.dp)
            iconBackground.colors = WColorGradients[entry.gradientIndex % WColorGradients.size]
            iconImageView.setImageDrawable(
                context.getDrawableCompat(entry.iconRes)?.mutate()?.apply {
                    setTint(WColor.White.color)
                }
            )
        } else {
            iconImageView.background = null
            iconImageView.setPadding(0)
            iconImageView.setImageDrawable(context.getDrawableCompat(entry.iconRes))
        }
        updateTheme()
    }

    override fun updateTheme() {
        if (entry?.isAction == true) iconImageView.drawable?.setTint(WColor.White.color)
        setBackgroundColor(
            if (hasOpaqueBackground) WColor.Background.color else WColor.Transparent.color,
            0f,
            if (isLastItem) ViewConstants.BLOCK_RADIUS.dp else 0f
        )
        addRippleEffect(
            WColor.BackgroundRipple.color,
            0f,
            if (isLastItem) ViewConstants.BLOCK_RADIUS.dp else 0f
        )
    }
}
