package org.mytonwallet.app_air.walletcore

import java.net.URLDecoder

// Keys parsed from the referrer. `r` (swap referrerId) is here only so a referrer
// carrying it parses cleanly; the channel carrier is always `utm_source`.
private val REFERRER_PARSE_KEYS = setOf(
    "clickId",
    "r",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content"
)

// Input-safety guard for one decoded value. Looser than the canonical slug guard
// below: it allows the hyphen in the Play "google-play" organic marker.
private val REFERRER_VALUE_PATTERN = Regex("^[A-Za-z0-9._~-]{1,64}$")

// A canonical channel bucket slug, e.g. "wc", "tg_channel", "app_share".
private val CANONICAL_SLUG_PATTERN = Regex("^[a-z0-9_]{1,64}$")

private const val ORGANIC_UTM_SOURCE = "google-play"
private const val ORGANIC_UTM_MEDIUM = "organic"
private const val CHANNEL_ORGANIC = "organic"
private const val CHANNEL_UNKNOWN = "unknown"

/**
 * Resolve the channel from an untrusted Play Install Referrer into a canonical bucket, never null:
 * `organic` for the Google Play organic marker, the `utm_source` slug when well-formed, or
 * `unknown` when absent, empty or malformed. Enforces input safety only; the JS claim path
 * re-validates and buckets unrecognised slugs server-side.
 */
fun sanitizeReferrer(raw: String?): String {
    if (raw.isNullOrEmpty()) return CHANNEL_UNKNOWN

    var utmSource: String? = null
    var utmMedium: String? = null
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
        when (key) {
            "utm_source" -> utmSource = value
            "utm_medium" -> utmMedium = value
        }
    }

    // The organic-marker check MUST run before the canonical slug guard:
    // "google-play" passes REFERRER_VALUE_PATTERN (hyphen allowed) but fails
    // CANONICAL_SLUG_PATTERN (hyphen rejected).
    if (utmSource == ORGANIC_UTM_SOURCE && utmMedium == ORGANIC_UTM_MEDIUM) {
        return CHANNEL_ORGANIC
    }

    val source = utmSource
    if (source != null && CANONICAL_SLUG_PATTERN.matches(source)) {
        return source
    }
    return CHANNEL_UNKNOWN
}
