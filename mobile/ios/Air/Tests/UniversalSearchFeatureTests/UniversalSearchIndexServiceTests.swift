import Foundation
import Testing
import UniversalSearchCore
import UniversalSearchWalletCore
@testable import UniversalSearchFeature

@MainActor
@Suite("Universal Search index lifecycle", .serialized)
struct UniversalSearchIndexServiceTests {
    private let context = UniversalSearchContext(
        scopeID: "account-a",
        network: "mainnet",
        localeIdentifier: "en"
    )

    @Test
    func `indexes after wallet readiness without a search session`() async throws {
        let context = context
        let source = LifecycleSource(id: WalletCoreTokenSearchSource.id) { _ in
            UniversalSearchSourceSnapshot(
                sourceID: WalletCoreTokenSearchSource.id,
                generatedAt: Date(timeIntervalSince1970: 1),
                documents: [SearchDocument(
                    id: SearchEntityID("token:gram"),
                    kind: .token,
                    fields: [SearchField("Gram", kind: .title)]
                )]
            )
        }
        let coordinator = UniversalSearchCoordinator(sources: [source])
        let service = UniversalSearchIndexService(
            coordinator: coordinator,
            contextProvider: { context }
        )
        service.start()
        defer { service.stop() }

        service.setWalletReady(true)

        try await expectEventually {
            let result = await coordinator.search("gram")
            return result.hits.map(\.id) == [SearchEntityID("token:gram")]
        }
    }

    @Test
    func `wallet events refresh only affected sources`() async throws {
        let context = context
        let calls = LifecycleSourceCallRecorder()
        let tokens = LifecycleSource(id: WalletCoreTokenSearchSource.id) { context in
            await calls.record(WalletCoreTokenSearchSource.id)
            return emptySnapshot(sourceID: WalletCoreTokenSearchSource.id, context: context)
        }
        let apps = LifecycleSource(id: WalletCoreExploreAppSearchSource.id) { context in
            await calls.record(WalletCoreExploreAppSearchSource.id)
            return emptySnapshot(sourceID: WalletCoreExploreAppSearchSource.id, context: context)
        }
        let coordinator = UniversalSearchCoordinator(sources: [tokens, apps])
        let service = UniversalSearchIndexService(
            coordinator: coordinator,
            contextProvider: { context }
        )
        service.start()
        defer { service.stop() }
        service.setWalletReady(true)
        try await expectEventually {
            let tokenCount = await calls.count(for: WalletCoreTokenSearchSource.id)
            let appCount = await calls.count(for: WalletCoreExploreAppSearchSource.id)
            return tokenCount == 1 && appCount == 1
        }

        service.walletCore(event: .tokensChanged)

        try await expectEventually {
            await calls.count(for: WalletCoreTokenSearchSource.id) == 2
        }
        #expect(await calls.count(for: WalletCoreExploreAppSearchSource.id) == 1)
    }

    @Test
    func `observers remain attached when indexing restarts`() async throws {
        let context = context
        let source = LifecycleSource(id: WalletCoreTokenSearchSource.id) { context in
            emptySnapshot(sourceID: WalletCoreTokenSearchSource.id, context: context)
        }
        let coordinator = UniversalSearchCoordinator(sources: [source])
        let service = UniversalSearchIndexService(
            coordinator: coordinator,
            contextProvider: { context }
        )
        let observer = LifecycleObserver()
        service.add(observer: observer)
        service.start()
        service.setWalletReady(true)
        try await expectEventually { await observer.completedCount >= 1 }

        service.stop()
        service.start()
        service.setWalletReady(true)

        try await expectEventually { await observer.completedCount >= 2 }
        service.stop()
    }

