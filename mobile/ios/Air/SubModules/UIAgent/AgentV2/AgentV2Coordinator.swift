import Foundation
import WalletContext
import WalletCore

private let log = Log("AgentV2Coordinator")

@MainActor
enum AgentV2CoordinatorChange: Equatable {
    case reload
    case messageUpdated(id: String)
}

@MainActor
protocol AgentV2CoordinatorObserver: AnyObject {
    func agentV2CoordinatorDidChange(_ coordinator: AgentV2Coordinator, change: AgentV2CoordinatorChange)
}

@MainActor
final class AgentV2Coordinator: WalletCoreData.EventsObserver, @unchecked Sendable {
    private static let initialHostContextMaxAttempts = 3

    private final class WeakObserver {
        weak var value: AgentV2CoordinatorObserver?
        init(_ value: AgentV2CoordinatorObserver) { self.value = value }
    }

    struct RunState: Equatable, Sendable {
        var clientRunId: String?
        var runId: String?
        let threadId: String
        let localInputMessageId: String?
        var isRunning: Bool
    }

    struct ResolvedAction: Sendable {
        let value: ApiAgentV2ResolvedAction
        let accountId: String
    }

    struct LimitRetry: Equatable, Sendable {
        enum Kind: Equatable, Sendable {
            case rateLimit
            case userQuota
        }

        let kind: Kind
        let clientRunId: String
        let threadId: String
        let resetAt: Double?
    }

    let client: AgentV2Client
    private(set) var thread: ApiAgentV2ThreadSummary?
    var messages: [AgentV2NativeMessage] { conversation.messages }
    private(set) var nextMessageCursor: String?
    private(set) var activeRun: RunState?
    private(set) var runActivity: ApiAgentV2RunActivityEvent?
    private(set) var availability = ApiAgentV2AvailabilityState(state: .available)
    private(set) var userQuota: ApiAgentV2UserQuota?
    private(set) var hints: ApiAgentV2HintsResponse?
    private(set) var error: String?
    private(set) var limitRetry: LimitRetry?

    var isInputBlockedByLimit: Bool {
        let now = Date()
        if availability.state == .capacityExhausted,
           let resetAt = availability.resetAt,
           Date(timeIntervalSince1970: resetAt / 1_000) > now {
            return true
        }
        if let userQuota,
           limitRetry?.kind != .userQuota,
           userQuota.remaining == 0,
           AgentV2DateParser.date(userQuota.resetAt) > now {
            return true
        }
        if let resetAt = limitRetry?.resetAt,
           Date(timeIntervalSince1970: resetAt / 1_000) > now {
            return true
        }
        return false
    }

    var hasLimitRetry: Bool {
        limitRetry != nil
    }

    var canRetryLimit: Bool {
        limitRetry != nil && activeRun?.isRunning != true && !isInputBlockedByLimit
    }

    private var revision = 1
    private var conversation = AgentV2ConversationState()
    private var observers: [WeakObserver] = []
    private var startupTask: Task<Void, Never>?
    private var runTask: Task<Void, Never>?
    private var presentationExpiryTasks: [String: Task<Void, Never>] = [:]
    private var hydrationGeneration = 0
    private var actionGeneration = 0
    private var limitExpiryTask: Task<Void, Never>?
    private var isStopped = false
    private let hostContextProvider: AgentV2HostContextProvider
    private let initialHostContextRetryDelay: Duration

    init(client: AgentV2Client, initialHostContextRetryDelay: Duration = .seconds(1)) {
        AgentV2LegacyWidgetCleanup.run()
        self.client = client
        self.initialHostContextRetryDelay = initialHostContextRetryDelay
        hostContextProvider = AgentV2HostContextProvider(client: client)
        hostContextProvider.isRunActive = { [weak self] in
            self?.activeRun?.isRunning == true
        }
        hostContextProvider.onAuthorityContextInvalidated = { [weak self] in
            self?.handleAuthorityContextInvalidation()
        }
        hostContextProvider.onAuthorityContextPublished = { [weak self] in
            self?.refreshActionPresentations()
        }
        WalletCoreData.add(eventObserver: self)
    }

