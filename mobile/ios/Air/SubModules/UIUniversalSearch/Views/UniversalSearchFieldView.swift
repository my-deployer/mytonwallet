import UIComponents
import UIKit
import WalletContext

public struct UniversalSearchAutocomplete: Equatable, Sendable {
    public enum Style: Equatable, Sendable {
        case standard
        case agent
    }

    public var suggestion: String
    public var actionTitle: String
    public var style: Style

    public init(
        suggestion: String,
        actionTitle: String,
        style: Style = .standard
    ) {
        self.suggestion = suggestion
        self.actionTitle = actionTitle
        self.style = style
    }
}

public struct UniversalSearchFieldConfiguration: Equatable, Sendable {
    public var text: String
    public var placeholder: String
    public var autocomplete: UniversalSearchAutocomplete?
    public var showsMicrophone: Bool

    public init(
        text: String = "",
        placeholder: String,
        autocomplete: UniversalSearchAutocomplete? = nil,
        showsMicrophone: Bool = true
    ) {
        self.text = text
        self.placeholder = placeholder
        self.autocomplete = autocomplete
        self.showsMicrophone = showsMicrophone
    }
}

public enum UniversalSearchFieldPresentation: Equatable, Sendable {
    case homeToolbar
    case compactToolbar
    case search
}

/// The active Universal Search input and its adjacent close control.
///
/// The view owns presentation and text editing only. Search results and autocomplete
/// decisions remain the responsibility of its host through `configuration` and callbacks.
@MainActor
public final class UniversalSearchFieldView: UIView {
    public var onActivate: (() -> Void)?
    public var onTextChange: ((String) -> Void)?
    public var onReturn: ((String) -> Void)?
    public var onMicrophoneTap: (() -> Void)?
    public var onActionsTap: (() -> Void)?
    public var onToolbarActionTap: ((String) -> Void)?
    public var onCloseTap: (() -> Void)?

    public var configuration: UniversalSearchFieldConfiguration {
        get { storedConfiguration }
        set {
            storedConfiguration = newValue
            fieldView.configure(with: newValue)
        }
    }

    public var microphoneAccessibilityLabel: String = lang("$universal_search_dictate") {
        didSet { fieldView.microphoneAccessibilityLabel = microphoneAccessibilityLabel }
    }

    public var clearAccessibilityLabel: String = lang("$universal_search_clear_text") {
        didSet { fieldView.clearAccessibilityLabel = clearAccessibilityLabel }
    }

    public var closeAccessibilityLabel: String = lang("Close") {
        didSet { updateTrailingButtonAccessibilityLabel() }
    }

    public var actionsAccessibilityLabel: String = lang("Actions") {
        didSet { updateTrailingButtonAccessibilityLabel() }
    }

    public var text: String { fieldView.text }
    public var isEditing: Bool { fieldView.isEditing }
    public var trailingButtonView: UIView { closeButton.interactionView }
    public var trailingButtonPresentationSourceView: UIView { closeButton.presentationSourceView }
    public private(set) var compactActions: [SharedBottomToolbarAction] = []
    public private(set) var presentation: UniversalSearchFieldPresentation = .search

    private var storedConfiguration: UniversalSearchFieldConfiguration
    private let fieldView = UniversalSearchFieldCapsuleView()
    private let closeButton = UniversalSearchCloseButton()
    private let compactActionsClipView = UIView()
    private let compactActionsView = UIStackView()
    private let glassContainerView: UIVisualEffectView?
    private let contentView: UIView
    private var closeButtonLeadingConstraint: NSLayoutConstraint!
    private var closeButtonTrailingConstraint: NSLayoutConstraint!
    private var closeButtonCompactCenterXConstraint: NSLayoutConstraint!
    private var fieldCompactWidthConstraint: NSLayoutConstraint!
    private var compactActionButtons: [String: UniversalSearchToolbarActionButton] = [:]

    public init(configuration: UniversalSearchFieldConfiguration) {
        storedConfiguration = configuration

        if IOS_26_MODE_ENABLED, #available(iOS 26, iOSApplicationExtension 26, *) {
            let effect = UIGlassContainerEffect()
            effect.spacing = 8
            let glassContainerView = UIVisualEffectView(effect: effect)
            self.glassContainerView = glassContainerView
            contentView = glassContainerView.contentView
        } else {
            glassContainerView = nil
            contentView = UIView()
        }

        super.init(frame: .zero)

