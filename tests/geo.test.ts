import { describe, expect, test } from "vitest";
import {
  edgeMidpoints,
  insertPointAt,
  midpoint,
  movePointAt,
  polygonAreaM2,
  removePointAt,
  squareAround,
} from "../public/liff/geo.js";

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

const A = { lat: 1, lng: 10 };
const B = { lat: 2, lng: 20 };
const C = { lat: 3, lng: 30 };

describe("polygonAreaM2(面積)", () => {
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
});

describe("squareAround(四角で始める)", () => {
  test("10m の四角形は 4 つの角で、面積はおよそ 100㎡", () => {
    // Arrange
    const center = { lat: LAT, lng: LNG };

    // Act
    const square = squareAround(center, 10);

    // Assert
    expect(square).toHaveLength(4);
    expect(polygonAreaM2(square)).toBeGreaterThan(99);
    expect(polygonAreaM2(square)).toBeLessThan(101);
  });

  test("四角形の真ん中は、渡した中心と同じ", () => {
    // Arrange
    const center = { lat: LAT, lng: LNG };

    // Act
    const square = squareAround(center, 10);

    // Assert
    const meanLat = square.reduce((sum, p) => sum + p.lat, 0) / square.length;
    const meanLng = square.reduce((sum, p) => sum + p.lng, 0) / square.length;
    expect(meanLat).toBeCloseTo(LAT, 9);
    expect(meanLng).toBeCloseTo(LNG, 9);
  });
});

describe("midpoint / edgeMidpoints(辺の真ん中のつまみ)", () => {
  test("2 点の真ん中を返す", () => {
    // Arrange & Act
    const middle = midpoint(A, C);

    // Assert
    expect(middle).toEqual({ lat: 2, lng: 20 });
  });

  test("3 点以上なら、最後の点から最初の点へ戻る辺も含めて辺の数だけ返す", () => {
    // Arrange
    const points = [A, B, C];

    // Act
    const mids = edgeMidpoints(points);

    // Assert
    expect(mids).toEqual([
      { insertAt: 1, point: midpoint(A, B) },
      { insertAt: 2, point: midpoint(B, C) },
      { insertAt: 3, point: midpoint(C, A) },
    ]);
  });

  test("2 点なら 1 本の辺の真ん中だけ、1 点以下なら何も返さない", () => {
    // Arrange & Act & Assert
    expect(edgeMidpoints([A, B])).toEqual([{ insertAt: 1, point: midpoint(A, B) }]);
    expect(edgeMidpoints([A])).toEqual([]);
    expect(edgeMidpoints([])).toEqual([]);
  });
});

describe("点の追加・移動・削除(元の配列は変えない)", () => {
  test("insertPointAt は指定した場所に点を差し込んだ新しい配列を返す", () => {
    // Arrange
    const points = [A, C];

    // Act
    const result = insertPointAt(points, 1, B);

    // Assert
    expect(result).toEqual([A, B, C]);
    expect(points).toEqual([A, C]);
  });

  test("movePointAt は指定した点だけを動かした新しい配列を返す", () => {
    // Arrange
    const points = [A, B, C];
    const moved = { lat: 9, lng: 99 };

    // Act
    const result = movePointAt(points, 1, moved);

    // Assert
    expect(result).toEqual([A, moved, C]);
    expect(points).toEqual([A, B, C]);
  });

  test("removePointAt は指定した点を除いた新しい配列を返す", () => {
    // Arrange
    const points = [A, B, C];

    // Act
    const result = removePointAt(points, 0);

    // Assert
    expect(result).toEqual([B, C]);
    expect(points).toEqual([A, B, C]);
  });
});
