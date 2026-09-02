import Foundation

public struct ApiAgentV2RuntimeStatus: Codable, Equatable, Sendable {
    public let enabled: Bool
}

public enum ApiAgentV2UpdateType: String, Codable, CaseIterable, Sendable {
    case client = "agentV2"
    case portfolioHistory = "agentV2PortfolioHistory"
}

public struct ApiAgentV2HostContextUpdate: Codable, Equatable, Sendable {
    public let authorityChanged: Bool
    public let generation: Int
}

public struct ApiAgentV2ThreadSummary: Codable, Equatable, Hashable, Sendable {
    public let id: String
    public let revision: Int
    public let metadataRevision: Int
    public let titleSource: String
    public let isPinned: Bool
    public let isDefault: Bool
    public let createdAt: String
    public let updatedAt: String
    public let lastActivityAt: String
    public let clearedAt: String?
    public let messageCount: Int
}

public struct ApiAgentV2DefaultThreadResponse: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let thread: ApiAgentV2ThreadSummary
    public let created: Bool
}

public struct ApiAgentV2ThreadResponse: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let thread: ApiAgentV2ThreadSummary
    public let duplicate: Bool?
}

public struct ApiAgentV2ThreadClearResponse: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let thread: ApiAgentV2ThreadSummary
    public let duplicate: Bool
}

public enum ApiAgentV2ErrorCode: String, Codable, Equatable, Hashable, Sendable {
    case invalidRequest = "invalid_request"
    case invalidEvent = "invalid_event"
    case clientUpdateRequired = "client_update_required"
    case networkError = "network_error"
    case deviceIdInvalid = "device_id_invalid"
    case deviceTokenMissing = "device_token_missing"
    case deviceTokenInvalid = "device_token_invalid"
    case deviceTokenExpired = "device_token_expired"
    case deviceTokenRateLimited = "device_token_rate_limited"
    case profileIdInvalid = "profile_id_invalid"
    case idempotencyMismatch = "idempotency_mismatch"
    case threadRevisionConflict = "thread_revision_conflict"
    case threadNotFound = "thread_not_found"
    case threadRunInProgress = "thread_run_in_progress"
    case runNotFound = "run_not_found"
    case runInterrupted = "run_interrupted"
    case runReplayExpired = "run_replay_expired"
    case runBudgetExceeded = "run_budget_exceeded"
    case outputLimitReached = "output_limit_reached"
    case rateLimited = "rate_limited"
    case userQuotaExhausted = "user_quota_exhausted"
    case agentCapacityExhausted = "agent_capacity_exhausted"
    case contextTooLargeRetryable = "context_too_large_retryable"
    case toolUnsupported = "tool_unsupported"
    case toolScopeMismatch = "tool_scope_mismatch"
    case toolResultAlreadySubmitted = "tool_result_already_submitted"
    case toolRejected = "tool_rejected"
    case walletContextChanged = "wallet_context_changed"
    case toolTimeout = "tool_timeout"
    case toolFailed = "tool_failed"
    case toolResultTooLarge = "tool_result_too_large"
    case marketDataUnavailable = "market_data_unavailable"
    case actionUnsupported = "action_unsupported"
    case messageNotFound = "message_not_found"
    case messageNotEditable = "message_not_editable"
    case regenerateTargetInvalid = "regenerate_target_invalid"
    case followupReferenceInvalid = "followup_reference_invalid"
    case inputContinuationReferenceInvalid = "input_continuation_reference_invalid"
    case feedbackTargetInvalid = "feedback_target_invalid"
    case feedbackRevisionConflict = "feedback_revision_conflict"
    case providerTimeout = "provider_timeout"
    case providerUnavailable = "provider_unavailable"
    case providerCapabilityUnavailable = "provider_capability_unavailable"
    case providerError = "provider_error"
    case emptyResponse = "empty_response"
    case internalError = "internal_error"
    case profileDeleted = "profile_deleted"
}

public struct ApiAgentV2MutationError: Codable, Equatable, Error, Sendable {
    public let code: ApiAgentV2ErrorCode
    public let retryable: Bool
}

public struct ApiAgentV2MutationResult<Value: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    public let ok: Bool
    public let value: Value?
    public let error: ApiAgentV2MutationError?
}

public struct ApiAgentV2MessageError: Codable, Equatable, Hashable, Sendable {
    public let code: ApiAgentV2ErrorCode
    public let retryable: Bool
    public let retryAfterMs: Int?
    public let resetAt: String?
}

public enum ApiAgentV2ContentKind: String, Codable, Equatable, Hashable, Sendable {
    case markdown, semantic
}

public enum ApiAgentV2ActionLabelCode: String, Codable, Equatable, Hashable, Sendable {
    case reviewTransfer = "review_transfer"
    case openReceive = "open_receive"
    case openSend = "open_send"
    case hideSpamAssets = "hide_spam_assets"
    case openExternalLink = "open_external_link"
    case openAgent = "open_agent"
    case openToken = "open_token"
    case openTransaction = "open_transaction"
    case openStaking = "open_staking"
    case openSwap = "open_swap"
}

public enum ApiAgentV2InputContinuationCode: String, Codable, Equatable, Hashable, Sendable, CaseIterable {
    case assetSearchAsset = "asset_search_asset"
    case marketInsightAsset = "market_insight_asset"
    case marketInsightTimeframe = "market_insight_timeframe"
    case marketQuoteAsset = "market_quote_asset"
    case prepareSendAmount = "prepare_send_amount"
    case prepareSendAsset = "prepare_send_asset"
    case prepareSendRecipient = "prepare_send_recipient"
    case prepareSwapAmount = "prepare_swap_amount"
    case prepareSwapDestinationAsset = "prepare_swap_destination_asset"
    case prepareSwapDirection = "prepare_swap_direction"
    case prepareSwapSourceAsset = "prepare_swap_source_asset"
}

public struct ApiAgentV2FollowUp: Codable, Equatable, Hashable, Sendable, Identifiable {
    public let id: String
    public let kind: String
    public let text: String

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, kind, text
    }

    public init(from decoder: Decoder) throws {
        let dynamicContainer = try decoder.container(keyedBy: ApiAgentV2DynamicCodingKey.self)
        let expectedKeys = Set(CodingKeys.allCases.map(\.rawValue))
        guard Set(dynamicContainer.allKeys.map(\.stringValue)) == expectedKeys else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid Agent V2 follow-up fields")
            )
        }

        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        kind = try container.decode(String.self, forKey: .kind)
        text = try container.decode(String.self, forKey: .text)
        guard kind == "suggested_prompt",
              id.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .regularExpression) != nil,
              Self.isValidText(text, maximumLength: 80) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid Agent V2 follow-up")
            )
        }
    }

    private static func isValidText(_ value: String, maximumLength: Int) -> Bool {
        value.trimmingCharacters(in: .whitespacesAndNewlines) == value
            && !value.isEmpty
            && value.unicodeScalars.count <= maximumLength
            && !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
            && value.range(
                of: #"(?:[*_~`]|\[[^\]]*\]\(|</?[A-Za-z]|^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s)"#,
                options: .regularExpression
            ) == nil
    }
}

private struct ApiAgentV2DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

private struct ApiAgentV2LossyFollowUp: Decodable {
    let value: ApiAgentV2FollowUp?

    init(from decoder: Decoder) throws {
        value = try? ApiAgentV2FollowUp(from: decoder)
    }
}

private extension KeyedDecodingContainer {
    func decodeAgentV2FollowUps(forKey key: Key) -> [ApiAgentV2FollowUp] {
        guard let values = try? decode([ApiAgentV2LossyFollowUp].self, forKey: key) else {
            return []
        }
        var ids = Set<String>()
        var followUps = [ApiAgentV2FollowUp]()
        for value in values {
            guard let followUp = value.value, ids.insert(followUp.id).inserted else {
                continue
            }
            followUps.append(followUp)
            if followUps.count == 3 {
                break
            }
        }
        return followUps
    }
}

public struct ApiAgentV2InputContinuation: Codable, Equatable, Hashable, Sendable {
    public let id: String
    public let kind: String
    public let code: ApiAgentV2InputContinuationCode
    public let scenario: String
    public let field: String
}

public struct ApiAgentV2PersistedAction: Codable, Equatable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case receive, send, stake, swap, hideSpamAssets, openUrl, openAgent, openToken, openTransaction
    }

    public let id: String
    public let kind: Kind
    public let labelCode: ApiAgentV2ActionLabelCode
    public let draftId: String?
    public let draftExpiresAt: String?
    public let sourceToolCallId: String?
    public let effect: String?
    public let localDraftRequired: Bool?
    public let requiresConfirmation: Bool
}

public struct ApiAgentV2AssetIdentity: Codable, Equatable, Hashable, Sendable {
    public let slug: String
    public let chain: String
    public let symbol: String
    public let name: String?
    public let tokenAddress: String?
    public let decimals: Int?

    public init(
        slug: String,
        chain: String,
        symbol: String,
        name: String?,
        tokenAddress: String?,
        decimals: Int?
    ) {
        self.slug = slug
        self.chain = chain
        self.symbol = symbol
        self.name = name
        self.tokenAddress = tokenAddress
        self.decimals = decimals
    }
}

