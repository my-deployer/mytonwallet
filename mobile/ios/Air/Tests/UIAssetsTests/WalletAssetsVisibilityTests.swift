import Testing
@testable import UIAssets

@Suite("Wallet Assets Visibility")
@MainActor
struct WalletAssetsVisibilityTests {
    @Test
    func `loading NFT data keeps the section visible`() {
        #expect(WalletAssetsVC.shouldShowContent(hasDisplayTabs: true, visibleNftCount: nil))
    }

    @Test
    func `loaded empty NFT data hides the section`() {
        #expect(!WalletAssetsVC.shouldShowContent(hasDisplayTabs: true, visibleNftCount: 0))
    }

    @Test
    func `visible NFTs show the section`() {
        #expect(WalletAssetsVC.shouldShowContent(hasDisplayTabs: true, visibleNftCount: 1))
    }

    @Test
    func `compact NFT loading state contains three tiles`() {
        #expect(NftsVC.loadingPlaceholderCount(layoutMode: .compact, hasLoadedData: false) == 3)
        #expect(NftsVC.loadingPlaceholderCount(layoutMode: .compact, hasLoadedData: true) == 0)
        #expect(NftsVC.loadingPlaceholderCount(layoutMode: .regular, hasLoadedData: false) == 0)
    }
}
