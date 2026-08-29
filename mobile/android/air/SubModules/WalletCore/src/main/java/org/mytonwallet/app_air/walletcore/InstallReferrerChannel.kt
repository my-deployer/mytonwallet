package org.mytonwallet.app_air.walletcore

import android.content.Context
import android.webkit.WebView
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import org.json.JSONObject
import org.mytonwallet.app_air.walletbasecontext.logger.Logger

/**
 * Reads the Play Install Referrer once, sanitises the untrusted string, and
 * delivers the resulting channel to the web bridge via
 * `window.airBridge.setInstallChannel(...)`.
 *
 * Best-effort and fire-and-forget: if the referrer is unavailable or malformed,
 * nothing is delivered and the JS claim simply never fires this launch. The
 * Play Install Referrer connection is asynchronous, so this never blocks boot.
 */
object InstallReferrerChannel {

    fun deliver(context: Context, webView: WebView) {
        val client = InstallReferrerClient.newBuilder(context.applicationContext).build()
        try {
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            val channel = sanitizeReferrer(client.installReferrer.installReferrer)
                            if (channel != null) {
                                deliverChannel(webView, channel)
                            }
                        }
                    } catch (e: Exception) {
                        Logger.e(
                            Logger.LogTag.JS_WEBVIEW_BRIDGE,
                            "InstallReferrerChannel: read failed error=${e.javaClass.simpleName}"
                        )
                    } finally {
                        try {
                            client.endConnection()
                        } catch (_: Exception) {
                        }
                    }
                }

                override fun onInstallReferrerServiceDisconnected() {
                    // No retry this launch; the claim is idempotent across launches.
                    try {
                        client.endConnection()
                    } catch (_: Exception) {
                    }
                }
            })
        } catch (e: Exception) {
            Logger.e(
                Logger.LogTag.JS_WEBVIEW_BRIDGE,
                "InstallReferrerChannel: connection failed error=${e.javaClass.simpleName}"
            )
            try {
                client.endConnection()
            } catch (_: Exception) {
            }
        }
    }

    // The referrer is untrusted input, so the channel is escaped with
    // JSONObject.quote and NEVER string-interpolated into the evaluated script.
    private fun deliverChannel(webView: WebView, channel: String) {
        val script = "window.airBridge?.setInstallChannel(" + JSONObject.quote(channel) + ")"
        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (e: Exception) {
                // WebView may already be destroyed/disposed by the time this runs; a lost
                // install-channel delivery must never crash the app.
                Logger.e(
                    Logger.LogTag.JS_WEBVIEW_BRIDGE,
                    "InstallReferrerChannel: eval failed error=${e.javaClass.simpleName}"
                )
            }
        }
    }
}
