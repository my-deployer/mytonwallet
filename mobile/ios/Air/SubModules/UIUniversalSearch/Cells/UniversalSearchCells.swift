import UIComponents
import UIKit
import WalletContext

@MainActor
private enum UniversalSearchAgentAppearance {
    static let borderColor = UIColor(hex: "#0088FF")

    static func titleGradientColors(
        for traitCollection: UITraitCollection,
        tintColor: UIColor
    ) -> [CGColor] {
        let colors: [UIColor]
        if traitCollection.userInterfaceStyle == .dark {
            colors = [
                tintColor,
                UIColor(hex: "#00BEFF"),
                UIColor(hex: "#BF5AF2"),
            ]
        } else {
            colors = [
                UIColor(hex: "#005DAF"),
                UIColor(hex: "#007BA5"),
                UIColor(hex: "#4F4AB2"),
            ]
        }
        return colors.map { $0.resolvedColor(with: traitCollection).cgColor }
    }

    static func backgroundBaseColor(for traitCollection: UITraitCollection) -> CGColor {
        let color = if traitCollection.userInterfaceStyle == .dark {
            UIColor(hex: "#232732").withAlphaComponent(0.56)
        } else {
            UIColor(hex: "#E9E9EA").withAlphaComponent(0.16)
        }
        return color.cgColor
    }

    static func backgroundGradientColors(for traitCollection: UITraitCollection) -> [CGColor] {
        let colors: [UIColor]
        if traitCollection.userInterfaceStyle == .dark {
            colors = [
                UIColor(hex: "#0088FF").withAlphaComponent(0.22),
                UIColor(hex: "#00BEFF").withAlphaComponent(0.28),
                UIColor(hex: "#B656FF").withAlphaComponent(0.22),
            ]
        } else {
            colors = [
                UIColor(hex: "#0088FF").withAlphaComponent(0.048),
                UIColor(hex: "#00BEFF").withAlphaComponent(0.12),
                UIColor(hex: "#B656FF").withAlphaComponent(0.048),
            ]
        }
        return colors.map(\.cgColor)
    }

    static func sheenGradientColors(for traitCollection: UITraitCollection) -> [CGColor] {
        let topAlpha: CGFloat = traitCollection.userInterfaceStyle == .dark ? 0.1 : 0.6
        return [
            UIColor.white.withAlphaComponent(topAlpha).cgColor,
            UIColor.white.withAlphaComponent(0).cgColor,
        ]
    }
}

@MainActor
class UniversalSearchBaseCell: WHighlightCollectionViewCell {
    let highlightView = WHighlightStackView()

    var usesDefaultSelectedAppearance: Bool { true }
    var isPresentedAsSelected: Bool { isSelected || isPersistentlySelected }
    var isPersistentlySelected = false {
        didSet {
            guard isPersistentlySelected != oldValue else { return }
            refreshSelectionAppearance()
        }
    }

    override var isHighlighted: Bool {
        didSet {
            refreshSelectionAppearance()
        }
    }

    override var isSelected: Bool {
        didSet {
            refreshSelectionAppearance()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
        backgroundColor = .clear
        baseBackgroundColor = .clear
        highlightBackgroundColor = .clear
        contentView.backgroundColor = .clear
        contentView.clipsToBounds = false
        isAccessibilityElement = true

        highlightView.translatesAutoresizingMaskIntoConstraints = false
        highlightView.isUserInteractionEnabled = false
        highlightView.backgroundColor = .clear
        highlightView.highlightBackgroundColor = .air.universalSearchHighlight
        highlightView.highlightingTime = 0.1
        highlightView.unhighlightingTime = 0.5
        highlightView.layer.cornerRadius = 22
        highlightView.layer.cornerCurve = .continuous
        insertSubview(highlightView, at: 0)

        NSLayoutConstraint.activate([
            highlightView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: -16),
            highlightView.topAnchor.constraint(equalTo: topAnchor),
            highlightView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: 16),
            highlightView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        isPersistentlySelected = false
    }

    func selectionAppearanceDidChange() {}

    func refreshSelectionAppearance() {
        let showsDefaultSelectedAppearance = isPresentedAsSelected && usesDefaultSelectedAppearance
        highlightView.isHighlighted = isHighlighted || showsDefaultSelectedAppearance
        if isPresentedAsSelected {
            accessibilityTraits.insert(.selected)
        } else {
            accessibilityTraits.remove(.selected)
        }
        selectionAppearanceDidChange()
    }
}

@MainActor
final class UniversalSearchTextResultCell: UniversalSearchBaseCell {
    enum TitleStyle {
        case regular
        case emphasized
    }

