package org.mytonwallet.app_air.uimarket.viewControllers.market.views

import android.content.Context
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uimarket.viewControllers.market.MarketToken
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color

internal class MarketPriceChangeLabel(context: Context) : WLabel(context) {
    private var marketToken: MarketToken? = null

    init {
        setStyle(14f, WFont.Regular)
        setSingleLine()
    }

    fun configure(token: MarketToken) {
        marketToken = token
        updateTheme()
    }

    override fun updateTheme() {
        super.updateTheme()
        val token = marketToken ?: return
        val priceText = token.priceText
        val directionalPriceText = priceText?.let {
            if (LocaleController.isRTL) "\u200F\u200E$it\u200F" else it
        }.orEmpty()
        val separator = when {
            priceText == null -> ""
            LocaleController.isRTL -> " · "
            else -> " "
        }
        val formattedText = directionalPriceText + separator + token.changeText
        val changeStart = directionalPriceText.length +
            if (LocaleController.isRTL) separator.length else 0

        text = SpannableString(formattedText).apply {
            if (changeStart > 0) {
                setSpan(
                    ForegroundColorSpan(WColor.SecondaryText.color),
                    0,
                    changeStart,
                    Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                )
            }
            setSpan(
                ForegroundColorSpan(
                    if (token.isPositive) WColor.Green.color else WColor.Red.color
                ),
                changeStart,
                formattedText.length,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
    }
}
