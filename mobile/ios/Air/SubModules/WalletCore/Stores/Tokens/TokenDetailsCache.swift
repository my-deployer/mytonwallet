import Foundation

public struct TokenDetailsCacheEntry: Equatable, Sendable, Codable {
    public let details: ApiTokenDetails?
    let fetchedAt: Date

    public init(details: ApiTokenDetails?, fetchedAt: Date = .now) {
        self.details = details
        self.fetchedAt = fetchedAt
    }

    func isValid(now: Date, validity: TimeInterval) -> Bool {
        fetchedAt <= now && now.timeIntervalSince(fetchedAt) < validity
    }

    private enum CodingKeys: String, CodingKey {
        case details
        case fetchedAt
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.details = try container.decodeIfPresent(PersistedTokenDetails.self, forKey: .details)?.details
        self.fetchedAt = try container.decode(Date.self, forKey: .fetchedAt)
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let details {
            try container.encode(PersistedTokenDetails(details), forKey: .details)
        }
        try container.encode(fetchedAt, forKey: .fetchedAt)
    }
}

private struct PersistedTokenDetails: Codable {
    let description: String?
    let localizedDescription: String?
    let links: [ApiTokenDetails.Link]?
    let marketCap: Double?
    let circulatingSupply: Double?
    let totalSupply: Double?
    let createdAt: Date?
    let volume24h: ApiTokenDetails.Volume?

    init(_ details: ApiTokenDetails) {
        self.description = details.description
        self.localizedDescription = details.localizedDescription
        self.links = details.links
        self.marketCap = details.marketCap
        self.circulatingSupply = details.circulatingSupply
        self.totalSupply = details.totalSupply
        self.createdAt = details.createdAt
        self.volume24h = details.volume24h
    }

    var details: ApiTokenDetails {
        ApiTokenDetails(
            description: description,
            localizedDescription: localizedDescription,
            links: links,
            marketCap: marketCap,
            circulatingSupply: circulatingSupply,
            totalSupply: totalSupply,
            createdAt: createdAt,
            volume24h: volume24h
        )
    }
}

struct TokenDetailsCache: Equatable, Codable, Sendable {
    var entriesByLanguage: [String: [String: TokenDetailsCacheEntry]] = [:]
    var recentSlugsByAccountId: [String: [String]] = [:]

    func cachedEntry(
        language: String,
        slug: String,
        now: Date,
        validity: TimeInterval
    ) -> TokenDetailsCacheEntry? {
        entriesByLanguage[language]?[slug].flatMap {
            $0.isValid(now: now, validity: validity) ? $0 : nil
        }
    }

    func remembering(
        accountId: String,
        slugs: [String],
        limit: Int,
        promoteExisting: Bool
    ) -> TokenDetailsCache {
        let existing = recentSlugsByAccountId[accountId] ?? []
        let candidates = if promoteExisting {
            slugs + existing
        } else {
            slugs.filter { !existing.contains($0) } + existing
        }
        var seen = Set<String>()
        let remembered = candidates
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .prefix(limit)
        let rememberedArray = Array(remembered)
        guard rememberedArray != existing else { return self }

        var updatedRecents = recentSlugsByAccountId
        if rememberedArray.isEmpty {
            updatedRecents[accountId] = nil
        } else {
            updatedRecents[accountId] = rememberedArray
        }
        return TokenDetailsCache(
            entriesByLanguage: prunedEntries(recentSlugs: updatedRecents),
            recentSlugsByAccountId: updatedRecents
        )
    }

    func storing(
        language: String,
        slug: String,
        details: ApiTokenDetails?,
        fetchedAt: Date
    ) -> TokenDetailsCache {
        guard referencedSlugs.contains(slug) else { return self }
        let entry = TokenDetailsCacheEntry(details: details, fetchedAt: fetchedAt)
        guard entriesByLanguage[language]?[slug] != entry else { return self }

        var updatedEntries = entriesByLanguage
        updatedEntries[language, default: [:]][slug] = entry
        return TokenDetailsCache(
            entriesByLanguage: updatedEntries,
            recentSlugsByAccountId: recentSlugsByAccountId
        )
    }

    func removingAccount(_ accountId: String) -> TokenDetailsCache {
        guard recentSlugsByAccountId[accountId] != nil else { return self }
        var updatedRecents = recentSlugsByAccountId
        updatedRecents[accountId] = nil
        return TokenDetailsCache(
            entriesByLanguage: prunedEntries(recentSlugs: updatedRecents),
            recentSlugsByAccountId: updatedRecents
        )
    }

    func sanitized(
        validAccountIds: Set<String>,
        limit: Int,
        now: Date,
        validity: TimeInterval
    ) -> TokenDetailsCache {
        var updatedRecents: [String: [String]] = [:]
        for (accountId, slugs) in recentSlugsByAccountId where validAccountIds.contains(accountId) {
            var seen = Set<String>()
            let sanitizedSlugs = slugs
                .filter { !$0.isEmpty && seen.insert($0).inserted }
                .prefix(limit)
            if !sanitizedSlugs.isEmpty {
                updatedRecents[accountId] = Array(sanitizedSlugs)
            }
        }
        let referencedSlugs = Set(updatedRecents.values.joined())
        var updatedEntries: [String: [String: TokenDetailsCacheEntry]] = [:]
        for (language, entries) in entriesByLanguage {
            let validEntries = entries.filter { slug, entry in
                referencedSlugs.contains(slug) && entry.isValid(now: now, validity: validity)
            }
            if !validEntries.isEmpty {
                updatedEntries[language] = validEntries
            }
        }
        return TokenDetailsCache(
            entriesByLanguage: updatedEntries,
            recentSlugsByAccountId: updatedRecents
        )
    }

    func removingExpired(now: Date, validity: TimeInterval) -> TokenDetailsCache {
        var updatedEntries: [String: [String: TokenDetailsCacheEntry]] = [:]
        for (language, entries) in entriesByLanguage {
            let validEntries = entries.filter { $0.value.isValid(now: now, validity: validity) }
            if !validEntries.isEmpty {
                updatedEntries[language] = validEntries
            }
        }
        guard updatedEntries != entriesByLanguage else { return self }
        return TokenDetailsCache(
            entriesByLanguage: updatedEntries,
            recentSlugsByAccountId: recentSlugsByAccountId
        )
    }

    private var referencedSlugs: Set<String> {
        Set(recentSlugsByAccountId.values.joined())
    }

    private func prunedEntries(recentSlugs: [String: [String]]) -> [String: [String: TokenDetailsCacheEntry]] {
        let referencedSlugs = Set(recentSlugs.values.joined())
        var updatedEntries: [String: [String: TokenDetailsCacheEntry]] = [:]
        for (language, entries) in entriesByLanguage {
            let referencedEntries = entries.filter { referencedSlugs.contains($0.key) }
            if !referencedEntries.isEmpty {
                updatedEntries[language] = referencedEntries
            }
        }
        return updatedEntries
    }
}
