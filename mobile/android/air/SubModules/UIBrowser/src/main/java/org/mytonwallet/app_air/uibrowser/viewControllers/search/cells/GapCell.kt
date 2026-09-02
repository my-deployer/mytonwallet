package org.mytonwallet.app_air.uibrowser.viewControllers.search.cells

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import androidx.core.view.updateLayoutParams
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WCell

@SuppressLint("ViewConstructor")
class GapCell(context: Context) : WCell(context, LayoutParams(MATCH_PARENT, DEFAULT_HEIGHT.dp)) {
    fun configure(isTrailing: Boolean) {
        updateLayoutParams {
            height = if (isTrailing) 0 else DEFAULT_HEIGHT.dp
        }
    }

    private companion object {
        const val DEFAULT_HEIGHT = 12
    }
}
