import Testing
import UniversalSearchCore

@Suite("Universal Search text normalization")
struct SearchTextNormalizerTests {
    @Test
    func `normalizes case width diacritics and punctuation`() {
        let text = SearchTextNormalizer.normalize("  HéLLo—ＷＯＲＬＤ  ")

        #expect(text.canonical == "hello world")
        #expect(text.terms.map(\.alternatives.first) == ["hello", "world"])
    }

    @Test
    func `creates a latin alternative for cyrillic text`() {
        let text = SearchTextNormalizer.normalize("Грам")

        #expect(text.canonical == "грам")
        #expect(text.transliterated == "gram")
        #expect(text.terms.first?.alternatives.contains("gram") == true)
    }

    @Test
    func `preserves punctuation in identifiers`() {
        #expect(SearchTextNormalizer.normalizeIdentifier(" Alice.TON ") == "alice.ton")
    }
}
