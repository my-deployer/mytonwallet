import Foundation
import UniversalSearchCore
import WalletCore

public struct WalletCoreCollectibleSearchSource: UniversalSearchSource {
    public typealias Loader = @Sendable (UniversalSearchContext) async throws -> [ApiNft]

    public static let id = SearchSourceID("wallet-core:collectibles")

    public let sourceID = Self.id
    private let loader: Loader
    private let clock: @Sendable () -> Date

    public init(
        loader: @escaping Loader,
        clock: @escaping @Sendable () -> Date = Date.init
    ) {
        self.loader = loader
        self.clock = clock
    }

    public init() {
        self.init(loader: Self.loadLiveCollectibles)
    }

    public func snapshot(
        for context: UniversalSearchContext
    ) async throws -> UniversalSearchSourceSnapshot {
        let nfts = try await loader(context)
        return UniversalSearchSourceSnapshot(
            sourceID: sourceID,
            authority: WalletCoreSearchSourceAuthority.local,
            generatedAt: clock(),
            documents: Self.documents(nfts: nfts, accountID: context.scopeID)
        )
    }

    public static func documents(
        nfts: [ApiNft],
        accountID: String? = nil
    ) -> [SearchDocument] {
        var documents: [SearchDocument] = []
        var collectionsByID: [String: NftCollection] = [:]

        for nft in nfts.sorted(by: { $0.id < $1.id }) {
            documents.append(SearchDocument(
                id: SearchEntityID("collectible:\(nft.id)"),
                kind: .collectible,
                fields: makeSearchFields([
                    (nft.name, .title, .text),
                    (nft.collectionName, .alias, .text),
                    (nft.address, .address, .exact),
                    (nft.description, .description, .text),
                ]),
                attributes: makeSearchAttributes([
                    (WalletCoreSearchAttributeKey.accountID, accountID),
                    (WalletCoreSearchAttributeKey.chain, nft.chain.rawValue),
                    (WalletCoreSearchAttributeKey.address, nft.address),
                    (WalletCoreSearchAttributeKey.iconURL, nft.thumbnail ?? nft.image),
                ]),
                signals: SearchSignals(traits: [.owned])
            ))
            if let collection = nft.collection {
                collectionsByID[collection.id] = collection
            }
        }

        documents.append(contentsOf: collectionsByID.values.map { collection in
            SearchDocument(
                id: SearchEntityID("collection:\(collection.id)"),
                kind: .collection,
                fields: makeSearchFields([
                    (collection.name, .title, .text),
                    (collection.address, .address, .exact),
                ]),
                attributes: makeSearchAttributes([
                    (WalletCoreSearchAttributeKey.accountID, accountID),
                    (WalletCoreSearchAttributeKey.chain, collection.chain.rawValue),
                    (WalletCoreSearchAttributeKey.address, collection.address),
                ]),
                signals: SearchSignals(traits: [.owned])
            )
        })
        return documents.sorted { $0.id < $1.id }
    }

    private static func loadLiveCollectibles(
        context: UniversalSearchContext
    ) async throws -> [ApiNft] {
        guard let accountID = context.scopeID else { return [] }
        return NftStore.getAccountShownNfts(accountId: accountID)?
            .values
            .map(\.nft) ?? []
    }
}
