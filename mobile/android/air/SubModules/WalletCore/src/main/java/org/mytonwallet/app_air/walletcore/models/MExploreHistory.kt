package org.mytonwallet.app_air.walletcore.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class MExploreHistory(
    val searchHistory: MutableList<HistoryItem> = mutableListOf(),
    val visitedSites: MutableList<VisitedSite> = mutableListOf(),
    @Json(name = "recentTokenSlugs")
    internal val mutableRecentTokenSlugs: MutableList<String> = mutableListOf()
) {
    fun recentTokenSlugs(): List<String> = mutableRecentTokenSlugs.toList()

    fun rememberOpenedToken(tokenSlug: String, limit: Int): Boolean {
        if (tokenSlug.isBlank() || limit <= 0) return false
        val previous = mutableRecentTokenSlugs.toList()
        mutableRecentTokenSlugs.removeAll { it == tokenSlug }
        mutableRecentTokenSlugs.add(0, tokenSlug)
        while (mutableRecentTokenSlugs.size > limit) {
            mutableRecentTokenSlugs.removeAt(mutableRecentTokenSlugs.lastIndex)
        }
        return mutableRecentTokenSlugs != previous
    }

    @JsonClass(generateAdapter = true)
    data class HistoryItem(val title: String, val visitDate: Long?)

    @JsonClass(generateAdapter = true)
    data class VisitedSite(
        val favicon: String,
        val title: String,
        val url: String,
        val visitDate: Long
    )
}
