import Foundation
import Testing
import WalletContext

@Suite("Math utilities")
struct MathUtilsTests {
    @Test
    func `clamp supports comparable numeric types`() {
        #expect(clamp(5, to: 0...3) == 3)

        let negative: Double = -1
        #expect(clamp(negative, min: 0, max: 1) == 0)

        let value: CGFloat = 0.5
        #expect(clamp(value, to: 0...1) == value)
    }
}
