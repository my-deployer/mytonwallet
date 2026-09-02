import UIKit
import UIComponents
import WalletContext
import WalletCore

@MainActor
final class AgentV2ChatVC: WViewController, AgentV2CoordinatorObserver {
    private struct DaySection {
        let id: Date
        let title: String
        var messages: [AgentV2NativeMessage]
    }

    private final class DataSource: UITableViewDiffableDataSource<Date, String> {
        var sectionTitleProvider: ((Date) -> String?)?

        override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
            let sectionIds = snapshot().sectionIdentifiers
            guard sectionIds.indices.contains(section) else { return nil }
            return sectionTitleProvider?(sectionIds[section])
        }
    }

    private let coordinator: AgentV2Coordinator
    private let actionExecutor: AgentV2ActionExecutor
    private let tableView = UITableView(frame: .zero, style: .plain)
    private let composerView = AgentComposerView()
    private let scrollToBottomButton = AgentScrollToBottomButton()
    private let runningIndicator = UIActivityIndicatorView(style: .medium)
    private let runActivityView = UIView()
    private let runActivityLabel = UILabel()
    private let limitRetryButton = UIButton(type: .system)
    private let badgeLabel = UILabel()
    private let statusLabel = UILabel()
    private var dataSource: DataSource!
    private var sections: [DaySection] = []
    private var wasRunning = false
    private var selectedInputContinuation: ApiAgentV2RunCommand.InputContinuationReference?
    private var localizationTask: Task<Void, Never>?
    private var didConsumePendingQuery = false
    private var didStopSession = false
    private var presentationState = AgentV2ChatPresentationState()
    private var isMessageHeightUpdateScheduled = false
    private var scheduledHeightUpdatePreservesBottom = false
    private var runActivityHeightConstraint: NSLayoutConstraint!
    private var runActivityLabelTrailingConstraint: NSLayoutConstraint!
    private var runActivityLabelToRetryConstraint: NSLayoutConstraint!

    init(coordinator: AgentV2Coordinator) {
        self.coordinator = coordinator
        actionExecutor = AgentV2ActionExecutor(coordinator: coordinator)
        super.init(nibName: nil, bundle: nil)
        title = lang("Agent")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit {
        localizationTask?.cancel()
        Task { @MainActor [coordinator] in
            coordinator.stop()
        }
    }

    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        if parent == nil {
            stopSessionIfNeeded()
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        coordinator.addObserver(self)
        setupViews()
        observeLocalizationChanges()
        presentationState.synchronize(messages: coordinator.messages, isNearBottom: isNearBottom)
        reload(preserveBottom: false)
        submitPendingQueryIfPossible()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isMovingFromParent || parent?.isMovingFromParent == true
            || isBeingDismissed || navigationController?.isBeingDismissed == true {
            coordinator.removeObserver(self)
            stopSessionIfNeeded()
            if !didConsumePendingQuery {
                AgentEntryPoint.clearPendingQuery()
            }
        }
    }

    override func scrollToTop(animated: Bool) {
        scrollToBottom(animated: animated)
    }

    func agentV2CoordinatorDidChange(_ coordinator: AgentV2Coordinator, change: AgentV2CoordinatorChange) {
        presentationState.synchronize(messages: coordinator.messages, isNearBottom: isNearBottom)
        let shouldPreserveBottom = presentationState.shouldPreserveBottom(isNearBottom: isNearBottom)
        switch change {
        case .reload:
            reload(preserveBottom: shouldPreserveBottom)
        case .messageUpdated(let id):
            updateMessage(id: id, preserveBottom: shouldPreserveBottom)
        }
        submitPendingQueryIfPossible()
    }

    private func submitPendingQueryIfPossible() {
        guard !didConsumePendingQuery,
              coordinator.thread != nil,
              let query = AgentEntryPoint.consumePendingQuery() else {
            return
        }
        didConsumePendingQuery = true
        coordinator.send(
            input: .append(text: query),
            entryPoint: .agentTab,
            visibleText: query
        )
    }

    private func setupViews() {
        view.backgroundColor = .air.background
        setupHeader()

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.keyboardDismissMode = .interactive
        tableView.estimatedRowHeight = 100
        tableView.rowHeight = UITableView.automaticDimension
        tableView.delegate = self
        tableView.register(AgentV2MessageCell.self, forCellReuseIdentifier: "message")
        dataSource = DataSource(tableView: tableView) { [weak self] tableView, indexPath, messageId in
            guard let self, let message = self.findMessage(id: messageId) else { return nil }
            let cell = tableView.dequeueReusableCell(withIdentifier: "message", for: indexPath) as! AgentV2MessageCell
            self.configureCell(cell, message: message)
            return cell
        }
        dataSource.sectionTitleProvider = { [weak self] sectionId in
            self?.sections.first(where: { $0.id == sectionId })?.title
        }
        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.textAlignment = .center
        statusLabel.textColor = .air.secondaryLabel
        statusLabel.numberOfLines = 0
        statusLabel.isAccessibilityElement = true
        tableView.backgroundView = statusLabel
        view.addSubview(tableView)

        runActivityView.translatesAutoresizingMaskIntoConstraints = false
        runActivityView.clipsToBounds = true
        runActivityView.isHidden = true
        runActivityLabel.translatesAutoresizingMaskIntoConstraints = false
        runActivityLabel.font = .preferredFont(forTextStyle: .subheadline)
        runActivityLabel.adjustsFontForContentSizeCategory = true
        runActivityLabel.textColor = .air.secondaryLabel
        runActivityLabel.lineBreakMode = .byTruncatingTail
        runActivityLabel.isAccessibilityElement = true
        runActivityLabel.accessibilityTraits = .updatesFrequently
        runActivityView.addSubview(runActivityLabel)
        var retryConfiguration = UIButton.Configuration.tinted()
        retryConfiguration.title = lang("Retry")
        retryConfiguration.cornerStyle = .capsule
        limitRetryButton.configuration = retryConfiguration
        limitRetryButton.translatesAutoresizingMaskIntoConstraints = false
        limitRetryButton.addTarget(self, action: #selector(retryLimitPressed), for: .touchUpInside)
        limitRetryButton.isHidden = true
        runActivityView.addSubview(limitRetryButton)
        view.addSubview(runActivityView)

        composerView.translatesAutoresizingMaskIntoConstraints = false
        composerView.onDraftTextChanged = { [weak self] in self?.updateComposer() }
        composerView.onSend = { [weak self] in self?.sendCurrentText() }
        composerView.onHintsToggle = { [weak self] in self?.showHints() }
        composerView.onLayoutHeightChanged = { [weak self] in
            guard let self,
                  self.presentationState.shouldPreserveBottom(isNearBottom: self.isNearBottom) else { return }
            self.view.layoutIfNeeded()
            self.scrollToBottom(animated: false)
        }
        view.addSubview(composerView)

        scrollToBottomButton.translatesAutoresizingMaskIntoConstraints = false
        scrollToBottomButton.addTarget(self, action: #selector(scrollToBottomPressed), for: .touchUpInside)
        view.addSubview(scrollToBottomButton)

        runActivityHeightConstraint = runActivityView.heightAnchor.constraint(equalToConstant: 0)
        runActivityLabelTrailingConstraint = runActivityLabel.trailingAnchor.constraint(
            equalTo: runActivityView.trailingAnchor,
            constant: -20
        )
        runActivityLabelToRetryConstraint = runActivityLabel.trailingAnchor.constraint(
            lessThanOrEqualTo: limitRetryButton.leadingAnchor,
            constant: -12
        )
        let keyboardConstraint = composerView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        let fallback = composerView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        fallback.priority = .defaultHigh
        NSLayoutConstraint.activate([
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.bottomAnchor.constraint(equalTo: runActivityView.topAnchor),

            runActivityView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            runActivityView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            runActivityView.bottomAnchor.constraint(equalTo: composerView.topAnchor),
            runActivityHeightConstraint,
            runActivityLabel.leadingAnchor.constraint(equalTo: runActivityView.leadingAnchor, constant: 20),
            runActivityLabelTrailingConstraint,
            runActivityLabel.centerYAnchor.constraint(equalTo: runActivityView.centerYAnchor),
            limitRetryButton.trailingAnchor.constraint(equalTo: runActivityView.trailingAnchor, constant: -12),
            limitRetryButton.centerYAnchor.constraint(equalTo: runActivityView.centerYAnchor),

            composerView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            composerView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            keyboardConstraint,
            fallback,

            scrollToBottomButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            scrollToBottomButton.bottomAnchor.constraint(equalTo: composerView.topAnchor, constant: -12)
        ])
        updateComposer()
    }

    private func setupHeader() {
        let badge = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
        badge.layer.cornerRadius = 18
        badge.layer.cornerCurve = .continuous
        badge.clipsToBounds = true
        badge.isAccessibilityElement = true
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badgeLabel.text = lang("Agent")
        badgeLabel.font = .preferredFont(forTextStyle: .headline)
        badgeLabel.adjustsFontForContentSizeCategory = true
        badgeLabel.textColor = .tintColor
        runningIndicator.translatesAutoresizingMaskIntoConstraints = false
        badge.contentView.addSubview(badgeLabel)
        badge.contentView.addSubview(runningIndicator)
        NSLayoutConstraint.activate([
            badgeLabel.leadingAnchor.constraint(equalTo: badge.contentView.leadingAnchor, constant: 16),
            badgeLabel.topAnchor.constraint(equalTo: badge.contentView.topAnchor, constant: 7),
            badgeLabel.bottomAnchor.constraint(equalTo: badge.contentView.bottomAnchor, constant: -7),
            runningIndicator.leadingAnchor.constraint(equalTo: badgeLabel.trailingAnchor, constant: 6),
            runningIndicator.trailingAnchor.constraint(equalTo: badge.contentView.trailingAnchor, constant: -10),
            runningIndicator.centerYAnchor.constraint(equalTo: badgeLabel.centerYAnchor),
            runningIndicator.widthAnchor.constraint(equalToConstant: 16),
            runningIndicator.heightAnchor.constraint(equalToConstant: 16)
        ])
        agentHostNavigationItem.titleView = badge
        agentHostNavigationItem.accessibilityLabel = lang("Agent")

        refreshMenu()
    }

    private func refreshMenu() {
        agentHostNavigationItem.titleView?.accessibilityLabel = lang("Agent")
        guard coordinator.thread != nil else {
            agentHostNavigationItem.rightBarButtonItem = nil
            return
        }
        let isRunning = coordinator.activeRun?.isRunning == true
        var clearAttributes: UIMenuElement.Attributes = []
        if isRunning {
            clearAttributes.insert(.disabled)
        }
        let clear = UIAction(title: lang("Clear Chat"), image: UIImage(systemName: "eraser"), attributes: clearAttributes) { [weak self] _ in self?.confirmClear() }
        let button = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: UIMenu(children: [clear]))
        button.accessibilityLabel = lang("Chat options")
        agentHostNavigationItem.rightBarButtonItem = button
    }

    private func reload(preserveBottom: Bool) {
        let updatedSections = Self.makeSections(makeVisibleMessages())
        statusLabel.text = coordinator.error
        statusLabel.isHidden = coordinator.error == nil || !updatedSections.isEmpty
        sections = updatedSections
        let currentMessageIds = Set(dataSource.snapshot().itemIdentifiers)
        var snapshot = NSDiffableDataSourceSnapshot<Date, String>()
        for section in sections {
            snapshot.appendSections([section.id])
            snapshot.appendItems(section.messages.map(\.id), toSection: section.id)
        }
        let existingMessageIds = snapshot.itemIdentifiers.filter(currentMessageIds.contains)
        if !existingMessageIds.isEmpty {
            snapshot.reconfigureItems(existingMessageIds)
        }
        dataSource.apply(snapshot, animatingDifferences: false)
        updateState(preserveBottom: preserveBottom)
    }

    private func updateMessage(id: String, preserveBottom: Bool) {
        guard let updatedMessage = coordinator.messages.first(where: { $0.id == id }),
              let indexPath = findIndexPath(messageId: id, in: sections),
              Calendar.autoupdatingCurrent.isDate(
                  updatedMessage.createdAt,
                  inSameDayAs: sections[indexPath.section].id
              ) else {
            reload(preserveBottom: preserveBottom)
            return
        }

        sections[indexPath.section].messages[indexPath.row] = updatedMessage
        if let cell = tableView.cellForRow(at: indexPath) as? AgentV2MessageCell {
            configureCell(cell, message: updatedMessage)
            scheduleMessageHeightUpdate(preserveBottom: preserveBottom)
        }
        updateState(preserveBottom: preserveBottom)
    }

    private func makeVisibleMessages() -> [AgentV2NativeMessage] {
        var visibleMessages = coordinator.messages
        if let error = coordinator.error,
           let threadId = coordinator.thread?.id,
           !coordinator.hasLimitRetry,
           !visibleMessages.isEmpty {
            visibleMessages.append(AgentV2NativeMessage(
                id: "local-run-error",
                threadId: threadId,
                role: .assistant,
                text: error
            ))
        }
        return visibleMessages
    }

    private func findIndexPath(messageId: String, in sections: [DaySection]) -> IndexPath? {
        for (sectionIndex, section) in sections.enumerated() {
            guard let rowIndex = section.messages.firstIndex(where: { $0.id == messageId }) else { continue }
            return IndexPath(row: rowIndex, section: sectionIndex)
        }
        return nil
    }

    private func findMessage(id: String) -> AgentV2NativeMessage? {
        sections.lazy.compactMap { section in
            section.messages.first(where: { $0.id == id })
        }.first
    }

    private func updateState(preserveBottom: Bool) {
        refreshMenu()
        let isRunning = coordinator.activeRun?.isRunning == true
        if isRunning { runningIndicator.startAnimating() } else { runningIndicator.stopAnimating() }
        updateRunActivity()
        if isRunning != wasRunning {
            UIAccessibility.post(
                notification: .announcement,
                argument: isRunning ? lang("$agent_chat_running") : lang("Agent")
            )
            wasRunning = isRunning
        }
        updateComposer()
        if preserveBottom {
            DispatchQueue.main.async { [weak self] in
                guard let self,
                      self.presentationState.shouldPreserveBottom(isNearBottom: self.isNearBottom) else { return }
                self.scrollToBottom(animated: false)
            }
        }
    }

    private func updateRunActivity() {
        if let activity = coordinator.runActivity {
            let text = AgentV2Copy.runActivity(activity)
            runActivityLabel.text = text
            runActivityLabel.accessibilityLabel = text
            runActivityLabel.accessibilityTraits = .updatesFrequently
            runActivityLabelToRetryConstraint.isActive = false
            runActivityLabelTrailingConstraint.isActive = true
            limitRetryButton.isHidden = true
            runActivityView.isHidden = false
            runActivityHeightConstraint.constant = 44
            return
        }
        if coordinator.hasLimitRetry {
            let text = coordinator.error ?? AgentV2Copy.error(.userQuotaExhausted)
            runActivityLabel.text = text
            runActivityLabel.accessibilityLabel = text
            runActivityLabel.accessibilityTraits = .staticText
            runActivityLabelTrailingConstraint.isActive = false
            runActivityLabelToRetryConstraint.isActive = true
            var configuration = limitRetryButton.configuration
            configuration?.title = lang("Retry")
            limitRetryButton.configuration = configuration
            limitRetryButton.isEnabled = coordinator.canRetryLimit
            limitRetryButton.isHidden = false
            runActivityView.isHidden = false
            runActivityHeightConstraint.constant = 52
            return
        }
        runActivityLabel.text = nil
        runActivityLabel.accessibilityLabel = nil
        runActivityLabelToRetryConstraint.isActive = false
        runActivityLabelTrailingConstraint.isActive = true
        limitRetryButton.isHidden = true
        runActivityView.isHidden = true
        runActivityHeightConstraint.constant = 0
    }

    private func scheduleMessageHeightUpdate(preserveBottom: Bool) {
        scheduledHeightUpdatePreservesBottom = scheduledHeightUpdatePreservesBottom || preserveBottom
        guard !isMessageHeightUpdateScheduled else { return }
        isMessageHeightUpdateScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let shouldPreserveBottom = self.scheduledHeightUpdatePreservesBottom
            self.isMessageHeightUpdateScheduled = false
            self.scheduledHeightUpdatePreservesBottom = false
            UIView.performWithoutAnimation {
                self.tableView.performBatchUpdates(nil)
            }
            if shouldPreserveBottom,
               self.presentationState.shouldPreserveBottom(isNearBottom: self.isNearBottom) {
                self.scrollToBottom(animated: false)
            }
        }
    }

    private static func makeSections(_ messages: [AgentV2NativeMessage]) -> [DaySection] {
        let calendar = Calendar.autoupdatingCurrent
        var grouped: [(Date, [AgentV2NativeMessage])] = []
        for message in messages.sorted(by: { $0.createdAt < $1.createdAt }) {
            let start = calendar.startOfDay(for: message.createdAt)
            if grouped.last?.0 == start {
                grouped[grouped.count - 1].1.append(message)
            } else {
                grouped.append((start, [message]))
            }
        }
        let formatter = DateFormatter()
        formatter.locale = LocalizationSupport.shared.locale
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return grouped.map { _, messages in
            let first = messages[0].createdAt
            let title: String
            if calendar.isDateInToday(first) {
                let time = DateFormatter.localizedString(from: first, dateStyle: .none, timeStyle: .short)
                title = "\(lang("Today")) \(time)"
            } else {
                title = formatter.string(from: first)
            }
            return DaySection(id: calendar.startOfDay(for: first), title: title, messages: messages)
        }
    }

    private var isNearBottom: Bool {
        let distance = tableView.contentSize.height - (tableView.contentOffset.y + tableView.bounds.height - tableView.adjustedContentInset.bottom)
        return distance < 80
    }

    private func scrollToBottom(animated: Bool) {
        guard let lastSection = sections.indices.last,
              let lastRow = sections[lastSection].messages.indices.last else { return }
        presentationState.requestedScrollToLatest()
        tableView.scrollToRow(at: IndexPath(row: lastRow, section: lastSection), at: .bottom, animated: animated)
    }

    private func updateComposer() {
        let text = composerView.draftText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let isRunning = coordinator.activeRun?.isRunning == true
        composerView.setSendEnabled(
            !text.isEmpty
            && !isRunning
            && !coordinator.isInputBlockedByLimit
            && coordinator.thread != nil
        )
        composerView.setHintsToggleVisible(coordinator.hints?.items.isEmpty == false, isSelected: false)
    }

    private func sendCurrentText() {
        guard let text = composerView.draftText?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return }
        let inputContinuation = selectedInputContinuation
        selectedInputContinuation = nil
        send(
            input: .append(text: text),
            entryPoint: .agentTab,
            inputContinuation: inputContinuation,
            visibleText: text,
            clearDraft: true
        )
    }

    private func showHints() {
        guard let hints = coordinator.hints, !hints.items.isEmpty else { return }
        selectedInputContinuation = nil
        let alert = UIAlertController(title: lang("Suggestions"), message: nil, preferredStyle: .actionSheet)
        for hint in hints.items {
            let copy = AgentV2Copy.hint(hint.id)
            alert.addAction(UIAlertAction(title: copy.title, style: .default) { [weak self] _ in
                guard let self else { return }
                self.send(
                    input: .append(text: copy.prompt),
                    entryPoint: .emptyState(hintId: hint.id.rawValue, catalogVersion: hints.catalogVersion),
                    visibleText: copy.prompt,
                    clearDraft: false
                )
            })
        }
        alert.addAction(UIAlertAction(title: lang("Cancel"), style: .cancel))
        present(alert, animated: true)
    }

    private func send(
        input: ApiAgentV2RunInput,
        entryPoint: ApiAgentV2EntryPoint?,
        inputContinuation: ApiAgentV2RunCommand.InputContinuationReference? = nil,
        visibleText: String,
        clearDraft: Bool
    ) {
        guard coordinator.thread != nil else { return }
        if clearDraft { composerView.clearDraft() }
        coordinator.send(
            input: input,
            entryPoint: entryPoint,
            inputContinuation: inputContinuation,
            visibleText: visibleText
        )
        updateComposer()
        DispatchQueue.main.async { [weak self] in self?.scrollToBottom(animated: true) }
    }

    private func followUp(_ followup: ApiAgentV2FollowUp, message: AgentV2NativeMessage) {
        selectedInputContinuation = nil
        coordinator.send(
            input: .append(text: followup.text),
            entryPoint: nil,
            followup: .init(messageId: message.id, followupId: followup.id),
            visibleText: followup.text
        )
    }

    private func selectWalletScopeChoice(
        _ choice: ApiAgentV2WalletConversationControls.ScopeChoice,
        message: AgentV2NativeMessage
    ) {
        selectedInputContinuation = nil
        coordinator.selectWalletScopeChoice(messageId: message.id, choiceId: choice.choiceId)
    }

    private func observeLocalizationChanges() {
        localizationTask = Task { @MainActor [weak self] in
            for await _ in NotificationCenter.default.notifications(
                named: NSLocale.currentLocaleDidChangeNotification
            ) {
                guard !Task.isCancelled else { return }
                guard let self else { return }
                self.reload(
                    preserveBottom: self.presentationState.shouldPreserveBottom(isNearBottom: self.isNearBottom)
                )
            }
        }
    }

    private func selectInputContinuation(
        _ continuation: ApiAgentV2InputContinuation,
        message: AgentV2NativeMessage
    ) {
        selectedInputContinuation = .init(messageId: message.id, continuationId: continuation.id)
        composerView.setDraftText(composerView.draftText ?? "", focus: true)
        updateComposer()
    }

    private func configureCell(_ cell: AgentV2MessageCell, message: AgentV2NativeMessage) {
        var revealPhase = presentationState.revealPhase(for: message)
        if revealPhase == .finishing, cell.messageId != message.id {
            presentationState.revealCompleted(messageId: message.id)
            revealPhase = .staticContent
        }
        cell.configure(
            message: message,
            revealPhase: revealPhase
        )
        cell.onPreferredHeightChanged = { [weak self] in
            guard let self else { return }
            self.scheduleMessageHeightUpdate(
                preserveBottom: self.presentationState.shouldPreserveBottom(isNearBottom: self.isNearBottom)
            )
        }
        cell.onStreamingRevealCompleted = { [weak self] in
            guard let self else { return }
            self.presentationState.revealCompleted(messageId: message.id)
        }
        cell.onFollowUp = { [weak self] followup in self?.followUp(followup, message: message) }
        cell.onInputContinuation = { [weak self] continuation in
            self?.selectInputContinuation(continuation, message: message)
        }
        cell.onWalletControl = { [weak self] choice in
            self?.selectWalletScopeChoice(choice, message: message)
        }
        cell.onAction = { [weak self] action in
            self?.actionExecutor.perform(action, messageId: message.id)
        }
    }

    private func confirmClear() {
        let alert = UIAlertController(title: lang("Clear Chat"), message: lang("This action cannot be undone."), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: lang("Cancel"), style: .cancel))
        alert.addAction(UIAlertAction(title: lang("Clear"), style: .destructive) { [weak self] _ in
            guard let self else { return }
            Task { _ = await self.coordinator.clearThread() }
        })
        present(alert, animated: true)
    }

    private func stopSessionIfNeeded() {
        guard !didStopSession else { return }
        didStopSession = true
        coordinator.removeObserver(self)
        coordinator.stop()
    }

    @objc private func scrollToBottomPressed() { scrollToBottom(animated: true) }

    @objc private func retryLimitPressed() { coordinator.retryLimit() }
}

extension AgentV2ChatVC: UITableViewDelegate {
    func tableView(_ tableView: UITableView, didEndDisplaying cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        guard let messageId = (cell as? AgentV2MessageCell)?.messageId else { return }
        presentationState.revealLeftViewport(messageId: messageId)
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        presentationState.userStartedScrolling()
    }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        guard !decelerate else { return }
        resumeStreamingRevealFollowIfNeeded()
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        resumeStreamingRevealFollowIfNeeded()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        scrollToBottomButton.setButtonVisible(!isNearBottom, animated: true)
        guard scrollView.contentOffset.y < -80,
              coordinator.nextMessageCursor != nil else { return }
        Task { [weak self] in await self?.coordinator.loadOlderMessages() }
    }

    private func resumeStreamingRevealFollowIfNeeded() {
        presentationState.userFinishedScrolling(isNearBottom: isNearBottom)
    }
}
