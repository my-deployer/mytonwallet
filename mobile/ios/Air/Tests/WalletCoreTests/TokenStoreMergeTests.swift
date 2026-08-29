import Testing
@testable import WalletCore

@Suite("TokenStore Merge")
struct TokenStoreMergeTests {
    @Test
    func `incoming missing localized name clears cached language value`() {
        let cached = makeToken(localizedName: "Тезер", image: "https://example.com/token.png")
        let incoming = makeToken(localizedName: nil, image: nil)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: true)

        #expect(merged.localizedName == nil)
        #expect(merged.image == cached.image)
    }

    @Test
    func `incoming localized name replaces cached language value`() {
        let cached = makeToken(localizedName: "Тезер", image: nil)
        let incoming = makeToken(localizedName: "泰达币", image: nil)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: true)

        #expect(merged.localizedName == "泰达币")
    }

    @Test
    func `incoming empty localized name clears cached language value`() {
        let cached = makeToken(localizedName: "Тезер", image: "https://example.com/token.png")
        let incoming = makeToken(localizedName: "", image: nil)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: true)

        #expect(merged.localizedName == nil)
        #expect(merged.image == cached.image)
    }

    @Test
    func `stale incoming prices preserve cached values`() {
        let cached = makeToken(localizedName: nil, image: nil, priceUsd: 2.5, percentChange24h: 4.2)
        let incoming = makeToken(localizedName: nil, image: nil, priceUsd: 3.1, percentChange24h: 0)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: false)

        #expect(merged.priceUsd == cached.priceUsd)
        #expect(merged.percentChange24h == cached.percentChange24h)
    }

    @Test
    func `fresh incoming prices replace cached values`() {
        let cached = makeToken(localizedName: nil, image: nil, priceUsd: 2.5, percentChange24h: 4.2)
        let incoming = makeToken(localizedName: nil, image: nil, priceUsd: 2.7, percentChange24h: -1.3)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: true)

        #expect(merged.priceUsd == incoming.priceUsd)
        #expect(merged.percentChange24h == incoming.percentChange24h)
    }

    @Test
    func `stale incoming prices fill missing cached values`() {
        let cached = makeToken(localizedName: nil, image: nil, priceUsd: nil, percentChange24h: nil)
        let incoming = makeToken(localizedName: nil, image: nil, priceUsd: 3.1, percentChange24h: 0)

        let merged = TokenStore._merge(cached: cached, incoming: incoming, arePricesFresh: false)

        #expect(merged.priceUsd == incoming.priceUsd)
        #expect(merged.percentChange24h == incoming.percentChange24h)
    }

    private func makeToken(
        localizedName: String?,
        image: String?,
        priceUsd: Double? = 1,
        percentChange24h: Double? = nil
    ) -> ApiToken {
        ApiToken(
            slug: "usdt",
            name: "Tether USD",
            localizedName: localizedName,
            symbol: "USDT",
            decimals: 6,
            chain: .ton,
            image: image,
            priceUsd: priceUsd,
            percentChange24h: percentChange24h
        )
    }
}
