import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { resizeStandardShapeBy } from "../../../modules/sheet-drawings/standard-shape-layout";
import { getShapeEndPaint } from "../../../modules/sheet-drawings/shape-line-paint";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  createFreeShapeDrawingFromPoints,
  MAX_FREE_SHAPE_POINTS,
} from "../../../modules/sheet-drawings/free-shape-creation";
import {
  getDrawingShapeGeometry,
  getStandardShapeSvgPaths,
} from "../../../modules/sheet-drawings/shape-geometry";
const layout = createSheetViewportLayout({
  geometry: createSheetGeometry({
    rowCount: 100,
    columnCount: 100,
    rowHeight: 24,
    columnWidth: 80,
  }),
  rows: createRowVisibilityIndex({ rowCount: 100, defaultRowHeight: 24 }),
  viewportSize: { width: 800, height: 600 },
});
const base = createGraphicDrawing("free", "shape", "Free", { row: 0, column: 0 });
const points = [
  { x: 100, y: 100 },
  { x: 200, y: 120 },
  { x: 170, y: 220 },
  { x: 350, y: 170 },
];
describe("bounded free shape actual completion geometry", () => {
  test.each(["curve", "freeform", "scribble"] as const)(
    "%s creates exact numeric points and real prepared paint",
    (tool) => {
      const drawing = createFreeShapeDrawingFromPoints({ base, tool, points, layout })!;
      expect(drawing.shapeGeometry).toBeUndefined();
      expect(drawing.shapePath!.tool).toBe(tool);
      expect(drawing.rotation).toBe(0);
      expect(normalizeSheetDrawing(drawing)).toEqual(drawing);
      const rect = getFloatingImageSheetRect(drawing, layout)!,
        commands = drawing.shapePath!.commands;
      const endpoints = commands
        .map((c) =>
          c[0] === "M" || c[0] === "L" ? [c[1], c[2]] : c[0] === "C" ? [c[5], c[6]] : [],
        )
        .filter((p) => p.length);
      expect(endpoints.map((p) => ({ x: p[0]! + rect.x, y: p[1]! + rect.y }))).toEqual(points);
      const geometry = getDrawingShapeGeometry(drawing)!;
      expect(geometry.paths[0]!.filled).toBe(false);
      expect(getStandardShapeSvgPaths(geometry)).toHaveLength(1);
      expect(getStandardShapeSvgPaths(geometry)[0]!.d).not.toMatch(/NaN|Infinity|undefined/);
      expect(base).not.toHaveProperty("shapePath");
    },
  );
  test("closed curve cyclic controls/type ownership retain every vertex and bounded seam", () => {
    const drawing = createFreeShapeDrawingFromPoints({
      base,
      tool: "curve",
      points,
      layout,
      closed: true,
    })!;
    const path = drawing.shapePath!;
    expect(path.commands.at(-1)).toEqual(["Z"]);
    expect(path.commands).toHaveLength(points.length + 2);
    expect(path.pointTypes).toEqual({ 0: "smooth", 1: "smooth", 2: "smooth", 3: "smooth" });
    expect(getDrawingShapeGeometry(drawing)!.paths[0]!.filled).toBe(true);
  });
  test("thin stroke uses symmetric safe frame, dedupes browser repeated final point, never invents closed 2-point area", () => {
    const p = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 100 },
    ];
    const drawing = createFreeShapeDrawingFromPoints({
      base,
      tool: "scribble",
      points: p,
      layout,
    })!;
    expect(drawing.height).toBe(1);
    expect(drawing.shapePath!.commands).toHaveLength(2);
    expect(getFloatingImageSheetRect(drawing, layout)!.y).toBe(99.5);
    expect(
      createFreeShapeDrawingFromPoints({ base, tool: "freeform", points: p, layout, closed: true }),
    ).toBeUndefined();
  });
  test("full numeric budget prepares SVG/hit/end paint and preserves thin resize", () => {
    const drawing = createFreeShapeDrawingFromPoints({
      base,
      tool: "scribble",
      points: Array.from({ length: 1025 }, (_, i) => ({ x: 100 + i, y: 100 + (i % 2) })),
      layout,
    })!;
    expect(drawing.shapePath!.commands).toHaveLength(1025);
    expect(getStandardShapeSvgPaths(getDrawingShapeGeometry(drawing))).toHaveLength(1);
    const max = {
      ...drawing,
      shapePath: {
        ...drawing.shapePath!,
        viewBox: { width: 2047, height: 1 },
        commands: Array.from({ length: 2048 }, (_, i) => [i ? "L" : "M", i, i % 2] as const),
      },
      shapeLineEnds: { end: { kind: "triangle" as const } },
    };
    expect(getStandardShapeSvgPaths(getDrawingShapeGeometry(max))).toHaveLength(1);
    expect(getShapeEndPaint(max, getDrawingShapeGeometry(max))).toHaveLength(1);
    const thin = createFreeShapeDrawingFromPoints({
      base,
      tool: "scribble",
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      layout,
    })!;
    const resized = resizeStandardShapeBy(thin, "se", { x: 10, y: 0 }, layout)!;
    expect(resized.width).toBe(110);
    expect(resized.height).toBe(1);
    expect(getFloatingImageSheetRect(resized, layout)).toEqual({
      ...getFloatingImageSheetRect(thin, layout),
      width: 110,
    });
  });
  test("invalid, very short, over-budget and out-of-sheet paths never become drawings", () => {
    const invalid = [
      [],
      [{ x: 1, y: 1 }],
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      [
        { x: 1, y: 1 },
        { x: 1.1, y: 1.1 },
      ],
      [
        { x: 100, y: 100 },
        { x: NaN, y: 200 },
      ],
      [
        { x: -1, y: 100 },
        { x: 100, y: 200 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 100 },
        { x: 9000, y: 200 },
      ],
      Array.from({ length: MAX_FREE_SHAPE_POINTS + 1 }, (_, i) => ({
        x: 100 + i,
        y: 100 + (i % 3),
      })),
    ];
    for (const p of invalid)
      expect(
        createFreeShapeDrawingFromPoints({ base, tool: "scribble", points: p, layout }),
      ).toBeUndefined();
  });
});
