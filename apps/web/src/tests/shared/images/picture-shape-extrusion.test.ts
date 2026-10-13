// @vitest-environment node
import { expect, test } from "vitest";
import { evaluateShapePreset, type ShapePresetGeometry } from "@sheetcraft/core/shape-presets";
import {
  createPictureProjectiveGeometry,
  hitPictureProjectiveFront,
} from "../../../shared/images/picture-projective-geometry";
import {
  createPictureShapeExtrusion,
  getPictureShapeExtrusionBounds,
  projectPictureShapePoint,
} from "../../../shared/images/picture-shape-extrusion";

const rotation = {
  projection: "parallel" as const,
  xDeg: 35,
  yDeg: 20,
  zDeg: 0,
  distanceFromGroundPx: 0,
};
function geometry(depthPx = 8) {
  return createPictureProjectiveGeometry({ widthPx: 64, heightPx: 64, depthPx, rotation });
}
function rectangle(left: number, top: number, right: number, bottom: number) {
  return {
    filled: true,
    stroke: true,
    commands: [
      ["M", left, top],
      ["L", right, top],
      ["L", right, bottom],
      ["L", left, bottom],
      ["Z"],
    ] as const,
  };
}
test("ellipse extrusion uses curved side facets and unit shape-boundary normals", () => {
  const result = createPictureShapeExtrusion(
    geometry(),
    evaluateShapePreset({ preset: "ellipse" }, 64, 64),
    1,
  );
  expect(result.sides.length).toBeGreaterThan(10);
  expect(result.sides.length).toBeLessThan(4096);
  for (const side of result.sides)
    expect(Math.hypot(side.normal.x, side.normal.y, side.normal.z)).toBeCloseTo(1, 10);
  expect(result.connectors.length).toBeLessThan(8);
});
test("donut preserves independently wound hole contours and inner wall sides", () => {
  const result = createPictureShapeExtrusion(
    geometry(),
    evaluateShapePreset({ preset: "donut" }, 64, 64),
    1,
  );
  expect(result.fillPaths).toHaveLength(1);
  expect(result.fillPaths[0]).toHaveLength(2);
  expect(result.sides.length).toBeGreaterThan(30);
  expect(result.backFill[0]).toHaveLength(2);
});
test("overlapping filled paths split intersections and discard the union's hidden internal edges", () => {
  const shape: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [rectangle(0, 0, 40, 40), rectangle(24, 24, 64, 64)],
  };
  const g = geometry(),
    result = createPictureShapeExtrusion(g, shape, 1);
  for (const side of result.sides) {
    const a = hitPictureProjectiveFront(g, side.corners[0]);
    const b = hitPictureProjectiveFront(g, side.corners[3]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const internalRight =
      Math.abs(a!.x - 40) < 1e-7 && Math.abs(b!.x - 40) < 1e-7 && Math.min(a!.y, b!.y) >= 24 - 1e-7;
    const internalBottom =
      Math.abs(a!.y - 40) < 1e-7 && Math.abs(b!.y - 40) < 1e-7 && Math.min(a!.x, b!.x) >= 24 - 1e-7;
    expect(internalRight || internalBottom).toBe(false);
  }
});
test("Arc's filled sector extrudes implicit closure but its actual stroke stays open", () => {
  const shape = evaluateShapePreset({ preset: "arc" }, 64, 64),
    result = createPictureShapeExtrusion(geometry(), shape, 1);
  expect(shape.paths.some((path) => path.filled && !path.stroke)).toBe(true);
  expect(result.sides.length).toBeGreaterThan(0);
  for (const edge of result.frontStroke) {
    const a = hitPictureProjectiveFront(geometry(), edge.a),
      b = hitPictureProjectiveFront(geometry(), edge.b);
    expect(Math.hypot(a!.x - 32, a!.y - 32)).toBeGreaterThan(25);
    expect(Math.hypot(b!.x - 32, b!.y - 32)).toBeGreaterThan(25);
  }
});
test("logical density and out-of-frame callout tails participate in guarded side bounds", () => {
  const shape = evaluateShapePreset({ preset: "wedgeRectCallout" }, 32, 32);
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 0, yDeg: 0 },
  });
  const bounds = getPictureShapeExtrusionBounds(g, shape, 2),
    result = createPictureShapeExtrusion(g, shape, 2);
  expect(bounds.bottom).toBeGreaterThan(64);
  expect(result.frontStroke.some((edge) => edge.a.y > 64 || edge.b.y > 64)).toBe(true);
  expect(g.selectionBounds.bottom).toBe(64);
  expect(() => createPictureShapeExtrusion(g, shape, 1)).toThrow(/match/);
});
test("shape tails approaching the horizon reject before any raster allocation", () => {
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 45, yDeg: 0, projection: "perspective", perspectiveDeg: 90 },
  });
  const shape: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [rectangle(0, 0, 1000, 64)],
  };
  expect(() => getPictureShapeExtrusionBounds(g, shape, 1)).toThrow(/near plane/);
  expect(() => createPictureShapeExtrusion(g, shape, 1)).toThrow(/near plane/);
});
test("invalid path counts, numeric commands and oversized flattening reject within budgets", () => {
  const good = evaluateShapePreset({ preset: "ellipse" }, 64, 64);
  expect(() =>
    createPictureShapeExtrusion(
      geometry(),
      { ...good, paths: Array.from({ length: 17 }, () => good.paths[0]!) },
      1,
    ),
  ).toThrow(/path budget/);
  expect(() =>
    createPictureShapeExtrusion(
      geometry(),
      {
        ...good,
        paths: [
          {
            filled: true,
            stroke: true,
            commands: [
              ["M", Number.NaN, 0],
              ["L", 64, 64],
            ],
          },
        ],
      },
      1,
    ),
  ).toThrow();
  const huge = createPictureProjectiveGeometry({
    widthPx: 65536,
    heightPx: 65536,
    depthPx: 8,
    rotation,
  });
  const ellipse: ShapePresetGeometry = {
    width: 65536,
    height: 65536,
    handles: [],
    adjustments: {},
    paths: [
      {
        filled: true,
        stroke: true,
        commands: [["M", 65536, 32768], ["A", 32768, 32768, 32768, 32768, 0, 2 * Math.PI], ["Z"]],
      },
    ],
  };
  expect(() => createPictureShapeExtrusion(huge, ellipse, 1)).toThrow(/bounded curve error/);
});
test("pure bounds performs the same curve preflight as extrusion construction", () => {
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 1,
    rotation: {
      ...rotation,
      xDeg: 0,
      yDeg: 0,
      projection: "perspective",
      perspectiveDeg: 120,
      distanceFromGroundPx: 70,
    },
  });
  const shape = evaluateShapePreset({ preset: "ellipse" }, 64, 64);
  expect(() => getPictureShapeExtrusionBounds(g, shape, 1)).toThrow(/subdivision precision/);
});
test("bounded content-keyed geometry reuse is immutable and cannot reuse edited paths", () => {
  const shape = evaluateShapePreset({ preset: "ellipse" }, 64, 64),
    g = geometry();
  const first = createPictureShapeExtrusion(g, shape, 1);
  const same = createPictureShapeExtrusion(g, structuredClone(shape), 1);
  expect(same).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.sides)).toBe(true);
  expect(Object.isFrozen(first.frontStroke[0]!.a)).toBe(true);
  const changed = { ...shape, paths: shape.paths.map((path) => ({ ...path })) };
  changed.paths[0]!.stroke = false;
  const next = createPictureShapeExtrusion(g, changed, 1);
  expect(next).not.toBe(first);
  expect(next.frontStroke).toHaveLength(0);
  expect(first.frontStroke.length).toBeGreaterThan(0);
});

const affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
test("reflected source and explicit output preserve the same visible physical contour side", () => {
  const input = {
    widthPx: 64,
    heightPx: 64,
    depthPx: 24,
    rotation: { ...rotation, xDeg: 30, yDeg: 0 },
    scene: { widthPx: 400, heightPx: 160, sourceToScene: { ...affine, a: -1, e: 300, f: 30 } },
  };
  const local = createPictureProjectiveGeometry(input);
  const common = createPictureProjectiveGeometry({
    ...input,
    scene: { ...input.scene, sceneToOutput: affine },
  });
  const shape = evaluateShapePreset({ preset: "rect" }, 64, 64);
  const localSolid = createPictureShapeExtrusion(local, shape, 1),
    commonSolid = createPictureShapeExtrusion(common, shape, 1);
  expect(local.projectedOrientation).toBe(1);
  expect(common.projectedOrientation).toBe(-1);
  expect(localSolid.sides).toHaveLength(1);
  expect(commonSolid.sides).toHaveLength(1);
  expect(commonSolid.sides[0]!.normal).toEqual(localSolid.sides[0]!.normal);
  const physical = common.sides.find((side) => side.kind === "left")!;
  expect(commonSolid.sides[0]!.normal.x).toBeCloseTo(physical.normal.x, 10);
  expect(commonSolid.sides[0]!.normal.z).toBeCloseTo(physical.normal.z, 10);
  expect(commonSolid.sides[0]!.normal.z).toBeGreaterThan(0);
  expect(commonSolid.sides[0]!.depthOrigin).toBe(localSolid.sides[0]!.depthOrigin);
});

