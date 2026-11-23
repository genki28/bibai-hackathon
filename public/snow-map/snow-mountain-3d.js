// 美唄の雪山マップの「3D の雪山」(Three.js を MapLibre の custom layer として地図に重ねる)。
// - 雪山の形はプログラムで作る: すその広い山(mountainProfile)を、種ごとに違うノイズ(snowNoise)でふくらませ・へこませる
// - 150 個でも重くならないように、形は VARIANT_COUNT 種類だけ作り、InstancedMesh で使い回す(雪山ごとに向き・縦横の比を変える)
// - 白い雪(少し青い影・てっぺんに少しきらめき)。光は空の明るさ(HemisphereLight)+ 太陽(DirectionalLight)。地面に薄い影
// - 開いたときに下から育つ。押した雪山は pick(画面の点)で選ぶ
// 大きさ・ノイズなどの計算は snow-mountain.js(テストあり)。地図の画面は snow-map.js。
// Three.js(MIT ライセンス・登録不要)は jsdelivr から読む。

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.min.js";
import {
  growProgress,
  mountainProfile,
  mountainSize,
  pickMountain,
  seedFromId,
  seededUnit,
  snowNoise,
  toLocalMeters,
} from "./snow-mountain.js";

/** 形の種類の数と、1 つの形の細かさ(輪の数 × 1 周の点の数)。 */
const VARIANT_COUNT = 6;
const RINGS = 14;
const SEGMENTS = 36;
/** でこぼこの強さ(すその広がりの揺れ・高さの揺れ・小さなこぶ)。 */
const NOISE_RADIUS = 0.16;
const NOISE_HEIGHT = 0.14;
const NOISE_LUMP = 0.05;
/** 雪山ごとの縦横の比の揺れ(0.12 = ±12%)。 */
const ASPECT_JITTER = 0.12;
/** 色: てっぺんの白と、すその少し青い影。きらめく点は明るく(1 を超える = まわりより光る)。 */
const SNOW_TOP = new THREE.Color(1, 1, 1);
const SNOW_SHADE = new THREE.Color(0.8, 0.87, 0.96);
const SPARKLE_BRIGHTNESS = 1.45;
const SPARKLE_RATE = 0.06;
/** 太陽の向き(x = 東、y = 北、z = 上。南西の空から照らす)と、影がずれる向き(太陽の反対)。 */
const SUN_DIRECTION = Object.freeze({ x: -0.6, y: -0.9, z: 1.2 });
const SHADOW_SHIFT = 0.28;
const SHADOW_SIZE = 1.35;
const SHADOW_LIFT_M = 0.5;
/** 高さ 0 の形は光の計算がこわれるので、育ち始めでもほんの少しだけ高さを持たせる。 */
const MIN_GROW = 0.001;

