import UIKit
import UIActivityList
import UIComponents
import WalletContext
import WalletCore

@MainActor
final class ActivityHistoryVC: ActivityListViewController, ActivityListViewModelDelegate {
    private let accountId: String
    private var pendingInitialActivityID: String?
    private var loadTask: Task<Void, Never>?

    override var headerPlaceholderHeight: CGFloat { 0 }

    init(accountId: String, initialActivityID: String? = nil) {
        self.accountId = accountId
        self.pendingInitialActivityID = initialActivityID
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    deinit {
        loadTask?.cancel()
    }

    override func loadView() {
        super.loadView()
        view.backgroundColor = .air.groupedBackground
        navigationItem.title = lang("Activity")
        setupCollectionView(collectionViewBottomConstraint: 0)
        isInitializingCache = false
        applySnapshot(makeSnapshot(), animatingDifferences: false)
        updateSkeletonState()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadTask = Task { [weak self] in
            guard let self else { return }
            let viewModel = await ActivityListViewModel(
                accountId: accountId,
                token: nil,
                delegate: self
            )
            guard !Task.isCancelled else { return }
            activityViewModel = viewModel
            transactionsUpdated(accountChanged: true, isUpdateEvent: false)
        }
    }

    func activityViewModelChanged() {
        transactionsUpdated(accountChanged: false, isUpdateEvent: true)
    }

    override func didApplySnapshot() {
        super.didApplySnapshot()
        guard let pendingInitialActivityID,
              scrollToActivity(stableID: pendingInitialActivityID, animated: false) else {
            return
        }
        self.pendingInitialActivityID = nil
    }

    override func updateSkeletonViewMask() {
        var skeletonViews = collectionView.visibleCells.compactMap { cell in
            (cell as? ActivityCell)?.contentView
        }
        skeletonViews += collectionView
            .visibleSupplementaryViews(ofKind: UICollectionView.elementKindSectionHeader)
            .compactMap { view in
                (view as? ActivityDateCell)?.skeletonView
            }
        skeletonView.applyMask(with: skeletonViews)
    }
}