test("sheared scene contour normals use the physical inverse transpose, never output coordinates", () => {
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 24,
    rotation: { ...rotation, zDeg: 17 },
    scene: { widthPx: 500, heightPx: 300, sourceToScene: { a: 2, b: 0, c: 1, d: 1, e: 80, f: 25 } },
  });
  const solid = createPictureShapeExtrusion(g, evaluateShapePreset({ preset: "rect" }, 64, 64), 1);
  expect(solid.sides.length).toBeGreaterThan(0);
  for (const side of solid.sides) {
    const a = hitPictureProjectiveFront(g, side.corners[0])!,
      b = hitPictureProjectiveFront(g, side.corners[3])!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      m = g.sourceToWorldMatrix,
      n = side.normal;
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 10);
    expect(
      n.x * (m[0] * dx + m[1] * dy) + n.y * (m[4] * dx + m[5] * dy) + n.z * (m[8] * dx + m[9] * dy),
    ).toBeCloseTo(0, 8);
    expect(n.x * m[2] + n.y * m[6] + n.z * m[10]).toBeCloseTo(0, 10);
  }
});

test("scene donut holes, concave notches and overflow tails retain genuine bounded contours", () => {
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation,
    scene: {
      widthPx: 400,
      heightPx: 240,
      sourceToScene: { ...affine, a: -1, e: 280, f: 30 },
      sceneToOutput: affine,
    },
  });
  const donut = createPictureShapeExtrusion(g, evaluateShapePreset({ preset: "donut" }, 64, 64), 1);
  expect(donut.frontFill[0]).toHaveLength(2);
  expect(donut.backFill[0]).toHaveLength(2);
  expect(donut.sides.length).toBeGreaterThan(30);
  const concave: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [
      {
        filled: true,
        stroke: true,
        commands: [
          ["M", 0, 0],
          ["L", 64, 0],
          ["L", 64, 24],
          ["L", 24, 24],
          ["L", 24, 100],
          ["L", 0, 100],
          ["Z"],
        ],
      },
    ],
  };
  const solid = createPictureShapeExtrusion(g, concave, 1);
  const notch = projectPictureShapePoint(g, { x: 24, y: 24 });
  expect(
    solid.frontFill[0]![0]!.points.some(
      (point) => Math.hypot(point.x - notch.x, point.y - notch.y) < 1e-8,
    ),
  ).toBe(true);
  for (const result of [donut, solid]) {
    expect(result.sides.length).toBeLessThanOrEqual(4096);
    for (const side of result.sides)
      for (const corner of side.corners) {
        expect(Number.isFinite(corner.x + corner.y + corner.w + corner.depth)).toBe(true);
        expect(corner.x).toBeGreaterThanOrEqual(result.bounds.left);
        expect(corner.x).toBeLessThanOrEqual(result.bounds.right);
        expect(corner.y).toBeGreaterThanOrEqual(result.bounds.top);
        expect(corner.y).toBeLessThanOrEqual(result.bounds.bottom);
      }
  }
  expect(solid.bounds.bottom).toBeGreaterThan(g.visualBounds.bottom);
});

test("scene shape tails guard the common horizon and unprojected scene coordinates beyond the frame", () => {
  const shape: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [rectangle(0, 0, 1400, 64)],
  };
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 45, yDeg: 0, projection: "perspective", perspectiveDeg: 90 },
    scene: { widthPx: 360, heightPx: 240, sourceToScene: { ...affine, e: 20, f: 30 } },
  });
  expect(() => getPictureShapeExtrusionBounds(g, shape, 1)).toThrow(/near plane/);
  const translated = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 0, yDeg: 0 },
    scene: { widthPx: 400, heightPx: 160, sourceToScene: { ...affine, e: 9_999_900 } },
  });
  expect(() =>
    createPictureShapeExtrusion(translated, { ...shape, paths: [rectangle(0, 0, 140, 64)] }, 1),
  ).toThrow(/scene source X/);
});

test("scene overflow keeps physical world coordinates bounded even when perspective compresses its output", () => {
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: {
      ...rotation,
      xDeg: -10,
      yDeg: 0,
      zDeg: 45,
      projection: "perspective",
      perspectiveDeg: 45,
    },
    scene: {
      widthPx: 65_536,
      heightPx: 65_536,
      sourceToScene: { ...affine, e: 7_000_000, f: 7_000_000 },
    },
  });
  const shape: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [rectangle(0, 0, 400_000, 64)],
  };
  expect(() => getPictureShapeExtrusionBounds(g, shape, 1)).toThrow(/world X/);
});
