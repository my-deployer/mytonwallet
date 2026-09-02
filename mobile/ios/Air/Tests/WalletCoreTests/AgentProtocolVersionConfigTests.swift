import Foundation
import Testing
import WalletCoreTypes
@testable import WalletCore

@Suite("Agent Protocol Version Config", .serialized)
struct AgentProtocolVersionConfigTests {

    private func setConfig(json: String?) throws {
        if let json {
            ConfigStore.shared.config = try JSONDecoder().decode(ApiUpdate.UpdateConfig.self, from: Data(json.utf8))
        } else {
            ConfigStore.shared.config = nil
        }
    }

    @Test
    func `v2 is available through the config store`() throws {
        defer { ConfigStore.shared.config = nil }

        try setConfig(json: #"{"agentProtocolVersion": "v2"}"#)

        #expect(ConfigStore.shared.agentProtocolVersion == .v2)
    }

    @Test(arguments: [
        #"{}"#,
        #"{"agentProtocolVersion": "v3"}"#,
    ])
    func `missing or unsupported versions fall back to v1`(json: String) throws {
        defer { ConfigStore.shared.config = nil }

        try setConfig(json: json)

        #expect(ConfigStore.shared.agentProtocolVersion == .v1)
    }

    @Test
    func `cached config drops the agent protocol version`() throws {
        let fetched = try JSONDecoder().decode(
            ApiUpdate.UpdateConfig.self,
            from: Data(#"{"agentProtocolVersion": "v2"}"#.utf8)
        )
        let restored = try JSONDecoder().decode(
            ApiUpdate.UpdateConfig.self,
            from: JSONEncoder().encode(ConfigStore.cacheableConfig(fetched))
        )

        #expect(restored.agentProtocolVersion == nil)
    }
}
