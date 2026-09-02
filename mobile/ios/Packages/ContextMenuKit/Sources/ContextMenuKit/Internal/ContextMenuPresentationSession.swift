import UIKit

@MainActor
protocol ContextMenuPresentationSession: AnyObject {
    var onDidDismiss: (() -> Void)? { get set }

    func beginExternalSelection(at pointInWindow: CGPoint)
    func updateExternalSelection(at pointInWindow: CGPoint)
    func endExternalSelection(performAction: Bool)
}
