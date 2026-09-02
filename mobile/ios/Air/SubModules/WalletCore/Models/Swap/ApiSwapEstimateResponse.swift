//
//  ApiSwapEstimateResponse.swift
//  MyTonWalletAir
//
//  Created by nikstar on 31.08.2025.
//


public enum ApiSwapEstimateResponse: Equatable, Decodable, Sendable {
    case dex(ApiSwapDexEstimateResponse)
    case cex(ApiSwapCexEstimateResponse)

    private enum CodingKeys: String, CodingKey {
        case route
    }

    private enum Route: String, Decodable {
        case dex
        case cex
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Route.self, forKey: .route) {
        case .dex:
            self = .dex(try ApiSwapDexEstimateResponse(from: decoder))
        case .cex:
            self = .cex(try ApiSwapCexEstimateResponse(from: decoder))
        }
    }
}

public struct ApiSwapDexEstimateResponse: Equatable, Decodable, Sendable {
    public var from: String
    public var to: String
    public var slippage: Double?
    public var fromAmount: MDouble
    public var toAmount: MDouble
    public var fromAddress: String?
    public var shouldTryDiesel: Bool?
    public var toMinAmount: MDouble
    public var impact: Double
    public var dexLabel: ApiSwapDexLabel?
    public var dexRouterLabel: String?
    public var dieselStatus: DieselStatus
    /// only in v3
    public var routes: [[ApiSwapRoute]]?
    // Fees
    public var networkFee: MDouble
    public var realNetworkFee: MDouble
    public var swapFee: MDouble
    public var swapFeePercent: Double
    public var ourFee: MDouble
    public var ourFeePercent: Double
    public var dieselFee: MDouble?
    
    public static func ==(lhs: Self, rhs: Self) -> Bool {
        lhs.from == rhs.from &&
        lhs.to == rhs.to &&
        lhs.slippage == rhs.slippage &&
        lhs.fromAmount == rhs.fromAmount &&
        lhs.toAmount == rhs.toAmount &&
        lhs.fromAddress == rhs.fromAddress &&
        lhs.shouldTryDiesel == rhs.shouldTryDiesel &&
        lhs.toMinAmount == rhs.toMinAmount &&
        lhs.impact == rhs.impact &&
        lhs.dexLabel == rhs.dexLabel &&
        lhs.dexRouterLabel == rhs.dexRouterLabel &&
        lhs.dieselStatus == rhs.dieselStatus &&
        lhs.networkFee == rhs.networkFee &&
        lhs.realNetworkFee == rhs.realNetworkFee &&
        lhs.swapFee == rhs.swapFee &&
        lhs.swapFeePercent == rhs.swapFeePercent &&
        lhs.ourFee == rhs.ourFee &&
        lhs.ourFeePercent == rhs.ourFeePercent &&
        lhs.dieselFee == rhs.dieselFee
    }
}