public struct ApiAgentV2PortfolioPerformance: Codable, Equatable, Hashable, Sendable {
    public struct Chart: Codable, Equatable, Hashable, Sendable {
        public struct Series: Codable, Equatable, Hashable, Sendable {
            public let asset: ApiAgentV2AssetIdentity
            public let values: [String]
        }

        public let kind: String
        public let range: String
        public let baseCurrency: String
        public let timestamps: [Double]
        public let series: [Series]
    }

    public struct Contributor: Codable, Equatable, Hashable, Sendable {
        public let asset: ApiAgentV2AssetIdentity
        public let semantics: String
        public let amount: String
        public let currency: String
        public let direction: String
    }

    public let chart: Chart
    public let topContributor: Contributor?
}

public struct ApiAgentV2Money: Codable, Equatable, Hashable, Sendable {
    public let value: String
    public let valueType: String
    public let decimals: Int
    public let symbol: String
    public let slug: String
    public let chain: String
    public let tokenAddress: String?
}

public struct ApiAgentV2PortfolioPositionsPayload: Codable, Equatable, Hashable, Sendable {
    public struct Amount: Codable, Equatable, Hashable, Sendable {
        public let value: String
        public let currency: String
    }

    public struct Row: Codable, Equatable, Hashable, Sendable {
        public let assetRef: String
        public let asset: ApiAgentV2AssetIdentity
        public let amount: Amount
    }

    public struct UnpricedRow: Codable, Equatable, Hashable, Sendable {
        public let assetRef: String
        public let asset: ApiAgentV2AssetIdentity
    }

    public struct DataQuality: Codable, Equatable, Hashable, Sendable {
        public let coverage: String
        public let limitations: [String]
    }

    public let id: String
    public let status: String
    public let accountScope: String
    public let baseCurrency: String
    public let generatedAt: String
    public let positions: [Row]
    public let unpriced: [UnpricedRow]
    public let omittedUnpricedAssetCount: Int
    public let dataQuality: DataQuality
}

public struct ApiAgentV2NetworkActivityPayload: Codable, Equatable, Hashable, Sendable {
    public struct Row: Codable, Equatable, Hashable, Sendable {
        public enum Kind: String, Codable, Equatable, Hashable, Sendable {
            case transfer, swap, stake, unstake, nft, contract, unknown
        }
        public enum Status: String, Codable, Equatable, Hashable, Sendable { case pending, completed, failed }
        public enum Direction: String, Codable, Equatable, Hashable, Sendable { case incoming, outgoing }

        public let kind: Kind
        public let timestamp: String
        public let status: Status
        public let direction: Direction?
        public let asset: ApiAgentV2AssetIdentity?
        public let amount: ApiAgentV2Money?
        public let safeDescription: String?
    }

    public let id: String
    public let status: String
    public let accountScope: String
    public let chain: String
    public let generatedAt: String
    public let hasMore: Bool
    public let rows: [Row]
}

public struct ApiAgentV2PortfolioAnalysisPayload: Codable, Equatable, Hashable, Sendable {
    public struct TotalValue: Codable, Equatable, Hashable, Sendable {
        public let value: String
        public let currency: String
        public let asOf: String
    }

    public struct RangeChange: Codable, Equatable, Hashable, Sendable {
        public let range: String
        public let semantics: String
        public let amount: String?
        public let percent: String?
        public let direction: String
    }

    public struct TopPosition: Codable, Equatable, Hashable, Sendable {
        public let asset: ApiAgentV2AssetIdentity
        public let value: String
        public let currency: String
        public let percent: String
    }

    public let id: String
    public let status: String
    public let accountScope: String
    public let baseCurrency: String
    public let range: String
    public let generatedAt: String
    public let totalValue: TotalValue
    public let rangeChange: RangeChange?
    public let performance: ApiAgentV2PortfolioPerformance?
    public let topPositions: [TopPosition]?
}

public enum ApiAgentV2PortfolioContent: Codable, Equatable, Hashable, Sendable {
    public enum Outcome: String, Codable, Equatable, Hashable, Sendable {
        case complete, partial, insufficientData = "insufficient_data", unavailable
    }

    case analysis(outcome: Outcome, payload: ApiAgentV2PortfolioAnalysisPayload, narrativeMarkdown: String?)
    case positions(outcome: Outcome, payload: ApiAgentV2PortfolioPositionsPayload)
    case networkActivity(outcome: Outcome, payload: ApiAgentV2NetworkActivityPayload)

    private enum CodingKeys: String, CodingKey {
        case kind, schemaVersion, view, outcome, payload, narrativeMarkdown
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .kind) == "portfolio",
              try container.decode(Int.self, forKey: .schemaVersion) == 1 else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Invalid portfolio semantic content")
        }
        let outcome = try container.decode(Outcome.self, forKey: .outcome)
        switch try container.decode(String.self, forKey: .view) {
        case "analysis":
            guard outcome == .complete || outcome == .partial || outcome == .insufficientData else {
                throw DecodingError.dataCorruptedError(forKey: .outcome, in: container, debugDescription: "Invalid portfolio analysis outcome")
            }
            self = try .analysis(
                outcome: outcome,
                payload: container.decode(ApiAgentV2PortfolioAnalysisPayload.self, forKey: .payload),
                narrativeMarkdown: container.decodeIfPresent(String.self, forKey: .narrativeMarkdown)
            )
        case "positions":
            guard outcome == .complete || outcome == .partial else {
                throw DecodingError.dataCorruptedError(forKey: .outcome, in: container, debugDescription: "Invalid portfolio positions outcome")
            }
            self = try .positions(outcome: outcome, payload: container.decode(ApiAgentV2PortfolioPositionsPayload.self, forKey: .payload))
        case "networkActivity":
            guard outcome == .complete || outcome == .partial else {
                throw DecodingError.dataCorruptedError(forKey: .outcome, in: container, debugDescription: "Invalid network activity outcome")
            }
            self = try .networkActivity(outcome: outcome, payload: container.decode(ApiAgentV2NetworkActivityPayload.self, forKey: .payload))
        default:
            throw DecodingError.dataCorruptedError(forKey: .view, in: container, debugDescription: "Unsupported portfolio semantic view")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("portfolio", forKey: .kind)
        try container.encode(1, forKey: .schemaVersion)
        switch self {
        case .analysis(let outcome, let payload, let narrativeMarkdown):
            try container.encode("analysis", forKey: .view)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(payload, forKey: .payload)
            try container.encodeIfPresent(narrativeMarkdown, forKey: .narrativeMarkdown)
        case .positions(let outcome, let payload):
            try container.encode("positions", forKey: .view)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(payload, forKey: .payload)
        case .networkActivity(let outcome, let payload):
            try container.encode("networkActivity", forKey: .view)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(payload, forKey: .payload)
        }
    }
}

