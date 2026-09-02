import Foundation
import GRDB
import Testing
import UniversalSearchCore
import UniversalSearchPersistence

@Suite("Universal Search persistent index")
struct GRDBUniversalSearchIndexStoreTests {
    private let context = UniversalSearchContext(
        scopeID: "account-a",
        network: "mainnet",
        localeIdentifier: "en"
    )
    private var scopeKey: String {
        UniversalSearchSourceScoping.account.scopeKey(for: context)
    }

    @Test
    func `restores source snapshots and retrieves text and exact candidates`() async throws {
        let fixture = try StoreFixture()
        defer { fixture.remove() }
        let store = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)
        let address = String(repeating: "a", count: 48)

        try await store.replace(
            snapshot(
                sourceID: "apps",
                documents: [document(
                    id: "app:fragment",
                    kind: .application,
                    fields: [.init("Fragment", kind: .title)],
                    traits: [.curated, .popular]
                )]
            ),
            scopeKey: scopeKey
        )
        try await store.replace(
            snapshot(
                sourceID: "tokens",
                documents: [document(
                    id: "token:address",
                    kind: .token,
                    fields: [
                        .init("USD Tether", kind: .title),
                        .init(address, kind: .address, matchPolicy: .exact),
                    ]
                )]
            ),
            scopeKey: scopeKey
        )

        let textCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("frag"),
            scopeKeys: [scopeKey],
            limit: 20
        )
        let exactCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery(address),
            scopeKeys: [scopeKey],
            limit: 20
        )

        let reopened = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)
        let restoredSnapshots = try await reopened.snapshots(forScopeKeys: [scopeKey])

        #expect(textCandidates == [SearchEntityID("app:fragment")])
        #expect(exactCandidates == [SearchEntityID("token:address")])
        #expect(restoredSnapshots.map(\.sourceID) == [SearchSourceID("apps"), SearchSourceID("tokens")])
    }

    @Test
    func `replacing a snapshot removes its previous searchable documents`() async throws {
        let fixture = try StoreFixture()
        defer { fixture.remove() }
        let store = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)

        try await store.replace(
            snapshot(
                sourceID: "apps",
                revision: "first",
                documents: [document(
                    id: "app:fragment",
                    kind: .application,
                    fields: [.init("Fragment", kind: .title)]
                )]
            ),
            scopeKey: scopeKey
        )
        try await store.replace(
            snapshot(
                sourceID: "apps",
                revision: "second",
                documents: [document(
                    id: "app:stonfi",
                    kind: .application,
                    fields: [.init("STON.fi", kind: .title)]
                )]
            ),
            scopeKey: scopeKey
        )

        let oldCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("fragment"),
            scopeKeys: [scopeKey],
            limit: 20
        )
        let newCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("ston"),
            scopeKeys: [scopeKey],
            limit: 20
        )

        #expect(oldCandidates.isEmpty)
        #expect(newCandidates == [SearchEntityID("app:stonfi")])
    }

    @Test
    func `snapshot replacement only rewrites changed materialized rows`() async throws {
        let fixture = try StoreFixture()
        defer { fixture.remove() }
        let store = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)
        let inspectionDatabase = try DatabaseQueue(path: fixture.databaseURL.path())

        try await store.replace(
            snapshot(
                sourceID: "apps",
                revision: "first",
                documents: [
                    document(
                        id: "app:fragment",
                        kind: .application,
                        fields: [.init("Fragment", kind: .title)]
                    ),
                    document(
                        id: "app:market",
                        kind: .application,
                        fields: [.init("Alpha Market", kind: .title)]
                    ),
                ]
            ),
            scopeKey: scopeKey
        )
        let originalRowIDs = try materializedRowIDs(in: inspectionDatabase)

        try await store.replace(
            snapshot(
                sourceID: "apps",
                revision: "second",
                documents: [
                    document(
                        id: "app:fragment",
                        kind: .application,
                        fields: [.init("Fragment", kind: .title)]
                    ),
                    document(
                        id: "app:market",
                        kind: .application,
                        fields: [.init("Beta Market", kind: .title)]
                    ),
                ]
            ),
            scopeKey: scopeKey
        )

        #expect(try materializedRowIDs(in: inspectionDatabase) == originalRowIDs)
        #expect(try await store.candidateEntityIDs(
            for: UniversalSearchQuery("alpha"),
            scopeKeys: [scopeKey],
            limit: 20
        ).isEmpty)
        #expect(try await store.candidateEntityIDs(
            for: UniversalSearchQuery("beta"),
            scopeKeys: [scopeKey],
            limit: 20
        ) == [SearchEntityID("app:market")])
    }

    @Test
    func `keeps account and network contexts isolated`() async throws {
        let fixture = try StoreFixture()
        defer { fixture.remove() }
        let store = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)
        let otherContext = UniversalSearchContext(
            scopeID: "account-b",
            network: "mainnet",
            localeIdentifier: "en"
        )
        let otherScopeKey = UniversalSearchSourceScoping.account.scopeKey(for: otherContext)

        try await store.replace(
            snapshot(
                sourceID: "wallets",
                documents: [document(
                    id: "wallet:private",
                    kind: .wallet,
                    fields: [.init("Private Wallet", kind: .title)]
                )]
            ),
            scopeKey: scopeKey
        )

        let currentCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("private"),
            scopeKeys: [scopeKey],
            limit: 20
        )
        let otherCandidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("private"),
            scopeKeys: [otherScopeKey],
            limit: 20
        )

        #expect(currentCandidates == [SearchEntityID("wallet:private")])
        #expect(otherCandidates.isEmpty)
        #expect(try await store.snapshots(forScopeKeys: [otherScopeKey]).isEmpty)
    }

    @Test
    func `corrupt snapshots are removed with their materialized documents`() async throws {
        let fixture = try StoreFixture()
        defer { fixture.remove() }
        let store = try GRDBUniversalSearchIndexStore(databaseURL: fixture.databaseURL)
        let inspectionDatabase = try DatabaseQueue(path: fixture.databaseURL.path())
        try await store.replace(
            snapshot(
                sourceID: "apps",
                documents: [document(
                    id: "app:fragment",
                    kind: .application,
                    fields: [.init("Fragment", kind: .title)]
                )]
            ),
            scopeKey: scopeKey
        )
        try await inspectionDatabase.write { db in
            try db.execute(
                sql: "UPDATE search_source_snapshots SET payload = ?",
                arguments: [Data("not a snapshot".utf8)]
            )
        }

        let restoredSnapshots = try await store.snapshots(forScopeKeys: [scopeKey])
        let candidates = try await store.candidateEntityIDs(
            for: UniversalSearchQuery("fragment"),
            scopeKeys: [scopeKey],
            limit: 20
        )
        let persistedSnapshotCount = try await inspectionDatabase.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM search_source_snapshots")
        }

        #expect(restoredSnapshots.isEmpty)
        #expect(candidates.isEmpty)
        #expect(persistedSnapshotCount == 0)
    }
}

