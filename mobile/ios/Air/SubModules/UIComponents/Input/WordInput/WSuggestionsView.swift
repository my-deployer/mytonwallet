//
//  WSuggestionsView.swift
//  MyTonWalletAir
//
//  Created by Sina on 11/25/24.
//

import UIKit
import WalletContext

public final class WSuggestionsView: UIInputView {
    public static let defaultHeight = CGFloat(50)
    
    public init() {
        super.init(frame: .zero, inputViewStyle: .keyboard)
        setupViews()
        observeKeyboardPresentation()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private var activeInput: WWordInput?
    private var suggestions = [String]()
    private var isSoftwareKeyboardVisible = false
    private var heightConstraint: NSLayoutConstraint!
    private var bubbleConstraints = [NSLayoutConstraint]()
    private let suggestionsList = SuggestionsListView()
    private let hardwareKeyboardBubble = SuggestionsBubbleView()
    
    private func setupViews() {
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        semanticContentAttribute = .forceLeftToRight
        suggestionsList.semanticContentAttribute = .forceLeftToRight
        suggestionsList.didSelectSuggestion = { [weak self] suggestion in
            self?.selectSuggestion(suggestion)
        }
        hardwareKeyboardBubble.didSelectSuggestion = { [weak self] suggestion in
            self?.selectSuggestion(suggestion)
        }
        addSubview(suggestionsList)

        heightConstraint = heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            heightConstraint,
            suggestionsList.leadingAnchor.constraint(equalTo: leadingAnchor),
            suggestionsList.trailingAnchor.constraint(equalTo: trailingAnchor),
            suggestionsList.bottomAnchor.constraint(equalTo: bottomAnchor),
            suggestionsList.heightAnchor.constraint(equalToConstant: WSuggestionsView.defaultHeight),
        ])
    }

    public func config(activeInput: WWordInput?, suggestions: [String]) {
        self.activeInput = activeInput
        self.suggestions = suggestions
        updatePresentation()
    }

    private func updatePresentation() {
        let showsHardwareKeyboardBubble = activeInput != nil
            && !suggestions.isEmpty
            && WKeyboardObserver.isHardwareKeyboardConnected
            && !isSoftwareKeyboardVisible
        suggestionsList.configure(suggestions: showsHardwareKeyboardBubble ? [] : suggestions)
        heightConstraint.constant = activeInput != nil && !suggestions.isEmpty && !showsHardwareKeyboardBubble
            ? WSuggestionsView.defaultHeight
            : 0

        if showsHardwareKeyboardBubble, let activeInput {
            showHardwareKeyboardBubble(above: activeInput)
        } else {
            hideHardwareKeyboardBubble()
        }
    }

    private func observeKeyboardPresentation() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
            return
        }
        let visibleHeight: CGFloat
        if let presentationWindow = activeInput?.window ?? window {
            let windowFrame = presentationWindow.convert(presentationWindow.bounds, to: nil)
            let overlap = windowFrame.intersection(endFrame)
            visibleHeight = overlap.isNull ? 0 : overlap.height
        } else {
            visibleHeight = endFrame.height
        }
        isSoftwareKeyboardVisible = visibleHeight > Self.defaultHeight * 2
        updatePresentation()
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        isSoftwareKeyboardVisible = false
        updatePresentation()
    }

    private func selectSuggestion(_ suggestion: String) {
        guard suggestions.contains(suggestion), let activeInput else { return }
        activeInput.setText(
            suggestion,
            notifyDelegate: true,
            goToNextInput: activeInput.advancesOnSuggestionSelection
        )
    }

    private func showHardwareKeyboardBubble(above activeInput: WWordInput) {
        guard let window = activeInput.window else {
            hideHardwareKeyboardBubble()
            return
        }

        hardwareKeyboardBubble.configure(suggestions: suggestions)
        if hardwareKeyboardBubble.superview !== window {
            hardwareKeyboardBubble.removeFromSuperview()
            window.addSubview(hardwareKeyboardBubble)
        }

        NSLayoutConstraint.deactivate(bubbleConstraints)
        let availableWidth = window.bounds.width
            - window.safeAreaInsets.left
            - window.safeAreaInsets.right
            - 24
        let contentWidth = suggestions.reduce(CGFloat.zero) { width, suggestion in
            let font = WTypography.uiFont(.body, content: .technical)
            return width + suggestion.size(withAttributes: [.font: font]).width + 32
        }
        let bubbleWidth = min(max(activeInput.bounds.width, contentWidth), min(320, availableWidth))
        let centerConstraint = hardwareKeyboardBubble.centerXAnchor.constraint(equalTo: activeInput.centerXAnchor)
        centerConstraint.priority = .defaultHigh
        bubbleConstraints = [
            hardwareKeyboardBubble.bottomAnchor.constraint(equalTo: activeInput.topAnchor, constant: -8),
            hardwareKeyboardBubble.heightAnchor.constraint(equalToConstant: Self.defaultHeight),
            hardwareKeyboardBubble.widthAnchor.constraint(equalToConstant: bubbleWidth),
            hardwareKeyboardBubble.leadingAnchor.constraint(
                greaterThanOrEqualTo: window.safeAreaLayoutGuide.leadingAnchor,
                constant: 12
            ),
            hardwareKeyboardBubble.trailingAnchor.constraint(
                lessThanOrEqualTo: window.safeAreaLayoutGuide.trailingAnchor,
                constant: -12
            ),
            centerConstraint,
        ]
        NSLayoutConstraint.activate(bubbleConstraints)
        window.bringSubviewToFront(hardwareKeyboardBubble)
    }

    private func hideHardwareKeyboardBubble() {
        NSLayoutConstraint.deactivate(bubbleConstraints)
        bubbleConstraints.removeAll()
        hardwareKeyboardBubble.removeFromSuperview()
    }
}

