import Foundation
import Testing
@testable import UIEarn
import Dependencies
import WalletContext
@testable import WalletCore

@Suite("Earn Draft Coordination")
@MainActor
struct StakingDraftCoordinatorIntegrationTests {
    @Test
    func `add stake keeps only a draft for the current wallet request`() async throws {
        let probe = StakingDraftProbe()
        let model = makeAddStakeModel(probe: probe)

        model.amount = 10
        await waitUntil { await probe.stakeRequestCount == 1 }

        let firstRequest = try #require(await probe.stakeRequest(at: 0))
        #expect(firstRequest.accountId == "test-mainnet")
        #expect(firstRequest.amount == 10)
        #expect(firstRequest.nativeBalance == 0)
        #expect(model.draftPhase == .loading)
        let supersededTask = try #require(model.draftCoordinator.task)

        model.nativeBalance = 100
        await waitUntil { await probe.stakeRequestCount == 2 }

        #expect(model.currentDraftSnapshot == nil)
        #expect(model.draftPhase == .loading)
        #expect(await probe.stakeRequest(at: 1)?.nativeBalance == 100)

        try await probe.succeedNextStake(with: draft(type: "stale"))
        await supersededTask.value
        #expect(model.currentDraftSnapshot == nil)
        #expect(model.draftPhase == .loading)

        let currentDraft = try draft(type: "current")
        try await probe.succeedNextStake(with: currentDraft)
        await waitUntil { model.draftPhase == .ready }

        #expect(model.currentDraftSnapshot?.request.nativeBalance == 100)
        #expect(model.currentDraftSnapshot?.draft == currentDraft)
    }

    @Test
    func `unstake ignores a draft for a superseded staking state`() async throws {
        let probe = StakingDraftProbe()
        let model = makeUnstakeModel(probe: probe)

        model.amount = 25
        await waitUntil { await probe.unstakeRequestCount == 1 }
        let supersededTask = try #require(model.draftCoordinator.task)

        model.stakingState = .unknown("updated")
        await waitUntil { await probe.unstakeRequestCount == 2 }

        try await probe.succeedNextUnstake(with: draft(type: "stale"))
        await supersededTask.value

        #expect(model.currentDraftSnapshot == nil)
        #expect(model.draftPhase == .loading)

        let currentDraft = try draft(type: "current")
        try await probe.succeedNextUnstake(with: currentDraft)
        await waitUntil { model.draftPhase == .ready }

        #expect(
            model.currentDraftSnapshot?.request.stakingState
                == .unknown("updated")
        )
        #expect(model.currentDraftSnapshot?.request.amount == 25)
        #expect(model.currentDraftSnapshot?.draft == currentDraft)
    }

    @Test
    func `earn drafts follow a tracked account change`() async throws {
        let stakeProbe = StakingDraftProbe()
        let (addStakeModel, addStakeAccount) = makeSwitchingAddStakeModel(
            probe: stakeProbe
        )

        addStakeModel.amount = 10
        await waitUntil { await stakeProbe.stakeRequestCount == 1 }
        let supersededStakeTask = try #require(
            addStakeModel.draftCoordinator.task
        )

        addStakeAccount.accountId = "1-mainnet"
        addStakeModel.walletCore(
            event: .accountChanged(accountId: "1-mainnet", isNew: false)
        )
        await waitUntil { await stakeProbe.stakeRequestCount == 2 }

        #expect(addStakeModel.currentDraftRequest?.accountId == "1-mainnet")
        #expect(await stakeProbe.stakeRequest(at: 1)?.accountId == "1-mainnet")

        try await stakeProbe.succeedNextStake(with: draft(type: "stale"))
        await supersededStakeTask.value
        let stakeDraft = try draft(type: "current")
        try await stakeProbe.succeedNextStake(with: stakeDraft)
        await waitUntil { addStakeModel.draftPhase == .ready }

        #expect(addStakeModel.currentDraftSnapshot?.request.accountId == "1-mainnet")
        #expect(addStakeModel.currentDraftSnapshot?.draft == stakeDraft)

        let unstakeProbe = StakingDraftProbe()
        let (unstakeModel, unstakeAccount) = makeSwitchingUnstakeModel(
            probe: unstakeProbe
        )

        unstakeModel.amount = 25
        await waitUntil { await unstakeProbe.unstakeRequestCount == 1 }
        let supersededUnstakeTask = try #require(
            unstakeModel.draftCoordinator.task
        )

        unstakeAccount.accountId = "1-mainnet"
        unstakeModel.walletCore(
            event: .accountChanged(accountId: "1-mainnet", isNew: false)
        )
        await waitUntil { await unstakeProbe.unstakeRequestCount == 2 }

        #expect(unstakeModel.currentDraftRequest?.accountId == "1-mainnet")
        #expect(
            await unstakeProbe.unstakeRequest(at: 1)?.accountId == "1-mainnet"
        )

        try await unstakeProbe.succeedNextUnstake(with: draft(type: "stale"))
        await supersededUnstakeTask.value
        let unstakeDraft = try draft(type: "current")
        try await unstakeProbe.succeedNextUnstake(with: unstakeDraft)
        await waitUntil { unstakeModel.draftPhase == .ready }

        #expect(unstakeModel.currentDraftSnapshot?.request.accountId == "1-mainnet")
        #expect(unstakeModel.currentDraftSnapshot?.draft == unstakeDraft)
    }

    @Test
    func `failed earn draft can be retried explicitly`() async throws {
        let probe = StakingDraftProbe()
        let model = makeAddStakeModel(probe: probe)
        var failures = 0
        model.onDraftFailure = { _ in
            failures += 1
        }

        model.amount = 50
        await waitUntil { await probe.stakeRequestCount == 1 }

        try await probe.failNextStake(with: TestError.expected)
        await waitUntil { model.draftPhase == .failed }

        #expect(model.canRetryDraft)
        #expect(failures == 1)

        model.retryDraft()
        await waitUntil { await probe.stakeRequestCount == 2 }
        #expect(model.draftPhase == .loading)

        try await probe.succeedNextStake(with: emptyDraft())
        await waitUntil { model.draftPhase == .ready }

        #expect(model.currentDraftSnapshot?.request.amount == 50)
        #expect(failures == 1)
    }
}