public indirect enum ApiAgentV2JSONValue: Codable, Equatable, Hashable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([Self]), object([String: Self])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([Self].self) { self = .array(value) }
        else { self = try .object(container.decode([String: Self].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

public struct ApiAgentV2NoticeContent: Codable, Equatable, Hashable, Sendable {
    public enum Code: String, Codable, Equatable, Hashable, Sendable {
        case agentUnavailable = "agent_unavailable"
        case analysisUnavailable = "analysis_unavailable"
        case assetNotFound = "asset_not_found"
        case clarificationRequired = "clarification_required"
        case consentRequired = "consent_required"
        case contentOverBudget = "content_over_budget"
        case emptyResult = "empty_result"
        case marketAnalysisAssetUnsupported = "market_analysis_asset_unsupported"
        case marketAnalysisTimeframeUnsupported = "market_analysis_timeframe_unsupported"
        case marketAnalysisUnavailable = "market_analysis_unavailable"
        case marketDataUnavailable = "market_data_unavailable"
        case marketQuote = "market_quote"
        case portfolioUnavailable = "portfolio_unavailable"
        case receiveDetailsRequired = "receive_details_required"
        case receiveReady = "receive_ready"
        case receiveUnavailable = "receive_unavailable"
        case retryRequired = "retry_required"
        case sendDetailsRequired = "send_details_required"
        case sendFormAmountRequired = "send_form_amount_required"
        case sendReady = "send_ready"
        case sendUnavailable = "send_unavailable"
        case stakingReady = "staking_ready"
        case stakingUnavailable = "staking_unavailable"
        case swapDetailsRequired = "swap_details_required"
        case swapReady = "swap_ready"
        case swapUnavailable = "swap_unavailable"
        case toolUnavailable = "tool_unavailable"
        case walletDataUnavailable = "wallet_data_unavailable"
        case walletFilterAmbiguous = "wallet_filter_ambiguous"
        case webSearchUnavailable = "web_search_unavailable"
    }
    public let kind: String
    public let schemaVersion: Int
    public let code: Code
    public let arguments: ApiAgentV2JSONValue?
    public let marketQuote: ApiAgentV2MarketQuoteNotice?

    private enum CodingKeys: String, CodingKey {
        case kind, schemaVersion, code, arguments
    }

    private struct MarketQuoteArguments: Decodable {
        let marketQuote: ApiAgentV2MarketQuoteNotice
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        code = try container.decode(Code.self, forKey: .code)
        arguments = try container.decodeIfPresent(ApiAgentV2JSONValue.self, forKey: .arguments)
        marketQuote = code == .marketQuote
            ? try container.decode(MarketQuoteArguments.self, forKey: .arguments).marketQuote
            : nil
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(code, forKey: .code)
        try container.encodeIfPresent(arguments, forKey: .arguments)
    }
}

public struct ApiAgentV2MarketQuoteNotice: Codable, Equatable, Hashable, Sendable {
    public enum Status: String, Codable, Equatable, Hashable, Sendable {
        case resolved
        case priceUnavailable = "price_unavailable"
        case ambiguous
        case notFound = "not_found"
        case unavailable
    }

    public enum UnavailableReason: String, Codable, Equatable, Hashable, Sendable {
        case planningUnavailable = "planning_unavailable"
        case capabilityUnavailable = "capability_unavailable"
        case walletContextUnavailable = "wallet_context_unavailable"
        case quoteCurrencyUnsupported = "quote_currency_unsupported"
        case quoteUnavailable = "quote_unavailable"
        case walletContextChanged = "wallet_context_changed"
        case toolTimeout = "tool_timeout"
        case toolFailed = "tool_failed"
        case invalidResult = "invalid_result"
        case cancelled
    }

    public let status: Status
    public let asset: ApiAgentV2SemanticAsset?
    public let price: String?
    public let quoteCurrency: String?
    public let percentChange24h: String?
    public let candidates: [ApiAgentV2SemanticAsset]?
    public let hasMore: Bool?
    public let asOf: String?
    public let reason: UnavailableReason?

    private enum CodingKeys: String, CodingKey {
        case status, asset, price, quoteCurrency, percentChange24h, candidates, hasMore, asOf, reason
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decode(Status.self, forKey: .status)
        asset = try container.decodeIfPresent(ApiAgentV2SemanticAsset.self, forKey: .asset)
        price = try container.decodeIfPresent(String.self, forKey: .price)
        quoteCurrency = try container.decodeIfPresent(String.self, forKey: .quoteCurrency)
        percentChange24h = try container.decodeIfPresent(String.self, forKey: .percentChange24h)
        candidates = try container.decodeIfPresent([ApiAgentV2SemanticAsset].self, forKey: .candidates)
        hasMore = try container.decodeIfPresent(Bool.self, forKey: .hasMore)
        asOf = try container.decodeIfPresent(String.self, forKey: .asOf)
        reason = try container.decodeIfPresent(UnavailableReason.self, forKey: .reason)

        let isValid = switch status {
        case .resolved:
            asset != nil && price != nil && quoteCurrency != nil && percentChange24h != nil && asOf != nil
                && candidates == nil && hasMore == nil && reason == nil
        case .priceUnavailable:
            asset != nil && asOf != nil && price == nil && quoteCurrency == nil && percentChange24h == nil
                && candidates == nil && hasMore == nil && reason == nil
        case .ambiguous:
            candidates.map { (2...3).contains($0.count) } == true && hasMore != nil && asOf != nil
                && asset == nil && price == nil && quoteCurrency == nil && percentChange24h == nil && reason == nil
        case .notFound:
            asOf != nil && asset == nil && price == nil && quoteCurrency == nil && percentChange24h == nil
                && candidates == nil && hasMore == nil && reason == nil
        case .unavailable:
            reason != nil && asset == nil && price == nil && quoteCurrency == nil && percentChange24h == nil
                && candidates == nil && hasMore == nil && asOf == nil
        }
        guard isValid else {
            throw DecodingError.dataCorruptedError(
                forKey: .status,
                in: container,
                debugDescription: "Invalid Agent V2 market quote notice"
            )
        }
    }
}

public struct ApiAgentV2WalletQueryTransactionRow: Codable, Equatable, Hashable, Sendable {
    public enum TransactionType: String, Codable, Equatable, Hashable, Sendable {
        case transfer, swap, stake, unstake, unstakeRequest, callContract, excess, contractDeploy
        case bounced, mint, burn, auctionBid, nftTrade, dnsChangeAddress, dnsChangeSite
        case dnsChangeSubdomains, dnsChangeStorage, dnsDelete, dnsRenew, liquidityDeposit, liquidityWithdraw
    }

    public enum Status: String, Codable, Equatable, Hashable, Sendable {
        case pending, pendingTrusted, confirmed, completed, failed, expired
    }

    public enum Direction: String, Codable, Equatable, Hashable, Sendable { case incoming, outgoing, `self` }
    public enum AssetLabelStatus: String, Codable, Equatable, Hashable, Sendable { case redactedUnsafe = "redacted_unsafe" }

    public let chain: String
    public let transactionType: TransactionType
    public let status: Status
    public let direction: Direction?
    public let timestamp: String
    public let assetSymbol: String?
    public let assetLabelStatus: AssetLabelStatus?
    public let quantity: String?
    public let fee: String?
    public let hash: String?
}

public struct ApiAgentV2WalletQueryPositionRow: Codable, Equatable, Hashable, Sendable {
    public enum Kind: String, Codable, Equatable, Hashable, Sendable {
        case fungible, nft, staking, vesting, vault
    }

    public enum Status: String, Codable, Equatable, Hashable, Sendable {
        case active, unstaking, ready, frozen, locked
    }
    public enum AssetLabelStatus: String, Codable, Equatable, Hashable, Sendable {
        case redactedUnsafe = "redacted_unsafe"
        case untrustedPlaintext = "untrusted_plaintext"
    }

    public let chain: String
    public let positionKind: Kind
    public let status: Status?
    public let assetSymbol: String?
    public let assetName: String?
    public let assetLabelStatus: AssetLabelStatus?
    public let quantity: String?
}

public struct ApiAgentV2WalletQueryAccountRow: Codable, Equatable, Hashable, Sendable {
    public enum LabelStatus: String, Codable, Equatable, Hashable, Sendable {
        case redactedUnsafe = "redacted_unsafe"
    }

    public enum AccessMode: String, Codable, Equatable, Hashable, Sendable {
        case regular
        case viewOnly = "view_only"
    }

    public enum TotalStatus: String, Codable, Equatable, Hashable, Sendable {
        case complete, partial, unavailable
    }

    public struct PortfolioTotal: Codable, Equatable, Hashable, Sendable {
        public let value: String
        public let baseCurrency: String
        public let unpricedCount: Int
    }

    public let accountLabel: String
    public let accountLabelStatus: LabelStatus?
    public let accessMode: AccessMode
    public let portfolioTotalStatus: TotalStatus
    public let portfolioTotal: PortfolioTotal?
}

public struct ApiAgentV2WalletPolicyCounter: Codable, Equatable, Hashable, Sendable {
    public enum Accuracy: String, Codable, Equatable, Hashable, Sendable { case exact, lowerBound = "lower_bound" }

    public let count: Int
    public let accuracy: Accuracy
}

public struct ApiAgentV2WalletQueryPolicySummary: Codable, Equatable, Hashable, Sendable {
    public enum Presentation: String, Codable, Equatable, Hashable, Sendable {
        case standard, quarantine
        case hiddenReview = "hidden_review"
    }

    public let presentation: Presentation
    public let omittedSpam: ApiAgentV2WalletPolicyCounter?
    public let omittedHidden: ApiAgentV2WalletPolicyCounter?
    public let suspicious: ApiAgentV2WalletPolicyCounter?
}

public enum ApiAgentV2WalletQueryContent: Codable, Equatable, Hashable, Sendable {
    public enum Outcome: String, Codable, Equatable, Hashable, Sendable { case complete, empty, partial }

    case transactions(
        outcome: Outcome,
        hasMore: Bool,
        omittedRows: ApiAgentV2WalletPolicyCounter?,
        policySummary: ApiAgentV2WalletQueryPolicySummary?,
        rows: [ApiAgentV2WalletQueryTransactionRow]
    )
    case accounts(
        outcome: Outcome,
        hasMore: Bool,
        omittedRows: ApiAgentV2WalletPolicyCounter?,
        rows: [ApiAgentV2WalletQueryAccountRow]
    )
    case positions(
        outcome: Outcome,
        hasMore: Bool,
        omittedRows: ApiAgentV2WalletPolicyCounter?,
        policySummary: ApiAgentV2WalletQueryPolicySummary?,
        rows: [ApiAgentV2WalletQueryPositionRow]
    )

    private enum CodingKeys: String, CodingKey {
        case kind, schemaVersion, queryKind, outcome, hasMore, omittedRows, policySummary, rows
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .kind) == "walletQuery",
              try container.decode(Int.self, forKey: .schemaVersion) == 1 else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Invalid wallet query semantic content")
        }
        let outcome = try container.decode(Outcome.self, forKey: .outcome)
        let hasMore = try container.decode(Bool.self, forKey: .hasMore)
        let omittedRows = try container.decodeIfPresent(ApiAgentV2WalletPolicyCounter.self, forKey: .omittedRows)
        switch try container.decode(String.self, forKey: .queryKind) {
        case "accounts": self = try .accounts(
            outcome: outcome,
            hasMore: hasMore,
            omittedRows: omittedRows,
            rows: container.decode([ApiAgentV2WalletQueryAccountRow].self, forKey: .rows)
        )
        case "transactions": self = try .transactions(
            outcome: outcome,
            hasMore: hasMore,
            omittedRows: omittedRows,
            policySummary: container.decodeIfPresent(ApiAgentV2WalletQueryPolicySummary.self, forKey: .policySummary),
            rows: container.decode([ApiAgentV2WalletQueryTransactionRow].self, forKey: .rows)
        )
        case "positions": self = try .positions(
            outcome: outcome,
            hasMore: hasMore,
            omittedRows: omittedRows,
            policySummary: container.decodeIfPresent(ApiAgentV2WalletQueryPolicySummary.self, forKey: .policySummary),
            rows: container.decode([ApiAgentV2WalletQueryPositionRow].self, forKey: .rows)
        )
        default: throw DecodingError.dataCorruptedError(forKey: .queryKind, in: container, debugDescription: "Unsupported wallet query kind")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("walletQuery", forKey: .kind)
        try container.encode(1, forKey: .schemaVersion)
        switch self {
        case .accounts(let outcome, let hasMore, let omittedRows, let rows):
            try container.encode("accounts", forKey: .queryKind)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(hasMore, forKey: .hasMore)
            try container.encodeIfPresent(omittedRows, forKey: .omittedRows)
            try container.encode(rows, forKey: .rows)
        case .transactions(let outcome, let hasMore, let omittedRows, let policySummary, let rows):
            try container.encode("transactions", forKey: .queryKind)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(hasMore, forKey: .hasMore)
            try container.encodeIfPresent(omittedRows, forKey: .omittedRows)
            try container.encodeIfPresent(policySummary, forKey: .policySummary)
            try container.encode(rows, forKey: .rows)
        case .positions(let outcome, let hasMore, let omittedRows, let policySummary, let rows):
            try container.encode("positions", forKey: .queryKind)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(hasMore, forKey: .hasMore)
            try container.encodeIfPresent(omittedRows, forKey: .omittedRows)
            try container.encodeIfPresent(policySummary, forKey: .policySummary)
            try container.encode(rows, forKey: .rows)
        }
    }
}

public struct ApiAgentV2MarketFearGreedRegime: Codable, Equatable, Hashable, Sendable {
    public enum PolicyVersion: String, Codable, Equatable, Hashable, Sendable {
        case fearGreedSmaRegimeV1 = "fear-greed-sma-regime-v1"
    }

    public enum Basis: String, Codable, Equatable, Hashable, Sendable {
        case closedUtcDaily = "closed_utc_daily"
    }

    public enum Regime: String, Codable, Equatable, Hashable, Sendable {
        case riskOn = "risk_on"
        case riskOff = "risk_off"
        case neutral
    }

    public struct Source: Codable, Equatable, Hashable, Sendable {
        public let provider: String
        public let endpoint: String
        public let attributionRequired: Bool
        public let attributionLabel: String
        public let attributionUrl: String
    }

    public let schemaVersion: Int
    public let policyVersion: PolicyVersion
    public let basis: Basis
    public let asOfDate: String
    public let latestValue: Int
    public let sma30: String
    public let sma365: String
    public let regime: Regime
    public let seriesDigest: String
    public let source: Source

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, policyVersion, basis, asOfDate, latestValue, sma30, sma365
        case regime, seriesDigest, source
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        policyVersion = try container.decode(PolicyVersion.self, forKey: .policyVersion)
        basis = try container.decode(Basis.self, forKey: .basis)
        asOfDate = try container.decode(String.self, forKey: .asOfDate)
        latestValue = try container.decode(Int.self, forKey: .latestValue)
        sma30 = try container.decode(String.self, forKey: .sma30)
        sma365 = try container.decode(String.self, forKey: .sma365)
        regime = try container.decode(Regime.self, forKey: .regime)
        seriesDigest = try container.decode(String.self, forKey: .seriesDigest)
        source = try container.decode(Source.self, forKey: .source)

        guard schemaVersion == 1,
              Self.isValidDate(asOfDate),
              (0 ... 100).contains(latestValue),
              Self.isValidSma(sma30),
              Self.isValidSma(sma365),
              Self.matches(seriesDigest, pattern: "^[0-9a-f]{64}$"),
              source.provider == "alternative_me",
              source.endpoint == "alternative.fng",
              source.attributionRequired,
              source.attributionLabel == "Alternative.me",
              source.attributionUrl == "https://alternative.me/crypto/fear-and-greed-index/" else {
            throw DecodingError.dataCorruptedError(
                forKey: .schemaVersion,
                in: container,
                debugDescription: "Invalid Fear & Greed SMA regime"
            )
        }
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func isValidSma(_ value: String) -> Bool {
        guard matches(value, pattern: "^(?:0|[1-9][0-9]*)\\.[0-9]{8}$"),
              let decimal = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) else {
            return false
        }
        return decimal >= 0 && decimal <= 100
    }

    private static func isValidDate(_ value: String) -> Bool {
        guard matches(value, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
              let utc = TimeZone(secondsFromGMT: 0) else { return false }
        let components = value.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return false }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let requested = DateComponents(
            timeZone: utc,
            year: components[0],
            month: components[1],
            day: components[2]
        )
        guard let date = calendar.date(from: requested) else { return false }
        let resolved = calendar.dateComponents([.year, .month, .day], from: date)
        return resolved.year == requested.year
            && resolved.month == requested.month
            && resolved.day == requested.day
    }
}

public enum ApiAgentV2MarketContent: Codable, Equatable, Hashable, Sendable {
    public enum Outcome: String, Codable, Equatable, Hashable, Sendable { case complete, partial }

    public struct OverviewEvidence: Codable, Equatable, Hashable, Sendable {
        public struct AssetChange: Codable, Equatable, Hashable, Sendable {
            public struct Quote: Codable, Equatable, Hashable, Sendable {
                public let price: String
                public let quoteCurrency: String
            }
            public struct Change: Codable, Equatable, Hashable, Sendable { public let percent: String }

            public let asset: ApiAgentV2AssetIdentity
            public let quote: Quote
            public let change: Change
        }

        public let assets: [AssetChange]
    }

    public struct Analysis: Codable, Equatable, Hashable, Sendable { public let summary: String }

    case overview(outcome: Outcome, evidence: OverviewEvidence, narrativeMarkdown: String?)
    case analysis(
        outcome: Outcome,
        evidence: ApiAgentV2JSONValue,
        analysis: Analysis?,
        fearGreedRegime: ApiAgentV2MarketFearGreedRegime?
    )

    private enum CodingKeys: String, CodingKey {
        case kind, schemaVersion, view, outcome, evidence, narrativeMarkdown, analysis, fearGreedRegime
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .kind) == "market",
              try container.decode(Int.self, forKey: .schemaVersion) == 1 else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Invalid market semantic content")
        }
        let outcome = try container.decode(Outcome.self, forKey: .outcome)
        switch try container.decode(String.self, forKey: .view) {
        case "overview":
            self = try .overview(
                outcome: outcome,
                evidence: container.decode(OverviewEvidence.self, forKey: .evidence),
                narrativeMarkdown: container.decodeIfPresent(String.self, forKey: .narrativeMarkdown)
            )
        case "analysis":
            self = try .analysis(
                outcome: outcome,
                evidence: container.decode(ApiAgentV2JSONValue.self, forKey: .evidence),
                analysis: container.decodeIfPresent(Analysis.self, forKey: .analysis),
                fearGreedRegime: try? container.decode(
                    ApiAgentV2MarketFearGreedRegime.self,
                    forKey: .fearGreedRegime
                )
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .view, in: container, debugDescription: "Unsupported market semantic view")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("market", forKey: .kind)
        try container.encode(1, forKey: .schemaVersion)
        switch self {
        case .overview(let outcome, let evidence, let narrativeMarkdown):
            try container.encode("overview", forKey: .view)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(evidence, forKey: .evidence)
            try container.encodeIfPresent(narrativeMarkdown, forKey: .narrativeMarkdown)
        case .analysis(let outcome, let evidence, let analysis, let fearGreedRegime):
            try container.encode("analysis", forKey: .view)
            try container.encode(outcome, forKey: .outcome)
            try container.encode(evidence, forKey: .evidence)
            try container.encodeIfPresent(analysis, forKey: .analysis)
            try container.encodeIfPresent(fearGreedRegime, forKey: .fearGreedRegime)
        }
    }
}

