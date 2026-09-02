import Foundation
import WalletContext
import WalletCore

enum AgentV2Copy {
    private enum AnalysisFailure: String {
        case planningUnavailable = "planning_unavailable"
        case sourceUnavailable = "source_unavailable"
        case staleEvidence = "stale_evidence"
        case inconsistentSnapshot = "inconsistent_snapshot"
        case computeFailed = "compute_failed"
        case deadlineExceeded = "deadline_exceeded"
        case resultTooLarge = "result_too_large"
        case answerGenerationFailed = "answer_generation_failed"
    }

    private enum ReceiveFailure: String {
        case planningUnavailable = "planning_unavailable"
        case activeAccountUnavailable = "active_account_unavailable"
        case clientReceiveUnavailable = "client_receive_unavailable"
        case chainUnsupported = "chain_unsupported"
        case activeNetworkMismatch = "active_network_mismatch"
    }

    struct Prompt {
        let title: String
        let prompt: String
    }

    static func hint(_ id: ApiAgentV2StarterHint.ID) -> Prompt {
        switch id {
        case .portfolioPerformance: Prompt(title: lang("$agent_hint_portfolio_title"), prompt: lang("$agent_hint_portfolio_prompt"))
        case .learnSwap: Prompt(title: lang("$agent_hint_swap_title"), prompt: lang("$agent_hint_swap_prompt"))
        case .learnStaking: Prompt(title: lang("$agent_hint_staking_title"), prompt: lang("$agent_hint_staking_prompt"))
        case .learnSecurity: Prompt(title: lang("$agent_hint_security_title"), prompt: lang("$agent_hint_security_prompt"))
        case .receiveTokens: Prompt(title: lang("$agent_hint_receive_title"), prompt: lang("$agent_hint_receive_prompt"))
        }
    }

    static func action(_ code: ApiAgentV2ActionLabelCode) -> String {
        switch code {
        case .reviewTransfer: lang("$agent_action_review_transfer")
        case .openReceive: lang("$agent_action_open_receive")
        case .openSend: lang("$agent_action_open_send")
        case .hideSpamAssets: lang("$agent_action_hide_spam")
        case .openExternalLink: lang("$agent_action_open_link")
        case .openAgent: lang("$agent_action_open_agent")
        case .openToken: lang("$agent_action_open_token")
        case .openTransaction: lang("$agent_action_open_transaction")
        case .openStaking: lang("$agent_action_open_staking")
        case .openSwap: lang("$agent_action_open_swap")
        }
    }

    static func inputContinuation(_ code: ApiAgentV2InputContinuationCode) -> String {
        switch code {
        case .assetSearchAsset, .marketInsightAsset, .marketQuoteAsset, .prepareSendAsset,
             .prepareSwapDestinationAsset, .prepareSwapSourceAsset: lang("$agent_input_asset")
        case .marketInsightTimeframe: lang("$agent_input_timeframe")
        case .prepareSendAmount, .prepareSwapAmount: lang("$agent_input_amount")
        case .prepareSendRecipient: lang("$agent_input_recipient")
        case .prepareSwapDirection: lang("$agent_input_swap_details")
        }
    }

    static func runActivity(_ event: ApiAgentV2RunActivityEvent) -> String {
        if event.status == .completed {
            if event.code == .webReadingSources, let count = event.detail?.count {
                return L10n.agentActivityWebReadingSourcesCompleted(count: count)
            }
            return switch event.code {
            case .planning: lang("$agent_activity_planning_completed")
            case .webSearching: lang("$agent_activity_web_searching_completed")
            case .webReadingSources: lang("$agent_activity_web_reading_sources_completed_generic")
            case .marketData: lang("$agent_activity_market_data_completed")
            case .checkingFreshness: lang("$agent_activity_checking_freshness_completed")
            case .computing: lang("$agent_activity_computing_completed")
            case .writing: lang("$agent_activity_writing_completed")
            }
        }

        return switch event.code {
        case .planning: lang("$agent_activity_planning")
        case .webSearching: lang("$agent_activity_web_searching")
        case .webReadingSources: lang("$agent_activity_web_reading_sources")
        case .marketData: lang("$agent_activity_market_data")
        case .checkingFreshness: lang("$agent_activity_checking_freshness")
        case .computing: lang("$agent_activity_computing")
        case .writing: lang("$agent_activity_writing")
        }
    }

