import { expect, test } from "vitest";
import { getLegacyShapeGeometry } from "../../../modules/sheet-drawings/legacy-shape-geometry";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { flattenShapePath } from "@sheetcraft/core/shape-presets";

test.each([
  "rectangle",
  "roundedRectangle",
  "ellipse",
  "triangle",
  "diamond",
  "arrow",
  "line",
  "star",
  "heart",
] as const)("legacy %s outline has detached exact numeric commands", (shape) => {
  const g = getLegacyShapeGeometry(shape, 200, 100)!;
  expect(g.width).toBe(200);
  expect(g.height).toBe(100);
  expect(g.paths).toHaveLength(1);
  expect(g.paths[0]?.filled).toBe(shape !== "line");
  expect(g.paths[0]?.stroke).toBe(true);
  expect(g.handles).toEqual([]);
  expect(g.connectionSites).toEqual([]);
  expect(g.textRect).toEqual({ left: 6, top: 6, right: 194, bottom: 94 });
  expect(Object.isFrozen(g.paths[0]?.commands[0])).toBe(true);
  expect(flattenShapePath(g.paths[0]!)[0]?.points.length).toBeGreaterThan(1);
});

test("original margin, scaled round corners, diagonal line and cubic heart are not standard approximations", () => {
  expect(getLegacyShapeGeometry("rectangle", 200, 100)?.paths[0]?.commands[0]).toEqual(["M", 4, 2]);
  expect(getLegacyShapeGeometry("roundedRectangle", 200, 100)?.paths[0]?.commands[2]).toEqual([
    "A",
    24,
    12,
    172,
    14,
    -Math.PI / 2,
    0,
  ]);
  expect(getLegacyShapeGeometry("ellipse", 200, 100)?.paths[0]?.commands[1]).toEqual([
    "A",
    96,
    48,
    100,
    50,
    0,
    Math.PI * 2,
  ]);
  expect(getLegacyShapeGeometry("line", 200, 100)?.paths[0]?.commands).toEqual([
    ["M", 4, 98],
    ["L", 196, 2],
  ]);
  expect(getLegacyShapeGeometry("heart", 200, 100)?.paths[0]?.commands[1]).toEqual([
    "C",
    -60,
    40,
    16,
    -20,
    100,
    20,
  ]);
});

test("numeric adaptation is opt-in through shapeStyle and never mutates or migrates the old drawing", () => {
  const drawing = createGraphicDrawing("s", "shape", "legacy", {
    row: 0,
    column: 0,
  });
  delete drawing.shapeGeometry;
  delete drawing.shapeText;
  const before = structuredClone(drawing);
  expect(getDrawingShapeGeometry(drawing)).toBeUndefined();
  const styled = {
    ...drawing,
    shapeStyle: { fill: { kind: "none" as const } },
  };
  expect(getDrawingShapeGeometry(styled)?.paths[0]?.commands[0]).toEqual(["M", 4.8, 2.4]);
  expect(drawing).toEqual(before);
  expect(styled.shapeGeometry).toBeUndefined();
});

test.each([NaN, Infinity, 0, 16385])("rejects unbounded frame%s", (n) => {
  expect(getLegacyShapeGeometry("ellipse", n, 100)).toBeUndefined();
  expect(getLegacyShapeGeometry("ellipse", 100, n)).toBeUndefined();
});
