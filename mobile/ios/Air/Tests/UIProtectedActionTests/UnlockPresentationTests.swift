import Testing
import UIKit
@testable import UIPasscode
import WalletCore

@Suite("Unlock Presentation", .serialized)
@MainActor
struct UnlockPresentationTests {
    @Test
    func `biometric first authorization forwards extra usages without presenting passcode UI`() async {
        let originalAuthSupport = AuthSupport
        AuthSupport = RecordingAuthSupport.self
        defer { AuthSupport = originalAuthSupport }
        await RecordingAuthSupport.usageRecorder.reset()

        let window = UIWindow(frame: UIScreen.main.bounds)
        let presenter = UIViewController()
        window.rootViewController = presenter
        window.makeKeyAndVisible()
        presenter.loadViewIfNeeded()
        defer { window.isHidden = true }

        let token = await withCheckedContinuation { continuation in
            UnlockVC.presentAuth(
                on: presenter,
                extraAuthUsages: 1,
                tryBiometricsBeforePresentation: true,
                onDone: { continuation.resume(returning: $0) },
                cancellable: true
            )
        }

        #expect(token == EnclaveToken("biometric-token"))
        #expect(presenter.presentedViewController == nil)
        let receivedExtraUsages = await RecordingAuthSupport.usageRecorder.biometricExtraUsages
        #expect(receivedExtraUsages == 1)
    }

    @Test
    func `passcode authorization forwards extra usages`() async {
        let originalAuthSupport = AuthSupport
        AuthSupport = RecordingAuthSupport.self
        defer { AuthSupport = originalAuthSupport }
        await RecordingAuthSupport.usageRecorder.reset()

        let window = UIWindow(frame: UIScreen.main.bounds)
        defer { window.isHidden = true }

        let token = await withCheckedContinuation { continuation in
            let unlockViewController = UnlockVC(
                animatedPresentation: true,
                dissmissWhenAuthorized: false,
                onDone: { continuation.resume(returning: $0) },
                useBioOnPresent: false,
                extraAuthUsages: 1,
                successCompletionDelay: 0
            )
            window.rootViewController = unlockViewController
            window.makeKeyAndVisible()
            unlockViewController.loadViewIfNeeded()
            unlockViewController.passcodeSelected(passcode: "1234")
        }

        #expect(token == EnclaveToken("passcode-token"))
        let receivedExtraUsages = await RecordingAuthSupport.usageRecorder.passcodeExtraUsages
        #expect(receivedExtraUsages == 1)
    }
}

private actor AuthUsageRecorder {
    private(set) var passcodeExtraUsages: Int?
    private(set) var biometricExtraUsages: Int?

    func recordPasscode(extraUsages: Int) {
        passcodeExtraUsages = extraUsages
    }

    func recordBiometrics(extraUsages: Int) {
        biometricExtraUsages = extraUsages
    }

    func reset() {
        passcodeExtraUsages = nil
        biometricExtraUsages = nil
    }
}

private enum RecordingAuthSupport: AuthSupportProtocol {
    static let usageRecorder = AuthUsageRecorder()

    static var status: AuthStatus {
        AuthStatus(
            requiresAuthorization: true,
            configuredMethods: [.passcode, .biometrics],
            authorizableMethods: [.passcode, .biometrics],
            configurableMethods: []
        )
    }

    static func setPasscode(_ passcode: String) async throws -> EnclaveToken {
        "passcode-token"
    }

    static func changePasscode(to newPasscode: String, using authorizationToken: EnclaveToken) async throws {
    }

    static func enableBiometrics(using authorizationToken: EnclaveToken) async throws -> EnclaveToken {
        "biometric-token"
    }

    static func disableBiometrics(using authorizationToken: EnclaveToken) async throws {
    }

    static func authorizeWithPasscode(
        _ passcode: String,
        sessionKind: AuthSessionKind,
        extraUsages: Int
    ) async throws -> EnclaveToken? {
        await usageRecorder.recordPasscode(extraUsages: extraUsages)
        return "passcode-token"
    }

    static func authorizeWithBiometrics(
        sessionKind: AuthSessionKind,
        extraUsages: Int
    ) async throws -> EnclaveToken? {
        await usageRecorder.recordBiometrics(extraUsages: extraUsages)
        return "biometric-token"
    }

    static var accountsSupportAppLock: Bool { true }
    static var cooldownRemaining: TimeInterval? { nil }
}
