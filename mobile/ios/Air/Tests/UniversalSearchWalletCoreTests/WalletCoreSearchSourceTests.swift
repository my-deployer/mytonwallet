import Foundation
import Testing
import UniversalSearchCore
import UniversalSearchWalletCore
import WalletContext
import WalletCore
import WalletCoreTypes

@Suite("WalletCore Universal Search sources")
struct WalletCoreSearchSourceTests {
    private let account = MAccount(
        id: "account-mainnet",
        title: "Main Wallet",
        type: .mnemonic,
        byChain: [.ton: AccountChain(address: "EQ-main")]
    )

    @Test
    func `token source maps searchable fields ownership and stock traits`() {
        let token = ApiToken(
            slug: "ton-tesla",
            name: "Tesla xStock",
            symbol: "TSLAx",
            decimals: 9,
            chain: .ton,
            tokenAddress: "EQ-stock",
            isPopular: true,
            keywords: ["rwa", "shares"],
            label: "xStocks",
            priceUsd: 10
        )
        let balance = MTokenBalance(tokenSlug: token.slug, balance: 1, isStaking: false)

        let documents = WalletCoreTokenSearchSource.documents(input: .init(
            account: account,
            tokens: [token],
            balances: [balance],
            trackedTokenSlugs: [token.slug]
        ))
        let document = documents.first

        #expect(document?.id == SearchEntityID("token:ton-tesla"))
        #expect(document?.kind == .stock)
        #expect(document?.signals.traits.contains([
            .held,
            .tracked,
            .popular,
            .hasMarketData,
        ]) == true)
        #expect(document?.fields.contains(SearchField("Tesla", kind: .title)) == true)
        #expect(document?.fields.contains(SearchField("TSLAx", kind: .symbol)) == true)
        #expect(document?.fields.contains(SearchField(
            "EQ-stock",
            kind: .address,
            matchPolicy: .exact
        )) == true)
        #expect(document?.attributeValue(for: WalletCoreSearchAttributeKey.tokenSlug) == token.slug)
    }

    @Test
    func `token source excludes chains unsupported by active account`() {
        let solanaToken = ApiToken(
            slug: "solana-test",
            name: "Solana Test",
            symbol: "SOLT",
            decimals: 9,
            chain: .solana
        )

        let documents = WalletCoreTokenSearchSource.documents(input: .init(
            account: account,
            tokens: [solanaToken],
            balances: [],
            trackedTokenSlugs: []
        ))

        #expect(documents.isEmpty)
    }

    @Test
    func `held Solana and USDT are immediately searchable case insensitively`() async throws {
        let multichainAccount = MAccount(
            id: "account-multichain-mainnet",
            title: "Multichain Wallet",
            type: .mnemonic,
            byChain: [
                .ton: AccountChain(address: "EQ-main"),
                .solana: AccountChain(address: "sol-main"),
            ]
        )
        let solana = ApiToken(
            slug: "solana",
            name: "Solana",
            symbol: "SOL",
            decimals: 9,
            chain: .solana
        )
        let fakeSolana = ApiToken(
            slug: "ton-fake-solana",
            name: "Solana Community Token",
            symbol: "SOLANA",
            decimals: 9,
            chain: .ton,
            isPopular: true
        )
        let usdt = ApiToken(
            slug: "ton-usdt",
            name: "Tether USD",
            symbol: "USDT",
            decimals: 6,
            chain: .ton,
            tokenAddress: "EQ-usdt"
        )
        let source = WalletCoreTokenSearchSource { _ in
            WalletCoreTokenSearchInput(
                account: multichainAccount,
                tokens: [fakeSolana, usdt, solana],
                balances: [
                    MTokenBalance(
                        tokenSlug: solana.slug,
                        balance: 10,
                        isStaking: false
                    ),
                    MTokenBalance(
                        tokenSlug: usdt.slug,
                        balance: 50,
                        isStaking: false
                    ),
                ],
                trackedTokenSlugs: []
            )
        }
        let coordinator = UniversalSearchCoordinator(sources: [source])
        let context = UniversalSearchContext(
            scopeID: multichainAccount.id,
            network: multichainAccount.network.rawValue,
            localeIdentifier: "en"
        )

        _ = try await coordinator.refresh(context: context)
        let solanaResults = await coordinator.search("Solana")
        let usdtResults = await coordinator.search("Usdt")

        #expect(solanaResults.corpusDocumentCount == 3)
        #expect(solanaResults.hits.first?.id == SearchEntityID("token:solana"))
        #expect(solanaResults.hits.first?.document.signals.traits.contains(.held) == true)
        #expect(solanaResults.hits.map(\.id).contains(SearchEntityID("token:ton-usdt")) == false)
        #expect(usdtResults.hits.first?.id == SearchEntityID("token:ton-usdt"))
        #expect(usdtResults.hits.first?.match.kind == .exactPhrase)
    }

    @Test
    func `wallet source distinguishes owned view and temporary external wallets`() {
        let owned = account
        let view = MAccount(
            id: "view-mainnet",
            title: "Watch",
            type: .view,
            byChain: [.ton: AccountChain(address: "EQ-view", domain: "watch.ton")]
        )
        let external = MAccount(
            id: "external-mainnet",
            title: nil,
            type: .view,
            byChain: [.ton: AccountChain(address: "EQ-external")],
            isTemporary: true
        )

        let documents = WalletCoreWalletSearchSource.documents(accounts: [owned, view, external])
        let byID = Dictionary(uniqueKeysWithValues: documents.map { ($0.id, $0) })
        let ownedDocument = byID[SearchEntityID("wallet:account-mainnet")]
        let viewDocument = byID[SearchEntityID("wallet:view-mainnet")]
        let externalDocument = byID[SearchEntityID("wallet:external-mainnet")]

        #expect(ownedDocument?.signals.traits == [.owned])
        #expect(viewDocument?.signals.traits.contains([.owned, .viewOnly]) == true)
        #expect(viewDocument?.fields.contains(SearchField("watch.ton", kind: .domain)) == true)
        #expect(viewDocument?.attributeValue(for: WalletCoreSearchAttributeKey.accountID) == view.id)
        #expect(externalDocument?.signals.traits.contains([.external, .viewOnly]) == true)
        #expect(externalDocument?.matchRequirement == .exactIdentifier)
    }

    @Test
    func `collectible source emits NFT before its deduplicated collection in ranking`() {
        var first = ApiNft.ERROR
        first.address = "nft-1"
        first.name = "Alpha"
        first.collectionAddress = "collection-address"
        first.collectionName = "Alpha Collection"
        var second = first
        second.address = "nft-2"
        second.name = "Beta"

        let documents = WalletCoreCollectibleSearchSource.documents(
            nfts: [first, second],
            accountID: account.id
        )
        let collections = documents.filter { $0.kind == .collection }
        let results = UniversalSearchEngine().search("alpha", in: documents)

        #expect(documents.filter { $0.kind == .collectible }.count == 2)
        #expect(collections.count == 1)
        #expect(results.first?.document.kind == .collectible)
        #expect(results.first?.document.attributeValue(
            for: WalletCoreSearchAttributeKey.accountID
        ) == account.id)
    }

    @Test
    func `connected app source deduplicates canonical URL and keeps newest connection`() {
        let old = ApiDapp(
            url: "https://APP.Example.com/",
            name: "Old App",
            iconUrl: "",
            connectedAt: 1,
            urlTrustStatus: .verified,
            sse: nil
        )
        let new = ApiDapp(
            url: "https://app.example.com",
            name: "New App",
            iconUrl: "",
            connectedAt: 2,
            urlTrustStatus: .verified,
            sse: nil
        )

        let documents = WalletCoreConnectedAppSearchSource.documents(apps: [old, new])

        #expect(documents.count == 1)
        #expect(documents.first?.id == SearchEntityID("application:app.example.com"))
        #expect(documents.first?.fields.contains(SearchField("New App", kind: .title)) == true)
        #expect(documents.first?.attributeValue(for: WalletCoreSearchAttributeKey.url) == new.url)
        #expect(documents.first?.signals.traits == [.connected])
    }

    @Test
    func `explore app source maps catalog metadata ranking and restrictions`() throws {
        let date = Date(timeIntervalSince1970: 42)
        let visible = Self.makeSite(
            url: "https://t.me/VisibleBot/app?startapp=my-wallet",
            name: "Visible App",
            description: "Trade and earn on TON",
            canBeRestricted: false,
            isExternal: true,
            isFeatured: true,
            isVerified: true,
            categoryID: 7
        )
        let restricted = Self.makeSite(
            url: "https://restricted.example",
            name: "Restricted App",
            canBeRestricted: true
        )

        let documents = WalletCoreExploreAppSearchSource.documents(
            input: .init(
                sites: [visible, restricted],
                categories: [ApiSiteCategory(id: 7, name: "DeFi")],
                shouldRestrictSites: true
            ),
            generatedAt: date
        )
        let document = try #require(documents.first)

        #expect(documents.count == 1)
        #expect(document.id == SearchEntityID("application:t.me/visiblebot"))
        #expect(document.fields.contains(SearchField("Visible App", kind: .title)))
        #expect(document.fields.contains(SearchField("DeFi", kind: .keyword)))
        #expect(document.fields.contains(SearchField(
            "Trade and earn on TON",
            kind: .description
        )))
        #expect(document.attributeValue(
            for: WalletCoreSearchAttributeKey.opensExternally
        ) == "true")
        #expect(document.signals.traits.contains([
            .curated,
            .popular,
            .trending,
            .verified,
        ]))
        #expect(document.signals.popularity?.rank == 1)
        #expect(document.signals.popularity?.generatedAt == date)
        #expect(document.signals.recommendation?.rank == 1)
    }

    @Test
    func `connected app merges with catalog origin and outranks other catalog apps`() async throws {
        let connected = ApiDapp(
            url: "https://app.storm.tg",
            name: "Storm Connected",
            iconUrl: "https://app.storm.tg/connected.png",
            connectedAt: 2,
            urlTrustStatus: .verified,
            sse: nil
        )
        let connectedSource = WalletCoreConnectedAppSearchSource { _ in [connected] }
        let catalogSource = WalletCoreExploreAppSearchSource { _ in
            WalletCoreExploreAppSearchInput(
                sites: [
                    Self.makeSite(
                        url: "https://app.storm.tg/trade?ref=my-wallet",
                        name: "Storm Trade"
                    ),
                    Self.makeSite(
                        url: "https://storm-tools.example",
                        name: "Storm Tools"
                    ),
                ],
                categories: [],
                shouldRestrictSites: false
            )
        }
        let coordinator = UniversalSearchCoordinator(sources: [catalogSource, connectedSource])
        let context = UniversalSearchContext(
            scopeID: account.id,
            network: account.network.rawValue,
            localeIdentifier: "en"
        )

        _ = try await coordinator.refresh(context: context)
        let results = await coordinator.search("Storm")
        let first = try #require(results.hits.first)

        #expect(results.hits.count == 2)
        #expect(results.hits.filter {
            $0.id == SearchEntityID("application:app.storm.tg")
        }.count == 1)
        #expect(first.id == SearchEntityID("application:app.storm.tg"))
        #expect(first.document.fields.contains(SearchField("Storm Connected", kind: .title)))
        #expect(first.document.attributeValue(for: WalletCoreSearchAttributeKey.url) == connected.url)
        #expect(first.document.signals.traits.contains([.connected, .curated, .popular]))
        #expect(first.document.signals.popularity?.source == WalletCoreExploreAppSearchSource.id)
    }

    @Test
    func `source snapshot uses stable identity authority and injected clock`() async throws {
        let date = Date(timeIntervalSince1970: 42)
        let source = WalletCoreWalletSearchSource(
            loader: { _ in [account] },
            clock: { date }
        )
        let context = UniversalSearchContext(
            scopeID: account.id,
            network: account.network.rawValue,
            localeIdentifier: "en"
        )

        let snapshot = try await source.snapshot(for: context)

        #expect(snapshot.sourceID == WalletCoreWalletSearchSource.id)
        #expect(snapshot.authority == 100)
        #expect(snapshot.generatedAt == date)
        #expect(snapshot.documents.count == 1)
    }

    private static func makeSite(
        url: String,
        name: String,
        description: String = "",
        canBeRestricted: Bool = false,
        isExternal: Bool? = nil,
        isFeatured: Bool? = nil,
        isVerified: Bool? = nil,
        categoryID: Int? = nil
    ) -> ApiSite {
        ApiSite(
            url: url,
            name: name,
            icon: "https://example.com/icon.png",
            manifestUrl: nil,
            description: description,
            canBeRestricted: canBeRestricted,
            isExternal: isExternal,
            isFeatured: isFeatured,
            isVerified: isVerified,
            categoryId: categoryID,
            extendedIcon: nil,
            badgeText: nil,
            withBorder: nil,
            borderColor: nil
        )
    }
}
