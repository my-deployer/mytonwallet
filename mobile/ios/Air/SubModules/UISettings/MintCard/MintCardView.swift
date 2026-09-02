import AVFoundation
import Kingfisher
import Perception
import SwiftUI
import UIComponents
import WalletContext
import WalletCore

struct MintCardView: View {
    let accountContext: AccountContext
    let onUpgrade: (ApiMtwCardType) -> Void

    @State private var selectedType: ApiMtwCardType = .standard
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        WithPerceptionTracking {
            let cardInfo = accountContext.config.cardsInfo?[selectedType]
            let mycoin = TokenStore.getToken(slug: MYCOIN_SLUG)
            ZStack {
                surfaceColor
                    .ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        cardPager
                        benefits
                            .padding(.horizontal, 24)
                            .padding(.top, 20)
                            .padding(.bottom, 104)
                    }
                }
                .backportScrollEdgeEffectHidden()
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if let price = cardInfo?.price, price > 0 {
                        upgradeButton(
                            price: price,
                            symbol: mycoin?.symbol ?? "MY",
                            isEnabled: cardInfo?.notMinted ?? 0 > 0 && mycoin != nil
                        )
                    }
                }
            }
            .animation(.easeInOut(duration: 0.2), value: selectedType)
        }
    }

    private var cardPager: some View {
        GeometryReader { geometry in
            TabView(selection: $selectedType) {
                ForEach(MintCardTypeInfo.ordered) { info in
                    MintCardSlide(
                        info: info,
                        isActive: selectedType == info.type,
                        playsVideo: AppStorageHelper.animations && !accessibilityReduceMotion
                    )
                    .frame(width: geometry.size.width, height: geometry.size.width)
                    .tag(info.type)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(width: geometry.size.width, height: geometry.size.width)
            .overlay {
                pagerControls
            }
            .overlay(alignment: .bottom) {
                MintCardPageDots(selectedType: selectedType)
                    .padding(.bottom, 92)
            }
            .overlay(alignment: .bottom) {
                selectedCardDetails
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .contain)
    }

    private var pagerControls: some View {
        HStack {
            pagerButton(systemName: "chevron.left", direction: -1)
            Spacer()
            pagerButton(systemName: "chevron.right", direction: 1)
        }
        .padding(.horizontal, 8)
        .padding(.top, 48)
        .allowsHitTesting(true)
    }

    @ViewBuilder
    private var selectedCardDetails: some View {
        if let info = MintCardTypeInfo.ordered.first(where: { $0.type == selectedType }) {
            VStack(spacing: 10) {
                Text(lang(info.displayNameKey))
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)

                MintCardAvailability(cardInfo: accountContext.config.cardsInfo?[selectedType])
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 16)
        }
    }

    private func pagerButton(systemName: String, direction: Int) -> some View {
        Button {
            let types = MintCardTypeInfo.ordered.map(\.type)
            guard let index = types.firstIndex(of: selectedType) else { return }
            let nextIndex = (index + direction + types.count) % types.count
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedType = types[nextIndex]
            }
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 44, height: 72)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(direction < 0 ? lang("Previous") : lang("Next"))
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 16) {
            MintCardBenefit(
                systemName: "diamond.fill",
                title: lang("Unique"),
                description: lang("Get a card with unique background and personalized palette for wallet interface."),
                accentColor: accentColor,
                usesDarkSurface: selectedType == .black
            )
            MintCardBenefit(
                systemName: "arrow.left.arrow.right",
                title: lang("Transferable"),
                description: lang("Easily send your upgraded card to any of your friends."),
                accentColor: accentColor,
                usesDarkSurface: selectedType == .black
            )
            MintCardBenefit(
                systemName: "hammer.fill",
                title: lang("Tradable"),
                description: lang("Sell or auction your card on third-party NFT marketplaces."),
                accentColor: accentColor,
                usesDarkSurface: selectedType == .black
            )
        }
    }

    private func upgradeButton(price: Double, symbol: String, isEnabled: Bool) -> some View {
        Button {
            onUpgrade(selectedType)
        } label: {
            Text(L10n.upgradeForAmountCurrency(amount: formatMintCardPrice(price), currency: symbol))
            .textStyle(.bodyEmphasized)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .foregroundStyle(selectedType == .black ? .black : .white)
            .background(accentColor, in: .capsule)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.5)
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .background(surfaceColor.opacity(0.96).ignoresSafeArea())
    }

    private var accentColor: Color {
        switch selectedType {
        case .standard:
            .accentColor
        case .silver:
            Color(red: 0.57, green: 0.58, blue: 0.59)
        case .gold:
            Color(red: 0.87, green: 0.61, blue: 0.14)
        case .platinum:
            colorScheme == .dark
                ? Color(red: 0.84, green: 0.87, blue: 0.91)
                : Color(red: 0.16, green: 0.17, blue: 0.22)
        case .black:
            .white
        }
    }

    private var surfaceColor: Color {
        selectedType == .black ? .black : Color.air.sheetBackground
    }
}

private struct MintCardSlide: View {
    let info: MintCardTypeInfo
    let isActive: Bool
    let playsVideo: Bool

