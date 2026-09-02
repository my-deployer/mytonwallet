package org.mytonwallet.app_air.walletcore.stores

import com.squareup.moshi.JsonClass
import org.mytonwallet.app_air.walletcore.moshi.MApiTokenDetails

@JsonClass(generateAdapter = true)
internal data class TokenDetailsCache(
    val entriesByLanguage: Map<String, Map<String, TokenDetailsCacheEntry>> = emptyMap(),
    val recentSlugsByAccountId: Map<String, List<String>> = emptyMap()
) {
    fun cachedDetails(
        language: String,
        slug: String,
        now: Long,
        validity: Long
    ): MApiTokenDetails? = entriesByLanguage[language]
        ?.get(slug)
        ?.takeIf { it.isValid(now, validity) }
        ?.details

    fun remember(
        accountId: String,
        slugs: List<String>,
        limit: Int,
        promoteExisting: Boolean
    ): TokenDetailsCache {
        val existing = recentSlugsByAccountId[accountId].orEmpty()
        val candidates = if (promoteExisting) {
            slugs + existing
        } else {
            slugs.filterNot { it in existing } + existing
        }
        val remembered = candidates
            .asSequence()
            .filter { it.isNotBlank() }
            .distinct()
            .take(limit)
            .toList()
        if (remembered == existing) return this

        val updatedRecents = recentSlugsByAccountId.toMutableMap().apply {
            if (remembered.isEmpty()) remove(accountId) else put(accountId, remembered)
        }
        return copy(
            entriesByLanguage = pruneEntries(updatedRecents),
            recentSlugsByAccountId = updatedRecents
        )
    }

    fun store(language: String, details: MApiTokenDetails, fetchedAt: Long): TokenDetailsCache {
        if (details.slug !in referencedSlugs()) return this
        val languageEntries = entriesByLanguage[language].orEmpty()
        val entry = TokenDetailsCacheEntry(details, fetchedAt)
        if (languageEntries[details.slug] == entry) return this

        return copy(
            entriesByLanguage = entriesByLanguage.toMutableMap().apply {
                put(
                    language,
                    languageEntries.toMutableMap().apply { put(details.slug, entry) }
                )
            }
        )
    }

    fun removeAccount(accountId: String): TokenDetailsCache {
        if (accountId !in recentSlugsByAccountId) return this
        val updatedRecents = recentSlugsByAccountId - accountId
        return copy(
            entriesByLanguage = pruneEntries(updatedRecents),
            recentSlugsByAccountId = updatedRecents
        )
    }

    fun sanitized(
        validAccountIds: Set<String>,
        limit: Int,
        now: Long,
        validity: Long
    ): TokenDetailsCache {
        val updatedRecents = recentSlugsByAccountId
            .filterKeys { it in validAccountIds }
            .mapValues { (_, slugs) -> slugs.filter { it.isNotBlank() }.distinct().take(limit) }
            .filterValues { it.isNotEmpty() }
        val referencedSlugs = updatedRecents.values.flatten().toSet()
        val updatedEntries = entriesByLanguage.mapValuesNotNull { (_, entries) ->
            entries.filter { (slug, entry) ->
                slug in referencedSlugs && entry.isValid(now, validity)
            }.takeUnless { it.isEmpty() }
        }
        return copy(
            entriesByLanguage = updatedEntries,
            recentSlugsByAccountId = updatedRecents
        )
    }

    fun removingExpired(now: Long, validity: Long): TokenDetailsCache {
        val updatedEntries = entriesByLanguage.mapValuesNotNull { (_, entries) ->
            entries.filterValues { it.isValid(now, validity) }.takeUnless { it.isEmpty() }
        }
        return if (updatedEntries == entriesByLanguage) {
            this
        } else {
            copy(entriesByLanguage = updatedEntries)
        }
    }

    private fun referencedSlugs(): Set<String> = recentSlugsByAccountId.values.flatten().toSet()

    private fun pruneEntries(
        recentSlugs: Map<String, List<String>>
    ): Map<String, Map<String, TokenDetailsCacheEntry>> {
        val referencedSlugs = recentSlugs.values.flatten().toSet()
        return entriesByLanguage.mapValuesNotNull { (_, entries) ->
            entries.filterKeys { it in referencedSlugs }.takeUnless { it.isEmpty() }
        }
    }
}

@JsonClass(generateAdapter = true)
internal data class TokenDetailsCacheEntry(val details: MApiTokenDetails, val fetchedAt: Long) {
    fun isValid(now: Long, validity: Long): Boolean = fetchedAt <= now && now - fetchedAt < validity
}

private inline fun <K, V, R : Any> Map<out K, V>.mapValuesNotNull(
    transform: (Map.Entry<K, V>) -> R?
): Map<K, R> = buildMap {
    for (entry in this@mapValuesNotNull) {
        transform(entry)?.let { put(entry.key, it) }
    }
}