        translatesAutoresizingMaskIntoConstraints = false
        setupLayout()
        setupCallbacks()
        fieldView.configure(with: configuration)
        fieldView.microphoneAccessibilityLabel = microphoneAccessibilityLabel
        fieldView.clearAccessibilityLabel = clearAccessibilityLabel
        updateTrailingButtonAccessibilityLabel()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: 48)
    }

    @discardableResult
    public func focus() -> Bool {
        fieldView.focus()
    }

    @discardableResult
    public func endEditing() -> Bool {
        fieldView.endEditing()
    }

    public func setCompactActions(
        _ actions: [SharedBottomToolbarAction],
        animated: Bool
    ) {
        guard actions != compactActions else { return }
        compactActions = actions

        let changes = { [self] in
            rebuildCompactActions(with: actions)
            compactActionsView.layoutIfNeeded()
        }
        if animated, presentation == .compactToolbar, window != nil {
            UIView.transition(
                with: compactActionsView,
                duration: 0.2,
                options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState],
                animations: changes
            )
        } else {
            UIView.performWithoutAnimation(changes)
        }
    }

    public func setPresentation(
        _ presentation: UniversalSearchFieldPresentation,
        animated: Bool,
        duration: TimeInterval = 0.4
    ) {
        guard animated else {
            applyPresentation(presentation, animator: nil, duration: duration)
            layoutIfNeeded()
            return
        }

        layoutIfNeeded()
        let animator = UIViewPropertyAnimator(duration: duration, curve: .easeInOut)
        setPresentation(presentation, animator: animator, duration: duration)
        animator.addAnimations {
            self.layoutIfNeeded()
        }
        animator.startAnimation()
    }

    /// Adds this view's presentation changes to a host-owned animator.
    ///
    /// Use this overload when constraints outside this view also change. The host
    /// should lay out its source state, call this method, update its constraints,
    /// add `layoutIfNeeded()` on their common ancestor, and start the animator.
    public func setPresentation(
        _ presentation: UniversalSearchFieldPresentation,
        animator: UIViewPropertyAnimator,
        duration: TimeInterval = 0.4
    ) {
        applyPresentation(presentation, animator: animator, duration: duration)
    }

    private func applyPresentation(
        _ presentation: UniversalSearchFieldPresentation,
        animator: UIViewPropertyAnimator?,
        duration: TimeInterval
    ) {
        guard presentation != self.presentation else { return }
        self.presentation = presentation

        let isCompact = presentation == .compactToolbar
        closeButtonLeadingConstraint.constant = presentation == .homeToolbar ? 12 : 8
        if isCompact {
            NSLayoutConstraint.deactivate([
                closeButtonLeadingConstraint,
                closeButtonTrailingConstraint,
            ])
            NSLayoutConstraint.activate([
                closeButtonCompactCenterXConstraint,
                fieldCompactWidthConstraint,
            ])
        } else {
            NSLayoutConstraint.deactivate([
                closeButtonCompactCenterXConstraint,
                fieldCompactWidthConstraint,
            ])
            NSLayoutConstraint.activate([
                closeButtonLeadingConstraint,
                closeButtonTrailingConstraint,
            ])
        }
        if IOS_26_MODE_ENABLED,
           #available(iOS 26, iOSApplicationExtension 26, *),
           let effect = glassContainerView?.effect as? UIGlassContainerEffect {
            effect.spacing = presentation == .homeToolbar ? 12 : 8
        }
        fieldView.setPresentation(presentation, animator: animator)
        closeButton.setPresentation(
            presentation,
            animator: animator,
            duration: duration
        )

        let layoutDirection: CGFloat = effectiveUserInterfaceLayoutDirection == .rightToLeft ? -1 : 1
        let updates = {
            self.closeButton.alpha = isCompact ? 0 : 1
            self.closeButton.transform = isCompact
                ? CGAffineTransform(scaleX: 0.72, y: 0.72)
                : .identity
            self.compactActionsClipView.alpha = isCompact ? 1 : 0
            self.compactActionsClipView.transform = isCompact
                ? .identity
                : CGAffineTransform(translationX: layoutDirection * 20, y: 0)
                    .scaledBy(x: 0.94, y: 0.94)
            self.layoutIfNeeded()
        }
        if let animator {
            animator.addAnimations(updates)
        } else {
            updates()
        }
        updateTrailingButtonAccessibilityLabel()
    }

    private func setupLayout() {
        if let glassContainerView {
            glassContainerView.translatesAutoresizingMaskIntoConstraints = false
            addSubview(glassContainerView)
            NSLayoutConstraint.activate([
                glassContainerView.leadingAnchor.constraint(equalTo: leadingAnchor),
                glassContainerView.trailingAnchor.constraint(equalTo: trailingAnchor),
                glassContainerView.topAnchor.constraint(equalTo: topAnchor),
                glassContainerView.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        } else {
            contentView.translatesAutoresizingMaskIntoConstraints = false
            addSubview(contentView)
            NSLayoutConstraint.activate([
                contentView.leadingAnchor.constraint(equalTo: leadingAnchor),
                contentView.trailingAnchor.constraint(equalTo: trailingAnchor),
                contentView.topAnchor.constraint(equalTo: topAnchor),
                contentView.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        }

        fieldView.translatesAutoresizingMaskIntoConstraints = false
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        compactActionsClipView.translatesAutoresizingMaskIntoConstraints = false
        compactActionsClipView.clipsToBounds = true
        compactActionsClipView.alpha = 0
        compactActionsView.translatesAutoresizingMaskIntoConstraints = false
        compactActionsView.axis = .horizontal
        compactActionsView.alignment = .fill
        compactActionsView.distribution = .fillEqually
        compactActionsView.spacing = 8
        contentView.addSubview(fieldView)
        contentView.addSubview(compactActionsClipView)
        compactActionsClipView.addSubview(compactActionsView)
        contentView.addSubview(closeButton)

        closeButtonLeadingConstraint = closeButton.leadingAnchor.constraint(
            equalTo: fieldView.trailingAnchor,
            constant: 8
        )
        closeButtonTrailingConstraint = closeButton.trailingAnchor.constraint(
            equalTo: contentView.trailingAnchor
        )
        closeButtonCompactCenterXConstraint = closeButton.centerXAnchor.constraint(
            equalTo: fieldView.centerXAnchor
        )
        fieldCompactWidthConstraint = fieldView.widthAnchor.constraint(equalToConstant: 48)
        NSLayoutConstraint.activate([
            fieldView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            fieldView.topAnchor.constraint(equalTo: contentView.topAnchor),
            fieldView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),

            closeButtonLeadingConstraint,
            closeButtonTrailingConstraint,
            closeButton.topAnchor.constraint(equalTo: contentView.topAnchor),
            closeButton.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 48),

            compactActionsClipView.leadingAnchor.constraint(equalTo: fieldView.trailingAnchor, constant: 8),
            compactActionsClipView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            compactActionsClipView.topAnchor.constraint(equalTo: contentView.topAnchor),
            compactActionsClipView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),

            compactActionsView.trailingAnchor.constraint(equalTo: compactActionsClipView.trailingAnchor),
            compactActionsView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 56),
            compactActionsView.topAnchor.constraint(equalTo: compactActionsClipView.topAnchor),
            compactActionsView.bottomAnchor.constraint(equalTo: compactActionsClipView.bottomAnchor),
        ])
    }

    private func setupCallbacks() {
        fieldView.onTextChange = { [weak self] text in
            guard let self else { return }
            storedConfiguration.text = text
            onTextChange?(text)
        }
        fieldView.onReturn = { [weak self] text in
            self?.onReturn?(text)
        }
        fieldView.onMicrophoneTap = { [weak self] in
            self?.onMicrophoneTap?()
        }
        fieldView.onActivate = { [weak self] in
            self?.onActivate?()
        }
        closeButton.onTap = { [weak self] in
            guard let self else { return }
            switch presentation {
            case .homeToolbar:
                onActionsTap?()
            case .compactToolbar:
                break
            case .search:
                onCloseTap?()
            }
        }
    }

    private func updateTrailingButtonAccessibilityLabel() {
        switch presentation {
        case .homeToolbar:
            closeButton.buttonAccessibilityLabel = actionsAccessibilityLabel
            closeButton.accessibilityElementsHidden = false
            closeButton.isUserInteractionEnabled = true
        case .compactToolbar:
            closeButton.buttonAccessibilityLabel = nil
            closeButton.accessibilityElementsHidden = true
            closeButton.isUserInteractionEnabled = false
        case .search:
            closeButton.buttonAccessibilityLabel = closeAccessibilityLabel
            closeButton.accessibilityElementsHidden = false
            closeButton.isUserInteractionEnabled = true
        }
    }

    private func rebuildCompactActions(with actions: [SharedBottomToolbarAction]) {
        compactActionsView.arrangedSubviews.forEach {
            compactActionsView.removeArrangedSubview($0)
        }

        let desiredIDs = Set(actions.map(\.id))
        let removedIDs = compactActionButtons.keys.filter { !desiredIDs.contains($0) }
        for id in removedIDs {
            compactActionButtons.removeValue(forKey: id)?.removeFromSuperview()
        }

        for action in actions {
            let button = compactActionButtons[action.id] ?? UniversalSearchToolbarActionButton()
            compactActionButtons[action.id] = button
            button.configure(with: action)
            button.onTap = { [weak self] in
                self?.onToolbarActionTap?(action.id)
            }
            compactActionsView.addArrangedSubview(button)
        }
    }
}