    static func notice(_ notice: ApiAgentV2NoticeContent) -> String {
        if notice.code == .analysisUnavailable, let text = analysisNotice(notice.arguments) {
            return text
        }
        if notice.code == .marketQuote, let marketQuote = notice.marketQuote {
            return marketQuoteNotice(marketQuote)
        }
        if notice.code == .receiveUnavailable, let text = receiveNotice(notice.arguments) {
            return text
        }
        if let text = actionNotice(notice) {
            return text
        }
        if let text = sendNotice(notice) {
            return text
        }
        return self.notice(notice.code)
    }

    static func notice(_ code: ApiAgentV2NoticeContent.Code) -> String {
        switch code {
        case .agentUnavailable: lang("$agent_notice_agent_unavailable")
        case .analysisUnavailable: lang("$agent_notice_analysis_unavailable")
        case .assetNotFound: lang("$agent_notice_asset_not_found")
        case .clarificationRequired: lang("$agent_notice_clarification_required")
        case .consentRequired: lang("$agent_notice_consent_required")
        case .contentOverBudget: lang("$agent_notice_content_over_budget")
        case .emptyResult: lang("$agent_notice_empty_result")
        case .marketAnalysisAssetUnsupported: lang("$agent_notice_market_analysis_asset_unsupported")
        case .marketAnalysisTimeframeUnsupported: lang("$agent_notice_market_analysis_timeframe_unsupported")
        case .marketAnalysisUnavailable: lang("$agent_notice_market_analysis_unavailable")
        case .marketDataUnavailable: lang("$agent_notice_market_unavailable")
        case .marketQuote: lang("$agent_notice_market_quote_unavailable")
        case .portfolioUnavailable: lang("$agent_notice_portfolio_unavailable")
        case .receiveDetailsRequired: lang("$agent_notice_receive_details_required")
        case .receiveReady: lang("$agent_notice_receive_ready")
        case .receiveUnavailable: lang("$agent_notice_receive_unavailable")
        case .retryRequired: lang("$agent_notice_retry_required")
        case .sendDetailsRequired: lang("$agent_notice_send_details_required")
        case .sendFormAmountRequired: lang("$agent_notice_send_form_amount_required")
        case .sendReady: lang("$agent_notice_send_ready")
        case .sendUnavailable: lang("$agent_notice_send_unavailable")
        case .stakingReady: lang("$agent_notice_staking_ready")
        case .stakingUnavailable: lang("$agent_notice_staking_unavailable")
        case .swapDetailsRequired: lang("$agent_notice_swap_details_direction")
        case .swapReady, .swapUnavailable: lang("$agent_notice_swap_unavailable")
        case .toolUnavailable: lang("$agent_notice_tool_unavailable")
        case .walletDataUnavailable: lang("$agent_notice_wallet_unavailable")
        case .walletFilterAmbiguous: lang("$agent_notice_wallet_filter_ambiguous")
        case .webSearchUnavailable: lang("$agent_notice_web_unavailable")
        }
    }

