import UIKit
import UIComponents
import WalletCore
import WalletContext

@MainActor
final class AgentProtocolRouterVC: WViewController, WalletCoreData.EventsObserver, @unchecked Sendable {
    typealias ProtocolVersion = ApiUpdate.UpdateConfig.AgentProtocolVersion

    private let overrideConfig: AgentOverrideConfig
    private let makeViewController: (ProtocolVersion) -> UIViewController
    private var activeVersion: ProtocolVersion?

    init(
        overrideConfig: AgentOverrideConfig,
        makeViewController: @escaping (ProtocolVersion) -> UIViewController
    ) {
        self.overrideConfig = overrideConfig
        self.makeViewController = makeViewController
        super.init(nibName: nil, bundle: nil)
        title = lang("Agent")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = UIView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        WalletCoreData.addImmediately(eventObserver: self)
        updateRoute()
    }

    override func scrollToTop(animated: Bool) {
        (children.first as? WViewController)?.scrollToTop(animated: animated)
    }

    func walletCore(event: WalletCoreData.Event) {
        guard case .configChanged = event else { return }
        updateRoute()
    }

    private func updateRoute() {
        let version = overrideConfig.resolve(backendVersion: ConfigStore.shared.agentProtocolVersion)
        guard version != activeVersion else { return }
        activeVersion = version
        replaceChild(with: makeViewController(version))
    }

    private func replaceChild(with viewController: UIViewController) {
        children.forEach { child in
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }

        navigationItem.title = lang("Agent")
        navigationItem.titleView = nil
        navigationItem.rightBarButtonItems = nil
        navigationItem.accessibilityLabel = lang("Agent")

        addChild(viewController)
        viewController.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(viewController.view)
        NSLayoutConstraint.activate([
            viewController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            viewController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            viewController.view.topAnchor.constraint(equalTo: view.topAnchor),
            viewController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        viewController.didMove(toParent: self)
    }
}

extension UIViewController {
    var agentHostNavigationItem: UINavigationItem {
        var viewController = self
        while let parent = viewController.parent, !(parent is UINavigationController) {
            viewController = parent
        }
        return viewController.navigationItem
    }
}
