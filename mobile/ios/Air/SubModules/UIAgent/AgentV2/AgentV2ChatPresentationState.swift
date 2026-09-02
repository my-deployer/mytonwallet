enum AgentV2MessageRevealPhase: Equatable {
    case staticContent
    case streaming
    case finishing

    var isActive: Bool {
        self != .staticContent
    }
}

struct AgentV2ChatPresentationState {
    private enum ScrollMode {
        case idle
        case followingLatest
        case userControlled
    }

    private var revealPhases: [String: AgentV2MessageRevealPhase] = [:]
    private var scrollMode = ScrollMode.idle

    var hasActiveReveal: Bool {
        revealPhases.values.contains(where: \.isActive)
    }

    mutating func synchronize(messages: [AgentV2NativeMessage], isNearBottom: Bool) {
        let revealableMessages = messages.filter {
            $0.role == .assistant && $0.contentKind == .markdown
        }
        let revealableMessageIds = Set(revealableMessages.map(\.id))
        revealPhases = revealPhases.filter { revealableMessageIds.contains($0.key) }

        var didStartReveal = false
        for message in revealableMessages {
            if message.status.isStreaming {
                let phase = revealPhases[message.id]
                if phase == nil {
                    didStartReveal = true
                    revealPhases[message.id] = .streaming
                } else if phase == .finishing {
                    revealPhases[message.id] = .streaming
                }
            } else if revealPhases[message.id] == .streaming {
                revealPhases[message.id] = .finishing
            } else if revealPhases[message.id] == .staticContent {
                revealPhases.removeValue(forKey: message.id)
            }
        }

        if didStartReveal, isNearBottom, scrollMode != .userControlled {
            scrollMode = .followingLatest
        }
        if !hasActiveReveal, scrollMode == .followingLatest {
            scrollMode = .idle
        }
    }

    func revealPhase(for message: AgentV2NativeMessage) -> AgentV2MessageRevealPhase {
        revealPhases[message.id] ?? .staticContent
    }

    func shouldPreserveBottom(isNearBottom: Bool) -> Bool {
        switch scrollMode {
        case .idle: isNearBottom
        case .followingLatest: true
        case .userControlled: false
        }
    }

    mutating func revealCompleted(messageId: String) {
        revealPhases.removeValue(forKey: messageId)
        if !hasActiveReveal, scrollMode == .followingLatest {
            scrollMode = .idle
        }
    }

    mutating func revealLeftViewport(messageId: String) {
        guard scrollMode == .userControlled,
              revealPhases[messageId]?.isActive == true else { return }
        revealPhases[messageId] = .staticContent
    }

    mutating func userStartedScrolling() {
        scrollMode = .userControlled
    }

    mutating func userFinishedScrolling(isNearBottom: Bool) {
        guard isNearBottom else { return }
        scrollMode = hasActiveReveal ? .followingLatest : .idle
    }

    mutating func requestedScrollToLatest() {
        scrollMode = hasActiveReveal ? .followingLatest : .idle
    }
}
