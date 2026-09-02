import UIKit
import OrderedCollections

struct ActivityListSnapshotProxy {
    typealias Section = ActivityListViewModel.Section
    typealias Row = ActivityListViewModel.Row

    private let accountId: String
    private let customSectionIDs: [String]
    private let remoteLoadThreshold: Int

    private var loadedActivityIds: [String] = []
    private var loadedIndexByStableId: [String: Int] = [:]

    init(
        accountId: String,
        customSectionIDs: [String],
        remoteLoadThreshold: Int = 20
    ) {
        self.accountId = accountId
        self.customSectionIDs = customSectionIDs
        self.remoteLoadThreshold = remoteLoadThreshold
    }

    mutating func didUpdateData(idsByDate: OrderedDictionary<Date, [String]>?) {
        let nextLoadedIds = idsByDate?.values.flatMap { $0 } ?? []
        loadedActivityIds = nextLoadedIds
        loadedIndexByStableId = Dictionary(nextLoadedIds.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
    }

    func rowDidBecomeVisible(_ row: Row, isEndReached: Bool?) -> Bool {
        let stableId: String? = switch row {
        case .transaction(_, let stableId):
            stableId
        default:
            nil
        }

        return shouldRequestRemotePage(for: row, stableId: stableId, isEndReached: isEndReached)
    }

    func makeSnapshot(
        idsByDate: OrderedDictionary<Date, [String]>?,
        isEndReached: Bool?,
        updatedIds: [String]
    ) -> NSDiffableDataSourceSnapshot<Section, Row> {
        var snapshot = NSDiffableDataSourceSnapshot<Section, Row>()
        snapshot.appendSections([.headerPlaceholder])
        snapshot.appendItems([.headerPlaceholder])

        if !customSectionIDs.isEmpty {
            for customSectionID in customSectionIDs {
                let section = Section.custom(customSectionID)
                snapshot.appendSections([section])
                snapshot.appendItems([.custom(customSectionID)], toSection: section)
            }
        }

        if let idsByDate {
            for (date, ids) in idsByDate {
                guard !ids.isEmpty else { continue }
                snapshot.appendSections([.transactions(accountId, date)])
                snapshot.appendItems(ids.map { Row.transaction(accountId, $0) })
            }
        } else {
            snapshot.appendSections([.placeholderTransactionsSection])
            snapshot.appendItems(ActivityListViewModel.placeholderTransactionRows)
        }

        if let idsByDate, idsByDate.isEmpty {
            if isEndReached == true {
                snapshot.appendSections([.emptyPlaceholder])
                snapshot.appendItems([.emptyPlaceholder])
            } else {
                snapshot.appendSections([.placeholderTransactionsSection])
                snapshot.appendItems([.loadingMore])
            }
        } else if let idsByDate, !idsByDate.isEmpty, isEndReached != true {
            snapshot.appendItems([.loadingMore])
        }

        let visibleIds = Set(snapshot.itemIdentifiers.compactMap { row -> String? in
            if case .transaction(_, let stableId) = row {
                return stableId
            }
            return nil
        })
        let visibleUpdatedIds = updatedIds.filter { visibleIds.contains($0) }
        snapshot.reconfigureItems(visibleUpdatedIds.map { Row.transaction(accountId, $0) })

        return snapshot
    }

    private func shouldRequestRemotePage(for row: Row, stableId: String?, isEndReached: Bool?) -> Bool {
        guard isEndReached != true else {
            return false
        }

        if case .loadingMore = row {
            return true
        }

        guard let stableId,
              let index = loadedIndexByStableId[stableId]
        else {
            return false
        }

        return index >= max(loadedActivityIds.count - remoteLoadThreshold, 0)
    }
}
