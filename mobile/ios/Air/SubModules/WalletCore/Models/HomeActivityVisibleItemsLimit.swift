import Foundation
import WalletContext

public enum HomeActivityVisibleItemsLimit: Int, CaseIterable, Equatable, Sendable {
    case top1 = 1
    case top3 = 3
    case top5 = 5
    case top10 = 10
    case top30 = 30

    public static let defaultValue: Self = .top5

    public init(storedValue: Int) {
        self = Self(rawValue: storedValue) ?? .defaultValue
    }

    public var title: String {
        let title = switch self {
        case .top1: lang("Top 1")
        case .top3: lang("Top 3")
        case .top5: lang("Top 5")
        case .top10: lang("Top 10")
        case .top30: lang("Top 30")
        }
        return localizedIntegerDigits(in: title)
    }
}
