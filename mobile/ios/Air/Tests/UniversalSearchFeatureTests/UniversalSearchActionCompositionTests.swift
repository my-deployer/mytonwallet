import Foundation
import Testing
import UIAgent
import UIInAppBrowser
import UIUniversalSearch
import UniversalSearchCore
import UniversalSearchWalletCore
import WalletContext
@testable import UniversalSearchFeature

@MainActor
@Suite("Universal Search action composition")
struct UniversalSearchActionCompositionTests {
    private let context = UniversalSearchContext(
        scopeID: "account",
        network: "mainnet",
        localeIdentifier: "en"
    )

    @Test
    func `URL input promotes open website ahead of agent and Google`() throws {
        let presentation = UniversalSearchResultsPresenter(resolver: { _, _ in nil })
            .presentation(for: emptySnapshot(query: "fragment.com/collection"), context: context)

        #expect(presentation.sections.map(\.id) == [
            "open-website", "ask-agent", "search-google",
        ])
        #expect(presentation.preselectedItemID?.hasPrefix("web-action:open:") == true)
        let route = try #require(
            presentation.preselectedItemID.flatMap { presentation.routesByItemID[$0] }
        )
        guard case .website(let url, _) = route else {
            Issue.record("Expected an open website route")
            return
        }
        #expect(url.absoluteString == "https://fragment.com/collection")
    }

    @Test
    func `unknown text offers unselected agent and Google fallbacks`() {
        let presentation = UniversalSearchResultsPresenter(resolver: { _, _ in nil })
            .presentation(for: emptySnapshot(query: "tondfjnhdjsf"), context: context)

        #expect(presentation.sections.map(\.id) == ["ask-agent", "search-google"])
        #expect(presentation.preselectedItemID == nil)
    }

    @Test
    func `ordinary results retain Agent and Google fallbacks`() throws {
        let document = SearchDocument(
            id: SearchEntityID("application:fragment"),
            kind: .application,
            fields: [SearchField("Fragment", kind: .title)],
            attributes: [SearchAttribute(
                key: WalletCoreSearchAttributeKey.url,
                value: "https://fragment.com"
            )]
        )
        let presentation = UniversalSearchResultsPresenter().presentation(
            for: snapshot(query: "frag", document: document),
            context: context
        )

        #expect(presentation.sections.map(\.id) == [
            "top-hit", "ask-agent", "search-google",
        ])
        #expect(presentation.preselectedItemID == document.id.rawValue)
        #expect(presentation.routesByItemID["agent-action:frag"] != nil)
        #expect(presentation.routesByItemID["web-action:google:frag"] != nil)
    }

    @Test
    func `conversational text promotes agent`() {
        let presentation = UniversalSearchResultsPresenter(resolver: { _, _ in nil })
            .presentation(for: emptySnapshot(query: "Send 10 USDT to mom"), context: context)

        #expect(presentation.preselectedItemID == "agent-action:send 10 usdt to mom")
        guard case .some(.agent(let query)) = presentation.routesByItemID[
            "agent-action:send 10 usdt to mom"
        ] else {
            Issue.record("Expected an Agent route")
            return
        }
        #expect(query == "Send 10 USDT to mom")
    }

    @Test
    func `website and search intent parsing stays distinct`() throws {
        guard case .openWebsite(let url, let displayText) = UniversalSearchWebIntent(
            "https://fragment.com/path?q=1"
        ) else {
            Issue.record("Expected a website intent")
            return
        }
        #expect(url.host == "fragment.com")
        #expect(displayText == "fragment.com/path?q=1")

        guard case .searchGoogle(let query) = UniversalSearchWebIntent("fragment website") else {
            Issue.record("Expected a Google intent")
            return
        }
        #expect(query == "fragment website")
    }

    @Test
    func `chain DNS name is searched rather than opened as a website`() {
        guard case .searchGoogle(let query) = UniversalSearchWebIntent("mwme.ton") else {
            Issue.record("Expected a chain DNS name to remain a search intent")
            return
        }
        #expect(query == "mwme.ton")

        guard case .searchGoogle(let explicitQuery) = UniversalSearchWebIntent(
            "https://mwme.ton/path"
        ) else {
            Issue.record("Expected a chain DNS URL to remain a search intent")
            return
        }
        #expect(explicitQuery == "https://mwme.ton/path")
    }

    @Test
    func `browser history preserves website versus Google semantics`() throws {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let site = BrowserHistoryItem(
            accountId: "account",
            tag: UniversalSearchBrowserHistorySource.historyTag,
            url: "https://fragment.com",
            title: "Fragment",
            favicon: "",
            visitDate: date
        )
        let google = BrowserHistoryItem(
            accountId: "account",
            tag: UniversalSearchBrowserHistorySource.historyTag,
            url: "https://www.google.com/search?q=fragment%20marketplace",
            title: "fragment marketplace - Google Search",
            favicon: "",
            visitDate: date
        )

        let siteDocument = try #require(
            UniversalSearchBrowserHistorySource.document(for: site, rank: 1)
        )
        let googleDocument = try #require(
            UniversalSearchBrowserHistorySource.document(for: google, rank: 2)
        )
        #expect(siteDocument.kind == .site)
        #expect(googleDocument.kind == .webSearchHistory)
        #expect(
            googleDocument.attributeValue(for: UniversalSearchFeatureAttributeKey.query)
                == "fragment marketplace"
        )

        let presenter = UniversalSearchResultsPresenter()
        let sitePresentation = presenter.presentation(
            for: snapshot(query: "fragment", document: siteDocument),
            context: context
        )
        let googlePresentation = presenter.presentation(
            for: snapshot(query: "fragment marketplace", document: googleDocument),
            context: context
        )
        guard case .some(.website(let routeURL, _)) = sitePresentation.preselectedItemID
            .flatMap({ sitePresentation.routesByItemID[$0] }) else {
            Issue.record("Expected website history to reopen its URL")
            return
        }
        #expect(routeURL == URL(string: "https://fragment.com"))
        guard case .some(.google(let routeQuery)) = googlePresentation.preselectedItemID
            .flatMap({ googlePresentation.routesByItemID[$0] }) else {
            Issue.record("Expected Google history to repeat its search")
            return
        }
        #expect(routeQuery == "fragment marketplace")
    }

    @Test
    func `lookalike Google hosts are not interpreted as search history`() throws {
        let maliciousPrefix = try #require(
            URL(string: "https://google.evil.example/search?q=fragment")
        )
        let maliciousWWWPrefix = try #require(
            URL(string: "https://www.google.evil.example/search?q=fragment")
        )

        #expect(UniversalSearchWebIntent.googleSearchQuery(from: maliciousPrefix) == nil)
        #expect(UniversalSearchWebIntent.googleSearchQuery(from: maliciousWWWPrefix) == nil)
    }

    @Test
    func `agent sources expose the current conversation and suggested prompts`() async throws {
        let updatedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let source = UniversalSearchAgentConversationSource(loader: {
            AgentConversationSearchSnapshot(
                title: "Track my portfolio",
                subtitle: "Your portfolio is up today",
                searchableMessages: ["Track my portfolio", "Your portfolio is up today"],
                updatedAt: updatedAt
            )
        })
        let suggestionsSource = UniversalSearchAgentSuggestionSource(loader: { langCode in
            #expect(langCode == "en")
            return [AgentSuggestion(
                id: "portfolio",
                title: "Track my portfolio",
                prompt: "Analyze my wallet portfolio and explain what stands out."
            )]
        })
        let sourceSnapshot = try await source.snapshot(for: context)
        let suggestionsSnapshot = try await suggestionsSource.snapshot(for: context)
        let coordinator = UniversalSearchCoordinator(sources: [source, suggestionsSource])
        _ = try await coordinator.refresh(context: context)
        let browse = await coordinator.browse()

        #expect(sourceSnapshot.documents.count == 1)
        #expect(suggestionsSnapshot.documents.count == 1)
        #expect(browse.recentDocuments.map(\.kind) == [.agentChat])
        #expect(browse.trendingDocuments.map(\.kind) == [.agentAction])

        let presenter = UniversalSearchResultsPresenter()
        let presentation = presenter.browsePresentation(for: browse, context: context)
        let chats = try #require(presentation.sections.first)
        #expect(chats.id == "chats")
        #expect(chats.headerAccessory == nil)
        guard case .list = chats.layout else {
            Issue.record("Expected the conversation to remain a normal list row")
            return
        }
        #expect(chats.items.map(\.id) == ["agent-chat:current"])

        let suggestions = try #require(presentation.sections.dropFirst().first)
        #expect(suggestions.id == "agent-suggestions")
        #expect(suggestions.showsHeader == false)
        #expect(suggestions.showsLeadingSeparator == false)
        guard case .promptPages(let rowsPerPage) = suggestions.layout else {
            Issue.record("Expected suggestions to retain width-aware horizontal paging")
            return
        }
        #expect(rowsPerPage == 3)
        #expect(suggestions.items.map(\.id) == ["agent-suggestion:portfolio"])

        let itemID = try #require(chats.items.first?.id)
        guard case .some(.agent(let query)) = presentation.routesByItemID[itemID] else {
            Issue.record("Expected the recent conversation to reopen Agent")
            return
        }
        #expect(query == nil)

        let suggestionItem = try #require(suggestions.items.first)
        guard case .prompt(let prompt) = suggestionItem.content else {
            Issue.record("Expected the hint title to be displayed as a prompt")
            return
        }
        #expect(prompt.text == "Track my portfolio")
        guard case .some(.agent(let suggestedQuery)) = presentation.routesByItemID[
            suggestionItem.id
        ] else {
            Issue.record("Expected the hint prompt to route to Agent")
            return
        }
        #expect(suggestedQuery == "Analyze my wallet portfolio and explain what stands out.")
    }

    @Test
    func `missing agent conversation uses a start row without a pending query`() throws {
        let suggestion = SearchDocument(
            id: SearchEntityID("agent-suggestion:portfolio"),
            kind: .agentAction,
            fields: [SearchField("Track my portfolio", kind: .title)],
            attributes: [
                SearchAttribute(
                    key: UniversalSearchFeatureAttributeKey.title,
                    value: "Track my portfolio"
                ),
                SearchAttribute(
                    key: UniversalSearchFeatureAttributeKey.query,
                    value: "Analyze my wallet portfolio and explain what stands out."
                ),
            ]
        )
        let browse = UniversalSearchBrowseSnapshot(
            recentDocuments: [],
            trendingDocuments: [suggestion],
            corpusRevision: 1,
            corpusDocumentCount: 1,
            generatedAt: Date(timeIntervalSince1970: 1)
        )
        let presentation = UniversalSearchResultsPresenter().browsePresentation(
            for: browse,
            context: context
        )
        let emptyConversationChats = try #require(presentation.sections.first)
        let startItem = try #require(emptyConversationChats.items.first)
        guard case .chat(let startConversation) = startItem.content else {
            Issue.record("Expected the empty conversation action to use the chat row")
            return
        }
        #expect(startConversation.title == "Ask Agent")
        #expect(startConversation.subtitle == lang("$universal_search_start_conversation"))
        #expect(emptyConversationChats.items.count == 1)
        let suggestions = try #require(presentation.sections.dropFirst().first)
        #expect(suggestions.id == "agent-suggestions")
        #expect(suggestions.items.map(\.id) == ["agent-suggestion:portfolio"])
        guard case .promptPages(let rowsPerPage) = suggestions.layout else {
            Issue.record("Expected the fallback conversation and prompts to stay independent")
            return
        }
        #expect(rowsPerPage == 3)
        guard case .some(.agent(let emptyConversationQuery)) = presentation
            .routesByItemID[startItem.id] else {
            Issue.record("Expected the empty conversation row to open Agent")
            return
        }
        #expect(emptyConversationQuery == nil)
    }

    private func emptySnapshot(query: String) -> UniversalSearchResultSnapshot {
        UniversalSearchResultSnapshot(
            query: UniversalSearchQuery(query),
            hits: [],
            totalHitCount: 0,
            corpusRevision: 0,
            rankingPolicyVersion: "test",
            generatedAt: Date(timeIntervalSince1970: 1)
        )
    }

    private func snapshot(
        query: String,
        document: SearchDocument
    ) -> UniversalSearchResultSnapshot {
        let searchQuery = UniversalSearchQuery(query)
        return UniversalSearchResultSnapshot(
            query: searchQuery,
            hits: UniversalSearchEngine().search(searchQuery, in: [document]),
            totalHitCount: 1,
            corpusRevision: 1,
            rankingPolicyVersion: "test",
            generatedAt: Date(timeIntervalSince1970: 1)
        )
    }
}
