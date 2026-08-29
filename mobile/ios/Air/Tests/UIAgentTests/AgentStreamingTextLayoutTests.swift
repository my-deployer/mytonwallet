import UIKit
import XCTest
@testable import UIAgent

final class AgentStreamingTextLayoutTests: XCTestCase {
    @MainActor
    func testRightToLeftLayoutNormalizesCharacterGeometry() {
        let layout = makeLayout(
            "Что именно ты хочешь сделать? Вот что я могу помочь открыть прямо в приложении",
            writingDirection: .rightToLeft
        )

        XCTAssertNotNil(layout.renderedImage)
        XCTAssertLessThan(layout.fullSize.width, 300)
        assertGeometryFitsRenderedImage(layout)
    }

    @MainActor
    func testArabicLayoutProducesCharacterGeometryDuringReveal() {
        let layout = makeLayout("مرحبا بالعالم", writingDirection: .rightToLeft)
        let visibleCharacterRects = layout.lines
            .flatMap(\.characterRects)
            .filter { !$0.isEmpty }

        XCTAssertGreaterThan(visibleCharacterRects.count, 5)
        XCTAssertGreaterThan(layout.size(forCharacterCount: 1).width, 1)
        assertGeometryFitsRenderedImage(layout)
    }

    @MainActor
    func testRightToLeftLinkRegionsUseRenderedImageCoordinates() throws {
        let url = try XCTUnwrap(URL(string: "https://mytonwallet.io"))
        let layout = makeLayout(
            "افتح MyTonWallet",
            writingDirection: .rightToLeft,
            additionalAttributes: [.link: url]
        )
        let linkRegion = try XCTUnwrap(layout.linkRegions.first)

        XCTAssertGreaterThanOrEqual(linkRegion.rect.minX, -0.5)
        XCTAssertLessThanOrEqual(linkRegion.rect.maxX, layout.fullSize.width + 0.5)
        XCTAssertEqual(
            layout.link(at: CGPoint(x: linkRegion.rect.midX, y: linkRegion.rect.midY)),
            url
        )
    }

    @MainActor
    private func makeLayout(
        _ text: String,
        writingDirection: NSWritingDirection,
        additionalAttributes: [NSAttributedString.Key: Any] = [:]
    ) -> AgentStreamingTextLayout {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .natural
        paragraphStyle.baseWritingDirection = writingDirection
        paragraphStyle.lineBreakMode = .byWordWrapping

        var attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 17),
            .paragraphStyle: paragraphStyle,
        ]
        attributes.merge(additionalAttributes) { _, new in new }

        return AgentStreamingTextLayout.make(
            attributedString: NSAttributedString(string: text, attributes: attributes),
            maxWidth: 300
        )
    }

    @MainActor
    private func assertGeometryFitsRenderedImage(
        _ layout: AgentStreamingTextLayout,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let fullSize = layout.fullSize
        let visibleCharacterRects = layout.lines
            .flatMap(\.characterRects)
            .filter { !$0.isEmpty }
        XCTAssertFalse(visibleCharacterRects.isEmpty, file: file, line: line)

        for rect in visibleCharacterRects {
            XCTAssertGreaterThanOrEqual(rect.minX, -0.5, file: file, line: line)
            XCTAssertGreaterThanOrEqual(rect.minY, -0.5, file: file, line: line)
            XCTAssertLessThanOrEqual(rect.maxX, fullSize.width + 0.5, file: file, line: line)
            XCTAssertLessThanOrEqual(rect.maxY, fullSize.height + 0.5, file: file, line: line)
        }
    }
}
