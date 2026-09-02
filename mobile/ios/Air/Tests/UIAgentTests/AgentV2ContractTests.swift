import XCTest
@testable import UIAgent
import WalletContext
@testable import WalletCore

final class AgentV2ContractTests: XCTestCase {
    func testDecodesHostContextUpdateResult() throws {
        let result = try JSONDecoder().decode(
            ApiAgentV2MutationResult<ApiAgentV2HostContextUpdate>.self,
            from: Data(#"{"ok":true,"value":{"authorityChanged":true,"generation":7}}"#.utf8)
        )

        XCTAssertTrue(result.ok)
        XCTAssertEqual(result.value?.authorityChanged, true)
        XCTAssertEqual(result.value?.generation, 7)
        XCTAssertNil(result.error)
    }

    @MainActor
    func testAgentSearchPreviewStripsMarkdownFormatting() {
        XCTAssertEqual(
            AgentStore.searchPreviewText("I am **My Wallet** with a [guide](https://mywallet.io)."),
            "I am My Wallet with a guide."
        )
    }

    func testDecodesModelOwnedFollowUpCopy() throws {
        let payloads = [
            (#"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Explain market analysis."}"#, "Explain market analysis."),
            (#"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Объясни анализ рынка."}"#, "Объясни анализ рынка."),
            (#"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}"#, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
        ]

        for (payload, text) in payloads {
            let followup = try JSONDecoder().decode(ApiAgentV2FollowUp.self, from: Data(payload.utf8))
            XCTAssertEqual(followup.kind, "suggested_prompt")
            XCTAssertEqual(followup.text, text)
        }
    }

    func testRejectsInvalidModelOwnedFollowUpCopy() {
        let overlongText = String(repeating: "x", count: 81)
        let payloads = [
            #"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"deterministic","code":"prepare_send","intent":"prepare_candidate"}"#,
            #"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":" Detailed analysis"}"#,
            #"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Explain\nthis market analysis."}"#,
            #"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"**Detailed analysis**"}"#,
            #"{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"\#(overlongText)"}"#,
        ]

        for payload in payloads {
            XCTAssertThrowsError(
                try JSONDecoder().decode(ApiAgentV2FollowUp.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testFiltersInvalidFollowUpsWithoutDroppingPersistedMessage() throws {
        let json = #"{"id":"11111111-1111-4111-8111-111111111111","threadId":"22222222-2222-4222-8222-222222222222","role":"assistant","status":"complete","content":{"kind":"markdown","text":"Still readable"},"createdAt":"2026-08-27T00:00:00.000Z","followups":[{"id":"33333333-3333-4333-8333-333333333333","kind":"deterministic","code":"prepare_send","intent":"prepare_candidate"},{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Help me prepare a transfer."},{"id":"44444444-4444-4444-8444-444444444444","kind":"suggested_prompt","text":"**Invalid**"}]}"#
        let message = try JSONDecoder().decode(ApiAgentV2PersistedMessage.self, from: Data(json.utf8))

        XCTAssertEqual(message.followups?.map(\.text), ["Help me prepare a transfer."])
        guard case .some(.markdown(let text)) = message.content else {
            return XCTFail("Expected persisted Markdown body")
        }
        XCTAssertEqual(text, "Still readable")
    }

    func testFiltersInvalidFollowUpsFromClientUpdate() throws {
        let json = #"{"kind":"followupsAvailable","clientRunId":"11111111-1111-4111-8111-111111111111","runId":"22222222-2222-4222-8222-222222222222","threadId":"33333333-3333-4333-8333-333333333333","messageId":"44444444-4444-4444-8444-444444444444","items":[{"id":"55555555-5555-4555-8555-555555555555","kind":"deterministic","code":"prepare_send","intent":"prepare_candidate"},{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Help me prepare a transfer."}]}"#
        let update = try JSONDecoder().decode(ApiAgentV2ClientUpdate.self, from: Data(json.utf8))

        guard case .followupsAvailable(_, _, let items) = update else {
            return XCTFail("Expected follow-up update")
        }
        XCTAssertEqual(items.map(\.text), ["Help me prepare a transfer."])
    }

    func testCapsClientFollowUpsWithoutDroppingValidItems() throws {
        let json = #"{"kind":"followupsAvailable","clientRunId":"11111111-1111-4111-8111-111111111111","runId":"22222222-2222-4222-8222-222222222222","threadId":"33333333-3333-4333-8333-333333333333","messageId":"44444444-4444-4444-8444-444444444444","items":[{"id":"55555555-5555-4555-8555-555555555555","kind":"deterministic"},{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"First prompt."},{"id":"adadadad-adad-4dad-8dad-adadadadadad","kind":"suggested_prompt","text":"Duplicate id."},{"id":"bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd","kind":"suggested_prompt","text":"Second prompt."},{"id":"cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd","kind":"suggested_prompt","text":"Third prompt."},{"id":"dededede-dede-4ede-8ede-dededededede","kind":"suggested_prompt","text":"Fourth prompt."}]}"#
        let update = try JSONDecoder().decode(ApiAgentV2ClientUpdate.self, from: Data(json.utf8))

        guard case .followupsAvailable(_, _, let items) = update else {
            return XCTFail("Expected follow-up update")
        }
        XCTAssertEqual(items.map(\.text), ["First prompt.", "Second prompt.", "Third prompt."])
    }

    func testDecodesMessageContentEndIndependentlyFromRunCompletion() throws {
        let json = #"{"kind":"messageContentEnded","clientRunId":"11111111-1111-4111-8111-111111111111","runId":"22222222-2222-4222-8222-222222222222","threadId":"33333333-3333-4333-8333-333333333333","messageId":"44444444-4444-4444-8444-444444444444"}"#
        let update = try JSONDecoder().decode(ApiAgentV2ClientUpdate.self, from: Data(json.utf8))

        guard case .messageContentEnded(_, let messageId) = update else {
            return XCTFail("Expected message content end update")
        }
        XCTAssertEqual(messageId, "44444444-4444-4444-8444-444444444444")
    }

    func testMarketAnalysisUnavailableNoticeUsesTypedLocalizedCopy() throws {
        let notice = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_analysis_unavailable"}"#.utf8)
        )

        XCTAssertEqual(notice.code, .marketAnalysisUnavailable)
        XCTAssertEqual(AgentV2Copy.notice(notice), lang("$agent_notice_market_analysis_unavailable"))
    }

    func testCurrentCanonicalNoticeCodesDecodeAsSupportedSemanticContent() throws {
        let payloads = [
            #"{"kind":"notice","schemaVersion":1,"code":"analysis_unavailable","arguments":{"analysisFailure":"planning_unavailable"}}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"receive_details_required","arguments":{"receiveFields":["asset","network"]}}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"send_form_amount_required"}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"staking_ready"}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"staking_unavailable","arguments":{"stakeFailure":"planning_unavailable"}}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"swap_details_required","arguments":{"swapDetails":{"field":"direction"}}}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"swap_ready","arguments":{"swapReady":{"sourceAsset":{"slug":"toncoin","chain":"ton","symbol":"TON"},"destinationAsset":{"slug":"usdton","chain":"ton","symbol":"USDT"},"amount":{"value":"1","valueType":"decimal","side":"source"},"quote":{"status":"unavailable","reason":"price_unavailable","observedAt":"2026-08-24T00:00:00.000Z"}}}}"#,
            #"{"kind":"notice","schemaVersion":1,"code":"swap_unavailable","arguments":{"swapFailure":"planning_unavailable"}}"#,
        ]

        for payload in payloads {
            let content = try JSONDecoder().decode(
                ApiAgentV2SemanticContent.self,
                from: Data(payload.utf8)
            )
            guard case .notice(let notice) = content else {
                XCTFail("Canonical notice decoded as unsupported: \(payload)")
                continue
            }
            XCTAssertFalse(AgentV2Copy.notice(notice).isEmpty)
            XCTAssertNotEqual(AgentV2Copy.notice(notice), lang("$agent_semantic_update_required"))
        }
    }

    func testAnalysisUnavailableUsesTheSpecificLocalizedFailureCopy() throws {
        let notice = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"analysis_unavailable","arguments":{"analysisFailure":"planning_unavailable"}}"#.utf8)
        )

        XCTAssertEqual(
            AgentV2Copy.notice(notice),
            lang("$agent_notice_analysis_planning_unavailable")
        )
    }

    func testCurrentActionNoticesUseArgumentSpecificLocalizedCopy() throws {
        let staking = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"staking_unavailable","arguments":{"stakeFailure":"planning_unavailable"}}"#.utf8)
        )
        XCTAssertEqual(
            AgentV2Copy.notice(staking),
            lang("$agent_notice_staking_planning_unavailable")
        )

        let swapDetails = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"swap_details_required","arguments":{"swapDetails":{"field":"direction"}}}"#.utf8)
        )
        XCTAssertEqual(
            AgentV2Copy.notice(swapDetails),
            lang("$agent_notice_swap_details_direction")
        )

        let swapReady = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"swap_ready","arguments":{"swapReady":{"sourceAsset":{"slug":"toncoin","chain":"ton","symbol":"TON"},"destinationAsset":{"slug":"usdton","chain":"ton","symbol":"USDT"},"amount":{"value":"1","valueType":"decimal","side":"source"},"quote":{"status":"unavailable","reason":"price_unavailable","observedAt":"2026-08-24T00:00:00.000Z"}}}}"#.utf8)
        )
        XCTAssertEqual(
            AgentV2Copy.notice(swapReady),
            L10n.agentNoticeSwapReadyPriceUnavailable(fromSymbol: "TON", toSymbol: "USDT")
        )

