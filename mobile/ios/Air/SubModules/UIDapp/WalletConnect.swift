import WalletCore
import WalletContext

private let log = Log("WalletConnect")

@MainActor
public final class WalletConnect {
    public static let shared = WalletConnect()

    private init() {}

    public func start() {
        WalletConnectPayFlow.shared.start()
    }

    public func handleDeeplink(_ url: String, source: DeeplinkOpenSource) {
        Task {
            do {
                try await Api.walletConnect_handleDeepLink(url, shouldReturnToDapp: source == .generic)
            } catch {
                log.error("failed to handle deeplink: \(error, .public)")
                AppActions.showError(error: error)
            }
        }
    }
}
