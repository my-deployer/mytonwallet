import Testing
import WalletCore

@Suite("Account Receive Support")
struct AccountReceiveSupportTests {
    @Test
    func `temporary view wallets cannot open Receive`() {
        let account = makeAccount(type: .view, isTemporary: true)

        #expect(account.supportsReceive == false)
    }

    @Test
    func `saved view wallets can open Receive`() {
        let account = makeAccount(type: .view, isTemporary: false)

        #expect(account.supportsReceive == true)
    }

    private func makeAccount(type: AccountType, isTemporary: Bool) -> MAccount {
        MAccount(
            id: "receive-support-test-mainnet",
            title: nil,
            type: type,
            byChain: [.ton: AccountChain(address: "ton-address")],
            isTemporary: isTemporary
        )
    }
}