@MainActor
private final class UniversalSearchFieldCapsuleView: UIView, UITextFieldDelegate {
    var onActivate: (() -> Void)?
    var onTextChange: ((String) -> Void)?
    var onReturn: ((String) -> Void)?
    var onMicrophoneTap: (() -> Void)?

    var microphoneAccessibilityLabel: String = lang("$universal_search_dictate") {
        didSet {
            if !microphoneButton.isHidden {
                microphoneButton.accessibilityLabel = microphoneAccessibilityLabel
            }
        }
    }

    var clearAccessibilityLabel: String = lang("$universal_search_clear_text") {
        didSet {
            if !clearButton.isHidden {
                clearButton.accessibilityLabel = clearAccessibilityLabel
            }
        }
    }

    var text: String { textField.text ?? "" }
    var isEditing: Bool { textField.isFirstResponder }

    // Figma's SF Pro `tracking: -0.45px` resolves to this Core Text kern.
    private static let textKern: CGFloat = 0.05

    private var configuration = UniversalSearchFieldConfiguration(placeholder: "")
    private var suppressesAutocompleteUntilNextInsertion = false
    private var ignoredSelectionChangeCount = 0
    private var expectedTextAfterUserEdit: String?
    private var expectedSelectionAfterUserEdit: NSRange?
    private let glassView = UniversalSearchInteractiveGlassView()
    private let magnifyingGlass = UIImageView(image: UIImage(
        systemName: "magnifyingglass",
        withConfiguration: UIImage.SymbolConfiguration(
            font: WTypography.uiFont(.supportingEmphasized, content: .technical)
        )
    ))
    private let textField = UITextField()
    private let autocompleteView = UniversalSearchAutocompleteView()
    private let microphoneButton = UniversalSearchSymbolButton()
    private let clearButton = UniversalSearchSymbolButton()