@MainActor
private func makeAddStakeModel(
    probe: StakingDraftProbe
) -> AddStakeModel {
    withDependencies {
        $0.balancesStore = _BalancesStore.liveValue
        $0.stakingStore = _StakingStore.liveValue
    } operation: {
        AddStakeModel(
            config: .ton,
            stakingState: .unknown("initial"),
            accountContext: makeAccountContext(),
            draftClient: makeDraftClient(probe: probe)
        )
    }
}

@MainActor
private func makeUnstakeModel(
    probe: StakingDraftProbe
) -> UnstakeModel {
    withDependencies {
        $0.balancesStore = _BalancesStore.liveValue
        $0.stakingStore = _StakingStore.liveValue
    } operation: {
        UnstakeModel(
            config: .ton,
            stakingState: .unknown("initial"),
            accountContext: makeAccountContext(),
            draftClient: makeDraftClient(probe: probe)
        )
    }
}

@MainActor
private func makeSwitchingAddStakeModel(
    probe: StakingDraftProbe
) -> (AddStakeModel, AccountContext) {
    withDependencies {
        $0.accountStore = _AccountStore.previewValue
        $0.balancesStore = _BalancesStore.liveValue
        $0.stakingStore = _StakingStore.liveValue
    } operation: {
        let accountContext = AccountContext(source: .current)
        let model = AddStakeModel(
            config: .ton,
            stakingState: .unknown("initial"),
            accountContext: accountContext,
            draftClient: makeDraftClient(probe: probe)
        )
        return (model, accountContext)
    }
}

