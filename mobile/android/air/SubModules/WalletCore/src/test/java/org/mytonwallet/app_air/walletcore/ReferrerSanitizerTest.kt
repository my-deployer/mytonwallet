package org.mytonwallet.app_air.walletcore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReferrerSanitizerTest {
    @Test
    fun extractsAllowlistedUtmSource() {
        assertEquals("wc", sanitizeReferrer("utm_source=wc&utm_medium=cpc"))
    }

    @Test
    fun rejectsInjectionPayload() {
        assertNull(sanitizeReferrer("utm_source=%22)%3Bevil%2F%2F"))
    }

    @Test
    fun rejectsOverlongAndMissing() {
        assertNull(sanitizeReferrer("utm_source=" + "a".repeat(65)))
        assertNull(sanitizeReferrer("gclid=abc"))
    }
}
