import Foundation
import Testing
@testable import UIToken
import WalletContext
import WalletCore

@MainActor
@Suite("Token Info State")
struct TokenInfoStateTests {
    @Test
    func `missing description keeps available details expandable`() {
        let details = makeDetails(marketCap: 7_580_000_000)

        let state = TokenInfoState.resolved(details: details)

        #expect(state.details == details)
        #expect(state.canExpand)
        #expect(state.description == lang("$token_info_no_description"))
    }

    @Test
    func `links count as expandable public information`() throws {
        let details = try JSONDecoder().decode(
            ApiTokenDetails.self,
            from: Data(#"{"links":[{"url":"https://example.com"}]}"#.utf8)
        )

        let state = TokenInfoState.resolved(details: details)

        #expect(state.details == details)
        #expect(state.canExpand)
        #expect(state.description == lang("$token_info_no_description"))
    }

    @Test
    func `empty details use no public information fallback`() {
        let state = TokenInfoState.resolved(details: makeDetails())

        #expect(state == .fallback(lang("$token_info_fallback_description")))
        #expect(!state.canExpand)
    }

    @Test
    func `preferred expansion waits for coordinated loading transition`() {
        let model = TokenInfoModel(state: .loading, isExpanded: true)

        #expect(!model.isExpanded)
        #expect(model.presentationOverlay == nil)
        #expect(model.contentOpacity == 0)

        model.configure(state: .details(makeDetails(marketCap: 7_580_000_000)))

        #expect(model.isExpanded)
        #expect(model.expansionProgress == 0)
        #expect(model.presentationOverlay == .skeleton)
        #expect(model.pendingPresentationRevision == model.layoutRevision)

        model.setExpansionProgress(model.targetExpansionProgress)
        model.beginPresentationTransition(revision: model.layoutRevision, animated: false)

        #expect(model.expansionProgress == 1)
        #expect(model.presentationOverlay == nil)
        #expect(model.contentOpacity == 1)
    }

    @Test
    func `preferred collapse is preserved for cached and freshly loaded details`() {
        let details = makeDetails(marketCap: 7_580_000_000)
        let cachedModel = TokenInfoModel(state: .details(details), isExpanded: false)
        let loadingModel = TokenInfoModel(state: .loading, isExpanded: false)

        loadingModel.configure(state: .details(details))

        #expect(!cachedModel.isExpanded)
        #expect(cachedModel.expansionProgress == 0)
        #expect(!loadingModel.isExpanded)
        #expect(loadingModel.expansionProgress == 0)
        #expect(loadingModel.presentationOverlay == .skeleton)
    }

    @Test
    func `loading geometry does not replace the expanded content height`() {
        let model = TokenInfoModel(state: .loading, isExpanded: true)

        #expect(!model.updateMeasuredExpandedHeight(TokenInfoModel.collapsedHeight))
        #expect(model.measuredExpandedHeight == TokenInfoModel.initialExpandedHeight)

        model.configure(state: .details(makeDetails(marketCap: 7_580_000_000)))

        #expect(model.isExpanded)
        #expect(model.expansionProgress == 0)
        #expect(model.measuredExpandedHeight == TokenInfoModel.initialExpandedHeight)
        #expect(model.updateMeasuredExpandedHeight(320))
        #expect(model.measuredExpandedHeight == 320)
    }

    @Test
    func `cached refresh keeps old content until replacement is ready`() {
        let cachedDetails = makeDetails(marketCap: 7_580_000_000)
        let freshDetails = makeDetails(marketCap: 8_120_000_000)
        let model = TokenInfoModel(state: .details(cachedDetails), isExpanded: true)

        #expect(model.isExpanded)
        #expect(model.expansionProgress == 1)
        #expect(model.presentationOverlay == nil)
        #expect(model.contentOpacity == 1)

        model.configure(state: .details(freshDetails))

        #expect(model.state == .details(freshDetails))
        #expect(model.isExpanded)
        #expect(model.expansionProgress == 1)
        #expect(model.contentOpacity == 0)
        #expect(model.presentationOverlay == .content(TokenInfoPresentationSnapshot(
            state: .details(cachedDetails),
            showsOriginalDescription: false,
            expansionProgress: 1,
            expandedHeight: TokenInfoModel.initialExpandedHeight
        )))

        model.beginPresentationTransition(revision: model.layoutRevision, animated: false)

        #expect(model.presentationOverlay == nil)
        #expect(model.contentOpacity == 1)
    }

    private func makeDetails(
        marketCap: Double? = nil
    ) -> ApiTokenDetails {
        ApiTokenDetails(
            description: nil,
            links: nil,
            marketCap: marketCap,
            circulatingSupply: nil,
            totalSupply: nil,
            createdAt: nil,
            volume24h: nil
        )
    }
}
