// 向かっている若者の「到着の目安」の計算(純粋関数)。画面からもテストからも使う。
// 点は { lat: 緯度, lng: 経度 }。道のりではなく、まっすぐの距離で大まかに出す。

/** 地球の半径(m)。 */
const EARTH_RADIUS_M = 6_371_008.8;
/** 歩く速さ(km/h)。ふつうに歩く速さの目安(雪道ではもう少しかかることがある)。 */
export const WALKING_SPEED_KMH = 4.8;
const METERS_PER_MINUTE = (WALKING_SPEED_KMH * 1000) / 60;
const MS_PER_MINUTE = 60_000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * 2 点のまっすぐの距離(m)。地球を球とみなす計算(ハバーサイン公式)。
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function distanceM(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 到着までのおおよその分(まっすぐの距離 ÷ 歩く速さ 4.8km/h、切り上げ。最低 1 分)。
 * @param {number} meters
 * @returns {number}
 */
export function etaMinutes(meters) {
  return Math.max(1, Math.ceil(Math.max(0, meters) / METERS_PER_MINUTE));
}

/**
 * 位置が届いてからの分(切り捨て。時計のずれで先の時刻になっていても 0)。
 * @param {string} at 位置を受け取った時刻(ISO 形式)
 * @param {Date} now
 * @returns {number}
 */
export function minutesAgo(at, now) {
  const ms = now.getTime() - new Date(at).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / MS_PER_MINUTE)) : 0;
}

/** 「1 分前の位置」のような文。1 分未満は「たったいまの位置」。 */
export function locationAgeText(at, now) {
  const minutes = minutesAgo(at, now);
  return minutes === 0 ? "たったいまの位置" : `${minutes} 分前の位置`;
}

/**
 * お年寄りの画面に出す、若者 1 人の様子。
 * - arrived: 着いた / sharing: 位置あり(home があれば minutes に到着の目安)/ no-location: 位置の共有なし
 * @param {{ arrivedAt: string | null, location?: { lat: number, lng: number, at: string } }} helper
 * @param {{ lat: number, lng: number } | null} home お年寄りの家(依頼に位置がなければ null)
 * @param {Date} now
 */
export function helperProgress(helper, home, now) {
  if (helper.arrivedAt) return { kind: "arrived" };
  if (!helper.location) return { kind: "no-location" };
  const ageText = locationAgeText(helper.location.at, now);
  if (!home) return { kind: "sharing", minutes: null, ageText };
  return { kind: "sharing", minutes: etaMinutes(distanceM(helper.location, home)), ageText };
}

/**
 * from から to へ stepM(m)だけ近づいた点(テストで位置をまねる用)。残りが stepM 以下なら to。
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {number} stepM
 */
export function stepToward(from, to, stepM) {
  const remaining = distanceM(from, to);
  if (remaining <= stepM) return { lat: to.lat, lng: to.lng };
  const ratio = stepM / remaining;
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}
