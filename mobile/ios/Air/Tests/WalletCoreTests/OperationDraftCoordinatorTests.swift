import Testing
@testable import WalletCore

@Suite("Operation Draft Coordinator")
@MainActor
struct OperationDraftCoordinatorTests {
    @Test
    func `successful load produces an exact current snapshot`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)

        #expect(coordinator.phase == .idle)
        #expect(coordinator.request == nil)
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.lastSnapshot == nil)

        coordinator.setRequest(1)

        #expect(coordinator.phase == .loading)
        #expect(coordinator.isLoading(1))
        #expect(!coordinator.isLoading(2))
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.snapshot(for: 1) == nil)
        await probe.waitUntilRequested(1)

        try await probe.succeed(request: 1, draft: "one")
        await waitUntil { coordinator.phase == .ready }

        let current = try #require(coordinator.currentSnapshot)
        #expect(current.request == 1)
        #expect(current.draft == "one")
        #expect(coordinator.snapshot(for: 1) == current)
        #expect(coordinator.snapshot(for: 2) == nil)
        #expect(coordinator.lastSnapshot == current)
        #expect(coordinator.failure == nil)
    }

    @Test
    func `same request is deduplicated and refresh replaces current`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)

        coordinator.setRequest(1)
        await probe.waitUntilRequested(1)
        try await probe.succeed(request: 1, draft: "first")
        await waitUntil { coordinator.phase == .ready }

        coordinator.setRequest(1)
        #expect(await probe.requestCount(for: 1) == 1)

        coordinator.setRequest(1, refreshIfUnchanged: true)

        #expect(coordinator.phase == .loading)
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.lastSnapshot?.draft == "first")
        await probe.waitUntilRequested(1, count: 2)

        try await probe.succeed(request: 1, draft: "refreshed")
        await waitUntil { coordinator.phase == .ready }

        #expect(coordinator.currentSnapshot?.draft == "refreshed")
        #expect(coordinator.lastSnapshot?.draft == "refreshed")
    }

    @Test
    func `success callback can synchronously replace the request`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)
        var completedRequests: [Int] = []
        coordinator.didPublishSnapshot = { snapshot in
            completedRequests.append(snapshot.request)
            if snapshot.request == 1 {
                coordinator.setRequest(2)
            }
        }

        coordinator.setRequest(1)
        await probe.waitUntilRequested(1)
        try await probe.succeed(request: 1, draft: "one")
        await probe.waitUntilRequested(2)

        #expect(coordinator.phase == .loading)
        #expect(coordinator.request == 2)
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.lastSnapshot?.draft == "one")

        try await probe.succeed(request: 2, draft: "two")
        await waitUntil { coordinator.phase == .ready }

        #expect(coordinator.currentSnapshot?.draft == "two")
        #expect(completedRequests == [1, 2])
    }

    @Test
    func `superseded load cannot publish a stale draft`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)

        coordinator.setRequest(1)
        await probe.waitUntilRequested(1)
        let supersededTask = try #require(coordinator.task)

        coordinator.setRequest(2)
        await probe.waitUntilRequested(2)

        try await probe.succeed(request: 1, draft: "stale")
        await supersededTask.value

        #expect(coordinator.phase == .loading)
        #expect(coordinator.request == 2)
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.lastSnapshot == nil)

        try await probe.succeed(request: 2, draft: "current")
        await waitUntil { coordinator.phase == .ready }

        #expect(coordinator.currentSnapshot?.request == 2)
        #expect(coordinator.currentSnapshot?.draft == "current")
    }

    @Test
    func `failed request remains failed until explicit retry`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)
        var failedRequests: [Int] = []
        coordinator.didFailRequest = { request, _ in
            failedRequests.append(request)
        }

        coordinator.setRequest(4)
        await probe.waitUntilRequested(4)
        try await probe.fail(request: 4, error: TestError.expected)
        await waitUntil { coordinator.phase == .failed }

        #expect(coordinator.canRetry)
        #expect(coordinator.hasFailed(4))
        #expect(coordinator.failure is TestError)
        #expect(coordinator.currentSnapshot == nil)
        #expect(failedRequests == [4])

        coordinator.setRequest(4)
        #expect(await probe.requestCount(for: 4) == 1)

        coordinator.retry()
        #expect(coordinator.phase == .loading)
        #expect(coordinator.failure == nil)
        await probe.waitUntilRequested(4, count: 2)

        try await probe.succeed(request: 4, draft: "recovered")
        await waitUntil { coordinator.phase == .ready }

        #expect(coordinator.currentSnapshot?.draft == "recovered")
        #expect(failedRequests == [4])
    }

    @Test
    func `uncancelled cancellation error is exposed as a failure`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)

        coordinator.setRequest(5)
        await probe.waitUntilRequested(5)
        try await probe.fail(request: 5, error: CancellationError())
        await waitUntil { coordinator.phase == .failed }

        #expect(coordinator.hasFailed(5))
        #expect(coordinator.failure is CancellationError)
    }

    @Test
    func `invalidation cancels current state while reset also clears history`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(probe: probe)

        coordinator.setRequest(1)
        await probe.waitUntilRequested(1)
        try await probe.succeed(request: 1, draft: "one")
        await waitUntil { coordinator.phase == .ready }

        coordinator.setRequest(2)
        await probe.waitUntilRequested(2)
        let invalidatedTask = try #require(coordinator.task)
        coordinator.invalidate()

        #expect(coordinator.phase == .idle)
        #expect(coordinator.request == nil)
        #expect(coordinator.currentSnapshot == nil)
        #expect(coordinator.lastSnapshot?.draft == "one")
        #expect(coordinator.failure == nil)

        try await probe.succeed(request: 2, draft: "stale")
        await invalidatedTask.value

        #expect(coordinator.phase == .idle)
        #expect(coordinator.lastSnapshot?.draft == "one")

        coordinator.reset()
        #expect(coordinator.lastSnapshot == nil)
    }

    @Test
    func `debounce prevents a superseded request from loading`() async throws {
        let probe = DraftLoaderProbe()
        let coordinator = makeCoordinator(
            probe: probe,
            debounce: .milliseconds(20)
        )

        coordinator.setRequest(1)
        coordinator.setRequest(2)

        await probe.waitUntilRequested(2)
        #expect(await probe.requestCount(for: 1) == 0)
        #expect(await probe.requestCount(for: 2) == 1)

        try await probe.succeed(request: 2, draft: "two")
        await waitUntil { coordinator.phase == .ready }
        #expect(coordinator.currentSnapshot?.request == 2)
    }

    private func makeCoordinator(
        probe: DraftLoaderProbe,
        debounce: Duration = .zero
    ) -> OperationDraftCoordinator<Int, String> {
        OperationDraftCoordinator(debounce: debounce) { request in
            try await probe.load(request)
        }
    }
}

