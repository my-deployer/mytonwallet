
import Foundation
import SwiftUI
import UIKit
import UIComponents
import WalletContext
import Perception

struct AppearanceSettingsView: View {

    var body: some View {
        WithPerceptionTracking {
            InsetList(topPadding: 16, spacing: 24) {
                themeSection
                PaletteAndCardSection()
                OtherAppearanceSettingsSection()
                HideActionButtonsSection()
                    .padding(.bottom, 48)
            }
        }
    }
    
    var themeSection: some View {
        InsetSection {
            InsetCell(horizontalPadding: 16, verticalPadding: 8) {
                ThemeSection()
            }
        } header: {
            Text(lang("Theme"))
        }
    }
}

private struct HideActionButtonsSection: View {
    @AppStorage(WalletActionButtonsSettings.hideActionButtonsRowUserDefaultsKey)
    private var hidesActionButtonsRow = false

    var body: some View {
        InsetSection {
            InsetCell(verticalPadding: 0) {
                HStack {
                    Text(lang("$settings_hide_action_buttons"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Toggle(lang("$settings_hide_action_buttons"), isOn: $hidesActionButtonsRow)
                        .labelsHidden()
                }
                .frame(minHeight: 44)
            }
        } footer: {
            Text(lang("$settings_hide_action_buttons_description"))
        }
        .onChange(of: hidesActionButtonsRow) { _ in
            WalletActionButtonsSettings.notifyDidChange()
        }
    }
}
