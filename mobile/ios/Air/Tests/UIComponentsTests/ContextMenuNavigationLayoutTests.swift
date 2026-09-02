import Testing
import UIKit
@testable import ContextMenuKit

@Suite("Context Menu Navigation Layout")
@MainActor
struct ContextMenuNavigationLayoutTests {
    @Test
    func `screen bottom grid matches the action sheet geometry`() throws {
        let itemCount = 7
        let items: [ContextMenuItem] = (0..<itemCount).map { index in
            .custom(ContextMenuCustomRow(
                id: "item-\(index)",
                preferredWidth: 386,
                sizing: .fixed(height: 124),
                interaction: .selectable()
            ) { _ in
                UIView()
            })
        }
        let page = ContextMenuPage(
            items: items,
            layout: .grid(ContextMenuGridLayout(
                columns: 3,
                contentInsets: UIEdgeInsets(top: 48, left: 20, bottom: 20, right: 20),
                highlightInsets: UIEdgeInsets(top: -7, left: 4, bottom: 15, right: 4),
                highlightCornerRadius: 24
            ))
        )
        let style = ContextMenuStyle(
            minWidth: 386,
            maxWidth: 386,
            verticalPlacementBehavior: .screenBottom,
            panelCornerRadius: 54,
            screenInsets: UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        )
        let configuration = ContextMenuConfiguration(rootPage: page, backdrop: .none, style: style)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        let overlayView = ContextMenuOverlayView(
            configuration: configuration,
            sourceRectInWindow: CGRect(x: 326, y: 794, width: 48, height: 48),
            appearanceSourceView: nil,
            portalSourceView: nil,
            portalMaskRectInWindow: nil,
            portalMask: nil,
            portalShowsBackdropCutout: false,
            portalAppliesRightToLeftTransformCorrection: false,
            sourceUserInterfaceStyle: .light,
            sourceUserInterfaceLayoutDirection: .leftToRight
        )
        overlayView.frame = window.bounds
        window.addSubview(overlayView)
        overlayView.layoutIfNeeded()

        let navigationView = try #require(
            overlayView.subviews.first { $0 is ContextMenuNavigationView } as? ContextMenuNavigationView
        )
        let panelFrame = navigationView.frame.insetBy(dx: style.panelInset, dy: style.panelInset)
        #expect(abs(panelFrame.minX - 8) < 0.5)
        #expect(abs(panelFrame.minY - 426) < 0.5)
        #expect(abs(panelFrame.width - 386) < 0.5)
        #expect(abs(panelFrame.height - 440) < 0.5)