    private let iconView = IconView(size: 24, accessoryGeometry: .forIcon24)
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.applyTextStyle(.caption)
        subtitleLabel.textColor = .air.secondaryLabel
        subtitleLabel.lineBreakMode = .byTruncatingTail
        subtitleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        contentView.addSubview(iconView)
        contentView.addSubview(titleLabel)
        contentView.addSubview(subtitleLabel)
        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            iconView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            titleLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 9),
            titleLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            subtitleLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            subtitleLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 32),
            subtitleLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(
        icon: UniversalSearchIcon,
        title: String,
        subtitle: String,
        titleStyle: TitleStyle = .emphasized
    ) {
        icon.configure(iconView)
        titleLabel.applyTextStyle(titleStyle == .emphasized ? .bodyEmphasized : .body)
        titleLabel.textColor = .label
        titleLabel.text = title
        subtitleLabel.text = subtitle
        accessibilityLabel = subtitle.isEmpty ? title : "\(title), \(subtitle)"
        accessibilityTraits = .button
        refreshSelectionAppearance()
    }
}

@MainActor
final class UniversalSearchTokenCell: UniversalSearchBaseCell {
    private let iconView = IconView(size: 24, accessoryGeometry: .forIcon24)
    private let titleLabel = UILabel()
    private let badgeView = BadgeView()
    private let priceLabel = UILabel()
    private let amountLabel = UILabel()
    private let balanceValueLabel = UILabel()
    private let titleRow = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)

        titleLabel.applyTextStyle(.bodyEmphasized)
        titleLabel.textColor = .label
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        badgeView.configureHidden()
        badgeView.setContentCompressionResistancePriority(.required, for: .horizontal)

        titleRow.translatesAutoresizingMaskIntoConstraints = false
        titleRow.axis = .horizontal
        titleRow.alignment = .center
        titleRow.spacing = 4
        titleRow.addArrangedSubview(titleLabel)
        titleRow.addArrangedSubview(badgeView)
        titleRow.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        priceLabel.translatesAutoresizingMaskIntoConstraints = false
        priceLabel.applyTextStyle(.caption, content: .technical)
        priceLabel.textColor = .air.secondaryLabel
        priceLabel.lineBreakMode = .byTruncatingMiddle
        priceLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        amountLabel.translatesAutoresizingMaskIntoConstraints = false
        amountLabel.applyTextStyle(.body, content: .technical)
        amountLabel.textColor = .label
        amountLabel.textAlignment = .right
        amountLabel.lineBreakMode = .byTruncatingMiddle
        amountLabel.setContentCompressionResistancePriority(.defaultHigh, for: .horizontal)
        balanceValueLabel.translatesAutoresizingMaskIntoConstraints = false
        balanceValueLabel.applyTextStyle(.caption, content: .technical)
        balanceValueLabel.textColor = .air.secondaryLabel
        balanceValueLabel.textAlignment = .right
        balanceValueLabel.lineBreakMode = .byTruncatingMiddle
        balanceValueLabel.setContentCompressionResistancePriority(.defaultHigh, for: .horizontal)

        contentView.addSubview(iconView)
        contentView.addSubview(titleRow)
        contentView.addSubview(priceLabel)
        contentView.addSubview(amountLabel)
        contentView.addSubview(balanceValueLabel)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            iconView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            titleRow.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            titleRow.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 9),
            titleRow.trailingAnchor.constraint(lessThanOrEqualTo: amountLabel.leadingAnchor, constant: -8),
            priceLabel.leadingAnchor.constraint(equalTo: titleRow.leadingAnchor),
            priceLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 32),
            priceLabel.trailingAnchor.constraint(lessThanOrEqualTo: balanceValueLabel.leadingAnchor, constant: -8),
            amountLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 9),
            amountLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            amountLabel.leadingAnchor.constraint(greaterThanOrEqualTo: titleRow.leadingAnchor),
            balanceValueLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 32),
            balanceValueLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            balanceValueLabel.leadingAnchor.constraint(greaterThanOrEqualTo: priceLabel.leadingAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(_ result: UniversalSearchTokenResult) {
        result.icon.configure(iconView)
        titleLabel.text = result.title
        priceLabel.text = result.price
        amountLabel.text = result.amount
        balanceValueLabel.text = result.balanceValue
        amountLabel.isHidden = result.amount == nil
        balanceValueLabel.isHidden = result.balanceValue == nil
        if let badge = result.badge {
            badgeView.configureTokenLabel(text: badge, style: .stock)
        } else {
            badgeView.configureHidden()
        }

        let values = [result.title, result.price, result.amount, result.balanceValue]
            .compactMap { $0 }
            .joined(separator: ", ")
        accessibilityLabel = values
        accessibilityTraits = .button
        refreshSelectionAppearance()
    }
}