    private static func actionNotice(_ notice: ApiAgentV2NoticeContent) -> String? {
        guard case .object(let arguments)? = notice.arguments else { return nil }
        switch notice.code {
        case .stakingUnavailable:
            guard case .string(let failure)? = arguments["stakeFailure"] else { return nil }
            return switch failure {
            case "planning_unavailable": lang("$agent_notice_staking_planning_unavailable")
            case "active_account_unavailable": lang("$agent_notice_staking_active_account_unavailable")
            case "view_only_staking_forbidden": lang("$agent_notice_staking_view_only")
            case "client_staking_unavailable": lang("$agent_notice_staking_client_unavailable")
            case "asset_unavailable": lang("$agent_notice_staking_asset_unavailable")
            case "amount_invalid": lang("$agent_notice_staking_amount_invalid")
            case "wallet_context_changed": lang("$agent_notice_staking_wallet_context_changed")
            default: nil
            }
        case .swapDetailsRequired:
            guard case .object(let details)? = arguments["swapDetails"],
                  case .string(let field)? = details["field"]
            else { return nil }
            return switch field {
            case "source_asset": lang("$agent_notice_swap_details_source_asset")
            case "destination_asset": lang("$agent_notice_swap_details_destination_asset")
            case "amount": lang("$agent_notice_swap_details_amount")
            case "direction": lang("$agent_notice_swap_details_direction")
            default: nil
            }
        case .swapReady:
            guard case .object(let ready)? = arguments["swapReady"],
                  case .object(let sourceAsset)? = ready["sourceAsset"],
                  case .string(let sourceSymbol)? = sourceAsset["symbol"],
                  case .object(let destinationAsset)? = ready["destinationAsset"],
                  case .string(let destinationSymbol)? = destinationAsset["symbol"],
                  case .object(let quote)? = ready["quote"]
            else { return nil }
            if case .string("resolved")? = quote["status"],
               case .object(let from)? = quote["from"],
               case .string(let fromValue)? = from["value"],
               case .string(let fromSymbol)? = from["symbol"],
               case .object(let to)? = quote["to"],
               case .string(let toValue)? = to["value"],
               case .string(let toSymbol)? = to["symbol"] {
                return L10n.agentNoticeSwapReadyIndicative(
                    fromAmount: fromValue,
                    fromSymbol: fromSymbol,
                    toAmount: toValue,
                    toSymbol: toSymbol
                )
            }
            return L10n.agentNoticeSwapReadyPriceUnavailable(
                fromSymbol: sourceSymbol,
                toSymbol: destinationSymbol
            )
        case .swapUnavailable:
            guard case .string(let failure)? = arguments["swapFailure"] else { return nil }
            return switch failure {
            case "planning_unavailable": lang("$agent_notice_swap_planning_unavailable")
            case "active_account_unavailable": lang("$agent_notice_swap_active_account_unavailable")
            case "view_only_swap_forbidden": lang("$agent_notice_swap_view_only")
            case "client_swap_unavailable": lang("$agent_notice_swap_client_unavailable")
            case "wallet_context_changed": lang("$agent_notice_swap_wallet_context_changed")
            case "tool_timeout": lang("$agent_notice_swap_timeout")
            case "tool_failed": lang("$agent_notice_swap_tool_failed")
            case "invalid_tool_result": lang("$agent_notice_swap_invalid_result")
            default: nil
            }
        default:
            return nil
        }
    }

    private static func analysisNotice(_ value: ApiAgentV2JSONValue?) -> String? {
        guard case .object(let arguments)? = value,
              case .string(let rawFailure)? = arguments["analysisFailure"],
              let failure = AnalysisFailure(rawValue: rawFailure)
        else { return nil }

        return switch failure {
        case .planningUnavailable: lang("$agent_notice_analysis_planning_unavailable")
        case .sourceUnavailable: lang("$agent_notice_analysis_source_unavailable")
        case .staleEvidence: lang("$agent_notice_analysis_stale_evidence")
        case .inconsistentSnapshot: lang("$agent_notice_analysis_inconsistent_snapshot")
        case .computeFailed: lang("$agent_notice_analysis_compute_failed")
        case .deadlineExceeded: lang("$agent_notice_analysis_deadline_exceeded")
        case .resultTooLarge: lang("$agent_notice_analysis_result_too_large")
        case .answerGenerationFailed: lang("$agent_notice_analysis_answer_generation_failed")
        }
    }

    private static func marketQuoteNotice(_ quote: ApiAgentV2MarketQuoteNotice) -> String {
        switch quote.status {
        case .resolved:
            guard let asset = quote.asset,
                  let price = quote.price,
                  let quoteCurrency = quote.quoteCurrency,
                  let percentChange24h = quote.percentChange24h
            else { return lang("$agent_notice_market_quote_invalid_result") }
            return L10n.agentNoticeMarketQuoteResolved(
                asset: marketQuoteAsset(asset),
                price: marketQuoteNumber(price, maximumFractionDigits: marketQuotePricePrecision(price)),
                currency: quoteCurrency,
                change: marketQuoteChange(percentChange24h)
            )
        case .priceUnavailable:
            guard let asset = quote.asset else { return lang("$agent_notice_market_quote_invalid_result") }
            return L10n.agentNoticeMarketQuotePriceUnavailable(asset: marketQuoteAsset(asset))
        case .ambiguous:
            guard let candidates = quote.candidates else { return lang("$agent_notice_market_quote_invalid_result") }
            let labels = candidates.map {
                "\(marketQuoteAsset($0)) — \(marketQuoteNetwork($0.chain))"
            }.joined(separator: ", ")
            return L10n.agentNoticeMarketQuoteAmbiguous(assets: labels)
        case .notFound:
            return lang("$agent_notice_market_quote_not_found")
        case .unavailable:
            guard let reason = quote.reason else { return lang("$agent_notice_market_quote_invalid_result") }
            return marketQuoteFailure(reason)
        }
    }