public struct ApiAgentV2SemanticAsset: Codable, Equatable, Hashable, Sendable {
    public let slug: String
    public let chain: String
    public let symbol: String
    public let name: String?
}

public struct ApiAgentV2AssetSearchHolding: Codable, Equatable, Hashable, Sendable { public let accountLabel: String }

public struct ApiAgentV2AssetSearchContent: Codable, Equatable, Hashable, Sendable {
    public enum Outcome: String, Codable, Equatable, Hashable, Sendable {
        case completeMatches = "complete_matches"
        case partialMatches = "partial_matches"
        case completeAbsent = "complete_absent"
        case incompleteUnconfirmed = "incomplete_unconfirmed"
        case ambiguous
        case scopeDenied = "scope_denied"
    }
    public let kind: String
    public let schemaVersion: Int
    public let outcome: Outcome
    public let asset: ApiAgentV2SemanticAsset?
    public let holdings: [ApiAgentV2AssetSearchHolding]?
    public let candidates: [ApiAgentV2SemanticAsset]?
    public let reason: String?
}

public struct ApiAgentV2WebDigestContent: Codable, Equatable, Hashable, Sendable {
    public enum Outcome: String, Codable, Equatable, Hashable, Sendable { case complete, partial, empty }
    public struct Item: Codable, Equatable, Hashable, Sendable {
        public let headline: String
        public let summary: String?
        public let url: String
        public let publishedAt: String?
    }
    public let kind: String
    public let schemaVersion: Int
    public let outcome: Outcome
    public let summary: String?
    public let items: [Item]
}

