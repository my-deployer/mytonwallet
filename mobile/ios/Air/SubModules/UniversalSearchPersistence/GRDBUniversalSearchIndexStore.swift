import Foundation
import GRDB
import OSLog
import UniversalSearchCore

private let persistenceLog = Logger(
    subsystem: "org.mytonwallet.air",
    category: "UniversalSearchPersistence"
)

public final class GRDBUniversalSearchIndexStore: UniversalSearchIndexStore, @unchecked Sendable {
    private struct LoadedSnapshots {
        let snapshots: [UniversalSearchSourceSnapshot]
        let removedCorruptRows: Bool
    }

    public static let defaultDatabaseURL = URL.applicationSupportDirectory
        .appendingPathComponent("air", isDirectory: true)
        .appendingPathComponent("search", isDirectory: true)
        .appendingPathComponent("UniversalSearch.sqlite", isDirectory: false)

    private static let storageFormatVersion = "2"
    private static let analyzerVersion = "1"

    private let database: DatabasePool

    public convenience init() throws {
        try self.init(
            databaseURL: Self.defaultDatabaseURL,
            resetsIncompatibleDatabase: true
        )
    }

    public convenience init(databaseURL: URL) throws {
        try self.init(databaseURL: databaseURL, resetsIncompatibleDatabase: false)
    }

    private init(
        databaseURL: URL,
        resetsIncompatibleDatabase: Bool
    ) throws {
        let directoryURL = databaseURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true
        )
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var mutableDirectoryURL = directoryURL
        try? mutableDirectoryURL.setResourceValues(resourceValues)