    deinit {
        startupTask?.cancel()
        runTask?.cancel()
        limitExpiryTask?.cancel()
        presentationExpiryTasks.values.forEach { $0.cancel() }
    }

    func start() {
        guard !isStopped, startupTask == nil, thread == nil else { return }
        startupTask = Task { [weak self] in
            guard let self else { return }
            for attempt in 0..<Self.initialHostContextMaxAttempts {
                let didPublishHostContext = await self.hostContextProvider.start()
                guard !Task.isCancelled else { return }
                if didPublishHostContext {
                    self.error = nil
                    async let hints: Void = self.loadHints()
                    async let availability: Void = self.client.loadAvailability()
                    async let userQuota: Void = self.client.loadUserQuota()
                    await self.loadDefaultThread()
                    _ = await (hints, availability, userQuota)
                    self.startupTask = nil
                    return
                }

                self.error = lang("Agent is unavailable")
                self.notifyObservers()
                guard attempt + 1 < Self.initialHostContextMaxAttempts else {
                    self.startupTask = nil
                    return
                }
                do {
                    try await Task.sleep(for: self.initialHostContextRetryDelay)
                } catch {
                    return
                }
            }
        }
    }

    func stop() {
        guard !isStopped else { return }
        isStopped = true
        startupTask?.cancel()
        startupTask = nil
        WalletCoreData.remove(observer: self)
        hostContextProvider.stop()
        runTask?.cancel()
        runTask = nil
        limitExpiryTask?.cancel()
        limitExpiryTask = nil
        hydrationGeneration += 1
        actionGeneration += 1
        presentationExpiryTasks.values.forEach { $0.cancel() }
        presentationExpiryTasks.removeAll()
        observers.removeAll()
    }

    func addObserver(_ observer: AgentV2CoordinatorObserver) {
        observers.removeAll { $0.value == nil || $0.value === observer }
        observers.append(WeakObserver(observer))
    }

    func removeObserver(_ observer: AgentV2CoordinatorObserver) {
        observers.removeAll { $0.value == nil || $0.value === observer }
    }

    func loadHints() async {
        guard !isStopped else { return }
        hints = try? await client.hints()
        guard !isStopped else { return }
        notifyObservers()
    }

    func loadDefaultThread() async {
        guard !isStopped else { return }
        do {
            let response = try await client.defaultThread()
            guard !isStopped else { return }
            try bindThread(response.thread)
            await hydrate()
        } catch {
            guard !isStopped else { return }
            log.error("default thread load failed error=\(error)")
            self.error = lang("Failed to load chat")
            notifyObservers()
        }
    }

    func clearThread() async -> Bool {
        guard !isStopped, let thread, activeRun?.isRunning != true else { return false }
        guard let result = try? await client.clearThread(id: thread.id, revision: currentRevision()),
              result.ok,
              let updated = result.value?.thread else { return false }
        guard !isStopped, (try? bindThread(updated, notify: false)) != nil else { return false }
        hydrationGeneration += 1
        invalidateActionPresentations(threadId: thread.id)
        conversation.removeAllMessages()
        nextMessageCursor = nil
        runActivity = nil
        limitRetry = nil
        scheduleLimitExpiryUpdate()
        notifyObservers()
        return true
    }

