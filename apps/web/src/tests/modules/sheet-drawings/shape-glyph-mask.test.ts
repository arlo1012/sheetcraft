// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { ShapeLine } from "@sheetcraft/core/shape-style";
import {
  SHAPE_GLYPH_CONTOUR_LIMITS,
  strokeShapeGlyphSilhouette,
  traceShapeGlyphSilhouette,
} from "../../../modules/sheet-drawings/shape-glyph-mask";

function pixels(rows: readonly string[]) {
  const width = rows[0]!.length,
    height = rows.length,
    data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    [...row].forEach((value, x) => {
      data[(y * width + x) * 4 + 3] = value === "#" ? 255 : 0;
    }),
  );
  return { width, height, data };
}
function line(compound: ShapeLine["compound"] = "double"): ShapeLine {
  return {
    paint: { kind: "solid", color: { kind: "rgb", rgb: "#123456" }, opacity: 1 },
    widthPt: 0.75,
    compound,
    dash: "solid",
    cap: "round",
    join: "round",
    miterLimit: 4,
  };
}
function context() {
  const paths: { points: { x: number; y: number }[]; width: number; closed: boolean }[] = [];
  let points: { x: number; y: number }[] = [],
    closed = false;
  const mock = {
    lineWidth: 0,
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath() {
      points = [];
      closed = false;
    },
    moveTo(x: number, y: number) {
      points.push({ x, y });
    },
    lineTo(x: number, y: number) {
      points.push({ x, y });
    },
    closePath() {
      closed = true;
    },
    stroke() {
      paths.push({ points, width: mock.lineWidth, closed });
    },
    arc: vi.fn(),
    fill: vi.fn(),
  };
  return { mock: mock as unknown as CanvasRenderingContext2D, paths };
}

describe("bounded native glyph alpha contours", () => {
  test("preserves outer, counter and disconnected components with opposite winding", () => {
    const source = pixels(["#####..#", "#...#..#", "#...#...", "#####..."]);
    const original = source.data.slice(),
      silhouette = traceShapeGlyphSilhouette(source);
    expect(silhouette.contours).toHaveLength(3);
    expect(silhouette.contours.map((contour) => contour.area).sort((a, b) => a - b)).toEqual([
      -6, 2, 20,
    ]);
    expect(silhouette.contours.every((contour) => contour.points.length === 4)).toBe(true);
    expect(source.data).toEqual(original);
    expect(Object.isFrozen(silhouette.contours[0]!.points[0])).toBe(true);
    expect(silhouette.maximumErrorRasterPx).toBe(Math.SQRT2);
  });
  test("diagonal touching pixels stay two closed contours", () => {
    const silhouette = traceShapeGlyphSilhouette(pixels(["#.", ".#"]));
    expect(silhouette.contours.map((contour) => contour.area)).toEqual([1, 1]);
    expect(silhouette.pointCount).toBe(8);
  });
  test("transparent source is an empty silhouette; threshold is deterministic", () => {
    const source = pixels(["..."]);
    source.data[3] = 127;
    source.data[7] = 128;
    expect(traceShapeGlyphSilhouette(source).contours[0]!.area).toBe(1);
    expect(traceShapeGlyphSilhouette(pixels(["..."])).contours).toEqual([]);
    source.data[3] = 1;
    expect(traceShapeGlyphSilhouette(source, 1).contours[0]!.area).toBe(2);
    expect(() => traceShapeGlyphSilhouette(source, 0)).toThrow(/threshold/);
  });
  test("malformed and adversarial alpha fail rather than inventing rectangular contours", () => {
    expect(() =>
      traceShapeGlyphSilhouette({ width: 4097, height: 1, data: new Uint8ClampedArray(4097 * 4) }),
    ).toThrow(/bounded/);
    expect(() =>
      traceShapeGlyphSilhouette({ width: 1, height: 1, data: new Uint8ClampedArray(1) }),
    ).toThrow(/exact-length/);
    const side = 160,
      rows = Array.from({ length: side }, (_, y) =>
        Array.from({ length: side }, (_, x) => ((x + y) % 2 === 0 ? "#" : ".")).join(""),
      );
    expect(() => traceShapeGlyphSilhouette(pixels(rows))).toThrow(/edge budget/);
    expect(SHAPE_GLYPH_CONTOUR_LIMITS.scratchBytes).toBeLessThan(16 * 1024 * 1024);
  });
  test("compound strokes retain hole boundaries and true disjoint glyph extent", () => {
    const silhouette = traceShapeGlyphSilhouette(pixels(["#####", "#...#", "#####"])),
      target = context();
    strokeShapeGlyphSilhouette(target.mock, silhouette, line(), 1);
    expect(target.paths).toHaveLength(4);
    expect(target.paths.every((path) => path.closed && path.width > 0 && path.width < 0.5)).toBe(
      true,
    );
    expect(target.paths[0]!.points[0]!.x).toBeGreaterThan(0);
    expect(target.paths[1]!.points[0]!.x).toBeLessThan(0);
    // Hole paths remain separate; no frame rectangle replaces actual alpha.
    expect(target.paths[2]!.points[0]).not.toEqual(target.paths[0]!.points[0]);
  });
  test("rich dashed bands use shared original phase and bounded paths", () => {
    const silhouette = traceShapeGlyphSilhouette(pixels(["##########", "##########"])),
      target = context();
    strokeShapeGlyphSilhouette(target.mock, silhouette, { ...line(), dash: "dash" }, 1);
    expect(target.paths.length).toBeGreaterThan(2);
    expect(
      target.paths.every((path) => path.points.every((point) => Number.isFinite(point.x))),
    ).toBe(true);
    expect(() =>
      strokeShapeGlyphSilhouette(target.mock, silhouette, { ...line(), widthPt: 0.000001 }, 1),
    ).not.toThrow();
    expect(() =>
      strokeShapeGlyphSilhouette(
        target.mock,
        silhouette,
        { ...line(), widthPt: 0.000001, dash: "dash" },
        1,
      ),
    ).toThrow(/interval budget/);
  });
});
