import Foundation
import WalletContext

@MainActor
public enum AgentV2LegacyWidgetCleanup {
    private static let cleanupVersion = 1
    private static let cleanupVersionKey = "agent-v2-legacy-widget-cleanup-version"
    private static let encryptionKey = "agent-v2-data-card-aes-gcm-v1"
    private static let deviceIdKey = "agent-v2-data-card-device-id-v1"
    private static let authorityDefaultsKey = "agent-v2-data-card-authority-v1"
    private static let legacyIndexName = "data-card-index.json"

    public static func run() {
        run(
            fileManager: .default,
            cachesDirectory: nil,
            userDefaults: .standard,
            removeLegacyCredentials: {
                let keychain = KeychainWrapper.standard
                _ = keychain.removeObject(
                    forKey: encryptionKey,
                    withAccessibility: .whenUnlockedThisDeviceOnly
                )
                _ = keychain.removeObject(
                    forKey: deviceIdKey,
                    withAccessibility: .whenUnlockedThisDeviceOnly
                )
            }
        )
    }

    static func run(
        fileManager: FileManager,
        cachesDirectory: URL?,
        userDefaults: UserDefaults,
        removeLegacyCredentials: () -> Void
    ) {
        guard userDefaults.integer(forKey: cleanupVersionKey) < cleanupVersion else { return }
        let caches = cachesDirectory
            ?? fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
        guard let caches, removeLegacyDataCardFiles(fileManager: fileManager, cachesDirectory: caches) else {
            return
        }
        removeLegacyCredentials()
        userDefaults.removeObject(forKey: authorityDefaultsKey)
        userDefaults.set(cleanupVersion, forKey: cleanupVersionKey)
    }

    private static func removeLegacyDataCardFiles(
        fileManager: FileManager,
        cachesDirectory: URL
    ) -> Bool {
        let directory = cachesDirectory.appendingPathComponent("air/agent-v2", isDirectory: true)
        guard fileManager.fileExists(atPath: directory.path) else { return true }
        do {
            let contents = try fileManager.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles]
            )
            for url in contents where url.lastPathComponent == legacyIndexName || url.pathExtension == "card" {
                let isDirectory = try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true
                if !isDirectory { try fileManager.removeItem(at: url) }
            }
            return true
        } catch {
            return false
        }
    }
}