    func hydrate() async {
        guard !isStopped, let threadId = thread?.id else { return }
        hydrationGeneration += 1
        let generation = hydrationGeneration
        do {
            let page = try await client.messages(threadId: threadId, cursor: nil, limit: 50)
            guard !isStopped,
                  hydrationGeneration == generation,
                  page.thread.id == threadId,
                  page.messages.allSatisfy({ $0.threadId == threadId }) else {
                throw AgentV2NativeContractError.threadBindingMismatch
            }
            invalidateActionPresentations(threadId: threadId)
            try bindThread(page.thread, notify: false)
            let hydratedMessages = page.messages.map(hydratedMessage)
            conversation.replaceMessages(hydratedMessages)
            nextMessageCursor = page.nextCursor
            if limitRetry == nil {
                error = nil
            }
            refreshActionPresentations(in: hydratedMessages, threadId: threadId)
            notifyObservers()
        } catch {
            guard !isStopped, hydrationGeneration == generation else { return }
            log.error("thread hydration failed error=\(error)")
            self.error = lang("Failed to load chat")
            notifyObservers()
        }
    }

    func loadOlderMessages() async {
        guard !isStopped, let threadId = thread?.id, let cursor = nextMessageCursor else { return }
        let generation = hydrationGeneration
        guard let page = try? await client.messages(threadId: threadId, cursor: cursor, limit: 50) else { return }
        guard !isStopped,
              hydrationGeneration == generation,
              nextMessageCursor == cursor,
              page.thread.id == threadId,
              page.messages.allSatisfy({ $0.threadId == threadId }) else { return }
        guard (try? bindThread(page.thread, notify: false)) != nil else { return }
        let hydratedMessages = page.messages.map(hydratedMessage)
        conversation.prependMessages(hydratedMessages)
        nextMessageCursor = page.nextCursor
        refreshActionPresentations(in: hydratedMessages, threadId: threadId)
        notifyObservers()
    }

