import Testing
import WalletContext

@Suite("Wallet Token Chain Accessory Experiment")
struct WalletTokenChainAccessoryExperimentTests {
    @Test
    func `disabled preserves multichain accessories`() {
        #expect(WalletTokenChainAccessoryExperiment.shouldShow(
            isMultichain: true,
            showsTokenLabel: false,
            experimentEnabled: false
        ))
        #expect(!WalletTokenChainAccessoryExperiment.shouldShow(
            isMultichain: false,
            showsTokenLabel: true,
            experimentEnabled: false
        ))
    }

    @Test
    func `enabled only shows accessories for labeled multichain tokens`() {
        #expect(WalletTokenChainAccessoryExperiment.shouldShow(
            isMultichain: true,
            showsTokenLabel: true,
            experimentEnabled: true
        ))
        #expect(!WalletTokenChainAccessoryExperiment.shouldShow(
            isMultichain: true,
            showsTokenLabel: false,
            experimentEnabled: true
        ))
        #expect(!WalletTokenChainAccessoryExperiment.shouldShow(
            isMultichain: false,
            showsTokenLabel: true,
            experimentEnabled: true
        ))
    }
}
