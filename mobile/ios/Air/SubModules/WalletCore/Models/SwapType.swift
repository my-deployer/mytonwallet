//
//  MSwapType.swift
//  WalletCore
//
//  Created by Sina on 5/11/24.
//

import Foundation

public enum SwapType: Equatable, Sendable {
    case onChain
    /** The CEX route starts and ends inside the account. */
    case crosschainInsideWallet
    /** The CEX route sends the input from the app and pays out to an external address. */
    case crosschainFromWallet
    /** The CEX route receives a manual external deposit and pays out into the account. */
    case crosschainToWallet
}

public enum SwapRouteKind: Equatable, Sendable {
    case dex
    case cex
}

public enum CexSwapTopology: Equatable, Sendable {
    case insideWallet
    case fromWallet
    case toWallet
}

public extension SwapType {
    var route: SwapRouteKind {
        self == .onChain ? .dex : .cex
    }

    var cexTopology: CexSwapTopology? {
        switch self {
        case .onChain:
            nil
        case .crosschainInsideWallet:
            .insideWallet
        case .crosschainFromWallet:
            .fromWallet
        case .crosschainToWallet:
            .toWallet
        }
    }
}