    @Test
    func `a burst of invalidations coalesces into one refresh`() async throws {
        let context = context
        let calls = LifecycleSourceCallRecorder()
        let tokens = LifecycleSource(id: WalletCoreTokenSearchSource.id) { context in
            await calls.record(WalletCoreTokenSearchSource.id)
            return emptySnapshot(sourceID: WalletCoreTokenSearchSource.id, context: context)
        }
        let coordinator = UniversalSearchCoordinator(sources: [tokens])
        let service = UniversalSearchIndexService(
            coordinator: coordinator,
            contextProvider: { context },
            timing: .init(
                debounce: .milliseconds(50),
                maxPostpone: .seconds(1),
                loopPacing: .milliseconds(10)
            )
        )
        service.start()
        defer { service.stop() }
        service.setWalletReady(true)
        try await expectEventually {
            await calls.count(for: WalletCoreTokenSearchSource.id) == 1
        }

        for _ in 0..<5 {
            service.walletCore(event: .accountChanged(accountId: "account-a", isNew: false))
        }

        try await expectEventually {
            await calls.count(for: WalletCoreTokenSearchSource.id) == 2
        }
        try await Task.sleep(for: .milliseconds(200))
        #expect(await calls.count(for: WalletCoreTokenSearchSource.id) == 2)
    }

    @Test
    func `continuous invalidation cannot postpone a refresh past the cap`() async throws {
        let context = context
        let calls = LifecycleSourceCallRecorder()
        let tokens = LifecycleSource(id: WalletCoreTokenSearchSource.id) { context in
            await calls.record(WalletCoreTokenSearchSource.id)
            return emptySnapshot(sourceID: WalletCoreTokenSearchSource.id, context: context)
        }
        let coordinator = UniversalSearchCoordinator(sources: [tokens])
        let service = UniversalSearchIndexService(
            coordinator: coordinator,
            contextProvider: { context },
            timing: .init(
                debounce: .milliseconds(100),
                maxPostpone: .milliseconds(250),
                loopPacing: .milliseconds(10)
            )
        )
        service.start()
        defer { service.stop() }
        service.setWalletReady(true)
        try await expectEventually {
            await calls.count(for: WalletCoreTokenSearchSource.id) == 1
        }

        // Events keep arriving faster than the debounce, so only the postpone cap lets a refresh run
        let deadline = ContinuousClock.now + .milliseconds(700)
        while ContinuousClock.now < deadline {
            service.walletCore(event: .tokensChanged)
            try await Task.sleep(for: .milliseconds(30))
        }

        #expect(await calls.count(for: WalletCoreTokenSearchSource.id) >= 2)
    }

    private func expectEventually(
        timeout: Duration = .seconds(2),
        condition: @escaping @Sendable () async -> Bool
    ) async throws {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        while clock.now < deadline {
            if await condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        Issue.record("Condition was not satisfied before timeout")
    }
}

@MainActor
private final class LifecycleObserver: UniversalSearchIndexServiceObserver {
    private(set) var completedCount = 0

    func universalSearchIndexService(
        _ service: UniversalSearchIndexService,
        didUpdate update: UniversalSearchIndexUpdate
    ) {
        if case .completed = update.kind {
            completedCount += 1
        }
    }
}

private actor LifecycleSourceCallRecorder {
    private var counts: [SearchSourceID: Int] = [:]

    func record(_ sourceID: SearchSourceID) {
        counts[sourceID, default: 0] += 1
    }

    func count(for sourceID: SearchSourceID) -> Int {
        counts[sourceID, default: 0]
    }
}

private struct LifecycleSource: UniversalSearchSource {
    typealias Loader = @Sendable (
        UniversalSearchContext
    ) async throws -> UniversalSearchSourceSnapshot

    let sourceID: SearchSourceID
    let loader: Loader

    init(id: SearchSourceID, loader: @escaping Loader) {
        sourceID = id
        self.loader = loader
    }

    func snapshot(
        for context: UniversalSearchContext
    ) async throws -> UniversalSearchSourceSnapshot {
        try await loader(context)
    }
}

private func emptySnapshot(
    sourceID: SearchSourceID,
    context: UniversalSearchContext
) -> UniversalSearchSourceSnapshot {
    UniversalSearchSourceSnapshot(
        sourceID: sourceID,
        revision: context.scopeID,
        generatedAt: Date(timeIntervalSince1970: 1)
    )
}
