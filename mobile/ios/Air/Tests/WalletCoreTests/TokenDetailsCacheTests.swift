import Foundation
import Testing
@testable import WalletCore

@Suite("Token Details Cache")
struct TokenDetailsCacheTests {
    private let now = Date(timeIntervalSince1970: 1_000_000)
    private let validity: TimeInterval = 15 * 60

    @Test
    func `shares details across accounts`() throws {
        let details = makeDetails(description: "Shared")
        let cache = TokenDetailsCache()
            .remembering(accountId: "account-1", slugs: ["token"], limit: 50, promoteExisting: true)
            .remembering(accountId: "account-2", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: details, fetchedAt: now)

        let entry = try #require(cache.cachedEntry(language: "en", slug: "token", now: now, validity: validity))
        #expect(entry.details == details)
        #expect(cache.entriesByLanguage["en"]?.count == 1)
    }

    @Test
    func `expires details at the validity boundary`() {
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: makeDetails(), fetchedAt: now)

        #expect(cache.cachedEntry(
            language: "en",
            slug: "token",
            now: now.addingTimeInterval(validity - 1),
            validity: validity
        ) != nil)
        #expect(cache.cachedEntry(
            language: "en",
            slug: "token",
            now: now.addingTimeInterval(validity),
            validity: validity
        ) == nil)
        #expect(cache.cachedEntry(
            language: "en",
            slug: "token",
            now: now.addingTimeInterval(-1),
            validity: validity
        ) == nil)
    }

    @Test
    func `caches a successful response without public info`() throws {
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: nil, fetchedAt: now)

        let entry = try #require(cache.cachedEntry(language: "en", slug: "token", now: now, validity: validity))
        #expect(entry.details == nil)
    }

    @Test
    func `caps recent tokens per account`() {
        let initialSlugs = (0..<50).map { "token-\($0)" }
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: initialSlugs, limit: 50, promoteExisting: true)
            .remembering(accountId: "account", slugs: ["recent"], limit: 50, promoteExisting: true)

        #expect(cache.recentSlugsByAccountId["account"]?.count == 50)
        #expect(cache.recentSlugsByAccountId["account"]?.first == "recent")
        #expect(cache.recentSlugsByAccountId["account"]?.contains("token-49") == false)
    }

    @Test
    func `preloading preserves existing recency`() {
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: ["top-1", "top-2"], limit: 50, promoteExisting: false)
            .remembering(accountId: "account", slugs: ["recent"], limit: 50, promoteExisting: true)
            .remembering(accountId: "account", slugs: ["top-1", "top-2"], limit: 50, promoteExisting: false)

        #expect(cache.recentSlugsByAccountId["account"] == ["recent", "top-1", "top-2"])
    }

    @Test
    func `separates localized details`() throws {
        let english = makeDetails(description: "English")
        let persian = makeDetails(description: "Persian")
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: english, fetchedAt: now)
            .storing(language: "fa", slug: "token", details: persian, fetchedAt: now)

        #expect(cache.cachedEntry(language: "en", slug: "token", now: now, validity: validity)?.details == english)
        #expect(cache.cachedEntry(language: "fa", slug: "token", now: now, validity: validity)?.details == persian)
    }

    @Test
    func `persists and restores normalized details`() throws {
        let linkURL = try #require(URL(string: "https://example.com/token"))
        let details = ApiTokenDetails(
            description: "Description",
            localizedDescription: "Localized description",
            links: [.init(kind: .website, title: "Website", url: linkURL)],
            marketCap: 1_000_000,
            circulatingSupply: 2_000_000,
            totalSupply: 3_000_000,
            createdAt: now.addingTimeInterval(-86_400),
            volume24h: .init(total: 4_000, buy: 2_500, sell: 1_500, change: 12.5, currency: .USD)
        )
        let cache = TokenDetailsCache()
            .remembering(accountId: "account", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: details, fetchedAt: now)

        let restored = try JSONDecoder().decode(
            TokenDetailsCache.self,
            from: JSONEncoder().encode(cache)
        )

        #expect(restored == cache)
    }

    @Test
    func `sanitizes restored cache`() {
        let cache = TokenDetailsCache(
            entriesByLanguage: [
                "en": [
                    "fresh": TokenDetailsCacheEntry(details: makeDetails(), fetchedAt: now),
                    "expired": TokenDetailsCacheEntry(
                        details: makeDetails(),
                        fetchedAt: now.addingTimeInterval(-validity)
                    ),
                    "trimmed": TokenDetailsCacheEntry(details: makeDetails(), fetchedAt: now),
                    "stale-account": TokenDetailsCacheEntry(details: makeDetails(), fetchedAt: now),
                ],
            ],
            recentSlugsByAccountId: [
                "account": ["fresh", "fresh", "expired", "trimmed"],
                "unknown-account": ["stale-account"],
            ]
        )

        let sanitized = cache.sanitized(
            validAccountIds: ["account"],
            limit: 2,
            now: now,
            validity: validity
        )

        #expect(sanitized.recentSlugsByAccountId == ["account": ["fresh", "expired"]])
        #expect(sanitized.entriesByLanguage["en"]?.keys.sorted() == ["fresh"])
    }

    @Test
    func `removes shared details after the final account reference`() {
        let cache = TokenDetailsCache()
            .remembering(accountId: "account-1", slugs: ["token"], limit: 50, promoteExisting: true)
            .remembering(accountId: "account-2", slugs: ["token"], limit: 50, promoteExisting: true)
            .storing(language: "en", slug: "token", details: makeDetails(), fetchedAt: now)

        let oneAccountLeft = cache.removingAccount("account-1")
        #expect(oneAccountLeft.cachedEntry(language: "en", slug: "token", now: now, validity: validity) != nil)
        #expect(oneAccountLeft
            .removingAccount("account-2")
            .cachedEntry(language: "en", slug: "token", now: now, validity: validity) == nil)
    }

    private func makeDetails(description: String? = nil) -> ApiTokenDetails {
        ApiTokenDetails(
            description: description,
            links: nil,
            marketCap: nil,
            circulatingSupply: nil,
            totalSupply: nil,
            createdAt: nil,
            volume24h: nil
        )
    }
}
