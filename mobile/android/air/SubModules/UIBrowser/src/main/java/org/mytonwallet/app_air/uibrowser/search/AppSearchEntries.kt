package org.mytonwallet.app_air.uibrowser.search

import org.mytonwallet.app_air.icons.R
import org.mytonwallet.app_air.walletbasecontext.APP_SCHEME
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletcore.models.MAccount
import org.mytonwallet.app_air.walletcore.stores.AccountStore
import org.mytonwallet.app_air.walletcore.stores.ConfigStore
import org.mytonwallet.app_air.walletcore.stores.DappsStore

data class AppSearchEntry(
    val id: String,
    val isAction: Boolean,
    val iconRes: Int,
    val gradientIndex: Int = 0,
    val deeplink: String,
    private val titleKey: String,
    private val subtitleKey: String? = null,
    val aliases: List<String> = emptyList(),
    val keywords: List<String> = emptyList(),
    val isAvailable: () -> Boolean = { true }
) {
    val title: String get() = LocaleController.getString(titleKey)
    val subtitle: String? get() = subtitleKey?.let { LocaleController.getString(it) }

    fun matches(query: String): Boolean {
        val keyword = query.trim().lowercase()
        if (keyword.isEmpty()) return false
        return (sequenceOf(title, titleKey) + aliases + keywords)
            .any { it.lowercase().contains(keyword) }
    }
}

object AppSearchEntries {
    val actions: List<AppSearchEntry> by lazy {
        listOf(
            AppSearchEntry(
                id = "action:fund",
                isAction = true,
                iconRes = R.drawable.ic_header_add_outline,
                gradientIndex = 2,
                deeplink = "$APP_SCHEME://receive",
                titleKey = "Fund",
                aliases = listOf("Receive", "Add Crypto"),
                keywords = listOf("deposit"),
                isAvailable = { AccountStore.activeAccount?.supportsReceiveScreen == true }
            ),
            AppSearchEntry(
                id = "action:send",
                isAction = true,
                iconRes = R.drawable.ic_header_send_outline,
                gradientIndex = 4,
                deeplink = "$APP_SCHEME://send",
                titleKey = "Send",
                keywords = listOf("transfer"),
                isAvailable = {
                    val accountType = AccountStore.activeAccount?.accountType
                    accountType != null && accountType != MAccount.AccountType.VIEW
                }
            ),
            AppSearchEntry(
                id = "action:swap",
                isAction = true,
                iconRes = R.drawable.ic_header_swap_outline,
                gradientIndex = 6,
                deeplink = "$APP_SCHEME://swap",
                titleKey = "Swap",
                keywords = listOf("exchange", "convert"),
                isAvailable = { AccountStore.activeAccount?.supportsSwap == true }
            ),
            AppSearchEntry(
                id = "action:earn",
                isAction = true,
                iconRes = R.drawable.ic_header_earn_outline,
                gradientIndex = 3,
                deeplink = "$APP_SCHEME://stake",
                titleKey = "Earn",
                aliases = listOf("Stake"),
                keywords = listOf("staking"),
                isAvailable = { AccountStore.activeAccount?.isMainnet == true }
            ),
            AppSearchEntry(
                id = "action:buy-with-card",
                isAction = true,
                iconRes = R.drawable.ic_header_buy_outline,
                gradientIndex = 1,
                deeplink = "$APP_SCHEME://buy-with-card",
                titleKey = "Buy with Card",
                keywords = listOf("buy"),
                isAvailable = {
                    AccountStore.activeAccount?.supportsBuyWithCard == true &&
                        ConfigStore.isLimited != true
                }
            )
        )
    }

    val settings: List<AppSearchEntry> by lazy {
        listOf(
            AppSearchEntry(
                id = "setting:appearance",
                isAction = false,
                iconRes = R.drawable.ic_appearance,
                deeplink = "$APP_SCHEME://settings/appearance",
                titleKey = "Appearance",
                subtitleKey = "Night Mode, Palette, Card",
                keywords = listOf("theme", "night mode", "dark mode", "palette")
            ),
            AppSearchEntry(
                id = "setting:notifications",
                isAction = false,
                iconRes = R.drawable.ic_notifications,
                deeplink = "$APP_SCHEME://settings/notifications",
                titleKey = "Notifications & Sounds",
                subtitleKey = "Wallets, Sounds",
                aliases = listOf("Notifications")
            ),
            AppSearchEntry(
                id = "setting:assets",
                isAction = false,
                iconRes = R.drawable.ic_assets_activities,
                deeplink = "$APP_SCHEME://settings/assets",
                titleKey = "Assets & Activity",
                subtitleKey = "Base Currency, Token Order, Hidden NFTs",
                keywords = listOf("base currency", "hidden nfts", "token order")
            ),
            AppSearchEntry(
                id = "setting:dapps",
                isAction = false,
                iconRes = R.drawable.ic_apps,
                deeplink = "$APP_SCHEME://settings/dapps",
                titleKey = "Connected Apps",
                keywords = listOf("dapps", "disconnect"),
                isAvailable = {
                    DappsStore.dApps[AccountStore.activeAccountId]?.isNotEmpty() == true
                }
            ),
            AppSearchEntry(
                id = "setting:language",
                isAction = false,
                iconRes = R.drawable.ic_language,
                deeplink = "$APP_SCHEME://settings/language",
                titleKey = "Language"
            ),
            AppSearchEntry(
                id = "setting:wallet-versions",
                isAction = false,
                iconRes = R.drawable.ic_versions,
                deeplink = "$APP_SCHEME://settings/wallet-version",
                titleKey = "Wallet Versions",
                subtitleKey = "Your assets on other TON contracts",
                isAvailable = {
                    AccountStore.walletVersionsData?.versions?.isNotEmpty() == true
                }
            ),
            AppSearchEntry(
                id = "setting:about",
                isAction = false,
                iconRes = R.drawable.ic_about,
                deeplink = "$APP_SCHEME://settings/about",
                titleKey = "About"
            )
        )
    }
}
