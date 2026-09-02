import Foundation

public enum UniversalSearchBrowseMode: String, Hashable, Sendable {
    case recent
    case trending
}

public struct UniversalSearchBrowseSnapshot: Hashable, Sendable {
    public let recentDocuments: [SearchDocument]
    public let trendingDocuments: [SearchDocument]
    public let corpusRevision: UInt64
    public let corpusDocumentCount: Int
    public let generatedAt: Date

    public init(
        recentDocuments: [SearchDocument],
        trendingDocuments: [SearchDocument],
        corpusRevision: UInt64,
        corpusDocumentCount: Int,
        generatedAt: Date
    ) {
        self.recentDocuments = recentDocuments
        self.trendingDocuments = trendingDocuments
        self.corpusRevision = corpusRevision
        self.corpusDocumentCount = corpusDocumentCount
        self.generatedAt = generatedAt
    }

    public func documents(for mode: UniversalSearchBrowseMode) -> [SearchDocument] {
        switch mode {
        case .recent:
            recentDocuments
        case .trending:
            trendingDocuments
        }
    }
}

/// Ranks the zero-query discovery surface independently from text relevance.
/// Recommendation and popularity are normalized signals, so future server
/// feeds can enrich the same documents without replacing their local source.
public struct UniversalSearchBrowseEngine: Sendable {
    public init() {}

    public func snapshot(
        in documents: [SearchDocument],
        corpusRevision: UInt64,
        now: Date = Date()
    ) -> UniversalSearchBrowseSnapshot {
        UniversalSearchBrowseSnapshot(
            recentDocuments: documents
                .filter { ($0.signals.interaction?.selectionCount ?? 0) > 0 }
                .sorted(by: recentPrecedes),
            trendingDocuments: documents
                .filter { isTrendingCandidate($0, at: now) }
                .sorted { trendingPrecedes($0, $1, at: now) },
            corpusRevision: corpusRevision,
            corpusDocumentCount: documents.count,
            generatedAt: now
        )
    }

    private func recentPrecedes(_ lhs: SearchDocument, _ rhs: SearchDocument) -> Bool {
        let lhsInteraction = lhs.signals.interaction
        let rhsInteraction = rhs.signals.interaction
        if lhsInteraction?.lastSelectedAt != rhsInteraction?.lastSelectedAt {
            return (lhsInteraction?.lastSelectedAt ?? .distantPast)
                > (rhsInteraction?.lastSelectedAt ?? .distantPast)
        }
        if lhsInteraction?.selectionCount != rhsInteraction?.selectionCount {
            return (lhsInteraction?.selectionCount ?? 0) > (rhsInteraction?.selectionCount ?? 0)
        }
        return lhs.id < rhs.id
    }

    private func isTrendingCandidate(_ document: SearchDocument, at date: Date) -> Bool {
        let signals = document.signals
        return rankedValue(signals.recommendation, at: date).freshness != .unavailable
            || rankedValue(signals.popularity, at: date).freshness != .unavailable
            || !signals.traits.intersection([.trending, .popular]).isEmpty
            || isTokenFallbackCandidate(document)
    }

    /// Until a token discovery feed is available, keep the Trending mode
    /// useful with lower-priority local evidence. Any ranked recommendation,
    /// popularity signal, or explicit popular/trending trait still wins first.
    private func isTokenFallbackCandidate(_ document: SearchDocument) -> Bool {
        guard document.kind == .token || document.kind == .stock else { return false }
        return !document.signals.traits
            .intersection([.held, .tracked, .hasMarketData])
            .isEmpty
    }

    private func trendingPrecedes(
        _ lhs: SearchDocument,
        _ rhs: SearchDocument,
        at date: Date
    ) -> Bool {
        let lhsKey = trendingKey(for: lhs, at: date)
        let rhsKey = trendingKey(for: rhs, at: date)
        if lhsKey != rhsKey {
            return lhsKey > rhsKey
        }
        return lhs.id < rhs.id
    }

    private func trendingKey(for document: SearchDocument, at date: Date) -> TrendingKey {
        let traits = document.signals.traits
        let recommendation = rankedValue(document.signals.recommendation, at: date)
        let popularity = rankedValue(document.signals.popularity, at: date)
        return TrendingKey(
            recommendationFreshness: recommendation.freshness,
            recommendationValue: recommendation.value,
            isTrending: traits.contains(.trending),
            popularityFreshness: popularity.freshness,
            popularityValue: popularity.value,
            isPopular: traits.contains(.popular),
            trustTier: trustTier(for: traits),
            hasMarketData: traits.contains(.hasMarketData),
            baseCurrencyValue: finiteNonnegative(document.signals.baseCurrencyValue)
        )
    }

    private func rankedValue(
        _ signal: SearchRankedSignal?,
        at date: Date
    ) -> (freshness: SearchSignalFreshness, value: Double) {
        guard let signal else { return (.unavailable, 0) }
        let freshness = signal.freshness(at: date)
        guard freshness != .unavailable else { return (.unavailable, 0) }
        if let score = signal.score, score.isFinite {
            return (freshness, min(max(score, 0), 1))
        }
        if let rank = signal.rank, rank > 0 {
            return (freshness, 1 / Double(rank))
        }
        return (freshness, 0)
    }

    private func trustTier(for traits: SearchTraits) -> SearchTrustTier {
        if traits.contains(.verified) {
            return .verified
        }
        if traits.contains(.curated) || traits.contains(.popular) {
            return .curated
        }
        if traits.contains(.hasMarketData) {
            return .established
        }
        return .unknown
    }

    private func finiteNonnegative(_ value: Double?) -> Double {
        guard let value, value.isFinite else { return 0 }
        return max(0, value)
    }
}

private struct TrendingKey: Hashable, Comparable {
    let recommendationFreshness: SearchSignalFreshness
    let recommendationValue: Double
    let isTrending: Bool
    let popularityFreshness: SearchSignalFreshness
    let popularityValue: Double
    let isPopular: Bool
    let trustTier: SearchTrustTier
    let hasMarketData: Bool
    let baseCurrencyValue: Double

    static func < (lhs: Self, rhs: Self) -> Bool {
        if lhs.recommendationFreshness != rhs.recommendationFreshness {
            return lhs.recommendationFreshness.rawValue < rhs.recommendationFreshness.rawValue
        }
        if lhs.recommendationValue != rhs.recommendationValue {
            return lhs.recommendationValue < rhs.recommendationValue
        }
        if lhs.isTrending != rhs.isTrending {
            return !lhs.isTrending && rhs.isTrending
        }
        if lhs.popularityFreshness != rhs.popularityFreshness {
            return lhs.popularityFreshness.rawValue < rhs.popularityFreshness.rawValue
        }
        if lhs.popularityValue != rhs.popularityValue {
            return lhs.popularityValue < rhs.popularityValue
        }
        if lhs.isPopular != rhs.isPopular {
            return !lhs.isPopular && rhs.isPopular
        }
        if lhs.trustTier != rhs.trustTier {
            return lhs.trustTier < rhs.trustTier
        }
        if lhs.hasMarketData != rhs.hasMarketData {
            return !lhs.hasMarketData && rhs.hasMarketData
        }
        return lhs.baseCurrencyValue < rhs.baseCurrencyValue
    }
}
