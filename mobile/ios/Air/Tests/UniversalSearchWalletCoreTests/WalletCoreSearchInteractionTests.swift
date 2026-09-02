import Foundation
import Testing
import UniversalSearchCore
import UniversalSearchWalletCore

@Suite("WalletCore Universal Search interactions")
struct WalletCoreSearchInteractionTests {
    @Test
    func `store persists counts timestamps and recency order`() {
        let fixture = DefaultsFixture()
        let defaults = fixture.defaults
        let key = makeStorageKey()
        let store = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key
        )
        let older = Date(timeIntervalSince1970: 1_000)
        let newer = Date(timeIntervalSince1970: 2_000)

        store.recordSelection(of: SearchEntityID("token:gram"), scopeID: "account", at: older)
        store.recordSelection(of: SearchEntityID("app:fragment"), scopeID: "account", at: newer)
        store.recordSelection(of: SearchEntityID("token:gram"), scopeID: "account", at: newer)

        let reloaded = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key
        ).records(scopeID: "account")

        #expect(reloaded.map(\.entityID) == [
            SearchEntityID("token:gram"),
            SearchEntityID("app:fragment"),
        ])
        #expect(reloaded.first?.selectionCount == 2)
        #expect(reloaded.first?.lastSelectedAt == newer)
    }

    @Test
    func `store keeps only most recent bounded records`() {
        let fixture = DefaultsFixture()
        let defaults = fixture.defaults
        let key = makeStorageKey()
        let store = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key,
            maximumRecordCount: 2
        )

        for index in 0..<3 {
            store.recordSelection(
                of: SearchEntityID("token:\(index)"),
                scopeID: "account",
                at: Date(timeIntervalSince1970: TimeInterval(index))
            )
        }

        #expect(store.records(scopeID: "account").map(\.entityID) == [
            SearchEntityID("token:2"),
            SearchEntityID("token:1"),
        ])
    }

    @Test
    func `malformed persisted state is safely ignored`() {
        let fixture = DefaultsFixture()
        let defaults = fixture.defaults
        let key = makeStorageKey()
        let scopedKey = "\(key).YWNjb3VudA"
        defaults.set(Data("not json".utf8), forKey: scopedKey)

        let store = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key
        )

        #expect(store.records(scopeID: "account").isEmpty)
    }

    @Test
    func `source contributes interactions without creating documents`() async throws {
        let fixture = DefaultsFixture()
        let defaults = fixture.defaults
        let key = makeStorageKey()
        let selectedAt = Date(timeIntervalSince1970: 2_000)
        let store = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key
        )
        store.recordSelection(
            of: SearchEntityID("app:fragment"),
            scopeID: "account",
            at: selectedAt
        )
        let source = WalletCoreSearchInteractionSource(
            store: store,
            clock: { Date(timeIntervalSince1970: 3_000) }
        )

        let snapshot = try await source.snapshot(for: context)

        #expect(snapshot.sourceID == WalletCoreSearchInteractionSource.id)
        #expect(snapshot.documents.isEmpty)
        #expect(snapshot.generatedAt == Date(timeIntervalSince1970: 3_000))
        #expect(snapshot.signalContributions.count == 1)
        #expect(snapshot.signalContributions.first?.entityID == SearchEntityID("app:fragment"))
        #expect(snapshot.signalContributions.first?.signals.interaction == SearchInteractionSignal(
            lastSelectedAt: selectedAt,
            selectionCount: 1
        ))
    }

    @Test
    func `interaction contribution affects live corpus ranking`() async throws {
        let fixture = DefaultsFixture()
        let defaults = fixture.defaults
        let key = makeStorageKey()
        let store = WalletCoreSearchInteractionStore(
            userDefaults: defaults,
            storageKey: key
        )
        let selectedID = SearchEntityID("token:selected")
        store.recordSelection(
            of: selectedID,
            scopeID: "account",
            at: Date(timeIntervalSince1970: 2_000)
        )
        let interactionSnapshot = try await WalletCoreSearchInteractionSource(
            store: store
        ).snapshot(for: context)
        let documentSnapshot = UniversalSearchSourceSnapshot(
            sourceID: SearchSourceID("test:documents"),
            generatedAt: Date(timeIntervalSince1970: 2_000),
            documents: [
                SearchDocument(
                    id: SearchEntityID("token:other"),
                    kind: .token,
                    fields: [.init("Gram", kind: .title)]
                ),
                SearchDocument(
                    id: selectedID,
                    kind: .token,
                    fields: [.init("Gram", kind: .title)]
                ),
            ]
        )
        let corpus = UniversalSearchCorpus(snapshots: [documentSnapshot, interactionSnapshot])

        let results = UniversalSearchEngine().search(
            "gram",
            in: corpus.documents(at: Date(timeIntervalSince1970: 2_000)),
            now: Date(timeIntervalSince1970: 2_000)
        )

        #expect(results.first?.id == selectedID)
    }

    @Test
    func `store isolates and clears interaction history by account`() {
        let fixture = DefaultsFixture()
        let store = WalletCoreSearchInteractionStore(
            userDefaults: fixture.defaults,
            storageKey: makeStorageKey()
        )
        let entityID = SearchEntityID("token:gram")

        store.recordSelection(of: entityID, scopeID: "account-a")

        #expect(store.records(scopeID: "account-a").map(\.entityID) == [entityID])
        #expect(store.records(scopeID: "account-b").isEmpty)

        store.clear(scopeID: "account-a")

        #expect(store.records(scopeID: "account-a").isEmpty)
    }

    private var context: UniversalSearchContext {
        UniversalSearchContext(
            scopeID: "account",
            network: "mainnet",
            localeIdentifier: "en"
        )
    }

    private func makeStorageKey() -> String {
        "WalletCoreSearchInteractionTests.\(UUID().uuidString)"
    }
}

private final class DefaultsFixture {
    let defaults: UserDefaults
    private let suiteName = "WalletCoreSearchInteractionTests.\(UUID().uuidString)"

    init() {
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    deinit {
        defaults.removePersistentDomain(forName: suiteName)
    }
}