    private var textToMicrophoneConstraint: NSLayoutConstraint!
    private var textToClearConstraint: NSLayoutConstraint!
    private var textToTrailingConstraint: NSLayoutConstraint!
    private var textFieldLeadingConstraint: NSLayoutConstraint!
    private var presentation: UniversalSearchFieldPresentation = .search

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with configuration: UniversalSearchFieldConfiguration) {
        self.configuration = configuration
        if textField.text != configuration.text {
            suppressesAutocompleteUntilNextInsertion = false
            ignoreSelectionChangesUntilNextRunLoop()
            textField.attributedText = attributedText(configuration.text, color: .label)
        }
        updateDefaultTextAttributes()
        updatePlaceholder()
        updateAccessory()
        updateAutocomplete()
    }

    @discardableResult
    func focus() -> Bool {
        ignoreSelectionChangesUntilNextRunLoop()
        return textField.becomeFirstResponder()
    }

    @discardableResult
    func endEditing() -> Bool {
        textField.resignFirstResponder()
    }

    func setPresentation(
        _ presentation: UniversalSearchFieldPresentation,
        animator: UIViewPropertyAnimator?
    ) {
        guard presentation != self.presentation else { return }
        self.presentation = presentation
        let isSearch = presentation == .search
        let isCompact = presentation == .compactToolbar
        textFieldLeadingConstraint.constant = isSearch ? 16 : 44
        textField.isUserInteractionEnabled = isSearch
        magnifyingGlass.isHidden = false

        let transformDirection: CGFloat = effectiveUserInterfaceLayoutDirection == .rightToLeft ? 1 : -1
        let updates = {
            self.magnifyingGlass.alpha = isSearch ? 0 : 1
            self.magnifyingGlass.transform = isSearch
                ? CGAffineTransform(translationX: transformDirection * 12, y: 0)
                : .identity
            self.textField.alpha = isCompact ? 0 : 1
            self.textField.transform = isCompact
                ? CGAffineTransform(translationX: -transformDirection * 10, y: 0)
                : .identity
            self.autocompleteView.alpha = isCompact ? 0 : 1
            self.microphoneButton.alpha = isCompact ? 0 : 1
            self.clearButton.alpha = isCompact ? 0 : 1
            self.layoutIfNeeded()
        }
        updatePresentationAccessibility()

        guard let animator else {
            updates()
            magnifyingGlass.isHidden = isSearch
            return
        }
        animator.addAnimations(updates)
        animator.addCompletion { [weak self] _ in
            guard let self, self.presentation == presentation else { return }
            magnifyingGlass.isHidden = isSearch
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateAutocompleteGeometry()
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        textField.tintColor = autocompleteView.isShowingAutocomplete ? .clear : tintColor
        autocompleteView.actionTintColor = tintColor
    }

    private func setup() {
        translatesAutoresizingMaskIntoConstraints = false

        glassView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glassView)

        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.delegate = self
        textField.borderStyle = .none
        textField.backgroundColor = .clear
        textField.clearButtonMode = .never
        textField.textAlignment = .natural
        textField.keyboardType = .webSearch
        textField.returnKeyType = .go
        textField.autocapitalizationType = .none
        textField.autocorrectionType = .no
        textField.spellCheckingType = .no
        textField.smartQuotesType = .no
        textField.smartDashesType = .no
        textField.smartInsertDeleteType = .no
        textField.accessibilityTraits.insert(.searchField)
        textField.addTarget(self, action: #selector(textDidChange), for: .editingChanged)

        autocompleteView.translatesAutoresizingMaskIntoConstraints = false
        autocompleteView.isUserInteractionEnabled = false

        configureAccessoryButton(
            microphoneButton,
            systemName: "microphone",
            weight: .medium,
            action: #selector(microphoneTapped)
        )
        microphoneButton.tintColor = .secondaryLabel

        configureAccessoryButton(
            clearButton,
            systemName: "xmark.circle.fill",
            weight: .regular,
            action: #selector(clearTapped)
        )
        clearButton.tintColor = .label

        glassView.contentView.addSubview(textField)
        glassView.contentView.addSubview(magnifyingGlass)
        glassView.contentView.addSubview(autocompleteView)
        glassView.contentView.addSubview(microphoneButton)
        glassView.contentView.addSubview(clearButton)

        let focusGesture = UITapGestureRecognizer(target: self, action: #selector(fieldTapped))
        focusGesture.cancelsTouchesInView = false
        addGestureRecognizer(focusGesture)

        textToMicrophoneConstraint = textField.trailingAnchor.constraint(
            equalTo: microphoneButton.leadingAnchor,
            constant: -8
        )
        textToClearConstraint = textField.trailingAnchor.constraint(
            equalTo: clearButton.leadingAnchor,
            constant: -8
        )
        textToTrailingConstraint = textField.trailingAnchor.constraint(
            equalTo: glassView.contentView.trailingAnchor,
            constant: -14
        )

        magnifyingGlass.translatesAutoresizingMaskIntoConstraints = false
        magnifyingGlass.tintColor = .label
        magnifyingGlass.contentMode = .scaleAspectFit
        textFieldLeadingConstraint = textField.leadingAnchor.constraint(
            equalTo: glassView.contentView.leadingAnchor,
            constant: 16
        )
        NSLayoutConstraint.activate([
            glassView.leadingAnchor.constraint(equalTo: leadingAnchor),
            glassView.trailingAnchor.constraint(equalTo: trailingAnchor),
            glassView.topAnchor.constraint(equalTo: topAnchor),
            glassView.bottomAnchor.constraint(equalTo: bottomAnchor),

            textFieldLeadingConstraint,
            textField.centerYAnchor.constraint(equalTo: glassView.contentView.centerYAnchor),
            textField.heightAnchor.constraint(equalToConstant: 24),

            magnifyingGlass.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor, constant: 14),
            magnifyingGlass.centerYAnchor.constraint(equalTo: glassView.contentView.centerYAnchor),
            magnifyingGlass.widthAnchor.constraint(equalToConstant: 20),
            magnifyingGlass.heightAnchor.constraint(equalToConstant: 20),

            autocompleteView.leadingAnchor.constraint(equalTo: textField.leadingAnchor),
            autocompleteView.trailingAnchor.constraint(equalTo: textField.trailingAnchor),
            autocompleteView.topAnchor.constraint(equalTo: textField.topAnchor),
            autocompleteView.bottomAnchor.constraint(equalTo: textField.bottomAnchor),

            microphoneButton.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor, constant: -14),
            microphoneButton.centerYAnchor.constraint(equalTo: glassView.contentView.centerYAnchor),
            microphoneButton.widthAnchor.constraint(equalToConstant: 18),
            microphoneButton.heightAnchor.constraint(equalToConstant: 20),

            clearButton.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor, constant: -12),
            clearButton.centerYAnchor.constraint(equalTo: glassView.contentView.centerYAnchor),
            clearButton.widthAnchor.constraint(equalToConstant: 20),
            clearButton.heightAnchor.constraint(equalToConstant: 22),
        ])

        microphoneButton.accessibilityLabel = microphoneAccessibilityLabel
        clearButton.accessibilityLabel = clearAccessibilityLabel
        updateDefaultTextAttributes()
        magnifyingGlass.isHidden = true
    }

    private func configureAccessoryButton(
        _ button: UniversalSearchSymbolButton,
        systemName: String,
        weight: UIImage.SymbolWeight,
        action: Selector
    ) {
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setSymbol(
            systemName,
            configuration: UIImage.SymbolConfiguration(pointSize: 17, weight: weight)
        )
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func updateDefaultTextAttributes() {
        textField.defaultTextAttributes = [
            .font: WTypography.uiFont(.body),
            .foregroundColor: UIColor.label,
            .kern: Self.textKern,
        ]
        textField.tintColor = tintColor
    }

    private func updatePlaceholder() {
        textField.attributedPlaceholder = attributedText(
            configuration.placeholder,
            color: .tertiaryLabel
        )
    }

    private func updateAccessory() {
        let hasText = !(textField.text ?? "").isEmpty
        let showsMicrophone = configuration.showsMicrophone && !hasText
        let showsClear = hasText

        microphoneButton.isHidden = !showsMicrophone
        microphoneButton.isAccessibilityElement = showsMicrophone
        microphoneButton.accessibilityElementsHidden = !showsMicrophone
        microphoneButton.isUserInteractionEnabled = showsMicrophone
        microphoneButton.accessibilityLabel = showsMicrophone ? microphoneAccessibilityLabel : nil
        clearButton.isHidden = !showsClear
        clearButton.isAccessibilityElement = showsClear
        clearButton.accessibilityElementsHidden = !showsClear
        clearButton.isUserInteractionEnabled = showsClear
        clearButton.accessibilityLabel = showsClear ? clearAccessibilityLabel : nil
        textToMicrophoneConstraint.isActive = showsMicrophone
        textToClearConstraint.isActive = showsClear
        textToTrailingConstraint.isActive = !showsMicrophone && !showsClear
        updatePresentationAccessibility()
    }

    private func updateAutocomplete() {
        autocompleteView.actionTintColor = tintColor
        autocompleteView.configure(
            typedText: textField.text ?? "",
            autocomplete: shouldShowAutocomplete ? configuration.autocomplete : nil
        )
        textField.tintColor = autocompleteView.isShowingAutocomplete ? .clear : tintColor
        setNeedsLayout()
    }

    private func updateAutocompleteGeometry() {
        guard autocompleteView.isShowingAutocomplete else { return }
        textField.layoutIfNeeded()

        let textRect = textField.bounds
        let endPosition = textField.endOfDocument
        var caretX = textField.caretRect(for: endPosition).minX
        if !caretX.isFinite || caretX <= textRect.minX {
            caretX = fallbackCaretX(in: textRect)
        }

        let writingDirection = textField.baseWritingDirection(for: endPosition, in: .backward)
        let isRightToLeft = if writingDirection == .rightToLeft {
            true
        } else if writingDirection == .leftToRight {
            false
        } else {
            effectiveUserInterfaceLayoutDirection == .rightToLeft
        }

        autocompleteView.updateGeometry(
            caretX: caretX,
            textViewport: textRect,
            isRightToLeft: isRightToLeft
        )
    }

    private func fallbackCaretX(in textRect: CGRect) -> CGFloat {
        let width = attributedText(textField.text ?? "", color: .label).size().width
        if effectiveUserInterfaceLayoutDirection == .rightToLeft {
            return max(textRect.minX, textRect.maxX - width)
        }
        return min(textRect.maxX, textRect.minX + width)
    }

    private func attributedText(_ text: String, color: UIColor) -> NSAttributedString {
        NSAttributedString(
            string: text,
            attributes: [
                .font: WTypography.uiFont(.body),
                .foregroundColor: color,
                .kern: Self.textKern,
            ]
        )
    }

    @objc private func textDidChange() {
        configuration.text = textField.text ?? ""
        if let expectedText = expectedTextAfterUserEdit,
           configuration.text == expectedText,
           selectedRange == expectedSelectionAfterUserEdit {
            clearExpectedUserEdit()
        }
        updateAccessory()
        updateAutocomplete()
        onTextChange?(configuration.text)
    }

    @objc private func microphoneTapped() {
        onMicrophoneTap?()
    }

    @objc private func clearTapped() {
        suppressesAutocompleteUntilNextInsertion = true
        textField.attributedText = attributedText("", color: .label)
        textDidChange()
        textField.becomeFirstResponder()
    }

    @objc private func fieldTapped() {
        if presentation != .search {
            onActivate?()
        } else {
            textField.becomeFirstResponder()
        }
    }

    private func updatePresentationAccessibility() {
        let isSearch = presentation == .search
        isAccessibilityElement = !isSearch
        accessibilityLabel = isSearch ? nil : configuration.placeholder
        accessibilityTraits = isSearch ? [] : .button
        textField.isAccessibilityElement = isSearch
        microphoneButton.isAccessibilityElement = isSearch && !microphoneButton.isHidden
        clearButton.isAccessibilityElement = isSearch && !clearButton.isHidden
        microphoneButton.isUserInteractionEnabled = isSearch && !microphoneButton.isHidden
        clearButton.isUserInteractionEnabled = isSearch && !clearButton.isHidden
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        onReturn?(textField.text ?? "")
        return false
    }

    func textField(
        _ textField: UITextField,
        shouldChangeCharactersIn range: NSRange,
        replacementString string: String
    ) -> Bool {
        let isDeleting = string.isEmpty && range.length > 0
        if isDeleting,
           autocompleteView.isShowingAutocomplete,
           hasSelectionAtTextEnd {
            suppressesAutocompleteUntilNextInsertion = true
            updateAutocomplete()
            return false
        }

        if !string.isEmpty {
            suppressesAutocompleteUntilNextInsertion = false
        }
        let currentText = (textField.text ?? "") as NSString
        if range.location <= currentText.length,
           NSMaxRange(range) <= currentText.length {
            expectedTextAfterUserEdit = currentText.replacingCharacters(
                in: range,
                with: string
            )
            expectedSelectionAfterUserEdit = NSRange(
                location: range.location + (string as NSString).length,
                length: 0
            )
        } else {
            expectedTextAfterUserEdit = nil
            expectedSelectionAfterUserEdit = nil
        }
        return true
    }

    func textFieldDidChangeSelection(_ textField: UITextField) {
        guard ignoredSelectionChangeCount == 0 else {
            updateAutocomplete()
            return
        }

        if let expectedText = expectedTextAfterUserEdit,
           textField.text == expectedText {
            let expectedSelection = expectedSelectionAfterUserEdit
            clearExpectedUserEdit()
            if selectedRange == expectedSelection {
                updateAutocomplete()
                return
            }
        }

        if expectedTextAfterUserEdit != nil {
            // Some input methods update selection before committing the text.
            // Keep the edit intent alive until `editingChanged` observes it.
            return
        }

        // UIKit reports taps, drag selection, and keyboard-trackpad movement here.
        // Once the user positions the cursor, wait for another insertion before
        // showing autocomplete again—even when the cursor returns to the end.
        suppressesAutocompleteUntilNextInsertion = true
        updateAutocomplete()
    }

    private func clearExpectedUserEdit() {
        expectedTextAfterUserEdit = nil
        expectedSelectionAfterUserEdit = nil
    }

    private func ignoreSelectionChangesUntilNextRunLoop() {
        ignoredSelectionChangeCount += 1
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            ignoredSelectionChangeCount = max(0, ignoredSelectionChangeCount - 1)
        }
    }

    private var shouldShowAutocomplete: Bool {
        !suppressesAutocompleteUntilNextInsertion
            && hasSelectionAtTextEnd
            && textField.markedTextRange == nil
    }

    private var hasSelectionAtTextEnd: Bool {
        guard let selection = textField.selectedTextRange else { return true }
        return selection.isEmpty
            && textField.compare(selection.end, to: textField.endOfDocument) == .orderedSame
    }

    private var selectedRange: NSRange? {
        guard let selection = textField.selectedTextRange else { return nil }
        return NSRange(
            location: textField.offset(from: textField.beginningOfDocument, to: selection.start),
            length: textField.offset(from: selection.start, to: selection.end)
        )
    }
}

