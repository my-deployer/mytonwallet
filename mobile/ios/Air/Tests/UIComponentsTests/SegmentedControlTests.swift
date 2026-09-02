import ContextMenuKit
import Testing
import UIKit
@testable import UIComponents

@Suite("Segmented Control")
@MainActor
struct SegmentedControlTests {
    @Test
    func `accessory width moves between items without changing total width`() throws {
        let model = makeModel()
        let itemWidth: CGFloat = 100
        for item in model.items {
            model.setSize(itemId: item.id, size: CGSize(width: itemWidth, height: model.constants.height))
        }

        model.selection = .init(item1: "second", item2: "third", progress: 0.25)
        let layouts = try #require(model.itemLayouts())
        let second = try #require(layouts.first { $0.id == "second" })
        let third = try #require(layouts.first { $0.id == "third" })

        #expect(abs(second.accessoryVisibility - 0.75) < 0.001)
        #expect(abs(third.accessoryVisibility - 0.25) < 0.001)
        #expect(abs(third.labelFrame.minX - second.interactionFrame.maxX - model.constants.spacing) < 0.001)

        let expectedWidth = itemWidth * 3 + model.constants.spacing * 2 + model.constants.accessoryWidth
        #expect(abs(try #require(layouts.last).interactionFrame.maxX - expectedWidth) < 0.001)
    }

    @Test
    func `later titles move when accessory moves to the next item`() throws {
        let model = makeModel()
        for item in model.items {
            model.setSize(itemId: item.id, size: CGSize(width: 100, height: model.constants.height))
        }

        model.selection = .init(item1: "second")
        let selectedSecondLayouts = try #require(model.itemLayouts())
        let oldThirdX = try #require(selectedSecondLayouts.first { $0.id == "third" }).labelFrame.minX

        model.selection = .init(item1: "third")
        let selectedThirdLayouts = try #require(model.itemLayouts())
        let newThirdX = try #require(selectedThirdLayouts.first { $0.id == "third" }).labelFrame.minX

        #expect(abs(oldThirdX - newThirdX - model.constants.accessoryWidth) < 0.001)
    }

    @Test
    func `VoiceOver activation selects a tab`() {
        let model = makeModel()
        let control = WSegmentedControl(model: model)
        let interaction = SegmentedControlInteractionView()
        var activationCount = 0

        interaction.update(
            isSelected: false,
            itemId: "second",
            title: "Second",
            contextMenuProvider: nil,
            segmentedControl: control,
            onSelect: { activationCount += 1 }
        )

        #expect(interaction.accessibilityActivate())
        #expect(activationCount == 1)
        #expect(interaction.accessibilityTraits.contains(.button))
    }

    @Test
    func `interactive glass recognizes alongside tab selection`() throws {
        guard #available(iOS 26, iOSApplicationExtension 26, *) else { return }

        let model = makeModel()
        let control = WSegmentedControl(model: model, isGlassInteractive: true)
        let interaction = SegmentedControlInteractionView()
        interaction.update(
            isSelected: false,
            itemId: "second",
            title: "Second",
            contextMenuProvider: nil,
            segmentedControl: control,
            allowsSimultaneousGlassInteraction: true,
            onSelect: {}
        )

        let selectionTap = try #require(
            interaction.gestureRecognizers?.compactMap { $0 as? UITapGestureRecognizer }.first
        )
        let glassView = UIVisualEffectView(effect: UIGlassEffect())
        let glassInteraction = UILongPressGestureRecognizer()
        glassView.addGestureRecognizer(glassInteraction)

