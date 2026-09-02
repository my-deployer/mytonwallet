@file:Suppress("ktlint:standard:filename")

package org.mytonwallet.app_air.walletcore.api

import org.mytonwallet.app_air.walletcontext.cacheStorage.WCacheStorage
import org.mytonwallet.app_air.walletcontext.globalStorage.WGlobalStorage
import org.mytonwallet.app_air.walletcore.JSWebViewBridge
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.moshi.MApiMarketAssetsResponse
import org.mytonwallet.app_air.walletcore.moshi.api.ApiMethod

fun WalletCore.fetchMarketAssets(
    callback: (MApiMarketAssetsResponse?, JSWebViewBridge.ApiError?) -> Unit
) {
    call(ApiMethod.Tokens.FetchMarketAssets(WGlobalStorage.getLangCode())) { raw, res, err ->
        if (err == null && res != null) {
            WCacheStorage.setMarketAssets(raw)
        }
        callback(res, err)
    }
}

fun WalletCore.cachedMarketAssets(): MApiMarketAssetsResponse? =
    WCacheStorage.getMarketAssets()?.let { cached ->
        try {
            moshi.adapter(MApiMarketAssetsResponse::class.java).fromJson(cached)
        } catch (_: Exception) {
            WCacheStorage.setMarketAssets(null)
            null
        }
    }
