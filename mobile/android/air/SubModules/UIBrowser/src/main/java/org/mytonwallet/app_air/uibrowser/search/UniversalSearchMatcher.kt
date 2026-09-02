package org.mytonwallet.app_air.uibrowser.search

import kotlin.math.abs
import kotlin.math.min

/** How strongly a field matched, from a recovered typo up to an exact identifier. */
enum class SearchMatchKind(val weight: Int) {
    FUZZY(100),
    SUBSTRING(200),
    WORD_PREFIX(300),
    EXACT_WORD(400),
    PHRASE_PREFIX(500),
    EXACT_PHRASE(600),
    EXACT_IDENTIFIER(700)
}

data class SearchMatch(
    val kind: SearchMatchKind,
    val fieldKind: SearchFieldKind,
    val matchedTermCount: Int,
    val totalTermCount: Int,
    val usedTransliteration: Boolean,
    val matchedValue: String
)

data class UniversalSearchMatchingPolicy(
    val minimumPrefixLength: Int = 1,
    val minimumSubstringLength: Int = 2,
    val minimumFuzzyLength: Int = 4,
    val maximumEditDistance: Int = 1
) {
    companion object {
        val DEFAULT = UniversalSearchMatchingPolicy()
    }
}

/** A field with its normalized forms precomputed, so repeated queries do not re-fold it. */
class PreparedSearchField(val field: SearchField) {
    val normalizedText: NormalizedSearchText = SearchTextNormalizer.normalize(field.value)
    val normalizedIdentifier: String = SearchTextNormalizer.normalizeIdentifier(field.value)
}

class IndexedSearchDocument(val document: SearchDocument) {
    val fields: List<PreparedSearchField> = document.fields.map { PreparedSearchField(it) }
}

