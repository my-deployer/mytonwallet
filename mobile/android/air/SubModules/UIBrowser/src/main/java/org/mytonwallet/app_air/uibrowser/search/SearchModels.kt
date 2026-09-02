package org.mytonwallet.app_air.uibrowser.search

enum class SearchEntityKind {
    TOKEN,
    COLLECTIBLE,
    COLLECTION,
    APPLICATION,
    WALLET,
    SITE,
    ACTION,
    SETTING
}

enum class SearchFieldKind(val rankingPriority: Int) {
    ADDRESS(850),
    DOMAIN(800),

    // Exact names and exact tickers are equally strong. Ownership and balance signals then break
    // ties, preventing an unrelated token that copied a well-known name into its symbol from
    // outranking the held native asset.
    SYMBOL(700),
    TITLE(700),
    ALIAS(500),
    URL(400),
    KEYWORD(300),
    DESCRIPTION(100)
}

enum class SearchFieldMatchPolicy { TEXT, EXACT }

data class SearchField(
    val value: String,
    val kind: SearchFieldKind,
    val matchPolicy: SearchFieldMatchPolicy = SearchFieldMatchPolicy.TEXT
)

enum class SearchDocumentMatchRequirement { ANY_TERM, EXACT_IDENTIFIER }

/** Ownership, provenance, and trust facts a source knows about an entity. */
enum class SearchTrait {
    OWNED,
    HELD,
    TRACKED,
    CONNECTED,
    VIEW_ONLY,
    EXTERNAL,
    FROM_HISTORY,
    POPULAR,
    TRENDING,
    CURATED,
    VERIFIED,
    HAS_MARKET_DATA
}

data class SearchSignals(
    val traits: Set<SearchTrait> = emptySet(),
    val baseCurrencyValue: Double? = null,
    val popularityRank: Int? = null
)

/**
 * One searchable entity, reduced to the fields that can match and the signals that rank it. The
 * [payload] carries the caller's own model so a hit can be mapped back without a second lookup.
 */
data class SearchDocument(
    val id: String,
    val kind: SearchEntityKind,
    val fields: List<SearchField>,
    val matchRequirement: SearchDocumentMatchRequirement = SearchDocumentMatchRequirement.ANY_TERM,
    val signals: SearchSignals = SearchSignals(),
    val payload: Any? = null
)
