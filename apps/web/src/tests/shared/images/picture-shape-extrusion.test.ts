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