class UniversalSearchMatcher(
    private val policy: UniversalSearchMatchingPolicy = UniversalSearchMatchingPolicy.DEFAULT
) {

    fun match(document: SearchDocument, query: UniversalSearchQuery): SearchMatch? =
        match(IndexedSearchDocument(document), query)

    /**
     * Whether [match] would find any hit. Candidate admission only needs this boolean, and
     * stopping at the first hit skips the candidate building and comparing that dominate a
     * catalog-wide scan.
     */
    fun matches(indexedDocument: IndexedSearchDocument, query: UniversalSearchQuery): Boolean {
        if (query.isEmpty) return false

        val preparedFields = indexedDocument.fields
        if (hasExactIdentifier(preparedFields, query)) return true
        if (query.requiresExactIdentifierMatch) return false
        if (indexedDocument.document.matchRequirement ==
            SearchDocumentMatchRequirement.EXACT_IDENTIFIER
        ) {
            return false
        }
        if (hasPhraseMatch(preparedFields, query)) return true
        return query.normalizedText.terms.any { term -> hasTermMatch(term, preparedFields) }
    }

    private fun hasExactIdentifier(
        fields: List<PreparedSearchField>,
        query: UniversalSearchQuery
    ): Boolean = fields.any { prepared ->
        (
            prepared.field.matchPolicy == SearchFieldMatchPolicy.EXACT ||
                prepared.field.kind in IDENTIFIER_FIELD_KINDS
            ) &&
            prepared.normalizedIdentifier == query.normalizedIdentifier
    }

    private fun hasPhraseMatch(
        fields: List<PreparedSearchField>,
        query: UniversalSearchQuery
    ): Boolean {
        for (prepared in fields) {
            if (prepared.field.matchPolicy != SearchFieldMatchPolicy.TEXT) continue
            for (queryPhrase in query.normalizedText.phraseAlternatives) {
                for (fieldPhrase in prepared.normalizedText.phraseAlternatives) {
                    if (fieldPhrase == queryPhrase) return true
                    if (queryPhrase.length >= policy.minimumPrefixLength &&
                        fieldPhrase.startsWith(queryPhrase)
                    ) {
                        return true
                    }
                }
            }
        }
        return false
    }

    private fun hasTermMatch(
        queryTerm: NormalizedSearchTerm,
        fields: List<PreparedSearchField>
    ): Boolean {
        for (prepared in fields) {
            if (prepared.field.matchPolicy != SearchFieldMatchPolicy.TEXT) continue
            for (queryAlternative in queryTerm.alternatives) {
                for (fieldTerm in prepared.normalizedText.terms) {
                    for (fieldAlternative in fieldTerm.alternatives) {
                        if (matchKind(queryAlternative, fieldAlternative) != null) return true
                    }
                }
            }
        }
        return false
    }

    fun match(indexedDocument: IndexedSearchDocument, query: UniversalSearchQuery): SearchMatch? {
        if (query.isEmpty) return null

        val document = indexedDocument.document
        val preparedFields = indexedDocument.fields

        bestExactIdentifier(preparedFields, query)?.let {
            return it.toSearchMatch(query.termCount, query.termCount)
        }

        if (query.requiresExactIdentifierMatch) return null
        if (document.matchRequirement ==
            SearchDocumentMatchRequirement.EXACT_IDENTIFIER
        ) {
            return null
        }

        bestPhraseMatch(preparedFields, query)?.let {
            return it.toSearchMatch(query.termCount, query.termCount)
        }

        val termMatches = query.normalizedText.terms.mapNotNull { term ->
            bestMatch(term, preparedFields)
        }
        val strongest = termMatches.maxWithOrNull(MatchCandidate.COMPARATOR) ?: return null

        return strongest.toSearchMatch(termMatches.size, query.termCount)
    }

    private fun bestExactIdentifier(
        fields: List<PreparedSearchField>,
        query: UniversalSearchQuery
    ): MatchCandidate? = fields
        .asSequence()
        .filter { prepared ->
            prepared.field.matchPolicy == SearchFieldMatchPolicy.EXACT ||
                prepared.field.kind in IDENTIFIER_FIELD_KINDS
        }
        .filter { it.normalizedIdentifier == query.normalizedIdentifier }
        .map {
            MatchCandidate(
                kind = SearchMatchKind.EXACT_IDENTIFIER,
                fieldKind = it.field.kind,
                usedTransliteration = false,
                matchedValue = it.field.value
            )
        }
        .maxWithOrNull(MatchCandidate.COMPARATOR)

    private fun bestPhraseMatch(
        fields: List<PreparedSearchField>,
        query: UniversalSearchQuery
    ): MatchCandidate? {
        var best: MatchCandidate? = null
        for (prepared in fields) {
            if (prepared.field.matchPolicy != SearchFieldMatchPolicy.TEXT) continue
            query.normalizedText.phraseAlternatives.forEachIndexed { queryIndex, queryPhrase ->
                prepared.normalizedText.phraseAlternatives
                    .forEachIndexed { fieldIndex, fieldPhrase ->
                        val kind = when {
                            fieldPhrase == queryPhrase -> SearchMatchKind.EXACT_PHRASE

                            queryPhrase.length >= policy.minimumPrefixLength &&
                                fieldPhrase.startsWith(queryPhrase) -> SearchMatchKind.PHRASE_PREFIX

                            else -> null
                        }
                        if (kind != null) {
                            val candidate = MatchCandidate(
                                kind = kind,
                                fieldKind = prepared.field.kind,
                                usedTransliteration = queryIndex > 0 || fieldIndex > 0,
                                matchedValue = prepared.field.value
                            )
                            if (best == null ||
                                MatchCandidate.COMPARATOR.compare(candidate, best) > 0
                            ) {
                                best = candidate
                            }
                        }
                    }
            }
        }
        return best
    }

    private fun bestMatch(
        queryTerm: NormalizedSearchTerm,
        fields: List<PreparedSearchField>
    ): MatchCandidate? {
        var best: MatchCandidate? = null
        for (prepared in fields) {
            if (prepared.field.matchPolicy != SearchFieldMatchPolicy.TEXT) continue
            queryTerm.alternatives.forEachIndexed { queryIndex, queryAlternative ->
                for (fieldTerm in prepared.normalizedText.terms) {
                    fieldTerm.alternatives.forEachIndexed { fieldIndex, fieldAlternative ->
                        val kind = matchKind(queryAlternative, fieldAlternative)
                        if (kind != null) {
                            val candidate = MatchCandidate(
                                kind = kind,
                                fieldKind = prepared.field.kind,
                                usedTransliteration = queryIndex > 0 || fieldIndex > 0,
                                matchedValue = prepared.field.value
                            )
                            if (best == null ||
                                MatchCandidate.COMPARATOR.compare(candidate, best) > 0
                            ) {
                                best = candidate
                            }
                        }
                    }
                }
            }
        }
        return best
    }

    private fun matchKind(query: String, candidate: String): SearchMatchKind? {
        if (candidate == query) return SearchMatchKind.EXACT_WORD
        if (query.length >= policy.minimumPrefixLength && candidate.startsWith(query)) {
            return SearchMatchKind.WORD_PREFIX
        }
        if (query.length >= policy.minimumSubstringLength && candidate.contains(query)) {
            return SearchMatchKind.SUBSTRING
        }
        if (query.length >= policy.minimumFuzzyLength &&
            candidate.length >= policy.minimumFuzzyLength &&
            editDistance(query, candidate, policy.maximumEditDistance) <= policy.maximumEditDistance
        ) {
            return SearchMatchKind.FUZZY
        }
        return null
    }

    /** Levenshtein distance, abandoned as soon as every path already exceeds [limit]. */
    private fun editDistance(lhs: String, rhs: String, limit: Int): Int {
        if (abs(lhs.length - rhs.length) > limit) return limit + 1
        if (lhs.isEmpty()) return rhs.length
        if (rhs.isEmpty()) return lhs.length

        var previous = IntArray(rhs.length + 1) { it }
        val current = IntArray(rhs.length + 1)

        for (leftIndex in lhs.indices) {
            current[0] = leftIndex + 1
            var rowMinimum = current[0]
            for (rightIndex in rhs.indices) {
                val substitutionCost = if (lhs[leftIndex] == rhs[rightIndex]) 0 else 1
                current[rightIndex + 1] = min(
                    min(current[rightIndex] + 1, previous[rightIndex + 1] + 1),
                    previous[rightIndex] + substitutionCost
                )
                rowMinimum = min(rowMinimum, current[rightIndex + 1])
            }
            if (rowMinimum > limit) return limit + 1
            val swap = previous
            previous = current.copyInto(swap)
        }
        return previous[rhs.length]
    }

    private companion object {
        val IDENTIFIER_FIELD_KINDS = setOf(
            SearchFieldKind.ADDRESS,
            SearchFieldKind.DOMAIN
        )
    }
}

