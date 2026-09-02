import Testing
import UniversalSearchCore

@Suite("Universal Search matching")
struct UniversalSearchMatcherTests {
    private let matcher = UniversalSearchMatcher()

    @Test
    func `matches when at least one query term is present`() throws {
        let document = makeDocument(
            id: "token:gram",
            kind: .token,
            fields: [.init("Gram", kind: .title)]
        )

        let match = try #require(matcher.match(document, query: .init("курс грам")))

        #expect(match.kind == .exactWord)
        #expect(match.matchedTermCount == 1)
        #expect(match.totalTermCount == 2)
    }

    @Test
    func `matches across transliteration without weakening match quality`() throws {
        let document = makeDocument(
            id: "token:gram",
            kind: .token,
            fields: [.init("Gram", kind: .title)]
        )

        let match = try #require(matcher.match(document, query: .init("Грам")))

        #expect(match.kind == .exactPhrase)
        #expect(match.usedTransliteration)
    }

    @Test
    func `exact-only documents reject partial identifiers`() {
        let document = makeDocument(
            id: "wallet:external:alice.ton",
            kind: .wallet,
            fields: [.init("alice.ton", kind: .domain, matchPolicy: .exact)],
            matchRequirement: .exactIdentifier
        )

        #expect(matcher.match(document, query: .init("alice")) == nil)
        #expect(matcher.match(document, query: .init("ALICE.TON"))?.kind == .exactIdentifier)
    }

    @Test
    func `uses bounded fuzzy matching only for longer terms`() {
        let document = makeDocument(
            id: "app:wallet",
            kind: .application,
            fields: [.init("Wallet", kind: .title)]
        )

        #expect(matcher.match(document, query: .init("walet"))?.kind == .fuzzy)
        #expect(matcher.match(document, query: .init("wlt")) == nil)
    }

    @Test
    func `long identifier input only matches an exact identifier field`() {
        let address = "0:f4e4a090dbf4b4e9de7a8c8aaedef1ac89ed6f1e3d4cebd5c05a6af799c5c8c4"
        let unrelated = makeDocument(
            id: "token:unrelated",
            kind: .token,
            fields: [.init("0 Token", kind: .title)]
        )
        let exact = makeDocument(
            id: "token:exact",
            kind: .token,
            fields: [.init(address, kind: .address, matchPolicy: .exact)]
        )

        #expect(matcher.match(unrelated, query: .init(address)) == nil)
        #expect(matcher.match(exact, query: .init(address))?.kind == .exactIdentifier)
    }
}

private func makeDocument(
    id: String,
    kind: SearchEntityKind,
    fields: [SearchField],
    matchRequirement: SearchDocumentMatchRequirement = .anyTerm,
    signals: SearchSignals = .init()
) -> SearchDocument {
    SearchDocument(
        id: SearchEntityID(id),
        kind: kind,
        fields: fields,
        matchRequirement: matchRequirement,
        signals: signals
    )
}