        let pageView = try #require(self.firstSubview(of: ContextMenuPageView.self, in: navigationView))
        let rows = self.allSubviews(of: ContextMenuCustomRowView.self, in: pageView).sorted { lhs, rhs in
            if abs(lhs.frame.minY - rhs.frame.minY) > 0.5 {
                return lhs.frame.minY < rhs.frame.minY
            }
            return lhs.frame.minX < rhs.frame.minX
        }
        try #require(rows.count == itemCount)
        #expect(abs(rows[0].frame.minX - 20) < 0.5)
        #expect(abs(rows[0].frame.minY - 48) < 0.5)
        #expect(abs(rows[0].frame.width - 115.333) < 0.5)
        #expect(abs(rows[0].frame.height - 124) < 0.5)
        #expect(abs(rows[3].frame.minY - 172) < 0.5)
        #expect(abs(rows[6].frame.minY - 296) < 0.5)
    }

    @Test
    func `outside taps use the visible panel with an eight point safety margin`() throws {
        let fixture = try self.makeFixture(
            sourceRect: CGRect(x: 145, y: 150, width: 100, height: 40),
            rootActionCount: 3,
            submenuActionCount: 1
        )
        let panelFrame = fixture.navigationView.frame.insetBy(
            dx: fixture.style.panelInset,
            dy: fixture.style.panelInset
        )

        let protectedPoints = [
            CGPoint(x: panelFrame.minX - 7, y: panelFrame.midY),
            CGPoint(x: panelFrame.maxX + 7, y: panelFrame.midY),
            CGPoint(x: panelFrame.midX, y: panelFrame.minY - 7),
            CGPoint(x: panelFrame.midX, y: panelFrame.maxY + 7),
        ]
        for point in protectedPoints {
            #expect(!fixture.overlayView.shouldDismissMenu(at: point))
        }

        let outsidePoints = [
            CGPoint(x: panelFrame.minX - 9, y: panelFrame.midY),
            CGPoint(x: panelFrame.maxX + 9, y: panelFrame.midY),
            CGPoint(x: panelFrame.midX, y: panelFrame.minY - 9),
            CGPoint(x: panelFrame.midX, y: panelFrame.maxY + 9),
        ]
        for point in outsidePoints {
            #expect(fixture.overlayView.shouldDismissMenu(at: point))
        }
    }

    @Test
    func `short submenu push and pop remain above the source without changing the animation anchor`() async throws {
        let fixture = try self.makeFixture(
            sourceRect: CGRect(x: 145, y: 500, width: 100, height: 40),
            rootActionCount: 6,
            submenuActionCount: 1
        )
        let initialFrame = fixture.navigationView.frame
        let initialAnchorPoint = fixture.navigationView.layer.anchorPoint

        fixture.navigationView.pageView(
            fixture.rootPageView,
            didActivate: .submenu(fixture.submenuPage)
        )

        #expect(fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.maxY - initialFrame.maxY) < 0.5)
        #expect(fixture.navigationView.layer.anchorPoint == initialAnchorPoint)

        try await Task.sleep(nanoseconds: 600_000_000)

        #expect(!fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.maxY - initialFrame.maxY) < 0.5)

        let submenuAnchorPoint = fixture.navigationView.layer.anchorPoint
        fixture.navigationView.popToPreviousPageIfNeeded()

        #expect(fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.maxY - initialFrame.maxY) < 0.5)
        #expect(fixture.navigationView.layer.anchorPoint == submenuAnchorPoint)

        try await Task.sleep(nanoseconds: 600_000_000)

        #expect(!fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.maxY - initialFrame.maxY) < 0.5)
    }

    @Test
    func `scrollable submenu push and pop remain below the source without changing the animation anchor`() async throws {
        let fixture = try self.makeFixture(
            sourceRect: CGRect(x: 145, y: 150, width: 100, height: 40),
            rootActionCount: 1,
            submenuActionCount: 16
        )
        let initialFrame = fixture.navigationView.frame
        let initialAnchorPoint = fixture.navigationView.layer.anchorPoint

        fixture.navigationView.pageView(
            fixture.rootPageView,
            didActivate: .submenu(fixture.submenuPage)
        )

        #expect(fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.minY - initialFrame.minY) < 0.5)
        #expect(fixture.navigationView.layer.anchorPoint == initialAnchorPoint)

        try await Task.sleep(nanoseconds: 600_000_000)

        #expect(!fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.minY - initialFrame.minY) < 0.5)

        let submenuAnchorPoint = fixture.navigationView.layer.anchorPoint
        fixture.navigationView.popToPreviousPageIfNeeded()

        #expect(fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.minY - initialFrame.minY) < 0.5)
        #expect(fixture.navigationView.layer.anchorPoint == submenuAnchorPoint)

        try await Task.sleep(nanoseconds: 600_000_000)

        #expect(!fixture.navigationView.isTransitioningPages)
        #expect(abs(fixture.navigationView.frame.minY - initialFrame.minY) < 0.5)
    }

    private func makeFixture(
        sourceRect: CGRect,
        rootActionCount: Int,
        submenuActionCount: Int
    ) throws -> Fixture {
        let submenuPage = ContextMenuPage(items: [
            .back(ContextMenuBackAction(title: "Back")),
            .separator,
        ] + self.actions(count: submenuActionCount))
        let submenu = ContextMenuSubmenu(title: "Submenu") { submenuPage }
        let style = ContextMenuStyle(minWidth: 220, maxWidth: 220)
        let configuration = ContextMenuConfiguration(
            rootPage: ContextMenuPage(
                items: [.submenu(submenu)] + self.actions(count: rootActionCount)
            ),
            backdrop: .none,
            style: style
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let overlayView = ContextMenuOverlayView(
            configuration: configuration,
            sourceRectInWindow: sourceRect,
            appearanceSourceView: nil,
            portalSourceView: nil,
            portalMaskRectInWindow: nil,
            portalMask: nil,
            portalShowsBackdropCutout: false,
            portalAppliesRightToLeftTransformCorrection: false,
            sourceUserInterfaceStyle: .light,
            sourceUserInterfaceLayoutDirection: .leftToRight
        )
        overlayView.frame = window.bounds
        window.addSubview(overlayView)
        overlayView.setNeedsLayout()
        overlayView.layoutIfNeeded()

        let navigationView = try #require(
            overlayView.subviews.first { $0 is ContextMenuNavigationView } as? ContextMenuNavigationView
        )
        let rootPageView = try #require(
            self.firstSubview(of: ContextMenuPageView.self, in: navigationView)
        )
        return Fixture(
            window: window,
            overlayView: overlayView,
            navigationView: navigationView,
            rootPageView: rootPageView,
            submenuPage: submenuPage,
            style: style
        )
    }

    private func actions(count: Int) -> [ContextMenuItem] {
        (0..<count).map { index in
            .action(ContextMenuAction(title: "Action \(index)"))
        }
    }

    private func firstSubview<T: UIView>(
        of type: T.Type,
        in view: UIView
    ) -> T? {
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

    private func allSubviews<T: UIView>(of type: T.Type, in view: UIView) -> [T] {
        view.subviews.flatMap { subview in
            let match = (subview as? T).map { [$0] } ?? []
            return match + self.allSubviews(of: type, in: subview)
        }
    }

    private struct Fixture {
        let window: UIWindow
        let overlayView: ContextMenuOverlayView
        let navigationView: ContextMenuNavigationView
        let rootPageView: ContextMenuPageView
        let submenuPage: ContextMenuPage
        let style: ContextMenuStyle
    }
}
