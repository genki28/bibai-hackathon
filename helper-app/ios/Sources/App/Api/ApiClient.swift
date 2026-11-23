// サーバーの API の呼び出し(ここ 1 か所にまとめる)。
// 返事はすべて { success: true, data } か { success: false, error: "日本語" }。失敗したら error を画面に出す。
// サーバーの URL は Info.plist の BibaiApiBase。手元のサーバーで試すときは、起動の引数 `-BibaiApiBase http://localhost:3000` で変えられる。

import Foundation

/// API の失敗(画面にそのまま出せる日本語)。
struct ApiError: LocalizedError, Equatable {
    let message: String
    var errorDescription: String? { message }
}

private struct Envelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
}

private struct ErrorOnly: Decodable {
    let error: String?
}

final class ApiClient: Sendable {
    static let shared = ApiClient()

    private let baseURL: URL
    private let session: URLSession
    private static let fallbackBase = "https://bibai-yukikaki.gba-to-web-slide.workers.dev"
    private static let timeoutSeconds: TimeInterval = 15

    init(baseURL: URL = ApiClient.configuredBase(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /// 起動の引数(UserDefaults)→ Info.plist の順に、サーバーの URL を決める。
    static func configuredBase() -> URL {
        let override = UserDefaults.standard.string(forKey: "BibaiApiBase")
        let plist = Bundle.main.object(forInfoDictionaryKey: "BibaiApiBase") as? String
        let text = [override, plist].compactMap { $0 }.first { $0.hasPrefix("http") } ?? fallbackBase
        return URL(string: text.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) ?? URL(string: fallbackBase)!
    }

    // MARK: - 依頼

    func activeRequest(userId: String) async throws -> HelpRequest? {
        try await get("/api/help-requests/active/\(userId)", as: HelpRequest?.self)
    }

    func listRequests() async throws -> [HelpRequest] {
        try await get("/api/help-requests", as: [HelpRequest].self)
    }

    func request(id: String, userId: String) async throws -> HelpRequest {
        try await get("/api/help-requests/\(id)", query: ["userId": userId], as: HelpRequest.self)
    }

    func join(id: String, userId: String, displayName: String) async throws -> HelpRequest {
        try await post(id, "join", ["userId": userId, "displayName": displayName])
    }

    func leave(id: String, userId: String) async throws -> HelpRequest {
        try await post(id, "leave", ["userId": userId])
    }

    func arrive(id: String, userId: String) async throws -> HelpRequest {
        try await post(id, "arrive", ["userId": userId])
    }

    func start(id: String, userId: String) async throws -> HelpRequest {
        try await post(id, "start", ["userId": userId])
    }

    func finish(id: String, userId: String, areaM2: Int) async throws -> HelpRequest {
        try await post(id, "finish", ["userId": userId, "areaM2": areaM2])
    }

    func sendScoops(id: String, userId: String, count: Int, calories: Int) async throws -> HelpRequest {
        try await post(id, "scoops", ["userId": userId, "count": count, "calories": calories])
    }

    func sendLocation(id: String, userId: String, lat: Double, lng: Double, accuracy: Double?) async throws -> HelpRequest {
        var body: [String: Any] = ["userId": userId, "lat": lat, "lng": lng]
        if let accuracy { body["accuracy"] = accuracy }
        return try await post(id, "location", body)
    }

    func arrivalCode(id: String, userId: String) async throws -> String {
        try await get("/api/help-requests/\(id)/arrival-code", query: ["userId": userId], as: ArrivalCode.self).code
    }

    /// 自分が入ったチームと、消費カロリーの合計(チームの記録)。
    func myTeams(userId: String) async throws -> MyTeams {
        try await get("/api/teams/mine/\(userId)", as: MyTeams.self)
    }

    /// 本人確認が済んでいるか。
    func identityStatus(userId: String) async throws -> IdentityStatus {
        try await get("/api/identity/\(userId)", as: IdentityStatus.self)
    }

    /// サーバーの上の Web の画面の URL(本人確認・雪山マップ)。
    func webURL(_ path: String, query: [String: String] = [:]) -> URL? {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        return components?.url
    }

    // MARK: - 共通

    private func post(_ id: String, _ action: String, _ body: [String: Any]) async throws -> HelpRequest {
        try await send(path: "/api/help-requests/\(id)/\(action)", method: "POST", body: body, as: HelpRequest.self)
    }

    private func get<T: Decodable>(_ path: String, query: [String: String] = [:], as type: T.Type) async throws -> T {
        try await send(path: path, method: "GET", query: query, body: nil, as: type)
    }

    private func send<T: Decodable>(
        path: String,
        method: String,
        query: [String: String] = [:],
        body: [String: Any]?,
        as type: T.Type
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = components?.url else { throw ApiError(message: "送り先の URL がおかしいです。") }
        var request = URLRequest(url: url, timeoutInterval: Self.timeoutSeconds)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ApiError(message: "サーバーにつながりませんでした。電波を確かめてください。")
        }
        return try Self.decode(data, status: (response as? HTTPURLResponse)?.statusCode ?? 0, as: type)
    }

    static func decode<T: Decodable>(_ data: Data, status: Int, as type: T.Type) throws -> T {
        let decoder = JSONDecoder()
        guard let envelope = try? decoder.decode(Envelope<T>.self, from: data) else {
            let message = (try? decoder.decode(ErrorOnly.self, from: data))?.error
            throw ApiError(message: message ?? "サーバーの返事を読めませんでした(\(status))。")
        }
        guard envelope.success else { throw ApiError(message: envelope.error ?? "うまくいきませんでした。") }
        if let value = envelope.data { return value }
        // data が null(続きがない など)のときは、Optional の型ならそのまま nil を返す
        if let optionalType = T.self as? NilRepresentable.Type, let empty = optionalType.emptyValue as? T { return empty }
        throw ApiError(message: "サーバーの返事が空でした。")
    }
}

/// 「空(nil)」を作れる型(Optional)。data が null の返事を受けるため。
private protocol NilRepresentable {
    static var emptyValue: Any { get }
}

extension Optional: NilRepresentable {
    fileprivate static var emptyValue: Any { Optional<Wrapped>.none as Any }
}
