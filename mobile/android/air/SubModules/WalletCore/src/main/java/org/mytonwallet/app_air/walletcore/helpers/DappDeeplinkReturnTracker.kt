package org.mytonwallet.app_air.walletcore.helpers

object DappDeeplinkReturnTracker {
    private data class RequestKey(val appClientId: String)

    // The deeplink was seen first; wait for the bridge update that provides its promise ID.
    private val pendingRequests = mutableMapOf<RequestKey, ArrayDeque<Boolean>>()

    // The bridge update was seen first; wait for the matching external deeplink.
    private val observedRequests = mutableMapOf<RequestKey, ArrayDeque<String>>()

    // Completed promises in this set should return the wallet task to the background.
    private val expectedPromiseIds = mutableSetOf<String>()

    @Synchronized
    fun expectTonConnect(appClientId: String?, shouldReturn: Boolean) {
        if (!appClientId.isNullOrBlank()) expect(RequestKey(appClientId), shouldReturn)
    }

    @Synchronized
    fun bindTonConnectRequest(appClientId: String?, promiseId: String) {
        if (!appClientId.isNullOrBlank()) bind(RequestKey(appClientId), promiseId)
    }

    @Synchronized
    fun consumeCompletedRequest(promiseId: String?): Boolean {
        if (promiseId == null) return false
        observedRequests.entries.removeAll { (_, requests) ->
            requests.remove(promiseId)
            requests.isEmpty()
        }
        return expectedPromiseIds.remove(promiseId)
    }

    private fun expect(requestKey: RequestKey, shouldReturn: Boolean) {
        val observed = observedRequests[requestKey]
        val promiseId = observed?.removeFirstOrNull()
        if (observed?.isEmpty() == true) observedRequests.remove(requestKey)
        if (promiseId != null) {
            if (shouldReturn) expectedPromiseIds.add(promiseId)
        } else {
            pendingRequests
                .getOrPut(requestKey) { ArrayDeque() }
                .addLast(shouldReturn)
        }
    }

    private fun bind(requestKey: RequestKey, promiseId: String) {
        val pending = pendingRequests[requestKey]
        val shouldReturn = pending?.removeFirstOrNull()
        if (pending?.isEmpty() == true) pendingRequests.remove(requestKey)
        if (shouldReturn != null) {
            if (shouldReturn) expectedPromiseIds.add(promiseId)
        } else {
            observedRequests
                .getOrPut(requestKey) { ArrayDeque() }
                .addLast(promiseId)
        }
    }

    @Synchronized
    internal fun reset() {
        pendingRequests.clear()
        observedRequests.clear()
        expectedPromiseIds.clear()
    }
}
