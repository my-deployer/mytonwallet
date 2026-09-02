import UIKit
import XCTest
@testable import UIAgent

final class AgentStreamingTextViewTests: XCTestCase {
    @MainActor
    func testStreamingRevealMaskUsesUnionFillRule() throws {
        let view = AgentStreamingTextView(frame: CGRect(x: 0, y: 0, width: 120, height: 200))
        view.configure(
            text: "office",
            textColor: .label,
            isStreaming: true,
            hadStreaming: false,
            rendersMarkdown: false,
            allowsLinks: false,
            layoutMaxWidth: 120,
            streamingIdentity: "fill-rule-test"
        )
        defer { view.prepareForReuse() }

        let renderContainer = try XCTUnwrap(view.subviews.first)
        let revealMaskLayer = try XCTUnwrap(renderContainer.layer.mask as? CAShapeLayer)

        XCTAssertEqual(revealMaskLayer.fillRule, .nonZero)
    }

    func testLegacyRevealControllerKeepsExistingMaximumLiveLag() {
        let textLength = 4_096
        let controller = AgentTextRevealController(initialRevealedCount: 0, initialLength: 0)

        controller.observeUpdate(latestLength: textLength, at: 0)

        XCTAssertEqual(controller.currentGlyphCount, textLength - 32)
    }
}
