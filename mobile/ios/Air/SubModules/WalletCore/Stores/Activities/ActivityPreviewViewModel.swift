import WalletContext

private let previewLog = Log("ActivityPreviewViewModel")

@MainActor
public protocol ActivityPreviewViewModelDelegate: AnyObject, Sendable {
    func activityPreviewViewModelChanged()
}

/// A bounded, count-driven activity source for previews such as Home.
///
/// Unlike `ActivityListViewModel`, this model does not wait for a row to become visible before
/// loading more. It keeps advancing history until `requestedCount` *visible* activities are
/// available, or the store confirms that history is exhausted.
@MainActor
public final class ActivityPreviewViewModel: WalletCoreData.EventsObserver, Sendable {
    public enum LoadState: Equatable, Sendable {
        case loading
        case satisfied
        case exhausted
        case failed
    }

    nonisolated public let accountContext: AccountContext
    nonisolated public let accountId: String

    public private(set) var activityIDs: [String]?
    public private(set) var requestedCount: Int
    public private(set) var loadState: LoadState = .loading
    public private(set) var isEndReached: Bool?
    public weak var delegate: ActivityPreviewViewModelDelegate?

    private var activitiesById: [String: ApiActivity]?
    private let activitiesStore: _ActivityStore
    private var loadTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?

    private static let pageSize = 60
    private static let retryDelay: Duration = .seconds(10)

    public init(
        accountId: String,
        requestedCount: Int,
        delegate: any ActivityPreviewViewModelDelegate
    ) async {
        self.accountContext = AccountContext(accountId: accountId)
        self.accountId = accountId
        self.requestedCount = max(1, requestedCount)
        self.activitiesStore = .shared

        await refreshState(failed: false, notifyDelegate: false)
        self.delegate = delegate
        WalletCoreData.addImmediately(eventObserver: self)
        ensureRequestedCount()
    }

    deinit {
        loadTask?.cancel()
        retryTask?.cancel()
    }

    public func activity(for id: String) -> ApiActivity? {
        activitiesById?[id]
    }

    public func setRequestedCount(_ requestedCount: Int) async {
        let requestedCount = max(1, requestedCount)
        guard self.requestedCount != requestedCount else {
            ensureRequestedCount()
            return
        }
        self.requestedCount = requestedCount
        await refreshState(failed: false)
        ensureRequestedCount()
    }

    public func retryLoading() {
        retryTask?.cancel()
        retryTask = nil
        ensureRequestedCount()
    }

    nonisolated static func resolveLoadState(
        visibleCount: Int?,
        requestedCount: Int,
        isEndReached: Bool?,
        failed: Bool
    ) -> LoadState {
        if failed {
            return .failed
        }
        if visibleCount ?? 0 >= requestedCount {
            return .satisfied
        }
        if isEndReached == true {
            return .exhausted
        }
        return .loading
    }

    public func walletCore(event: WalletCoreData.Event) {
        switch event {
        case .activitiesChanged(let accountId, _, _) where accountId == self.accountId:
            refreshAndEnsureRequestedCount()

        case .hideTinyTransfersChanged, .hideUnverifiedNftsChanged, .tokensChanged:
            refreshAndEnsureRequestedCount()

        case .nftsChanged(let accountId) where accountId == self.accountId:
            refreshAndEnsureRequestedCount()

        case .homeActivityVisibleItemsLimitChanged:
            Task { [weak self] in
                await self?.setRequestedCount(AppStorageHelper.homeActivityVisibleItemsLimit.rawValue)
            }

        default:
            break
        }
    }

    private func refreshAndEnsureRequestedCount() {
        Task { [weak self] in
            guard let self else { return }
            await self.refreshState(failed: false)
            self.ensureRequestedCount()
        }
    }

    private func ensureRequestedCount() {
        guard needsMoreActivities, loadTask == nil else { return }
        retryTask?.cancel()
        retryTask = nil
        if loadState != .loading {
            loadState = .loading
            delegate?.activityPreviewViewModelChanged()
        }

        loadTask = Task { [weak self] in
            guard let self else { return }
            await self.loadUntilRequestedCountIsSatisfied()
            self.loadTask = nil
        }
    }

    private var needsMoreActivities: Bool {
        activityIDs?.count ?? 0 < requestedCount && isEndReached != true
    }

    private func loadUntilRequestedCountIsSatisfied() async {
        while needsMoreActivities, !Task.isCancelled {
            let stateBeforeFetch = await activitiesStore.getAccountState(accountId)
            let progressBeforeFetch = HistoryProgress(
                count: stateBeforeFetch.idsMain?.count,
                lastID: stateBeforeFetch.idsMain?.last,
                isEndReached: stateBeforeFetch.isMainHistoryEndReached
            )

            do {
                try await activitiesStore.fetchAllActivities(
                    accountId: accountId,
                    limit: Self.pageSize,
                    shouldLoadWithBudget: false
                )
            } catch {
                guard !Task.isCancelled else { return }
                previewLog.error("load failed accountId=\(accountId, .public) error=\(error, .public)")
                await refreshState(failed: true)
                scheduleRetryIfNeeded()
                return
            }

            guard !Task.isCancelled else { return }
            await refreshState(failed: false)
            guard needsMoreActivities else { return }

            let stateAfterFetch = await activitiesStore.getAccountState(accountId)
            let progressAfterFetch = HistoryProgress(
                count: stateAfterFetch.idsMain?.count,
                lastID: stateAfterFetch.idsMain?.last,
                isEndReached: stateAfterFetch.isMainHistoryEndReached
            )
            guard progressAfterFetch != progressBeforeFetch else {
                previewLog.error("load made no progress accountId=\(accountId, .public)")
                loadState = .failed
                delegate?.activityPreviewViewModelChanged()
                scheduleRetryIfNeeded()
                return
            }
        }
    }

    private func refreshState(failed: Bool, notifyDelegate: Bool = true) async {
        let accountState = await activitiesStore.getAccountState(accountId)
        let poisoningCache = await activitiesStore.getPoisoningCache(accountId)
        let visibleIDs = ActivityVisibilityFilter.visibleIDs(
            accountState.idsMain,
            activitiesById: accountState.byId,
            accountId: accountId,
            token: nil,
            poisoningCache: poisoningCache,
            hideTinyTransfers: AppStorageHelper.hideTinyTransfers
        )

        activitiesById = accountState.byId
        activityIDs = visibleIDs.map { Array($0.prefix(requestedCount)) }
        isEndReached = accountState.isMainHistoryEndReached
        loadState = Self.resolveLoadState(
            visibleCount: visibleIDs?.count,
            requestedCount: requestedCount,
            isEndReached: accountState.isMainHistoryEndReached,
            failed: failed
        )

        if notifyDelegate {
            delegate?.activityPreviewViewModelChanged()
        }
    }

    private func scheduleRetryIfNeeded() {
        guard needsMoreActivities, retryTask == nil else { return }
        retryTask = Task { [weak self] in
            do {
                try await Task.sleep(for: Self.retryDelay)
            } catch {
                return
            }
            guard let self else { return }
            self.retryTask = nil
            self.ensureRequestedCount()
        }
    }
}

private struct HistoryProgress: Equatable {
    let count: Int?
    let lastID: String?
    let isEndReached: Bool?
}
