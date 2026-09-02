import Foundation
import WalletContext

@MainActor
final class AgentTestingBackend: AgentBackend {
    let kind: AgentBackendKind = .testing

    private weak var context: AgentBackendContext?
    private var pendingReplyTasks: [UUID: Task<Void, Never>] = [:]
    private var nextMockReplyIndex = 0

    func attach(to context: AgentBackendContext) {
        self.context = context
    }

    func detach() {
        reset()
        context = nil
    }

    func loadHints(animated: Bool) {
        let hints = Self.mockHints(for: LocalizationSupport.shared.langCode)
        context?.setHints(hints, animated: animated)
    }

    func prepareForEditing(_ editContext: AgentBackendEditContext) {
        cancelPendingReplies()
    }

    func didSendUserMessage(_ text: String, editContext: AgentBackendEditContext?) {
        guard let context else { return }

        let typingIndicator = AgentTypingIndicator()
        context.append(.typingIndicator(typingIndicator), animated: true)

        let response = simulatedResponse(for: text)
        let taskID = UUID()
        let task = Task { [weak self] in
            defer { self?.pendingReplyTasks[taskID] = nil }
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled, let self, let context = self.context else { return }

            let frames = Self.streamingFrames(for: response.text)
            guard let firstFrame = frames.first else { return }

            let message = AgentMessage(
                role: .assistant,
                text: firstFrame,
                isStreaming: true,
                action: response.action
            )
            let messageID = message.id
            context.replaceItem(id: typingIndicator.id, with: .message(message), animated: true)

            for frameIndex in 1..<frames.count {
                let frame = frames[frameIndex]
                try? await Task.sleep(for: Self.streamingDelay(frameIndex: frameIndex, frame: frame))
                guard !Task.isCancelled, var currentMessage = context.message(for: messageID) else { return }
                currentMessage.text = frame
                context.updateMessage(currentMessage, animated: false, scrollToBottom: true)
            }

            guard var completedMessage = context.message(for: messageID) else { return }
            completedMessage.isStreaming = false
            context.updateMessage(completedMessage, animated: false, scrollToBottom: true)
        }
        pendingReplyTasks[taskID] = task
    }

    func reset() {
        cancelPendingReplies()
        nextMockReplyIndex = 0
    }

    private func cancelPendingReplies() {
        pendingReplyTasks.values.forEach { $0.cancel() }
        pendingReplyTasks.removeAll()
    }

    private func simulatedResponse(for input: String) -> (text: String, action: AgentMessageAction?) {
        let trimmedInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let fixtureIndex = Int(trimmedInput),
           fixtureIndex >= 1,
           fixtureIndex <= Self.fixtureReplies.count {
            let parsed = Self.parseMessage(Self.fixtureReplies[fixtureIndex - 1])
            return (parsed.text, parsed.action)
        }

        let reply = Self.mockReplies[nextMockReplyIndex]
        nextMockReplyIndex = (nextMockReplyIndex + 1) % Self.mockReplies.count
        return (reply, Self.simulatedAction(for: input))
    }

    private static func simulatedAction(for input: String) -> AgentMessageAction? {
        let lowercasedInput = input.lowercased()
        if lowercasedInput.contains("gram") || lowercasedInput.contains("ton") {
            return AgentMessageAction(
                title: "Open GRAM",
                url: URL(string: "\(SELF_PROTOCOL)token/\(TONCOIN_SLUG)")!
            )
        }
        if lowercasedInput.contains("earn") || lowercasedInput.contains("stake") {
            return AgentMessageAction(
                title: "Open Earn",
                url: URL(string: "\(SELF_PROTOCOL)stake")!
            )
        }
        return nil
    }

