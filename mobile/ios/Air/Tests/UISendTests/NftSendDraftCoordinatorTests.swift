import Dependencies
import Foundation
import Testing
@testable import UISend
import WalletContext
@testable import WalletCore

@Suite("NFT Send Draft Coordinator")
@MainActor
struct NftSendDraftCoordinatorTests {
    @Test
    func `superseded NFT draft cannot replace the current snapshot`() async throws {
        let probe = NftDraftProbe()
        let model = makeNftSendModel(probe: probe)

        await waitUntil { await probe.requestCount == 1 }
        try await probe.succeedNext(
            with: draft(resolvedAddress: "first")
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        #expect(
            model.currentDraftSnapshot?.draft.recipient.resolvedAddress
                == "first"
        )

        model.comment = "one"
        #expect(model.currentDraftSnapshot == nil)
        #expect(
            model.draftCoordinator.lastSnapshot?.draft.recipient
                .resolvedAddress == "first"
        )
        await waitUntil { await probe.requestCount == 2 }
        let supersededTask = try #require(model.draftCoordinator.task)

        model.comment = "two"
        await waitUntil { await probe.requestCount == 3 }

        try await probe.succeedNext(
            with: draft(resolvedAddress: "stale")
        )
        await supersededTask.value

        #expect(model.currentDraftSnapshot == nil)
        #expect(
            model.draftCoordinator.lastSnapshot?.draft.recipient
                .resolvedAddress == "first"
        )

        try await probe.succeedNext(
            with: draft(resolvedAddress: "current")
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        #expect(model.currentDraftSnapshot?.request.comment == "two")
        #expect(
            model.currentDraftSnapshot?.draft.recipient.resolvedAddress
                == "current"
        )
    }

    @Test
    func `failed NFT draft retries without debounce`() async throws {
        let probe = NftDraftProbe()
        let model = makeNftSendModel(probe: probe)
        var failures = 0
        model.onDraftFailure = { _ in
            failures += 1
        }

        await waitUntil { await probe.requestCount == 1 }
        try await probe.failNext(with: TestError.expected)
        await waitUntil { model.draftCoordinator.phase == .failed }

        #expect(model.hasCurrentDraftFailure)
        #expect(model.continueState.canRetryDraft)
        #expect(failures == 1)

        model.retryDraft()
        await waitUntil { await probe.requestCount == 2 }

        #expect(model.draftCoordinator.phase == .loading)
        try await probe.succeedNext(
            with: draft(resolvedAddress: "retried")
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        #expect(!model.hasCurrentDraftFailure)
        #expect(
            model.currentValidatedDraft?.recipient.resolvedAddress
                == "retried"
        )
        #expect(failures == 1)
    }
}

@MainActor
private func makeNftSendModel(
    probe: NftDraftProbe
) -> NftSendModel {
    withDependencies {
        $0[_TokenStore.self] = TokenStore
        $0[_BalancesStore.self] = _BalancesStore.liveValue
    } operation: {
        let account = MAccount(
            id: "test-mainnet",
            title: "Test",
            type: .mnemonic,
            byChain: [.ton: AccountChain(address: "ton-address")]
        )
        let flow = NftSendFlow(api: NftSendApiClient(
            checkDraft: { chain, options in
                try await probe.load(chain: chain, options: options)
            },
            submit: { _ in
                throw TestError.unexpectedCall
            }
        ))
        return NftSendModel(
            accountContext: AccountContext(source: .constant(account)),
            configuration: NftSendConfiguration(
                mode: .burn,
                initialAddress: nil,
                nfts: [makeNft(chain: .ton, address: "nft")],
                chain: .ton,
                initialComment: ""
            ),
            flow: flow,
            recipientResolver: RecipientResolverClient { _ in [:] }
        )
    }
}

private func draft(
    resolvedAddress: String
) throws -> ApiCheckTransactionDraftResult {
    try JSONDecoder().decode(
        ApiCheckTransactionDraftResult.self,
        from: Data(
            #"{"resolvedAddress":"\#(resolvedAddress)"}"#.utf8
        )
    )
}

private enum TestError: Error {
    case expected
    case missingPendingRequest
    case unexpectedCall
}

private actor NftDraftProbe {
    private(set) var requests: [
        (chain: ApiChain, options: ApiCheckNftTransferDraftOptions)
    ] = []
    private var pending: [
        CheckedContinuation<ApiCheckTransactionDraftResult, any Error>
    ] = []

    var requestCount: Int {
        requests.count
    }

    func load(
        chain: ApiChain,
        options: ApiCheckNftTransferDraftOptions
    ) async throws -> ApiCheckTransactionDraftResult {
        requests.append((chain, options))
        return try await withCheckedThrowingContinuation { continuation in
            pending.append(continuation)
        }
    }

    func succeedNext(
        with draft: ApiCheckTransactionDraftResult
    ) throws {
        try takeNext().resume(returning: draft)
    }

    func failNext(with error: any Error) throws {
        try takeNext().resume(throwing: error)
    }

    private func takeNext() throws -> CheckedContinuation<
        ApiCheckTransactionDraftResult,
        any Error
    > {
        guard !pending.isEmpty else {
            throw TestError.missingPendingRequest
        }
        return pending.removeFirst()
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
    Issue.record("Timed out waiting for NFT draft state")
}
