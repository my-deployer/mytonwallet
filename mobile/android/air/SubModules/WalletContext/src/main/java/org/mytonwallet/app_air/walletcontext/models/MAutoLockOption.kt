package org.mytonwallet.app_air.walletcontext.models

import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.utils.withLocalizedNumbers

enum class MAutoLockOption(val value: String, val period: Int?) {
    NEVER("never", null),
    THIRTY_SECONDS("1", 30),
    THREE_MINUTES("2", 3 * 60),
    TEN_MINUTES("3", 10 * 60);

    companion object {
        fun fromValue(value: String?): MAutoLockOption? {
            if (value == null) return NEVER
            return entries.firstOrNull { it.value == value }
        }
    }

    val displayName: String
        get() {
            return when (this) {
                NEVER -> {
                    LocaleController.getString("Never")
                }

                THIRTY_SECONDS -> {
                    LocaleController.getStringWithKeyValues(
                        "%count% seconds",
                        listOf("%count%" to "30".withLocalizedNumbers)
                    )
                }

                THREE_MINUTES -> {
                    LocaleController.getStringWithKeyValues(
                        "%count% minutes",
                        listOf("%count%" to "3".withLocalizedNumbers)
                    )
                }

                TEN_MINUTES -> {
                    LocaleController.getStringWithKeyValues(
                        "%count% minutes",
                        listOf("%count%" to "10".withLocalizedNumbers)
                    )
                }
            }
        }
}
