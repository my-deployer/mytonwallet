package org.mytonwallet.app_air.uiagent.processors

import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

object AgentHintsRepository {
    private const val HINTS_ENDPOINT = "https://agent.mytonwallet.org/api/hints"
    private const val TAG = "AgentHintsRepository"

    private data class CachedHints(val langCode: String?, val hints: List<AgentHint>)

    private val loadMutex = Mutex()

    @Volatile
    private var cachedHints: CachedHints? = null

    suspend fun load(langCode: String?): List<AgentHint> {
        cachedHints?.takeIf { it.langCode == langCode }?.let { return it.hints }

        return loadMutex.withLock {
            val current = cachedHints
            if (current != null && current.langCode == langCode) return@withLock current.hints

            val hints = fetch(langCode)
            if (hints.isNotEmpty()) cachedHints = CachedHints(langCode, hints)
            hints
        }
    }

    private suspend fun fetch(langCode: String?): List<AgentHint> = withContext(Dispatchers.IO) {
        suspendCancellableCoroutine { continuation ->
            val url = buildString {
                append(HINTS_ENDPOINT)
                if (!langCode.isNullOrEmpty()) append("?langCode=$langCode")
            }
            var connection: HttpURLConnection? = null
            try {
                if (!continuation.isActive) return@suspendCancellableCoroutine
                val activeConnection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 15_000
                    readTimeout = 15_000
                    setRequestProperty("Accept", "application/json")
                }
                connection = activeConnection
                continuation.invokeOnCancellation { activeConnection.disconnect() }

                val hints = if (activeConnection.responseCode !in 200..299) {
                    emptyList()
                } else {
                    val body = activeConnection.inputStream.bufferedReader().readText()
                    val items = JSONObject(body).optJSONArray("items")
                    (0 until (items?.length() ?: 0)).mapNotNull { index ->
                        val item = items?.optJSONObject(index) ?: return@mapNotNull null
                        val title = item.optString("title", "").trim()
                        val subtitle = item.optString("subtitle", "").trim()
                        val prompt = item.optString("prompt", "").trim()
                        if (title.isEmpty() || subtitle.isEmpty() || prompt.isEmpty()) {
                            null
                        } else {
                            AgentHint(
                                id = item.optString("id", index.toString()),
                                title = title,
                                subtitle = subtitle,
                                prompt = prompt
                            )
                        }
                    }
                }
                if (continuation.isActive) continuation.resume(hints)
            } catch (e: Exception) {
                if (continuation.isActive) {
                    Log.e(TAG, "load failed", e)
                    continuation.resume(emptyList())
                }
            } finally {
                connection?.disconnect()
            }
        }
    }
}
