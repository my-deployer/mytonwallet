
import Foundation
import WalletContext

/// Runs the most recently scheduled operation after a fixed delay. Scheduling again within the
/// delay replaces the pending operation, so a burst of calls runs only the last one.
final class Debouncer: Sendable {

    private struct State {
        var generation = 0
        var task: Task<Void, Never>?
    }

    private let state = UnfairLock<State>(initialState: State())
    private let delay: Duration

    init(delay: Duration) {
        self.delay = delay
    }

    func schedule(_ operation: @escaping @Sendable () async -> Void) {
        let generation = state.withLock {
            $0.generation += 1
            $0.task?.cancel()
            return $0.generation
        }
        let task = Task {
            try? await Task.sleep(for: delay)
            let isCurrent = state.withLock { $0.generation == generation }
            guard isCurrent, !Task.isCancelled else { return }
            await operation()
        }
        state.withLock {
            if $0.generation == generation {
                $0.task = task
            }
        }
    }

    func cancel() {
        state.withLock {
            $0.generation += 1
            $0.task?.cancel()
            $0.task = nil
        }
    }
}
