import Foundation
import UniversalSearchCore
import WalletCore

public struct WalletCoreWalletSearchSource: UniversalSearchSource {
    public typealias Loader = @Sendable (UniversalSearchContext) async throws -> [MAccount]

    public static let id = SearchSourceID("wallet-core:wallets")

    public let sourceID = Self.id
    public var scoping: UniversalSearchSourceScoping { .network }
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
        self.init(loader: Self.loadLiveAccounts)
    }

    public func snapshot(
        for context: UniversalSearchContext
    ) async throws -> UniversalSearchSourceSnapshot {
        let accounts = try await loader(context)
        return UniversalSearchSourceSnapshot(
            sourceID: sourceID,
            authority: WalletCoreSearchSourceAuthority.local,
            generatedAt: clock(),
            documents: Self.documents(accounts: accounts)
        )
    }

    public static func documents(accounts: [MAccount]) -> [SearchDocument] {
        accounts.map { account in
            var fieldCandidates: [(String?, SearchFieldKind, SearchFieldMatchPolicy)] = [
                (account.displayName, .title, .text),
                (account.title, .alias, .text),
            ]
            for (_, chain) in account.orderedChains {
                fieldCandidates.append((chain.domain, .domain, .text))
                fieldCandidates.append((chain.address, .address, .text))
            }

            var traits: SearchTraits = []
            if account.isTemporaryView {
                traits.insert(.external)
                traits.insert(.viewOnly)
            } else {
                traits.insert(.owned)
                if account.isView {
                    traits.insert(.viewOnly)
                }
            }

            return SearchDocument(
                id: SearchEntityID("wallet:\(account.id)"),
                kind: .wallet,
                fields: makeSearchFields(fieldCandidates),
                matchRequirement: account.isTemporaryView ? .exactIdentifier : .anyTerm,
                attributes: makeSearchAttributes([
                    (WalletCoreSearchAttributeKey.accountID, account.id),
                ]),
                signals: SearchSignals(traits: traits)
            )
        }.sorted { $0.id < $1.id }
    }

    private static func loadLiveAccounts(
        context: UniversalSearchContext
    ) async throws -> [MAccount] {
        let accountsByID = AccountStore.accountsById
        return AccountStore.orderedAccountIdsWithTemporary
            .compactMap { accountsByID[$0] }
            .filter { account in
                context.network == nil || account.network.rawValue == context.network
            }
    }
}