@MainActor
private final class UniversalSearchAutocompleteView: UIView {
    var actionTintColor: UIColor = .tintColor {
        didSet { refreshAppearance() }
    }

    private(set) var isShowingAutocomplete = false

    // These Core Text values reproduce Figma's measured SF Pro widths.
    private static let mainKern: CGFloat = 0.05
    private static let actionKern: CGFloat = -0.1

    private var autocomplete: UniversalSearchAutocomplete?
    private var fullAttributedText: NSAttributedString?
    private var suffixAttributedText: NSAttributedString?
    private var displayedAttributedText: NSAttributedString?
    private var actionRange = NSRange(location: 0, length: 0)
    private let clippingView = UIView()
    private let backgroundView = UniversalSearchAutocompleteBackgroundView()
    private let standardLabel = UILabel()
    private let actionTextView = UniversalSearchGradientTextView()

    override init(frame: CGRect) {
        super.init(frame: frame)

        clipsToBounds = true
        clippingView.clipsToBounds = true
        backgroundView.isUserInteractionEnabled = false
        addSubview(backgroundView)
        addSubview(clippingView)

        standardLabel.numberOfLines = 1
        standardLabel.isUserInteractionEnabled = false
        clippingView.addSubview(standardLabel)

        actionTextView.isUserInteractionEnabled = false
        clippingView.addSubview(actionTextView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        actionTintColor = tintColor
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            refreshAppearance()
        }
    }