    var body: some View {
        ZStack {
            info.posterBackground

            if let posterURL = info.posterURL {
                KFImage(posterURL)
                    .placeholder { info.posterBackground }
                    .fade(duration: 0.15)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            }

            if playsVideo, let videoURL = info.videoURL {
                MintCardLoopingVideo(url: videoURL, isPlaying: isActive)
            }

            Color.black.opacity(0.18)

        }
        .clipped()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(lang(info.displayNameKey))
    }
}

private struct MintCardPageDots: View {
    let selectedType: ApiMtwCardType

    var body: some View {
        HStack(spacing: 8) {
            ForEach(MintCardTypeInfo.ordered) { info in
                Circle()
                    .fill(.white.opacity(info.type == selectedType ? 1 : 0.28))
                    .frame(width: 8, height: 8)
                    .overlay {
                        if info.type == selectedType {
                            Circle().stroke(.white, lineWidth: 1)
                                .padding(-1)
                        }
                    }
            }
        }
        .accessibilityHidden(true)
    }
}

private struct MintCardAvailability: View {
    let cardInfo: ApiCardInfo?

    var body: some View {
        let all = cardInfo?.all ?? 0
        let notMinted = cardInfo?.notMinted ?? 0
        if all > 0 {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.ultraThinMaterial.opacity(0.6))
                    Capsule()
                        .fill(.white.opacity(0.18))
                        .frame(width: max(30, geometry.size.width * CGFloat(notMinted) / CGFloat(all)))
                    HStack {
                        Text(L10n.amountLeft(amount: localizedIntegerString(notMinted)))
                        Spacer()
                        Text(L10n.amountSold(amount: localizedIntegerString(all - notMinted)))
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                }
            }
            .frame(height: 30)
        } else {
            Text(lang("This card has been sold out"))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 30)
                .background(.ultraThinMaterial.opacity(0.6), in: .capsule)
        }
    }
}

private struct MintCardBenefit: View {
    let systemName: String
    let title: String
    let description: String
    let accentColor: Color
    let usesDarkSurface: Bool

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: systemName)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(accentColor)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .textStyle(.bodyEmphasized)
                    .foregroundStyle(usesDarkSurface ? .white : Color.air.primaryLabel)
                Text(description)
                    .textStyle(.callout)
                    .foregroundStyle(usesDarkSurface ? Color(red: 0.52, green: 0.57, blue: 0.65) : Color.air.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct MintCardTypeInfo: Identifiable, Sendable {
    let type: ApiMtwCardType
    let displayNameKey: String

    var id: ApiMtwCardType { type }

    static let ordered: [Self] = [
        .init(type: .standard, displayNameKey: "Standard Card"),
        .init(type: .silver, displayNameKey: "Silver Card"),
        .init(type: .gold, displayNameKey: "Gold Card"),
        .init(type: .platinum, displayNameKey: "Platinum Card"),
        .init(type: .black, displayNameKey: "Black Card"),
    ]

    var videoURL: URL? {
        URL(string: "\(MTW_CARDS_MINT_BASE_URL)mtw_card_\(type.rawValue).h264.mp4")
    }

    var posterURL: URL? {
        URL(string: "\(MTW_CARDS_MINT_BASE_URL)mtw_card_\(type.rawValue).avif")
    }

    var posterBackground: Color {
        switch type {
        case .standard:
            Color(red: 0.11, green: 0.13, blue: 0.20)
        case .black:
            Color(red: 0.01, green: 0.01, blue: 0.01)
        default:
            Color(red: 0.09, green: 0.09, blue: 0.09)
        }
    }
}

private struct MintCardLoopingVideo: UIViewRepresentable {
    let url: URL
    let isPlaying: Bool

    func makeUIView(context: Context) -> MintCardPlayerView {
        let view = MintCardPlayerView()
        view.configure(url: url, isPlaying: isPlaying)
        return view
    }

    func updateUIView(_ uiView: MintCardPlayerView, context: Context) {
        uiView.configure(url: url, isPlaying: isPlaying)
    }

    static func dismantleUIView(_ uiView: MintCardPlayerView, coordinator: ()) {
        uiView.stop()
    }
}

@MainActor
private final class MintCardPlayerView: UIView {
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var currentURL: URL?

    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    private var playerLayer: AVPlayerLayer {
        layer as! AVPlayerLayer
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        player.isMuted = true
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspectFill
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(url: URL, isPlaying: Bool) {
        if currentURL != url {
            player.pause()
            player.removeAllItems()
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            currentURL = url
        }
        if isPlaying {
            player.play()
        } else {
            player.pause()
        }
    }

    func stop() {
        player.pause()
        looper = nil
        player.removeAllItems()
        currentURL = nil
    }
}

private func formatMintCardPrice(_ price: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = .current
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = 2
    return formatter.string(from: NSNumber(value: price)) ?? String(price)
}

#if DEBUG
@available(iOS 18, *)
#Preview("Mint Cards") {
    MintCardView(
        accountContext: AccountContext(source: .current),
        onUpgrade: { _ in }
    )
}
#endif
