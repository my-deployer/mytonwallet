package org.mytonwallet.app_air.walletcore.stores

import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.logger.Logger
import org.mytonwallet.app_air.walletcontext.cacheStorage.WCacheStorage
import org.mytonwallet.app_air.walletcontext.globalStorage.WGlobalStorage
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.WalletEvent
import org.mytonwallet.app_air.walletcore.models.MToken
import org.mytonwallet.app_air.walletcore.moshi.MApiTokenDetails
import org.mytonwallet.app_air.walletcore.moshi.api.ApiMethod

internal object TokenDetailsCacheHelper : WalletCore.EventObserver {
    private const val PRELOAD_LIMIT = 20
    private const val CACHE_LIMIT_PER_ACCOUNT = 50
    private const val CACHE_VALIDITY = 15 * 60 * 1000L
    private const val PRELOAD_DEBOUNCE = 300L
    private const val INVALID_CACHE_CHECK_INTERVAL = 60 * 1000L
    private val lock = Any()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val persistenceScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    private val cacheAdapter by lazy { WalletCore.moshi.adapter(TokenDetailsCache::class.java) }

    @Volatile
    private var cache = TokenDetailsCache()

    @Volatile
    private var persistenceJob: Job? = null

    @Volatile
    private var isForeground = true

    private var isStarted = false
    private var isCacheLoadStarted = false
    private var cacheLoadJob: Job? = null
    private val cacheLoaded = CompletableDeferred<Unit>()
    private val requests = mutableMapOf<String, Deferred<MApiTokenDetails?>>()
    private val preloadRequests = Channel<Unit>(Channel.CONFLATED)
    private val preloadWorker = scope.launch {
        for (request in preloadRequests) {
            delay(PRELOAD_DEBOUNCE.milliseconds)
            while (preloadRequests.tryReceive().isSuccess) {
                // Coalesce account, balance, and token updates into one preload pass.
            }
            preloadActiveAccount()
        }
    }