    private static func mockHints(for langCode: String) -> [AgentHint] {
        if langCode == "ru" {
            return [
                AgentHint(
                    id: "ru-0",
                    title: "Проверь крипторынок",
                    subtitle: "включая GRAM и основные токены",
                    prompt: "Дай мне краткий обзор крипторынка с фокусом на GRAM, BTC, ETH и главные тренды сегодня."
                ),
                AgentHint(
                    id: "ru-1",
                    title: "Отслеживай мой портфель",
                    subtitle: "с графиками и разбивкой по токенам",
                    prompt: "Проанализируй мой кошелёк, объясни текущую структуру портфеля, самые крупные позиции и что в нём выделяется."
                ),
                AgentHint(
                    id: "ru-2",
                    title: "Добавить токены",
                    subtitle: "по адресу, QR-коду или банковской карте",
                    prompt: "Открой экран получения средств."
                ),
                AgentHint(
                    id: "ru-3",
                    title: "Покажи варианты стейкинга",
                    subtitle: "для наград в GRAM и MY",
                    prompt: "Объясни стейкинг в MyTonWallet, включая стейкинг GRAM и MY, награды и риски."
                )
            ]
        }

        return [
            AgentHint(
                id: "en-0",
                title: "Check the crypto market",
                subtitle: "including GRAM and major tokens",
                prompt: "Give me a quick crypto market overview, with focus on GRAM, BTC, ETH and major trends today."
            ),
            AgentHint(
                id: "en-1",
                title: "Track my portfolio",
                subtitle: "with charts and token breakdown",
                prompt: "Analyze my wallet portfolio, explain the current allocation, biggest positions and what stands out."
            ),
            AgentHint(
                id: "en-2",
                title: "Add tokens",
                subtitle: "via address, QR or bank card",
                prompt: "Open my Receive screen."
            ),
            AgentHint(
                id: "en-3",
                title: "Show me staking options",
                subtitle: "for GRAM and MY rewards",
                prompt: "Explain staking in MyTonWallet, including how GRAM and MY staking works, rewards and risks."
            )
        ]
    }

    private static let mockReplies: [String] = [
        """
        ## Portfolio overview

        Your mock portfolio is worth **$4,286.42**, up **2.7%** over the last 24 hours. TON and GRAM account for most of today's movement.

        | Asset | Balance | Price | Value | 24h |
        | --- | ---: | ---: | ---: | ---: |
        | TON | 482.31 | $3.84 | $1,852.07 | +2.1% |
        | GRAM | 18,450 | $0.097 | $1,789.65 | +4.8% |
        | USDT | 512.20 | $1.00 | $512.20 | +0.0% |
        | MY | 7,500 | $0.0177 | $132.50 | -1.2% |

        **Allocation note:** TON and GRAM make up about 85% of the portfolio, so changes in either token will have an outsized effect on the total balance.
        """,

        """
        ## Recent activity

        Here is a detailed mock snapshot across your wallets. The table is intentionally wide so horizontal scrolling can be tested.

        | Time | Activity | Wallet | From asset | To asset | Amount | Effective rate | Network fee | Status | Reference |
        | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
        | Today, 09:42 | Swap | Main wallet | GRAM | USDT | 10,000 GRAM | 0.0968 USDT | 0.031 TON | Completed | EQD…4k2p |
        | Yesterday, 18:07 | Send | Savings | TON | — | 24.5 TON | — | 0.014 TON | Completed | EQB…8m1x |
        | Aug 14, 12:31 | Stake | Main wallet | MY | stMY | 5,000 MY | 0.982 stMY | 0.022 TON | Pending | EQC…9r7a |
        | Aug 12, 07:55 | Receive | Ledger | USDT | — | 250 USDT | — | Sponsored | Completed | UQA…2n6v |

        All amounts and transaction references above are sample data. Open an explorer before relying on the status of a real transfer.
        """,

        """
        ## Weekly wallet check-in

        Your mock portfolio had a positive week, but the result is concentrated in two volatile assets. The total balance increased from **$4,041.18** to **$4,286.42**, while the stablecoin reserve stayed almost unchanged.

        ### What changed

        - **GRAM contributed most of the gain.** Its price rose 8.4%, adding roughly $139 to the portfolio even after the recent swap into USDT.
        - **TON remained the largest position.** It gained 3.1% and now represents about 43% of total value.
        - **MY moved against the trend.** The position fell 2.6%, but its small allocation limited the portfolio impact.
        - The **USDT reserve covers several typical network transactions**, although fees still need to be paid in TON.

        ### Things worth checking

        1. Keep at least `0.2 TON` available for network fees before staking or swapping the rest.
        2. Review the pending MY staking transaction and confirm its status in the explorer.
        3. Consider whether an 85% allocation to TON and GRAM matches the level of volatility you are comfortable with.

        ---

        This is a mock analysis, not financial advice. Prices, balances, returns, and transaction details are fictional, but the response deliberately combines headings, long paragraphs, **emphasis**, `inline values`, lists, and a bare link such as https://mytonwallet.io so the complete Agent message renderer can be exercised during development.
        """
    ]

