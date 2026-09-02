package org.mytonwallet.app_air.uibrowser.search

import java.util.concurrent.ConcurrentHashMap
import org.mytonwallet.app_air.walletcore.moshi.IApiToken

/**
 * Widens the token candidate set beyond plain substring matching, so a typo (`tehter`) or a
 * non-Latin spelling (`Тезер`) still reaches the ranker, which then decides how strong the hit is.
 *
 * This only admits candidates. Ordering and promotion stay with [SearchResultRanker].
 */
object TokenSearchMatching {
    private val matcher = UniversalSearchMatcher()

    /**
     * A character no query contains, so a keyword never matches across a field boundary the way
     * [IApiToken.matchesSearch]'s per-field checks would not.
     */
    private const val FIELD_SEPARATOR = '\u0000'

    /**
     * Normalizing a token's fields costs far more than matching against them, and the whole
     * catalog is re-matched on every keystroke, so the per-token forms are kept per slug and
     * rebuilt only when the token's searchable fields change (for example on a language switch).
     * The haystack is cheap and built eagerly; the fuzzy document pays for text normalization,
     * so it is built only when a fuzzy match (or [warmUp]) first needs it.
     */
    private class CachedEntry(val sourceHash: Int, val haystack: String) {
        @Volatile
        var documentBuilt: Boolean = false

        @Volatile
        var document: IndexedSearchDocument? = null
    }

    private val entriesBySlug = ConcurrentHashMap<String, CachedEntry>()

    /**
     * Digest of every field the haystack and fuzzy document are built from, so cache freshness
     * and catalog fingerprints cover the same inputs.
     */
    fun searchableFieldsHash(token: IApiToken): Int {
        var hash = token.symbol?.hashCode() ?: 0
        hash = hash * 31 + (token.name?.hashCode() ?: 0)
        hash = hash * 31 + (token.localizedName?.hashCode() ?: 0)
        hash = hash * 31 + (token.label?.hashCode() ?: 0)
        hash = hash * 31 + (token.chain?.hashCode() ?: 0)
        hash = hash * 31 + (token.tokenAddress?.hashCode() ?: 0)
        hash = hash * 31 + (token.keywords?.hashCode() ?: 0)
        return hash
    }

    /** Builds the per-token caches, fuzzy documents included, off the search hot path. */
    fun warmUp(tokens: Iterable<IApiToken>) {
        tokens.forEach { indexedDocument(it) }
    }

    /**
     * Builds only the substring haystacks — a small fraction of the full warm-up cost — so the
     * instant search phase stops paying for them inline as soon as possible after launch.
     */
    fun warmUpHaystacks(tokens: Iterable<IApiToken>) {
        tokens.forEach { cachedEntry(it) }
    }

    /**
     * Same field coverage as [IApiToken.matchesSearch], against a cached lowercased haystack, so
     * the catalog-wide scan does not re-lowercase every field of every token on each keystroke.
     * [keywordLower] must already be trimmed, non-empty and lowercased.
     */
    fun matchesSubstring(token: IApiToken, keywordLower: String): Boolean =
        cachedEntry(token).haystack.contains(keywordLower)

    /** The cached lowercased haystack, for callers that index many tokens into one scan. */
    fun haystackOf(token: IApiToken): String = cachedEntry(token).haystack

    fun matchesLoosely(token: IApiToken, query: UniversalSearchQuery): Boolean {
        if (query.isEmpty) return false
        val document = indexedDocument(token) ?: return false
        return matcher.matches(document, query)
    }

    private fun indexedDocument(token: IApiToken): IndexedSearchDocument? {
        val entry = cachedEntry(token)
        if (!entry.documentBuilt) {
            // A concurrent build of the same entry is idempotent, so no lock is needed.
            entry.document = buildDocument(token)
            entry.documentBuilt = true
        }
        return entry.document
    }

    private fun cachedEntry(token: IApiToken): CachedEntry {
        val sourceHash = searchableFieldsHash(token)
        val cached = entriesBySlug[token.slug]
        if (cached != null && cached.sourceHash == sourceHash) {
            return cached
        }

        val entry = CachedEntry(
            sourceHash = sourceHash,
            haystack = buildHaystack(token)
        )
        entriesBySlug[token.slug] = entry
        return entry
    }

    private fun buildDocument(token: IApiToken): IndexedSearchDocument? {
        val fields = ArrayList<SearchField>(4)
        token.symbol?.takeIf { it.isNotEmpty() }
            ?.let { fields.add(SearchField(it, SearchFieldKind.SYMBOL)) }
        token.name?.takeIf { it.isNotEmpty() }
            ?.let { fields.add(SearchField(it, SearchFieldKind.TITLE)) }
        token.localizedName?.takeIf { it.isNotEmpty() }
            ?.let { fields.add(SearchField(it, SearchFieldKind.ALIAS)) }

        return if (fields.isEmpty()) {
            null
        } else {
            IndexedSearchDocument(
                SearchDocument(
                    id = token.slug,
                    kind = SearchEntityKind.TOKEN,
                    fields = fields
                )
            )
        }
    }

    private fun buildHaystack(token: IApiToken): String = buildList {
        token.name?.let(::add)
        token.localizedName?.let(::add)
        token.symbol?.let(::add)
        token.label?.let(::add)
        token.chain?.let(::add)
        token.chain?.replace('_', ' ')?.replace('-', ' ')?.let(::add)
        token.tokenAddress?.let(::add)
        token.keywords?.forEach(::add)
    }.joinToString(FIELD_SEPARATOR.toString()).lowercase()
}
