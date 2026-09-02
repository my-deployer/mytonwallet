
import Foundation
import WalletContext

private let log = Log("SdkActivationRelay")

/// Forwards account activation to the SDK without blocking the caller.
///
/// Rapid switches coalesce: only the most recently requested account is guaranteed to reach the SDK.
/// Failed sends are retried with backoff until a newer request supersedes them or attempts run out.
/// The SDK call only redirects polling and the SDK-side current account, so the app keeps working on
/// local data while a send is pending.
final class SdkActivationRelay: Sendable {

    private struct State {
        var generation = 0
        var task: Task<Void, Never>?
    }

    private let state = UnfairLock<State>(initialState: State())
    private let retryDelays: [Duration]
    private let send: @Sendable (String) async throws -> Void

    init(
        retryDelays: [Duration] = [.seconds(1), .seconds(2), .seconds(4), .seconds(8), .seconds(16)],
        send: @escaping @Sendable (String) async throws -> Void
    ) {
        self.retryDelays = retryDelays
        self.send = send
    }

    func requestActivation(accountId: String) {
        let generation = state.withLock {
            $0.generation += 1
            $0.task?.cancel()
            return $0.generation
        }
        let task = Task {
            await run(accountId: accountId, generation: generation)
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

    private func isCurrent(_ generation: Int) -> Bool {
        state.withLock { $0.generation == generation }
    }

    private func run(accountId: String, generation: Int) async {
        let delays = [Duration.zero] + retryDelays
        for (attempt, delay) in delays.enumerated() {
            if delay > .zero {
                try? await Task.sleep(for: delay)
            }
            guard isCurrent(generation), !Task.isCancelled else { return }
            do {
                try await send(accountId)
                return
            } catch is CancellationError {
                return
            } catch {
                log.error("activation failed account=\(accountId, .public) attempt=\(attempt + 1): \(error, .public)")
            }
        }
        log.fault("giving up on activating account=\(accountId, .public) after \(delays.count) attempts")
    }
}
