import Foundation
import Perception

/// A draft paired with the exact request that produced it.
public struct OperationDraftSnapshot<Request: Sendable, Draft: Sendable>: Sendable {
    public let request: Request
    public let draft: Draft

    public init(request: Request, draft: Draft) {
        self.request = request
        self.draft = draft
    }
}

extension OperationDraftSnapshot: Equatable
where Request: Equatable, Draft: Equatable {}

public enum OperationDraftPhase: Equatable, Sendable {
    case idle
    case loading
    case ready
    case failed
}

/// Coordinates the asynchronous lifecycle of a blockchain operation draft.
///
/// The owner must treat `Request` as the complete draft identity: include every
/// user-input or wallet-state value that can invalidate a result, even when the
/// loader reads that value indirectly. Call `setRequest` synchronously whenever
/// that identity changes.
///
/// `currentSnapshot` is cleared while loading or after failure. `lastSnapshot`
/// retains the latest successful value for display continuity until `reset`.
@Perceptible
@MainActor
public final class OperationDraftCoordinator<
    Request: Equatable & Sendable,
    Draft: Sendable
>: Sendable {
    public typealias Loader = @Sendable (Request) async throws -> Draft
    public typealias SnapshotHandler = @MainActor (
        OperationDraftSnapshot<Request, Draft>
    ) -> Void
    public typealias FailureHandler = @MainActor (Request, any Error) -> Void

    public private(set) var request: Request?
    public private(set) var phase: OperationDraftPhase = .idle
    public private(set) var currentSnapshot: OperationDraftSnapshot<Request, Draft>?
    public private(set) var lastSnapshot: OperationDraftSnapshot<Request, Draft>?
    public private(set) var failure: (any Error)?

    /// Runs after publishing a successful snapshot. The handler may
    /// synchronously replace the request, which starts a new lifecycle.
    @PerceptionIgnored
    public var didPublishSnapshot: SnapshotHandler?
    /// Runs after publishing a failure for the current request.
    @PerceptionIgnored
    public var didFailRequest: FailureHandler?
    @PerceptionIgnored
    private let defaultDebounce: Duration
    @PerceptionIgnored
    private let load: Loader
    @PerceptionIgnored
    private(set) var task: Task<Void, Never>?
    @PerceptionIgnored
    private var revision: UInt64 = 0

    public init(
        debounce: Duration = .zero,
        load: @escaping Loader
    ) {
        self.defaultDebounce = debounce
        self.load = load
    }

    deinit {
        task?.cancel()
    }

    public var isLoading: Bool {
        phase == .loading
    }

    public var canRetry: Bool {
        phase == .failed
    }

    /// Returns a snapshot only when it belongs to the supplied request.
    public func snapshot(
        for request: Request?
    ) -> OperationDraftSnapshot<Request, Draft>? {
        guard let request,
              currentSnapshot?.request == request else {
            return nil
        }
        return currentSnapshot
    }

    public func isLoading(_ request: Request?) -> Bool {
        request != nil && phase == .loading && self.request == request
    }

    public func hasFailed(_ request: Request?) -> Bool {
        request != nil && phase == .failed && self.request == request
    }

    /// Synchronizes the coordinator with the owner's current request identity.
    /// Passing `nil` invalidates current state while retaining `lastSnapshot`.
    /// Set `refreshIfUnchanged` for wallet-state refreshes that do not alter the
    /// request value but still require a fresh backend draft.
    public func setRequest(
        _ request: Request?,
        debounce: Duration? = nil,
        refreshIfUnchanged: Bool = false
    ) {
        if request == self.request {
            guard refreshIfUnchanged, request != nil else { return }
            refresh(debounce: debounce ?? defaultDebounce)
            return
        }
        guard let request else {
            invalidate()
            return
        }
        start(request: request, debounce: debounce ?? defaultDebounce)
    }

    /// Reloads the current request. Explicit refreshes and retries bypass the
    /// configured debounce by default.
    public func refresh(debounce: Duration = .zero) {
        guard let request else { return }
        start(request: request, debounce: debounce)
    }

    public func retry() {
        guard canRetry else { return }
        refresh()
    }

    public func invalidate() {
        revision &+= 1
        task?.cancel()
        task = nil
        request = nil
        currentSnapshot = nil
        failure = nil
        phase = .idle
    }

    public func reset() {
        invalidate()
        lastSnapshot = nil
    }

    private func start(request: Request, debounce: Duration) {
        revision &+= 1
        let revision = revision
        task?.cancel()
        self.request = request
        currentSnapshot = nil
        failure = nil
        phase = .loading

        task = Task { [weak self, load] in
            do {
                if debounce > .zero {
                    try await Task.sleep(for: debounce)
                }
                let draft = try await load(request)
                try Task.checkCancellation()
                guard let self,
                      self.revision == revision,
                      self.request == request else {
                    return
                }
                let snapshot = OperationDraftSnapshot(
                    request: request,
                    draft: draft
                )
                self.task = nil
                self.currentSnapshot = snapshot
                self.lastSnapshot = snapshot
                self.phase = .ready
                self.didPublishSnapshot?(snapshot)
            } catch {
                guard !Task.isCancelled,
                      let self,
                      self.revision == revision,
                      self.request == request else {
                    return
                }
                self.task = nil
                self.currentSnapshot = nil
                self.failure = error
                self.phase = .failed
                self.didFailRequest?(request, error)
            }
        }
    }
}
