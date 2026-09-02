#if DEBUG

import UIKit
import UIComponents

public enum AgentMessageRenderingLab {
    public enum Sample: Sendable {
        case markdownTable
        case wideTable
        case htmlTable
    }

    @MainActor
    public static func makeViewController(sample: Sample) -> UIViewController {
        AgentMessageRenderingLabViewController(sample: sample)
    }
}

@MainActor
private final class AgentMessageRenderingLabViewController: UIViewController {
    private let sample: AgentMessageRenderingLab.Sample
    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let bubbleView = AgentBubbleBackgroundView()
    private let richMessageView = AgentRichMessageView()

    init(sample: AgentMessageRenderingLab.Sample) {
        self.sample = sample
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .air.groupedBackground
        navigationItem.largeTitleDisplayMode = .never

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .interactive
        view.addSubview(scrollView)

        contentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentView)

        let columnView = UIView()
        columnView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(columnView)

        let descriptionLabel = UILabel()
        descriptionLabel.translatesAutoresizingMaskIntoConstraints = false
        descriptionLabel.font = WTypography.uiFont(.footnote)
        descriptionLabel.textColor = .secondaryLabel
        descriptionLabel.numberOfLines = 0
        descriptionLabel.text = "A real Agent response bubble. Wide tables scroll horizontally."
        columnView.addSubview(descriptionLabel)

        bubbleView.translatesAutoresizingMaskIntoConstraints = false
        bubbleView.accessibilityIdentifier = "agent-message-rendering-bubble"
        bubbleView.configure(
            direction: .incoming,
            fillColor: .air.agentBubbleFill,
            showsTail: true
        )
        columnView.addSubview(bubbleView)

        richMessageView.translatesAutoresizingMaskIntoConstraints = false
        richMessageView.configure(
            source: source,
            textColor: .label,
            maximumContentWidth: AgentContentLayout.maxContentWidth - 54,
            detectsLinks: true,
            markdownProfile: .legacy,
            onURLTap: nil
        )
        bubbleView.contentView.addSubview(richMessageView)

        let columnWidth = columnView.widthAnchor.constraint(equalTo: contentView.widthAnchor)
        columnWidth.priority = UILayoutPriority(999)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),

            columnView.topAnchor.constraint(equalTo: contentView.topAnchor),
            columnView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            columnView.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            columnView.leadingAnchor.constraint(greaterThanOrEqualTo: contentView.leadingAnchor),
            columnView.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor),
            columnView.widthAnchor.constraint(lessThanOrEqualToConstant: AgentContentLayout.maxContentWidth),
            columnWidth,

            descriptionLabel.topAnchor.constraint(equalTo: columnView.topAnchor, constant: 20),
            descriptionLabel.leadingAnchor.constraint(equalTo: columnView.leadingAnchor, constant: 16),
            descriptionLabel.trailingAnchor.constraint(equalTo: columnView.trailingAnchor, constant: -16),

            bubbleView.topAnchor.constraint(equalTo: descriptionLabel.bottomAnchor, constant: 16),
            bubbleView.leadingAnchor.constraint(equalTo: columnView.leadingAnchor, constant: 16),
            bubbleView.trailingAnchor.constraint(lessThanOrEqualTo: columnView.trailingAnchor, constant: -24),
            bubbleView.bottomAnchor.constraint(equalTo: columnView.bottomAnchor, constant: -24),
            bubbleView.widthAnchor.constraint(lessThanOrEqualToConstant: AgentContentLayout.maxContentWidth - 40),

            richMessageView.topAnchor.constraint(equalTo: bubbleView.contentView.topAnchor, constant: 10),
            richMessageView.leadingAnchor.constraint(equalTo: bubbleView.contentView.leadingAnchor, constant: 14),
            richMessageView.trailingAnchor.constraint(equalTo: bubbleView.contentView.trailingAnchor, constant: -14),
            richMessageView.bottomAnchor.constraint(equalTo: bubbleView.contentView.bottomAnchor, constant: -10),

        ])
    }

    private var source: String {
        switch sample {
        case .markdownTable:
            """
            Here is a portfolio snapshot:

            | Token | Balance | 24h change |
            | :--- | ---: | ---: |
            | TON | 125.50 | +2.3% |
            | USDT | 84.20 | -0.1% |
            | NOT | 12,450 | +4.8% |
            """
        case .wideTable:
            """
            Here is a wider activity table. Swipe it horizontally to see every column:

            | Time | Type | Asset pair | Amount | Status | Explorer |
            | :--- | :--- | :---: | ---: | :---: | :--- |
            | 09:42 | Swap | GRAM \\| USDT | 10 GRAM | Completed | https://tonviewer.com |
            | Yesterday | Stake | TON | 25 TON | Pending | https://tonscan.org |
            | Aug 8 | Receive | USDT | 15 USDT | Completed | https://tonviewer.com |
            """
        case .htmlTable:
            """
            Here is a structured table with richer Telegram-style features:

            <table border="1" class="striped">
            <caption>Wallet positions</caption>
            <thead>
            <tr><th rowspan="2" valign="middle">Asset</th><th colspan="2" align="center">Position</th><th rowspan="2" valign="bottom">Status</th></tr>
            <tr><th align="right">Balance</th><th align="right">Value</th></tr>
            </thead>
            <tbody>
            <tr><td>TON</td><td align="right">125.50</td><td align="right">$712.84</td><td align="center">Active</td></tr>
            <tr><td>USDT</td><td align="right">84.20</td><td align="right">$84.20</td><td align="center">Available</td></tr>
            <tr><td header colspan="2">Total portfolio</td><td colspan="2" align="right">**$797.04**</td></tr>
            </tbody>
            </table>
            """
        }
    }
}

#endif
