import Foundation
import Testing
@testable import WalletCore

@Suite("Market Assets Cache")
struct MarketAssetsCacheTests {
    @Test
    func `persists and restores a localized response`() async throws {
        let cacheURL = makeCacheURL()
        defer { try? FileManager.default.removeItem(at: cacheURL.deletingLastPathComponent()) }
        let cache = MarketAssetsCache(cacheURL: cacheURL)
        let response = try makeResponse(title: "Популярные токены")

        await cache.save(response, langCode: "ru")

        #expect(await cache.load(langCode: "ru") == response)
    }

    @Test
    func `does not restore a response from another language`() async throws {
        let cacheURL = makeCacheURL()
        defer { try? FileManager.default.removeItem(at: cacheURL.deletingLastPathComponent()) }
        let cache = MarketAssetsCache(cacheURL: cacheURL)

        await cache.save(try makeResponse(title: "Popular Tokens"), langCode: "en")

        #expect(await cache.load(langCode: "ru") == nil)
    }

    private func makeCacheURL() -> URL {
        FileManager.default.temporaryDirectory
            .appending(component: UUID().uuidString, directoryHint: .isDirectory)
            .appending(component: "market-assets.json", directoryHint: .notDirectory)
    }

    private func makeResponse(title: String) throws -> ApiMarketAssetsResponse {
        let data = try #require(
            """
            {
              "sections": [{
                "id": "popular",
                "title": "\(title)",
                "layout": "grid",
                "limit": 8,
                "hasMore": true,
                "assets": []
              }]
            }
            """.data(using: .utf8)
        )
        return try JSONDecoder().decode(ApiMarketAssetsResponse.self, from: data)
    }
}
