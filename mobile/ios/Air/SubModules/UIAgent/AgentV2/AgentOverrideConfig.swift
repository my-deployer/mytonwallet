import Foundation
import WalletCore

struct AgentOverrideConfig: Equatable {
    enum Value: String, CaseIterable, Decodable {
        case noOverride = "no_override"
        case v1
        case v2
    }

    let value: Value

    static var current: AgentOverrideConfig {
        let url = Bundle.main.url(
            forResource: "agent-override-config",
            withExtension: "json",
            subdirectory: "JS"
        )
        return resolve(data: url.flatMap { try? Data(contentsOf: $0) })
    }

    static func resolve(data: Data?) -> AgentOverrideConfig {
        guard
            let data,
            let payload = try? JSONDecoder().decode(Payload.self, from: data)
        else {
            return AgentOverrideConfig(value: .v1)
        }
        return AgentOverrideConfig(value: payload.value)
    }

    func resolve(backendVersion: ApiUpdate.UpdateConfig.AgentProtocolVersion) -> ApiUpdate.UpdateConfig.AgentProtocolVersion {
        switch value {
        case .noOverride:
            backendVersion
        case .v1:
            .v1
        case .v2:
            .v2
        }
    }

    private struct Payload: Decodable {
        let value: Value

        private enum CodingKeys: String, CodingKey {
            case value = "override"
        }
    }
}
