package org.mytonwallet.app_air.walletcore.models

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mytonwallet.app_air.walletcore.moshi.MoshiBuilder

class MExploreHistoryTest {
    @Test
    fun remembersOpenedTokensInRecencyOrder() {
        val history = MExploreHistory()

        assertTrue(history.rememberOpenedToken("one", limit = 3))
        assertTrue(history.rememberOpenedToken("two", limit = 3))
        assertTrue(history.rememberOpenedToken("three", limit = 3))
        assertTrue(history.rememberOpenedToken("one", limit = 3))
        assertTrue(history.rememberOpenedToken("four", limit = 3))

        assertEquals(listOf("four", "one", "three"), history.recentTokenSlugs())
        assertFalse(history.rememberOpenedToken("four", limit = 3))
    }

    @Test
    fun loadsHistorySavedBeforeRecentTokensWereAdded() {
        val history = MoshiBuilder.build()
            .adapter(MExploreHistory::class.java)
            .fromJson("""{"searchHistory":[],"visitedSites":[]}""")

        assertEquals(emptyList<String>(), history?.recentTokenSlugs())
    }
}