private enum TestError: Error {
    case expected
    case missingPendingRequest(Int)
}

private actor DraftLoaderProbe {
    private struct RequestWaiter {
        let request: Int
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private var requests: [Int] = []
    private var pending: [Int: [CheckedContinuation<String, any Error>]] = [:]
    private var requestWaiters: [RequestWaiter] = []

    func load(_ request: Int) async throws -> String {
        requests.append(request)
        resumeSatisfiedRequestWaiters()
        return try await withCheckedThrowingContinuation { continuation in
            pending[request, default: []].append(continuation)
        }
    }

    func requestCount(for request: Int) -> Int {
        requests.count(where: { $0 == request })
    }

    func waitUntilRequested(_ request: Int, count: Int = 1) async {
        guard requestCount(for: request) < count else { return }
        await withCheckedContinuation { continuation in
            requestWaiters.append(RequestWaiter(
                request: request,
                count: count,
                continuation: continuation
            ))
        }
    }

    func succeed(request: Int, draft: String) throws {
        try takePendingRequest(request).resume(returning: draft)
    }

    func fail(request: Int, error: any Error) throws {
        try takePendingRequest(request).resume(throwing: error)
    }

    private func takePendingRequest(
        _ request: Int
    ) throws -> CheckedContinuation<String, any Error> {
        guard var continuations = pending[request],
              !continuations.isEmpty else {
            throw TestError.missingPendingRequest(request)
        }
        let continuation = continuations.removeFirst()
        pending[request] = continuations
        return continuation
    }

    private func resumeSatisfiedRequestWaiters() {
        var remaining: [RequestWaiter] = []
        for waiter in requestWaiters {
            if requestCount(for: waiter.request) >= waiter.count {
                waiter.continuation.resume()
            } else {
                remaining.append(waiter)
            }
        }
        requestWaiters = remaining
    }
}

@MainActor
private func waitUntil(
    _ condition: @escaping @MainActor () -> Bool
) async {
    for _ in 0..<1_000 {
        if condition() {
            return
        }
        await Task.yield()
    }
    Issue.record("Timed out waiting for coordinator state")
}
