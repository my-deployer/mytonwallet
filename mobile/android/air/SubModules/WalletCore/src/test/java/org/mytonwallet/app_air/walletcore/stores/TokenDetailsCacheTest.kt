package org.mytonwallet.app_air.walletcore.stores

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mytonwallet.app_air.walletcore.moshi.MApiTokenDetails
import org.mytonwallet.app_air.walletcore.moshi.MoshiBuilder

class TokenDetailsCacheTest {
    private val now = 1_000_000L
    private val validity = 15 * 60 * 1000L

    @Test
    fun sharesDetailsAcrossAccounts() {
        val details = tokenDetails("token", "Shared")
        val cache = TokenDetailsCache()
            .remember("account-1", listOf("token"), limit = 50, promoteExisting = true)
            .remember("account-2", listOf("token"), limit = 50, promoteExisting = true)
            .store("en", details, now)

        assertEquals(details, cache.cachedDetails("en", "token", now, validity))
        assertEquals(1, cache.entriesByLanguage.getValue("en").size)
    }

    @Test
    fun expiresDetailsAfterValidityWindow() {
        val details = tokenDetails("token", "Description")
        val cache = TokenDetailsCache()
            .remember("account", listOf("token"), limit = 50, promoteExisting = true)
            .store("en", details, now)

        assertEquals(details, cache.cachedDetails("en", "token", now + validity - 1, validity))
        assertNull(cache.cachedDetails("en", "token", now + validity, validity))
        assertNull(cache.cachedDetails("en", "token", now - 1, validity))
    }

    @Test
    fun cachesSuccessfulResponseWithoutPublicInfo() {
        val details = MApiTokenDetails(slug = "token")
        val cache = TokenDetailsCache()
            .remember("account", listOf("token"), limit = 50, promoteExisting = true)
            .store("en", details, now)

        assertEquals(details, cache.cachedDetails("en", "token", now, validity))
        assertNull(cache.cachedDetails("en", "token", now + validity, validity))
    }

    @Test
    fun capsRecentTokensPerAccount() {
        val initialSlugs = (0..<50).map { "token-$it" }
        val cache = TokenDetailsCache()
            .remember("account", initialSlugs, limit = 50, promoteExisting = true)
            .remember("account", listOf("recent"), limit = 50, promoteExisting = true)

        assertEquals(50, cache.recentSlugsByAccountId.getValue("account").size)
        assertEquals("recent", cache.recentSlugsByAccountId.getValue("account").first())
        assertNull(cache.recentSlugsByAccountId.getValue("account").find { it == "token-49" })
    }

    @Test
    fun keepsExistingRecencyWhenPreloadRunsAgain() {
        val cache = TokenDetailsCache()
            .remember("account", listOf("top-1", "top-2"), 50, promoteExisting = false)
            .remember("account", listOf("recent"), 50, promoteExisting = true)
            .remember("account", listOf("top-1", "top-2"), 50, promoteExisting = false)

        assertEquals(
            listOf("recent", "top-1", "top-2"),
            cache.recentSlugsByAccountId.getValue("account")
        )
    }

    @Test
    fun separatesLocalizedDetails() {
        val english = tokenDetails("token", "English")
        val persian = tokenDetails("token", "Persian")
        val cache = TokenDetailsCache()
            .remember("account", listOf("token"), 50, promoteExisting = true)
            .store("en", english, now)
            .store("fa", persian, now)

        assertEquals(english, cache.cachedDetails("en", "token", now, validity))
        assertEquals(persian, cache.cachedDetails("fa", "token", now, validity))
    }

    @Test
    fun persistsAndRestoresCache() {
        val cache = TokenDetailsCache()
            .remember("account", listOf("token"), 50, promoteExisting = true)
            .store("en", tokenDetails("token", "Description"), now)
        val adapter = MoshiBuilder.build().adapter(TokenDetailsCache::class.java)

        assertEquals(cache, adapter.fromJson(adapter.toJson(cache)))
    }

    @Test
    fun removesSharedDetailsAfterLastAccountReference() {
        val details = tokenDetails("token", "Description")
        val cache = TokenDetailsCache()
            .remember("account-1", listOf("token"), 50, promoteExisting = true)
            .remember("account-2", listOf("token"), 50, promoteExisting = true)
            .store("en", details, now)

        val firstRemoved = cache.removeAccount("account-1")
        assertEquals(details, firstRemoved.cachedDetails("en", "token", now, validity))
        assertNull(
            firstRemoved.removeAccount("account-2")
                .cachedDetails("en", "token", now, validity)
        )
    }

    private fun tokenDetails(slug: String, description: String) = MApiTokenDetails(
        slug = slug,
        tokenInfo = MApiTokenDetails.TokenInfo(description = description)
    )
}