public enum ApiAgentV2SemanticContent: Codable, Equatable, Hashable, Sendable {
    case notice(ApiAgentV2NoticeContent)
    case walletQuery(ApiAgentV2WalletQueryContent)
    case portfolio(ApiAgentV2PortfolioContent)
    case market(ApiAgentV2MarketContent)
    case assetSearch(ApiAgentV2AssetSearchContent)
    case webDigest(ApiAgentV2WebDigestContent)
    case clientUnsupported

    private enum CodingKeys: String, CodingKey { case kind, schemaVersion, code }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(Int.self, forKey: .schemaVersion) == 1 else {
            self = .clientUnsupported
            return
        }
        switch try container.decode(String.self, forKey: .kind) {
        case "notice":
            let code = try container.decode(String.self, forKey: .code)
            guard ApiAgentV2NoticeContent.Code(rawValue: code) != nil else {
                self = .clientUnsupported
                return
            }
            self = try .notice(ApiAgentV2NoticeContent(from: decoder))
        case "walletQuery": self = try .walletQuery(ApiAgentV2WalletQueryContent(from: decoder))
        case "portfolio": self = try .portfolio(ApiAgentV2PortfolioContent(from: decoder))
        case "market": self = try .market(ApiAgentV2MarketContent(from: decoder))
        case "assetSearch": self = try .assetSearch(ApiAgentV2AssetSearchContent(from: decoder))
        case "webDigest": self = try .webDigest(ApiAgentV2WebDigestContent(from: decoder))
        case "clientUnsupported": self = .clientUnsupported
        default: self = .clientUnsupported
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .notice(let value): try value.encode(to: encoder)
        case .walletQuery(let value): try value.encode(to: encoder)
        case .portfolio(let value): try value.encode(to: encoder)
        case .market(let value): try value.encode(to: encoder)
        case .assetSearch(let value): try value.encode(to: encoder)
        case .webDigest(let value): try value.encode(to: encoder)
        case .clientUnsupported:
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode("clientUnsupported", forKey: .kind)
            try container.encode(1, forKey: .schemaVersion)
        }
    }
}

public enum ApiAgentV2MessageContent: Codable, Equatable, Hashable, Sendable {
    case markdown(String)
    case semantic(ApiAgentV2SemanticContent)

    private enum CodingKeys: String, CodingKey { case kind, text, content }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "markdown": self = try .markdown(container.decode(String.self, forKey: .text))
        case "semantic": self = try .semantic(container.decode(ApiAgentV2SemanticContent.self, forKey: .content))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unsupported Agent V2 message content")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .markdown(let text):
            try container.encode("markdown", forKey: .kind)
            try container.encode(text, forKey: .text)
        case .semantic(let content):
            try container.encode("semantic", forKey: .kind)
            try container.encode(content, forKey: .content)
        }
    }
}

public struct ApiAgentV2WalletConversationControls: Codable, Equatable, Hashable, Sendable {
    public struct ScopeChoice: Codable, Equatable, Hashable, Sendable {
        public let choiceId: String
        public let label: String
    }

    public let scopeChoices: [ScopeChoice]
    public let expiresAt: String

    public init(
        scopeChoices: [ScopeChoice],
        expiresAt: String
    ) {
        self.scopeChoices = scopeChoices
        self.expiresAt = expiresAt
    }
}

public enum ApiAgentV2MessageRole: String, Codable, Equatable, Hashable, Sendable {
    case user, assistant
}

public enum ApiAgentV2PersistedMessageStatus: String, Codable, Equatable, Hashable, Sendable {
    case complete, error, cancelled
}

public struct ApiAgentV2PersistedMessage: Codable, Equatable, Hashable, Sendable {
    public let id: String
    public let threadId: String
    public let role: ApiAgentV2MessageRole
    public let status: ApiAgentV2PersistedMessageStatus
    public let content: ApiAgentV2MessageContent?
    public let createdAt: String
    public let runId: String?
    public let error: ApiAgentV2MessageError?
    public let actions: [ApiAgentV2PersistedAction]?
    public let followups: [ApiAgentV2FollowUp]?
    public let inputContinuations: [ApiAgentV2InputContinuation]?
    public let walletControls: ApiAgentV2WalletConversationControls?

    private enum CodingKeys: String, CodingKey {
        case id, threadId, role, status, content, createdAt, runId, error, actions, followups, inputContinuations
        case walletControls
        case text, textFormat, widget
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        for key in [CodingKeys.text, .textFormat, .widget] where container.contains(key) {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "Removed Agent V2 message content field"
            )
        }
        id = try container.decode(String.self, forKey: .id)
        threadId = try container.decode(String.self, forKey: .threadId)
        role = try container.decode(ApiAgentV2MessageRole.self, forKey: .role)
        status = try container.decode(ApiAgentV2PersistedMessageStatus.self, forKey: .status)
        content = try container.decodeIfPresent(ApiAgentV2MessageContent.self, forKey: .content)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        runId = try container.decodeIfPresent(String.self, forKey: .runId)
        error = try container.decodeIfPresent(ApiAgentV2MessageError.self, forKey: .error)
        actions = try container.decodeIfPresent([ApiAgentV2PersistedAction].self, forKey: .actions)
        if container.contains(.followups), try container.decodeNil(forKey: .followups) == false {
            followups = container.decodeAgentV2FollowUps(forKey: .followups)
        } else {
            followups = nil
        }
        inputContinuations = try container.decodeIfPresent([ApiAgentV2InputContinuation].self, forKey: .inputContinuations)
        walletControls = try container.decodeIfPresent(ApiAgentV2WalletConversationControls.self, forKey: .walletControls)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(threadId, forKey: .threadId)
        try container.encode(role, forKey: .role)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(content, forKey: .content)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(runId, forKey: .runId)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encodeIfPresent(actions, forKey: .actions)
        try container.encodeIfPresent(followups, forKey: .followups)
        try container.encodeIfPresent(inputContinuations, forKey: .inputContinuations)
        try container.encodeIfPresent(walletControls, forKey: .walletControls)
    }
}

public struct ApiAgentV2ThreadHydration: Codable, Equatable, Sendable {
    public let thread: ApiAgentV2ThreadSummary
    public let messages: [ApiAgentV2PersistedMessage]
    public let nextCursor: String?
}

public struct ApiAgentV2StarterHint: Codable, Equatable, Hashable, Sendable {
    public enum ID: String, Codable, Equatable, Hashable, Sendable {
        case portfolioPerformance = "portfolio.performance"
        case learnSwap = "learn.swap"
        case learnStaking = "learn.staking"
        case learnSecurity = "learn.security"
        case receiveTokens = "receive.tokens"
    }
    public let id: ID
    public let requiredCapabilities: [String]?
}

public struct ApiAgentV2HintsResponse: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let catalogVersion: String
    public let items: [ApiAgentV2StarterHint]
}

public struct ApiAgentV2HostAsset: Codable, Equatable, Sendable {
    public let slug: String
    public let chain: String
    public let symbol: String
    public let name: String?
    public let tokenAddress: String?
    public let decimals: Int
    public let priceUsd: String?
    public let percentChange24h: String?

    public init(
        slug: String,
        chain: String,
        symbol: String,
        name: String?,
        tokenAddress: String?,
        decimals: Int,
        priceUsd: String? = nil,
        percentChange24h: String? = nil
    ) {
        self.slug = slug
        self.chain = chain
        self.symbol = symbol
        self.name = name
        self.tokenAddress = tokenAddress
        self.decimals = decimals
        self.priceUsd = priceUsd
        self.percentChange24h = percentChange24h
    }
}

public struct ApiAgentV2HostHolding: Codable, Equatable, Sendable {
    public let asset: ApiAgentV2HostAsset
    public let balance: String
    public let availableBalance: String?
    public let fiatValue: String?
    public let fiatPrice: String?
    public let valuationStatus: String?
    public let visibility: String?
    public let riskVerdict: String?