    private static func marketQuoteFailure(_ reason: ApiAgentV2MarketQuoteNotice.UnavailableReason) -> String {
        switch reason {
        case .planningUnavailable: lang("$agent_notice_market_quote_planning_unavailable")
        case .capabilityUnavailable: lang("$agent_notice_market_quote_capability_unavailable")
        case .walletContextUnavailable: lang("$agent_notice_market_quote_wallet_context_unavailable")
        case .quoteCurrencyUnsupported: lang("$agent_notice_market_quote_currency_unsupported")
        case .quoteUnavailable: lang("$agent_notice_market_quote_unavailable")
        case .walletContextChanged: lang("$agent_notice_market_quote_wallet_context_changed")
        case .toolTimeout: lang("$agent_notice_market_quote_timeout")
        case .toolFailed: lang("$agent_notice_market_quote_tool_failed")
        case .invalidResult: lang("$agent_notice_market_quote_invalid_result")
        case .cancelled: lang("$agent_notice_market_quote_cancelled")
        }
    }

    static func marketQuoteAsset(_ asset: ApiAgentV2SemanticAsset) -> String {
        let symbol = normalizedMarketQuoteLabel(asset.symbol) ?? "Asset"
        guard let name = normalizedMarketQuoteLabel(asset.name),
              name.caseInsensitiveCompare(symbol) != .orderedSame
        else { return symbol }
        return "\(name) (\(symbol))"
    }

    private static func normalizedMarketQuoteLabel(_ value: String?) -> String? {
        guard let value else { return nil }
        let normalized = value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return normalized.isEmpty ? nil : normalized
    }

    private static func marketQuoteNetwork(_ rawValue: String) -> String {
        ApiChain(rawValue: rawValue)?.title ?? rawValue.uppercased()
    }

    private static func marketQuotePricePrecision(_ rawValue: String) -> Int {
        guard let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")) else { return 8 }
        let magnitude = value < 0 ? -value : value
        if magnitude >= 1 { return 2 }
        if magnitude >= 0.01 { return 4 }
        if magnitude >= 0.0001 { return 6 }
        return 8
    }

    private static func marketQuoteNumber(_ rawValue: String, maximumFractionDigits: Int) -> String {
        guard let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")) else {
            return rawValue
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = LocalizationSupport.shared.locale
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = maximumFractionDigits
        return formatter.string(from: value as NSDecimalNumber) ?? rawValue
    }

    private static func marketQuoteChange(_ rawValue: String) -> String {
        guard let value = Decimal(string: rawValue, locale: Locale(identifier: "en_US_POSIX")) else {
            return rawValue.hasPrefix("-") ? rawValue : "+\(rawValue)"
        }
        let sign = value > 0 ? "+" : value < 0 ? "-" : ""
        let magnitude = value < 0 ? -value : value
        return sign + marketQuoteNumber(String(describing: magnitude), maximumFractionDigits: 2)
    }

    private static func receiveNotice(_ value: ApiAgentV2JSONValue?) -> String? {
        guard case .object(let arguments)? = value,
              case .string(let rawFailure)? = arguments["receiveFailure"],
              let failure = ReceiveFailure(rawValue: rawFailure)
        else { return nil }

        switch failure {
        case .planningUnavailable:
            return lang("$agent_notice_receive_planning_unavailable")
        case .activeAccountUnavailable:
            return lang("$agent_notice_receive_active_account_unavailable")
        case .clientReceiveUnavailable:
            return lang("$agent_notice_receive_client_unavailable")
        case .chainUnsupported, .activeNetworkMismatch:
            guard let requestedChain = receiveChain(arguments["requestedChain"]),
                  let activeChain = receiveChain(arguments["activeChain"])
            else { return nil }
            if failure == .chainUnsupported {
                return L10n.agentNoticeReceiveChainUnsupported(requestedNetwork: requestedChain.title, activeNetwork: activeChain.title)
            }
            return L10n.agentNoticeReceiveActiveNetworkMismatch(activeNetwork: activeChain.title, requestedNetwork: requestedChain.title)
        }
    }