    private static let fixtureReplies: [String] = [
        """
        # The market is slightly up today

        Bitcoin is +1.8%, Ethereum +2.3%, and Gram +3.1% in the last 24 hours.

        The Fear & Greed Index is currently 62 (Greed).

        Would you like a quick overview of your portfolio as well?

        Here is a **rich text** preview covering common Agent formatting cases.

        # Heading Level 1
        ## Heading Level 2
        ### Heading Level 3

        Plain paragraph with *italic*, **bold**, and `inline code`.

        Autodetected links: https://mytonwallet.io and http://example.com/path?q=agent

        Tildes: ~single~ and ~~double~~ and raw ~ character.

        ---
        Horizontal rule above (three dashes).

        Multiple paragraphs with spacing.

        Line with trailing spaces

        Unicode: 🚀 TON 💎 中文 العربية ñ

        List-like lines:
        - Item one
        - Item two with **bold**

        Numbered lines:
        1. First step
        2. Second step

        Long token: https://very-long-domain-name.example.com/path/to/resource/with/many/segments?foo=bar&baz=qux

        The action button below should appear after streaming finishes.

        [Open Earn](\(SELF_PROTOCOL)stake)
        """,

        """
        **Block content parity test**

        iOS uses inline-only markdown. Web renders the blocks below properly. On iOS you should see mostly raw text.

        # Unordered list
        - TON balance: 12.5
        - GRAM balance: 1,024
        - USDT balance: 50.00

        # Ordered list
        1. Open Earn
        2. Choose a pool
        3. Confirm staking

        # Markdown link (not bare URL)
        Read the [Agent docs](https://docs.mytonwallet.io) for more.

        # Nested inline inside list item
        - Send **TON** to `UQ...abc` before deadline

        Compare this bubble with the same content on web.

        [Open Wallet](\(SELF_PROTOCOL)home)
        """,

        """
        **Streaming boundary stress test**

        Watch how partial markdown tokens render while chunks arrive:

        1. Bold opener: **partial bold text**
        2. Code opener: `partial code block`
        3. Italic opener: *partial italic text*
        4. Link mid-stream: [MyTonWallet](https://mytonwallet.io)
        5. Heading mid-stream: ## Live Update

        ---

        Edge cases:
        - Empty-looking line below:

        - Mixed `code` and **bold** in one line
        - Repeated asterisks: ***not a horizontal rule***
        - Backslashes before tilde: \\~escaped
        - CR/LF normalization is handled by the renderer.

        [Open GRAM](\(SELF_PROTOCOL)token/\(TONCOIN_SLUG))
        """,
        """
        **Links & special content**

        Markdown link: [Docs](https://docs.mytonwallet.io)
        Bare URL: https://t.me/mytonwallet
        Email-like: agent@mytonwallet.io (plain text, not a link)

        # Quick Summary
        Your balance overview would appear here in a real response.

        `TON` `GRAM` `USDT` inline tickers.

        ---
        Emoji paragraph: ✅ ❌ ⚠️ 🎉

        Right-to-left sample: مرحبا

        CJK sample: 钱包代理测试

        Final deeplink:

        [Open Receive](\(SELF_PROTOCOL)receive)
        """,
    ]
}
