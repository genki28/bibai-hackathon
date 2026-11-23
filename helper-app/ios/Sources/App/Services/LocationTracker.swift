// 位置を読む(CoreLocation)。画面を閉じても読み続けるように、裏での利用をオンにする。
// - 位置の許可は「常に」を求める(先に「使用中のみ」を聞き、そのあと「常に」を聞く。iOS の決まり)
// - allowsBackgroundLocationUpdates = true で、画面を閉じてもアプリが止まらない(スコップ計・送信・読み上げも続く)
// - 画面の上に青い表示が出る(showsBackgroundLocationIndicator)ので、使っていることが分かる

import CoreLocation
import Foundation
import HelperCore

@MainActor
final class LocationTracker: NSObject, CLLocationManagerDelegate {
    /// 読めた位置(緯度経度と誤差 m)。
    struct Fix {
        let point: GeoPoint
        let accuracy: Double?
    }

    private let manager = CLLocationManager()
    private(set) var isRunning = false
    var onFix: ((Fix) -> Void)?
    var onFailure: ((String) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            beginUpdates()
        case .authorizedAlways:
            beginUpdates()
        default:
            onFailure?("位置の利用が許可されていません(設定アプリで「常に」にしてください)")
        }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
    }

    private func beginUpdates() {
        guard isRunning else { return }
        // Info.plist の UIBackgroundModes に location がないと、ここで止まる(落ちる)ので、必ず入れておく
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse:
                // 「使用中のみ」のあとで「常に」を聞く。断られても、使用中のみのまま裏で読める(青い表示が出る)
                self.manager.requestAlwaysAuthorization()
                self.beginUpdates()
            case .authorizedAlways:
                self.beginUpdates()
            case .denied, .restricted:
                if self.isRunning { self.onFailure?("位置を取得できませんでした(位置の利用が許可されていません)") }
            default:
                break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        let fix = Fix(
            point: GeoPoint(lat: last.coordinate.latitude, lng: last.coordinate.longitude),
            accuracy: last.horizontalAccuracy >= 0 ? last.horizontalAccuracy : nil
        )
        Task { @MainActor in self.onFix?(fix) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // 一時的に取れないこと(屋内など)はよくある。読み続けて、次に取れた位置を使う
        let isDenied = (error as? CLError)?.code == .denied
        Task { @MainActor in
            if isDenied { self.onFailure?("位置を取得できませんでした") }
        }
    }
}