    func send(
        input: ApiAgentV2RunInput,
        entryPoint: ApiAgentV2EntryPoint? = .agentTab,
        followup: ApiAgentV2RunCommand.FollowUpReference? = nil,
        inputContinuation: ApiAgentV2RunCommand.InputContinuationReference? = nil,
        walletScopeSelection: ApiAgentV2RunCommand.WalletScopeSelectionReference? = nil,
        visibleText: String? = nil
    ) {
        guard !isStopped,
              let threadId = thread?.id,
              activeRun?.isRunning != true,
              !isInputBlockedByLimit else { return }
        switch input {
        case .edit, .regenerate:
            invalidateActionPresentations(threadId: threadId)
        case .append:
            break
        }
        limitRetry = nil
        scheduleLimitExpiryUpdate()
        let localInputMessageId: String?
        if let visibleText, !visibleText.isEmpty {
            let messageId = "local-\(UUID().uuidString.lowercased())"
            conversation.appendMessage(AgentV2NativeMessage(
                id: messageId,
                threadId: threadId,
                role: .user,
                text: visibleText
            ))
            localInputMessageId = messageId
        } else {
            localInputMessageId = nil
        }
        activeRun = RunState(
            clientRunId: nil,
            runId: nil,
            threadId: threadId,
            localInputMessageId: localInputMessageId,
            isRunning: true
        )
        runActivity = nil
        error = nil
        notifyObservers()

        let command = ApiAgentV2RunCommand(
            threadId: threadId,
            expectedThreadRevision: currentRevision(),
            input: input,
            entryPoint: entryPoint,
            followupOf: followup,
            continuationOf: inputContinuation,
            walletScopeSelectionOf: walletScopeSelection
        )
        runTask?.cancel()
        runTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await self.client.startRun(command)
                guard !Task.isCancelled, !self.isStopped else { return }
                if self.activeRun?.threadId == threadId, self.activeRun?.runId == nil {
                    self.activeRun?.clientRunId = result.clientRunId
                    self.activeRun?.runId = result.runId
                }
                if self.conversation.reconcileOptimisticInputMessage(
                    localId: self.activeRun?.localInputMessageId,
                    canonicalId: result.inputMessageId
                ) {
                    self.notifyObservers()
                }
                self.activeRun?.isRunning = false
                self.hostContextProvider.flushDeferredDynamicUpdate()
            } catch {
                guard !Task.isCancelled, !self.isStopped else { return }
                log.error("run start failed error=\(error)")
                self.activeRun?.isRunning = false
                self.hostContextProvider.flushDeferredDynamicUpdate()
                let runStartError = lang("Agent is unavailable")
                self.runTask = nil
                await self.hydrate()
                self.error = runStartError
                self.notifyObservers()
                return
            }
            self.runTask = nil
            await self.hydrate()
        }
    }

    func selectWalletScopeChoice(messageId: String, choiceId: String) {
        guard activeRun?.isRunning != true,
              let message = messages.first(where: { $0.id == messageId }),
              let controls = message.walletControls,
              AgentV2DateParser.date(controls.expiresAt) > Date(),
              let choice = controls.scopeChoices.first(where: { $0.choiceId == choiceId }) else { return }
        send(
            input: .append(text: choice.label),
            entryPoint: nil,
            walletScopeSelection: .init(
                sourceAssistantMessageId: messageId,
                choiceId: choice.choiceId
            ),
            visibleText: choice.label
        )
    }

    func cancelRun() {
        guard let runId = activeRun?.runId else { return }
        Task { [client] in await client.cancelRun(runId) }
    }

    func retryLimit() {
        guard !isStopped, canRetryLimit, let retry = limitRetry else { return }
        activeRun = RunState(
            clientRunId: retry.clientRunId,
            runId: nil,
            threadId: retry.threadId,
            localInputMessageId: nil,
            isRunning: true
        )
        scheduleLimitExpiryUpdate()
        notifyObservers()

        runTask?.cancel()
        runTask = Task { [weak self] in
            guard let self else { return }
            do {
                guard let result = try await self.client.retryRun(clientRunId: retry.clientRunId) else {
                    throw AgentV2NativeContractError.retryUnavailable
                }
                guard !Task.isCancelled, !self.isStopped else { return }
                if self.activeRun?.threadId == retry.threadId {
                    self.activeRun?.clientRunId = result.clientRunId
                    self.activeRun?.runId = result.runId
                    self.activeRun?.isRunning = false
                }
                if result.state == .completed || result.state == .cancelled,
                   self.limitRetry == retry {
                    self.limitRetry = nil
                }
                self.hostContextProvider.flushDeferredDynamicUpdate()
            } catch {
                guard !Task.isCancelled, !self.isStopped else { return }
                log.error("run retry failed error=\(error)")
                self.activeRun?.isRunning = false
                self.hostContextProvider.flushDeferredDynamicUpdate()
                let retryError = lang("Agent is unavailable")
                self.runTask = nil
                await self.hydrate()
                self.error = retryError
                self.notifyObservers()
                return
            }
            self.runTask = nil
            await self.hydrate()
        }
    }

    func resolveAction(messageId: String, actionId: String) async -> ResolvedAction? {
        guard !isStopped,
              hostContextProvider.isAuthorityContextCurrent,
              let accountId = hostContextProvider.publishedActiveAccountId,
              AccountStore.account?.id == accountId else { return nil }
        let generation = actionGeneration
        guard let value = try? await client.resolveAction(messageId: messageId, actionId: actionId) else { return nil }
        guard !isStopped,
              hostContextProvider.isAuthorityContextCurrent,
              actionGeneration == generation,
              hostContextProvider.publishedActiveAccountId == accountId,
              AccountStore.account?.id == accountId else { return nil }
        return ResolvedAction(value: value, accountId: accountId)
    }

    func walletCore(event: WalletCoreData.Event) {
        guard case .agentV2(let update) = event else { return }
        handle(update)
    }

    private func handle(_ update: ApiAgentV2ClientUpdate) {
        guard !isStopped else { return }
        let change: AgentV2CoordinatorChange
        switch update {
        case .runtimeReady:
            change = .reload
        case .runStarted(let bound, let threadRevision, let inputMessageId):
            guard isBoundThread(bound.threadId) else { return }
            revision = threadRevision
            runActivity = nil
            let localInputMessageId: String?
            if let run = activeRun,
               run.threadId == bound.threadId,
               run.clientRunId == nil || run.clientRunId == bound.clientRunId {
                localInputMessageId = run.localInputMessageId
            } else {
                localInputMessageId = nil
            }
            activeRun = RunState(
                clientRunId: bound.clientRunId,
                runId: bound.runId,
                threadId: bound.threadId,
                localInputMessageId: localInputMessageId,
                isRunning: true
            )
            conversation.reconcileOptimisticInputMessage(localId: localInputMessageId, canonicalId: inputMessageId)
            change = .reload
        case .messageStarted(let bound, let messageId, let contentKind):
            guard isBoundThread(bound.threadId) else { return }
            conversation.ensureAssistantMessage(
                threadId: bound.threadId,
                messageId: messageId,
                contentKind: contentKind
            )
            change = .reload
        case .textDelta(let bound, let messageId, let delta):
            guard isBoundThread(bound.threadId) else { return }
            runActivity = nil
            conversation.ensureAssistantMessage(
                threadId: bound.threadId,
                messageId: messageId,
                contentKind: .markdown
            )
            conversation.appendMarkdown(messageId: messageId, delta: delta)
            change = .messageUpdated(id: messageId)
        case .messageContentEnded(let bound, let messageId):
            guard isBoundThread(bound.threadId) else { return }
            runActivity = nil
            conversation.endMessageContent(id: messageId)
            change = .messageUpdated(id: messageId)
        case .messageCompleted(let bound, let messageId, _, let walletControls):
            guard isBoundThread(bound.threadId) else { return }
            runActivity = nil
            conversation.completeMessage(id: messageId, walletControls: walletControls)
            change = .messageUpdated(id: messageId)
        case .actionAvailable(let bound, let messageId, let action):
            guard isBoundThread(bound.threadId) else { return }
            guard let kind = AgentV2NativeActionKind(rawValue: action.kind.rawValue) else { return }
            conversation.upsertAction(
                id: messageId,
                action: AgentV2NativeAction(
                    id: action.id,
                    kind: kind,
                    labelCode: action.labelCode,
                    presentation: nil
                )
            )
            refreshActionPresentation(
                threadId: bound.threadId,
                messageId: messageId,
                actionId: action.id
            )
            change = .messageUpdated(id: messageId)
        case .followupsAvailable(let bound, let messageId, let items):
            guard isBoundThread(bound.threadId) else { return }
            conversation.setFollowups(messageId: messageId, followups: items)
            change = .messageUpdated(id: messageId)
        case .inputContinuationsAvailable(let bound, let messageId, let items):
            guard isBoundThread(bound.threadId) else { return }
            conversation.setInputContinuations(messageId: messageId, inputContinuations: items)
            change = .messageUpdated(id: messageId)
        case .semanticContentAvailable(let bound, let messageId, let content):
            guard isBoundThread(bound.threadId) else { return }
            runActivity = nil
            conversation.ensureAssistantMessage(
                threadId: bound.threadId,
                messageId: messageId,
                contentKind: .semantic
            )
            conversation.setSemanticContent(id: messageId, content: content)
            change = .messageUpdated(id: messageId)
        case .toolActivityChanged:
            change = .reload
        case .runActivityChanged(let bound, let event):
            guard isBoundThread(bound.threadId), event.runId == bound.runId else { return }
            runActivity = event
            change = .reload
        case .runFailed(let bound, let clientRunId, let threadId, _, let code, let retryable, let resetAt):
            let target = bound?.threadId ?? threadId
            if let target, isBoundThread(target) {
                conversation.finalizeStreamingMessages()
                activeRun?.isRunning = false
                runActivity = nil
                error = AgentV2Copy.error(code)
                limitRetry = makeLimitRetry(
                    bound: bound,
                    clientRunId: clientRunId,
                    threadId: target,
                    code: code,
                    retryable: retryable,
                    resetAt: resetAt
                )
                scheduleLimitExpiryUpdate()
                if code == .threadRevisionConflict || code == .runReplayExpired {
                    Task { [weak self] in await self?.hydrate() }
                }
            }
            change = .reload
        case .runCancelled(let bound):
            guard isBoundThread(bound.threadId) else { return }
            conversation.finalizeStreamingMessages()
            activeRun?.isRunning = false
            runActivity = nil
            change = .reload
        case .availabilityChanged(let availability):
            self.availability = availability
            scheduleLimitExpiryUpdate()
            change = .reload
        case .userQuotaChanged(let quota):
            userQuota = quota
            scheduleLimitExpiryUpdate()
            change = .reload
        case .walletAuthorityChanged(let threadId):
            guard threadId.map(isBoundThread) ?? true else { return }
            if threadId == nil {
                runTask?.cancel()
                runTask = nil
                activeRun?.isRunning = false
                runActivity = nil
                conversation.finalizeStreamingMessages(status: .cancelled)
            }
            invalidateAuthorityBoundState(threadId: threadId)
            if threadId == nil, hostContextProvider.isAuthorityContextCurrent {
                refreshActionPresentations()
            }
            change = .reload
        case .walletContextChanged:
            invalidateWalletContextBoundState(threadId: nil)
            refreshActionPresentations()
            change = .reload
        case .threadChanged(let threadId, let thread):
            guard thread.id == threadId, isBoundThread(threadId) else { return }
            try? bindThread(thread, notify: false)
            change = .reload
        }
        notifyObservers(change)
    }

    private func hydratedMessage(_ persisted: ApiAgentV2PersistedMessage) -> AgentV2NativeMessage {
        AgentV2NativeMessage(persisted: persisted)
    }

    private func handleAuthorityContextInvalidation() {
        guard !isStopped else { return }
        invalidateAuthorityBoundState(threadId: thread?.id)
        notifyObservers()
    }

    private func invalidateAuthorityBoundState(threadId: String?) {
        invalidateWalletContextBoundState(threadId: threadId)
        if limitRetry != nil {
            runTask?.cancel()
            runTask = nil
            activeRun?.isRunning = false
        }
        limitRetry = nil
        scheduleLimitExpiryUpdate()
    }

    private func invalidateWalletContextBoundState(threadId: String?) {
        invalidateActionPresentations(threadId: threadId)
        conversation.clearWalletControls()
    }

    private func invalidateActionPresentations(threadId requestedThreadId: String?) {
        guard requestedThreadId.map(isBoundThread) ?? true else { return }
        actionGeneration += 1
        conversation.clearActionPresentations()
        cancelPresentationExpiryTasks(threadId: requestedThreadId)
    }

    private func refreshActionPresentations() {
        guard !isStopped,
              hostContextProvider.isAuthorityContextCurrent,
              let threadId = thread?.id else { return }
        refreshActionPresentations(in: messages, threadId: threadId)
    }

    private func refreshActionPresentations(
        in messages: [AgentV2NativeMessage],
        threadId: String
    ) {
        guard hostContextProvider.isAuthorityContextCurrent else { return }
        for message in messages where message.threadId == threadId {
            for action in message.actions where action.kind == .send {
                refreshActionPresentation(
                    threadId: threadId,
                    messageId: message.id,
                    actionId: action.id
                )
            }
        }
    }

    private func refreshActionPresentation(
        threadId: String,
        messageId: String,
        actionId: String
    ) {
        guard hostContextProvider.isAuthorityContextCurrent else { return }
        let generation = actionGeneration
        Task { [weak self] in
            guard let self,
                  let presentation = try? await self.client.actionPresentation(
                    messageId: messageId,
                    actionId: actionId
                  ) else { return }
            guard !self.isStopped,
                  self.actionGeneration == generation,
                  self.isBoundThread(threadId) else { return }
            self.conversation.setActionPresentation(
                messageId: messageId,
                actionId: actionId,
                presentation: presentation
            )
            self.schedulePresentationExpiry(
                presentation,
                threadId: threadId,
                messageId: messageId,
                actionId: actionId
            )
            self.notifyObservers(.messageUpdated(id: messageId))
        }
    }

    private func makeLimitRetry(
        bound: ApiAgentV2ClientUpdate.Bound?,
        clientRunId: String,
        threadId: String,
        code: ApiAgentV2ErrorCode,
        retryable: Bool,
        resetAt: Double?
    ) -> LimitRetry? {
        guard retryable else { return nil }
        let kind: LimitRetry.Kind
        switch code {
        case .rateLimited:
            kind = .rateLimit
        case .userQuotaExhausted where bound == nil:
            kind = .userQuota
        default:
            return nil
        }
        return LimitRetry(
            kind: kind,
            clientRunId: clientRunId,
            threadId: threadId,
            resetAt: resetAt
        )
    }

    private func scheduleLimitExpiryUpdate() {
        limitExpiryTask?.cancel()
        let now = Date()
        let resetDates = [
            availability.resetAt.map { Date(timeIntervalSince1970: $0 / 1_000) },
            userQuota.map { AgentV2DateParser.date($0.resetAt) },
            limitRetry?.resetAt.map { Date(timeIntervalSince1970: $0 / 1_000) }
        ].compactMap { $0 }.filter { $0 > now }
        guard let resetDate = resetDates.min() else {
            limitExpiryTask = nil
            return
        }
        let delay = resetDate.timeIntervalSince(now)
        limitExpiryTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(Int(delay * 1_000)))
            guard !Task.isCancelled, let self, !self.isStopped else { return }
            self.limitExpiryTask = nil
            self.notifyObservers()
            self.scheduleLimitExpiryUpdate()
        }
    }

    private func schedulePresentationExpiry(
        _ presentation: ApiAgentV2ActionPresentation,
        threadId: String,
        messageId: String,
        actionId: String
    ) {
        guard presentation.kind == .send,
              presentation.status == .active,
              let expiresAt = presentation.expiresAt else { return }
        let key = presentationKey(threadId: threadId, messageId: messageId, actionId: actionId)
        presentationExpiryTasks[key]?.cancel()
        let delay = max(0, AgentV2DateParser.date(expiresAt).timeIntervalSinceNow)
        presentationExpiryTasks[key] = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(Int(delay * 1_000)))
            guard !Task.isCancelled, let self else { return }
            guard self.isBoundThread(threadId), self.conversation.expireActionPresentation(
                messageId: messageId,
                actionId: actionId,
                expiresAt: expiresAt
            ) else { return }
            self.presentationExpiryTasks.removeValue(forKey: key)
            self.notifyObservers(.messageUpdated(id: messageId))
        }
    }

    private func cancelPresentationExpiryTasks(threadId: String?) {
        let keys = presentationExpiryTasks.keys.filter { key in
            threadId.map { key.hasPrefix("\($0)\u{0}") } ?? true
        }
        for key in keys {
            presentationExpiryTasks.removeValue(forKey: key)?.cancel()
        }
    }

    private func presentationKey(threadId: String, messageId: String, actionId: String) -> String {
        "\(threadId)\u{0}\(messageId)\u{0}\(actionId)"
    }

    private func currentRevision() -> Int {
        max(revision, thread?.revision ?? 1)
    }

    private func bindThread(_ thread: ApiAgentV2ThreadSummary, notify: Bool = true) throws {
        if let boundThread = self.thread, boundThread.id != thread.id {
            throw AgentV2NativeContractError.threadBindingMismatch
        }
        self.thread = thread
        revision = thread.revision
        if notify { notifyObservers() }
    }

    private func isBoundThread(_ threadId: String) -> Bool {
        thread?.id == threadId
    }

    private func notifyObservers(_ change: AgentV2CoordinatorChange = .reload) {
        guard !isStopped else { return }
        observers = observers.filter { $0.value != nil }
        for observer in observers {
            observer.value?.agentV2CoordinatorDidChange(self, change: change)
        }
    }
}

private enum AgentV2NativeContractError: Error {
    case threadBindingMismatch
    case retryUnavailable
}