    func configure(typedText: String, autocomplete: UniversalSearchAutocomplete?) {
        self.autocomplete = autocomplete
        guard !typedText.isEmpty,
              let autocomplete,
              autocomplete.suggestion.hasPrefix(typedText) else {
            isShowingAutocomplete = false
            isHidden = true
            fullAttributedText = nil
            suffixAttributedText = nil
            displayedAttributedText = nil
            return
        }

        let remainingSuggestion = String(autocomplete.suggestion.dropFirst(typedText.count))
        let action = " — \(autocomplete.actionTitle)"
        guard !remainingSuggestion.isEmpty || !action.isEmpty else {
            isShowingAutocomplete = false
            isHidden = true
            suffixAttributedText = nil
            return
        }

        let suggestionAttributes: [NSAttributedString.Key: Any] = [
            .font: WTypography.uiFont(.body),
            .foregroundColor: UIColor.label,
            .kern: Self.mainKern,
        ]
        let actionAttributes: [NSAttributedString.Key: Any] = [
            .font: WTypography.uiFont(.subheadline),
            .foregroundColor: autocomplete.style == .agent ? UIColor.black : actionTintColor,
            .kern: Self.actionKern,
        ]
        let fullAttributedText = NSMutableAttributedString(
            string: autocomplete.suggestion,
            attributes: suggestionAttributes
        )
        fullAttributedText.append(NSAttributedString(
            string: action,
            attributes: actionAttributes
        ))
        let suffixAttributedText = NSMutableAttributedString(
            string: remainingSuggestion,
            attributes: suggestionAttributes
        )
        suffixAttributedText.append(NSAttributedString(
            string: action,
            attributes: actionAttributes
        ))

        self.fullAttributedText = fullAttributedText
        self.suffixAttributedText = suffixAttributedText
        actionRange = NSRange(
            location: fullAttributedText.length - (action as NSString).length,
            length: (action as NSString).length
        )
        displayedAttributedText = fullAttributedText
        isShowingAutocomplete = true
        isHidden = false
        refreshAppearance()
    }

    func updateGeometry(
        caretX: CGFloat,
        textViewport: CGRect,
        isRightToLeft: Bool
    ) {
        guard isShowingAutocomplete,
              let fullAttributedText,
              let suffixAttributedText else { return }

        let attributedText = isRightToLeft ? suffixAttributedText : fullAttributedText
        if displayedAttributedText != attributedText {
            displayedAttributedText = attributedText
            refreshAppearance()
        }

        let contentWidth = attributedText.boundingRect(
            with: CGSize(width: .greatestFiniteMagnitude, height: bounds.height),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            context: nil
        ).width
        guard contentWidth > 0 else {
            isHidden = true
            return
        }

        let viewport = textViewport.intersection(bounds)
        let leadingBackgroundPadding: CGFloat = autocomplete?.style == .agent ? 1 : 0
        let trailingBackgroundPadding: CGFloat = 3
        let availableWidth: CGFloat
        let clippingOriginX: CGFloat
        let textOriginX: CGFloat
        let backgroundWidth: CGFloat
        if isRightToLeft {
            backgroundWidth = ceil(contentWidth) + leadingBackgroundPadding + trailingBackgroundPadding
            availableWidth = max(0, caretX - viewport.minX + leadingBackgroundPadding)
            let visibleWidth = min(backgroundWidth, availableWidth)
            clippingOriginX = caretX - visibleWidth + leadingBackgroundPadding
            textOriginX = visibleWidth - contentWidth - trailingBackgroundPadding
        } else {
            clippingOriginX = caretX - leadingBackgroundPadding
            availableWidth = max(0, viewport.maxX - clippingOriginX)
            backgroundWidth = max(
                0,
                ceil(contentWidth) + trailingBackgroundPadding - clippingOriginX
            )
            textOriginX = -clippingOriginX
        }

        let visibleWidth = min(backgroundWidth, availableWidth)
        guard visibleWidth > 0 else {
            isHidden = true
            return
        }
        isHidden = false
        let semanticContentAttribute: UISemanticContentAttribute =
            isRightToLeft ? .forceRightToLeft : .forceLeftToRight
        standardLabel.semanticContentAttribute = semanticContentAttribute
        actionTextView.semanticContentAttribute = semanticContentAttribute

        clippingView.frame = CGRect(
            x: clippingOriginX,
            y: 0,
            width: visibleWidth,
            height: bounds.height
        )
        let isAgent = autocomplete?.style == .agent
        let backgroundLeadingAdjustment: CGFloat = isAgent ? 2 : 0
        let backgroundTrailingAdjustment: CGFloat = isAgent ? 1 : 0
        let backgroundX = if isRightToLeft {
            clippingOriginX - backgroundTrailingAdjustment
        } else {
            clippingOriginX + backgroundLeadingAdjustment
        }
        backgroundView.frame = CGRect(
            x: backgroundX,
            y: (bounds.height - 21) / 2 + (isAgent ? 1 : 0),
            width: max(
                0,
                visibleWidth + backgroundTrailingAdjustment - backgroundLeadingAdjustment
            ),
            height: 21
        )

        let textFrame = CGRect(
            x: textOriginX,
            y: 0,
            width: contentWidth,
            height: bounds.height
        )
        standardLabel.frame = textFrame
        actionTextView.frame = textFrame
        actionTextView.gradientFrame = actionGradientFrame(
            in: attributedText,
            isRightToLeft: isRightToLeft
        )
        actionTextView.setNeedsLayout()
    }

