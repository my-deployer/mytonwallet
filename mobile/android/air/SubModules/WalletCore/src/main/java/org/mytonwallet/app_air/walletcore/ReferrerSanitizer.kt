package org.mytonwallet.app_air.walletcore

import java.net.URLDecoder

// Keys we are willing to parse out of an install-referrer string. `r` (the swap
// referrerId) is kept here ONLY so a referrer that carries it parses cleanly; it
// is NEVER returned as the channel. The channel carrier is always `utm_source`.
private val REFERRER_PARSE_KEYS = setOf(
    "clickId",
    "r",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content"
)

// Input-safety guard for a single decoded value: a short, URL-safe token.
private val REFERRER_VALUE_PATTERN = Regex("^[A-Za-z0-9._~-]{1,64}$")

/**
 * Extract the install channel from an untrusted Play Install Referrer string.
 *
 * This enforces INPUT SAFETY only (char-class + length bound + `utm_source`
 * extraction). It does NOT enforce the business allowlist of known channels;
 * that is re-validated downstream inside the JS claim path (single source of
 * truth). A well-formed but unknown `utm_source` legitimately passes here and
 * is dropped later in JS.
 *
 * @return the valid `utm_source` value, or null when absent or malformed.
 */
fun sanitizeReferrer(raw: String): String? {
    var channel: String? = null
    for (pair in raw.split("&")) {
        val separator = pair.indexOf('=')
        if (separator < 0) continue
        val key = pair.substring(0, separator)
        if (key !in REFERRER_PARSE_KEYS) continue
        val value = try {
            URLDecoder.decode(pair.substring(separator + 1), "UTF-8")
        } catch (_: Exception) {
            continue
        }
        if (!REFERRER_VALUE_PATTERN.matches(value)) continue
        if (key == "utm_source") channel = value
    }
    return channel
}
