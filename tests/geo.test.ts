import { expect, test } from "vitest";
import { polygonAreaM2 } from "../public/liff/geo.js";

// 美唄あたりで、緯度 1 度 ≒ 111,195m、経度 1 度 ≒ 111,195m × cos(43.33°)
const LAT = 43.33;
const LNG = 141.853;
const DEG_PER_M_LAT = 1 / 111_195;
const DEG_PER_M_LNG = 1 / (111_195 * Math.cos((LAT * Math.PI) / 180));

/** 美唄の (LAT, LNG) を左下の角にした、幅 w m・高さ h m の四角形。 */
function rectangle(w: number, h: number) {
  return [
    { lat: LAT, lng: LNG },
    { lat: LAT, lng: LNG + w * DEG_PER_M_LNG },
    { lat: LAT + h * DEG_PER_M_LAT, lng: LNG + w * DEG_PER_M_LNG },
    { lat: LAT + h * DEG_PER_M_LAT, lng: LNG },
  ];
}

test("10m × 20m の四角形はおよそ 200㎡", () => {
  // Arrange
  const points = rectangle(10, 20);

  // Act
  const area = polygonAreaM2(points);

  // Assert
  expect(area).toBeGreaterThan(199);
  expect(area).toBeLessThan(201);
});

test("点の順番が逆回りでも面積は同じ", () => {
  // Arrange
  const points = rectangle(10, 20);

  // Act & Assert
  expect(polygonAreaM2([...points].reverse())).toBeCloseTo(polygonAreaM2(points), 6);
});

test("点が 3 つ未満なら面積は 0", () => {
  // Arrange & Act & Assert
  expect(polygonAreaM2([])).toBe(0);
  expect(polygonAreaM2(rectangle(10, 20).slice(0, 2))).toBe(0);
});
