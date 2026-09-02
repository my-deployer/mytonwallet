import UIKit
import UIComponents
import WalletContext
import WalletCore

@MainActor
final class AgentRootRouterVC: WViewController {
    private let client: AgentV2Client
    private let activityIndicator = UIActivityIndicatorView(style: .medium)
    private var routingTask: Task<Void, Never>?
    private var isTransferringPendingQuery = false

    init(client: AgentV2Client = LiveAgentV2Client()) {
        self.client = client
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        routingTask?.cancel()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard !isTransferringPendingQuery,
              isMovingFromParent || parent?.isMovingFromParent == true
                || isBeingDismissed || navigationController?.isBeingDismissed == true else {
            return
        }
        AgentEntryPoint.clearPendingQuery()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .air.background
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.startAnimating()
        view.addSubview(activityIndicator)
        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        route()
    }

    private func route() {
        routingTask?.cancel()
        routingTask = Task { [weak self] in
            guard let self else { return }
            let status = try? await self.client.runtimeStatus()
            guard !Task.isCancelled else { return }
            guard let status, status.enabled else {
                self.replace(with: AgentConsentStore.hasAccepted ? AgentVC() : AgentConsentVC())
                return
            }

            let hasConsent = (try? await self.client.consent()) == true
            guard !Task.isCancelled else { return }
            if hasConsent {
                self.showAgentV2()
            } else {
                self.replace(with: AgentV2ConsentVC(client: self.client))
            }
        }
    }

    private func showAgentV2() {
        let coordinator = AgentV2Coordinator(client: client)
        coordinator.start()
        replace(with: AgentV2ChatVC(coordinator: coordinator))
    }

    fileprivate func replace(with viewController: UIViewController) {
        isTransferringPendingQuery = true
        guard parent == nil, let navigationController else {
            replaceEmbedded(with: viewController)
            return
        }
        var viewControllers = navigationController.viewControllers
        if let index = viewControllers.firstIndex(of: self) {
            viewControllers[index] = viewController
        } else {
            viewControllers = [viewController]
        }
        navigationController.setViewControllers(viewControllers, animated: false)
    }

    private func replaceEmbedded(with viewController: UIViewController) {
        children.forEach { child in
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }
        activityIndicator.removeFromSuperview()
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

@MainActor
private final class AgentV2ConsentVC: WViewController {
    private let client: AgentV2Client
    private let consentView = AgentConsentView()
    private var consentTask: Task<Void, Never>?
    private var isTransferringPendingQuery = false

    init(client: AgentV2Client) {
        self.client = client
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        consentTask?.cancel()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard !isTransferringPendingQuery,
              isMovingFromParent || parent?.isMovingFromParent == true
                || isBeingDismissed || navigationController?.isBeingDismissed == true else {
            return
        }
        AgentEntryPoint.clearPendingQuery()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .air.background
        consentView.translatesAutoresizingMaskIntoConstraints = false
        consentView.onLearnMore = {
            guard let url = URL(string: APP_PRIVACY_POLICY_URL) else { return }
            AppActions.openInBrowser(url, title: lang("Privacy Policy"), injectDappConnect: false)
        }
        consentView.onContinue = { [weak self] in self?.accept() }
        view.addSubview(consentView)
        NSLayoutConstraint.activate([
            consentView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            consentView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            consentView.topAnchor.constraint(equalTo: view.topAnchor),
            consentView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func accept() {
        guard consentTask == nil else { return }
        consentView.isUserInteractionEnabled = false
        consentTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.client.acceptConsent()
                guard !Task.isCancelled else { return }
                let coordinator = AgentV2Coordinator(client: self.client)
                coordinator.start()
                self.isTransferringPendingQuery = true
                self.replace(with: AgentV2ChatVC(coordinator: coordinator))
            } catch {
                self.consentView.isUserInteractionEnabled = true
                AppActions.showError(error: DisplayError(text: lang("Agent is unavailable")))
            }
            self.consentTask = nil
        }
    }

    private func replace(with viewController: UIViewController) {
        guard parent == nil, let navigationController else {
            consentView.removeFromSuperview()
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
            return
        }
        var viewControllers = navigationController.viewControllers
        if let index = viewControllers.firstIndex(of: self) {
            viewControllers[index] = viewController
        } else {
            viewControllers = [viewController]
        }
        navigationController.setViewControllers(viewControllers, animated: false)
    }
}
