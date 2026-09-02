import Testing
import UIKit
@testable import UIComponents

@Suite("Navigation Back Swipe")
@MainActor
struct NavigationBackSwipeTests {
    @Test
    func `navigation delegate leaves native transitions under UIKit control`() {
        let navigationController = WNavigationController(rootViewController: UIViewController())
        navigationController.loadViewIfNeeded()

        let animationControllerSelector = NSSelectorFromString(
            "navigationController:animationControllerForOperation:fromViewController:toViewController:"
        )
        let interactionControllerSelector = NSSelectorFromString(
            "navigationController:interactionControllerForAnimationController:"
        )

        #expect(navigationController.delegate?.responds(to: animationControllerSelector) == false)
        #expect(navigationController.delegate?.responds(to: interactionControllerSelector) == false)
    }

    @Test
    func `compatibility navigation reports and restores full width gesture state`() {
        guard !IOS_26_MODE_ENABLED else { return }
        let navigationController = WNavigationController(rootViewController: UIViewController())
        navigationController.loadViewIfNeeded()

        #expect(navigationController.interactivePopGestureRecognizer?.isEnabled == false)
        #expect(navigationController.isBackSwipeToDismissAllowed)

        navigationController.allowBackSwipeToDismiss(false)
        #expect(!navigationController.isBackSwipeToDismissAllowed)

        navigationController.allowBackSwipeToDismiss(true)
        #expect(navigationController.isBackSwipeToDismissAllowed)
    }
}