@MainActor
private func makeSwitchingUnstakeModel(
    probe: StakingDraftProbe
) -> (UnstakeModel, AccountContext) {
    withDependencies {
        $0.accountStore = _AccountStore.previewValue
        $0.balancesStore = _BalancesStore.liveValue
        $0.stakingStore = _StakingStore.liveValue
    } operation: {
        let accountContext = AccountContext(source: .current)
        let model = UnstakeModel(
            config: .ton,
            stakingState: .unknown("initial"),
            accountContext: accountContext,
            draftClient: makeDraftClient(probe: probe)
        )
        return (model, accountContext)
    }
}

@MainActor
private func makeAccountContext() -> AccountContext {
    let account = MAccount(
        id: "test-mainnet",
        title: "Test",
        type: .mnemonic,
        byChain: [.ton: AccountChain(address: "ton-address")]
    )
    return AccountContext(source: .constant(account))
}

private func makeDraftClient(
    probe: StakingDraftProbe
) -> StakingDraftClient {
    StakingDraftClient(
        checkStake: { request in
            try await probe.loadStake(request)
        },
        checkUnstake: { request in
            try await probe.loadUnstake(request)
        }
    )
}

private func emptyDraft() throws -> ApiCheckTransactionDraftResult {
    try JSONDecoder().decode(
        ApiCheckTransactionDraftResult.self,
        from: Data("{}".utf8)
    )
}

private func draft(type: String) throws -> ApiCheckTransactionDraftResult {
    try JSONDecoder().decode(
        ApiCheckTransactionDraftResult.self,
        from: Data(#"{"type":"\#(type)"}"#.utf8)
    )
}

private enum TestError: Error {
    case expected
    case missingPendingRequest
}

private actor StakingDraftProbe {
    private var stakeRequests: [AddStakeDraftRequest] = []
    private var unstakeRequests: [UnstakeDraftRequest] = []
    private var pendingStake: [
        CheckedContinuation<ApiCheckTransactionDraftResult, any Error>
    ] = []
    private var pendingUnstake: [
        CheckedContinuation<ApiCheckTransactionDraftResult, any Error>
    ] = []

    var stakeRequestCount: Int {
        stakeRequests.count
    }

    var unstakeRequestCount: Int {
        unstakeRequests.count
    }

    func stakeRequest(at index: Int) -> AddStakeDraftRequest? {
        stakeRequests.indices.contains(index) ? stakeRequests[index] : nil
    }

    func unstakeRequest(at index: Int) -> UnstakeDraftRequest? {
        unstakeRequests.indices.contains(index) ? unstakeRequests[index] : nil
    }

    func loadStake(
        _ request: AddStakeDraftRequest
    ) async throws -> ApiCheckTransactionDraftResult {
        stakeRequests.append(request)
        return try await withCheckedThrowingContinuation { continuation in
            pendingStake.append(continuation)
        }
    }

    func loadUnstake(
        _ request: UnstakeDraftRequest
    ) async throws -> ApiCheckTransactionDraftResult {
        unstakeRequests.append(request)
        return try await withCheckedThrowingContinuation { continuation in
            pendingUnstake.append(continuation)
        }
    }

    func succeedNextStake(
        with draft: ApiCheckTransactionDraftResult
    ) throws {
        try takeFirst(&pendingStake).resume(returning: draft)
    }

    func failNextStake(with error: any Error) throws {
        try takeFirst(&pendingStake).resume(throwing: error)
    }

    func succeedNextUnstake(
        with draft: ApiCheckTransactionDraftResult
    ) throws {
        try takeFirst(&pendingUnstake).resume(returning: draft)
    }

    private func takeFirst<T>(
        _ continuations: inout [CheckedContinuation<T, any Error>]
    ) throws -> CheckedContinuation<T, any Error> {
        guard !continuations.isEmpty else {
            throw TestError.missingPendingRequest
        }
        return continuations.removeFirst()
    }
}

@MainActor
private func waitUntil(
    _ condition: @escaping @MainActor () async -> Bool
) async {
    for _ in 0..<1_000 {
        if await condition() {
            return
        }
        try? await Task.sleep(for: .milliseconds(1))
    }
    Issue.record("Timed out waiting for Earn draft state")
}
