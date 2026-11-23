// 緯度経度(HelperCore の GeoPoint)と MapKit の座標の行き来。

import CoreLocation
import HelperCore

extension GeoPoint {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(lat: coordinate.latitude, lng: coordinate.longitude)
    }
}