        let swapUnavailable = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"swap_unavailable","arguments":{"swapFailure":"planning_unavailable"}}"#.utf8)
        )
        XCTAssertEqual(
            AgentV2Copy.notice(swapUnavailable),
            lang("$agent_notice_swap_planning_unavailable")
        )
    }

    func testMarketAnalysisAssetUnsupportedNoticeUsesTypedLocalizedCopy() throws {
        let notice = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_analysis_asset_unsupported"}"#.utf8)
        )

        XCTAssertEqual(notice.code, .marketAnalysisAssetUnsupported)
        XCTAssertEqual(
            AgentV2Copy.notice(notice),
            lang("$agent_notice_market_analysis_asset_unsupported")
        )
    }

    func testReceiveNetworkNoticeUsesTypedArgumentsAndFallsBackSafely() throws {
        let unsupported = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"receive_unavailable","arguments":{"receiveFailure":"chain_unsupported","requestedChain":"tron","activeChain":"ton","futureDisplay":{"emphasis":"network"}}}"#.utf8)
        )
        let unsupportedText = AgentV2Copy.notice(unsupported)
        XCTAssertNotEqual(unsupportedText, AgentV2Copy.notice(.receiveUnavailable))

        let incomplete = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"receive_unavailable","arguments":{"receiveFailure":"active_network_mismatch","requestedChain":"tron"}}"#.utf8)
        )
        XCTAssertEqual(AgentV2Copy.notice(incomplete), AgentV2Copy.notice(.receiveUnavailable))

        let unknown = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"receive_unavailable","arguments":{"receiveFailure":"future_reason","requestedChain":"tron","activeChain":"ton"}}"#.utf8)
        )
        XCTAssertEqual(AgentV2Copy.notice(unknown), AgentV2Copy.notice(.receiveUnavailable))
    }

    func testSendNoticesUseSpecificHumanCopyAndInferredAsset() throws {
        let missingAsset = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"send_details_required","arguments":{"fields":["asset"]}}"#.utf8)
        )
        XCTAssertEqual(AgentV2Copy.notice(missingAsset), lang("$agent_notice_send_missing_asset"))

        let inferred = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"send_ready","arguments":{"asset":{"slug":"gram","chain":"ton","symbol":"GRAM","name":"Gram"}}}"#.utf8)
        )
        let inferredCopy = AgentV2Copy.notice(inferred)
        if inferredCopy != "$agent_notice_send_ready_inferred_asset" {
            XCTAssertTrue(inferredCopy.contains("GRAM"), inferredCopy)
        }

        let empty = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"send_unavailable","arguments":{"sendFailure":"no_sendable_balance"}}"#.utf8)
        )
        XCTAssertEqual(AgentV2Copy.notice(empty), lang("$agent_notice_send_no_sendable_balance"))
    }

    func testMarketQuoteNoticeDecodesClosedStatesAndLocalizedCopy() throws {
        let resolved = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"resolved","asset":{"slug":"gram","chain":"ton","symbol":"GRAM","name":"Gram **[literal]**"},"price":"0.004321","quoteCurrency":"USD","percentChange24h":"1.25","asOf":"2026-08-16T12:00:00.000Z","futureDisplay":"ignored"}}}"#.utf8)
        )
        XCTAssertEqual(resolved.marketQuote?.status, .resolved)
        XCTAssertEqual(
            AgentV2Copy.marketQuoteAsset(try XCTUnwrap(resolved.marketQuote?.asset)),
            "Gram **[literal]** (GRAM)"
        )
        let resolvedCopy = AgentV2Copy.notice(resolved)
        if resolvedCopy != "$agent_notice_market_quote_resolved" {
            XCTAssertTrue(resolvedCopy.contains("Gram **[literal]** (GRAM)"), resolvedCopy)
            XCTAssertTrue(resolvedCopy.contains("+1"), resolvedCopy)
        }

        let ambiguous = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"ambiguous","candidates":[{"slug":"gram-ton","chain":"ton","symbol":"GRAM"},{"slug":"gram-eth","chain":"eth","symbol":"GRAM"}],"hasMore":true,"asOf":"2026-08-16T12:00:00.000Z"}}}"#.utf8)
        )
        XCTAssertEqual(ambiguous.marketQuote?.candidates?.count, 2)
        let ambiguousCopy = AgentV2Copy.notice(ambiguous)
        if ambiguousCopy != "$agent_notice_market_quote_ambiguous" {
            XCTAssertTrue(ambiguousCopy.contains("GRAM"), ambiguousCopy)
        }

        let priceUnavailable = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"price_unavailable","asset":{"slug":"gram","chain":"ton","symbol":"GRAM"},"asOf":"2026-08-16T12:00:00.000Z"}}}"#.utf8)
        )
        XCTAssertEqual(priceUnavailable.marketQuote?.status, .priceUnavailable)

        let notFound = try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"not_found","asOf":"2026-08-16T12:00:00.000Z"}}}"#.utf8)
        )
        XCTAssertEqual(notFound.marketQuote?.status, .notFound)

        let failureKeys: [(String, String)] = [
            ("planning_unavailable", "$agent_notice_market_quote_planning_unavailable"),
            ("capability_unavailable", "$agent_notice_market_quote_capability_unavailable"),
            ("wallet_context_unavailable", "$agent_notice_market_quote_wallet_context_unavailable"),
            ("quote_currency_unsupported", "$agent_notice_market_quote_currency_unsupported"),
            ("quote_unavailable", "$agent_notice_market_quote_unavailable"),
            ("wallet_context_changed", "$agent_notice_market_quote_wallet_context_changed"),
            ("tool_timeout", "$agent_notice_market_quote_timeout"),
            ("tool_failed", "$agent_notice_market_quote_tool_failed"),
            ("invalid_result", "$agent_notice_market_quote_invalid_result"),
            ("cancelled", "$agent_notice_market_quote_cancelled")
        ]
        for (reason, key) in failureKeys {
            let data = Data("""
            {"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"unavailable","reason":"\(reason)"}}}
            """.utf8)
            let notice = try JSONDecoder().decode(ApiAgentV2NoticeContent.self, from: data)
            XCTAssertEqual(AgentV2Copy.notice(notice), lang(key), "Unexpected copy for \(reason)")
            XCTAssertFalse(AgentV2Copy.notice(notice).localizedCaseInsensitiveContains("retry"))
        }

        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2NoticeContent.self,
            from: Data(#"{"kind":"notice","schemaVersion":1,"code":"market_quote","arguments":{"marketQuote":{"status":"resolved","asset":{"slug":"gram","chain":"ton","symbol":"GRAM"},"price":"1","quoteCurrency":"USD","percentChange24h":"0"}}}"#.utf8)
        ))
    }

    @MainActor
    func testMarketQuoteUsesTheOrdinaryAssistantBubble() throws {
        let persisted = try decodePersistedMessage(content: [
            "kind": "semantic",
            "content": [
                "kind": "notice",
                "schemaVersion": 1,
                "code": "market_quote",
                "arguments": [
                    "marketQuote": [
                        "status": "resolved",
                        "asset": [
                            "slug": "gram",
                            "chain": "ton",
                            "symbol": "GRAM",
                            "name": "Gram **literal**"
                        ],
                        "price": "1.25",
                        "quoteCurrency": "USD",
                        "percentChange24h": "2",
                        "asOf": "2026-08-16T12:00:00.000Z"
                    ]
                ]
            ]
        ])
        let bubble = try XCTUnwrap(
            AgentV2MessagePresentation.bubble(for: AgentV2NativeMessage(persisted: persisted))
        )

        guard case .some(.semantic(let semantic)) = persisted.content,
              case .notice(let notice) = semantic
        else { return XCTFail("Expected market quote notice") }
        XCTAssertEqual(bubble.text, AgentV2Copy.notice(notice))
        XCTAssertFalse(bubble.rendersMarkdown)
    }

    func testDecodesMarketQuoteInputAndLiveSendContracts() throws {
        XCTAssertEqual(
            try JSONDecoder().decode(ApiAgentV2InputContinuationCode.self, from: Data(#""market_quote_asset""#.utf8)),
            .marketQuoteAsset
        )
        XCTAssertEqual(
            try JSONDecoder().decode(ApiAgentV2ActionLabelCode.self, from: Data(#""open_send""#.utf8)),
            .openSend
        )
        let action = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"sendForm","tokenSlug":"toncoin","toAddress":"UQ-recipient"}"#.utf8)
        )
        XCTAssertEqual(action.kind, .openSend)
        XCTAssertEqual(action.tokenSlug, "toncoin")
        XCTAssertEqual(action.toAddress, "UQ-recipient")
    }

    func testDecodesAndLocalizesTheCompleteSwapContinuationCatalog() throws {
        let swapCodes = ApiAgentV2InputContinuationCode.allCases.filter {
            $0.rawValue.hasPrefix("prepare_swap_")
        }
        XCTAssertEqual(swapCodes.count, 4)
        for code in swapCodes {
            let decoded = try JSONDecoder().decode(
                ApiAgentV2InputContinuationCode.self,
                from: try JSONEncoder().encode(code.rawValue)
            )
            XCTAssertEqual(decoded, code)
            XCTAssertFalse(AgentV2Copy.inputContinuation(decoded).isEmpty)
        }
    }

    func testDecodesNativeStakeAndSwapActionContracts() throws {
        let stakeProposal = try JSONDecoder().decode(
            ApiAgentV2ActionProposal.self,
            from: Data(#"{"id":"action-stake","kind":"stake","labelCode":"open_staking","requiresConfirmation":false}"#.utf8)
        )
        XCTAssertEqual(stakeProposal.kind, .stake)
        XCTAssertEqual(stakeProposal.labelCode, .openStaking)

        let persistedSwap = try JSONDecoder().decode(
            ApiAgentV2PersistedAction.self,
            from: Data(#"{"id":"action-swap","kind":"swap","labelCode":"open_swap","requiresConfirmation":false}"#.utf8)
        )
        XCTAssertEqual(persistedSwap.kind, .swap)
        XCTAssertEqual(persistedSwap.labelCode, .openSwap)

        let staking = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openStaking","productId":"liquid","tokenSlug":"toncoin","amount":{"kind":"exact","value":"10"}}"#.utf8)
        )
        XCTAssertEqual(staking.kind, .openStaking)
        XCTAssertEqual(staking.productId, "liquid")
        XCTAssertEqual(staking.tokenSlug, "toncoin")
        XCTAssertEqual(staking.stakeAmount?.kind, .exact)
        XCTAssertEqual(staking.stakeAmount?.value, "10")

        let swap = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openSwap","tokenInSlug":"toncoin","tokenOutSlug":"usdton","amount":"10","amountSide":"source"}"#.utf8)
        )
        XCTAssertEqual(swap.kind, .openSwap)
        XCTAssertEqual(swap.tokenInSlug, "toncoin")
        XCTAssertEqual(swap.tokenOutSlug, "usdton")
        XCTAssertEqual(swap.swapAmount, "10")
        XCTAssertEqual(swap.amountSide, .source)

        let navigation = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openToken","slug":"toncoin","chain":"ton","tokenAddress":"EQ-token"}"#.utf8)
        )
        XCTAssertEqual(navigation.kind, .openToken)
        XCTAssertEqual(navigation.slug, "toncoin")
        XCTAssertEqual(navigation.chain, "ton")
        XCTAssertEqual(navigation.tokenAddress, "EQ-token")
    }

    func testDecodesEveryOpenAgentEntryPointShape() throws {
        let tokenScreen = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openAgent","entryPoint":{"kind":"tokenScreen","asset":{"slug":"toncoin","chain":"ton"}}}"#.utf8)
        )
        guard case .tokenScreen(let asset) = tokenScreen.entryPoint else {
            return XCTFail("Expected token screen entry point")
        }
        XCTAssertEqual(asset.slug, "toncoin")
        XCTAssertEqual(asset.chain, "ton")
        XCTAssertNil(asset.tokenAddress)

        let emptyState = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openAgent","entryPoint":{"kind":"emptyState","surface":"agentTab"}}"#.utf8)
        )
        guard case .emptyState(let hintId, let catalogVersion) = emptyState.entryPoint else {
            return XCTFail("Expected empty state entry point")
        }
        XCTAssertNil(hintId)
        XCTAssertNil(catalogVersion)

        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openAgent","entryPoint":{"kind":"emptyState","surface":"portfolio"}}"#.utf8)
        ))
    }

    @MainActor
    func testStakingOffersUseTheTonProductSelectedByNativeNavigation() {
        let liquid = ApiStakingState.liquid(ApiStakingStateLiquid(
            id: "liquid",
            tokenSlug: TONCOIN_SLUG,
            annualYield: 3,
            yieldType: .apy,
            balance: 1,
            pool: "liquid-pool",
            unstakeRequestAmount: nil,
            tokenBalance: 1,
            instantAvailable: 0,
            start: 0,
            end: 0,
            totalStakers: 1,
            tvl: 1
        ))
        let nominators = ApiStakingState.nominators(ApiStakingStateNominators(
            id: "nominators",
            tokenSlug: TONCOIN_SLUG,
            annualYield: 4,
            yieldType: .apy,
            balance: 1,
            pool: "nominators-pool",
            unstakeRequestAmount: nil,
            start: 0,
            end: 0
        ))

        XCTAssertEqual(
            AgentV2HostContextProvider.selectStakingOfferStates(
                [liquid, nominators],
                shouldUseNominators: false
            ).map(\.id),
            ["liquid"]
        )
        XCTAssertEqual(
            AgentV2HostContextProvider.selectStakingOfferStates(
                [liquid, nominators],
                shouldUseNominators: true
            ).map(\.id),
            ["nominators"]
        )
    }

    @MainActor
    func testHostHoldingUsesCurrentBalanceAsAvailableBalance() {
        let token = ApiToken(
            slug: "test-token",
            name: "Test Token",
            symbol: "TEST",
            decimals: 9,
            chain: .ton
        )
        let tokenBalance = MTokenBalance(
            tokenSlug: token.slug,
            balance: 1_234_567_890,
            isStaking: false
        )

        let holding = AgentV2HostContextProvider.makeHolding(tokenBalance: tokenBalance, token: token)

        XCTAssertEqual(holding.balance, "1.23456789")
        XCTAssertEqual(holding.availableBalance, holding.balance)
        XCTAssertEqual(holding.visibility, "visible")

        let hiddenHolding = AgentV2HostContextProvider.makeHolding(
            tokenBalance: tokenBalance,
            token: token,
            visibility: "hidden"
        )
        XCTAssertEqual(hiddenHolding.visibility, "hidden")

        let stakedHolding = AgentV2HostContextProvider.makeHolding(
            tokenBalance: MTokenBalance(tokenSlug: token.slug, balance: 1_234_567_890, isStaking: true),
            token: token
        )
        XCTAssertNil(stakedHolding.availableBalance)
    }

    @MainActor
    func testSavedAddressIdentifiersRemainStableAcrossReordering() {
        let addresses = [
            SavedAddress(name: "Mom", address: "EQ-mom", chain: .ton),
            SavedAddress(name: "Alice", address: "0x-alice", chain: .ethereum)
        ]

        let first = AgentV2HostContextProvider.makeSavedAddresses(addresses)
        let reordered = AgentV2HostContextProvider.makeSavedAddresses(Array(addresses.reversed()))

        XCTAssertEqual(first.map(\.id), ["ton:EQ-mom", "ethereum:0x-alice"])
        XCTAssertEqual(
            Dictionary(uniqueKeysWithValues: first.map { ($0.address, $0.id) }),
            Dictionary(uniqueKeysWithValues: reordered.map { ($0.address, $0.id) })
        )
    }

    @MainActor
    func testSwapCatalogDoesNotApplyTheFormerIOSOnlyFiveHundredAssetCap() {
        let ordinary = (0..<600).map { index in
            ApiToken(
                slug: "ordinary-\(index)",
                name: "Ordinary \(index)",
                symbol: "O\(index)",
                decimals: 9,
                chain: .ton,
                tokenAddress: "token-\(index)"
            )
        }
        let tether = ApiToken(
            slug: "ton-tether",
            name: "Tether USD",
            symbol: "USD₮",
            decimals: 6,
            chain: .ton,
            tokenAddress: "tether-token",
            isPopular: true
        )

        let catalog = AgentV2HostContextProvider.makeSwapAssetCatalog(
            tokens: ordinary + [tether]
        )

        XCTAssertEqual(catalog?.count, 601)
        XCTAssertTrue(catalog?.contains(where: { $0.slug == tether.slug }) == true)
    }

    @MainActor
    func testHostContextProviderPublishesAuthorityEventsWithoutBalanceDebounce() async {
        let client = FakeAgentV2Client()
        let provider = AgentV2HostContextProvider(client: client)
        _ = await provider.start()
        defer { provider.stop() }

        await waitForHostContextUpdate(client)
        XCTAssertEqual(client.hostContextUpdateCount, 1)
        client.resetHostContextUpdateCount()

        provider.walletCore(event: .balanceChanged(accountId: "account-a"))
        for _ in 0..<10 {
            await Task.yield()
        }
        XCTAssertEqual(client.hostContextUpdateCount, 0)

        provider.walletCore(event: .accountChanged(accountId: "account-b", isNew: false))
        await waitForHostContextUpdate(client)
        XCTAssertEqual(client.hostContextUpdateCount, 1)

        client.resetHostContextUpdateCount()
        provider.walletCore(event: .accountDeleted(accountId: "account-b"))
        await waitForHostContextUpdate(client)
        XCTAssertEqual(client.hostContextUpdateCount, 1)

        client.resetHostContextUpdateCount()
        provider.walletCore(event: .accountChanged(accountId: "account-a", isNew: false))
        provider.walletCore(event: .balanceChanged(accountId: "account-a"))
        await waitForHostContextUpdate(client)
        XCTAssertEqual(client.hostContextUpdateCount, 1)
    }

    @MainActor
    func testHostContextProviderDoesNotRepeatRuntimeResetAfterAccountsReset() async {
        let client = FakeAgentV2Client()
        let provider = AgentV2HostContextProvider(client: client)
        _ = await provider.start()
        defer { provider.stop() }

        provider.walletCore(event: .accountsReset)
        for _ in 0..<10 {
            await Task.yield()
        }

        XCTAssertFalse(provider.isAuthorityContextCurrent)
        XCTAssertEqual(client.hostContextUpdateCount, 1)
    }

    @MainActor
    func testHostContextProviderBlocksActionsUntilAnAuthorityUpdateFinishes() async {
        let client = FakeAgentV2Client(blockedHostContextAttempt: 2)
        let provider = AgentV2HostContextProvider(client: client)
        _ = await provider.start()
        defer {
            client.resumeBlockedHostContextUpdate()
            provider.stop()
        }
        XCTAssertTrue(provider.isAuthorityContextCurrent)

        provider.walletCore(event: .accountDeleted(accountId: "account-a"))
        await waitForHostContextUpdate(client, count: 2)

        XCTAssertFalse(provider.isAuthorityContextCurrent)

        client.resumeBlockedHostContextUpdate()
        for _ in 0..<100 where !provider.isAuthorityContextCurrent {
            await Task.yield()
        }

        XCTAssertTrue(provider.isAuthorityContextCurrent)
    }

    @MainActor
    func testHostContextProviderDefersDynamicUpdatesUntilTheActiveRunCompletes() async {
        let client = FakeAgentV2Client()
        let provider = AgentV2HostContextProvider(client: client)
        let runActivity = AgentV2RunActivityProbe()
        provider.isRunActive = { runActivity.isActive }
        _ = await provider.start()
        defer { provider.stop() }

        await waitForHostContextUpdate(client)
        client.resetHostContextUpdateCount()
        runActivity.isActive = true

        provider.walletCore(event: .balanceChanged(accountId: "account-a"))
        try? await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(client.hostContextUpdateCount, 0)

        runActivity.isActive = false
        provider.flushDeferredDynamicUpdate()
        try? await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(client.hostContextUpdateCount, 1)
    }

    @MainActor
    func testHostContextProviderPublishesDirectoryChangesWithoutInvalidatingAuthority() async {
        let client = FakeAgentV2Client()
        let provider = AgentV2HostContextProvider(client: client)
        let runActivity = AgentV2RunActivityProbe()
        provider.isRunActive = { runActivity.isActive }
        _ = await provider.start()
        defer { provider.stop() }

        await waitForHostContextUpdate(client)
        client.resetHostContextUpdateCount()
        runActivity.isActive = true

        provider.walletCore(event: .savedAddressesChanged(accountId: "account-a"))

        XCTAssertTrue(provider.isAuthorityContextCurrent)
        await waitForHostContextUpdate(client)
        XCTAssertEqual(client.hostContextUpdateCount, 1)
        XCTAssertTrue(provider.isAuthorityContextCurrent)
    }

    @MainActor
    func testHostContextProviderDefersSwapPolicyChangesUntilTheActiveRunCompletes() async {
        let client = FakeAgentV2Client()
        let provider = AgentV2HostContextProvider(client: client)
        let runActivity = AgentV2RunActivityProbe()
        provider.isRunActive = { runActivity.isActive }
        _ = await provider.start()
        defer { provider.stop() }

        await waitForHostContextUpdate(client)
        client.resetHostContextUpdateCount()
        runActivity.isActive = true

        provider.walletCore(event: .swapTokensChanged)
        try? await Task.sleep(for: .milliseconds(150))

        XCTAssertTrue(provider.isAuthorityContextCurrent)
        XCTAssertEqual(client.hostContextUpdateCount, 0)

        runActivity.isActive = false
        provider.flushDeferredDynamicUpdate()
        try? await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(client.hostContextUpdateCount, 1)
    }

    @MainActor
    func testHostContextProviderRecoversAfterATransientAuthorityUpdateFailure() async {
        let client = FakeAgentV2Client(hostContextFailureAttempts: [2])
        let provider = AgentV2HostContextProvider(
            client: client,
            dynamicAuthorityUpdateRetryDelay: .zero
        )
        _ = await provider.start()
        defer { provider.stop() }

        provider.walletCore(event: .accountDeleted(accountId: "account-a"))
        await waitForHostContextUpdate(client, count: 3)
        for _ in 0..<100 where !provider.isAuthorityContextCurrent {
            await Task.yield()
        }

        XCTAssertEqual(client.hostContextUpdateCount, 3)
        XCTAssertTrue(provider.isAuthorityContextCurrent)
    }

    @MainActor
    func testCoordinatorPublishesHostContextBeforeInitialHydration() async throws {
        let hydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "message-a")
        let client = FakeAgentV2Client(hydrationResult: hydration)
        let coordinator = AgentV2Coordinator(client: client)
        coordinator.start()
        defer { coordinator.stop() }

        await waitForRequest("messages", client: client)
        await waitForRequest("availability", client: client)
        await waitForRequest("userQuota", client: client)

        XCTAssertEqual(client.lastHostContext?.platform, "ios")
        XCTAssertTrue(client.requestOrder.contains("availability"))
        XCTAssertTrue(client.requestOrder.contains("userQuota"))
        XCTAssertEqual(
            client.requestOrder.filter { ["hostContext", "defaultThread", "messages"].contains($0) },
            ["hostContext", "defaultThread", "messages"]
        )
    }

    @MainActor
    func testCoordinatorRetriesAfterInitialHostContextFailure() async throws {
        let hydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "message-a")
        let client = FakeAgentV2Client(
            hydrationResult: hydration,
            hostContextFailuresRemaining: 1
        )
        let coordinator = AgentV2Coordinator(client: client, initialHostContextRetryDelay: .zero)
        coordinator.start()
        defer { coordinator.stop() }

        await waitForRequest("messages", client: client)

        XCTAssertEqual(
            client.requestOrder.filter { ["hostContext", "defaultThread", "messages"].contains($0) },
            ["hostContext", "hostContext", "defaultThread", "messages"]
        )
        XCTAssertEqual(client.lastHostContext?.platform, "ios")
        XCTAssertNil(coordinator.error)
    }

    @MainActor
    func testHostContextProviderAwaitsAnAuthorityChangeQueuedDuringInitialPublish() async {
        let client = FakeAgentV2Client(blockedHostContextAttempt: 2)
        let provider = AgentV2HostContextProvider(client: client)
        client.hostContextUpdateObserver = { [weak provider] attempt in
            guard attempt == 1 else { return }
            provider?.walletCore(event: .accountChanged(accountId: "account-a", isNew: false))
        }
        var startResult: Bool?
        let startTask = Task { @MainActor in
            let result = await provider.start()
            startResult = result
            return result
        }
        defer {
            client.resumeBlockedHostContextUpdate()
            provider.stop()
        }

        await waitForHostContextUpdate(client, count: 2)
        for _ in 0..<10 {
            await Task.yield()
        }

        XCTAssertNil(startResult)
        client.resumeBlockedHostContextUpdate()
        let didStart = await startTask.value
        XCTAssertTrue(didStart)
        XCTAssertEqual(client.hostContextUpdateCount, 2)
    }

    @MainActor
    func testHostContextProviderFailsClosedWhenQueuedAuthorityPublishFails() async {
        let client = FakeAgentV2Client(hostContextFailureAttempts: [2])
        let provider = AgentV2HostContextProvider(client: client)
        client.hostContextUpdateObserver = { [weak provider] attempt in
            guard attempt == 1 else { return }
            provider?.walletCore(event: .accountChanged(accountId: "account-a", isNew: false))
        }
        defer { provider.stop() }

        let didStartBeforeRetry = await provider.start()
        XCTAssertFalse(didStartBeforeRetry)
        XCTAssertEqual(client.hostContextUpdateCount, 2)

        let didStartAfterRetry = await provider.start()
        XCTAssertTrue(didStartAfterRetry)
        XCTAssertEqual(client.hostContextUpdateCount, 3)
    }

    func testHydratedMarkdownMessageUsesTheContentUnion() throws {
        let source = "Wallet **warning:** keep TON for fees."
        let persisted = try decodePersistedMessage(content: [
            "kind": "markdown",
            "text": source
        ])

        let message = AgentV2NativeMessage(persisted: persisted)

        XCTAssertEqual(message.contentKind, .markdown)
        XCTAssertEqual(message.text, source)
        XCTAssertNil(message.semanticContent)
    }

    func testRemovedPersistedPresentationFieldsFailClosed() throws {
        for field in ["text", "textFormat", "widget"] {
            var object = persistedMessageObject(content: ["kind": "markdown", "text": "Current"])
            object[field] = field == "widget" ? ["kind": "removedWidget"] : "legacy"
            let data = try JSONSerialization.data(withJSONObject: object)

            XCTAssertThrowsError(
                try JSONDecoder().decode(ApiAgentV2PersistedMessage.self, from: data),
                "Expected removed field \(field) to fail closed"
            )
        }
    }

    @MainActor
    func testAgentMarkdownV1RendersRestrainedInlineAndListSyntax() throws {
        let baseFont = UIFont.preferredFont(forTextStyle: .body)
        let rendered = AgentMessageTextRenderer.makeAttributedText(
            "Wallet **warning:** keep `GRAM` for fees.\n- First item\n- Second *item*\n1. Verify\n2) Review",
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1,
            baseFont: baseFont
        )

        XCTAssertEqual(
            rendered.string,
            "Wallet warning: keep GRAM for fees.\n•\tFirst item\n•\tSecond item\n1.\tVerify\n2.\tReview"
        )
        let warningRange = (rendered.string as NSString).range(of: "warning:")
        let warningFont = try XCTUnwrap(rendered.attribute(
            .font,
            at: warningRange.location,
            effectiveRange: nil
        ) as? UIFont)
        XCTAssertTrue(warningFont.fontDescriptor.symbolicTraits.contains(.traitBold))

        let codeRange = (rendered.string as NSString).range(of: "GRAM")
        let codeFont = try XCTUnwrap(rendered.attribute(
            .font,
            at: codeRange.location,
            effectiveRange: nil
        ) as? UIFont)
        XCTAssertTrue(codeFont.fontDescriptor.symbolicTraits.contains(.traitMonoSpace))
        XCTAssertEqual(codeFont.pointSize, baseFont.pointSize)

        let italicRange = (rendered.string as NSString).range(of: "item", options: .backwards)
        let italicFont = try XCTUnwrap(rendered.attribute(
            .font,
            at: italicRange.location,
            effectiveRange: nil
        ) as? UIFont)
        XCTAssertTrue(italicFont.fontDescriptor.symbolicTraits.contains(.traitItalic))
    }

    @MainActor
    func testAgentMarkdownV1RendersEscapedPunctuationAsLiteralText() {
        let rendered = AgentMessageTextRenderer.makeAttributedText(
            #"Daily changes: \+1\.62% and \-2\.01%. Escaped \*\*literal\*\*."#,
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1
        )

        XCTAssertEqual(
            rendered.string,
            "Daily changes: +1.62% and -2.01%. Escaped **literal**."
        )
        let literalRange = (rendered.string as NSString).range(of: "literal")
        let literalFont = rendered.attribute(
            .font,
            at: literalRange.location,
            effectiveRange: nil
        ) as? UIFont
        XCTAssertFalse(literalFont?.fontDescriptor.symbolicTraits.contains(.traitBold) ?? true)
    }

    @MainActor
    func testAgentMarkdownV1PreservesSemanticParagraphsAndDynamicTypeStyles() throws {
        let largeFont = UIFont.preferredFont(
            forTextStyle: .body,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: .large)
        )
        let baseFont = UIFont.preferredFont(
            forTextStyle: .body,
            compatibleWith: UITraitCollection(
                preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge
            )
        )
        XCTAssertGreaterThan(baseFont.pointSize, largeFont.pointSize)

        let rendered = AgentMessageTextRenderer.makeAttributedText(
            "The transfer is ready for review.\n\nConfirm the address before signing.",
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1,
            baseFont: baseFont
        )

        XCTAssertEqual(
            rendered.string,
            "The transfer is ready for review.\n\nConfirm the address before signing."
        )
        for paragraph in [
            "The transfer is ready for review.",
            "Confirm the address before signing."
        ] {
            let paragraphSwiftRange = try XCTUnwrap(rendered.string.range(of: paragraph))
            let paragraphRange = NSRange(paragraphSwiftRange, in: rendered.string)
            let paragraphStyle = try XCTUnwrap(rendered.attribute(
                .paragraphStyle,
                at: paragraphRange.location,
                effectiveRange: nil
            ) as? NSParagraphStyle)
            XCTAssertEqual(
                paragraphStyle.minimumLineHeight,
                ceil(baseFont.lineHeight),
                accuracy: 0.001
            )
            XCTAssertEqual(
                paragraphStyle.maximumLineHeight,
                ceil(baseFont.lineHeight),
                accuracy: 0.001
            )
            XCTAssertEqual(paragraphStyle.paragraphSpacing, 8, accuracy: 0.001)
            XCTAssertEqual(paragraphStyle.lineBreakMode, .byWordWrapping)

            let font = try XCTUnwrap(rendered.attribute(
                .font,
                at: paragraphRange.location,
                effectiveRange: nil
            ) as? UIFont)
            XCTAssertEqual(font.pointSize, baseFont.pointSize, accuracy: 0.001)
        }

        let separatorSwiftRange = try XCTUnwrap(rendered.string.range(of: "\n\n"))
        let separatorRange = NSRange(separatorSwiftRange, in: rendered.string)
        let separatorIndex = NSMaxRange(separatorRange) - 1
        var separatorEffectiveRange = NSRange()
        let separatorStyle = try XCTUnwrap(rendered.attribute(
            .paragraphStyle,
            at: separatorIndex,
            effectiveRange: &separatorEffectiveRange
        ) as? NSParagraphStyle)
        XCTAssertEqual(
            separatorEffectiveRange,
            NSRange(location: separatorIndex, length: 1)
        )
        XCTAssertEqual(separatorStyle.minimumLineHeight, 12, accuracy: 0.001)
        XCTAssertEqual(separatorStyle.maximumLineHeight, 12, accuracy: 0.001)
        XCTAssertEqual(separatorStyle.paragraphSpacing, 0, accuracy: 0.001)
        XCTAssertEqual(separatorStyle.lineBreakMode, .byWordWrapping)
        let separatorFont = try XCTUnwrap(rendered.attribute(
            .font,
            at: separatorIndex,
            effectiveRange: nil
        ) as? UIFont)
        XCTAssertEqual(separatorFont.pointSize, baseFont.pointSize, accuracy: 0.001)
    }

    @MainActor
    func testAgentMarkdownV1KeepsLinksPassiveAndUnsupportedBlocksReadable() {
        let rendered = AgentMessageTextRenderer.makeAttributedText(
            "# Heading\n> Quote\n**unfinished\n[Source](https://example.com/path_with_value)\n[Receive](mtw://receive)",
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1
        )

        XCTAssertEqual(
            rendered.string,
            "# Heading\n> Quote\n**unfinished\nSource (https://example.com/path_with_value)\nReceive"
        )
        let fullRange = NSRange(location: 0, length: rendered.length)
        var containsLink = false
        rendered.enumerateAttribute(.link, in: fullRange) { value, _, stop in
            if value != nil {
                containsLink = true
                stop.pointee = true
            }
        }
        XCTAssertFalse(containsLink)
    }

    @MainActor
    func testAgentMarkdownV1RendersTaggedFencedCodeWithoutMarkers() throws {
        let rendered = AgentMessageTextRenderer.makeAttributedText(
            "```javascript\nconst safe = true;\n```",
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1
        )

        XCTAssertEqual(rendered.string, "const safe = true;")
        let font = try XCTUnwrap(rendered.attribute(.font, at: 0, effectiveRange: nil) as? UIFont)
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace))
    }

    @MainActor
    func testAgentMarkdownV1KeepsUntaggedFencesReadable() {
        let rendered = AgentMessageTextRenderer.makeAttributedText(
            "```\nconst safe = true;\n```",
            textColor: .label,
            rendersMarkdown: true,
            detectsLinks: false,
            markdownProfile: .agentMarkdownV1
        )

        XCTAssertEqual(rendered.string, "```\nconst safe = true;\n```")
    }

    func testOverrideConfigDefaultsToV1WhenMissingOrInvalid() {
        XCTAssertEqual(AgentOverrideConfig.resolve(data: nil), AgentOverrideConfig(value: .v1))
        XCTAssertEqual(
            AgentOverrideConfig.resolve(data: Data(#"{"override":"invalid"}"#.utf8)),
            AgentOverrideConfig(value: .v1)
        )
    }

    func testOverrideConfigDecodesSupportedValues() {
        for value in AgentOverrideConfig.Value.allCases {
            let data = Data(#"{"override":"\#(value.rawValue)"}"#.utf8)
            XCTAssertEqual(AgentOverrideConfig.resolve(data: data), AgentOverrideConfig(value: value))
        }
    }

    func testOverrideConfigResolvesBackendAndForcedVersions() {
        XCTAssertEqual(AgentOverrideConfig(value: .noOverride).resolve(backendVersion: .v2), .v2)
        XCTAssertEqual(AgentOverrideConfig(value: .v1).resolve(backendVersion: .v2), .v1)
        XCTAssertEqual(AgentOverrideConfig(value: .v2).resolve(backendVersion: .v1), .v2)
    }

    @MainActor
    func testV1CreatesClassicAgentWithoutCreatingV2Client() {
        AgentConsentStore.reset()
        defer { AgentConsentStore.reset() }
        var didCreateV2Client = false
        let expectedConsentController = UIViewController()
        let expectedAgentController = UIViewController()

        let consentController = AgentEntryPoint.makeRootViewController(
            agentProtocolVersion: .v1,
            makeAgentV2Client: {
                didCreateV2Client = true
                return FakeAgentV2Client()
            },
            makeAgentController: { expectedAgentController },
            makeConsentController: { expectedConsentController }
        )

        XCTAssertIdentical(consentController, expectedConsentController)
        XCTAssertFalse(didCreateV2Client)

        AgentConsentStore.accept()
        let agentController = AgentEntryPoint.makeRootViewController(
            agentProtocolVersion: .v1,
            makeAgentV2Client: {
                didCreateV2Client = true
                return FakeAgentV2Client()
            },
            makeAgentController: { expectedAgentController },
            makeConsentController: { expectedConsentController }
        )

        XCTAssertIdentical(agentController, expectedAgentController)
        XCTAssertFalse(didCreateV2Client)
    }

    @MainActor
    func testV2CreatesV2Router() {
        var didCreateV2Client = false

        let controller = AgentEntryPoint.makeRootViewController(
            agentProtocolVersion: .v2,
            makeAgentV2Client: {
                didCreateV2Client = true
                return FakeAgentV2Client()
            }
        )

        XCTAssertTrue(controller is AgentRootRouterVC)
        XCTAssertTrue(didCreateV2Client)
    }

    @MainActor
    func testNoOverrideRouterFollowsRuntimeConfigChanges() throws {
        defer { ConfigStore.shared.config = nil }
        ConfigStore.shared.config = try JSONDecoder().decode(
            ApiUpdate.UpdateConfig.self,
            from: Data(#"{"agentProtocolVersion":"v1"}"#.utf8)
        )
        var routedVersions: [ApiUpdate.UpdateConfig.AgentProtocolVersion] = []
        let router = AgentProtocolRouterVC(overrideConfig: AgentOverrideConfig(value: .noOverride)) { version in
            routedVersions.append(version)
            return UIViewController()
        }
        router.loadViewIfNeeded()

        ConfigStore.shared.config = try JSONDecoder().decode(
            ApiUpdate.UpdateConfig.self,
            from: Data(#"{"agentProtocolVersion":"v2"}"#.utf8)
        )
        router.walletCore(event: .configChanged)

        XCTAssertEqual(routedVersions, [.v1, .v2])
        XCTAssertEqual(router.children.count, 1)
    }

    @MainActor
    func testV1RouterExposesAgentNavigationMenu() throws {
        let agent = AgentVC(model: AgentModel(backend: AgentTestingBackend()))
        let router = AgentProtocolRouterVC(overrideConfig: AgentOverrideConfig(value: .v1)) { _ in agent }
        let navigationController = UINavigationController(rootViewController: router)

        navigationController.loadViewIfNeeded()
        router.loadViewIfNeeded()

        let menu = try XCTUnwrap(router.navigationItem.rightBarButtonItem?.menu)
        XCTAssertTrue(menu.children.contains { ($0 as? UIAction)?.title == lang("Clear Chat") })
    }

    @MainActor
    func testRemovingV2ChatStopsCoordinator() async {
        let client = FakeAgentV2Client()
        let coordinator = AgentV2Coordinator(client: client)
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        let parent = UIViewController()
        parent.addChild(viewController)
        parent.view.addSubview(viewController.view)
        viewController.didMove(toParent: parent)

        viewController.willMove(toParent: nil)
        viewController.view.removeFromSuperview()
        viewController.removeFromParent()
        coordinator.start()
        for _ in 0..<20 {
            await Task.yield()
        }

        XCTAssertEqual(client.hostContextUpdateCount, 0)
    }

    @MainActor
    func testV2ChatConsumesQueuedAgentQuestionWhenThreadLoads() async throws {
        let client = FakeAgentV2Client()
        let coordinator = AgentV2Coordinator(client: client)
        AgentEntryPoint.enqueueQuery("What is the current GRAM staking APY?")
        defer { AgentEntryPoint.clearPendingQuery() }

        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertNil(AgentEntryPoint.consumePendingQuery())
        let command = try XCTUnwrap(client.startedCommands.first)
        XCTAssertEqual(command.input, .append(text: "What is the current GRAM staking APY?"))
        XCTAssertEqual(command.entryPoint, .agentTab)
    }

    @MainActor
    func testQueuedQueryCanBeClearedWhenAgentRoutingIsCancelled() {
        AgentEntryPoint.enqueueQuery("stale query")

        AgentEntryPoint.clearPendingQuery()

        XCTAssertNil(AgentEntryPoint.consumePendingQuery())
    }

    func testDecodesRuntimeStatusBeforeRuntimeInitialization() throws {
        let data = Data(#"{"enabled":true}"#.utf8)
        let status = try JSONDecoder().decode(ApiAgentV2RuntimeStatus.self, from: data)
        XCTAssertTrue(status.enabled)
    }

    func testDecodesSDKThreadHydrationOperationResult() throws {
        let data = Data(#"""
        {
          "ok":true,
          "value":{
            "thread":{
              "id":"thread-1",
              "revision":2,
              "metadataRevision":1,
              "titleSource":"none",
              "isPinned":false,
              "isDefault":true,
              "createdAt":"2026-07-22T00:00:00.000Z",
              "updatedAt":"2026-07-22T00:00:01.000Z",
              "lastActivityAt":"2026-07-22T00:00:01.000Z",
              "messageCount":1
            },
            "messages":[{
              "id":"message-1",
              "threadId":"thread-1",
              "role":"user",
              "status":"complete",
              "content":{"kind":"markdown","text":"Hello"},
              "createdAt":"2026-07-22T00:00:01.000Z"
            }]
          }
        }
        """#.utf8)

        let result = try JSONDecoder().decode(
            ApiAgentV2MutationResult<ApiAgentV2ThreadHydration>.self,
            from: data
        )
        let hydration = try XCTUnwrap(result.value)
        XCTAssertTrue(result.ok)
        XCTAssertEqual(hydration.thread.id, "thread-1")
        XCTAssertEqual(hydration.messages.map(\.id), ["message-1"])
    }

    func testHostAccountEncodesPortfolioWalletKeys() throws {
        let account = ApiAgentV2HostAccount(
            accountId: "account-1",
            label: "Wallet",
            state: "active",
            accountType: "regular",
            isViewOnly: false,
            chains: ["ton"],
            addresses: ["ton": "EQ-public-address"],
            portfolioWalletKeys: ["ton:EQ-public-address"],
            holdings: []
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(account)) as? [String: Any]
        )
        XCTAssertEqual(object["accountType"] as? String, "regular")
        XCTAssertEqual(object["portfolioWalletKeys"] as? [String], ["ton:EQ-public-address"])
    }

    func testHostContextEncodesLocalAssetCatalog() throws {
        let asset = ApiAgentV2HostAsset(
            slug: "usd-tether",
            chain: "ton",
            symbol: "USDT",
            name: "Tether USD",
            tokenAddress: "EQ-usdt",
            decimals: 6,
            priceUsd: "1.001",
            percentChange24h: "-0.25"
        )
        let stakingAsset = ApiAgentV2AssetIdentity(
            slug: asset.slug,
            chain: asset.chain,
            symbol: asset.symbol,
            name: asset.name,
            tokenAddress: asset.tokenAddress,
            decimals: asset.decimals
        )
        let context = ApiAgentV2HostContext(
            lang: "en",
            baseCurrency: "USD",
            currencyRate: "1",
            appVersion: nil,
            theme: nil,
            activeAccountId: nil,
            activeNetwork: nil,
            isTestnet: false,
            stakingOffers: [ApiAgentV2HostStakingOffer(
                productId: "liquid",
                asset: stakingAsset,
                annualYield: "14.09",
                yieldType: "APY",
                availability: "available"
            )],
            accounts: [],
            assetCatalog: [asset],
            swapAssetCatalog: [asset],
            savedAddresses: []
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(context)) as? [String: Any]
        )
        XCTAssertEqual((object["assetCatalog"] as? [[String: Any]])?.first?["slug"] as? String, "usd-tether")
        XCTAssertEqual((object["assetCatalog"] as? [[String: Any]])?.first?["priceUsd"] as? String, "1.001")
        XCTAssertEqual((object["assetCatalog"] as? [[String: Any]])?.first?["percentChange24h"] as? String, "-0.25")
        XCTAssertEqual((object["swapAssetCatalog"] as? [[String: Any]])?.first?["slug"] as? String, "usd-tether")
        XCTAssertEqual(object["currencyRate"] as? String, "1")
        XCTAssertEqual(object["isTestnet"] as? Bool, false)
        let stakingOffer = (object["stakingOffers"] as? [[String: Any]])?.first
        XCTAssertEqual(stakingOffer?["productId"] as? String, "liquid")
        XCTAssertEqual(stakingOffer?["annualYield"] as? String, "14.09")
        let encodedStakingAsset = try XCTUnwrap(stakingOffer?["asset"] as? [String: Any])
        XCTAssertEqual(encodedStakingAsset["slug"] as? String, "usd-tether")
        XCTAssertNil(encodedStakingAsset["priceUsd"])
        XCTAssertNil(encodedStakingAsset["percentChange24h"])
    }

    func testDecodesBoundTextDelta() throws {
        let data = Data(#"""
        {
          "type":"agentV2",
          "update":{
            "kind":"textDelta",
            "clientRunId":"client-run",
            "runId":"run-1",
            "threadId":"thread-1",
            "messageId":"message-1",
            "delta":"Hello"
          }
        }
        """#.utf8)

        let envelope = try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data)
        guard case .textDelta(let bound, let messageId, let delta) = envelope.update else {
            return XCTFail("Expected text delta")
        }
        XCTAssertEqual(bound.threadId, "thread-1")
        XCTAssertEqual(messageId, "message-1")
        XCTAssertEqual(delta, "Hello")
    }

    func testDecodesRuntimeReadyAndToolActivityUpdates() throws {
        let ready = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runtimeReady","generation":7}}"#.utf8)
        )
        guard case .runtimeReady(let generation) = ready.update else {
            return XCTFail("Expected runtime-ready update")
        }
        XCTAssertEqual(generation, 7)

        let activity = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"""
            {
              "type":"agentV2",
              "update":{
                "kind":"toolActivityChanged",
                "clientRunId":"client-run",
                "runId":"run-1",
                "threadId":"thread-1",
                "toolCallId":"tool-call-1",
                "toolName":"wallet.data.query",
                "operation":"positions.list",
                "status":"complete"
              }
            }
            """#.utf8)
        )
        guard case .toolActivityChanged(
            let bound,
            let toolCallId,
            let toolName,
            let operation,
            let status
        ) = activity.update else {
            return XCTFail("Expected tool-activity update")
        }
        XCTAssertEqual(bound.threadId, "thread-1")
        XCTAssertEqual(toolCallId, "tool-call-1")
        XCTAssertEqual(toolName, "wallet.data.query")
        XCTAssertEqual(operation, "positions.list")
        XCTAssertEqual(status, "complete")
    }

    func testDecodesRunActivityUpdate() throws {
        let update = try decodeRunActivityUpdate(threadId: "thread-1")

        guard case .runActivityChanged(let bound, let event) = update else {
            return XCTFail("Expected run-activity update")
        }
        XCTAssertEqual(bound.threadId, "thread-1")
        XCTAssertEqual(event.protocolVersion, 2)
        XCTAssertEqual(event.sequence, 3)
        XCTAssertEqual(event.code, .webReadingSources)
        XCTAssertEqual(event.status, .completed)
        XCTAssertEqual(event.detail?.kind, .sourceCount)
        XCTAssertEqual(event.detail?.count, 4)
    }

    func testDecodesAvailabilityAndQuotaUpdates() throws {
        let availabilityEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"availabilityChanged","availability":{"state":"capacity_exhausted","resetAt":1787752800000}}}"#.utf8)
        )
        guard case .availabilityChanged(let availability) = availabilityEnvelope.update else {
            return XCTFail("Expected availability update")
        }
        XCTAssertEqual(availability.state, .capacityExhausted)
        XCTAssertEqual(availability.resetAt, 1_787_752_800_000)

        let quotaEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"userQuotaChanged","quota":{"limit":100,"used":100,"remaining":0,"resetAt":"2099-08-27T00:00:00.000Z"}}}"#.utf8)
        )
        guard case .userQuotaChanged(let quota) = quotaEnvelope.update else {
            return XCTFail("Expected user-quota update")
        }
        XCTAssertEqual(quota?.limit, 100)
        XCTAssertEqual(quota?.remaining, 0)

        let clearedQuotaEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"userQuotaChanged"}}"#.utf8)
        )
        guard case .userQuotaChanged(nil) = clearedQuotaEnvelope.update else {
            return XCTFail("Expected cleared user-quota update")
        }
    }

    @MainActor
    func testCoordinatorTracksAgentLimitsAndBlocksInputWhileTheyAreActive() throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client())
        defer { coordinator.stop() }

        let capacityEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"availabilityChanged","availability":{"state":"capacity_exhausted","resetAt":4102444800000}}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(capacityEnvelope.update))
        XCTAssertTrue(coordinator.isInputBlockedByLimit)

        let availableEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"availabilityChanged","availability":{"state":"available"}}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(availableEnvelope.update))
        XCTAssertFalse(coordinator.isInputBlockedByLimit)

        let quotaEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"userQuotaChanged","quota":{"limit":100,"used":100,"remaining":0,"resetAt":"2099-08-27T00:00:00.000Z"}}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(quotaEnvelope.update))
        XCTAssertTrue(coordinator.isInputBlockedByLimit)

        let clearedQuotaEnvelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"userQuotaChanged"}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(clearedQuotaEnvelope.update))
        XCTAssertFalse(coordinator.isInputBlockedByLimit)
    }

    func testRunFailurePreservesRetryBinding() throws {
        let envelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runFailed","clientRunId":"client-1","threadId":"thread-1","messageId":"message-1","code":"user_quota_exhausted","retryable":true,"resetAt":1787752800000}}"#.utf8)
        )
        guard case .runFailed(
            _,
            let clientRunId,
            let threadId,
            let messageId,
            let code,
            let retryable,
            let resetAt
        ) = envelope.update else {
            return XCTFail("Expected run failure")
        }
        XCTAssertEqual(clientRunId, "client-1")
        XCTAssertEqual(threadId, "thread-1")
        XCTAssertEqual(messageId, "message-1")
        XCTAssertEqual(code, .userQuotaExhausted)
        XCTAssertTrue(retryable)
        XCTAssertEqual(resetAt, 1_787_752_800_000)
    }

    @MainActor
    func testPreAdmissionQuotaFailureCanBeRetriedOnlyOnce() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let client = FakeAgentV2Client(
            hydrationResult: hydration,
            retryResultState: .completed
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()
        let envelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runFailed","clientRunId":"client-1","threadId":"thread-a","code":"user_quota_exhausted","retryable":true,"resetAt":0}}"#.utf8)
        )

        coordinator.walletCore(event: .agentV2(envelope.update))

        XCTAssertTrue(coordinator.hasLimitRetry)
        XCTAssertTrue(coordinator.canRetryLimit)
        let retryButton = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? UIButton }
            .first { $0.configuration?.title == lang("Retry") })
        XCTAssertFalse(retryButton.isHidden)
        XCTAssertTrue(retryButton.isEnabled)
        XCTAssertEqual(
            retryButton.actions(forTarget: viewController, forControlEvent: .touchUpInside),
            ["retryLimitPressed"]
        )

        coordinator.retryLimit()
        coordinator.retryLimit()
        for _ in 0..<100 where coordinator.activeRun?.isRunning == true {
            await Task.yield()
        }

        XCTAssertEqual(client.retriedClientRunIds, ["client-1"])
        XCTAssertFalse(coordinator.hasLimitRetry)
    }

    @MainActor
    func testFailedQuotaRetryRemainsAvailable() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let client = FakeAgentV2Client(
            hydrationResult: hydration,
            retryResultState: .failed
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let envelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runFailed","clientRunId":"client-1","threadId":"thread-a","code":"user_quota_exhausted","retryable":true,"resetAt":0}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(envelope.update))

        coordinator.retryLimit()
        for _ in 0..<100 where coordinator.activeRun?.isRunning == true {
            await Task.yield()
        }

        XCTAssertEqual(client.retriedClientRunIds, ["client-1"])
        XCTAssertTrue(coordinator.hasLimitRetry)
        XCTAssertTrue(coordinator.canRetryLimit)
    }

    @MainActor
    func testAdmittedQuotaFailureCannotReplayTheRun() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
        await coordinator.loadDefaultThread()
        let envelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runFailed","clientRunId":"client-1","runId":"run-1","threadId":"thread-a","code":"user_quota_exhausted","retryable":true,"resetAt":0}}"#.utf8)
        )

        coordinator.walletCore(event: .agentV2(envelope.update))

        XCTAssertFalse(coordinator.hasLimitRetry)
    }

    func testDecodesAgentPortfolioHistoryUpdate() throws {
        let data = Data(#"{"type":"agentV2PortfolioHistory","accountId":"account-1","baseCurrency":"USD","range":"1D","fetchedAtSlot":7,"netWorth":{"status":"ok","datasets":[],"base":"USD","density":"5m"}}"#.utf8)
        let update = try JSONDecoder().decode(ApiAgentV2PortfolioHistoryUpdate.self, from: data)

        XCTAssertEqual(
            Set(ApiAgentV2UpdateType.allCases.map(\.rawValue)),
            ["agentV2", "agentV2PortfolioHistory"]
        )
        XCTAssertEqual(update.type, .portfolioHistory)
        XCTAssertEqual(update.accountId, "account-1")
        XCTAssertEqual(update.range, .day)
        XCTAssertEqual(update.fetchedAtSlot, 7)
    }

    func testDecodesInputContinuationsAndEncodesTheirRunReference() throws {
        let data = Data(#"""
        {
          "type":"agentV2",
          "update":{
            "kind":"inputContinuationsAvailable",
            "clientRunId":"client-run",
            "runId":"run-1",
            "threadId":"thread-1",
            "messageId":"message-1",
            "items":[{
              "id":"continuation-amount",
              "kind":"collect_input",
              "code":"prepare_send_amount",
              "scenario":"prepare-send",
              "field":"amount"
            }]
          }
        }
        """#.utf8)

        let envelope = try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data)
        guard case .inputContinuationsAvailable(let bound, let messageId, let items) = envelope.update else {
            return XCTFail("Expected input continuations")
        }
        XCTAssertEqual(bound.threadId, "thread-1")
        XCTAssertEqual(messageId, "message-1")
        XCTAssertEqual(items.first?.code, .prepareSendAmount)
        XCTAssertEqual(items.first?.field, "amount")

        let command = ApiAgentV2RunCommand(
            threadId: "thread-1",
            expectedThreadRevision: 1,
            input: .append(text: "10"),
            entryPoint: nil,
            continuationOf: .init(messageId: "message-1", continuationId: "continuation-amount")
        )
        let encoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any]
        )
        XCTAssertEqual(
            (encoded["continuationOf"] as? [String: Any])?["continuationId"] as? String,
            "continuation-amount"
        )
    }

    func testOrdinaryIOSRunCommandCannotAttachWalletConversationAuthority() throws {
        let command = ApiAgentV2RunCommand(
            threadId: "thread-1",
            expectedThreadRevision: 7,
            input: .append(text: "What changed?"),
            entryPoint: nil
        )
        let encoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any]
        )
        XCTAssertNil(encoded["walletScopeSelectionOf"])
    }

    func testRejectsUnknownUpdateKind() {
        let data = Data(#"{"type":"agentV2","update":{"kind":"futureUpdate"}}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data))
    }

    func testDecodesEverySemanticContentVariant() throws {
        let fixtures: [[String: Any]] = [
            ["kind": "notice", "schemaVersion": 1, "code": "empty_result"],
            [
                "kind": "walletQuery", "schemaVersion": 1, "queryKind": "transactions",
                "outcome": "complete", "hasMore": false,
                "rows": [[
                    "chain": "ton", "transactionType": "transfer", "status": "completed",
                    "timestamp": "2026-07-30T00:00:00.000Z", "assetSymbol": "TON", "quantity": "1.5"
                ]]
            ],
            [
                "kind": "portfolio", "schemaVersion": 1, "view": "positions", "outcome": "partial",
                "payload": [
                    "id": "portfolio-1", "status": "partial", "accountScope": "current",
                    "baseCurrency": "USD", "generatedAt": "2026-07-30T00:00:00.000Z",
                    "positions": [], "unpriced": [], "omittedUnpricedAssetCount": 0,
                    "dataQuality": ["coverage": "partial", "limitations": ["unpriced_assets"]]
                ]
            ],
            [
                "kind": "market", "schemaVersion": 1, "view": "overview", "outcome": "complete",
                "evidence": ["assets": []], "narrativeMarkdown": "Market **summary**."
            ],
            [
                "kind": "assetSearch", "schemaVersion": 1, "outcome": "complete_absent",
                "reason": "not_found"
            ],
            [
                "kind": "webDigest", "schemaVersion": 1, "outcome": "complete", "summary": "Latest news",
                "items": [[
                    "headline": "TON update", "summary": "Protocol news",
                    "url": "https://example.com/ton", "publishedAt": "2026-07-30T00:00:00.000Z"
                ]]
            ],
            ["kind": "clientUnsupported", "schemaVersion": 1]
        ]

        let decoded = try fixtures.map(decodeSemanticContent)
        XCTAssertEqual(decoded.count, 7)
        guard case .notice = decoded[0],
              case .walletQuery = decoded[1],
              case .portfolio = decoded[2],
              case .market = decoded[3],
              case .assetSearch = decoded[4],
              case .webDigest = decoded[5],
              case .clientUnsupported = decoded[6] else {
            return XCTFail("Expected the six wire variants and local unsupported placeholder")
        }
    }

    func testDecodesTypedFearGreedSmaRegimeAndToleratesUnknownOptionalFields() throws {
        var fearGreedRegime = fearGreedRegimeObject()
        fearGreedRegime["futureDisplayHint"] = "ignored"
        var source = try XCTUnwrap(fearGreedRegime["source"] as? [String: Any])
        source["futureSourceDetail"] = "ignored"
        fearGreedRegime["source"] = source

        let content = try decodeSemanticContent(marketAnalysisObject(fearGreedRegime: fearGreedRegime))
        guard case .market(.analysis(let outcome, let evidence, let analysis, let optionalRegime)) = content else {
            return XCTFail("Expected market analysis with Fear & Greed regime")
        }
        let regime = try XCTUnwrap(optionalRegime)

        XCTAssertEqual(outcome, .complete)
        XCTAssertEqual(evidence, .object(["schemaVersion": .number(6)]))
        XCTAssertEqual(analysis?.summary, "Classic market analysis remains visible.")
        XCTAssertEqual(regime.schemaVersion, 1)
        XCTAssertEqual(regime.policyVersion, .fearGreedSmaRegimeV1)
        XCTAssertEqual(regime.basis, .closedUtcDaily)
        XCTAssertEqual(regime.asOfDate, "2026-08-09")
        XCTAssertEqual(regime.latestValue, 62)
        XCTAssertEqual(regime.sma30, "54.25000000")
        XCTAssertEqual(regime.sma365, "48.12000000")
        XCTAssertEqual(regime.regime, .riskOn)
        XCTAssertEqual(regime.seriesDigest, String(repeating: "a", count: 64))
        XCTAssertEqual(regime.source.provider, "alternative_me")
        XCTAssertEqual(regime.source.endpoint, "alternative.fng")
        XCTAssertTrue(regime.source.attributionRequired)
        XCTAssertEqual(regime.source.attributionLabel, "Alternative.me")
        XCTAssertEqual(
            regime.source.attributionUrl,
            "https://alternative.me/crypto/fear-and-greed-index/"
        )
    }

    func testMalformedFearGreedSmaRegimeFailsSoftWithoutDroppingMarketAnalysis() throws {
        let invalidFields: [(String, Any)] = [
            ("latestValue", 101),
            ("sma30", "54.25"),
            ("sma365", "100.00000001"),
            ("asOfDate", "2026/02/28"),
            ("asOfDate", "2026-02-31"),
            ("seriesDigest", String(repeating: "A", count: 64)),
            ("source", [
                "provider": "alternative_me",
                "endpoint": "unexpected.fng",
                "attributionRequired": true,
                "attributionLabel": "Alternative.me",
                "attributionUrl": "https://alternative.me/crypto/fear-and-greed-index/"
            ])
        ]

        for (field, invalidValue) in invalidFields {
            var fearGreedRegime = fearGreedRegimeObject()
            fearGreedRegime[field] = invalidValue
            let content = try decodeSemanticContent(
                marketAnalysisObject(fearGreedRegime: fearGreedRegime)
            )
            guard case .market(.analysis(let outcome, let evidence, let analysis, let regime)) = content else {
                return XCTFail("Expected malformed optional regime to preserve market analysis")
            }

            XCTAssertEqual(outcome, .complete, "Unexpected outcome for malformed \(field)")
            XCTAssertEqual(
                evidence,
                .object(["schemaVersion": .number(6)]),
                "Evidence was lost for malformed \(field)"
            )
            XCTAssertEqual(
                analysis?.summary,
                "Classic market analysis remains visible.",
                "Analysis was lost for malformed \(field)"
            )
            XCTAssertNil(regime, "Malformed \(field) should drop only the optional regime")
        }
    }

    func testRendersFearGreedSmaRegimeWithBitcoinContextAndAttribution() throws {
        let content = try decodeSemanticContent(
            marketAnalysisObject(fearGreedRegime: fearGreedRegimeObject())
        )
        guard case .market(.analysis(_, _, _, let optionalRegime)) = content else {
            return XCTFail("Expected market analysis with Fear & Greed regime")
        }
        let regime = try XCTUnwrap(optionalRegime)
        let presentation = AgentV2FearGreedRegimePresentation(regime, localize: { $0 })

        XCTAssertEqual(presentation.title, "Bitcoin-based market sentiment")
        XCTAssertEqual(
            presentation.rows.map(\.primary),
            [
                "Fear & Greed index (0–100)",
                "SMA 30",
                "SMA 365",
                "Market regime",
                "As of"
            ]
        )
        XCTAssertEqual(presentation.rows[0].secondary, "Bitcoin · Latest closed 1D candle")
        XCTAssertEqual(presentation.rows[0].value, localizedIntegerString(62))
        XCTAssertEqual(presentation.rows[1].value.replacingOccurrences(of: ",", with: "."), "54.25")
        XCTAssertEqual(presentation.rows[2].value.replacingOccurrences(of: ",", with: "."), "48.12")
        XCTAssertEqual(presentation.rows[3].value, "Risk-on sentiment")
        XCTAssertTrue(presentation.rows[4].value.contains("2026"))
        XCTAssertEqual(presentation.attribution, "Source: Alternative.me")

        let localizedPresentation = AgentV2FearGreedRegimePresentation(regime)
        let visibleCopy = [localizedPresentation.title, localizedPresentation.attribution]
            + localizedPresentation.rows.flatMap { [$0.primary, $0.secondary, $0.value].compactMap { $0 } }
        XCTAssertFalse(visibleCopy.contains { $0.contains("$agent_market_") })

        for (rawRegime, expectedLabel) in [
            ("risk_off", "Risk-off sentiment"),
            ("neutral", "Neutral sentiment")
        ] {
            let variantContent = try decodeSemanticContent(
                marketAnalysisObject(fearGreedRegime: fearGreedRegimeObject(regime: rawRegime))
            )
            guard case .market(.analysis(_, _, _, let variantRegime)) = variantContent else {
                return XCTFail("Expected market analysis with \(rawRegime) regime")
            }
            let variantPresentation = AgentV2FearGreedRegimePresentation(
                try XCTUnwrap(variantRegime),
                localize: { $0 }
            )
            XCTAssertEqual(variantPresentation.rows[3].value, expectedLabel)
        }
    }

    @MainActor
    func testDecodesAndRendersQuarantineWalletContentWithoutUnsafeAssetText() throws {
        let content = try decodeSemanticContent([
            "kind": "walletQuery",
            "schemaVersion": 1,
            "queryKind": "transactions",
            "outcome": "partial",
            "hasMore": false,
            "omittedRows": ["count": 7, "accuracy": "lower_bound"],
            "policySummary": [
                "presentation": "quarantine",
                "suspicious": ["count": 1, "accuracy": "lower_bound"]
            ],
            "rows": [[
                "chain": "ton",
                "transactionType": "transfer",
                "status": "completed",
                "timestamp": "2026-07-30T00:00:00.000Z",
                "assetLabelStatus": "redacted_unsafe",
                "quantity": "1"
            ]]
        ])
        guard case .walletQuery(.transactions(_, _, let omittedRows, let policySummary, let rows)) = content else {
            return XCTFail("Expected quarantine wallet transactions")
        }
        XCTAssertEqual(omittedRows?.count, 7)
        XCTAssertEqual(omittedRows?.accuracy, .lowerBound)
        XCTAssertEqual(policySummary?.presentation, .quarantine)
        XCTAssertEqual(policySummary?.suspicious?.accuracy, .lowerBound)
        XCTAssertEqual(rows.first?.assetLabelStatus, .redactedUnsafe)
        XCTAssertNil(rows.first?.assetSymbol)

        let renderedText = [
            AgentV2WalletQueryPresentation.title(
                queryKind: "transactions",
                policySummary: policySummary
            ),
            AgentV2WalletQueryPresentation.warning(policySummary: policySummary),
            AgentV2WalletQueryPresentation.assetLabel(
                symbol: rows.first?.assetSymbol,
                isRedacted: rows.first?.assetLabelStatus == .redactedUnsafe
            ),
            AgentV2WalletQueryPresentation.omittedRowsText(omittedRows)
        ].compactMap { $0 } + AgentV2WalletQueryPresentation.counterTexts(policySummary)
        let renderedCopy = renderedText.joined(separator: " ")
        XCTAssertTrue(renderedCopy.contains(lang("$agent_semantic_spam_transactions")))
        XCTAssertTrue(renderedCopy.contains(lang("$agent_semantic_quarantine_warning")))
        XCTAssertTrue(renderedCopy.contains(lang("$agent_semantic_redacted_asset")))
        XCTAssertTrue(renderedCopy.contains(L10n.agentSemanticSuspiciousMinimum(amount: 1)))
        XCTAssertTrue(renderedCopy.contains(L10n.agentSemanticOmittedRowsMinimum(amount: 7)))
        XCTAssertFalse(renderedCopy.contains("GRAMEVENT.ORG"))
    }

    @MainActor
    func testDecodesAndPresentsWalletAccountOverviews() throws {
        let content = try decodeSemanticContent([
            "kind": "walletQuery",
            "schemaVersion": 1,
            "queryKind": "accounts",
            "outcome": "partial",
            "hasMore": false,
            "futureDisplay": true,
            "rows": [[
                "accountLabel": "Main | **literal**",
                "accessMode": "regular",
                "portfolioTotalStatus": "partial",
                "portfolioTotal": [
                    "value": "42.5",
                    "baseCurrency": "USD",
                    "unpricedCount": 1,
                    "futureRate": "ignored"
                ]
            ], [
                "accountLabel": "Watch",
                "accessMode": "view_only",
                "portfolioTotalStatus": "unavailable"
            ]]
        ])
        guard case .walletQuery(.accounts(let outcome, _, _, let rows)) = content else {
            return XCTFail("Expected wallet account overviews")
        }

        XCTAssertEqual(outcome, .partial)
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].portfolioTotal?.value, "42.5")
        XCTAssertEqual(rows[0].portfolioTotal?.baseCurrency, "USD")
        XCTAssertEqual(rows[0].portfolioTotal?.unpricedCount, 1)
        XCTAssertEqual(rows[1].portfolioTotalStatus, .unavailable)
        XCTAssertNil(rows[1].portfolioTotal)
        XCTAssertEqual(
            AgentV2WalletQueryPresentation.accountAccessMode(rows[0].accessMode),
            lang("$agent_semantic_access_regular")
        )
        XCTAssertEqual(
            AgentV2WalletQueryPresentation.accountAccessMode(rows[1].accessMode),
            lang("$agent_semantic_access_view_only")
        )
        let notices = AgentV2WalletQueryPresentation.accountNotices(outcome: outcome, rows: rows)
        XCTAssertTrue(notices.contains(L10n.agentSemanticWalletsUnpriced(amount: 1)))
        XCTAssertTrue(notices.contains(lang("$agent_semantic_wallets_unavailable")))
    }

    @MainActor
    func testPartialWalletAccountsDoNotInventStaleOrGenericPartialNotices() throws {
        let content = try decodeSemanticContent([
            "kind": "walletQuery",
            "schemaVersion": 1,
            "queryKind": "accounts",
            "outcome": "partial",
            "hasMore": false,
            "rows": [[
                "accountLabel": "Main",
                "accessMode": "regular",
                "portfolioTotalStatus": "complete",
                "portfolioTotal": [
                    "value": "42.5",
                    "baseCurrency": "USD",
                    "unpricedCount": 0
                ]
            ]]
        ])
        guard case .walletQuery(.accounts(let outcome, _, _, let rows)) = content else {
            return XCTFail("Expected wallet account overviews")
        }

        XCTAssertEqual(AgentV2WalletQueryPresentation.accountNotices(outcome: outcome, rows: rows), [])
    }

    @MainActor
    func testAssetSearchPresentationUsesExplicitOutcomeInsteadOfMissingRows() throws {
        let cases: [(String, String?, String?)] = [
            ("complete_absent", "not_found", lang("$agent_semantic_no_results")),
            ("incomplete_unconfirmed", nil, lang("$agent_notice_wallet_unavailable")),
            ("scope_denied", "consent_required", lang("$agent_notice_consent_required")),
            ("scope_denied", "account_scope_not_allowed", lang("$agent_notice_tool_unavailable")),
            ("complete_matches", nil, nil)
        ]
        for (outcome, reason, expectedStatus) in cases {
            var object: [String: Any] = [
                "kind": "assetSearch",
                "schemaVersion": 1,
                "outcome": outcome
            ]
            if let reason { object["reason"] = reason }
            guard case .assetSearch(let content) = try decodeSemanticContent(object) else {
                return XCTFail("Expected asset search content")
            }
            let status = AgentV2AssetSearchPresentation.status(content)
            if let expectedStatus {
                XCTAssertEqual(status, expectedStatus, "Missing status for \(outcome)")
            } else {
                XCTAssertNil(status)
            }
        }
    }

    @MainActor
    func testDecodesAndPresentsHiddenAssetLabelsAsWarnedPlaintext() throws {
        let content = try decodeSemanticContent([
            "kind": "walletQuery",
            "schemaVersion": 1,
            "queryKind": "positions",
            "outcome": "complete",
            "hasMore": false,
            "policySummary": [
                "presentation": "hidden_review",
                "suspicious": ["count": 1, "accuracy": "exact"]
            ],
            "rows": [[
                "chain": "ton",
                "positionKind": "fungible",
                "assetName": "Gram Event",
                "assetSymbol": "GRAM AT GRAMEVENT.ORG",
                "assetLabelStatus": "untrusted_plaintext",
                "quantity": "100"
            ]]
        ])
        guard case .walletQuery(.positions(_, _, _, let policySummary, let rows)) = content else {
            return XCTFail("Expected hidden wallet positions")
        }
        XCTAssertEqual(policySummary?.presentation, .hiddenReview)
        XCTAssertEqual(rows.first?.assetLabelStatus, .untrustedPlaintext)

        let renderedText = [
            AgentV2WalletQueryPresentation.title(
                queryKind: "positions",
                policySummary: policySummary
            ),
            AgentV2WalletQueryPresentation.warning(policySummary: policySummary),
            AgentV2WalletQueryPresentation.assetLabel(
                name: rows.first?.assetName,
                symbol: rows.first?.assetSymbol,
                isRedacted: rows.first?.assetLabelStatus == .redactedUnsafe
            )
        ].compactMap { $0 } + AgentV2WalletQueryPresentation.counterTexts(policySummary)
        let renderedCopy = renderedText.joined(separator: " ")
        XCTAssertTrue(renderedCopy.contains(lang("$agent_semantic_hidden_assets")))
        XCTAssertTrue(renderedCopy.contains(lang("$agent_semantic_hidden_assets_warning")))
        XCTAssertTrue(renderedCopy.contains("Gram Event (GRAM AT GRAMEVENT.ORG)"))
        XCTAssertTrue(renderedCopy.contains(L10n.agentSemanticSuspiciousShown(amount: 1)))
        XCTAssertFalse(renderedCopy.contains(lang("$agent_semantic_redacted_asset")))
    }

    func testUnsupportedSemanticExtensionsUseLocalFallbackAndKnownMalformedContentFailsClosed() throws {
        guard case .clientUnsupported = try decodeSemanticContent([
            "kind": "clientUnsupported", "schemaVersion": 1
        ]) else {
            return XCTFail("Expected local unsupported semantic placeholder")
        }
        guard case .clientUnsupported = try decodeSemanticContent([
            "kind": "futureContent", "schemaVersion": 1
        ]) else {
            return XCTFail("Expected unknown semantic kind fallback")
        }
        guard case .clientUnsupported = try decodeSemanticContent([
            "kind": "notice", "schemaVersion": 2, "code": "empty_result"
        ]) else {
            return XCTFail("Expected unknown semantic version fallback")
        }
        guard case .clientUnsupported = try decodeSemanticContent([
            "kind": "notice", "schemaVersion": 1, "code": "future_notice"
        ]) else {
            return XCTFail("Expected unknown notice code fallback")
        }
        XCTAssertThrowsError(try decodeSemanticContent([
            "kind": "notice",
            "schemaVersion": 1,
            "code": "market_quote",
            "arguments": ["marketQuote": ["status": "resolved"]]
        ]))

        let removedEvent = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": ["kind": "widgetAvailable", "widget": ["kind": "removedWidget"]]
        ])
        XCTAssertThrowsError(try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: removedEvent))
    }

    @MainActor
    func testSemanticMessageLifecycleKeepsWalletControlsOutsideContent() async throws {
        let started = Data(#"""
        {
          "type":"agentV2",
          "update":{
            "kind":"messageStarted",
            "clientRunId":"client-1",
            "runId":"run-1",
            "threadId":"thread-1",
            "messageId":"message-1",
            "contentKind":"semantic"
          }
        }
        """#.utf8)
        let startedEnvelope = try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: started)
        guard case .messageStarted(_, let messageId, let contentKind) = startedEnvelope.update else {
            return XCTFail("Expected message start")
        }
        XCTAssertEqual(messageId, "message-1")
        XCTAssertEqual(contentKind, .semantic)

        let semantic = Data(#"""
        {
          "type":"agentV2",
          "update":{
            "kind":"semanticContentAvailable",
            "clientRunId":"client-1",
            "runId":"run-1",
            "threadId":"thread-1",
            "messageId":"message-1",
            "content":{"kind":"notice","schemaVersion":1,"code":"receive_ready"}
          }
        }
        """#.utf8)
        let semanticEnvelope = try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: semantic)

        let completed = Data(#"""
        {
          "type":"agentV2",
          "update":{
            "kind":"messageCompleted",
            "clientRunId":"client-1",
            "runId":"run-1",
            "threadId":"thread-1",
            "messageId":"message-1",
            "finishReason":"complete",
            "walletControls":{
              "scopeChoices":[{
                "choiceId":"choice_0000000000000000000000",
                "scopeAnchor":"scope_0000000000000000000000",
                "label":"Main wallet",
                "ordinal":1
              }],
              "expiresAt":"2099-07-31T12:15:00.000Z"
            }
          }
        }
        """#.utf8)
        let completedEnvelope = try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: completed)
        guard case .messageCompleted(_, _, _, let context) = completedEnvelope.update else {
            return XCTFail("Expected message completion")
        }
        XCTAssertEqual(context?.scopeChoices.first?.label, "Main wallet")

        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-1"))
        await coordinator.loadDefaultThread()
        coordinator.walletCore(event: .agentV2(startedEnvelope.update))
        coordinator.walletCore(event: .agentV2(semanticEnvelope.update))
        coordinator.walletCore(event: .agentV2(completedEnvelope.update))
        XCTAssertEqual(coordinator.messages.first?.status, .complete)
        XCTAssertEqual(coordinator.messages.first?.contentKind, .semantic)
        XCTAssertEqual(coordinator.messages.first?.walletControls?.scopeChoices.first?.label, "Main wallet")
        guard case .some(.notice(let notice)) = coordinator.messages.first?.semanticContent else {
            return XCTFail("Expected native semantic notice")
        }
        XCTAssertEqual(notice.code, .receiveReady)
    }

    func testRunResultPreservesCanonicalInputMessageId() throws {
        let result = try JSONDecoder().decode(
            ApiAgentV2RunResult.self,
            from: Data(#"{"clientRunId":"client-1","runId":"run-1","inputMessageId":"message-1","state":"completed"}"#.utf8)
        )
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(result)) as? [String: Any]

        XCTAssertEqual(encoded?["inputMessageId"] as? String, "message-1")
    }

    func testRunResultDecodesInterruptedState() throws {
        let result = try JSONDecoder().decode(
            ApiAgentV2RunResult.self,
            from: Data(#"{"clientRunId":"client-1","state":"interrupted"}"#.utf8)
        )

        XCTAssertEqual(result.state, .interrupted)
    }

    func testRunStartedPreservesCanonicalInputMessageId() throws {
        let envelope = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"runStarted","clientRunId":"client-1","runId":"run-1","threadId":"thread-1","threadRevision":2,"inputMessageId":"message-1"}}"#.utf8)
        )
        guard case .runStarted(_, _, let inputMessageId) = envelope.update else {
            return XCTFail("Expected run start")
        }

        XCTAssertEqual(inputMessageId, "message-1")
    }

    @MainActor
    func testCoordinatorSubmitsSelectedWalletScopeContinuation() async throws {
        let client = FakeAgentV2Client(defaultThreadId: "thread-1", shouldCompleteRun: true)
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let started = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"""
            {"type":"agentV2","update":{"kind":"messageStarted","clientRunId":"client-1","runId":"run-1","threadId":"thread-1","messageId":"message-1","contentKind":"semantic"}}
            """#.utf8)
        )
        let completed = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"""
            {"type":"agentV2","update":{"kind":"messageCompleted","clientRunId":"client-1","runId":"run-1","threadId":"thread-1","messageId":"message-1","finishReason":"complete","walletControls":{"scopeChoices":[{"choiceId":"choice_0000000000000000000000","label":"Savings"}],"expiresAt":"2099-07-31T12:15:00.000Z"}}}
            """#.utf8)
        )
        coordinator.walletCore(event: .agentV2(started.update))
        coordinator.walletCore(event: .agentV2(completed.update))

        coordinator.selectWalletScopeChoice(
            messageId: "message-1",
            choiceId: "choice_0000000000000000000000"
        )
        try await Task.sleep(for: .milliseconds(50))

        let command = try XCTUnwrap(client.startedCommands.first)
        XCTAssertEqual(command.input, .append(text: "Savings"))
        XCTAssertEqual(command.walletScopeSelectionOf?.sourceAssistantMessageId, "message-1")
        XCTAssertEqual(command.walletScopeSelectionOf?.choiceId, "choice_0000000000000000000000")
    }

    func testDecodesHideSpamResolution() throws {
        let resolved = try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"hideSpamAssets","slugs":["spam-token"]}"#.utf8)
        )
        XCTAssertEqual(resolved.kind, .hideSpamAssets)
        XCTAssertEqual(resolved.slugs, ["spam-token"])
    }

    func testRejectsUnknownWalletPresentationKinds() {
        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2ResolvedAction.self,
            from: Data(#"{"kind":"openArbitraryRoute"}"#.utf8)
        ))
        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2ActionPresentation.self,
            from: Data(#"{"kind":"futurePresentation"}"#.utf8)
        ))
    }

    func testActionPresentationRejectsIncompleteSendState() {
        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2ActionPresentation.self,
            from: Data(#"{"kind":"send","status":"active"}"#.utf8)
        ))
    }

    func testRunResultRejectsUnknownTerminalState() {
        XCTAssertThrowsError(try JSONDecoder().decode(
            ApiAgentV2RunResult.self,
            from: Data(#"{"clientRunId":"client-1","runId":"run-1","state":"future_state"}"#.utf8)
        ))
    }

    func testSendReviewUsesJSONSafeAtomicString() throws {
        let data = Data(#"""
        {
          "kind":"reviewSend",
          "draftId":"draft-1",
          "chain":"ton",
          "review":{
            "tokenSlug":"toncoin",
            "amountAtomic":"1250000000",
            "toAddress":"UQ-safe-fixture",
            "comment":"hello"
          }
        }
        """#.utf8)

        let action = try JSONDecoder().decode(ApiAgentV2ResolvedAction.self, from: data)
        XCTAssertEqual(action.review?.amountAtomic, "1250000000")
        XCTAssertNoThrow(try JSONEncoder().encode(action))
    }

    @MainActor
    func testBuildsBoundedPortfolioChart() throws {
        let data = Data(#"""
        {
          "kind":"portfolio",
          "schemaVersion":1,
          "view":"analysis",
          "outcome":"complete",
          "payload":{
            "id":"portfolio-1",
            "status":"complete",
            "accountScope":"current",
            "baseCurrency":"USD",
            "range":"1d",
            "generatedAt":"2026-07-22T00:00:00.000Z",
            "totalValue":{"value":"110","currency":"USD","asOf":"2026-07-22T00:00:00.000Z"},
            "performance":{
              "chart":{
                "kind":"stacked_net_worth",
                "range":"1d",
                "baseCurrency":"USD",
                "timestamps":[1752969600,1752973200],
                "series":[{
                  "asset":{"slug":"toncoin","chain":"ton","symbol":"TON"},
                  "values":["100","110"]
                }]
              }
            }
          }
        }
        """#.utf8)

        let content = try JSONDecoder().decode(ApiAgentV2SemanticContent.self, from: data)
        guard case .portfolio(.analysis(_, let payload, _)) = content else {
            return XCTFail("Expected portfolio analysis")
        }
        let json = try XCTUnwrap(AgentV2PortfolioChartAdapter.makeJSON(payload))
        XCTAssertTrue(json.contains("1752969600000"))
        XCTAssertTrue(json.contains("\"stacked\":true"))
    }

    @MainActor
    func testUpdatesForAnotherThreadAreRejected() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()
        for update in try [
            decodeUpdate(kind: "messageStarted", threadId: "thread-a", messageId: "message-a"),
            decodeUpdate(kind: "messageStarted", threadId: "thread-b", messageId: "message-b"),
            decodeUpdate(kind: "textDelta", threadId: "thread-a", messageId: "message-a", delta: "Alpha"),
            decodeUpdate(kind: "textDelta", threadId: "thread-b", messageId: "message-b", delta: "Beta")
        ] {
            coordinator.walletCore(event: .agentV2(update))
        }

        XCTAssertEqual(coordinator.messages.map(\.text), ["Alpha"])
        XCTAssertEqual(coordinator.messages.map(\.threadId), ["thread-a"])
    }

    @MainActor
    func testTextDeltaUsesTargetedCoordinatorChange() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()
        let observer = AgentV2CoordinatorObserverSpy()
        coordinator.addObserver(observer)

        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "message-a",
            delta: "Hello"
        )))

        XCTAssertEqual(observer.changes, [
            .reload,
            .messageUpdated(id: "message-a")
        ])
    }

    @MainActor
    func testCoordinatorPublishesRunActivityUntilAnswerTextStarts() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()

        coordinator.walletCore(event: .agentV2(try decodeRunActivityUpdate(threadId: "thread-a")))
        XCTAssertEqual(coordinator.runActivity?.code, .webReadingSources)
        XCTAssertEqual(coordinator.runActivity?.detail?.count, 4)

        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "message-a",
            delta: "Answer"
        )))

        XCTAssertNil(coordinator.runActivity)
    }

    @MainActor
    func testWalletContextRefreshKeepsTheActiveRunAndActivity() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()

        coordinator.walletCore(event: .agentV2(try decodeRunStartedUpdate(threadId: "thread-a")))
        coordinator.walletCore(event: .agentV2(try decodeRunActivityUpdate(threadId: "thread-a")))
        coordinator.walletCore(event: .agentV2(try decodeUnboundUpdate(kind: "walletContextChanged")))

        XCTAssertEqual(coordinator.activeRun?.isRunning, true)
        XCTAssertEqual(coordinator.runActivity?.code, .webReadingSources)
    }

    @MainActor
    func testAuthorityChangeTerminatesTheNativeRunState() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()

        coordinator.walletCore(event: .agentV2(try decodeRunStartedUpdate(threadId: "thread-a")))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeRunActivityUpdate(threadId: "thread-a")))
        coordinator.walletCore(event: .agentV2(try decodeUnboundUpdate(kind: "walletAuthorityChanged")))

        XCTAssertEqual(coordinator.activeRun?.isRunning, false)
        XCTAssertNil(coordinator.runActivity)
        XCTAssertEqual(coordinator.messages.first?.status, .cancelled)
    }

    @MainActor
    func testChatDisplaysLocalizedRunActivityUntilAnswerTextStarts() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()

        coordinator.walletCore(event: .agentV2(try decodeRunActivityUpdate(threadId: "thread-a")))
        let activityLabel = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? UILabel }
            .first(where: { $0.accessibilityTraits.contains(.updatesFrequently) }))
        XCTAssertEqual(activityLabel.text, L10n.agentActivityWebReadingSourcesCompleted(count: 4))
        XCTAssertFalse(activityLabel.superview?.isHidden == true)

        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "message-a",
            delta: "Answer"
        )))

        XCTAssertTrue(activityLabel.superview?.isHidden == true)
    }

    @MainActor
    func testRunStartReconcilesOptimisticInputMessageIdentity() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
        await coordinator.loadDefaultThread()

        coordinator.send(
            input: .append(text: "Question"),
            visibleText: "Question"
        )
        XCTAssertTrue(coordinator.messages.first?.id.hasPrefix("local-") == true)

        coordinator.walletCore(event: .agentV2(try decodeRunStartedUpdate(
            threadId: "thread-a",
            inputMessageId: "canonical-user-message"
        )))

        XCTAssertEqual(coordinator.messages.map(\.id), ["canonical-user-message"])
        XCTAssertEqual(coordinator.messages.first?.text, "Question")
    }

    @MainActor
    func testRegenerateRunStartDoesNotReconcileAnInputMessage() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [[
            "id": "assistant-message",
            "threadId": "thread-a",
            "role": "assistant",
            "status": "complete",
            "content": ["kind": "markdown", "text": "Answer"],
            "createdAt": "2026-07-22T00:00:01.000Z"
        ]])
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
        await coordinator.loadDefaultThread()

        coordinator.send(input: .regenerate(targetAssistantMessageId: "assistant-message"))
        coordinator.walletCore(event: .agentV2(try decodeRunStartedUpdate(
            threadId: "thread-a",
            inputMessageId: nil
        )))

        XCTAssertEqual(coordinator.messages.map(\.id), ["assistant-message"])
    }

    @MainActor
    func testTerminalRunUpdatesFinalizePartialMarkdownMessages() async throws {
        for terminalUpdate in try [
            decodeRunFailedUpdate(threadId: "thread-a"),
            decodeRunCancelledUpdate(threadId: "thread-a")
        ] {
            let hydration = try decodeHydration(threadId: "thread-a", messages: [])
            let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
            await coordinator.loadDefaultThread()
            coordinator.walletCore(event: .agentV2(try decodeUpdate(
                kind: "messageStarted",
                threadId: "thread-a",
                messageId: "message-a"
            )))
            coordinator.walletCore(event: .agentV2(try decodeUpdate(
                kind: "textDelta",
                threadId: "thread-a",
                messageId: "message-a",
                delta: "Partial response"
            )))

            coordinator.walletCore(event: .agentV2(terminalUpdate))

            XCTAssertEqual(coordinator.messages.first?.status, .complete)
            XCTAssertEqual(coordinator.messages.first?.text, "Partial response")
        }
    }

    @MainActor
    func testSemanticMessageIgnoresTextDeltas() async throws {
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(defaultThreadId: "thread-a"))
        await coordinator.loadDefaultThread()
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a",
            contentKind: .semantic
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "message-a",
            delta: "Presentation text must not leak"
        )))

        XCTAssertEqual(coordinator.messages.first?.contentKind, .semantic)
        XCTAssertEqual(coordinator.messages.first?.text, "")
    }

    @MainActor
    func testSendPresentationExpiresInNativeState() async throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiresAt = formatter.string(from: Date().addingTimeInterval(0.3))
        let presentation = try JSONDecoder().decode(
            ApiAgentV2ActionPresentation.self,
            from: JSONSerialization.data(withJSONObject: [
                "kind": "send",
                "status": "active",
                "amount": ["value": "1", "symbol": "TON"],
                "network": "ton",
                "accountLabel": "Wallet",
                "recipient": ["kind": "external"],
                "feeStatus": "calculated_in_wallet",
                "warningCodes": [],
                "expiresAt": expiresAt
            ])
        )
        let coordinator = AgentV2Coordinator(
            client: FakeAgentV2Client(defaultThreadId: "thread-a", actionPresentationResult: presentation)
        )
        await coordinator.loadDefaultThread()
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeActionUpdate(
            threadId: "thread-a",
            messageId: "message-a"
        )))

        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(
            coordinator.messages.first?.actions.first?.presentation?.kind,
            .send
        )
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertNil(coordinator.messages.first?.actions.first?.presentation)
    }

    @MainActor
    func testHydrationRestoresPreparedSendPresentation() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [[
            "id": "message-a",
            "threadId": "thread-a",
            "role": "assistant",
            "status": "complete",
            "content": ["kind": "markdown", "text": "Review the transfer"],
            "createdAt": "2026-07-22T00:00:01.000Z",
            "actions": [[
                "id": "action-a",
                "kind": "send",
                "labelCode": "review_transfer",
                "draftId": "draft-a",
                "draftExpiresAt": "2099-07-22T00:00:01.000Z",
                "requiresConfirmation": true
            ]]
        ]])
        let presentation = try decodeSendPresentation(accountLabel: "Current Wallet")
        let client = FakeAgentV2Client(
            actionPresentationResult: presentation,
            hydrationResult: hydration
        )
        let coordinator = AgentV2Coordinator(client: client)

        await coordinator.loadDefaultThread()
        await waitForActionPresentationRequest(client)
        for _ in 0..<20 where coordinator.messages.first?.actions.first?.presentation == nil {
            await Task.yield()
        }

        XCTAssertEqual(coordinator.messages.first?.actions.first?.presentation, presentation)
    }

    @MainActor
    func testAuthorityInvalidationRejectsAnOlderPresentationResponse() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let oldPresentation = try decodeSendPresentation(accountLabel: "Old Wallet")
        let refreshedPresentation = try decodeSendPresentation(accountLabel: "Current Wallet")
        let client = FakeAgentV2Client(
            actionPresentationResults: [oldPresentation, refreshedPresentation],
            hydrationResult: hydration,
            blockedActionPresentationAttempt: 1
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "message-a"
        )))
        coordinator.walletCore(event: .agentV2(try decodeActionUpdate(
            threadId: "thread-a",
            messageId: "message-a"
        )))
        await waitForActionPresentationRequest(client)

        let authorityChanged = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"{"type":"agentV2","update":{"kind":"walletAuthorityChanged"}}"#.utf8)
        )
        coordinator.walletCore(event: .agentV2(authorityChanged.update))
        await waitForActionPresentationRequest(client, count: 2)
        for _ in 0..<20 where coordinator.messages.first?.actions.first?.presentation != refreshedPresentation {
            await Task.yield()
        }

        XCTAssertEqual(coordinator.messages.first?.actions.first?.presentation, refreshedPresentation)

        client.resumeBlockedActionPresentation()
        for _ in 0..<20 {
            await Task.yield()
        }

        XCTAssertEqual(coordinator.messages.first?.actions.first?.presentation, refreshedPresentation)
    }

    @MainActor
    func testPreparedSendUsesTheGenericAgentActionPresentation() throws {
        let presentation = try JSONDecoder().decode(
            ApiAgentV2ActionPresentation.self,
            from: Data(#"{"kind":"send","status":"active","amount":{"value":"0.5","symbol":"GRAM"},"network":"ton","accountLabel":"Main","recipient":{"kind":"savedAddress","label":"Mom"},"feeStatus":"calculated_in_wallet","warningCodes":[]}"#.utf8)
        )
        var message = AgentV2NativeMessage(
            id: "message-a",
            threadId: "thread-a",
            role: .assistant,
            text: "",
            status: .complete
        )
        message.actions = [AgentV2NativeAction(
            id: "action-a",
            kind: .send,
            labelCode: .reviewTransfer,
            presentation: presentation
        )]
        let cell = AgentV2MessageCell(style: .default, reuseIdentifier: nil)

        cell.configure(message: message)

        let views = descendantViews(of: cell.contentView)
        let actionTitle = AgentV2Copy.action(.reviewTransfer)
        let labels = views.compactMap { ($0 as? UILabel)?.text }
        let actionButton = try XCTUnwrap(views.compactMap { $0 as? UIButton }.first {
            $0.configuration?.title == actionTitle
        })
        XCTAssertTrue(labels.contains(actionTitle))
        XCTAssertFalse(labels.contains("0.5 GRAM"))
        XCTAssertFalse(labels.contains("Mom"))
        XCTAssertTrue(actionButton.isEnabled)

        message.actions[0].presentation = nil
        cell.configure(message: message)
        let inactiveButton = try XCTUnwrap(descendantViews(of: cell.contentView)
            .compactMap { $0 as? UIButton }
            .first { $0.configuration?.title == actionTitle })
        XCTAssertFalse(inactiveButton.isEnabled)
    }

    @MainActor
    func testPlainMessagesDoNotOfferMutationActions() {
        let cell = AgentV2MessageCell(style: .default, reuseIdentifier: nil)
        let messages = [
            AgentV2NativeMessage(
                id: "user-message",
                threadId: "thread-a",
                role: .user,
                text: "Question"
            ),
            AgentV2NativeMessage(
                id: "assistant-message",
                threadId: "thread-a",
                role: .assistant,
                text: "Answer"
            )
        ]

        for message in messages {
            cell.configure(message: message)

            XCTAssertTrue(descendantViews(of: cell.contentView).compactMap { $0 as? UIButton }.isEmpty)
        }
    }

    @MainActor
    func testMarkdownStreamingAnswerKeepsItsRevealViewAcrossUpdates() throws {
        let cell = AgentV2MessageCell(style: .default, reuseIdentifier: nil)
        var message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Hello",
            status: .streaming
        )

        cell.configure(message: message, revealPhase: .streaming)
        let initialView = try XCTUnwrap(descendantViews(of: cell.contentView)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)
        let initialContainer = try XCTUnwrap(initialView.superview)
        XCTAssertEqual(initialView.displayText, "Hello")

        message.appendMarkdown(" world")
        cell.configure(message: message, revealPhase: .streaming)
        let updatedView = try XCTUnwrap(descendantViews(of: cell.contentView)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)
        XCTAssertTrue(initialView === updatedView)
        XCTAssertTrue(initialContainer === updatedView.superview)
        XCTAssertEqual(updatedView.displayText, "Hello world")

        message.finalize()
        cell.configure(message: message, revealPhase: .finishing)
        let completedView = try XCTUnwrap(descendantViews(of: cell.contentView)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)
        XCTAssertTrue(initialView === completedView)
        XCTAssertTrue(initialContainer === completedView.superview)
        XCTAssertEqual(completedView.displayText, "Hello world")
    }

    @MainActor
    func testCompletedAnswerRendersStaticallyWhenStreamingEventsArriveBeforeCellIsVisible() async throws {
        let hydration = try decodeHydration(threadId: "thread-a", messages: [])
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()
        viewController.view.frame = .zero
        viewController.view.layoutIfNeeded()

        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "assistant-message"
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "assistant-message",
            delta: "Complete answer."
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageCompleted",
            threadId: "thread-a",
            messageId: "assistant-message"
        )))

        viewController.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        viewController.view.layoutIfNeeded()
        await Task.yield()

        let cell = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? AgentV2MessageCell }
            .first)
        let streamingView = try XCTUnwrap(descendantViews(of: cell.contentView)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)
        XCTAssertEqual(streamingView.displayText, "Complete answer.")
        XCTAssertFalse(cell.isStreamingRevealActive)
    }

    @MainActor
    func testCompletedStreamingRevealDoesNotRestartDuringFinalCellLayout() async throws {
        let cell = AgentV2MessageCell(style: .default, reuseIdentifier: nil)
        var message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Animated response",
            status: .streaming
        )
        var revealPhase = AgentV2MessageRevealPhase.streaming
        var completionCount = 0
        cell.onPreferredHeightChanged = { [weak cell] in
            cell?.configure(message: message, revealPhase: revealPhase)
        }
        cell.onStreamingRevealCompleted = {
            revealPhase = .staticContent
            completionCount += 1
        }

        cell.configure(message: message, revealPhase: revealPhase)
        message.finalize()
        revealPhase = .finishing
        cell.configure(message: message, revealPhase: revealPhase)

        for _ in 0..<300 where completionCount < 2 {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(completionCount, 1)
        XCTAssertFalse(cell.isStreamingRevealActive)
    }

    @MainActor
    func testChatPresentationStateOwnsTheRevealLifecycle() {
        var state = AgentV2ChatPresentationState()
        var message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Animated response",
            status: .streaming
        )

        state.synchronize(messages: [message], isNearBottom: true)
        XCTAssertEqual(state.revealPhase(for: message), .streaming)
        XCTAssertTrue(state.shouldPreserveBottom(isNearBottom: false))

        message.finalize()
        state.synchronize(messages: [message], isNearBottom: false)
        XCTAssertEqual(state.revealPhase(for: message), .finishing)

        state.revealCompleted(messageId: message.id)
        XCTAssertEqual(state.revealPhase(for: message), .staticContent)
    }

    @MainActor
    func testManualScrollingSuspendsRevealAutoScrollUntilTheUserReturnsToBottom() {
        var state = AgentV2ChatPresentationState()
        let message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Animated response",
            status: .streaming
        )

        state.synchronize(messages: [message], isNearBottom: true)
        state.userStartedScrolling()
        XCTAssertFalse(state.shouldPreserveBottom(isNearBottom: true))

        state.userFinishedScrolling(isNearBottom: false)
        XCTAssertFalse(state.shouldPreserveBottom(isNearBottom: false))

        state.userFinishedScrolling(isNearBottom: true)
        XCTAssertTrue(state.shouldPreserveBottom(isNearBottom: false))
    }

    @MainActor
    func testStreamingRevealDoesNotRestartAfterLeavingTheViewport() {
        var state = AgentV2ChatPresentationState()
        var message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Animated response",
            status: .streaming
        )

        state.synchronize(messages: [message], isNearBottom: true)
        state.userStartedScrolling()
        state.revealLeftViewport(messageId: message.id)
        state.synchronize(messages: [message], isNearBottom: false)

        XCTAssertEqual(state.revealPhase(for: message), .staticContent)
        XCTAssertFalse(state.hasActiveReveal)

        message.finalize()
        state.synchronize(messages: [message], isNearBottom: false)
        XCTAssertEqual(state.revealPhase(for: message), .staticContent)
    }

    @MainActor
    func testLayoutDrivenCellTransitionsKeepFollowingTheStreamingReveal() {
        var state = AgentV2ChatPresentationState()
        let message = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Animated response",
            status: .streaming
        )

        state.synchronize(messages: [message], isNearBottom: true)
        state.revealLeftViewport(messageId: message.id)

        XCTAssertEqual(state.revealPhase(for: message), .streaming)
        XCTAssertTrue(state.hasActiveReveal)
        XCTAssertTrue(state.shouldPreserveBottom(isNearBottom: false))
    }

    @MainActor
    func testSemanticMessageTransitionEndsItsMarkdownRevealSession() {
        var state = AgentV2ChatPresentationState()
        let markdownMessage = AgentV2NativeMessage(
            id: "assistant-message",
            threadId: "thread-a",
            role: .assistant,
            text: "Temporary markdown",
            status: .streaming
        )
        let semanticMessage = AgentV2NativeMessage(
            id: markdownMessage.id,
            threadId: markdownMessage.threadId,
            role: .assistant,
            text: "",
            contentKind: .semantic,
            status: .streaming
        )

        state.synchronize(messages: [markdownMessage], isNearBottom: true)
        state.synchronize(messages: [semanticMessage], isNearBottom: true)

        XCTAssertEqual(state.revealPhase(for: semanticMessage), .staticContent)
        XCTAssertFalse(state.hasActiveReveal)
    }

    @MainActor
    func testStreamingRevealKeepsTheConversationPinnedToTheBottom() async throws {
        let previousText = (1...40).map { "Previous line \($0)." }.joined(separator: "\n")
        let hydration = try decodeHydration(threadId: "thread-a", messages: [[
            "id": "previous-message",
            "threadId": "thread-a",
            "role": "assistant",
            "status": "complete",
            "content": ["kind": "markdown", "text": previousText],
            "createdAt": "2026-07-22T00:00:01.000Z"
        ]])
        let coordinator = AgentV2Coordinator(client: FakeAgentV2Client(hydrationResult: hydration))
        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()
        viewController.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        viewController.view.layoutIfNeeded()
        let tableView = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? UITableView }
            .first)
        let lastSection = tableView.numberOfSections - 1
        let lastRow = tableView.numberOfRows(inSection: lastSection) - 1
        tableView.scrollToRow(
            at: IndexPath(row: lastRow, section: lastSection),
            at: .bottom,
            animated: false
        )
        viewController.view.layoutIfNeeded()

        let responseDeltas = (1...80).map { "Part \($0). " }
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "assistant-message"
        )))
        for delta in responseDeltas.prefix(40) {
            coordinator.walletCore(event: .agentV2(try decodeUpdate(
                kind: "textDelta",
                threadId: "thread-a",
                messageId: "assistant-message",
                delta: delta
            )))
            await Task.yield()
            viewController.view.layoutIfNeeded()
        }
        for _ in 0..<5 {
            try await Task.sleep(for: .milliseconds(10))
            viewController.view.layoutIfNeeded()
        }
        XCTAssertLessThan(bottomDistance(in: tableView), 2)

        tableView.contentOffset.y -= 120
        for delta in responseDeltas.dropFirst(40).prefix(20) {
            coordinator.walletCore(event: .agentV2(try decodeUpdate(
                kind: "textDelta",
                threadId: "thread-a",
                messageId: "assistant-message",
                delta: delta
            )))
            await Task.yield()
            viewController.view.layoutIfNeeded()
        }
        for _ in 0..<5 {
            try await Task.sleep(for: .milliseconds(10))
            viewController.view.layoutIfNeeded()
        }
        XCTAssertLessThan(bottomDistance(in: tableView), 2)

        tableView.delegate?.scrollViewWillBeginDragging?(tableView)
        tableView.contentOffset.y -= 120
        for delta in responseDeltas.dropFirst(60) {
            coordinator.walletCore(event: .agentV2(try decodeUpdate(
                kind: "textDelta",
                threadId: "thread-a",
                messageId: "assistant-message",
                delta: delta
            )))
            await Task.yield()
            viewController.view.layoutIfNeeded()
        }
        for _ in 0..<5 {
            try await Task.sleep(for: .milliseconds(10))
            viewController.view.layoutIfNeeded()
        }
        XCTAssertGreaterThan(bottomDistance(in: tableView), 80)

        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageCompleted",
            threadId: "thread-a",
            messageId: "assistant-message"
        )))
    }

    @MainActor
    func testCanonicalHydrationKeepsTheVisibleStreamingAnswerView() async throws {
        let initialHydration = try decodeHydration(threadId: "thread-a", messages: [])
        let finalHydration = try decodeHydration(threadId: "thread-a", messages: [[
            "id": "assistant-message",
            "threadId": "thread-a",
            "role": "assistant",
            "status": "complete",
            "content": ["kind": "markdown", "text": "Hello world"],
            "createdAt": "2026-07-22T00:00:01.000Z"
        ]])
        let client = FakeAgentV2Client(hydrationResult: initialHydration)
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let viewController = AgentV2ChatVC(coordinator: coordinator)
        viewController.loadViewIfNeeded()
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "messageStarted",
            threadId: "thread-a",
            messageId: "assistant-message"
        )))
        coordinator.walletCore(event: .agentV2(try decodeUpdate(
            kind: "textDelta",
            threadId: "thread-a",
            messageId: "assistant-message",
            delta: "Hello world"
        )))
        viewController.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        viewController.view.layoutIfNeeded()
        let initialView = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)

        client.setHydrationResult(finalHydration)
        await coordinator.loadDefaultThread()
        viewController.view.layoutIfNeeded()
        await Task.yield()
        let hydratedView = try XCTUnwrap(descendantViews(of: viewController.view)
            .compactMap { $0 as? AgentStreamingTextView }
            .first)

        XCTAssertTrue(initialView === hydratedView)
        XCTAssertEqual(hydratedView.displayText, "Hello world")
    }

    @MainActor
    func testOlderHydrationResponseCannotReplaceANewerSnapshot() async throws {
        let initialHydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "initial-message")
        let olderHydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "older-message")
        let newerHydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "newer-message")
        let client = FakeAgentV2Client(
            hydrationResult: initialHydration,
            hydrationResults: [initialHydration, olderHydration, newerHydration],
            blockedHydrationAttempt: 2
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let olderHydrationTask = Task { @MainActor in
            await coordinator.hydrate()
        }
        defer { client.resumeBlockedHydration() }
        await waitForHydrationRequest(client, count: 2)

        await coordinator.hydrate()

        XCTAssertEqual(coordinator.messages.map(\.id), ["newer-message"])
        client.resumeBlockedHydration()
        await olderHydrationTask.value
        XCTAssertEqual(coordinator.messages.map(\.id), ["newer-message"])
    }

    @MainActor
    func testClearThreadRejectsAnOlderPaginationResponse() async throws {
        let initialHydration = try decodeHydration(
            threadId: "thread-a",
            messages: [persistedMessageObject(
                content: ["kind": "markdown", "text": "Current"],
                messageId: "current-message",
                threadId: "thread-a"
            )],
            nextCursor: "older-page"
        )
        let olderHydration = try decodeHydration(
            threadId: "thread-a",
            messages: [persistedMessageObject(
                content: ["kind": "markdown", "text": "Older"],
                messageId: "older-message",
                threadId: "thread-a"
            )]
        )
        let client = FakeAgentV2Client(
            hydrationResult: initialHydration,
            hydrationResults: [initialHydration, olderHydration],
            blockedHydrationAttempt: 2
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let pagination = Task { @MainActor in
            await coordinator.loadOlderMessages()
        }
        defer { client.resumeBlockedHydration() }
        await waitForHydrationRequest(client, count: 2)

        let didClear = await coordinator.clearThread()
        XCTAssertTrue(didClear)
        client.resumeBlockedHydration()
        await pagination.value

        XCTAssertTrue(coordinator.messages.isEmpty)
        XCTAssertEqual(coordinator.thread?.revision, 3)
    }

    @MainActor
    func testReplayExpiryErrorIsClearedAfterCanonicalHydration() async throws {
        let hydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "message-a")
        let client = FakeAgentV2Client(hydrationResult: hydration)
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        let failed = try JSONDecoder().decode(
            ApiAgentV2ClientUpdateEnvelope.self,
            from: Data(#"""
            {
              "type":"agentV2",
              "update":{
                "kind":"runFailed",
                "clientRunId":"client-thread-a",
                "runId":"run-thread-a",
                "threadId":"thread-a",
                "code":"run_replay_expired",
                "retryable":false
              }
            }
            """#.utf8)
        )
        coordinator.walletCore(event: .agentV2(failed.update))
        XCTAssertEqual(coordinator.error, AgentV2Copy.error(.runReplayExpired))

        try await Task.sleep(for: .milliseconds(50))

        XCTAssertNil(coordinator.error)
        XCTAssertEqual(coordinator.messages.map(\.id), ["message-a"])
        XCTAssertEqual(coordinator.messages.first?.status, .complete)
    }

    @MainActor
    func testRunStartFailureRemainsVisibleAfterCanonicalHydration() async throws {
        let hydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "message-a")
        let client = FakeAgentV2Client(hydrationResult: hydration)
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()

        coordinator.send(
            input: .append(text: "Question that fails to start"),
            visibleText: "Question that fails to start"
        )
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertEqual(client.startedCommands.count, 1)
        XCTAssertEqual(coordinator.error, lang("Agent is unavailable"))
        XCTAssertEqual(coordinator.messages.map(\.id), ["message-a"])
    }

    @MainActor
    func testCoordinatorSubmitsNoWalletContinuationReferences() async throws {
        let hydration = try decodeAssistantHydration(threadId: "thread-a", messageId: "message-a")
        let client = FakeAgentV2Client(
            hydrationResult: hydration,
            shouldCompleteRun: true
        )
        let coordinator = AgentV2Coordinator(client: client)
        await coordinator.loadDefaultThread()
        coordinator.send(
            input: .append(text: "What changed?"),
            visibleText: "What changed?"
        )
        try await Task.sleep(for: .milliseconds(50))

        let command = try XCTUnwrap(client.startedCommands.first)
        XCTAssertNil(command.walletScopeSelectionOf)
    }

    @MainActor
    func testLegacyDataCardCleanupIsVersionedAndPreservesFutureCacheFiles() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory
            .appendingPathComponent("agent-v2-cleanup-\(UUID().uuidString)", isDirectory: true)
        let directory = root.appendingPathComponent("air/agent-v2", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: root) }

        let index = directory.appendingPathComponent("data-card-index.json")
        let legacyCard = directory.appendingPathComponent("legacy.card")
        let futureCache = directory.appendingPathComponent("wallet-context-v2.bin")
        try Data("index".utf8).write(to: index)
        try Data("card".utf8).write(to: legacyCard)
        try Data("future".utf8).write(to: futureCache)

        let suiteName = "AgentV2LegacyWidgetCleanupTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        var credentialCleanupCount = 0
        let cleanupCredentials = { credentialCleanupCount += 1 }

        AgentV2LegacyWidgetCleanup.run(
            fileManager: fileManager,
            cachesDirectory: root,
            userDefaults: defaults,
            removeLegacyCredentials: cleanupCredentials
        )

        XCTAssertFalse(fileManager.fileExists(atPath: index.path))
        XCTAssertFalse(fileManager.fileExists(atPath: legacyCard.path))
        XCTAssertTrue(fileManager.fileExists(atPath: futureCache.path))
        XCTAssertTrue(fileManager.fileExists(atPath: directory.path))
        XCTAssertEqual(credentialCleanupCount, 1)

        let lateLegacyCard = directory.appendingPathComponent("late.card")
        try Data("late".utf8).write(to: lateLegacyCard)
        AgentV2LegacyWidgetCleanup.run(
            fileManager: fileManager,
            cachesDirectory: root,
            userDefaults: defaults,
            removeLegacyCredentials: cleanupCredentials
        )

        XCTAssertTrue(fileManager.fileExists(atPath: lateLegacyCard.path))
        XCTAssertEqual(credentialCleanupCount, 1)
    }

    private func decodeUpdate(
        kind: String,
        threadId: String,
        messageId: String,
        delta: String? = nil,
        contentKind: ApiAgentV2ContentKind = .markdown
    ) throws -> ApiAgentV2ClientUpdate {
        var update: [String: Any] = [
            "kind": kind,
            "clientRunId": "client-\(threadId)",
            "runId": "run-\(threadId)",
            "threadId": threadId,
            "messageId": messageId
        ]
        if let delta { update["delta"] = delta }
        if kind == "messageStarted" { update["contentKind"] = contentKind.rawValue }
        if kind == "messageCompleted" { update["finishReason"] = "complete" }
        let data = try JSONSerialization.data(withJSONObject: ["type": "agentV2", "update": update])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeActionUpdate(threadId: String, messageId: String) throws -> ApiAgentV2ClientUpdate {
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": [
                "kind": "actionAvailable",
                "clientRunId": "client-\(threadId)",
                "runId": "run-\(threadId)",
                "threadId": threadId,
                "messageId": messageId,
                "action": [
                    "id": "action-1",
                    "kind": "send",
                    "labelCode": "review_transfer",
                    "requiresConfirmation": true
                ]
            ]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeRunStartedUpdate(threadId: String) throws -> ApiAgentV2ClientUpdate {
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": [
                "kind": "runStarted",
                "clientRunId": "client-\(threadId)",
                "runId": "run-\(threadId)",
                "threadId": threadId,
                "threadRevision": 2
            ]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeUnboundUpdate(kind: String) throws -> ApiAgentV2ClientUpdate {
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": ["kind": kind]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeRunActivityUpdate(threadId: String) throws -> ApiAgentV2ClientUpdate {
        let runId = "run-\(threadId)"
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": [
                "kind": "runActivityChanged",
                "clientRunId": "client-\(threadId)",
                "runId": runId,
                "threadId": threadId,
                "event": [
                    "type": "run_activity",
                    "protocolVersion": 2,
                    "runId": runId,
                    "sequence": 3,
                    "code": "web.reading_sources",
                    "status": "completed",
                    "detail": ["kind": "source_count", "count": 4]
                ]
            ]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeRunFailedUpdate(threadId: String) throws -> ApiAgentV2ClientUpdate {
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": [
                "kind": "runFailed",
                "clientRunId": "client-\(threadId)",
                "runId": "run-\(threadId)",
                "threadId": threadId,
                "code": "network_error",
                "retryable": true
            ]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeRunStartedUpdate(
        threadId: String,
        inputMessageId: String?
    ) throws -> ApiAgentV2ClientUpdate {
        var update: [String: Any] = [
            "kind": "runStarted",
            "clientRunId": "client-\(threadId)",
            "runId": "run-\(threadId)",
            "threadId": threadId,
            "threadRevision": 2
        ]
        update["inputMessageId"] = inputMessageId
        let data = try JSONSerialization.data(withJSONObject: ["type": "agentV2", "update": update])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeRunCancelledUpdate(threadId: String) throws -> ApiAgentV2ClientUpdate {
        let data = try JSONSerialization.data(withJSONObject: [
            "type": "agentV2",
            "update": [
                "kind": "runCancelled",
                "clientRunId": "client-\(threadId)",
                "runId": "run-\(threadId)",
                "threadId": threadId
            ]
        ])
        return try JSONDecoder().decode(ApiAgentV2ClientUpdateEnvelope.self, from: data).update
    }

    private func decodeHydration(
        threadId: String,
        messages: [[String: Any]],
        nextCursor: String? = nil
    ) throws -> ApiAgentV2ThreadHydration {
        var hydration: [String: Any] = [
            "thread": [
                "id": threadId,
                "revision": 2,
                "metadataRevision": 1,
                "titleSource": "none",
                "isPinned": false,
                "isDefault": true,
                "createdAt": "2026-07-22T00:00:00.000Z",
                "updatedAt": "2026-07-22T00:00:01.000Z",
                "lastActivityAt": "2026-07-22T00:00:01.000Z",
                "messageCount": messages.count
            ],
            "messages": messages
        ]
        hydration["nextCursor"] = nextCursor
        let data = try JSONSerialization.data(withJSONObject: hydration)
        return try JSONDecoder().decode(ApiAgentV2ThreadHydration.self, from: data)
    }

    private func decodeAssistantHydration(threadId: String, messageId: String) throws -> ApiAgentV2ThreadHydration {
        let data = try JSONSerialization.data(withJSONObject: [
            "thread": [
                "id": threadId,
                "revision": 2,
                "metadataRevision": 1,
                "titleSource": "none",
                "isPinned": false,
                "isDefault": true,
                "createdAt": "2026-07-22T00:00:00.000Z",
                "updatedAt": "2026-07-22T00:00:01.000Z",
                "lastActivityAt": "2026-07-22T00:00:01.000Z",
                "messageCount": 1
            ],
            "messages": [[
                "id": messageId,
                "threadId": threadId,
                "role": "assistant",
                "status": "complete",
                "content": [
                    "kind": "semantic",
                    "content": ["kind": "notice", "schemaVersion": 1, "code": "empty_result"]
                ],
                "createdAt": "2026-07-22T00:00:01.000Z"
            ]]
        ])
        return try JSONDecoder().decode(ApiAgentV2ThreadHydration.self, from: data)
    }

    private func decodeSemanticContent(_ object: [String: Any]) throws -> ApiAgentV2SemanticContent {
        try JSONDecoder().decode(
            ApiAgentV2SemanticContent.self,
            from: JSONSerialization.data(withJSONObject: object)
        )
    }

    private func decodeSendPresentation(accountLabel: String) throws -> ApiAgentV2ActionPresentation {
        try JSONDecoder().decode(
            ApiAgentV2ActionPresentation.self,
            from: JSONSerialization.data(withJSONObject: [
                "kind": "send",
                "status": "active",
                "network": "ton",
                "accountLabel": accountLabel,
                "recipient": ["kind": "external"],
                "feeStatus": "calculated_in_wallet",
                "warningCodes": []
            ])
        )
    }

    @MainActor
    private func descendantViews(of view: UIView) -> [UIView] {
        view.subviews.flatMap { [$0] + descendantViews(of: $0) }
    }

    @MainActor
    private func bottomDistance(in tableView: UITableView) -> CGFloat {
        tableView.contentSize.height
            - (tableView.contentOffset.y + tableView.bounds.height - tableView.adjustedContentInset.bottom)
    }

    private func fearGreedRegimeObject(regime: String = "risk_on") -> [String: Any] {
        [
            "schemaVersion": 1,
            "policyVersion": "fear-greed-sma-regime-v1",
            "basis": "closed_utc_daily",
            "asOfDate": "2026-08-09",
            "latestValue": 62,
            "sma30": "54.25000000",
            "sma365": "48.12000000",
            "regime": regime,
            "seriesDigest": String(repeating: "a", count: 64),
            "source": [
                "provider": "alternative_me",
                "endpoint": "alternative.fng",
                "attributionRequired": true,
                "attributionLabel": "Alternative.me",
                "attributionUrl": "https://alternative.me/crypto/fear-and-greed-index/"
            ]
        ]
    }

    private func marketAnalysisObject(fearGreedRegime: [String: Any]) -> [String: Any] {
        [
            "kind": "market",
            "schemaVersion": 1,
            "view": "analysis",
            "outcome": "complete",
            "evidence": ["schemaVersion": 6],
            "analysis": ["summary": "Classic market analysis remains visible."],
            "fearGreedRegime": fearGreedRegime
        ]
    }

    private func decodePersistedMessage(content: [String: Any]) throws -> ApiAgentV2PersistedMessage {
        try JSONDecoder().decode(
            ApiAgentV2PersistedMessage.self,
            from: JSONSerialization.data(withJSONObject: persistedMessageObject(content: content))
        )
    }

    private func persistedMessageObject(
        content: [String: Any],
        messageId: String = "message-1",
        threadId: String = "thread-1"
    ) -> [String: Any] {
        [
            "id": messageId,
            "threadId": threadId,
            "role": "assistant",
            "status": "complete",
            "content": content,
            "createdAt": "2026-07-31T12:00:00.000Z"
        ]
    }

    @MainActor
    private func waitForHostContextUpdate(_ client: FakeAgentV2Client, count: Int = 1) async {
        for _ in 0..<100 {
            guard client.hostContextUpdateCount < count else { return }
            await Task.yield()
        }
    }

    @MainActor
    private func waitForActionPresentationRequest(_ client: FakeAgentV2Client, count: Int = 1) async {
        for _ in 0..<100 {
            guard client.actionPresentationRequestCount < count else { return }
            await Task.yield()
        }
    }

    @MainActor
    private func waitForHydrationRequest(_ client: FakeAgentV2Client, count: Int) async {
        for _ in 0..<100 {
            guard client.hydrationRequestCount < count else { return }
            await Task.yield()
        }
    }

    @MainActor
    private func waitForRequest(_ request: String, client: FakeAgentV2Client) async {
        for _ in 0..<100 {
            guard !client.requestOrder.contains(request) else { return }
            await Task.yield()
        }
    }
}

@MainActor
private final class AgentV2RunActivityProbe {
    var isActive = false
}

@MainActor
private final class AgentV2CoordinatorObserverSpy: AgentV2CoordinatorObserver {
    private(set) var changes: [AgentV2CoordinatorChange] = []

    func agentV2CoordinatorDidChange(_ coordinator: AgentV2Coordinator, change: AgentV2CoordinatorChange) {
        changes.append(change)
    }
}

private enum FakeAgentV2ClientError: Error {
    case unavailable
}

@MainActor
private final class FakeAgentV2Client: AgentV2Client {
    private let defaultThreadId: String
    private let actionPresentationResults: [ApiAgentV2ActionPresentation]
    private let hydrationResults: [ApiAgentV2ThreadHydration]
    private var hydrationResult: ApiAgentV2ThreadHydration?
    private let shouldCompleteRun: Bool
    private let retryResultState: ApiAgentV2RunResultState?
    private let blockedHostContextAttempt: Int?
    private let blockedHydrationAttempt: Int?
    private let blockedActionPresentationAttempt: Int?
    private var hostContextFailuresRemaining: Int
    private var hostContextFailureAttempts: Set<Int>
    private var blockedHostContextContinuation: CheckedContinuation<Void, Never>?
    private var blockedHydrationContinuation: CheckedContinuation<Void, Never>?
    private var blockedActionPresentationContinuation: CheckedContinuation<Void, Never>?
    private(set) var startedCommands: [ApiAgentV2RunCommand] = []
    private(set) var retriedClientRunIds: [String] = []
    private(set) var hostContextUpdateCount = 0
    private(set) var hydrationRequestCount = 0
    private(set) var actionPresentationRequestCount = 0
    private(set) var lastHostContext: ApiAgentV2HostContext?
    private(set) var requestOrder: [String] = []
    var hostContextUpdateObserver: ((Int) -> Void)?

    init(
        defaultThreadId: String = "thread-a",
        actionPresentationResult: ApiAgentV2ActionPresentation? = nil,
        actionPresentationResults: [ApiAgentV2ActionPresentation] = [],
        hydrationResult: ApiAgentV2ThreadHydration? = nil,
        hydrationResults: [ApiAgentV2ThreadHydration] = [],
        shouldCompleteRun: Bool = false,
        retryResultState: ApiAgentV2RunResultState? = nil,
        hostContextFailuresRemaining: Int = 0,
        blockedHostContextAttempt: Int? = nil,
        blockedHydrationAttempt: Int? = nil,
        blockedActionPresentationAttempt: Int? = nil,
        hostContextFailureAttempts: Set<Int> = []
    ) {
        self.defaultThreadId = defaultThreadId
        self.actionPresentationResults = actionPresentationResults.isEmpty
            ? actionPresentationResult.map { [$0] } ?? []
            : actionPresentationResults
        self.hydrationResult = hydrationResult
        self.hydrationResults = hydrationResults
        self.shouldCompleteRun = shouldCompleteRun
        self.retryResultState = retryResultState
        self.hostContextFailuresRemaining = hostContextFailuresRemaining
        self.blockedHostContextAttempt = blockedHostContextAttempt
        self.blockedHydrationAttempt = blockedHydrationAttempt
        self.blockedActionPresentationAttempt = blockedActionPresentationAttempt
        self.hostContextFailureAttempts = hostContextFailureAttempts
    }

    func runtimeStatus() async throws -> ApiAgentV2RuntimeStatus { fatalError() }
    func consent() async throws -> Bool { fatalError() }
    func acceptConsent() async throws {}
    func updateHostContext(_ context: ApiAgentV2HostContext?) async throws {
        requestOrder.append("hostContext")
        hostContextUpdateCount += 1
        hostContextUpdateObserver?(hostContextUpdateCount)
        if hostContextUpdateCount == blockedHostContextAttempt {
            await withCheckedContinuation { continuation in
                blockedHostContextContinuation = continuation
            }
        }
        if hostContextFailuresRemaining > 0 {
            hostContextFailuresRemaining -= 1
            throw FakeAgentV2ClientError.unavailable
        }
        if hostContextFailureAttempts.remove(hostContextUpdateCount) != nil {
            throw FakeAgentV2ClientError.unavailable
        }
        lastHostContext = context
    }
    func resumeBlockedHostContextUpdate() {
        blockedHostContextContinuation?.resume()
        blockedHostContextContinuation = nil
    }
    func resumeBlockedHydration() {
        blockedHydrationContinuation?.resume()
        blockedHydrationContinuation = nil
    }
    func resumeBlockedActionPresentation() {
        blockedActionPresentationContinuation?.resume()
        blockedActionPresentationContinuation = nil
    }
    func resetHostContextUpdateCount() {
        hostContextUpdateCount = 0
    }
    func setHydrationResult(_ hydrationResult: ApiAgentV2ThreadHydration) {
        self.hydrationResult = hydrationResult
    }
    func hints() async throws -> ApiAgentV2HintsResponse { throw FakeAgentV2ClientError.unavailable }
    func loadAvailability() async {
        requestOrder.append("availability")
    }
    func loadUserQuota() async {
        requestOrder.append("userQuota")
    }
    func defaultThread() async throws -> ApiAgentV2DefaultThreadResponse {
        requestOrder.append("defaultThread")
        let thread = hydrationResult?.thread ?? makeThread(id: defaultThreadId)
        return try JSONDecoder().decode(
            ApiAgentV2DefaultThreadResponse.self,
            from: JSONSerialization.data(withJSONObject: [
                "protocolVersion": 2,
                "thread": try JSONSerialization.jsonObject(with: JSONEncoder().encode(thread)),
                "created": false
            ])
        )
    }
    func messages(threadId: String, cursor: String?, limit: Int) async throws -> ApiAgentV2ThreadHydration {
        requestOrder.append("messages")
        hydrationRequestCount += 1
        let attempt = hydrationRequestCount
        let result = hydrationResults.isEmpty
            ? hydrationResult
            : hydrationResults[min(attempt - 1, hydrationResults.count - 1)]
        if attempt == blockedHydrationAttempt {
            await withCheckedContinuation { continuation in
                blockedHydrationContinuation = continuation
            }
        }
        guard let result else { throw FakeAgentV2ClientError.unavailable }
        return result
    }
    func startRun(_ command: ApiAgentV2RunCommand) async throws -> ApiAgentV2RunResult {
        startedCommands.append(command)
        guard shouldCompleteRun else { throw FakeAgentV2ClientError.unavailable }
        return try JSONDecoder().decode(
            ApiAgentV2RunResult.self,
            from: Data(#"{"clientRunId":"client-thread-a","runId":"run-thread-a","state":"completed"}"#.utf8)
        )
    }
    func retryRun(clientRunId: String) async throws -> ApiAgentV2RunResult? {
        retriedClientRunIds.append(clientRunId)
        guard let retryResultState else { return nil }
        return try JSONDecoder().decode(
            ApiAgentV2RunResult.self,
            from: JSONSerialization.data(withJSONObject: [
                "clientRunId": clientRunId,
                "runId": "run-retry",
                "state": retryResultState.rawValue
            ])
        )
    }
    func cancelRun(_ runId: String) async {}
    func clearThread(
        id: String,
        revision: Int
    ) async throws -> ApiAgentV2MutationResult<ApiAgentV2ThreadClearResponse> {
        let thread = makeThread(id: id, revision: revision + 1)
        return try JSONDecoder().decode(
            ApiAgentV2MutationResult<ApiAgentV2ThreadClearResponse>.self,
            from: JSONSerialization.data(withJSONObject: [
                "ok": true,
                "value": [
                    "protocolVersion": 2,
                    "thread": try JSONSerialization.jsonObject(with: JSONEncoder().encode(thread)),
                    "duplicate": false
                ]
            ])
        )
    }
    func actionPresentation(messageId: String, actionId: String) async throws -> ApiAgentV2ActionPresentation {
        actionPresentationRequestCount += 1
        let attempt = actionPresentationRequestCount
        if attempt == blockedActionPresentationAttempt {
            await withCheckedContinuation { continuation in
                blockedActionPresentationContinuation = continuation
            }
        }
        guard !actionPresentationResults.isEmpty else { throw FakeAgentV2ClientError.unavailable }
        return actionPresentationResults[min(attempt - 1, actionPresentationResults.count - 1)]
    }
    func resolveAction(messageId: String, actionId: String) async throws -> ApiAgentV2ResolvedAction { fatalError() }
    private func makeThread(id: String, revision: Int = 1) -> ApiAgentV2ThreadSummary {
        try! JSONDecoder().decode(
            ApiAgentV2ThreadSummary.self,
            from: JSONSerialization.data(withJSONObject: [
                "id": id,
                "revision": revision,
                "metadataRevision": 1,
                "titleSource": "none",
                "isPinned": false,
                "isDefault": true,
                "createdAt": "2026-07-22T00:00:00.000Z",
                "updatedAt": "2026-07-22T00:00:00.000Z",
                "lastActivityAt": "2026-07-22T00:00:00.000Z",
                "messageCount": 0
            ])
        )
    }
}
