@preconcurrency import Combine
import Foundation
import MyAgent
import WalletCore
import WalletContext
import FoundationModels

public struct AgentConversationSearchSnapshot: Sendable {
    public let title: String
    public let subtitle: String
    public let searchableMessages: [String]
    public let updatedAt: Date

    public init(
        title: String,
        subtitle: String,
        searchableMessages: [String],
        updatedAt: Date
    ) {
        self.title = title
        self.subtitle = subtitle
        self.searchableMessages = searchableMessages
        self.updatedAt = updatedAt
    }
}

@MainActor
public final class AgentStore {

    public static let shared = AgentStore()

    private let historyStore = AgentHistoryStore()
    private let conversationChangedSubject = PassthroughSubject<Void, Never>()
    private var isStarted = false
    private var isHistoryReady = false
    var isLocalBackendAvailable: Bool {
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.availability == .available
        }
        return false
    }

    private var lastKnowledgeBaseVersion: String?

    public var conversationChanged: AnyPublisher<Void, Never> {
        conversationChangedSubject.eraseToAnyPublisher()
    }

    private init() {}

    public func start() {
        if !isStarted {
            WalletCoreData.add(eventObserver: self)
            isStarted = true
        }
        syncKnowledgeBase()
    }

    public func clean() {
        if isStarted {
            WalletCoreData.remove(observer: self)
            isStarted = false
        }
        isHistoryReady = false
        lastKnowledgeBaseVersion = nil
        historyStore.clean()
        conversationChangedSubject.send()
    }

    public func resetConversation() {
        connectHistoryIfNeeded()
        historyStore.save(messages: [])
        conversationChangedSubject.send()
    }

    public func conversationSearchSnapshot() -> AgentConversationSearchSnapshot? {
        connectHistoryIfNeeded()
        let messages = historyStore.loadMessages().filter {
            !$0.isDateTimeSystemMessage && !$0.isAccountChangeSystemMessage
        }
        let userMessages = messages.filter { $0.role == .user }
        guard let firstUserMessage = userMessages.first,
              let updatedAt = messages.last?.timestamp else {
            return nil
        }

        let subtitle = messages.reversed().first {
            $0.id != firstUserMessage.id && !$0.text.isEmpty
        }?.text ?? lang("Agent")
        return AgentConversationSearchSnapshot(
            title: Self.searchPreviewText(firstUserMessage.text),
            subtitle: Self.searchPreviewText(subtitle),
            searchableMessages: messages.suffix(20).map(\.text),
            updatedAt: updatedAt
        )
    }

    static func searchPreviewText(_ text: String) -> String {
        guard let attributedText = try? AttributedString(markdown: text) else { return text }
        return String(attributedText.characters)
    }

    func persistedTimelineItems() -> [AgentTimelineItem] {
        connectHistoryIfNeeded()
        return historyStore.loadMessages().map(AgentTimelineItem.message)
    }

    func saveHistory(messages: [AgentMessage]) {
        connectHistoryIfNeeded()
        historyStore.save(messages: messages)
        conversationChangedSubject.send()
    }

    private func connectHistoryIfNeeded() {
        guard !isHistoryReady, let db = WalletCore.db else { return }
        historyStore.connect(db: db)
        isHistoryReady = true
    }

    private func syncKnowledgeBase() {
        guard let version = ConfigStore.shared.knowledgeBaseVersion,
              version != lastKnowledgeBaseVersion else { return }
        lastKnowledgeBaseVersion = version
        Task { await KnowledgeBase.shared.load(version: version) }
    }
}

extension AgentStore: WalletCoreData.EventsObserver {
    public func walletCore(event: WalletCoreData.Event) {
        switch event {
        case .configChanged:
            syncKnowledgeBase()
        default:
            break
        }
    }
}
