import UIKit

@available(iOS 26.0, *)
@MainActor
final class ContextMenuSheetViewController: ContextMenuPopoverViewController {
    private static let contentDetentIdentifier = UISheetPresentationController.Detent.Identifier(
        "ContextMenuKit.content"
    )

    private let removesBackdrop: Bool
    private let sourceContainerWidth: CGFloat
    private let sourceBottomSafeAreaInset: CGFloat
    private let estimatedPresentedHorizontalInsets: CGFloat

    override var navigationContentFrame: CGRect {
        let contentSize = CGSize(
            width: min(self.preferredContentSize.width, self.view.bounds.width),
            height: self.preferredContentSize.height
        )
        return CGRect(
            x: self.view.bounds.midX - contentSize.width * 0.5,
            y: self.view.bounds.midY - contentSize.height * 0.5,
            width: contentSize.width,
            height: contentSize.height
        )
    }

    override var navigationContentTransform: CGAffineTransform {
        let inverseScale = 1.0 / self.presentationScale
        return CGAffineTransform(scaleX: inverseScale, y: inverseScale)
    }

    init(
        configuration: ContextMenuConfiguration,
        sourceView: UIView,
        sourceUserInterfaceStyle: UIUserInterfaceStyle,
        sourceUserInterfaceLayoutDirection: UIUserInterfaceLayoutDirection
    ) {
        if case .none = configuration.backdrop {
            self.removesBackdrop = true
        } else {
            self.removesBackdrop = false
        }
        let sourceWindow = sourceView.window
        self.sourceContainerWidth = sourceWindow?.bounds.width ?? UIScreen.main.bounds.width
        self.sourceBottomSafeAreaInset = sourceWindow?.safeAreaInsets.bottom ?? 0
        self.estimatedPresentedHorizontalInsets = configuration.style.screenInsets.left
            + configuration.style.screenInsets.right

        super.init(
            configuration: configuration,
            sourceView: sourceView,
            sourceUserInterfaceStyle: sourceUserInterfaceStyle,
            sourceUserInterfaceLayoutDirection: sourceUserInterfaceLayoutDirection,
            modalPresentationStyle: .pageSheet,
            maximumContentHorizontalInsets: configuration.style.screenInsets
        )

        self.preferredTransition = .zoom { [weak sourceView] _ in
            sourceView
        }

        if let sheetPresentationController {
            sheetPresentationController.detents = [
                .custom(identifier: Self.contentDetentIdentifier) { [weak self] context in
                    guard let self else {
                        return nil
                    }
                    let bottomSafeAreaInset = self.viewIfLoaded?.safeAreaInsets.bottom
                        ?? self.sourceBottomSafeAreaInset
                    let height = self.preferredContentSize.height / self.presentationScale
                        - bottomSafeAreaInset
                    return min(max(0, height), context.maximumDetentValue)
                },
            ]
            sheetPresentationController.selectedDetentIdentifier = Self.contentDetentIdentifier
            sheetPresentationController.prefersGrabberVisible = true
            sheetPresentationController.prefersScrollingExpandsWhenScrolledToEdge = false
            sheetPresentationController.preferredCornerRadius = configuration.style.panelCornerRadius
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)

        self.removeBackdropIfNeeded()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        self.removeBackdropIfNeeded()
    }

    private var presentationScale: CGFloat {
        let containerView = self.presentationController?.containerView
        let containerWidth = containerView?.bounds.width ?? self.sourceContainerWidth
        guard containerWidth > 0 else {
            return 1
        }

        let laidOutPresentedWidth = containerView == nil
            ? 0
            : self.presentationController?.presentedView?.frame.width ?? 0
        let estimatedPresentedWidth = max(
            1,
            containerWidth - self.estimatedPresentedHorizontalInsets
        )
        let presentedWidth = laidOutPresentedWidth > 0
            ? laidOutPresentedWidth
            : estimatedPresentedWidth
        return min(1, max(0.01, presentedWidth / containerWidth))
    }

    private func removeBackdropIfNeeded() {
        guard self.removesBackdrop, let sheetPresentationController else {
            return
        }
        ContextMenuPrivateSheetRuntime.setBackdropColor(
            .clear,
            on: sheetPresentationController
        )
    }
}
