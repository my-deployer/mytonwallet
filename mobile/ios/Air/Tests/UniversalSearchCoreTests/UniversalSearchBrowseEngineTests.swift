import Foundation
import Testing
import UniversalSearchCore

@Suite("Universal Search browse ranking")
struct UniversalSearchBrowseEngineTests {
    private let engine = UniversalSearchBrowseEngine()
    private let now = Date(timeIntervalSince1970: 2_000)

    @Test
    func `recent includes only selected entities ordered by latest interaction`() {
        let older = document(
            id: "app:older",
            interaction: SearchInteractionSignal(
                lastSelectedAt: now.addingTimeInterval(-10),
                selectionCount: 100
            )
        )
        let newer = document(
            id: "app:newer",
            interaction: SearchInteractionSignal(
                lastSelectedAt: now,
                selectionCount: 1
            )
        )
        let neverSelected = document(id: "app:never")

        let snapshot = engine.snapshot(
            in: [older, neverSelected, newer],
            corpusRevision: 4,
            now: now
        )

        #expect(snapshot.recentDocuments.map(\.id) == [newer.id, older.id])
        #expect(snapshot.corpusRevision == 4)
        #expect(snapshot.corpusDocumentCount == 3)
    }

    @Test
    func `fresh recommendations lead trending and expired signals disappear`() {
        let source = SearchSourceID("backend:trending")
        let recommended = document(
            id: "app:recommended",
            recommendation: SearchRankedSignal(
                source: source,
                score: 0.1,
                expiresAt: now.addingTimeInterval(10)
            )
        )
        let popular = document(id: "app:popular", traits: [.popular, .verified])
        let expired = document(
            id: "app:expired",
            recommendation: SearchRankedSignal(
                source: source,
                score: 1,
                expiresAt: now.addingTimeInterval(-1)
            )
        )

        let snapshot = engine.snapshot(
            in: [popular, expired, recommended],
            corpusRevision: 1,
            now: now
        )

        #expect(snapshot.trendingDocuments.map(\.id) == [recommended.id, popular.id])
    }

    @Test
    func `recommendation and popularity rank values preserve feed order`() {
        let source = SearchSourceID("backend:discovery")
        let first = document(
            id: "app:first",
            recommendation: SearchRankedSignal(source: source, rank: 1)
        )
        let second = document(
            id: "app:second",
            recommendation: SearchRankedSignal(source: source, rank: 2)
        )
        let popular = document(
            id: "app:popular",
            popularity: SearchRankedSignal(source: source, rank: 1)
        )

        let snapshot = engine.snapshot(
            in: [popular, second, first],
            corpusRevision: 1,
            now: now
        )

        #expect(snapshot.trendingDocuments.map(\.id) == [first.id, second.id, popular.id])
    }

    @Test
    func `established token is a fallback until a discovery feed is available`() {
        let token = SearchDocument(
            id: SearchEntityID("token:held"),
            kind: .token,
            fields: [.init("Held", kind: .title)],
            signals: SearchSignals(traits: [.held])
        )
        let unknownApp = document(id: "app:unknown")

        let snapshot = engine.snapshot(
            in: [unknownApp, token],
            corpusRevision: 1,
            now: now
        )

        #expect(snapshot.trendingDocuments.map(\.id) == [token.id])
    }

    private func document(
        id: String,
        traits: SearchTraits = [],
        interaction: SearchInteractionSignal? = nil,
        popularity: SearchRankedSignal? = nil,
        recommendation: SearchRankedSignal? = nil
    ) -> SearchDocument {
        SearchDocument(
            id: SearchEntityID(id),
            kind: .application,
            fields: [.init(id, kind: .title)],
            signals: SearchSignals(
                traits: traits,
                interaction: interaction,
                popularity: popularity,
                recommendation: recommendation
            )
        )
    }
}