/** 種 seed の雪山の形(半径 1・高さ 1)。 */
function createMountainGeometry(seed) {
  const positions = [0, 0, 1];
  const colors = [SNOW_TOP.r, SNOW_TOP.g, SNOW_TOP.b];
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const u = ring / RINGS;
    // 真ん中とすそでは揺らさず、中ほどで大きく揺らす
    const middle = Math.sin(Math.PI * u);
    for (let s = 0; s < SEGMENTS; s += 1) {
      const angle = (s / SEGMENTS) * Math.PI * 2;
      const r = u * (1 + NOISE_RADIUS * snowNoise(seed, angle, u));
      const lump = NOISE_LUMP * snowNoise(seed + 13, angle * 3, u * 3) * middle;
      const h = Math.max(0, mountainProfile(u) * (1 + NOISE_HEIGHT * snowNoise(seed + 7, angle, u) * middle) + lump);
      positions.push(Math.cos(angle) * r, Math.sin(angle) * r, h);
      const color = SNOW_SHADE.clone().lerp(SNOW_TOP, Math.min(1, h ** 0.6));
      const isSparkle = h > 0.35 && seededUnit(seed, ring * SEGMENTS + s) < SPARKLE_RATE;
      const k = isSparkle ? SPARKLE_BRIGHTNESS : 1;
      colors.push(color.r * k, color.g * k, color.b * k);
    }
  }
  const at = (ring, s) => 1 + (ring - 1) * SEGMENTS + (s % SEGMENTS);
  const indices = [];
  for (let s = 0; s < SEGMENTS; s += 1) indices.push(0, at(1, s), at(1, s + 1));
  for (let ring = 1; ring < RINGS; ring += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      indices.push(at(ring, s), at(ring + 1, s), at(ring + 1, s + 1));
      indices.push(at(ring, s), at(ring + 1, s + 1), at(ring, s + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 地面に落ちる薄い影(まんなかが濃く、ふちに向かって消える円)。 */
function createShadowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(40, 60, 95, 0.38)");
  gradient.addColorStop(0.6, "rgba(40, 60, 95, 0.18)");
  gradient.addColorStop(1, "rgba(40, 60, 95, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createScene(capacity) {
  const scene = new THREE.Scene();
  const sky = new THREE.HemisphereLight(0xe6f1ff, 0x8fa6c4, 1.6);
  sky.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.2);
  sun.position.set(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  scene.add(sky, sun);

  const snow = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.7,
    metalness: 0,
    emissive: 0x1c2a3d,
    emissiveIntensity: 0.35,
  });
  const meshes = Array.from({ length: VARIANT_COUNT }, (_, variant) => {
    const mesh = new THREE.InstancedMesh(createMountainGeometry(variant * 101 + 17), snow, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    return mesh;
  });
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: createShadowTexture(), transparent: true, depthWrite: false });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), shadowMaterial, capacity);
  shadows.count = 0;
  shadows.frustumCulled = false;
  shadows.renderOrder = 0;
  scene.add(shadows);
  return { scene, meshes, shadows };
}

/** 雪山 1 つぶんの、変わらない値(位置・種・形の種類・向き・縦横の比・大きさ)。 */
function describePile(pile, origin, index) {
  const seed = seedFromId(pile.id);
  const { x, y } = toLocalMeters(origin, pile);
  return {
    pile,
    index,
    x,
    y,
    variant: seed % VARIANT_COUNT,
    rotation: seededUnit(seed, 1) * Math.PI * 2,
    aspect: 1 + (seededUnit(seed, 2) * 2 - 1) * ASPECT_JITTER,
    size: mountainSize(pile, 1),
  };
}

/**
 * 雪山の 3D のレイヤーを作る。
 * @param {{ id: string, origin: { lat: number, lng: number }, mercatorFromLngLat: (lngLat: [number, number]) => { x: number, y: number, z: number, meterInMercatorCoordinateUnits: () => number } }} options
 */
