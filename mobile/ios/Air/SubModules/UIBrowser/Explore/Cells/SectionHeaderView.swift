import SwiftUI
import UIComponents

struct SectionHeaderView: View {
    let title: String
    let topInset: CGFloat

    init(title: String, topInset: CGFloat = 24) {
        self.title = title
        self.topInset = topInset
    }

    var body: some View {
        Text(title)
            .textStyle(.bodyStrong, scaling: .dynamic)
            .foregroundStyle(Color.air.secondaryLabel)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .frame(minHeight: 39)
            .padding(.top, topInset)
    }
}