private class MatchCandidate(
    val kind: SearchMatchKind,
    val fieldKind: SearchFieldKind,
    val usedTransliteration: Boolean,
    val matchedValue: String
) {
    fun toSearchMatch(matchedTermCount: Int, totalTermCount: Int) = SearchMatch(
        kind = kind,
        fieldKind = fieldKind,
        matchedTermCount = matchedTermCount,
        totalTermCount = totalTermCount,
        usedTransliteration = usedTransliteration,
        matchedValue = matchedValue
    )

    companion object {
        // A direct spelling outranks a transliterated one; the value comparison only keeps the
        // ordering stable for otherwise identical candidates.
        val COMPARATOR: Comparator<MatchCandidate> = Comparator { lhs, rhs ->
            when {
                lhs.kind != rhs.kind -> lhs.kind.weight.compareTo(rhs.kind.weight)

                lhs.fieldKind.rankingPriority != rhs.fieldKind.rankingPriority ->
                    lhs.fieldKind.rankingPriority.compareTo(rhs.fieldKind.rankingPriority)

                lhs.usedTransliteration != rhs.usedTransliteration ->
                    if (lhs.usedTransliteration) -1 else 1

                else -> rhs.matchedValue.compareTo(lhs.matchedValue)
            }
        }
    }
}
