import Testing
@testable import WalletCore

@Suite("Activity Preview")
struct ActivityPreviewViewModelTests {
    @Test
    func `preview remains loading while cached visible count is below requested count`() {
        #expect(ActivityPreviewViewModel.resolveLoadState(
            visibleCount: 6,
            requestedCount: 10,
            isEndReached: false,
            failed: false
        ) == .loading)
    }

    @Test
    func `preview becomes exhausted only after history end is known`() {
        #expect(ActivityPreviewViewModel.resolveLoadState(
            visibleCount: 6,
            requestedCount: 10,
            isEndReached: true,
            failed: false
        ) == .exhausted)
    }

    @Test
    func `hidden tiny and scam activities do not consume the requested count`() {
        let hidden = activity(id: "hidden", shouldHide: true)
        let tiny = activity(id: "tiny", isIncoming: true)
        let firstVisible = activity(id: "visible-1")
        let scam = activity(id: "scam", isIncoming: true, isScam: true)
        let secondVisible = activity(id: "visible-2")
        let activities = [hidden, tiny, firstVisible, scam, secondVisible]
        let byId = Dictionary(uniqueKeysWithValues: activities.map { ($0.id, $0) })

        let visibleIDs = ActivityVisibilityFilter.visibleIDs(
            activities.map(\.id),
            activitiesById: byId,
            accountId: "0-mainnet",
            token: nil,
            poisoningCache: PoisoningCache(),
            hideTinyTransfers: true
        )

        #expect(Array(visibleIDs?.prefix(2) ?? []) == ["visible-1", "visible-2"])
    }

    private func activity(
        id: String,
        shouldHide: Bool = false,
        isIncoming: Bool = false,
        isScam: Bool = false
    ) -> ApiActivity {
        .transaction(ApiTransactionActivity(
            id: id,
            kind: "transaction",
            shouldHide: shouldHide,
            externalMsgHashNorm: nil,
            timestamp: 0,
            amount: 0,
            fromAddress: "from",
            toAddress: "to",
            comment: nil,
            encryptedComment: nil,
            fee: 0,
            slug: "toncoin",
            isIncoming: isIncoming,
            normalizedAddress: nil,
            type: nil,
            metadata: isScam ? ApiAddressInfo(name: nil, isScam: true, isMemoRequired: nil) : nil,
            nft: nil,
            status: .confirmed
        ))
    }
}
