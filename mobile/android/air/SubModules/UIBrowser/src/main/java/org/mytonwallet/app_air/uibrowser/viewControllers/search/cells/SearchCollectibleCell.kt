package org.mytonwallet.app_air.uibrowser.viewControllers.search.cells

import android.annotation.SuppressLint
import android.content.Context
import android.text.TextUtils
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.appcompat.widget.AppCompatImageView
import androidx.core.view.isVisible
import org.mytonwallet.app_air.uibrowser.viewControllers.explore.ExploreVM
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.helpers.adaptiveFontSize
import org.mytonwallet.app_air.uicomponents.image.WNftImageView
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

@SuppressLint("ViewConstructor")
class SearchCollectibleCell(
    context: Context,
    private val onTap: (ExploreVM.CollectibleMatch) -> Unit
) : WCell(context, LayoutParams(MATCH_PARENT, 60.dp)),
    WThemedView {

    private val nftImageView = WNftImageView(context, 24.dp, 0, 6f.dp)

    private val collectionImageView = AppCompatImageView(context).apply {
        id = generateViewId()
        setImageResource(org.mytonwallet.app_air.icons.R.drawable.ic_collection_24)
    }

    private val titleLabel = WLabel(context).apply {
        setStyle(adaptiveFontSize(), WFont.Medium)
        setSingleLine()
        ellipsize = TextUtils.TruncateAt.END
        setTextColor(WColor.PrimaryText)
        useCustomEmoji = true
    }

    private val subtitleLabel = WLabel(context).apply {
        setStyle(12f, WFont.Regular)
        setSingleLine()
        ellipsize = TextUtils.TruncateAt.END
        setTextColor(WColor.SecondaryText)
    }

    override fun setupViews() {
        super.setupViews()
        addView(nftImageView, LayoutParams(24.dp, 24.dp))
        addView(collectionImageView, LayoutParams(24.dp, 24.dp))
        addView(titleLabel, LayoutParams(0, WRAP_CONTENT))
        addView(subtitleLabel, LayoutParams(0, WRAP_CONTENT))
        setConstraints {
            toStart(nftImageView, 18f)
            toCenterY(nftImageView)
            toStart(collectionImageView, 18f)
            toCenterY(collectionImageView)
            toStart(titleLabel, 56f)
            toTop(titleLabel, 9.5f)
            toEnd(titleLabel, 12f)
            toStart(subtitleLabel, 56f)
            topToBottom(subtitleLabel, titleLabel, 1f)
            toEnd(subtitleLabel, 12f)
        }
    }

    private var isLastItem = false
    private var hasOpaqueBackground = true

    fun configure(
        match: ExploreVM.CollectibleMatch,
        isLastItem: Boolean,
        hasOpaqueBackground: Boolean = true
    ) {
        this.isLastItem = isLastItem
        this.hasOpaqueBackground = hasOpaqueBackground

        when (match) {
            is ExploreVM.CollectibleMatch.Nft -> {
                val nft = match.nft
                nftImageView.isVisible = true
                collectionImageView.isVisible = false
                nftImageView.setNftImage(nft.thumbnail ?: nft.image)
                titleLabel.text = nft.name?.takeIf { it.isNotEmpty() }
                    ?: LocaleController.getString("NFT")
                subtitleLabel.text = LocaleController.getString("NFT")
            }

            is ExploreVM.CollectibleMatch.Collection -> {
                nftImageView.isVisible = false
                collectionImageView.isVisible = true
                titleLabel.text = match.collection.name.takeIf { it.isNotBlank() }
                    ?: LocaleController.getString("Collection")
                subtitleLabel.text = LocaleController.getString("Collection")
            }
        }

        setOnClickListener { onTap(match) }
        updateTheme()
    }

    override fun updateTheme() {
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
        collectionImageView.drawable?.setTint(WColor.PrimaryText.color)
        nftImageView.updateTheme()
    }
}