export function createSnowMountainLayer({ id, origin, mercatorFromLngLat }) {
  let map = null;
  let renderer = null;
  let parts = null;
  let capacity = 0;
  let items = [];
  let scale = 1;
  let growStartedAt = 0;
  let growMs = 0;
  let staggerMs = 0;
  let isDirty = true;
  const camera = new THREE.Camera();
  const projection = new THREE.Matrix4();
  const originMercator = mercatorFromLngLat([origin.lng, origin.lat]);
  const metersToMercator = originMercator.meterInMercatorCoordinateUnits();
  const localToMercator = new THREE.Matrix4()
    .makeTranslation(originMercator.x, originMercator.y, originMercator.z)
    .scale(new THREE.Vector3(metersToMercator, -metersToMercator, metersToMercator));

  const progressOf = (item, now) => Math.max(MIN_GROW, growProgress(now - growStartedAt, item.index, growMs, staggerMs));
  const isGrowing = (now) => now - growStartedAt < growMs + items.length * staggerMs;

  /** 雪山ごとの置き方(位置・向き・大きさ)を、育ち具合と見た目の倍率に合わせて入れ直す。 */
  const updateInstances = (now) => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const size = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const counts = new Array(VARIANT_COUNT).fill(0);
    items.forEach((item, i) => {
      const progress = progressOf(item, now);
      const radius = item.size.radiusM * scale;
      const height = item.size.heightM * scale * progress;
      turn.setFromAxisAngle(zAxis, item.rotation);
      matrix.compose(position.set(item.x, item.y, 0), turn, size.set(radius * item.aspect, radius / item.aspect, height));
      const mesh = parts.meshes[item.variant];
      mesh.setMatrixAt(counts[item.variant], matrix);
      counts[item.variant] += 1;
      // 影は太陽の反対側に少しずらし、育つのに合わせて広げる
      const shadowRadius = radius * SHADOW_SIZE * Math.sqrt(progress);
      const shift = height * SHADOW_SHIFT;
      matrix.compose(
        position.set(item.x - SUN_DIRECTION.x * shift, item.y - SUN_DIRECTION.y * shift, SHADOW_LIFT_M * scale),
        turn.identity(),
        size.set(shadowRadius, shadowRadius, 1),
      );
      parts.shadows.setMatrixAt(i, matrix);
    });
    parts.meshes.forEach((mesh, variant) => {
      mesh.count = counts[variant];
      mesh.instanceMatrix.needsUpdate = true;
    });
    parts.shadows.count = items.length;
    parts.shadows.instanceMatrix.needsUpdate = true;
  };

  const layer = {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(nextMap, gl) {
      map = nextMap;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, args) {
      if (!renderer || !parts) return;
      // MapLibre の新しい版は args.defaultProjectionData.mainMatrix、古い版は args そのものが行列
      const main = args?.defaultProjectionData?.mainMatrix ?? args;
      projection.fromArray(main).multiply(localToMercator);
      camera.projectionMatrix.copy(projection);
      camera.projectionMatrixInverse.copy(projection).invert();
      const now = performance.now();
      const growing = isGrowing(now);
      if (growing || isDirty) updateInstances(now);
      isDirty = false;
      renderer.resetState();
      renderer.render(parts.scene, camera);
      if (growing) map.triggerRepaint();
    },
    onRemove() {
      renderer?.dispose();
    },
  };

  /** 地元の座標(m)→ 画面の点(CSS ピクセル)。カメラの後ろなら null。 */
  const toScreen = (x, y, z) => {
    const canvas = map?.getCanvas();
    if (!canvas) return null;
    const v = new THREE.Vector4(x, y, z, 1).applyMatrix4(projection);
    if (v.w <= 0) return null;
    return { x: ((v.x / v.w + 1) / 2) * canvas.clientWidth, y: ((1 - v.y / v.w) / 2) * canvas.clientHeight };
  };

  return {
    layer,
    /** 表示する雪山を入れ替えて、下から育て直す(growMs = 育つ時間、staggerMs = 1 つずつずらす間)。 */
    setPiles(piles, options) {
      if (piles.length > capacity) {
        parts?.scene.traverse((node) => node.dispose?.());
        capacity = Math.max(piles.length, capacity * 2, 16);
        parts = createScene(capacity);
      }
      items = piles.map((pile, i) => describePile(pile, origin, i));
      growStartedAt = performance.now();
      growMs = options.growMs;
      staggerMs = options.staggerMs;
      isDirty = true;
      map?.triggerRepaint();
    },
    /** 見た目の大きさの倍率(引いて見たときに大きくする)。 */
    setScale(nextScale) {
      if (nextScale === scale) return;
      scale = nextScale;
      isDirty = true;
      map?.triggerRepaint();
    },
    /** 画面の点(CSS ピクセル)にある雪山(なければ null)。 */
    pick(point) {
      const now = performance.now();
      const candidates = items.flatMap((item) => {
        const radius = item.size.radiusM * scale;
        const base = toScreen(item.x, item.y, 0);
        const peak = toScreen(item.x, item.y, item.size.heightM * scale * progressOf(item, now));
        const edge = toScreen(item.x + radius * 0.7, item.y, 0);
        if (!base || !peak || !edge) return [];
        return [{ item: item.pile, base, peak, radiusPx: Math.hypot(edge.x - base.x, edge.y - base.y) }];
      });
      return pickMountain(point, candidates);
    },
  };
}