    public init(
        asset: ApiAgentV2HostAsset,
        balance: String,
        availableBalance: String?,
        fiatValue: String?,
        fiatPrice: String? = nil,
        valuationStatus: String? = nil,
        visibility: String? = nil,
        riskVerdict: String? = nil
    ) {
        self.asset = asset
        self.balance = balance
        self.availableBalance = availableBalance
        self.fiatValue = fiatValue
        self.fiatPrice = fiatPrice
        self.valuationStatus = valuationStatus
        self.visibility = visibility
        self.riskVerdict = riskVerdict
    }
}

public struct ApiAgentV2HostStakingOffer: Codable, Equatable, Sendable {
    public let productId: String
    public let asset: ApiAgentV2AssetIdentity
    public let annualYield: String
    public let yieldType: String
    public let availability: String

    public init(
        productId: String,
        asset: ApiAgentV2AssetIdentity,
        annualYield: String,
        yieldType: String,
        availability: String
    ) {
        self.productId = productId
        self.asset = asset
        self.annualYield = annualYield
        self.yieldType = yieldType
        self.availability = availability
    }
}

public struct ApiAgentV2HostDomainState: Codable, Equatable, Sendable {
    public let state: String
    public let updatedAt: String?

    public init(state: String, updatedAt: String? = nil) {
        self.state = state
        self.updatedAt = updatedAt
    }
}

public struct ApiAgentV2HostPosition: Codable, Equatable, Sendable {
    public let id: String
    public let kind: String
    public let chain: String
    public let label: String
    public let asset: ApiAgentV2HostAsset?
    public let quantity: String?
    public let valuationStatus: String
    public let fiatValue: String?
    public let status: String?
    public let apy: String?
    public let rewards: String?
    public let collection: String?
    public let isOnSale: Bool?
    public let visibility: String?
    public let riskVerdict: String?

    public init(
        id: String,
        kind: String,
        chain: String,
        label: String,
        asset: ApiAgentV2HostAsset? = nil,
        quantity: String? = nil,
        valuationStatus: String,
        fiatValue: String? = nil,
        status: String? = nil,
        apy: String? = nil,
        rewards: String? = nil,
        collection: String? = nil,
        isOnSale: Bool? = nil,
        visibility: String? = nil,
        riskVerdict: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.chain = chain
        self.label = label
        self.asset = asset
        self.quantity = quantity
        self.valuationStatus = valuationStatus
        self.fiatValue = fiatValue
        self.status = status
        self.apy = apy
        self.rewards = rewards
        self.collection = collection
        self.isOnSale = isOnSale
        self.visibility = visibility
        self.riskVerdict = riskVerdict
    }
}

public struct ApiAgentV2HostAccount: Codable, Equatable, Sendable {
    public let accountId: String
    public let label: String?
    public let state: String
    public let accountType: String
    public let isViewOnly: Bool
    public let chains: [String]
    public let addresses: [String: String]
    public let portfolioWalletKeys: [String]?
    public let holdings: [ApiAgentV2HostHolding]
    public let positions: [ApiAgentV2HostPosition]?
    public let savedAddresses: [ApiAgentV2HostSavedAddress]?
    public let domainStates: [String: ApiAgentV2HostDomainState]?

    public init(
        accountId: String,
        label: String?,
        state: String,
        accountType: String,
        isViewOnly: Bool,
        chains: [String],
        addresses: [String: String],
        portfolioWalletKeys: [String]? = nil,
        holdings: [ApiAgentV2HostHolding],
        positions: [ApiAgentV2HostPosition]? = nil,
        savedAddresses: [ApiAgentV2HostSavedAddress]? = nil,
        domainStates: [String: ApiAgentV2HostDomainState]? = nil
    ) {
        self.accountId = accountId
        self.label = label
        self.state = state
        self.accountType = accountType
        self.isViewOnly = isViewOnly
        self.chains = chains
        self.addresses = addresses
        self.portfolioWalletKeys = portfolioWalletKeys
        self.holdings = holdings
        self.positions = positions
        self.savedAddresses = savedAddresses
        self.domainStates = domainStates
    }
}

public struct ApiAgentV2HostSavedAddress: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let chain: String
    public let address: String

    public init(id: String, name: String, chain: String, address: String) {
        self.id = id
        self.name = name
        self.chain = chain
        self.address = address
    }
}

public struct ApiAgentV2HostContext: Codable, Equatable, Sendable {
    public let platform: String
    public let client: String
    public let lang: String
    public let baseCurrency: String
    public let currencyRate: String?
    public let timeZone: String?
    public let appVersion: String?
    public let theme: String?
    public let activeAccountId: String?
    public let activeNetwork: String?
    public let isTestnet: Bool?
    public let stakingOffers: [ApiAgentV2HostStakingOffer]?
    public let accounts: [ApiAgentV2HostAccount]
    public let assetCatalog: [ApiAgentV2HostAsset]?
    public let swapAssetCatalog: [ApiAgentV2HostAsset]?
    public let savedAddresses: [ApiAgentV2HostSavedAddress]

    public init(
        platform: String = "ios",
        client: String = "native",
        lang: String,
        baseCurrency: String,
        currencyRate: String? = nil,
        timeZone: String? = nil,
        appVersion: String?,
        theme: String?,
        activeAccountId: String?,
        activeNetwork: String?,
        isTestnet: Bool? = nil,
        stakingOffers: [ApiAgentV2HostStakingOffer]? = nil,
        accounts: [ApiAgentV2HostAccount],
        assetCatalog: [ApiAgentV2HostAsset]? = nil,
        swapAssetCatalog: [ApiAgentV2HostAsset]? = nil,
        savedAddresses: [ApiAgentV2HostSavedAddress]
    ) {
        self.platform = platform
        self.client = client
        self.lang = lang
        self.baseCurrency = baseCurrency
        self.currencyRate = currencyRate
        self.timeZone = timeZone
        self.appVersion = appVersion
        self.theme = theme
        self.activeAccountId = activeAccountId
        self.activeNetwork = activeNetwork
        self.isTestnet = isTestnet
        self.stakingOffers = stakingOffers
        self.accounts = accounts
        self.assetCatalog = assetCatalog
        self.swapAssetCatalog = swapAssetCatalog
        self.savedAddresses = savedAddresses
    }
}

public enum ApiAgentV2RunInput: Encodable, Equatable, Sendable {
    case append(text: String)
    case edit(targetUserMessageId: String, text: String)
    case regenerate(targetAssistantMessageId: String)

    private enum CodingKeys: String, CodingKey {
        case kind, text, targetUserMessageId, targetAssistantMessageId
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .append(let text):
            try container.encode("append", forKey: .kind)
            try container.encode(text, forKey: .text)
        case .edit(let messageId, let text):
            try container.encode("edit", forKey: .kind)
            try container.encode(messageId, forKey: .targetUserMessageId)
            try container.encode(text, forKey: .text)
        case .regenerate(let messageId):
            try container.encode("regenerate", forKey: .kind)
            try container.encode(messageId, forKey: .targetAssistantMessageId)
        }
    }
}

public enum ApiAgentV2EntryPoint: Codable, Equatable, Sendable {
    public struct TokenAsset: Codable, Equatable, Sendable {
        public let slug: String
        public let chain: String
        public let tokenAddress: String?
    }

    case agentTab
    case portfolioChart(chartId: String, range: String, source: String?)
    case tokenScreen(asset: TokenAsset)
    case globalSearch(query: String)
    case emptyState(hintId: String?, catalogVersion: String?)

    private enum CodingKeys: String, CodingKey {
        case kind, chartId, range, accountScope, source, asset, query, surface, hintId, catalogVersion
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "agentTab":
            self = .agentTab
        case "portfolioChart":
            self = try .portfolioChart(
                chartId: container.decode(String.self, forKey: .chartId),
                range: container.decode(String.self, forKey: .range),
                source: container.decodeIfPresent(String.self, forKey: .source)
            )
        case "tokenScreen":
            self = try .tokenScreen(asset: container.decode(TokenAsset.self, forKey: .asset))
        case "globalSearch":
            self = try .globalSearch(query: container.decode(String.self, forKey: .query))
        case "emptyState":
            guard try container.decode(String.self, forKey: .surface) == "agentTab" else {
                throw DecodingError.dataCorruptedError(
                    forKey: .surface,
                    in: container,
                    debugDescription: "Unsupported Agent V2 empty-state surface"
                )
            }
            self = try .emptyState(
                hintId: container.decodeIfPresent(String.self, forKey: .hintId),
                catalogVersion: container.decodeIfPresent(String.self, forKey: .catalogVersion)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unsupported Agent V2 entry point"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .agentTab:
            try container.encode("agentTab", forKey: .kind)
        case .portfolioChart(let chartId, let range, let source):
            try container.encode("portfolioChart", forKey: .kind)
            try container.encode(chartId, forKey: .chartId)
            try container.encode(range, forKey: .range)
            try container.encode("current", forKey: .accountScope)
            try container.encodeIfPresent(source, forKey: .source)
        case .tokenScreen(let asset):
            try container.encode("tokenScreen", forKey: .kind)
            try container.encode(asset, forKey: .asset)
        case .globalSearch(let query):
            try container.encode("globalSearch", forKey: .kind)
            try container.encode(query, forKey: .query)
        case .emptyState(let hintId, let catalogVersion):
            try container.encode("emptyState", forKey: .kind)
            try container.encode("agentTab", forKey: .surface)
            try container.encodeIfPresent(hintId, forKey: .hintId)
            try container.encodeIfPresent(catalogVersion, forKey: .catalogVersion)
        }
    }
}