@MainActor
final class UniversalSearchAppCell: UniversalSearchBaseCell {
    private let iconView = IconView(size: 24, accessoryGeometry: .forIcon24)
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let telegramImageView = UIImageView()
    private let actionButton = UIButton(type: .system)
    private let titleRow = UIStackView()
    private var onOpen: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)

        titleLabel.applyTextStyle(.bodyEmphasized)
        titleLabel.textColor = .label
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        telegramImageView.image = UIImage.airBundle("TelegramLogo20")
        telegramImageView.contentMode = .scaleAspectFit
        telegramImageView.tintColor = UIColor.air.secondaryLabel.withAlphaComponent(0.5)
        telegramImageView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            telegramImageView.widthAnchor.constraint(equalToConstant: 18),
            telegramImageView.heightAnchor.constraint(equalToConstant: 18),
        ])

        titleRow.translatesAutoresizingMaskIntoConstraints = false
        titleRow.axis = .horizontal
        titleRow.alignment = .center
        titleRow.spacing = 4
        titleRow.addArrangedSubview(titleLabel)
        titleRow.addArrangedSubview(telegramImageView)
        titleRow.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.applyTextStyle(.caption)
        subtitleLabel.textColor = .air.secondaryLabel
        subtitleLabel.lineBreakMode = .byTruncatingTail
        subtitleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        var buttonConfiguration = UIButton.Configuration.filled()
        buttonConfiguration.cornerStyle = .capsule
        buttonConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
        buttonConfiguration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = WTypography.uiFont(.supportingBold)
            return outgoing
        }
        actionButton.configuration = buttonConfiguration
        actionButton.translatesAutoresizingMaskIntoConstraints = false
        actionButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        actionButton.setContentHuggingPriority(.required, for: .horizontal)
        actionButton.addTarget(self, action: #selector(openTapped), for: .touchUpInside)

        contentView.addSubview(iconView)
        contentView.addSubview(titleRow)
        contentView.addSubview(subtitleLabel)
        contentView.addSubview(actionButton)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            iconView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            titleRow.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            titleRow.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 9),
            titleRow.trailingAnchor.constraint(lessThanOrEqualTo: actionButton.leadingAnchor, constant: -8),
            subtitleLabel.leadingAnchor.constraint(equalTo: titleRow.leadingAnchor),
            subtitleLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 32),
            subtitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: actionButton.leadingAnchor, constant: -8),
            actionButton.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            actionButton.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        ])
        updateActionButtonColors()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(_ result: UniversalSearchAppResult, onOpen: @escaping () -> Void) {
        self.onOpen = onOpen
        result.icon.configure(iconView)
        titleLabel.text = result.title
        subtitleLabel.text = result.subtitle
        telegramImageView.isHidden = !result.showsTelegramBadge
        actionButton.configuration?.title = result.actionTitle
        actionButton.isHidden = result.actionTitle == nil
        accessibilityLabel = "\(result.title), \(result.subtitle)"
        accessibilityHint = result.actionTitle
        accessibilityTraits = .button
        refreshSelectionAppearance()
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        onOpen = nil
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        updateActionButtonColors()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else { return }
        updateActionButtonColors()
    }

    @objc private func openTapped() {
        onOpen?()
    }

    private func updateActionButtonColors() {
        guard var configuration = actionButton.configuration else { return }
        let resolvedTintColor = tintColor.resolvedColor(with: traitCollection)
        let backgroundOpacity: CGFloat = traitCollection.userInterfaceStyle == .dark ? 0.24 : 0.1
        configuration.baseForegroundColor = resolvedTintColor
        configuration.baseBackgroundColor = resolvedTintColor.withAlphaComponent(backgroundOpacity)
        actionButton.configuration = configuration
    }
}

