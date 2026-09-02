import WalletCore

struct SwapEstimateResult {
    let changedFrom: SwapSide
    let response: ApiSwapEstimateResponse?
    let estimateIssue: SwapIssue?
    let isRateLimited: Bool

    init(
        changedFrom: SwapSide,
        response: ApiSwapEstimateResponse?,
        estimateIssue: SwapIssue?,
        isRateLimited: Bool = false
    ) {
        self.changedFrom = changedFrom
        self.response = response
        self.estimateIssue = estimateIssue
        self.isRateLimited = isRateLimited
    }

    var dexEstimate: ApiSwapDexEstimateResponse? {
        guard case .dex(let estimate) = response else { return nil }
        return estimate
    }

    var cexEstimate: ApiSwapCexEstimateResponse? {
        guard case .cex(let estimate) = response else { return nil }
        return estimate
    }
}

struct SwapEstimateModel {
    private(set) var response: ApiSwapEstimateResponse?
    private(set) var estimateIssue: SwapIssue?
    private(set) var swapMode: ApiSwapMode?

    var dexEstimate: ApiSwapDexEstimateResponse? {
        guard case .dex(let estimate) = response else { return nil }
        return estimate
    }

    var cexEstimate: ApiSwapCexEstimateResponse? {
        guard case .cex(let estimate) = response else { return nil }
        return estimate
    }

    mutating func apply(_ result: SwapEstimateResult) {
        response = result.response
        estimateIssue = result.estimateIssue
        swapMode = result.response == nil ? nil : result.changedFrom.swapMode
    }

    mutating func clear() {
        response = nil
        estimateIssue = nil
        swapMode = nil
    }
}
