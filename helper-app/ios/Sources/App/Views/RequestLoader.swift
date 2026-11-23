// 依頼の詳細を読む・数秒ごとに読み直す(画面 3〜6 で共通)。

import Foundation

/// 読み直しの間隔(秒)。
enum Polling {
    static let intervalSeconds: UInt64 = 3
}

extension AppModel {
    /// 依頼の詳細を読む。読めなければ、画面に出す文を返す。
    func loadRequest(_ id: String) async -> Result<HelpRequest, ApiError> {
        do {
            return .success(try await api.request(id: id, userId: userId))
        } catch let error as ApiError {
            return .failure(error)
        } catch {
            return .failure(ApiError(message: error.localizedDescription))
        }
    }

    /// 止められるまで、数秒ごとに詳細を読み直して onUpdate を呼ぶ。onUpdate が true を返したら止める。
    func pollRequest(_ id: String, onUpdate: (HelpRequest) -> Bool, onError: (String) -> Void) async {
        while !Task.isCancelled {
            switch await loadRequest(id) {
            case .success(let request):
                if onUpdate(request) { return }
            case .failure(let error):
                onError("読み込めませんでした: \(error.message)")
            }
            try? await Task.sleep(nanoseconds: Polling.intervalSeconds * 1_000_000_000)
        }
    }
}