private func materializedRowIDs(in database: DatabaseQueue) throws -> [String: Int64] {
    try database.read { db in
        let rows = try Row.fetchAll(
            db,
            sql: "SELECT id, entity_id FROM search_documents ORDER BY entity_id"
        )
        return Dictionary(uniqueKeysWithValues: rows.map { row -> (String, Int64) in
            let entityID: String = row["entity_id"]
            let rowID: Int64 = row["id"]
            return (entityID, rowID)
        })
    }
}

private struct StoreFixture {
    let directoryURL: URL
    let databaseURL: URL

    init() throws {
        directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("UniversalSearchTests-\(UUID().uuidString)", isDirectory: true)
        databaseURL = directoryURL.appendingPathComponent("search.sqlite")
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true
        )
    }

    func remove() {
        try? FileManager.default.removeItem(at: directoryURL)
    }
}

private func snapshot(
    sourceID: String,
    revision: String = "1",
    documents: [SearchDocument]
) -> UniversalSearchSourceSnapshot {
    UniversalSearchSourceSnapshot(
        sourceID: SearchSourceID(sourceID),
        revision: revision,
        generatedAt: Date(timeIntervalSince1970: 1),
        documents: documents
    )
}

private func document(
    id: String,
    kind: SearchEntityKind,
    fields: [SearchField],
    traits: SearchTraits = []
) -> SearchDocument {
    SearchDocument(
        id: SearchEntityID(id),
        kind: kind,
        fields: fields,
        signals: SearchSignals(traits: traits)
    )
}