        do {
            database = try Self.openDatabase(at: databaseURL)
        } catch {
            guard resetsIncompatibleDatabase else { throw error }
            try Self.removeDatabaseFiles(at: databaseURL)
            database = try Self.openDatabase(at: databaseURL)
        }
    }

    private static func openDatabase(at databaseURL: URL) throws -> DatabasePool {
        var configuration = Configuration()
        configuration.foreignKeysEnabled = true
        configuration.label = "UniversalSearch"
        let database = try DatabasePool(
            path: databaseURL.path(percentEncoded: false),
            configuration: configuration
        )
        try Self.makeMigrator().migrate(database)
        try Self.resetForIncompatibleFormatIfNeeded(database)
        return database
    }

    private static func removeDatabaseFiles(at databaseURL: URL) throws {
        let fileManager = FileManager.default
        for url in [
            databaseURL,
            URL(filePath: databaseURL.path(percentEncoded: false) + "-wal"),
            URL(filePath: databaseURL.path(percentEncoded: false) + "-shm"),
        ] where fileManager.fileExists(atPath: url.path(percentEncoded: false)) {
            try fileManager.removeItem(at: url)
        }
    }

    public func snapshots(
        forScopeKeys scopeKeys: Set<String>
    ) async throws -> [UniversalSearchSourceSnapshot] {
        guard !scopeKeys.isEmpty else { return [] }
        return try await database.write { db in
            var snapshots: [UniversalSearchSourceSnapshot] = []
            for scopeKey in scopeKeys.sorted() {
                let loaded = try Self.loadSnapshots(db, scopeKey: scopeKey)
                if loaded.removedCorruptRows {
                    try Self.synchronizeMaterializedDocuments(
                        UniversalSearchCorpus(snapshots: loaded.snapshots).documents(),
                        scopeKey: scopeKey,
                        db: db
                    )
                }
                snapshots.append(contentsOf: loaded.snapshots)
            }
            return snapshots
        }
    }

    public func replace(
        _ snapshot: UniversalSearchSourceSnapshot,
        scopeKey: String
    ) async throws {
        let payload = try Self.encode(snapshot)
        try await database.write { db in
            let existing: Data? = try Data.fetchOne(
                db,
                sql: """
                    SELECT payload FROM search_source_snapshots
                    WHERE scope_key = ? AND source_id = ?
                    """,
                arguments: [scopeKey, snapshot.sourceID.rawValue]
            )
            guard existing != payload else { return }

            try db.execute(
                sql: """
                    INSERT INTO search_source_snapshots (scope_key, source_id, payload)
                    VALUES (?, ?, ?)
                    ON CONFLICT (scope_key, source_id)
                    DO UPDATE SET payload = excluded.payload
                    """,
                arguments: [scopeKey, snapshot.sourceID.rawValue, payload]
            )
            let loaded = try Self.loadSnapshots(db, scopeKey: scopeKey)
            let documents = UniversalSearchCorpus(snapshots: loaded.snapshots).documents()
            try Self.synchronizeMaterializedDocuments(
                documents,
                scopeKey: scopeKey,
                db: db
            )
        }
    }

    public func removeSnapshot(
        sourceID: SearchSourceID,
        scopeKey: String
    ) async throws {
        try await database.write { db in
            try db.execute(
                sql: """
                    DELETE FROM search_source_snapshots
                    WHERE scope_key = ? AND source_id = ?
                    """,
                arguments: [scopeKey, sourceID.rawValue]
            )
            guard db.changesCount > 0 else { return }

            let loaded = try Self.loadSnapshots(db, scopeKey: scopeKey)
            try Self.synchronizeMaterializedDocuments(
                UniversalSearchCorpus(snapshots: loaded.snapshots).documents(),
                scopeKey: scopeKey,
                db: db
            )
        }
    }

    public func candidateEntityIDs(
        for query: UniversalSearchQuery,
        scopeKeys: Set<String>,
        limit: Int
    ) async throws -> [SearchEntityID] {
        guard !query.isEmpty, limit > 0, !scopeKeys.isEmpty else { return [] }
        let orderedScopeKeys = scopeKeys.sorted()
        let scopeKeyPlaceholders = orderedScopeKeys.map { _ in "?" }.joined(separator: ", ")
        return try await database.read { db in
            var result: [SearchEntityID] = []
            var seen = Set<SearchEntityID>()

            let exactIDs = try String.fetchAll(
                db,
                sql: """
                    SELECT document.entity_id
                    FROM search_exact_identifiers identifier
                    JOIN search_documents document ON document.id = identifier.document_id
                    WHERE document.scope_key IN (\(scopeKeyPlaceholders))
                        AND identifier.normalized_value = ?
                    ORDER BY document.retrieval_priority DESC, document.entity_id
                    LIMIT ?
                    """,
                arguments: StatementArguments(
                    orderedScopeKeys + [query.normalizedIdentifier, String(limit)]
                )
            )
            for rawID in exactIDs {
                let id = SearchEntityID(rawID)
                if seen.insert(id).inserted {
                    result.append(id)
                }
            }

            guard !query.requiresExactIdentifierMatch,
                  result.count < limit,
                  let ftsQuery = Self.ftsQuery(for: query) else {
                return result
            }

            let textIDs = try String.fetchAll(
                db,
                sql: """
                    SELECT document.entity_id
                    FROM search_documents_fts
                    JOIN search_documents document ON document.id = search_documents_fts.rowid
                    WHERE search_documents_fts MATCH ?
                        AND document.scope_key IN (\(scopeKeyPlaceholders))
                    ORDER BY bm25(search_documents_fts, 10.0, 10.0, 6.0, 4.0, 3.0, 1.0),
                             document.retrieval_priority DESC,
                             document.entity_id
                    LIMIT ?
                    """,
                arguments: StatementArguments([ftsQuery] + orderedScopeKeys + [String(limit)])
            )
            for rawID in textIDs where result.count < limit {
                let id = SearchEntityID(rawID)
                if seen.insert(id).inserted {
                    result.append(id)
                }
            }
            return result
        }
    }

    private static func makeMigrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table: "search_metadata") { table in
                table.primaryKey("key", .text)
                table.column("value", .text).notNull()
            }
            try db.create(table: "search_source_snapshots") { table in
                table.column("context_key", .text).notNull()
                table.column("source_id", .text).notNull()
                table.column("payload", .blob).notNull()
                table.primaryKey(["context_key", "source_id"])
            }
            try db.create(table: "search_documents") { table in
                table.autoIncrementedPrimaryKey("id")
                table.column("context_key", .text).notNull().indexed()
                table.column("entity_id", .text).notNull()
                table.column("kind", .text).notNull()
                table.column("retrieval_priority", .integer).notNull()
                table.column("payload", .blob).notNull()
                table.uniqueKey(["context_key", "entity_id"])
            }
            try db.create(table: "search_exact_identifiers") { table in
                table.column("document_id", .integer)
                    .notNull()
                    .references("search_documents", onDelete: .cascade)
                table.column("kind", .text).notNull()
                table.column("normalized_value", .text).notNull().indexed()
                table.primaryKey(["document_id", "kind", "normalized_value"])
            }
            try db.execute(sql: """
                CREATE VIRTUAL TABLE search_documents_fts USING fts5(
                    title,
                    symbol,
                    aliases,
                    url,
                    keywords,
                    description,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix = '2 3'
                )
                """)
        }
        migrator.registerMigration("v2") { db in
            // Rows are keyed by scope key instead of full context; the store is a rebuildable
            // cache, so the old rows are dropped rather than migrated
            try db.drop(table: "search_exact_identifiers")
            try db.execute(sql: "DROP TABLE search_documents_fts")
            try db.drop(table: "search_documents")
            try db.drop(table: "search_source_snapshots")

            try db.create(table: "search_source_snapshots") { table in
                table.column("scope_key", .text).notNull()
                table.column("source_id", .text).notNull()
                table.column("payload", .blob).notNull()
                table.primaryKey(["scope_key", "source_id"])
            }
            try db.create(table: "search_documents") { table in
                table.autoIncrementedPrimaryKey("id")
                table.column("scope_key", .text).notNull().indexed()
                table.column("entity_id", .text).notNull()
                table.column("kind", .text).notNull()
                table.column("retrieval_priority", .integer).notNull()
                table.column("payload", .blob).notNull()
                table.uniqueKey(["scope_key", "entity_id"])
            }
            try db.create(table: "search_exact_identifiers") { table in
                table.column("document_id", .integer)
                    .notNull()
                    .references("search_documents", onDelete: .cascade)
                table.column("kind", .text).notNull()
                table.column("normalized_value", .text).notNull().indexed()
                table.primaryKey(["document_id", "kind", "normalized_value"])
            }
            try db.execute(sql: """
                CREATE VIRTUAL TABLE search_documents_fts USING fts5(
                    title,
                    symbol,
                    aliases,
                    url,
                    keywords,
                    description,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix = '2 3'
                )
                """)
        }
        return migrator
    }

    private static func resetForIncompatibleFormatIfNeeded(
        _ database: DatabasePool
    ) throws {
        try database.write { db in
            let expectedVersion = "\(storageFormatVersion):\(analyzerVersion)"
            let storedVersion: String? = try String.fetchOne(
                db,
                sql: "SELECT value FROM search_metadata WHERE key = 'format_version'"
            )
            guard storedVersion != expectedVersion else { return }

            try db.execute(sql: "DELETE FROM search_documents_fts")
            try db.execute(sql: "DELETE FROM search_documents")
            try db.execute(sql: "DELETE FROM search_source_snapshots")
            try db.execute(
                sql: """
                    INSERT INTO search_metadata (key, value) VALUES ('format_version', ?)
                    ON CONFLICT (key) DO UPDATE SET value = excluded.value
                    """,
                arguments: [expectedVersion]
            )
        }
    }

    private static func loadSnapshots(
        _ db: Database,
        scopeKey: String
    ) throws -> LoadedSnapshots {
        let rows = try Row.fetchAll(
            db,
            sql: """
                SELECT source_id, payload FROM search_source_snapshots
                WHERE scope_key = ? ORDER BY source_id
                """,
            arguments: [scopeKey]
        )
        var snapshots: [UniversalSearchSourceSnapshot] = []
        var corruptSourceIDs: [String] = []
        for row in rows {
            let sourceID: String = row["source_id"]
            let payload: Data = row["payload"]
            do {
                snapshots.append(try decode(UniversalSearchSourceSnapshot.self, from: payload))
            } catch {
                persistenceLog.error(
                    "Discarding corrupt search snapshot source=\(sourceID, privacy: .public) error=\(String(describing: error), privacy: .public)"
                )
                corruptSourceIDs.append(sourceID)
            }
        }
        for sourceID in corruptSourceIDs {
            try db.execute(
                sql: "DELETE FROM search_source_snapshots WHERE scope_key = ? AND source_id = ?",
                arguments: [scopeKey, sourceID]
            )
        }
        return LoadedSnapshots(
            snapshots: snapshots,
            removedCorruptRows: !corruptSourceIDs.isEmpty
        )
    }

    private static func synchronizeMaterializedDocuments(
        _ documents: [SearchDocument],
        scopeKey: String,
        db: Database
    ) throws {
        let existingRows = try Row.fetchAll(
            db,
            sql: """
                SELECT id, entity_id, payload FROM search_documents
                WHERE scope_key = ?
                """,
            arguments: [scopeKey]
        )
        let existingByEntityID = Dictionary(
            uniqueKeysWithValues: existingRows.map { row in
                let entityID: String = row["entity_id"]
                return (entityID, ExistingDocument(
                    rowID: row["id"],
                    payload: row["payload"]
                ))
            }
        )
        let incomingEntityIDs = Set(documents.map { $0.id.rawValue })

        for (entityID, existing) in existingByEntityID
            where !incomingEntityIDs.contains(entityID) {
            try deleteMaterializedDocument(rowID: existing.rowID, db: db)
        }

        for document in documents {
            let payload = try encode(document)
            if let existing = existingByEntityID[document.id.rawValue] {
                guard existing.payload != payload else { continue }
                try updateMaterializedDocument(
                    document,
                    payload: payload,
                    rowID: existing.rowID,
                    db: db
                )
            } else {
                try insertMaterializedDocument(
                    document,
                    payload: payload,
                    scopeKey: scopeKey,
                    db: db
                )
            }
        }
    }

    private static func insertMaterializedDocument(
        _ document: SearchDocument,
        payload: Data,
        scopeKey: String,
        db: Database
    ) throws {
        let prepared = PreparedDocument(document)
        try db.execute(
            sql: """
                INSERT INTO search_documents (
                    scope_key, entity_id, kind, retrieval_priority, payload
                ) VALUES (?, ?, ?, ?, ?)
                """,
            arguments: [
                scopeKey,
                document.id.rawValue,
                document.kind.rawValue,
                prepared.retrievalPriority,
                payload,
            ]
        )
        try writeAuxiliaryIndex(
            prepared,
            documentID: db.lastInsertedRowID,
            db: db
        )
    }

    private static func updateMaterializedDocument(
        _ document: SearchDocument,
        payload: Data,
        rowID: Int64,
        db: Database
    ) throws {
        let prepared = PreparedDocument(document)
        try db.execute(
            sql: """
                UPDATE search_documents
                SET kind = ?, retrieval_priority = ?, payload = ?
                WHERE id = ?
                """,
            arguments: [
                document.kind.rawValue,
                prepared.retrievalPriority,
                payload,
                rowID,
            ]
        )
        try db.execute(
            sql: "DELETE FROM search_exact_identifiers WHERE document_id = ?",
            arguments: [rowID]
        )
        try db.execute(
            sql: "DELETE FROM search_documents_fts WHERE rowid = ?",
            arguments: [rowID]
        )
        try writeAuxiliaryIndex(prepared, documentID: rowID, db: db)
    }

    private static func deleteMaterializedDocument(
        rowID: Int64,
        db: Database
    ) throws {
        try db.execute(
            sql: "DELETE FROM search_documents_fts WHERE rowid = ?",
            arguments: [rowID]
        )
        try db.execute(
            sql: "DELETE FROM search_documents WHERE id = ?",
            arguments: [rowID]
        )
    }

    private static func writeAuxiliaryIndex(
        _ prepared: PreparedDocument,
        documentID: Int64,
        db: Database
    ) throws {
        for identifier in prepared.exactIdentifiers {
            try db.execute(
                sql: """
                    INSERT OR IGNORE INTO search_exact_identifiers (
                        document_id, kind, normalized_value
                    ) VALUES (?, ?, ?)
                    """,
                arguments: [documentID, identifier.kind.rawValue, identifier.value]
            )
        }
        try db.execute(
            sql: """
                INSERT INTO search_documents_fts (
                    rowid, title, symbol, aliases, url, keywords, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                documentID,
                prepared.title,
                prepared.symbol,
                prepared.aliases,
                prepared.url,
                prepared.keywords,
                prepared.description,
            ]
        )
    }

    private static func ftsQuery(for query: UniversalSearchQuery) -> String? {
        let alternatives = Set(query.normalizedText.terms.flatMap(\.alternatives))
            .filter { !$0.isEmpty }
            .sorted()
        guard !alternatives.isEmpty else { return nil }
        return alternatives
            .map { "\"\($0.replacingOccurrences(of: "\"", with: "\"\""))\"*" }
            .joined(separator: " OR ")
    }

    private static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(value)
    }

    private static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return try decoder.decode(type, from: data)
    }
}

private struct ExistingDocument {
    let rowID: Int64
    let payload: Data
}

private struct PreparedDocument {
    struct ExactIdentifier: Hashable {
        let kind: SearchFieldKind
        let value: String
    }

    let title: String
    let symbol: String
    let aliases: String
    let url: String
    let keywords: String
    let description: String
    let exactIdentifiers: Set<ExactIdentifier>
    let retrievalPriority: Int

    init(_ document: SearchDocument) {
        var values: [SearchFieldKind: [String]] = [:]
        var exactIdentifiers = Set<ExactIdentifier>()

        for field in document.fields where !field.value.isEmpty {
            if field.matchPolicy == .exact
                || [.identifier, .address, .domain].contains(field.kind) {
                let normalized = SearchTextNormalizer.normalizeIdentifier(field.value)
                if !normalized.isEmpty {
                    exactIdentifiers.insert(.init(kind: field.kind, value: normalized))
                }
            }
            guard field.matchPolicy == .text else { continue }
            let alternatives = SearchTextNormalizer.normalize(field.value).phraseAlternatives
            values[field.kind, default: []].append(contentsOf: alternatives)
        }

        self.title = Self.joined(values[.title])
        self.symbol = Self.joined(values[.symbol])
        self.aliases = Self.joined(values[.alias])
        self.url = Self.joined(values[.url])
        self.keywords = Self.joined(
            (values[.keyword] ?? []) + (values[.identifier] ?? [])
        )
        self.description = Self.joined(values[.description])
        self.exactIdentifiers = exactIdentifiers
        self.retrievalPriority = Self.retrievalPriority(for: document.signals.traits)
    }

    private static func joined(_ values: [String]?) -> String {
        Array(Set(values ?? [])).sorted().joined(separator: " ")
    }

    private static func retrievalPriority(for traits: SearchTraits) -> Int {
        var result = 0
        if traits.contains(.verified) { result += 1_000 }
        if traits.contains(.curated) { result += 800 }
        if traits.contains(.connected) { result += 700 }
        if traits.contains(.held) { result += 600 }
        if traits.contains(.owned) { result += 500 }
        if traits.contains(.popular) { result += 400 }
        if traits.contains(.fromHistory) { result += 300 }
        if traits.contains(.hasMarketData) { result += 200 }
        return result
    }
}
