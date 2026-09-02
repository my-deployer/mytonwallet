import Testing
import UIKit
@testable import ContextMenuKit

@Suite("Context Menu Presentation")
@MainActor
struct ContextMenuPresentationTests {
    @Test
    func `zoom popover resolves to the supported presentation`() {
        if #available(iOS 26.0, *) {
            #expect(ContextMenuPresentationMode.zoomPopover.resolved == .zoomPopover)
        } else {
            #expect(ContextMenuPresentationMode.zoomPopover.resolved == .overlay)
        }
        #expect(ContextMenuPresentationMode.overlay.resolved == .overlay)
        if #available(iOS 26.0, *) {
            #expect(
                ContextMenuPresentationMode.zoomSheetOrPopover.resolved(usesRegularWidthLayout: false)
                    == .zoomSheet
            )
            #expect(
                ContextMenuPresentationMode.zoomSheetOrPopover.resolved(usesRegularWidthLayout: true)
                    == .zoomPopover
            )
        } else {
            #expect(
                ContextMenuPresentationMode.zoomSheetOrPopover.resolved(usesRegularWidthLayout: false)
                    == .overlay
            )
            #expect(
                ContextMenuPresentationMode.zoomSheetOrPopover.resolved(usesRegularWidthLayout: true)
                    == .overlay
            )
        }
    }

    @Test
    func `portal source becomes the transition source`() throws {
        let anchorView = UIView(frame: CGRect(x: 10, y: 20, width: 40, height: 40))
        let transitionSourceView = UIView(frame: anchorView.frame)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.addSubview(anchorView)
        window.addSubview(transitionSourceView)

        let reference = ContextMenuPresentationReference.from(
            view: anchorView,
            sourcePortal: ContextMenuSourcePortal(
                sourceViewProvider: { transitionSourceView },
                mask: .attachmentRect
            )
        )

        #expect(reference.transitionSourceView === transitionSourceView)
        #expect(reference.portalSourceView === transitionSourceView)
    }

    @Test
    func `zoom popover uses system chrome around transparent menu content`() throws {
        guard #available(iOS 26.0, *) else {
            return
        }

        let sourceView = UIView(frame: CGRect(x: 20, y: 20, width: 48, height: 48))
        let configuration = ContextMenuConfiguration(
            rootPage: ContextMenuPage(items: [
                .action(ContextMenuAction(title: "Action")),
            ])
        )
        let viewController = ContextMenuPopoverViewController(
            configuration: configuration,
            sourceView: sourceView,
            sourceUserInterfaceStyle: .light,
            sourceUserInterfaceLayoutDirection: .leftToRight
        )
        let popover = try #require(viewController.popoverPresentationController)

        #expect(viewController.modalPresentationStyle == .popover)
        let sourceItem = try #require(popover.sourceItem as? UIBarButtonItem)
        #expect(sourceItem.customView === sourceView)
        #expect(popover.sourceView == nil)

        viewController.loadViewIfNeeded()
        viewController.view.frame = CGRect(origin: .zero, size: viewController.preferredContentSize)
        viewController.view.setNeedsLayout()
        viewController.view.layoutIfNeeded()

        let navigationView = try #require(
            self.firstSubview(of: ContextMenuNavigationView.self, in: viewController.view)
        )
        #expect(navigationView.delegate === viewController)
        #expect(self.firstSubview(of: ContextMenuPanelView.self, in: viewController.view) == nil)
    }

    @Test
    func `zoom sheet preserves authored content geometry`() throws {
        guard #available(iOS 26.0, *) else {
            return
        }

        let sourceView = UIView(frame: CGRect(x: 20, y: 20, width: 48, height: 48))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.addSubview(sourceView)
        let configuration = ContextMenuConfiguration(
            rootPage: ContextMenuPage(items: [
                .action(ContextMenuAction(title: "Action")),
            ]),
            style: ContextMenuStyle(
                minWidth: 386,
                maxWidth: 386,
                screenInsets: UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
            )
        )
        let viewController = ContextMenuSheetViewController(
            configuration: configuration,
            sourceView: sourceView,
            sourceUserInterfaceStyle: .light,
            sourceUserInterfaceLayoutDirection: .leftToRight
        )

        #expect(viewController.preferredContentSize.width == 386)

        viewController.loadViewIfNeeded()
        let presentationScale = 386.0 / 402.0
        viewController.view.frame = CGRect(
            x: 0,
            y: 0,
            width: 402,
            height: viewController.preferredContentSize.height / presentationScale
        )
        viewController.view.setNeedsLayout()
        viewController.view.layoutIfNeeded()

        let navigationView = try #require(
            self.firstSubview(of: ContextMenuNavigationView.self, in: viewController.view)
        )
        #expect(abs(navigationView.bounds.width - 386) < 0.01)
        #expect(abs(navigationView.frame.width - 402) < 0.01)
        #expect(abs(navigationView.frame.height - viewController.view.bounds.height) < 0.01)
    }

    @Test
    func `private sheet runtime overrides the backdrop color`() {
        let backdropView = ContextMenuSheetBackdropViewStub()
        let presentationController = ContextMenuSheetPresentationControllerStub(
            backdropView: backdropView
        )

        #expect(
            ContextMenuPrivateSheetRuntime.setBackdropColor(
                .clear,
                on: presentationController
            )
        )
        #expect(backdropView.color == .clear)
        #expect(!ContextMenuPrivateSheetRuntime.setBackdropColor(.clear, on: NSObject()))
    }

    private func firstSubview<T: UIView>(of type: T.Type, in view: UIView) -> T? {
        for subview in view.subviews {
            if let match = subview as? T {
                return match
            }
            if let match = self.firstSubview(of: type, in: subview) {
                return match
            }
        }
        return nil
    }
}

private final class ContextMenuSheetPresentationControllerStub: NSObject {
    private let backdropView: NSObject

    init(backdropView: NSObject) {
        self.backdropView = backdropView
    }

    @objc(_confinedDimmingView)
    func privateBackdropView() -> NSObject {
        self.backdropView
    }
}

private final class ContextMenuSheetBackdropViewStub: NSObject {
    private(set) var color: UIColor?

    @objc(setDimmingColor:)
    func setPrivateColor(_ color: UIColor) {
        self.color = color
    }
}