    private func actionGradientFrame(
        in attributedText: NSAttributedString,
        isRightToLeft: Bool
    ) -> CGRect {
        let displayedActionRange = isRightToLeft
            ? NSRange(
                location: attributedText.length - actionRange.length,
                length: actionRange.length
            )
            : actionRange
        guard displayedActionRange.location >= 0,
              NSMaxRange(displayedActionRange) <= attributedText.length
        else { return .zero }

        let prefixWidth = attributedText.attributedSubstring(
            from: NSRange(location: 0, length: displayedActionRange.location)
        ).size().width
        let actionWidth = attributedText.attributedSubstring(from: displayedActionRange).size().width
        return CGRect(x: prefixWidth, y: 0, width: actionWidth, height: bounds.height)
    }

    private func refreshAppearance() {
        guard let autocomplete, let displayedAttributedText else { return }

        backgroundView.configure(style: autocomplete.style, tintColor: actionTintColor)
        let suggestionText = NSMutableAttributedString(attributedString: displayedAttributedText)
        let actionLength = (" — \(autocomplete.actionTitle)" as NSString).length
        if suggestionText.length >= actionLength {
            suggestionText.addAttribute(
                .foregroundColor,
                value: UIColor.clear,
                range: NSRange(
                    location: suggestionText.length - actionLength,
                    length: actionLength
                )
            )
        }
        standardLabel.attributedText = suggestionText
        actionTextView.attributedText = displayedAttributedText
        actionTextView.gradientColors = autocomplete.style == .agent
            ? autocompleteGradientColors
            : standardActionColors
        standardLabel.isHidden = false
        actionTextView.isHidden = false
    }

    private var standardActionColors: [CGColor] {
        let color = actionTintColor.resolvedColor(with: traitCollection).cgColor
        return [color, color]
    }

    private var autocompleteGradientColors: [CGColor] {
        [
            actionTintColor.resolvedColor(with: traitCollection).cgColor,
            UIColor(hex: "#00BEFF").cgColor,
            UIColor(hex: "#B656FF").cgColor,
        ]
    }
}

@MainActor
private final class UniversalSearchAutocompleteBackgroundView: UIView {
    private var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }

    override class var layerClass: AnyClass {
        CAGradientLayer.self
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = 6
        layer.cornerCurve = .continuous
        clipsToBounds = true
        // Figma's vector runs from (0, 0) to (91.9539, 27.7743) in a 94×21 rect.
        // These normalized endpoints preserve that direction without clipping its end colors.
        gradientLayer.startPoint = CGPoint(x: -0.0313, y: 0.4641)
        gradientLayer.endPoint = CGPoint(x: 1.0313, y: 0.5359)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(style: UniversalSearchAutocomplete.Style, tintColor: UIColor) {
        let alpha: CGFloat = traitCollection.userInterfaceStyle == .dark ? 0.3 : 0.2
        switch style {
        case .standard:
            let color = tintColor.withAlphaComponent(alpha).cgColor
            gradientLayer.colors = [color, color]
            gradientLayer.locations = [0, 1]
        case .agent:
            gradientLayer.colors = [
                tintColor.withAlphaComponent(alpha).cgColor,
                UIColor(hex: "#00BEFF").withAlphaComponent(alpha).cgColor,
                UIColor(hex: "#B656FF").withAlphaComponent(alpha).cgColor,
            ]
            gradientLayer.locations = [0, 0.48, 1]
        }
    }
}

@MainActor
private final class UniversalSearchGradientTextView: UIView {
    var attributedText: NSAttributedString? {
        didSet { maskLabel.attributedText = attributedText }
    }

    var gradientColors: [CGColor] = [] {
        didSet { setNeedsLayout() }
    }

    var gradientFrame = CGRect.zero

    private let gradientLayer = CAGradientLayer()
    private let maskLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        gradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
        gradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        maskLabel.numberOfLines = 1
        layer.addSublayer(gradientLayer)
        gradientLayer.mask = maskLabel.layer
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        maskLabel.semanticContentAttribute = semanticContentAttribute
        gradientLayer.frame = gradientFrame
        gradientLayer.colors = gradientColors
        maskLabel.frame = CGRect(
            x: -gradientFrame.minX,
            y: 0,
            width: bounds.width,
            height: bounds.height
        )
    }
}

@MainActor
private final class UniversalSearchToolbarActionButton: UIButton {
    var onTap: (() -> Void)?

    private var action: SharedBottomToolbarAction?

    override init(frame: CGRect) {
        super.init(frame: frame)
        addTarget(self, action: #selector(tapped), for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        if let action {
            applyConfiguration(for: action)
        }
    }

    func configure(with action: SharedBottomToolbarAction) {
        self.action = action
        accessibilityLabel = action.accessibilityLabel
        applyConfiguration(for: action)
    }

    private func applyConfiguration(for action: SharedBottomToolbarAction) {
        var configuration: UIButton.Configuration
        if #available(iOS 26, iOSApplicationExtension 26, *), IOS_26_MODE_ENABLED {
            configuration = .prominentGlass()
        } else {
            configuration = .filled()
        }
        configuration.title = action.title
        configuration.cornerStyle = .capsule
        configuration.titleLineBreakMode = .byTruncatingTail
        configuration.baseBackgroundColor = switch action.style {
        case .accent: tintColor
        case .positive: .air.positiveAmount
        case .negative: .air.negativeAmount
        }
        configuration.baseForegroundColor = .white
        configuration.contentInsets = NSDirectionalEdgeInsets(
            top: 0,
            leading: 14,
            bottom: 0,
            trailing: 14
        )
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = WButton.capsuleFont
            outgoing.foregroundColor = .white
            return outgoing
        }
        self.configuration = configuration
    }

    @objc private func tapped() {
        onTap?()
    }
}

