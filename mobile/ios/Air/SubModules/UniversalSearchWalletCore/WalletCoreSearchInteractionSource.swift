import Foundation
import UniversalSearchCore

public struct WalletCoreSearchInteractionRecord: Hashable, Sendable {
    public let entityID: SearchEntityID
    public let lastSelectedAt: Date
    public let selectionCount: Int

    public init(
        entityID: SearchEntityID,
        lastSelectedAt: Date,
        selectionCount: Int
    ) {
        self.entityID = entityID
        self.lastSelectedAt = lastSelectedAt
        self.selectionCount = max(0, selectionCount)
    }
}

/// Persists lightweight search interactions without retaining query text or
/// display data. Records only enrich entities contributed by the live corpus,
/// so stale or account-specific IDs cannot create standalone search results.
public final class WalletCoreSearchInteractionStore: @unchecked Sendable {
    public static let shared = WalletCoreSearchInteractionStore()

    private static let defaultStorageKey = "universalSearch.interactions.v2"
    private static let legacyUnscopedStorageKey = "universalSearch.interactions.v1"

    private struct PersistedRecord: Codable {
        let entityID: String
        let lastSelectedAt: Date
        let selectionCount: Int
    }

    private let userDefaults: UserDefaults
    private let storageKeyPrefix: String
    private let maximumRecordCount: Int
    private let lock = NSLock()
    private var recordsByScopeID: [String: [SearchEntityID: WalletCoreSearchInteractionRecord]] = [:]
    private var loadedScopeIDs = Set<String>()

    public init(
        userDefaults: UserDefaults = .standard,
        storageKey: String = "universalSearch.interactions.v2",
        maximumRecordCount: Int = 100
    ) {
        self.userDefaults = userDefaults
        self.storageKeyPrefix = storageKey
        self.maximumRecordCount = max(0, maximumRecordCount)
        if storageKey == Self.defaultStorageKey {
            userDefaults.removeObject(forKey: Self.legacyUnscopedStorageKey)
        }
    }

    @discardableResult
    public func recordSelection(
        of entityID: SearchEntityID,
        scopeID: String,
        at date: Date = Date()
    ) -> WalletCoreSearchInteractionRecord {
        lock.lock()
        defer { lock.unlock() }

        loadRecordsIfNeeded(scopeID: scopeID)
        var recordsByEntityID = recordsByScopeID[scopeID] ?? [:]
        let previousCount = recordsByEntityID[entityID]?.selectionCount ?? 0
        let nextCount = previousCount == Int.max ? Int.max : previousCount + 1
        let record = WalletCoreSearchInteractionRecord(
            entityID: entityID,
            lastSelectedAt: date,
            selectionCount: nextCount
        )
        recordsByEntityID[entityID] = record
        trimAndPersist(recordsByEntityID, scopeID: scopeID)
        return record
    }

    public func records(scopeID: String) -> [WalletCoreSearchInteractionRecord] {
        lock.lock()
        defer { lock.unlock() }
        loadRecordsIfNeeded(scopeID: scopeID)
        return Self.sorted(Array(recordsByScopeID[scopeID, default: [:]].values))
    }

    public func clear(scopeID: String) {
        lock.lock()
        defer { lock.unlock() }
        recordsByScopeID[scopeID] = [:]
        loadedScopeIDs.insert(scopeID)
        userDefaults.removeObject(forKey: storageKey(for: scopeID))
    }