    private static func receiveChain(_ value: ApiAgentV2JSONValue?) -> ApiChain? {
        guard case .string(let rawValue)? = value,
              (1...32).contains(rawValue.count),
              let chain = ApiChain(rawValue: rawValue),
              chain.isSupported
        else { return nil }
        return chain
    }

    private static func sendNotice(_ notice: ApiAgentV2NoticeContent) -> String? {
        guard case .object(let arguments)? = notice.arguments else { return nil }
        switch notice.code {
        case .sendDetailsRequired:
            guard case .array(let values)? = arguments["fields"] else { return nil }
            let texts = values.compactMap { value -> String? in
                guard case .string(let field) = value else { return nil }
                switch field {
                case "amount": return lang("$agent_notice_send_missing_amount")
                case "asset": return lang("$agent_notice_send_missing_asset")
                case "recipient": return lang("$agent_notice_send_missing_recipient")
                default: return nil
                }
            }
            return texts.isEmpty ? nil : texts.joined(separator: "\n\n")
        case .sendReady:
            guard case .object(let asset)? = arguments["asset"],
                  case .string(let symbol)? = asset["symbol"],
                  (1...32).contains(symbol.count)
            else { return nil }
            return L10n.agentNoticeSendReadyInferredAsset(symbol: symbol)
        case .sendUnavailable:
            guard case .string(let failure)? = arguments["sendFailure"],
                  failure == "no_sendable_balance"
            else { return nil }
            return lang("$agent_notice_send_no_sendable_balance")
        default:
            return nil
        }
    }

    static func semanticRow(_ code: String) -> String {
        switch code {
        case "pending", "pendingTrusted": lang("$agent_semantic_pending")
        case "confirmed": lang("$agent_semantic_confirmed")
        case "completed": lang("$agent_semantic_completed")
        case "failed": lang("$agent_semantic_failed")
        case "expired": lang("$agent_semantic_expired")
        case "active": lang("$agent_semantic_active")
        case "unstaking": lang("$agent_semantic_unstaking")
        case "ready": lang("$agent_semantic_ready")
        case "frozen": lang("$agent_semantic_frozen")
        case "locked": lang("$agent_semantic_locked")
        case "fungible": lang("$agent_semantic_fungible")
        case "nft": lang("$agent_semantic_nft")
        case "staking": lang("$agent_semantic_staking")
        case "vesting": lang("$agent_semantic_vesting")
        case "vault": lang("$agent_semantic_vault")
        case "transfer": lang("$agent_semantic_transfer")
        case "swap": lang("$agent_semantic_swap")
        case "stake": lang("$agent_semantic_stake")
        case "unstake": lang("$agent_semantic_unstake")
        case "contract": lang("$agent_semantic_contract")
        default: lang("$agent_semantic_unknown")
        }
    }

    static func error(_ code: ApiAgentV2ErrorCode) -> String {
        switch code {
        case .clientUpdateRequired:
            lang("$agent_error_update_required")
        case .deviceTokenMissing, .deviceTokenInvalid, .deviceTokenExpired, .profileIdInvalid, .profileDeleted:
            lang("$agent_error_session")
        case .rateLimited, .userQuotaExhausted, .agentCapacityExhausted, .runBudgetExceeded,
             .outputLimitReached, .contextTooLargeRetryable, .deviceTokenRateLimited:
            lang("$agent_error_limit")
        case .toolUnsupported, .toolScopeMismatch, .toolResultAlreadySubmitted, .toolRejected,
             .walletContextChanged, .toolTimeout, .toolFailed, .toolResultTooLarge, .actionUnsupported:
            lang("$agent_error_tool")
        case .marketDataUnavailable:
            lang("$agent_notice_market_unavailable")
        case .networkError, .providerTimeout, .providerUnavailable:
            lang("$agent_connection_interrupted")
        case .invalidRequest, .invalidEvent, .deviceIdInvalid, .idempotencyMismatch,
             .threadRevisionConflict, .threadNotFound, .threadRunInProgress, .runNotFound,
             .runInterrupted, .runReplayExpired, .messageNotFound, .messageNotEditable,
             .regenerateTargetInvalid, .followupReferenceInvalid, .inputContinuationReferenceInvalid,
             .feedbackTargetInvalid, .feedbackRevisionConflict, .providerCapabilityUnavailable,
             .providerError, .emptyResponse, .internalError:
            lang("$agent_error_generic")
        }
    }
}
