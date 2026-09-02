package org.mytonwallet.app_air.uiagent.search

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.mytonwallet.app_air.uiagent.processors.AgentHint
import org.mytonwallet.app_air.uiagent.processors.AgentHintsRepository
import org.mytonwallet.app_air.uiagent.viewControllers.agent.AgentMessageRole
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.utils.toProcessedSpannableStringBuilder
import org.mytonwallet.app_air.walletcore.stores.AgentMessageStore

object AgentSearchSuggestions {
    private const val SEARCH_ITEMS_LIMIT = 9
    private val whitespaceRegex = Regex("\\s+")

    suspend fun recent(): List<AgentHint> = withContext(Dispatchers.IO) {
        var assistantReply = ""
        AgentMessageStore.loadMessages().asReversed()
            .asSequence()
            .mapNotNull { message ->
                val text = message.text.toProcessedSpannableStringBuilder()
                    .toString().trim().replace(whitespaceRegex, " ")
                when (message.role) {
                    AgentMessageRole.ASSISTANT.name -> {
                        if (text.isNotEmpty()) assistantReply = text
                        null
                    }

                    AgentMessageRole.USER.name -> {
                        if (text.isEmpty()) {
                            null
                        } else {
                            AgentHint(
                                id = message.id,
                                title = text,
                                subtitle = assistantReply,
                                prompt = text
                            ).also {
                                assistantReply = ""
                            }
                        }
                    }

                    else -> null
                }
            }
            .distinctBy { it.prompt.lowercase() }
            .take(SEARCH_ITEMS_LIMIT)
            .toList()
    }

    suspend fun suggested(): List<AgentHint> =
        AgentHintsRepository.load(LocaleController.activeLanguage.langCode)
}