@MainActor
final class UniversalSearchActionCell: UniversalSearchBaseCell {
    enum Kind {
        case agent
        case webSearch

        var systemName: String {
            switch self {
            case .agent:
                "sparkles.2"
            case .webSearch:
                "magnifyingglass"
            }
        }
    }

    override var usesDefaultSelectedAppearance: Bool { kind != .agent }

    private let agentSelectionView = UniversalSearchPromptCapsuleView(cornerRadius: 22)
    private let symbolView = IconView(size: 24, accessoryGeometry: .forIcon24)
    private let titleLabel = UILabel()
    private let selectedTitleView = UniversalSearchAgentTitleView()
    private var kind: Kind = .webSearch

    override init(frame: CGRect) {
        super.init(frame: frame)

        symbolView.imageView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
            pointSize: 17,
            weight: .regular
        )
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.applyTextStyle(.body)
        titleLabel.textColor = .label
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        agentSelectionView.translatesAutoresizingMaskIntoConstraints = false
        agentSelectionView.isHidden = true
        agentSelectionView.isUserInteractionEnabled = false
        insertSubview(agentSelectionView, aboveSubview: highlightView)

        selectedTitleView.translatesAutoresizingMaskIntoConstraints = false
        selectedTitleView.isHidden = true

        contentView.addSubview(symbolView)
        contentView.addSubview(titleLabel)
        contentView.addSubview(selectedTitleView)
        NSLayoutConstraint.activate([
            agentSelectionView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: -16),
            agentSelectionView.topAnchor.constraint(equalTo: topAnchor),
            agentSelectionView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: 16),
            agentSelectionView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: 1),
            symbolView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            symbolView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: symbolView.trailingAnchor, constant: 8),
            titleLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            selectedTitleView.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            selectedTitleView.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor),
            selectedTitleView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            selectedTitleView.heightAnchor.constraint(equalToConstant: 22),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(kind: Kind, title: String) {
        self.kind = kind
        symbolView.config(with: UniversalSearchIconConfiguration(
            systemName: kind.systemName,
            foregroundColor: .label
        ))
        titleLabel.text = title
        selectedTitleView.configure(text: title)
        accessibilityLabel = title
        accessibilityTraits = .button
        refreshSelectionAppearance()
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        kind = .webSearch
        refreshSelectionAppearance()
    }

    override func selectionAppearanceDidChange() {
        let showsAgentSelection = kind == .agent && isPresentedAsSelected
        agentSelectionView.isHidden = !showsAgentSelection
        titleLabel.isHidden = showsAgentSelection
        selectedTitleView.isHidden = !showsAgentSelection
        symbolView.imageView.tintColor = showsAgentSelection ? tintColor : .label
        accessibilityTraits = showsAgentSelection ? [.button, .selected] : .button
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        selectionAppearanceDidChange()
    }
}