public struct ApiAgentV2RunCommand: Encodable, Equatable, Sendable {
    public struct FollowUpReference: Encodable, Equatable, Sendable {
        public let messageId: String
        public let followupId: String

        public init(messageId: String, followupId: String) {
            self.messageId = messageId
            self.followupId = followupId
        }
    }

    public struct InputContinuationReference: Encodable, Equatable, Sendable {
        public let messageId: String
        public let continuationId: String

        public init(messageId: String, continuationId: String) {
            self.messageId = messageId
            self.continuationId = continuationId
        }
    }

    public struct WalletScopeSelectionReference: Encodable, Equatable, Sendable {
        public let sourceAssistantMessageId: String
        public let choiceId: String

        public init(sourceAssistantMessageId: String, choiceId: String) {
            self.sourceAssistantMessageId = sourceAssistantMessageId
            self.choiceId = choiceId
        }
    }

    public let threadId: String?
    public let expectedThreadRevision: Int
    public let input: ApiAgentV2RunInput
    public let entryPoint: ApiAgentV2EntryPoint?
    public let followupOf: FollowUpReference?
    public let continuationOf: InputContinuationReference?
    public let walletScopeSelectionOf: WalletScopeSelectionReference?

    public init(
        threadId: String?,
        expectedThreadRevision: Int,
        input: ApiAgentV2RunInput,
        entryPoint: ApiAgentV2EntryPoint?,
        followupOf: FollowUpReference? = nil,
        continuationOf: InputContinuationReference? = nil,
        walletScopeSelectionOf: WalletScopeSelectionReference? = nil
    ) {
        self.threadId = threadId
        self.expectedThreadRevision = expectedThreadRevision
        self.input = input
        self.entryPoint = entryPoint
        self.followupOf = followupOf
        self.continuationOf = continuationOf
        self.walletScopeSelectionOf = walletScopeSelectionOf
    }
}

public enum ApiAgentV2RunResultState: String, Codable, Equatable, Sendable {
    case completed, failed, cancelled, interrupted
}

public enum ApiAgentV2RunCancelState: String, Codable, Equatable, Sendable {
    case completed
    case completedWithToolError = "completed_with_tool_error"
    case failed, cancelled
    case runInterrupted = "run_interrupted"
}

public struct ApiAgentV2RunResult: Codable, Equatable, Sendable {
    public let clientRunId: String
    public let runId: String?
    public let inputMessageId: String?
    public let state: ApiAgentV2RunResultState
}

public struct ApiAgentV2RunCancelResponse: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let runId: String
    public let state: ApiAgentV2RunCancelState
    public let lastSequence: Int
    public let duplicate: Bool?
}

public struct ApiAgentV2ActionProposal: Codable, Equatable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case receive, send, stake, swap, hideSpamAssets, openUrl, openAgent, openToken, openTransaction
    }

    public struct ContextBinding: Codable, Equatable, Hashable, Sendable {
        public let sessionId: String
        public let revision: Int
        public let activeAccountRef: String
        public let activeNetwork: String?
    }

    public let id: String
    public let kind: Kind
    public let labelCode: ApiAgentV2ActionLabelCode
    public let draftId: String?
    public let draftExpiresAt: String?
    public let sourceToolCallId: String?
    public let assetRefs: [String]?
    public let contextBinding: ContextBinding?
    public let effect: String?
    public let localMutationRequired: Bool?
    public let requiresConfirmation: Bool
}

public enum ApiAgentV2ActionPresentation: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case send, inactive
    }

    public enum Status: String, Codable, Sendable {
        case active
    }

    public enum FeeStatus: String, Codable, Sendable {
        case estimated
        case calculatedInWallet = "calculated_in_wallet"
    }

    public struct Amount: Codable, Equatable, Sendable {
        public let value: String
        public let symbol: String
    }

    public struct Recipient: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable {
            case savedAddress, external, domain
        }

        public let kind: Kind
        public let label: String?
    }

    public struct Send: Codable, Equatable, Sendable {
        public let kind: Kind
        public let status: Status
        public let amount: Amount?
        public let network: String
        public let accountLabel: String
        public let recipient: Recipient?
        public let feeStatus: FeeStatus
        public let warningCodes: [String]
        public let expiresAt: String?
    }

    case send(Send)
    case inactive

    public var kind: Kind {
        switch self {
        case .send: .send
        case .inactive: .inactive
        }
    }

    public var status: Status? {
        guard case .send(let value) = self else { return nil }
        return value.status
    }

    public var expiresAt: String? {
        guard case .send(let value) = self else { return nil }
        return value.expiresAt
    }

    private enum CodingKeys: String, CodingKey {
        case kind
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .send:
            self = try .send(Send(from: decoder))
        case .inactive:
            self = .inactive
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .send(let value):
            try value.encode(to: encoder)
        case .inactive:
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(Kind.inactive, forKey: .kind)
        }
    }
}

public struct ApiAgentV2ResolvedAction: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case openReceive, openStaking, openSwap, reviewSend, openPortfolio, hideSpamAssets, inactive
        case openUrl, openToken, openTransaction, openAgent
        case openSend = "sendForm"
    }

    public struct StakeAmount: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable {
            case exact, all
        }

        public let kind: Kind
        public let value: String?
    }

    public enum AmountSide: String, Codable, Sendable {
        case source, destination
    }

    public struct SendReview: Codable, Equatable, Sendable {
        public let tokenSlug: String
        public let amountAtomic: String
        public let toAddress: String
        public let comment: String?
    }

    public let kind: Kind
    public let draftId: String?
    public let chain: String?
    public let tokenSlug: String?
    public let toAddress: String?
    public let review: SendReview?
    public let range: String?
    public let slugs: [String]?
    public let productId: String?
    public let stakeAmount: StakeAmount?
    public let tokenInSlug: String?
    public let tokenOutSlug: String?
    public let swapAmount: String?
    public let amountSide: AmountSide?
    public let url: String?
    public let slug: String?
    public let tokenAddress: String?
    public let transactionRef: String?
    public let entryPoint: ApiAgentV2EntryPoint?

    private enum CodingKeys: String, CodingKey {
        case kind, draftId, chain, tokenSlug, toAddress, review, range, slugs
        case productId, tokenInSlug, tokenOutSlug, amount, amountSide
        case url, slug, tokenAddress, transactionRef, entryPoint
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(Kind.self, forKey: .kind)
        draftId = try container.decodeIfPresent(String.self, forKey: .draftId)
        chain = try container.decodeIfPresent(String.self, forKey: .chain)
        tokenSlug = try container.decodeIfPresent(String.self, forKey: .tokenSlug)
        toAddress = try container.decodeIfPresent(String.self, forKey: .toAddress)
        review = try container.decodeIfPresent(SendReview.self, forKey: .review)
        range = try container.decodeIfPresent(String.self, forKey: .range)
        slugs = try container.decodeIfPresent([String].self, forKey: .slugs)
        productId = try container.decodeIfPresent(String.self, forKey: .productId)
        tokenInSlug = try container.decodeIfPresent(String.self, forKey: .tokenInSlug)
        tokenOutSlug = try container.decodeIfPresent(String.self, forKey: .tokenOutSlug)
        amountSide = try container.decodeIfPresent(AmountSide.self, forKey: .amountSide)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        slug = try container.decodeIfPresent(String.self, forKey: .slug)
        tokenAddress = try container.decodeIfPresent(String.self, forKey: .tokenAddress)
        transactionRef = try container.decodeIfPresent(String.self, forKey: .transactionRef)
        entryPoint = try container.decodeIfPresent(ApiAgentV2EntryPoint.self, forKey: .entryPoint)
        if kind == .openStaking {
            stakeAmount = try container.decodeIfPresent(StakeAmount.self, forKey: .amount)
            swapAmount = nil
        } else if kind == .openSwap {
            stakeAmount = nil
            swapAmount = try container.decodeIfPresent(String.self, forKey: .amount)
        } else {
            stakeAmount = nil
            swapAmount = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(draftId, forKey: .draftId)
        try container.encodeIfPresent(chain, forKey: .chain)
        try container.encodeIfPresent(tokenSlug, forKey: .tokenSlug)
        try container.encodeIfPresent(toAddress, forKey: .toAddress)
        try container.encodeIfPresent(review, forKey: .review)
        try container.encodeIfPresent(range, forKey: .range)
        try container.encodeIfPresent(slugs, forKey: .slugs)
        try container.encodeIfPresent(productId, forKey: .productId)
        try container.encodeIfPresent(tokenInSlug, forKey: .tokenInSlug)
        try container.encodeIfPresent(tokenOutSlug, forKey: .tokenOutSlug)
        try container.encodeIfPresent(amountSide, forKey: .amountSide)
        try container.encodeIfPresent(url, forKey: .url)
        try container.encodeIfPresent(slug, forKey: .slug)
        try container.encodeIfPresent(tokenAddress, forKey: .tokenAddress)
        try container.encodeIfPresent(transactionRef, forKey: .transactionRef)
        try container.encodeIfPresent(entryPoint, forKey: .entryPoint)
        if kind == .openStaking {
            try container.encodeIfPresent(stakeAmount, forKey: .amount)
        } else if kind == .openSwap {
            try container.encodeIfPresent(swapAmount, forKey: .amount)
        }
    }
}

