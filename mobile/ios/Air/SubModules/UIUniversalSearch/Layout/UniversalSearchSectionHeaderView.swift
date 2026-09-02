import UIComponents
import UIKit
import WalletContext

@MainActor
final class UniversalSearchSectionHeaderView: UICollectionReusableView {
    static let elementKind = "UniversalSearchSectionHeader"
    private static let toggleTransitionDuration: TimeInterval = 0.25

    private let separatorView = UIView()
    private let titleLabel = UILabel()
    private let textAccessoryButton = UIButton(type: .custom)
    private let primaryToggleButton = UIButton(type: .custom)
    private let secondaryToggleButton = UIButton(type: .custom)
    private let toggleSeparatorLabel = UILabel()
    private let toggleStack = UIStackView()
    private var onAccessoryTap: (() -> Void)?
    private var toggleConfiguration: (
        primary: String,
        secondary: String,
        selected: UniversalSearchSection.HeaderAccessory.ToggleSelection
    )?

    override init(frame: CGRect) {
        super.init(frame: frame)

        separatorView.translatesAutoresizingMaskIntoConstraints = false
        separatorView.backgroundColor = .air.separator

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.applyTextStyle(.subheadlineStrong)
        titleLabel.textColor = .air.secondaryLabel
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        textAccessoryButton.translatesAutoresizingMaskIntoConstraints = false
        textAccessoryButton.contentHorizontalAlignment = .trailing
        textAccessoryButton.addTarget(self, action: #selector(accessoryTapped), for: .touchUpInside)
        textAccessoryButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        textAccessoryButton.setContentHuggingPriority(.required, for: .horizontal)

        primaryToggleButton.addTarget(self, action: #selector(accessoryTapped), for: .touchUpInside)
        secondaryToggleButton.addTarget(self, action: #selector(accessoryTapped), for: .touchUpInside)
        for button in [primaryToggleButton, secondaryToggleButton] {
            button.contentHorizontalAlignment = .center
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
            button.setContentHuggingPriority(.required, for: .horizontal)
        }

        toggleSeparatorLabel.applyTextStyle(.subheadline)
        toggleSeparatorLabel.textColor = .air.secondaryLabel
        toggleSeparatorLabel.text = " · "
        toggleStack.translatesAutoresizingMaskIntoConstraints = false
        toggleStack.axis = .horizontal
        toggleStack.alignment = .center
        toggleStack.spacing = 0
        toggleStack.addArrangedSubview(primaryToggleButton)
        toggleStack.addArrangedSubview(toggleSeparatorLabel)
        toggleStack.addArrangedSubview(secondaryToggleButton)
        toggleStack.setContentCompressionResistancePriority(.required, for: .horizontal)
        toggleStack.setContentHuggingPriority(.required, for: .horizontal)

        addSubview(separatorView)
        addSubview(titleLabel)
        addSubview(textAccessoryButton)
        addSubview(toggleStack)
        NSLayoutConstraint.activate([
            separatorView.leadingAnchor.constraint(equalTo: leadingAnchor),
            separatorView.trailingAnchor.constraint(equalTo: trailingAnchor),
            separatorView.topAnchor.constraint(equalTo: topAnchor),
            separatorView.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor),
            titleLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
            textAccessoryButton.leadingAnchor.constraint(greaterThanOrEqualTo: titleLabel.trailingAnchor, constant: 8),
            textAccessoryButton.trailingAnchor.constraint(equalTo: trailingAnchor),
            textAccessoryButton.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            toggleStack.leadingAnchor.constraint(greaterThanOrEqualTo: titleLabel.trailingAnchor, constant: 8),
            toggleStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            toggleStack.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(
        section: UniversalSearchSection,
        showsSeparator: Bool,
        onAccessoryTap: (() -> Void)?,
        animated: Bool = false
    ) {
        titleLabel.text = section.title
        separatorView.isHidden = !showsSeparator
        self.onAccessoryTap = onAccessoryTap

        switch section.headerAccessory {
        case .toggle(let primary, let secondary, let selected):
            let previousToggleConfiguration = toggleConfiguration
            let shouldAnimate = animated
                && window != nil
                && previousToggleConfiguration?.primary == primary
                && previousToggleConfiguration?.secondary == secondary
                && previousToggleConfiguration?.selected != selected
            let updates = { [self] in
                toggleConfiguration = (primary, secondary, selected)
                textAccessoryButton.isHidden = true
                textAccessoryButton.isUserInteractionEnabled = false
                textAccessoryButton.isAccessibilityElement = false
                toggleStack.isHidden = false
                configureToggleButton(
                    primaryToggleButton,
                    title: primary,
                    isSelected: selected == .primary,
                    isEnabled: selected != .primary && onAccessoryTap != nil
                )
                configureToggleButton(
                    secondaryToggleButton,
                    title: secondary,
                    isSelected: selected == .secondary,
                    isEnabled: selected != .secondary && onAccessoryTap != nil
                )
            }
            if shouldAnimate {
                UIView.transition(
                    with: toggleStack,
                    duration: Self.toggleTransitionDuration,
                    options: [
                        .transitionCrossDissolve,
                        .beginFromCurrentState,
                        .allowUserInteraction,
                    ],
                    animations: updates
                )
            } else {
                updates()
            }
        case .text(let text):
            toggleConfiguration = nil
            toggleStack.isHidden = true
            textAccessoryButton.isHidden = false
            textAccessoryButton.isUserInteractionEnabled = onAccessoryTap != nil
            textAccessoryButton.isAccessibilityElement = onAccessoryTap != nil
            textAccessoryButton.setAttributedTitle(
                NSAttributedString(
                    string: text,
                    attributes: [
                        .font: WTypography.uiFont(.subheadline),
                        .foregroundColor: UIColor.air.secondaryLabel,
                    ]
                ),
                for: .normal
            )
            textAccessoryButton.accessibilityLabel = text
        case nil:
            toggleConfiguration = nil
            toggleStack.isHidden = true
            textAccessoryButton.isHidden = true
            textAccessoryButton.isUserInteractionEnabled = false
            textAccessoryButton.isAccessibilityElement = false
            textAccessoryButton.setAttributedTitle(nil, for: .normal)
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        onAccessoryTap = nil
        toggleConfiguration = nil
        textAccessoryButton.isUserInteractionEnabled = false
        textAccessoryButton.isAccessibilityElement = false
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        guard let toggleConfiguration else { return }
        configureToggleButton(
            primaryToggleButton,
            title: toggleConfiguration.primary,
            isSelected: toggleConfiguration.selected == .primary,
            isEnabled: toggleConfiguration.selected != .primary && onAccessoryTap != nil
        )
        configureToggleButton(
            secondaryToggleButton,
            title: toggleConfiguration.secondary,
            isSelected: toggleConfiguration.selected == .secondary,
            isEnabled: toggleConfiguration.selected != .secondary && onAccessoryTap != nil
        )
    }

    private func configureToggleButton(
        _ button: UIButton,
        title: String,
        isSelected: Bool,
        isEnabled: Bool
    ) {
        let font = WTypography.uiFont(isSelected ? .subheadlineEmphasized : .subheadline)
        let color: UIColor = isSelected ? .air.secondaryLabel : tintColor
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
        ]
        button.setAttributedTitle(NSAttributedString(string: title, attributes: attributes), for: .normal)
        button.setAttributedTitle(
            NSAttributedString(
                string: title,
                attributes: attributes.merging([
                    .foregroundColor: color.withAlphaComponent(0.45),
                ]) { _, highlighted in highlighted }
            ),
            for: .highlighted
        )
        button.isUserInteractionEnabled = isEnabled
        button.isAccessibilityElement = isEnabled
        button.accessibilityLabel = title
        button.accessibilityHint = lang("$universal_search_switch_section_contents")
    }

    @objc private func accessoryTapped() {
        onAccessoryTap?()
    }
}
