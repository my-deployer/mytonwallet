import Foundation

public struct AgentSuggestion: Hashable, Sendable {
    public let id: String
    public let title: String
    public let prompt: String

    public init(id: String, title: String, prompt: String) {
        self.id = id
        self.title = title
        self.prompt = prompt
    }
}

@MainActor
public enum AgentSuggestionProvider {
    private struct CacheEntry {
        let suggestions: [AgentSuggestion]
        let loadedAt: Date
    }

    private static let cacheLifetime: TimeInterval = 10 * 60
    private static let messageEndpoint = URL(
        string: "https://agent.mytonwallet.org/api/message"
    )!
    private static var cacheByLanguage: [String: CacheEntry] = [:]

    public static func suggestions(langCode: String) async throws -> [AgentSuggestion] {
        let langCode = langCode.trimmingCharacters(in: .whitespacesAndNewlines)
        if let cached = cacheByLanguage[langCode],
           Date().timeIntervalSince(cached.loadedAt) < cacheLifetime {
            return cached.suggestions
        }

        do {
            let hints = try await AgentHTTPStreamingTransport(endpoint: messageEndpoint)
                .loadHints(langCode: langCode)
            let suggestions = hints.compactMap { hint -> AgentSuggestion? in
                let title = hint.title.trimmingCharacters(in: .whitespacesAndNewlines)
                let subtitle = hint.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
                let prompt = hint.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty, !subtitle.isEmpty, !prompt.isEmpty else { return nil }
                return AgentSuggestion(id: hint.id, title: title, prompt: prompt)
            }
            cacheByLanguage[langCode] = CacheEntry(
                suggestions: suggestions,
                loadedAt: Date()
            )
            return suggestions
        } catch {
            if let cached = cacheByLanguage[langCode] {
                return cached.suggestions
            }
            throw error
        }
    }
}