@MainActor
private final class UniversalSearchPromptCapsuleView: UIView {
    private let backgroundColorLayer = CALayer()
    private let backgroundGradientLayer = CAGradientLayer()
    private let backgroundSheenLayer = CAGradientLayer()
    private let fixedCornerRadius: CGFloat?

    init(cornerRadius: CGFloat? = nil) {
        fixedCornerRadius = cornerRadius
        super.init(frame: .zero)

        backgroundColor = .air.background
        layer.borderWidth = 0.6
        layer.cornerCurve = .circular
        layer.masksToBounds = true

        backgroundGradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
        backgroundGradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        backgroundGradientLayer.locations = [0, 0.47636, 1]
        backgroundSheenLayer.startPoint = CGPoint(x: 0.5, y: 0)
        backgroundSheenLayer.endPoint = CGPoint(x: 0.5, y: 1)
        layer.addSublayer(backgroundColorLayer)
        layer.addSublayer(backgroundGradientLayer)
        layer.addSublayer(backgroundSheenLayer)

        let noAnimations: [String: CAAction] = [
            "bounds": NSNull(),
            "position": NSNull(),
            "frame": NSNull(),
            "colors": NSNull(),
        ]
        backgroundColorLayer.actions = noAnimations
        backgroundGradientLayer.actions = noAnimations
        backgroundSheenLayer.actions = noAnimations
        updateColors()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = fixedCornerRadius ?? bounds.height / 2
        backgroundColorLayer.frame = bounds
        backgroundGradientLayer.frame = bounds
        backgroundSheenLayer.frame = bounds
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        updateColors()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else { return }
        updateColors()
    }

    private func updateColors() {
        backgroundColorLayer.backgroundColor = UniversalSearchAgentAppearance.backgroundBaseColor(
            for: traitCollection
        )
        backgroundGradientLayer.colors = UniversalSearchAgentAppearance.backgroundGradientColors(
            for: traitCollection
        )
        backgroundSheenLayer.colors = UniversalSearchAgentAppearance.sheenGradientColors(
            for: traitCollection
        )
        layer.borderColor = UniversalSearchAgentAppearance.borderColor
            .resolvedColor(with: traitCollection)
            .cgColor
    }
}

@MainActor
private final class UniversalSearchAgentTitleView: UIView {
    private let maskLabel = UILabel()
    private var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }

    override class var layerClass: AnyClass {
        CAGradientLayer.self
    }

    override init(frame: CGRect) {
        super.init(frame: frame)

        isUserInteractionEnabled = false
        maskLabel.applyTextStyle(.body)
        maskLabel.textColor = .black
        maskLabel.lineBreakMode = .byTruncatingTail
        maskLabel.layer.contentsScale = UIScreen.main.scale

        gradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
        gradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        gradientLayer.locations = [0, 0.50749, 1]
        gradientLayer.mask = maskLabel.layer
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        setContentHuggingPriority(.required, for: .horizontal)
        updateGradientColors()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var intrinsicContentSize: CGSize {
        maskLabel.intrinsicContentSize
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        maskLabel.frame = bounds
        maskLabel.layer.contentsScale = window?.screen.scale ?? UIScreen.main.scale
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        updateGradientColors()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else { return }
        updateGradientColors()
    }

    func configure(text: String) {
        maskLabel.text = text
        maskLabel.layer.setNeedsDisplay()
        invalidateIntrinsicContentSize()
    }

    private func updateGradientColors() {
        gradientLayer.colors = UniversalSearchAgentAppearance.titleGradientColors(
            for: traitCollection,
            tintColor: tintColor
        )
    }
}

@MainActor
private final class UniversalSearchPromptTitleView: UIView {
    static let tracking: CGFloat = -0.04