@MainActor
private final class UniversalSearchInteractiveGlassView: UIView {
    let contentView: UIView
    var presentationSourceView: UIView { effectView }

    private let effectView: UIVisualEffectView

    override init(frame: CGRect) {
        if IOS_26_MODE_ENABLED, #available(iOS 26, iOSApplicationExtension 26, *) {
            let effect = UIGlassEffect(style: .regular)
            effect.isInteractive = true
            effectView = UIVisualEffectView(effect: effect)
            effectView.cornerConfiguration = .corners(radius: 24)
        } else {
            effectView = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        }
        contentView = effectView.contentView

        super.init(frame: frame)

        effectView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(effectView)
        NSLayoutConstraint.activate([
            effectView.leadingAnchor.constraint(equalTo: leadingAnchor),
            effectView.trailingAnchor.constraint(equalTo: trailingAnchor),
            effectView.topAnchor.constraint(equalTo: topAnchor),
            effectView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if !IOS_26_MODE_ENABLED {
            effectView.layer.cornerRadius = bounds.height / 2
            effectView.layer.cornerCurve = .continuous
            effectView.clipsToBounds = true
        }
    }
}

@MainActor
private final class UniversalSearchCloseButton: UIView {
    var onTap: (() -> Void)?

    var interactionView: UIView { button }
    var presentationSourceView: UIView { glassView.presentationSourceView }

    var buttonAccessibilityLabel: String? {
        get { button.accessibilityLabel }
        set { button.accessibilityLabel = newValue }
    }

    private let glassView = UniversalSearchInteractiveGlassView()
    private let button = UIButton(type: .system)
    private let contentReplaceView = BlurReplaceView()
    private let tintOverlayView = UIView()
    private var presentation: UniversalSearchFieldPresentation = .search

    override init(frame: CGRect) {
        super.init(frame: frame)

        glassView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glassView)

        button.translatesAutoresizingMaskIntoConstraints = false
        button.configuration = .plain()
        button.configuration?.contentInsets = .zero
        button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
        glassView.contentView.addSubview(button)

        tintOverlayView.backgroundColor = tintColor
        tintOverlayView.isUserInteractionEnabled = false
        tintOverlayView.translatesAutoresizingMaskIntoConstraints = false
        tintOverlayView.alpha = 0
        tintOverlayView.layer.cornerRadius = 24
        tintOverlayView.layer.cornerCurve = .continuous
        tintOverlayView.clipsToBounds = true
        glassView.contentView.insertSubview(tintOverlayView, belowSubview: button)

        contentReplaceView.isUserInteractionEnabled = false
        contentReplaceView.translatesAutoresizingMaskIntoConstraints = false
        contentReplaceView.maximumBlurRadius = 10
        glassView.contentView.addSubview(contentReplaceView)
        contentReplaceView.replaceContent(with: makeContentView(for: .search), animated: false)

        NSLayoutConstraint.activate([
            glassView.leadingAnchor.constraint(equalTo: leadingAnchor),
            glassView.trailingAnchor.constraint(equalTo: trailingAnchor),
            glassView.topAnchor.constraint(equalTo: topAnchor),
            glassView.bottomAnchor.constraint(equalTo: bottomAnchor),

            tintOverlayView.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor),
            tintOverlayView.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor),
            tintOverlayView.topAnchor.constraint(equalTo: glassView.contentView.topAnchor),
            tintOverlayView.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor),

            button.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor),
            button.topAnchor.constraint(equalTo: glassView.contentView.topAnchor),
            button.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor),

            contentReplaceView.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor),
            contentReplaceView.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor),
            contentReplaceView.topAnchor.constraint(equalTo: glassView.contentView.topAnchor),
            contentReplaceView.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        tintOverlayView.backgroundColor = tintColor
    }

    func setPresentation(
        _ presentation: UniversalSearchFieldPresentation,
        animator: UIViewPropertyAnimator?,
        duration: TimeInterval
    ) {
        guard presentation != self.presentation else { return }
        self.presentation = presentation
        let usesActionAppearance = presentation != .search
        contentReplaceView.animationDuration = duration
        contentReplaceView.replaceContent(
            with: makeContentView(for: presentation),
            animated: animator != nil
        )
        // A tint overlay makes the color transition continuously animatable on
        // every supported OS. Replacing UIGlassEffect to change its tint would
        // otherwise produce a discrete jump on iOS 26.
        let tintAlpha: CGFloat = usesActionAppearance ? 1 : 0
        guard let animator else {
            tintOverlayView.alpha = tintAlpha
            return
        }
        animator.addAnimations {
            self.tintOverlayView.alpha = tintAlpha
        }
    }

    private func makeContentView(for presentation: UniversalSearchFieldPresentation) -> UIView {
        let usesActionAppearance = presentation != .search
        let imageName = usesActionAppearance ? "UniversalSearchPlus" : "UniversalSearchXmark"
        let imageView = UIImageView(
            image: UIImage.airBundle(imageName).withRenderingMode(.alwaysTemplate)
        )
        imageView.tintColor = usesActionAppearance ? .white : .label
        imageView.contentMode = .center
        return imageView
    }

    @objc private func tapped() {
        onTap?()
    }
}

@MainActor
private final class UniversalSearchSymbolButton: UIControl {
    private let imageView = UIImageView()

    override var isHighlighted: Bool {
        didSet { imageView.alpha = isHighlighted ? 0.45 : 1 }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)

        isAccessibilityElement = true
        accessibilityTraits = .button
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .center
        imageView.clipsToBounds = false
        imageView.isUserInteractionEnabled = false
        addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: trailingAnchor),
            imageView.topAnchor.constraint(equalTo: topAnchor),
            imageView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setSymbol(_ systemName: String, configuration: UIImage.SymbolConfiguration) {
        imageView.image = UIImage(systemName: systemName)
        imageView.preferredSymbolConfiguration = configuration
    }

    override func tintColorDidChange() {
        super.tintColorDidChange()
        imageView.tintColor = tintColor
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        let horizontalExpansion = max(0, (44 - bounds.width) / 2)
        let verticalExpansion = max(0, (44 - bounds.height) / 2)
        return bounds.insetBy(
            dx: -horizontalExpansion,
            dy: -verticalExpansion
        ).contains(point)
    }
}
