import Foundation

/// Durable, rebuildable storage for source snapshots and their searchable projection.
///
/// Providers remain the source of truth. The store may be deleted at any time and
/// reconstructed from fresh provider snapshots.
///
/// Rows are keyed by the scope key a snapshot was built for (see
/// `UniversalSearchSourceScoping.scopeKey(for:)`), so data shared between accounts is stored
/// once and hydrating a context loads the scope keys it can see.
public protocol UniversalSearchIndexStore: Sendable {
    func snapshots(
        forScopeKeys scopeKeys: Set<String>
    ) async throws -> [UniversalSearchSourceSnapshot]

    func replace(
        _ snapshot: UniversalSearchSourceSnapshot,
        scopeKey: String
    ) async throws

    func removeSnapshot(
        sourceID: SearchSourceID,
        scopeKey: String
    ) async throws

    func candidateEntityIDs(
        for query: UniversalSearchQuery,
        scopeKeys: Set<String>,
        limit: Int
    ) async throws -> [SearchEntityID]
}