        #expect(interaction.gestureRecognizer(
            selectionTap,
            shouldRecognizeSimultaneouslyWith: glassInteraction
        ))
    }

    @Test
    func `highlight clips the selected accessory`() throws {
        let model = makeModel()
        let control = WSegmentedControl(model: model)
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        control.layoutIfNeeded()

        let highlight = try #require(control.contextMenuActivationView(forItemId: "first"))

        #expect(highlight.clipsToBounds)
        #expect(containsImageView(in: highlight))
    }

    @Test
    func `selected foreground has no secondary text overlay`() throws {
        let model = makeModel()
        let control = WSegmentedControl(model: model)
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        control.layoutIfNeeded()

        let highlight = try #require(control.contextMenuActivationView(forItemId: "first"))

        #expect(labels(in: highlight).count == model.items.count)
    }

    @Test
    func `selected tint resolves outside interactive glass`() throws {
        let accentColor = UIColor(red: 1, green: 0.17, blue: 0.33, alpha: 1)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 80))
        window.tintColor = accentColor

        let model = makeModel(primaryColor: .tintColor)
        let control = WSegmentedControl(model: model, isGlassInteractive: true)
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        window.addSubview(control)
        control.layoutIfNeeded()

        let highlight = try #require(control.contextMenuActivationView(forItemId: "first"))

        #expect(labels(in: highlight).allSatisfy { $0.textColor.isEqual(accentColor) })
    }

    @Test
    func `selected dynamic color follows local appearance override`() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 80))
        window.overrideUserInterfaceStyle = .light

        let model = makeModel(primaryColor: .label)
        let control = WSegmentedControl(model: model)
        control.overrideUserInterfaceStyle = .dark
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        window.addSubview(control)
        control.layoutIfNeeded()

        let highlight = try #require(control.contextMenuActivationView(forItemId: "first"))
        let expectedColor = UIColor.label.resolvedColor(with: control.traitCollection)

        #expect(labels(in: highlight).allSatisfy { $0.textColor.isEqual(expectedColor) })
    }

    @Test
    func `context menu press animation keeps the cutout frame stable`() throws {
        let model = makeModel()
        let control = WSegmentedControl(model: model)
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        control.layoutIfNeeded()

        for itemID in ["first", "second"] {
            let activationView = try #require(control.contextMenuActivationView(forItemId: itemID))
            let frameBeforePress = activationView.convert(activationView.bounds, to: control)

            activationView.layer.sublayerTransform = CATransform3DMakeScale(0.8, 0.8, 1)
            let frameDuringPress = activationView.convert(activationView.bounds, to: control)
            activationView.layer.sublayerTransform = CATransform3DIdentity

            #expect(frameDuringPress == frameBeforePress)
            #expect(!activationView.subviews.isEmpty)
        }
    }

    @Test
    func `selected press animation scales content inside fixed capsule`() throws {
        let model = makeModel()
        let control = WSegmentedControl(model: model)
        control.frame = CGRect(origin: .zero, size: control.intrinsicContentSize)
        control.layoutIfNeeded()

        let contentView = try #require(control.contextMenuActivationView(forItemId: "first"))
        let capsuleView = try #require(contentView.superview)
        let backgroundView = try #require(capsuleView.subviews.first)

        #expect(capsuleView.clipsToBounds)
        #expect(contentView.frame == capsuleView.bounds)
        #expect(backgroundView !== contentView)
        #expect(backgroundView.frame == capsuleView.bounds)

        contentView.layer.sublayerTransform = CATransform3DMakeScale(0.8, 0.8, 1)

        #expect(CATransform3DIsIdentity(backgroundView.layer.sublayerTransform))
    }

    @Test
    func `hiding pager tabs removes the reserved bar height`() {
        let content = SegmentContentViewController()
        let pager = WSegmentedPagerView(
            items: [
                WSegmentedPagerItem(id: "only", title: "Only", viewController: content),
            ],
            contentTopInsetWhenSegmentedControlHidden: 4
        )
        pager.frame = CGRect(x: 0, y: 0, width: 320, height: 200)
        pager.layoutIfNeeded()

        #expect(pager.pagingGestureView.frame.minY == 44)
        #expect(pager.contentTopInset == 44)

        pager.isSegmentedControlHidden = true
        pager.layoutIfNeeded()

        #expect(pager.segmentedControl.isHidden)
        #expect(pager.pagingGestureView.frame.minY == 4)
        #expect(pager.contentTopInset == 4)
    }

    private func makeModel(primaryColor: UIColor = .label) -> SegmentedControlModel {
        let provider = SegmentedControlContextMenuProvider {
            ContextMenuConfiguration(rootPage: ContextMenuPage(items: []))
        }
        let items = ["first", "second", "third"].map { id in
            SegmentedControlItem(
                id: id,
                title: id.capitalized,
                contextMenuProvider: provider,
                viewController: SegmentContentViewController()
            )
        }
        return SegmentedControlModel(
            items: items,
            selection: .init(item1: "first"),
            primaryColor: primaryColor,
            style: .regular
        )
    }

    private func containsImageView(in view: UIView) -> Bool {
        view is UIImageView || view.subviews.contains { containsImageView(in: $0) }
    }

    private func labels(in view: UIView) -> [UILabel] {
        (view as? UILabel).map { [$0] } ?? view.subviews.flatMap(labels(in:))
    }
}

@MainActor
private final class SegmentContentViewController: UIViewController, WSegmentedControllerContent {
    var onScroll: ((CGFloat) -> Void)?
    var scrollingView: UIScrollView? { nil }

    func scrollToTop(animated: Bool) {}
    func calculateHeight(isHosted: Bool) -> CGFloat { 0 }
}
