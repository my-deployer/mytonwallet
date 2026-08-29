package org.mytonwallet.app_air.walletcore.helpers

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DappDeeplinkReturnTrackerTest {
    @After
    fun tearDown() {
        DappDeeplinkReturnTracker.reset()
    }

    @Test
    fun externalTonConnectBackReturnsAfterMatchingIdentifier() {
        DappDeeplinkReturnTracker.expectTonConnect(
            "dapp-client",
            shouldReturn = true
        )

        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise")

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
    }

    @Test
    fun tonConnectRequestCanArriveBeforeItsDeeplink() {
        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise")

        DappDeeplinkReturnTracker.expectTonConnect(
            "dapp-client",
            shouldReturn = true
        )

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
    }

    @Test
    fun unrelatedTonConnectRequestKeepsPendingReturn() {
        DappDeeplinkReturnTracker.expectTonConnect(
            "dapp-client",
            shouldReturn = true
        )

        DappDeeplinkReturnTracker.bindTonConnectRequest("other-client", "other-promise")
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("other-promise"))

        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise")
        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
    }

    @Test
    fun nonBackTonConnectStrategyLeavesReturnToSdk() {
        DappDeeplinkReturnTracker.expectTonConnect("dapp-client", shouldReturn = false)
        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise")

        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
    }

    @Test
    fun nonBackRequestDoesNotClearAnotherPendingReturn() {
        DappDeeplinkReturnTracker.expectTonConnect("client-a", shouldReturn = true)
        DappDeeplinkReturnTracker.expectTonConnect("client-b", shouldReturn = false)

        DappDeeplinkReturnTracker.bindTonConnectRequest("client-a", "promise-a")
        DappDeeplinkReturnTracker.bindTonConnectRequest("client-b", "promise-b")

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-a"))
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-b"))
    }

    @Test
    fun overlappingRequestsReturnIndependently() {
        DappDeeplinkReturnTracker.expectTonConnect("client-a", shouldReturn = true)
        DappDeeplinkReturnTracker.bindTonConnectRequest("client-a", "promise-a")

        DappDeeplinkReturnTracker.expectTonConnect("client-b", shouldReturn = true)
        DappDeeplinkReturnTracker.bindTonConnectRequest("client-b", "promise-b")

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-b"))
        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-a"))
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-a"))
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-b"))
    }

    @Test
    fun overlappingRequestsFromSameClientAreQueued() {
        DappDeeplinkReturnTracker.expectTonConnect("dapp-client", shouldReturn = true)
        DappDeeplinkReturnTracker.expectTonConnect("dapp-client", shouldReturn = true)

        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise-a")
        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise-b")

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-b"))
        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-a"))
    }

    @Test
    fun completionDoesNotClearAnotherPendingRequest() {
        DappDeeplinkReturnTracker.expectTonConnect("client-a", shouldReturn = true)
        DappDeeplinkReturnTracker.bindTonConnectRequest("client-a", "promise-a")

        DappDeeplinkReturnTracker.expectTonConnect("client-b", shouldReturn = true)

        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-a"))

        DappDeeplinkReturnTracker.bindTonConnectRequest("client-b", "promise-b")
        assertTrue(DappDeeplinkReturnTracker.consumeCompletedRequest("promise-b"))
    }

    @Test
    fun completedUnmatchedRequestCannotBindLaterDeeplink() {
        DappDeeplinkReturnTracker.bindTonConnectRequest("dapp-client", "promise")

        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
        DappDeeplinkReturnTracker.expectTonConnect("dapp-client", shouldReturn = true)
        assertFalse(DappDeeplinkReturnTracker.consumeCompletedRequest("promise"))
    }
}