    fun loadFromCache() {
        lateinit var newLoadJob: Job
        val loadJob = synchronized(lock) {
            if (isCacheLoadStarted) return
            isCacheLoadStarted = true
            scope.launch(start = CoroutineStart.LAZY) {
                try {
                    val cacheString = WCacheStorage.getTokenDetails() ?: return@launch
                    val parsed = cacheAdapter.fromJson(cacheString) ?: TokenDetailsCache()
                    val sanitized = parsed.sanitized(
                        validAccountIds = WGlobalStorage.accountIds().toSet(),
                        limit = CACHE_LIMIT_PER_ACCOUNT,
                        now = System.currentTimeMillis(),
                        validity = CACHE_VALIDITY
                    )
                    if (applyLoadedCache(newLoadJob, sanitized) && sanitized != parsed) {
                        schedulePersistence()
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (t: Throwable) {
                    Logger.e(
                        Logger.LogTag.AIR_APPLICATION,
                        "TokenDetailsCacheHelper: bad cache: ${t.message}"
                    )
                    if (applyLoadedCache(newLoadJob, TokenDetailsCache())) {
                        schedulePersistence()
                    }
                }
            }.also {
                newLoadJob = it
                cacheLoadJob = it
                it.invokeOnCompletion {
                    synchronized(lock) {
                        if (cacheLoadJob === newLoadJob) cacheLoadJob = null
                    }
                    cacheLoaded.complete(Unit)
                }
            }
        }
        loadJob.start()
    }

    fun onBridgeReady() {
        WalletCore.unregisterObserver(this)
        WalletCore.registerObserver(this)
        synchronized(lock) {
            if (!isStarted) {
                isStarted = true
                scope.launch {
                    while (isActive) {
                        delay(INVALID_CACHE_CHECK_INTERVAL)
                        if (isForeground) schedulePreload()
                    }
                }
            }
        }
        schedulePreload()
    }

    fun cachedTokenDetails(tokenSlug: String): MApiTokenDetails? {
        if (!cacheLoaded.isCompleted) return null
        val language = LocaleController.activeLanguage.langCode
        return synchronized(lock) {
            cache.cachedDetails(
                language = language,
                slug = tokenSlug,
                now = System.currentTimeMillis(),
                validity = CACHE_VALIDITY
            )
        }
    }

    suspend fun awaitCachedTokenDetails(accountId: String, tokenSlug: String): MApiTokenDetails? =
        withContext(Dispatchers.IO) {
            cacheLoaded.await()
            if (WGlobalStorage.getAccount(accountId) == null) return@withContext null
            cachedTokenDetailsAfterLoad(accountId, tokenSlug)
        }

    private fun cachedTokenDetailsAfterLoad(
        accountId: String,
        tokenSlug: String
    ): MApiTokenDetails? {
        val language = WGlobalStorage.getLangCode()
        val now = System.currentTimeMillis()
        var cachedDetails: MApiTokenDetails? = null
        updateCache { current ->
            current
                .remember(
                    accountId = accountId,
                    slugs = listOf(tokenSlug),
                    limit = CACHE_LIMIT_PER_ACCOUNT,
                    promoteExisting = true
                )
                .removingExpired(now, CACHE_VALIDITY)
                .also {
                    cachedDetails = it.cachedDetails(language, tokenSlug, now, CACHE_VALIDITY)
                }
        }
        return cachedDetails
    }

    suspend fun refreshTokenDetails(accountId: String, token: MToken): MApiTokenDetails? =
        withContext(Dispatchers.IO) {
            cacheLoaded.await()
            if (WGlobalStorage.getAccount(accountId) == null) return@withContext null
            val language = WGlobalStorage.getLangCode()
            remember(accountId, listOf(token.slug), promoteExisting = true)
            requestTokenDetails(language, token)
        }

    fun removeAccount(accountId: String) {
        updateCache { it.removeAccount(accountId) }
    }

    fun clear() {
        val activeJobs = synchronized(lock) {
            val jobs = requests.values.mapTo(mutableListOf<Job>()) { it }
            cacheLoadJob?.let(jobs::add)
            cacheLoadJob = null
            cache = TokenDetailsCache()
            requests.clear()
            jobs
        }
        activeJobs.forEach { it.cancel() }
        while (preloadRequests.tryReceive().isSuccess) {
            // Drop preload work scheduled for accounts that no longer exist.
        }
        schedulePersistence()
    }

    override fun onWalletEvent(walletEvent: WalletEvent) {
        when (walletEvent) {
            WalletEvent.AppBackground -> isForeground = false

            WalletEvent.AppForeground -> {
                isForeground = true
                schedulePreload()
            }

            WalletEvent.AssetsAndActivityDataUpdated,
            WalletEvent.BalanceChanged,
            WalletEvent.BaseCurrencyChanged,
            WalletEvent.NetworkConnected,
            WalletEvent.TokensChanged,
            is WalletEvent.AccountChanged -> schedulePreload()

            is WalletEvent.AccountRemoved -> removeAccount(walletEvent.accountId)

            else -> Unit
        }
    }

    private suspend fun preloadActiveAccount() {
        cacheLoaded.await()
        if (!isForeground || WalletCore.bridge == null || !WalletCore.isConnected()) return
        val preloadSnapshot = withContext(Dispatchers.Main.immediate) {
            val accountId = AccountStore.activeAccountId ?: return@withContext null
            val assets = AccountStore.assetsAndActivityData
            if (assets.accountId != accountId) return@withContext null
            accountId to assets.copy(
                hiddenTokens = ArrayList(assets.hiddenTokens),
                visibleTokens = ArrayList(assets.visibleTokens),
                deletedTokens = ArrayList(assets.deletedTokens),
                addedTokens = ArrayList(assets.addedTokens),
                pinnedTokens = ArrayList(assets.pinnedTokens)
            )
        } ?: return

        val accountId = preloadSnapshot.first
        val tokens = preloadSnapshot.second.getAllTokens()
            .asSequence()
            .mapNotNull { TokenStore.getToken(it.token) }
            .distinctBy { it.slug }
            .take(PRELOAD_LIMIT)
            .toList()
        if (!isForeground || AccountStore.activeAccountId != accountId) return
        val language = WGlobalStorage.getLangCode()
        remember(accountId, tokens.map { it.slug }, promoteExisting = false)

        for (token in tokens) {
            if (!isForeground ||
                AccountStore.activeAccountId != accountId ||
                !WalletCore.isConnected()
            ) {
                return
            }
            if (hasValidDetails(language, token.slug)) continue
            try {
                requestTokenDetails(language, token)
            } catch (e: CancellationException) {
                if (!currentCoroutineContext().isActive) throw e
            }
        }
    }

    private fun remember(accountId: String, slugs: List<String>, promoteExisting: Boolean) {
        val now = System.currentTimeMillis()
        updateCache { current ->
            current
                .remember(
                    accountId = accountId,
                    slugs = slugs,
                    limit = CACHE_LIMIT_PER_ACCOUNT,
                    promoteExisting = promoteExisting
                )
                .removingExpired(now, CACHE_VALIDITY)
        }
    }

    private fun hasValidDetails(language: String, tokenSlug: String): Boolean = synchronized(lock) {
        cache.cachedDetails(
            language = language,
            slug = tokenSlug,
            now = System.currentTimeMillis(),
            validity = CACHE_VALIDITY
        ) != null
    }

    private suspend fun requestTokenDetails(language: String, token: MToken): MApiTokenDetails? {
        val requestKey = "$language:${token.slug}"
        lateinit var newRequest: Deferred<MApiTokenDetails?>
        val request = synchronized(lock) {
            requests[requestKey] ?: run {
                scope.async(start = CoroutineStart.LAZY) {
                    try {
                        val details = WalletCore.call(
                            ApiMethod.Tokens.FetchTokenDetails(
                                listOf(
                                    if (token.isTon) "TON" else token.tokenAddress ?: token.slug
                                )
                            )
                        ).firstOrNull { it.slug == token.slug }
                            ?: MApiTokenDetails(token.slug)
                        currentCoroutineContext().ensureActive()
                        cacheDetails(language, details, requestKey, newRequest)
                        details
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Throwable) {
                        null
                    } finally {
                        synchronized(lock) {
                            if (requests[requestKey] === newRequest) requests.remove(requestKey)
                        }
                    }
                }.also {
                    newRequest = it
                    requests[requestKey] = it
                }
            }
        }
        request.start()
        return request.await()
    }

    private fun applyLoadedCache(loadJob: Job, loadedCache: TokenDetailsCache): Boolean =
        synchronized(lock) {
            if (cacheLoadJob !== loadJob) {
                false
            } else {
                cache = loadedCache
                true
            }
        }

    private fun cacheDetails(
        language: String,
        details: MApiTokenDetails,
        requestKey: String,
        request: Deferred<MApiTokenDetails?>
    ) {
        val now = System.currentTimeMillis()
        updateCache { current ->
            if (requests[requestKey] !== request) {
                current
            } else {
                current.store(language, details, now)
                    .removingExpired(now, CACHE_VALIDITY)
            }
        }
    }

    private fun updateCache(transform: (TokenDetailsCache) -> TokenDetailsCache) {
        var didUpdate = false
        synchronized(lock) {
            val updated = transform(cache)
            if (updated != cache) {
                cache = updated
                didUpdate = true
            }
        }
        if (didUpdate) schedulePersistence()
    }

    private fun schedulePreload() {
        preloadRequests.trySend(Unit)
    }

    @Synchronized
    private fun schedulePersistence() {
        persistenceJob?.cancel()
        persistenceJob = persistenceScope.launch {
            try {
                val snapshot = synchronized(lock) { cache }
                val json = if (snapshot.recentSlugsByAccountId.isEmpty()) {
                    null
                } else {
                    cacheAdapter.toJson(snapshot)
                }
                ensureActive()
                WCacheStorage.setTokenDetails(json)
            } catch (t: OutOfMemoryError) {
                Logger.e(
                    Logger.LogTag.MEMORY,
                    "TokenDetailsCacheHelper: OOM serializing cache: ${t.message}"
                )
            }
        }
    }
}
