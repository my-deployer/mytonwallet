import Foundation
import WalletContext

enum SendWarningContent {
    static var domainScamMarkdown: String {
        L10n.domainLikeScamWarning(helpCenterLink: "[\(lang("$help_center_prepositional"))](\(domainScamHelpUrl.absoluteString))")
    }

    static var domainScamPlainText: String {
        L10n.domainLikeScamWarning(helpCenterLink: lang("$help_center_prepositional"))
        .replacingOccurrences(of: "**", with: "")
    }

    static var seedPhraseScamMarkdown: String {
        L10n.seedPhraseScamWarning(helpCenterLink: "[\(lang("$help_center_prepositional"))](\(seedPhraseScamHelpUrl.absoluteString))")
    }

    static var seedPhraseScamHelpUrl: URL {
        let value = Language.current == .ru
            ? HELP_CENTER_SEED_SCAM_URL_RU
            : HELP_CENTER_SEED_SCAM_URL
        return URL(string: value)!
    }

    static var domainScamHelpUrl: URL {
        let value = Language.current == .ru
            ? HELP_CENTER_DOMAIN_SCAM_URL_RU
            : HELP_CENTER_DOMAIN_SCAM_URL
        return URL(string: value)!
    }
}
