package org.mytonwallet.app_air.uiagent.processors

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class MockAgentProcessor : AgentProcessor {

    private val richTableRequestPattern = Regex(
        """\b(?:rich|complete)\s+tables?\b""",
        RegexOption.IGNORE_CASE
    )
    private val wideTableRequestPattern = Regex(
        """\bwide\s+tables?\b""",
        RegexOption.IGNORE_CASE
    )
    private val tableRequestPattern = Regex("""\btables?\b""", RegexOption.IGNORE_CASE)

    private val richTableReply = """
        Here is a structured table with the richer Telegram-style features:

        <table border="1" class="striped">
        <caption>Wallet positions</caption>
        <thead>
        <tr><th rowspan="2" valign="middle">Asset</th><th colspan="2" align="center">Position</th><th rowspan="2" valign="bottom">Status</th></tr>
        <tr><th align="right">Balance</th><th align="right">Value</th></tr>
        </thead>
        <tbody>
        <tr><td>TON</td><td align="right">125.50</td><td align="right">$712.84</td><td align="center">Active</td></tr>
        <tr><td>USDT</td><td align="right">84.20</td><td align="right">$84.20</td><td align="center">Available</td></tr>
        <tr><td header colspan="2">Total portfolio</td><td colspan="2" align="right">**$797.04**</td></tr>
        </tbody>
        </table>
    """.trimIndent()

    private val portfolioTableReply = """
        Here is a portfolio snapshot:

        | Token | Balance | 24h change |
        | :--- | ---: | ---: |
        | TON | 125.50 | +2.3% |
        | USDT | 84.20 | -0.1% |
        | NOT | 12,450 | +4.8% |
    """.trimIndent()

    private val activityTableReply = """
        Here is a wider activity table. Swipe it horizontally to see every column:

        | Time | Type | Asset pair | Amount | Status | Explorer |
        | :--- | :--- | :---: | ---: | :---: | :--- |
        | 09:42 | Swap | GRAM \| USDT | 10 GRAM | Completed | https://tonviewer.com |
        | Yesterday | Stake | TON | 25 TON | Pending | https://tonscan.org |
        | Aug 8 | Receive | USDT | 15 USDT | Completed | https://tonviewer.com |
    """.trimIndent()

    private val replies = listOf(
        richTableReply,
        portfolioTableReply,
        activityTableReply,
        "I can help with balances, swaps, staking, and recent activity.",
        "GRAM is currently trading around \$3.45, up 2.3% in the last 24 hours.",
        "Your main wallet balance is 125.5 GRAM. Would you like to see a breakdown of your tokens?",
        "Staking rewards are distributed every 18 hours. Your current APY is approximately 4.2%.",
        "I found 3 recent transactions: a swap of 10 GRAM for USDT, a staking deposit, and an incoming transfer of 5 GRAM."
    )

    private var replyIndex = 0

    override suspend fun streamMessage(
        userId: String,
        message: String,
        userAddresses: List<AgentUserAddress>,
        savedAddresses: List<AgentUserAddress>,
        onEvent: (AgentStreamEvent) -> Unit,
        onDone: () -> Unit,
        onError: (Exception) -> Unit
    ) {
        withContext(Dispatchers.IO) {
            try {
                delay(300)

                onEvent(AgentStreamEvent.Metadata(type = "question", streaming = true))

                val reply = when {
                    richTableRequestPattern.containsMatchIn(message) -> richTableReply

                    wideTableRequestPattern.containsMatchIn(message) -> activityTableReply

                    tableRequestPattern.containsMatchIn(message) -> portfolioTableReply

                    message.contains("?") ->
                        "Short answer: yes. This screen is ready to evolve into a real chat surface once we connect it to the backend."

                    else -> replies[replyIndex++ % replies.size]
                }

                val words = reply.split(" ")
                for (word in words) {
                    val chunk = if (word == words.first()) word else " $word"
                    delay(50)
                    onEvent(AgentStreamEvent.Chunk(chunk))
                }

                // Emit deeplinks for some replies
                if (
                    reply.contains("main wallet balance") ||
                    reply.contains("recent transactions")
                ) {
                    val deeplinks = when {
                        reply.contains("main wallet balance") -> listOf(
                            AgentResult(
                                type = "action",
                                message = null,
                                deeplinks = listOf(
                                    AgentResultDeeplink(
                                        "Swap 10 GRAM → USDT",
                                        "ton://swap?from=TON&to=USDT&amount=10"
                                    ),
                                    AgentResultDeeplink("View Balance", "ton://wallet")
                                ),
                                raw = org.json.JSONObject()
                            )
                        )

                        else -> listOf(
                            AgentResult(
                                type = "action",
                                message = null,
                                deeplinks = listOf(
                                    AgentResultDeeplink("View Transactions", "ton://activity")
                                ),
                                raw = org.json.JSONObject()
                            )
                        )
                    }
                    onEvent(AgentStreamEvent.Results(deeplinks))
                }

                onDone()
            } catch (e: Exception) {
                onError(e)
            }
        }
    }
}
