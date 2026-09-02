package org.mytonwallet.app_air.uicomponents.widgets.autoComplete

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mytonwallet.app_air.walletcontext.models.MBlockchainNetwork
import org.mytonwallet.app_air.walletcore.models.MAccount
import org.mytonwallet.app_air.walletcore.models.MSavedAddress

class WAutoCompleteAddressViewTest {

    @Test
    fun findsOwnedAccountForSavedAddressOnSameNetworkAndChain() {
        val matchingAccount = account(
            accountId = "matching-mainnet",
            addresses = mapOf("ton" to "UQ123")
        )
        val otherChainAccount = account(
            accountId = "other-chain-mainnet",
            addresses = mapOf("tron" to "UQ123")
        )
        val testnetAccount = account(
            accountId = "matching-testnet",
            addresses = mapOf("ton" to "UQ123")
        )

        val result = findMatchingAccount(
            savedAddress = MSavedAddress("UQ123", "Saved", "ton"),
            network = MBlockchainNetwork.MAINNET,
            accounts = listOf(otherChainAccount, testnetAccount, matchingAccount)
        )

        assertEquals(matchingAccount, result)
    }

    @Test
    fun matchesDomainCaseInsensitivelyAtAnyPosition() {
        assertTrue(
            doesAddressItemFitSearch(
                address = "UQ123",
                domain = "Alice.Wallet.ton",
                name = "Main Wallet",
                query = "WALLET"
            )
        )
    }

    @Test
    fun rejectsQueryMissingFromAddressDomainAndName() {
        assertFalse(
            doesAddressItemFitSearch(
                address = "UQ123",
                domain = "alice.ton",
                name = "Main Wallet",
                query = "bob"
            )
        )
    }

    private fun account(accountId: String, addresses: Map<String, String>) = MAccount(
        accountId = accountId,
        byChain = addresses.mapValues { MAccount.AccountChain(address = it.value) },
        name = accountId,
        accountType = MAccount.AccountType.MNEMONIC,
        importedAt = null,
        isTemporary = false
    )
}
