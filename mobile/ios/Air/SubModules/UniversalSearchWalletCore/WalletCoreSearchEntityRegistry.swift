import WalletCoreTypes

/// Keeps typed entities discovered by query sources available to synchronous
/// UIKit presentation and routing without importing them into wallet state.
@MainActor
public final class WalletCoreSearchEntityRegistry {
    private var tokensByAccountID: [String: [String: ApiToken]] = [:]

    public init() {}

    public func store(tokens: [ApiToken], accountID: String) {
        var accountTokens = tokensByAccountID[accountID] ?? [:]
        for token in tokens {
            accountTokens[token.slug] = token
        }
        tokensByAccountID[accountID] = accountTokens
    }

    public func token(accountID: String, slug: String) -> ApiToken? {
        tokensByAccountID[accountID]?[slug]
    }

    public func tokens(accountID: String) -> [ApiToken] {
        guard let tokens = tokensByAccountID[accountID] else { return [] }
        return Array(tokens.values)
    }
}
