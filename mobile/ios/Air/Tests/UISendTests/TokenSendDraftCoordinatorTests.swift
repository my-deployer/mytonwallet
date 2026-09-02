import Dependencies
import Foundation
import Testing
@testable import UISend
import WalletContext
@testable import WalletCore

@Suite("Token Send Draft Coordinator")
@MainActor
struct TokenSendDraftCoordinatorTests {
    @Test
    func `superseded token draft cannot replace the current snapshot`() async throws {
        let probe = TokenDraftProbe()
        let model = makeTokenSendModel(probe: probe)

        await waitUntil { await probe.requestCount == 1 }
        try await probe.succeedNext(
            with: draft(resolvedAddress: "first")
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        expectCurrentDraft(
            model,
            amount: 10,
            resolvedAddress: "first"
        )

        model.setTokenAmount(20)
        expectNoCurrentDraft(
            model,
            lastResolvedAddress: "first"
        )
        await waitUntil { await probe.requestCount == 2 }
        let supersededTask = try model.draftCoordinator.task.orThrow(
            "Missing superseded draft task"
        )

        model.setTokenAmount(30)
        await waitUntil { await probe.requestCount == 3 }

        try await probe.succeedNext(
            with: draft(resolvedAddress: "stale")
        )
        await supersededTask.value

        expectNoCurrentDraft(
            model,
            lastResolvedAddress: "first"
        )

        try await probe.succeedNext(
            with: draft(resolvedAddress: "current")
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        expectCurrentDraft(
            model,
            amount: 30,
            resolvedAddress: "current"
        )
    }

    @Test
    func `failed token draft retries without debounce`() async throws {
        let probe = TokenDraftProbe()
        let model = makeTokenSendModel(probe: probe)
        var failures = 0
        model.onDraftFailure = { _ in
            failures += 1
        }

        await waitUntil { await probe.requestCount == 1 }
        try await probe.failNext(with: TestError.expected)
        await waitUntil { model.draftCoordinator.phase == .failed }

        #expect(model.hasCurrentDraftFailure)
        #expect(model.primaryAction == .retryDraft)
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
            model.currentDraft?.recipient.resolvedAddress == "retried"
        )
        #expect(failures == 1)
    }

    @Test
    func `draft derived memo policy starts one follow-up request`() async throws {
        let probe = TokenDraftProbe()
        let model = makeTokenSendModel(
            probe: probe,
            initialComment: "memo"
        )

        #expect(model.isEncryptedMessageAvailable)
        model.isMessageEncrypted = true
        await waitUntil { await probe.requestCount == 1 }

        let encryptedOptions = try #require(
            await probe.options(at: 0)
        )
        #expect(encryptedOptions.amount == 10)
        #expect(
            encryptedOptions.payload
                == .comment(text: "memo", shouldEncrypt: true)
        )

        try await probe.succeedNext(
            with: draft(
                resolvedAddress: "resolved",
                isMemoRequired: true
            )
        )
        await waitUntil { await probe.requestCount == 2 }

        #expect(model.draftCoordinator.phase == .loading)
        #expect(!model.isMessageEncrypted)
        #expect(
            model.draftCoordinator.lastSnapshot?.request.payload
                == .comment(text: "memo", shouldEncrypt: true)
        )
        #expect(
            model.currentDraftRequest?.payload
                == .comment(text: "memo", shouldEncrypt: false)
        )

        try await probe.succeedNext(
            with: draft(
                resolvedAddress: "resolved",
                isMemoRequired: true
            )
        )
        await waitUntil { model.draftCoordinator.phase == .ready }

        #expect(model.isCommentRequired)
        #expect(model.currentDraftSnapshot?.request.payload
            == .comment(text: "memo", shouldEncrypt: false))
    }
}

@MainActor
private func expectCurrentDraft(
    _ model: TokenSendModel,
    amount: BigInt,
    resolvedAddress: String
) {
    #expect(model.currentDraftSnapshot?.request.amount == amount)
    #expect(model.currentDraft?.recipient.resolvedAddress == resolvedAddress)
}

@MainActor
private func expectNoCurrentDraft(
    _ model: TokenSendModel,
    lastResolvedAddress: String
) {
    #expect(model.currentDraftSnapshot == nil)
    #expect(
        model.draftCoordinator.lastSnapshot?.draft.recipient.resolvedAddress
            == lastResolvedAddress
    )
}

@MainActor
private func makeTokenSendModel(
    probe: TokenDraftProbe,
    initialComment: String = ""
) -> TokenSendModel {
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
        let flow = TokenSendFlow(api: TokenSendApiClient(
            checkDraft: { chain, options in
                if options.amount == nil {
                    return try emptyDraft()
                }
                return try await probe.load(
                    chain: chain,
                    options: options
                )
            },
            submit: { _, _ in
                throw TestError.unexpectedCall
            }
        ))
        return TokenSendModel(
            accountContext: AccountContext(source: .constant(account)),
            configuration: TokenSendConfiguration(
                mode: .send,
                initialAddress: "recipient",
                initialAmount: 10,
                initialTokenSlug: TONCOIN_SLUG,
                jettonAddress: nil,
                initialComment: initialComment,
                binaryPayload: nil,
                stateInit: nil
            ),
            flow: flow,
            recipientResolver: RecipientResolverClient { _ in [:] }
        )
    }
}

private func emptyDraft() throws -> ApiCheckTransactionDraftResult {
    try JSONDecoder().decode(
        ApiCheckTransactionDraftResult.self,
        from: Data("{}".utf8)
    )
}

private func draft(
    resolvedAddress: String,
    isMemoRequired: Bool = false
) throws -> ApiCheckTransactionDraftResult {
    try JSONDecoder().decode(
        ApiCheckTransactionDraftResult.self,
        from: Data(
            #"{"resolvedAddress":"\#(resolvedAddress)","isMemoRequired":\#(isMemoRequired)}"#.utf8
        )
    )
}

private enum TestError: Error {
    case expected
    case missingPendingRequest
    case unexpectedCall
}

private actor TokenDraftProbe {
    private(set) var requests: [
        (chain: ApiChain, options: ApiCheckTransactionDraftOptions)
    ] = []
    private var pending: [
        CheckedContinuation<ApiCheckTransactionDraftResult, any Error>
    ] = []

    var requestCount: Int {
        requests.count
    }

    func options(at index: Int) -> ApiCheckTransactionDraftOptions? {
        requests.indices.contains(index) ? requests[index].options : nil
    }

    func load(
        chain: ApiChain,
        options: ApiCheckTransactionDraftOptions
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
    Issue.record("Timed out waiting for Token Send draft state")
}