private final class SuggestionsBubbleView: UIView {
    var didSelectSuggestion: ((String) -> Void)? {
        get { suggestionsList.didSelectSuggestion }
        set { suggestionsList.didSelectSuggestion = newValue }
    }

    private let suggestionsList = SuggestionsListView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .air.sheetBackground
        layer.cornerRadius = 14
        layer.borderWidth = 0.5
        layer.borderColor = UIColor.label.withAlphaComponent(0.08).cgColor
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.16
        layer.shadowRadius = 12
        layer.shadowOffset = CGSize(width: 0, height: 4)
        accessibilityIdentifier = "hardwareKeyboardSuggestions"

        addSubview(suggestionsList)
        NSLayoutConstraint.activate([
            suggestionsList.leadingAnchor.constraint(equalTo: leadingAnchor),
            suggestionsList.trailingAnchor.constraint(equalTo: trailingAnchor),
            suggestionsList.topAnchor.constraint(equalTo: topAnchor),
            suggestionsList.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: layer.cornerRadius).cgPath
    }

    func configure(suggestions: [String]) {
        suggestionsList.configure(suggestions: suggestions)
    }
}

private final class SuggestionsListView: UIView {
    var didSelectSuggestion: ((String) -> Void)?

    private var suggestions = [String]()
    private let collectionView: UICollectionView = {
        let layout = UICollectionViewFlowLayout()
        layout.scrollDirection = .horizontal
        layout.minimumLineSpacing = 0
        layout.minimumInteritemSpacing = 0
        let collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        collectionView.backgroundColor = .clear
        collectionView.register(SuggestionCell.self, forCellWithReuseIdentifier: SuggestionCell.identifier)
        collectionView.showsHorizontalScrollIndicator = false
        return collectionView
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        semanticContentAttribute = .forceLeftToRight
        collectionView.semanticContentAttribute = .forceLeftToRight
        collectionView.delegate = self
        collectionView.dataSource = self
        addSubview(collectionView)
        NSLayoutConstraint.activate([
            collectionView.leadingAnchor.constraint(equalTo: leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: trailingAnchor),
            collectionView.topAnchor.constraint(equalTo: topAnchor),
            collectionView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(suggestions: [String]) {
        self.suggestions = suggestions
        collectionView.collectionViewLayout.invalidateLayout()
        collectionView.reloadData()
    }
}

extension SuggestionsListView: UICollectionViewDelegate, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {

    // MARK: - Collection View Data Source
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        return suggestions.count
    }
    
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        guard suggestions.indices.contains(indexPath.row),
              let cell = collectionView.dequeueReusableCell(withReuseIdentifier: SuggestionCell.identifier, for: indexPath) as? SuggestionCell else {
            return UICollectionViewCell()
        }
        cell.configure(with: suggestions[indexPath.row])
        return cell
    }
    
    // MARK: - Collection View Delegate Flow Layout
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        guard suggestions.indices.contains(indexPath.row) else {
            return .zero
        }
        let text = suggestions[indexPath.row]
        let font = WTypography.uiFont(.body, content: .technical)
        let width = text.size(withAttributes: [.font: font]).width + 32
        return CGSize(width: width, height: WSuggestionsView.defaultHeight)
    }
    
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard suggestions.indices.contains(indexPath.row) else { return }
        didSelectSuggestion?(suggestions[indexPath.row])
    }
}

private class SuggestionCell: UICollectionViewCell {
    static let identifier = "SuggestionCell"
    
    private let suggestionLabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.applyTextStyle(.body, content: .technical)
        return label
    }()
    
    private let separator: UIView = {
        let v = UIView()
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }()
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        contentView.backgroundColor = .clear
        contentView.addSubview(suggestionLabel)
        contentView.addSubview(separator)
        NSLayoutConstraint.activate([
            separator.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            separator.widthAnchor.constraint(equalToConstant: 0.33),
            separator.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            separator.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            suggestionLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            suggestionLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            suggestionLabel.topAnchor.constraint(equalTo: contentView.topAnchor),
            suggestionLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
        ])
        updateTheme()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    func configure(with text: String) {
        suggestionLabel.text = text
        isAccessibilityElement = true
        accessibilityLabel = text
        accessibilityTraits = .button
        accessibilityIdentifier = "mnemonicSuggestion.\(text)"
    }
    
    private func updateTheme() {
        suggestionLabel.textColor = UIColor.label
        separator.backgroundColor = UIColor.label.withAlphaComponent(0.1)
    }
}
