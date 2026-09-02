import WalletCore
import WalletContext

struct ReceiveSwapDefaults: Equatable {
    let sellingToken: String
    let buyingToken: String
}

@MainActor
enum ReceiveSwapDefaultsResolver {
    static func resolve(
        accountContext: AccountContext,
        chain: ApiChain,
        preferredBuyingToken: String?
    ) async -> ReceiveSwapDefaults {
        let nativeBuyingToken = chain.nativeToken
        let preferredBuyingToken = preferredBuyingToken
            .flatMap(TokenStore.getToken(slug:))
            .flatMap { $0.chain == chain ? $0 : nil }
        let buyingCandidates = uniqueTokens([preferredBuyingToken, nativeBuyingToken].compactMap { $0 })
        let sellingCandidates = makeSellingCandidates(accountContext: accountContext, selectedChain: chain)

        for buyingToken in buyingCandidates {
            for sellingToken in sellingCandidates where sellingToken.slug != buyingToken.slug {
                if await isValidPair(
                    sellingToken: sellingToken,
                    buyingToken: buyingToken,
                    accountChains: accountContext.account.supportedChains
                ) {
                    return ReceiveSwapDefaults(
                        sellingToken: sellingToken.slug,
                        buyingToken: buyingToken.slug
                    )
                }
            }
        }

        // Pair discovery is network-backed. If it is temporarily unavailable, retain the desired
        // native output and the best wallet-owned input; the Swap screen will retry pair discovery.
        let buyingToken = nativeBuyingToken
        let sellingToken = sellingCandidates.first(where: { $0.slug != buyingToken.slug })
            ?? TokenStore.getToken(slug: chain.config.buySwap.tokenInSlug)
            ?? ApiToken.TONCOIN
        return ReceiveSwapDefaults(sellingToken: sellingToken.slug, buyingToken: buyingToken.slug)
    }

    private static func makeSellingCandidates(
        accountContext: AccountContext,
        selectedChain: ApiChain
    ) -> [ApiToken] {
        let balanceTokens = (accountContext.walletTokensData?.allTokenBalances ?? [])
            .filter { !$0.isStaking && $0.balance > 0 }
            .sorted { lhs, rhs in
                let lhsValue = lhs.toUsd ?? 0
                let rhsValue = rhs.toUsd ?? 0
                if lhsValue != rhsValue {
                    return lhsValue > rhsValue
                }
                return lhs.tokenSlug < rhs.tokenSlug
            }
            .compactMap { TokenStore.getToken(slug: $0.tokenSlug) }

        var fallbackSlugs = [
            selectedChain.nativeToken.slug,
            selectedChain.config.usdtSlug[accountContext.account.network],
            selectedChain.config.buySwap.tokenInSlug,
        ].compactMap { $0 }

        for (chain, _) in accountContext.account.orderedChains {
            fallbackSlugs.append(chain.nativeToken.slug)
            if let stablecoin = chain.config.usdtSlug[accountContext.account.network] {
                fallbackSlugs.append(stablecoin)
            }
            fallbackSlugs.append(chain.config.buySwap.tokenInSlug)
        }

        return uniqueTokens(balanceTokens + fallbackSlugs.compactMap(TokenStore.getToken(slug:)))
    }

    private static func isValidPair(
        sellingToken: ApiToken,
        buyingToken: ApiToken,
        accountChains: Set<ApiChain>
    ) async -> Bool {
        guard sellingToken.slug != buyingToken.slug else { return false }
        guard accountChains.contains(sellingToken.chain) || accountChains.contains(buyingToken.chain) else {
            return false
        }
        if sellingToken.chain == buyingToken.chain && sellingToken.chain.isOnchainSwapSupported {
            return true
        }

        do {
            let pairs = try await Api.swapGetPairs(symbolOrMinter: sellingToken.swapIdentifier)
            return pairs.contains(where: { $0.slug == buyingToken.slug })
        } catch {
            return false
        }
    }

    private static func uniqueTokens(_ tokens: [ApiToken]) -> [ApiToken] {
        var seen = Set<String>()
        return tokens.filter { seen.insert($0.slug).inserted }
    }
}