    public func clearAll() {
        lock.lock()
        defer { lock.unlock() }
        recordsByScopeID.removeAll()
        loadedScopeIDs.removeAll()
        let prefix = "\(storageKeyPrefix)."
        for key in userDefaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
            userDefaults.removeObject(forKey: key)
        }
    }

    private func loadRecordsIfNeeded(scopeID: String) {
        guard loadedScopeIDs.insert(scopeID).inserted else { return }
        recordsByScopeID[scopeID] = Self.loadRecords(
            from: userDefaults,
            storageKey: storageKey(for: scopeID),
            maximumRecordCount: maximumRecordCount
        )
    }

    private func trimAndPersist(
        _ recordsByEntityID: [SearchEntityID: WalletCoreSearchInteractionRecord],
        scopeID: String
    ) {
        let records = Array(Self.sorted(Array(recordsByEntityID.values)).prefix(maximumRecordCount))
        self.recordsByScopeID[scopeID] = Dictionary(
            uniqueKeysWithValues: records.map { ($0.entityID, $0) }
        )
        let persistedRecords = records.map {
            PersistedRecord(
                entityID: $0.entityID.rawValue,
                lastSelectedAt: $0.lastSelectedAt,
                selectionCount: $0.selectionCount
            )
        }
        guard let data = try? JSONEncoder().encode(persistedRecords) else { return }
        userDefaults.set(data, forKey: storageKey(for: scopeID))
    }

    private func storageKey(for scopeID: String) -> String {
        let encodedScopeID = Data(scopeID.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(storageKeyPrefix).\(encodedScopeID)"
    }

    private static func loadRecords(
        from userDefaults: UserDefaults,
        storageKey: String,
        maximumRecordCount: Int
    ) -> [SearchEntityID: WalletCoreSearchInteractionRecord] {
        guard let data = userDefaults.data(forKey: storageKey),
              let persistedRecords = try? JSONDecoder().decode([PersistedRecord].self, from: data) else {
            return [:]
        }

        var recordsByEntityID: [SearchEntityID: WalletCoreSearchInteractionRecord] = [:]
        for persistedRecord in persistedRecords where
            !persistedRecord.entityID.isEmpty && persistedRecord.selectionCount > 0
        {
            let entityID = SearchEntityID(persistedRecord.entityID)
            let record = WalletCoreSearchInteractionRecord(
                entityID: entityID,
                lastSelectedAt: persistedRecord.lastSelectedAt,
                selectionCount: persistedRecord.selectionCount
            )
            if let existing = recordsByEntityID[entityID],
               existing.lastSelectedAt >= record.lastSelectedAt {
                continue
            }
            recordsByEntityID[entityID] = record
        }

        let records = sorted(Array(recordsByEntityID.values))
            .prefix(max(0, maximumRecordCount))
        return Dictionary(uniqueKeysWithValues: records.map { ($0.entityID, $0) })
    }

    private static func sorted(
        _ records: [WalletCoreSearchInteractionRecord]
    ) -> [WalletCoreSearchInteractionRecord] {
        records.sorted {
            if $0.lastSelectedAt != $1.lastSelectedAt {
                return $0.lastSelectedAt > $1.lastSelectedAt
            }
            if $0.selectionCount != $1.selectionCount {
                return $0.selectionCount > $1.selectionCount
            }
            return $0.entityID < $1.entityID
        }
    }
}

public struct WalletCoreSearchInteractionSource: UniversalSearchSource {
    public static let id = SearchSourceID("wallet-core:interactions")

    public let sourceID = Self.id
    private let store: WalletCoreSearchInteractionStore
    private let clock: @Sendable () -> Date

    public init(
        store: WalletCoreSearchInteractionStore = .shared,
        clock: @escaping @Sendable () -> Date = Date.init
    ) {
        self.store = store
        self.clock = clock
    }

    public func snapshot(
        for context: UniversalSearchContext
    ) async throws -> UniversalSearchSourceSnapshot {
        let records = context.scopeID.map(store.records(scopeID:)) ?? []
        return UniversalSearchSourceSnapshot(
            sourceID: sourceID,
            authority: 100,
            revision: records.map {
                "\($0.entityID.rawValue):\($0.lastSelectedAt.timeIntervalSince1970):\($0.selectionCount)"
            }.joined(separator: "|"),
            generatedAt: clock(),
            signalContributions: records.map {
                SearchSignalContribution(
                    entityID: $0.entityID,
                    signals: SearchSignals(interaction: SearchInteractionSignal(
                        lastSelectedAt: $0.lastSelectedAt,
                        selectionCount: $0.selectionCount
                    ))
                )
            }
        )
    }
}