public struct ApiAgentV2ClientUpdateEnvelope: Decodable, Sendable {
    public let type: ApiAgentV2UpdateType
    public let update: ApiAgentV2ClientUpdate
}

public struct ApiAgentV2PortfolioHistoryUpdate: Decodable, Sendable {
    public let type: ApiAgentV2UpdateType
    public let accountId: String
    public let baseCurrency: String
    public let range: ApiPriceHistoryPeriod
    public let fetchedAtSlot: Int
    public let netWorth: ApiPortfolioHistoryResponse
}

public struct ApiAgentV2AvailabilityState: Decodable, Equatable, Sendable {
    public enum State: String, Decodable, Equatable, Sendable {
        case available
        case capacityExhausted = "capacity_exhausted"
    }

    public let state: State
    public let resetAt: Double?

    public init(state: State, resetAt: Double? = nil) {
        self.state = state
        self.resetAt = resetAt
    }
}

public struct ApiAgentV2UserQuota: Decodable, Equatable, Sendable {
    public let limit: Int
    public let used: Int
    public let remaining: Int
    public let resetAt: String
}

public struct ApiAgentV2RunActivityEvent: Decodable, Equatable, Sendable {
    public enum Code: String, Decodable, Equatable, Sendable {
        case planning = "request.planning"
        case webSearching = "web.searching"
        case webReadingSources = "web.reading_sources"
        case marketData = "data.reading_market"
        case checkingFreshness = "analysis.checking_freshness"
        case computing = "analysis.computing"
        case writing = "answer.writing"
    }

    public enum Status: String, Decodable, Equatable, Sendable {
        case active, completed
    }

    public struct Detail: Decodable, Equatable, Sendable {
        public enum Kind: String, Decodable, Equatable, Sendable {
            case sourceCount = "source_count"
        }

        public let kind: Kind
        public let count: Int
    }

    public let protocolVersion: Int
    public let runId: String
    public let sequence: Int
    public let code: Code
    public let status: Status
    public let detail: Detail?
    public let createdAt: String?
}

public enum ApiAgentV2ClientUpdate: Decodable, Sendable {
    case runtimeReady(generation: Int)
    case runStarted(Bound, threadRevision: Int, inputMessageId: String?)
    case messageStarted(Bound, messageId: String, contentKind: ApiAgentV2ContentKind)
    case textDelta(Bound, messageId: String, delta: String)
    case messageContentEnded(Bound, messageId: String)
    case messageCompleted(
        Bound,
        messageId: String,
        finishReason: String,
        walletControls: ApiAgentV2WalletConversationControls?
    )
    case actionAvailable(Bound, messageId: String, action: ApiAgentV2ActionProposal)
    case followupsAvailable(Bound, messageId: String, items: [ApiAgentV2FollowUp])
    case inputContinuationsAvailable(Bound, messageId: String, items: [ApiAgentV2InputContinuation])
    case semanticContentAvailable(Bound, messageId: String, content: ApiAgentV2SemanticContent)
    case toolActivityChanged(
        Bound,
        toolCallId: String,
        toolName: String,
        operation: String?,
        status: String
    )
    case runActivityChanged(Bound, event: ApiAgentV2RunActivityEvent)
    case runFailed(
        Bound?,
        clientRunId: String,
        threadId: String?,
        messageId: String?,
        code: ApiAgentV2ErrorCode,
        retryable: Bool,
        resetAt: Double?
    )
    case runCancelled(Bound)
    case availabilityChanged(ApiAgentV2AvailabilityState)
    case userQuotaChanged(ApiAgentV2UserQuota?)
    case walletAuthorityChanged(threadId: String?)
    case walletContextChanged
    case threadChanged(threadId: String, thread: ApiAgentV2ThreadSummary)

    public struct Bound: Decodable, Equatable, Sendable {
        public let clientRunId: String
        public let runId: String
        public let threadId: String
    }

    private enum CodingKeys: String, CodingKey {
        case kind, generation, clientRunId, runId, threadId, threadRevision, messageId, inputMessageId, delta, finishReason, contentKind
        case action, items, content, code, retryable, resetAt, availability, quota, thread
        case toolCallId, toolName, operation, status, event
        case walletControls
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        func bound() throws -> Bound {
            try Bound(
                clientRunId: container.decode(String.self, forKey: .clientRunId),
                runId: container.decode(String.self, forKey: .runId),
                threadId: container.decode(String.self, forKey: .threadId)
            )
        }

        switch kind {
        case "runtimeReady":
            self = try .runtimeReady(generation: container.decode(Int.self, forKey: .generation))
        case "runStarted":
            self = try .runStarted(
                bound(),
                threadRevision: container.decode(Int.self, forKey: .threadRevision),
                inputMessageId: container.decodeIfPresent(String.self, forKey: .inputMessageId)
            )
        case "messageStarted":
            self = try .messageStarted(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                contentKind: container.decode(ApiAgentV2ContentKind.self, forKey: .contentKind)
            )
        case "textDelta":
            self = try .textDelta(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                delta: container.decode(String.self, forKey: .delta)
            )
        case "messageContentEnded":
            self = try .messageContentEnded(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId)
            )
        case "messageCompleted":
            self = try .messageCompleted(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                finishReason: container.decode(String.self, forKey: .finishReason),
                walletControls: container.decodeIfPresent(
                    ApiAgentV2WalletConversationControls.self,
                    forKey: .walletControls
                )
            )
        case "actionAvailable":
            self = try .actionAvailable(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                action: container.decode(ApiAgentV2ActionProposal.self, forKey: .action)
            )
        case "followupsAvailable":
            self = try .followupsAvailable(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                items: container.decodeAgentV2FollowUps(forKey: .items)
            )
        case "inputContinuationsAvailable":
            self = try .inputContinuationsAvailable(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                items: container.decode([ApiAgentV2InputContinuation].self, forKey: .items)
            )
        case "semanticContentAvailable":
            self = try .semanticContentAvailable(
                bound(),
                messageId: container.decode(String.self, forKey: .messageId),
                content: container.decode(ApiAgentV2SemanticContent.self, forKey: .content)
            )
        case "toolActivityChanged":
            self = try .toolActivityChanged(
                bound(),
                toolCallId: container.decode(String.self, forKey: .toolCallId),
                toolName: container.decode(String.self, forKey: .toolName),
                operation: container.decodeIfPresent(String.self, forKey: .operation),
                status: container.decode(String.self, forKey: .status)
            )
        case "runActivityChanged":
            self = try .runActivityChanged(
                bound(),
                event: container.decode(ApiAgentV2RunActivityEvent.self, forKey: .event)
            )
        case "runFailed":
            let clientRunId = try container.decode(String.self, forKey: .clientRunId)
            let runId = try container.decodeIfPresent(String.self, forKey: .runId)
            let threadId = try container.decodeIfPresent(String.self, forKey: .threadId)
            let binding = runId.flatMap { runId in threadId.map { Bound(clientRunId: clientRunId, runId: runId, threadId: $0) } }
            self = try .runFailed(
                binding,
                clientRunId: clientRunId,
                threadId: threadId,
                messageId: container.decodeIfPresent(String.self, forKey: .messageId),
                code: container.decode(ApiAgentV2ErrorCode.self, forKey: .code),
                retryable: container.decode(Bool.self, forKey: .retryable),
                resetAt: container.decodeIfPresent(Double.self, forKey: .resetAt)
            )
        case "runCancelled":
            self = try .runCancelled(bound())
        case "availabilityChanged":
            self = try .availabilityChanged(
                container.decode(ApiAgentV2AvailabilityState.self, forKey: .availability)
            )
        case "userQuotaChanged":
            self = try .userQuotaChanged(
                container.decodeIfPresent(ApiAgentV2UserQuota.self, forKey: .quota)
            )
        case "walletAuthorityChanged":
            self = try .walletAuthorityChanged(
                threadId: container.decodeIfPresent(String.self, forKey: .threadId)
            )
        case "walletContextChanged":
            self = .walletContextChanged
        case "threadChanged":
            self = try .threadChanged(
                threadId: container.decode(String.self, forKey: .threadId),
                thread: container.decode(ApiAgentV2ThreadSummary.self, forKey: .thread)
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unsupported Agent V2 update")
        }
    }
}
