import Testing
@testable import WalletCore

@Suite("Activity List Snapshot")
struct ActivityListSnapshotProxyTests {
    @Test
    func `unknown history uses skeletons and known empty history uses empty state`() {
        var proxy = ActivityListSnapshotProxy(accountId: "0-mainnet", customSectionIDs: [])

        proxy.didUpdateData(idsByDate: nil)
        let loadingSnapshot = proxy.makeSnapshot(idsByDate: nil, isEndReached: nil, updatedIds: [])

        #expect(loadingSnapshot.sectionIdentifiers.contains(.placeholderTransactionsSection))
        #expect(!loadingSnapshot.sectionIdentifiers.contains(.emptyPlaceholder))

        proxy.didUpdateData(idsByDate: [:])
        let emptySnapshot = proxy.makeSnapshot(idsByDate: [:], isEndReached: true, updatedIds: [])

        #expect(!emptySnapshot.sectionIdentifiers.contains(.placeholderTransactionsSection))
        #expect(emptySnapshot.sectionIdentifiers.contains(.emptyPlaceholder))
        #expect(emptySnapshot.itemIdentifiers.contains(.emptyPlaceholder))
    }

    @Test
    func `empty filtered history keeps loading until history end is known`() {
        for isEndReached in [nil, false] as [Bool?] {
            var proxy = ActivityListSnapshotProxy(accountId: "0-mainnet", customSectionIDs: [])
            proxy.didUpdateData(idsByDate: [:])

            let snapshot = proxy.makeSnapshot(idsByDate: [:], isEndReached: isEndReached, updatedIds: [])

            #expect(!snapshot.sectionIdentifiers.contains(.emptyPlaceholder))
            #expect(!snapshot.itemIdentifiers.contains(.emptyPlaceholder))
            #expect(snapshot.itemIdentifiers.contains(.loadingMore))

            let actions = proxy.rowDidBecomeVisible(.loadingMore, isEndReached: isEndReached)
            #expect(actions.shouldRequestRemotePage)
        }
    }
}
