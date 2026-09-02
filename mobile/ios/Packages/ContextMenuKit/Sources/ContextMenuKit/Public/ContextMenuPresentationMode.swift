import Foundation

public enum ContextMenuPresentationMode: Sendable {
    case overlay
    case zoomPopover
    case zoomSheetOrPopover
}

enum ContextMenuResolvedPresentationMode: Equatable {
    case overlay
    case zoomPopover
    case zoomSheet
}

extension ContextMenuPresentationMode {
    var resolved: ContextMenuResolvedPresentationMode {
        self.resolved(usesRegularWidthLayout: false)
    }

    func resolved(usesRegularWidthLayout: Bool) -> ContextMenuResolvedPresentationMode {
        switch self {
        case .overlay:
            return .overlay
        case .zoomPopover:
            if #available(iOS 26.0, *) {
                return .zoomPopover
            } else {
                return .overlay
            }
        case .zoomSheetOrPopover:
            if #available(iOS 26.0, *) {
                return usesRegularWidthLayout ? .zoomPopover : .zoomSheet
            } else {
                return .overlay
            }
        }
    }
}
