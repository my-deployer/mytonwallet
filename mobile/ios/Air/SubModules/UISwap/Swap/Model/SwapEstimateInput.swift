import WalletCore
import WalletContext

struct SwapEstimateInput: Equatable, Sendable {
    let accountId: String
    let selling: TokenAmount
    let buying: TokenAmount
    let inputSource: SwapSide
    let isMaxAmount: Bool
    let maxAmount: BigInt?
    let slippage: Double
    let previousNetworkFee: MDouble?
    let cexLabel: ApiSwapCexLabel?

    init(
        accountId: String,
        selling: TokenAmount,
        buying: TokenAmount,
        inputSource: SwapSide,
        isMaxAmount: Bool,
        maxAmount: BigInt?,
        slippage: Double,
        previousNetworkFee: MDouble? = nil,
        cexLabel: ApiSwapCexLabel? = nil
    ) {
        self.accountId = accountId
        self.selling = selling
        self.buying = buying
        self.inputSource = inputSource
        self.isMaxAmount = isMaxAmount
        self.maxAmount = maxAmount
        self.slippage = slippage
        self.previousNetworkFee = previousNetworkFee
        self.cexLabel = cexLabel
    }

    var inputAmount: BigInt {
        switch inputSource {
        case .selling:
            selling.amount
        case .buying:
            buying.amount
        }
    }

    func matchesCurrent(_ current: SwapEstimateInput?) -> Bool {
        guard let current else { return false }
        return accountId == current.accountId
            && selling.token.slug == current.selling.token.slug
            && buying.token.slug == current.buying.token.slug
            && inputSource == current.inputSource
            && isMaxAmount == current.isMaxAmount
            && (!isMaxAmount || maxAmount == current.maxAmount)
            && slippage == current.slippage
            && (isMaxAmount || inputAmount == current.inputAmount)
    }
}

struct SwapEstimateGate: Equatable {
    /// Identifies one estimate for as long as it holds the gate.
    struct Slot: Equatable {
        fileprivate let id: UInt64
    }

    private(set) var inFlightInput: SwapEstimateInput?
    private var inFlightSlot: Slot?
    private var nextSlotId: UInt64 = 0
    private var needsFollowUp = false

    var isInFlight: Bool {
        inFlightInput != nil
    }

    /// Hands the gate to an estimate, or refuses when another one holds it.
    ///
    /// A refused request is owed a follow-up only when it asks something the estimate in flight is
    /// not answering. A request for the very inputs that estimate carries is not one: it would be
    /// answered twice, and the second answer would arrive the moment the first did.
    mutating func start(_ input: SwapEstimateInput) -> Slot? {
        guard let current = inFlightInput else {
            nextSlotId += 1
            let slot = Slot(id: nextSlotId)
            inFlightInput = input
            inFlightSlot = slot
            return slot
        }

        needsFollowUp = !input.matchesCurrent(current)
        return nil
    }

    /// Releases the gate and reports whether a follow-up is owed.
    ///
    /// A cancelled estimate can wake up after the gate was reset and handed to another one, and only
    /// the holder may release it. Inputs cannot tell the two apart, since the same pair and amount
    /// can be asked again after a cancellation; the slot can.
    mutating func finish(_ slot: Slot) -> Bool {
        guard inFlightSlot == slot else { return false }

        inFlightInput = nil
        inFlightSlot = nil
        let shouldRunFollowUp = needsFollowUp
        needsFollowUp = false
        return shouldRunFollowUp
    }

    mutating func cancelFollowUp() {
        needsFollowUp = false
    }

    mutating func reset() {
        inFlightInput = nil
        inFlightSlot = nil
        needsFollowUp = false
    }
}
