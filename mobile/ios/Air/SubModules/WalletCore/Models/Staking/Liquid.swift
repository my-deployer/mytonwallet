
import Foundation
import WalletContext
import WalletCoreTypes

public struct ApiStakingStateLiquid: MBaseStakingState, Equatable, Hashable, Codable, Sendable {
    // base staking state
    public var id: String
    public var tokenSlug: String
    public var annualYield: MDouble
    public var yieldType: ApiYieldType
    public var balance: BigInt
    public var pool: String
    public var unstakeRequestAmount: BigInt?

    public var type = "liquid"
    public var tokenBalance: BigInt
    /// Accrued loyalty bonus. Held outside the STAKED jetton and paid as a separate transfer on unstake.
    public var loyaltyBalance: BigInt?
    public var instantAvailable: BigInt
    public var start: Int
    public var end: Int
    public var totalStakers: Int
    public var tvl: BigInt
}
