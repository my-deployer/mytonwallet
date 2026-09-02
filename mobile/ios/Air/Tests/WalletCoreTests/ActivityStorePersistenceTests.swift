import GRDB
import Foundation
import Testing
@testable import WalletCore

@Suite("Activity Store Persistence", .serialized)
struct ActivityStorePersistenceTests {
    @Test
    func `persistence snapshot excludes local and pending activities`() {
        let local = activity(id: "local:local", status: .pendingTrusted)
        let pending = activity(id: "pending", status: .pending)
        let confirmed = activity(id: "confirmed", status: .confirmed)
        let state = _ActivityStore.AccountState(
            accountId: "0-mainnet",
            byId: [local.id: local, pending.id: pending, confirmed.id: confirmed],
            idsMain: [local.id, pending.id, confirmed.id],
            idsBySlug: ["toncoin": [local.id, pending.id, confirmed.id]],
            newestActivitiesBySlug: ["toncoin": local],
            isMainHistoryEndReached: false,
            isHistoryEndReachedBySlug: ["toncoin": false],
            localActivityIds: [local.id],
            pendingActivityIds: ["ton": [pending.id]],
            isInitialLoadedByChain: ["ton": true]
        )

        let snapshot = state.persistenceSnapshot()

        #expect(snapshot.byId == [confirmed.id: confirmed])
        #expect(snapshot.idsMain == [confirmed.id])
        #expect(snapshot.idsBySlug == ["toncoin": [confirmed.id]])
        #expect(snapshot.localActivityIds == nil)
        #expect(snapshot.pendingActivityIds == nil)
        #expect(snapshot.newestActivitiesBySlug == ["toncoin": confirmed])
        #expect(snapshot.isInitialLoadedByChain == ["ton": true])
    }

    @Test
    func `late activities for a deleted account do not survive id reuse`() async throws {
        var configuration = Configuration()
        configuration.foreignKeysEnabled = true
        let db = try DatabaseQueue(configuration: configuration)
        try makeMigrator().migrate(db)

        let accountId = "1-mainnet"
        let confirmed = activity(id: "confirmed", status: .confirmed)
        let state = _ActivityStore.AccountState(
            accountId: accountId,
            byId: [confirmed.id: confirmed],
            idsMain: [confirmed.id],
            idsBySlug: ["toncoin": [confirmed.id]],
            newestActivitiesBySlug: ["toncoin": confirmed]
        )
        try await db.write { db in
            try insertAccount(accountId: accountId, address: "EQ-old", db: db)
            try state.insert(db)
        }

        let store = _ActivityStore()
        await store.use(db: db)
        #expect(await store.getNewestActivityTimestamps(accountId: accountId) == ["toncoin": confirmed.timestamp])

        try await db.write { db in
            try db.execute(sql: "DELETE FROM accounts WHERE id = ?", arguments: [accountId])
        }
        try await waitUntil {
            await store.getAccountState(accountId).byId == nil
        }

        store.walletCore(event: .initialActivities(.init(
            accountId: accountId,
            chain: .ton,
            mainActivities: [confirmed],
            mainHistoryHasMore: nil,
            bySlug: ["toncoin": [confirmed]]
        )))
        try await Task.sleep(for: .milliseconds(100))
        #expect(await store.getAccountState(accountId).byId == nil)

        try await db.write { db in
            try insertAccount(accountId: accountId, address: "EQ-new", db: db)
        }
        let newActivity = activity(id: "new", status: .confirmed)
        try await waitUntil {
            store.walletCore(event: .initialActivities(.init(
                accountId: accountId,
                chain: .ton,
                mainActivities: [newActivity],
                mainHistoryHasMore: nil,
                bySlug: ["toncoin": [newActivity]]
            )))
            try await Task.sleep(for: .milliseconds(10))
            return await store.getActivity(accountId: accountId, activityId: newActivity.id) != nil
        }

        let reusedAccountState = await store.getAccountState(accountId)
        #expect(reusedAccountState.byId == [newActivity.id: newActivity])
        #expect(reusedAccountState.idsMain == [newActivity.id])
        #expect(await store.getActivity(accountId: accountId, activityId: confirmed.id) == nil)
    }

    @Test
    func `deleting an account cascades and notifies activity row observation`() async throws {
        var configuration = Configuration()
        configuration.foreignKeysEnabled = true
        let databaseURL = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString)
            .appendingPathExtension("sqlite")
        defer { try? FileManager.default.removeItem(at: databaseURL) }
        let db = try DatabasePool(path: databaseURL.path(), configuration: configuration)
        try makeMigrator().migrate(db)

        let accountId = "1-mainnet"
        let confirmed = activity(id: "confirmed", status: .confirmed)
        let state = _ActivityStore.AccountState(
            accountId: accountId,
            byId: [confirmed.id: confirmed],
            idsMain: [confirmed.id]
        )
        try await db.write { db in
            try insertAccount(accountId: accountId, address: "EQ-old", db: db)
            try state.insert(db)
        }

        let observation = ValueObservation.tracking { db in
            try String.fetchAll(db, sql: "SELECT accountId FROM account_activities")
        }
        var values = observation.values(in: db).makeAsyncIterator()
        #expect(try await values.next() == [accountId])

        try await db.write { db in
            try db.execute(sql: "DELETE FROM accounts WHERE id = ?", arguments: [accountId])
        }

        #expect(try await values.next() == [])
        let persistedState = try await db.read { db in
            try _ActivityStore.AccountState.fetchOne(db, key: accountId)
        }
        #expect(persistedState == nil)
    }
}

private func waitUntil(
    _ condition: @escaping () async throws -> Bool
) async throws {
    for _ in 0..<100 {
        if try await condition() {
            return
        }
        try await Task.sleep(for: .milliseconds(10))
    }
    Issue.record("Timed out waiting for activity store state")
}

private func insertAccount(accountId: String, address: String, db: Database) throws {
    try db.execute(
        sql: """
        INSERT INTO accounts (id, type, byChain)
        VALUES (?, ?, ?)
        """,
        arguments: [
            accountId,
            AccountType.mnemonic.rawValue,
            "{\"ton\":{\"address\":\"\(address)\"}}",
        ]
    )
}

private func activity(id: String, status: ApiTransactionStatus) -> ApiActivity {
    .transaction(
        ApiTransactionActivity(
            id: id,
            kind: "transaction",
            externalMsgHashNorm: nil,
            timestamp: 0,
            amount: 0,
            fromAddress: "from",
            toAddress: "to",
            comment: nil,
            encryptedComment: nil,
            fee: 0,
            slug: "toncoin",
            isIncoming: false,
            normalizedAddress: nil,
            type: nil,
            metadata: nil,
            nft: nil,
            status: status
        )
    )
}