    private let maskLabel = UILabel()
    private var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }

    override class var layerClass: AnyClass {
        CAGradientLayer.self
    }

    override init(frame: CGRect) {
        super.init(frame: frame)

        isUserInteractionEnabled = false
        maskLabel.applyTextStyle(.subheadlineEmphasized)
        maskLabel.textColor = .black
        maskLabel.textAlignment = .center
        maskLabel.lineBreakMode = .byTruncatingTail
        maskLabel.layer.contentsScale = UIScreen.main.scale

        gradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
        gradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        gradientLayer.locations = [0, 0.50749, 1]
        gradientLayer.mask = maskLabel.layer
        updateGradientColors()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        maskLabel.frame = bounds
        maskLabel.layer.contentsScale = window?.screen.scale ?? UIScreen.main.scale
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        updateGradientColors()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else { return }
        updateGradientColors()
    }

    func configure(text: String) {
        maskLabel.attributedText = NSAttributedString(
            string: text,
            attributes: [
                .font: WTypography.uiFont(.subheadlineEmphasized),
                .foregroundColor: UIColor.black,
                .kern: Self.tracking,
            ]
        )
        maskLabel.layer.setNeedsDisplay()
    }

    private func updateGradientColors() {
        gradientLayer.colors = UniversalSearchAgentAppearance.titleGradientColors(
            for: traitCollection,
            tintColor: tintColor
        )
    }
}

@MainActor
final class UniversalSearchPromptCell: UICollectionViewCell {
    static let height: CGFloat = 40
    static let horizontalTextInset: CGFloat = 12
    static let pressScaleInset: CGFloat = 15
    static let minimumPressScale: CGFloat = 0.7

    private let capsuleView = UniversalSearchPromptCapsuleView()
    private let titleView = UniversalSearchPromptTitleView()

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            updatePressedAppearance()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)

        backgroundColor = .clear
        contentView.backgroundColor = .clear
        contentView.clipsToBounds = false

        capsuleView.translatesAutoresizingMaskIntoConstraints = false
        titleView.translatesAutoresizingMaskIntoConstraints = false
        capsuleView.addSubview(titleView)
        contentView.addSubview(capsuleView)

        NSLayoutConstraint.activate([
            capsuleView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            capsuleView.topAnchor.constraint(equalTo: contentView.topAnchor),
            capsuleView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            capsuleView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: 1),
            titleView.leadingAnchor.constraint(equalTo: capsuleView.leadingAnchor, constant: Self.horizontalTextInset),
            titleView.topAnchor.constraint(equalTo: capsuleView.topAnchor, constant: 10),
            titleView.trailingAnchor.constraint(equalTo: capsuleView.trailingAnchor, constant: -Self.horizontalTextInset),
            titleView.heightAnchor.constraint(equalToConstant: 20),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(_ prompt: UniversalSearchPrompt) {
        titleView.configure(text: prompt.text)
        accessibilityLabel = prompt.text
        accessibilityTraits = .button
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentView.layer.removeAllAnimations()
        contentView.layer.sublayerTransform = CATransform3DIdentity
    }

    static func width(for text: String, maximumWidth: CGFloat) -> CGFloat {
        let textWidth = (text as NSString).size(withAttributes: [
            .font: WTypography.uiFont(.subheadlineEmphasized),
            .kern: UniversalSearchPromptTitleView.tracking,
        ]).width
        let width = textWidth + horizontalTextInset * 2
        let scale = UIScreen.main.scale
        return min(maximumWidth, ceil(width * scale) / scale)
    }

    private func updatePressedAppearance() {
        let width = max(contentView.bounds.width, 1)
        let pressedScale = max(Self.minimumPressScale, (width - Self.pressScaleInset) / width)
        UIView.animate(
            withDuration: 0.2,
            delay: 0,
            options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]
        ) {
            self.contentView.layer.sublayerTransform = self.isHighlighted
                ? CATransform3DMakeScale(pressedScale, pressedScale, 1)
                : CATransform3DIdentity
        }
    }
}
