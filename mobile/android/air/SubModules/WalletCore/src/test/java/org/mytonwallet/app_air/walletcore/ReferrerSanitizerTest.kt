package org.mytonwallet.app_air.walletcore

import org.junit.Assert.assertEquals
import org.junit.Test

class ReferrerSanitizerTest {
    @Test
    fun extractsAllowlistedUtmSource() {
        assertEquals("wc", sanitizeReferrer("utm_source=wc&utm_medium=cpc"))
    }

    @Test
    fun bareUtmSourceResolvesToSlug() {
        assertEquals("wc", sanitizeReferrer("utm_source=wc"))
    }

    @Test
    fun googlePlayOrganicMarkerResolvesToOrganic() {
        assertEquals(
            "organic",
            sanitizeReferrer("utm_source=google-play&utm_medium=organic")
        )
    }

    @Test
    fun emptyReferrerResolvesToUnknown() {
        assertEquals("unknown", sanitizeReferrer(""))
    }

    @Test
    fun nullReferrerResolvesToUnknown() {
        assertEquals("unknown", sanitizeReferrer(null))
    }

    @Test
    fun rejectsInjectionPayload() {
        assertEquals("unknown", sanitizeReferrer("utm_source=%22)%3Bevil%2F%2F"))
    }

    @Test
    fun rejectsOverlongAndMissing() {
        assertEquals("unknown", sanitizeReferrer("utm_source=" + "a".repeat(65)))
        assertEquals("unknown", sanitizeReferrer("gclid=abc"))
    }

    @Test
    fun rejectsNonCanonicalSlugUtmSource() {
        // "google-play" alone (no organic utm_medium) passes input-safety (hyphen is
        // allowed there) but fails the stricter canonical slug guard.
        assertEquals("unknown", sanitizeReferrer("utm_source=google-play"))
    }
}
