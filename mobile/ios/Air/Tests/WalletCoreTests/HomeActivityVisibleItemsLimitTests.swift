import GRDB
import Testing
@testable import WalletCore

@Suite("Home Activity Visible Items Limit")
struct HomeActivityVisibleItemsLimitTests {
    @Test
    func `supported limits use top five by default`() {
        #expect(HomeActivityVisibleItemsLimit.allCases.map(\.rawValue) == [1, 3, 5, 10, 30])
        #expect(HomeActivityVisibleItemsLimit(storedValue: 5) == .top5)
        #expect(HomeActivityVisibleItemsLimit(storedValue: 7) == .top5)
    }

    @Test
    func `setting defaults to top five and persists`() throws {
        let db = try DatabaseQueue()
        try makeMigrator().migrate(db)

        let settings = SettingsStore()
        settings.use(db: db)
        #expect(settings.homeActivityVisibleItemsLimit == .top5)

        settings.setHomeActivityVisibleItemsLimit(.top30)

        let reloadedSettings = SettingsStore()
        reloadedSettings.use(db: db)
        #expect(reloadedSettings.homeActivityVisibleItemsLimit == .top30)
    }

    @Test
    func `v25 migration adds the default without changing existing settings`() throws {
        let db = try DatabaseQueue()
        let migrator = makeMigrator()
        try migrator.migrate(db, upTo: "v24")
        try db.write { db in
            try db.execute(sql: "UPDATE settings SET walletTokensLimit = 30 WHERE id = 0")
        }

        try migrator.migrate(db)

        let settings = SettingsStore()
        settings.use(db: db)
        #expect(settings.homeActivityVisibleItemsLimit == .top5)
        #expect(settings.homeWalletVisibleTokensLimit == .top30)
    }
}
