extension ApiUpdate {
    public struct DappRequestSettled: Equatable, Hashable, Decodable, Sendable {
        public let type: String
        public let promiseId: String
        public let returnStrategy: ReturnStrategy
        public let error: ApiAnyDisplayError?
    }
}
