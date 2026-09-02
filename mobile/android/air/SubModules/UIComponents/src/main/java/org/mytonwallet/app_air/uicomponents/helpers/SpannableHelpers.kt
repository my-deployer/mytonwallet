package org.mytonwallet.app_air.uicomponents.helpers

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.spans.WForegroundColorSpan
import org.mytonwallet.app_air.uicomponents.helpers.spans.WTypefaceSpan
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.utils.getDrawableCompat
import org.mytonwallet.app_air.walletcontext.utils.VerticalImageSpan

object SpannableHelpers {
    private const val ADDRESS_EDGE_LENGTH = 6

    /**
     * Renders [address] with its first and last [ADDRESS_EDGE_LENGTH] characters in [edgeColor]
     * and the middle in [middleColor]. Addresses too short to split stay entirely in [edgeColor].
     *
     * Colors resolve at draw time, so the result survives theme changes without being rebuilt.
     */
    fun addressSpan(
        address: String,
        font: WFont = WFont.Regular,
        edgeColor: WColor = WColor.PrimaryText,
        middleColor: WColor = WColor.SecondaryText
    ): CharSequence {
        val spannable = SpannableStringBuilder(address)
        spannable.setSpan(
            WTypefaceSpan(font.typeface),
            0,
            address.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        if (address.length <= 2 * ADDRESS_EDGE_LENGTH) {
            spannable.setSpan(
                WForegroundColorSpan(edgeColor),
                0,
                address.length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
            return spannable
        }
        spannable.setSpan(
            WForegroundColorSpan(edgeColor),
            0,
            ADDRESS_EDGE_LENGTH,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        spannable.setSpan(
            WForegroundColorSpan(middleColor),
            ADDRESS_EDGE_LENGTH,
            address.length - ADDRESS_EDGE_LENGTH,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        spannable.setSpan(
            WForegroundColorSpan(edgeColor),
            address.length - ADDRESS_EDGE_LENGTH,
            address.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        return spannable
    }

    fun encryptedCommentSpan(context: Context): SpannableStringBuilder {
        val builder = SpannableStringBuilder()
        context.getDrawableCompat(
            org.mytonwallet.app_air.icons.R.drawable.ic_lock
        )?.let { drawable ->
            drawable.mutate()
            drawable.setTint(Color.WHITE)
            val width = 16.dp
            val height = 16.dp
            drawable.setBounds(0, 0, width, height)
            val imageSpan = VerticalImageSpan(drawable)
            builder.append(" ", imageSpan, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        builder.append(" ${LocaleController.getString("Encrypted Message")}")
        builder.setSpan(StyleSpan(Typeface.ITALIC), 0, builder.length, 0)
        return builder
    }
}
