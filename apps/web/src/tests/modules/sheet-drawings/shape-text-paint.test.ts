// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle, ShapePaint } from "@sheetcraft/core/shape-style";
import { TEXT_WARP_PRESET_NAMES, type TextWarpPresetName } from "@sheetcraft/core/text-warps";
import {
  layoutDrawingShapeText,
  getDrawingShapeTextNativeWarpSource,
} from "../../../modules/sheet-drawings/shape-text-runtime";
import { prepareShapeLeafPixels } from "../../../modules/sheet-drawings/shape-leaf-pixels";
import { detailedShapeContainsWorldPoint } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { shapeDrawingContainsWorldPoint } from "../../../modules/sheet-drawings/shape-line-paint";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import type {
  ShapeTextLayoutResult,
  ShapeTextRun,
} from "../../../modules/sheet-drawings/shape-text-layout";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import {
  clearShapeTextPaintCache,
  getShapeTextPaintOwnedBytes,
  planShapeTextPaint,
  preflightShapeTextGlyphBudgets,
  prepareShapeTextPaint,
  resolveShapeTextPaintStyle,
  SHAPE_TEXT_PAINT_LIMITS,
  type ShapeTextPaintOptions,
} from "../../../modules/sheet-drawings/shape-text-paint";

type Matrix = [number, number, number, number, number, number];
type Point = { x: number; y: number };
type ClipBounds = { left: number; top: number; right: number; bottom: number };
type NativeCall = {
  mode: "fill" | "stroke";
  text: string;
  font: string;
  direction: string;
  matrix: Matrix;
};
/** A deterministic native-Canvas boundary double, not browser glyph fidelity.
 * Real shared paint sampling/effects operate on its detached numeric pixels. */
class MemoryCanvas {
  lang = "";
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray();
  context = new MemoryContext(this);
  failRead = false;
  get width() {
    return this.w;
  }
  set width(value: number) {
    this.w = value;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height() {
    return this.h;
  }
  set height(value: number) {
    this.h = value;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  getContext() {
    return this.context;
  }
}
class MemoryContext {
  font = "";
  direction = "ltr";
  textAlign = "left";
  textBaseline = "alphabetic";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle = "#ffffff";
  strokeStyle = "#ffffff";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "round";
  miterLimit = 4;
  calls: NativeCall[] = [];
  strokes: Point[][] = [];
  matrix: Matrix = [1, 0, 0, 1, 0, 0];
  clipping: ClipBounds | undefined;
  stack: { matrix: Matrix; clipping: ClipBounds | undefined }[] = [];
  points: Point[] = [];
  rectangle: [number, number, number, number] | undefined;
  circle: { x: number; y: number; radius: number } | undefined;
  constructor(readonly canvas: MemoryCanvas) {}
  save() {
    this.stack.push({ matrix: [...this.matrix], clipping: this.clipping });
  }
  restore() {
    const value = this.stack.pop();
    if (value) {
      this.matrix = value.matrix;
      this.clipping = value.clipping;
    }
  }
  translate(x: number, y: number) {
    const m = this.matrix;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }
  scale(x: number, y: number) {
    const m = this.matrix;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }
  rotate(angle: number) {
    const [a, b, c, d, e, f] = this.matrix,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    this.matrix = [
      a * cos + c * sin,
      b * cos + d * sin,
      -a * sin + c * cos,
      -b * sin + d * cos,
      e,
      f,
    ];
  }
  transformed(x: number, y: number): Point {
    const [a, b, c, d, e, f] = this.matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }
  beginPath() {
    this.points = [];
    this.rectangle = undefined;
    this.circle = undefined;
  }
  rect(x: number, y: number, width: number, height: number) {
    this.rectangle = [x, y, width, height];
  }
  clip() {
    if (!this.rectangle) return;
    const [x, y, w, h] = this.rectangle,
      a = this.transformed(x, y),
      b = this.transformed(x + w, y + h);
    this.clipping = {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
    };
  }
  moveTo(x: number, y: number) {
    this.points.push(this.transformed(x, y));
  }
  lineTo(x: number, y: number) {
    this.points.push(this.transformed(x, y));
  }
  closePath() {
    if (this.points[0]) this.points.push(this.points[0]);
  }
  setLineDash() {}
  arc(x: number, y: number, radius: number) {
    this.circle = { ...this.transformed(x, y), radius };
  }
  pixel(x: number, y: number, color: ArrayLike<number>) {
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
    const clip = this.clipping;
    if (
      clip &&
      (x + 0.5 < clip.left || x + 0.5 >= clip.right || y + 0.5 < clip.top || y + 0.5 >= clip.bottom)
    )
      return;
    const index = (y * this.canvas.width + x) * 4;
    for (let channel = 0; channel < 4; channel++)
      this.canvas.data[index + channel] = color[channel]!;
  }
  paintRect(x: number, y: number, width: number, height: number, outline = false) {
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([cx, cy]) => this.transformed(cx!, cy!));
    const pad = outline
      ? this.lineWidth *
        Math.max(
          Math.abs(this.matrix[0]),
          Math.abs(this.matrix[1]),
          Math.abs(this.matrix[2]),
          Math.abs(this.matrix[3]),
        )
      : 0;
    const left = Math.floor(Math.min(...corners.map((p) => p.x)) - pad),
      right = Math.ceil(Math.max(...corners.map((p) => p.x)) + pad);
    const top = Math.floor(Math.min(...corners.map((p) => p.y)) - pad),
      bottom = Math.ceil(Math.max(...corners.map((p) => p.y)) + pad);
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    for (let py = top; py < bottom; py++)
      for (let px = left; px < right; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          lx = (d * dx - c * dy) / det,
          ly = (-b * dx + a * dy) / det;
        const half = outline ? this.lineWidth / 2 : 0;
        if (
          lx >= x - half &&
          lx < x + width + half &&
          ly >= y - half &&
          ly < y + height + half &&
          (!outline ||
            lx < x + half ||
            lx >= x + width - half ||
            ly < y + half ||
            ly >= y + height - half)
        )
          this.pixel(px, py, [
            ...[1, 3, 5].map((start) =>
              parseInt((outline ? this.strokeStyle : this.fillStyle).slice(start, start + 2), 16),
            ),
            255,
          ]);
      }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.paintRect(x, y, w, h);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.paintRect(x, y, w, h, true);
  }
  fillText(text: string, x: number, y: number) {
    this.calls.push({
      mode: "fill",
      text,
      font: this.font,
      direction: this.direction,
      matrix: [...this.matrix],
    });
    if (text === "O") {
      this.paintRect(x, y - 8, 8, 2);
      this.paintRect(x, y - 2, 8, 2);
      this.paintRect(x, y - 6, 2, 4);
      this.paintRect(x + 6, y - 6, 2, 4);
    } else if (text === "L") {
      this.paintRect(x, y - 8, 2, 8);
      this.paintRect(x + 2, y - 2, 6, 2);
    } else if (text.trim()) this.paintRect(x, y - 4, Array.from(text).length * 4, 4);
  }
  strokeText(text: string, x: number, y: number) {
    this.calls.push({
      mode: "stroke",
      text,
      font: this.font,
      direction: this.direction,
      matrix: [...this.matrix],
    });
    if (text.trim()) this.paintRect(x, y - 4, Array.from(text).length * 4, 4, true);
  }
  stroke() {
    this.strokes.push([...this.points]);
    const half = this.lineWidth / 2;
    for (let index = 1; index < this.points.length; index++) {
      const a = this.points[index - 1]!,
        b = this.points[index]!,
        dx = b.x - a.x,
        dy = b.y - a.y,
        den = dx * dx + dy * dy;
      for (
        let y = Math.floor(Math.min(a.y, b.y) - half);
        y < Math.ceil(Math.max(a.y, b.y) + half);
        y++
      )
        for (
          let x = Math.floor(Math.min(a.x, b.x) - half);
          x < Math.ceil(Math.max(a.x, b.x) + half);
          x++
        ) {
          const t =
            den === 0
              ? 0
              : Math.max(0, Math.min(1, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / den));
          if (Math.hypot(x + 0.5 - a.x - t * dx, y + 0.5 - a.y - t * dy) <= half)
            this.pixel(x, y, [255, 255, 255, 255]);
        }
    }
  }
  fill() {
    const dot = this.circle;
    if (!dot) {
      if (this.points.length < 3) return;
      const left = Math.floor(Math.min(...this.points.map((point) => point.x))),
        right = Math.ceil(Math.max(...this.points.map((point) => point.x))),
        top = Math.floor(Math.min(...this.points.map((point) => point.y))),
        bottom = Math.ceil(Math.max(...this.points.map((point) => point.y)));
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          let inside = false;
          for (
            let index = 0, previous = this.points.length - 1;
            index < this.points.length;
            previous = index++
          ) {
            const a = this.points[index]!,
              b = this.points[previous]!;
            if (
              a.y > y + 0.5 !== b.y > y + 0.5 &&
              x + 0.5 < ((b.x - a.x) * (y + 0.5 - a.y)) / (b.y - a.y) + a.x
            )
              inside = !inside;
          }
          if (inside) this.pixel(x, y, [255, 255, 255, 255]);
        }
      return;
    }
    for (let y = Math.floor(dot.y - dot.radius); y < Math.ceil(dot.y + dot.radius); y++)
      for (let x = Math.floor(dot.x - dot.radius); x < Math.ceil(dot.x + dot.radius); x++)
        if (Math.hypot(x + 0.5 - dot.x, y + 0.5 - dot.y) <= dot.radius)
          this.pixel(x, y, [255, 255, 255, 255]);
  }
  drawImage(image: MemoryCanvas, x: number, y: number, width = image.width, height = image.height) {
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          lx = (d * dx - c * dy) / det,
          ly = (-b * dx + a * dy) / det;
        const u = (lx - x) / width,
          v = (ly - y) / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const source =
          (Math.min(image.height - 1, Math.floor(v * image.height)) * image.width +
            Math.min(image.width - 1, Math.floor(u * image.width))) *
          4;
        this.pixel(px, py, image.data.subarray(source, source + 4));
      }
  }
  getImageData(x = 0, y = 0, width = this.canvas.width, height = this.canvas.height) {
    if (this.canvas.failRead) throw new Error("tainted");
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++)
      for (let column = 0; column < width; column++) {
        if (
          x + column < 0 ||
          y + row < 0 ||
          x + column >= this.canvas.width ||
          y + row >= this.canvas.height
        )
          continue;
        const source = ((y + row) * this.canvas.width + x + column) * 4;
        data.set(this.canvas.data.subarray(source, source + 4), (row * width + column) * 4);
      }
    return { width, height, data };
  }
  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    this.canvas.data.set(image.data);
  }
}
function factory() {
  const canvases: MemoryCanvas[] = [];
  return {
    canvases,
    make: () => {
      const canvas = new MemoryCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    calls: () => canvases.flatMap((canvas) => canvas.context.calls),
  };
}
function run(text = "ab", angle: ShapeTextRun["angle"] = 0): ShapeTextRun {
  return {
    text,
    font: { family: "Exact Family", size: 16, weight: 700, italic: true },
    direction: "ltr",
    x: 2,
    y: 6,
    angle,
    advancePx: Array.from(text).length * 4,
    inlineAdvancePx: Array.from(text).length * 4,
    ascentPx: 4,
    descentPx: 1,
    inkBounds: { x: 2, y: 2, width: Array.from(text).length * 4, height: 5 },
  };
}
function layout(runs: ShapeTextRun[] = [run()], overflow = true): ShapeTextLayoutResult {
  return {
    runs,
    lines: [],
    contentRect: { x: 0, y: 0, width: 20, height: 16 },
    clipRect: overflow ? null : { x: 1, y: 1, width: 8, height: 8 },
    overflow,
    inkBounds: { x: 2, y: 2, width: 8, height: 5 },
    visibleInkBounds: { x: 2, y: 2, width: 8, height: 5 },
    inkBoundsAccuracy: "ink-metrics",
    requiredExtent: { width: 10, height: 7, inline: 10, block: 7 },
    fits: true,
    measurementCount: 1,
    verticalGlyphPolicy: "unicode-17-uax50-fallback",
  };
}
function options() {
  const drawing: SheetGraphicDrawing = {
    ...createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 }),
    width: 20,
    height: 16,
    color: "#123456",
    rotation: 0,
    shapeText: createDefaultShapeText(),
  };
  return { drawing, layout: layout(), density: 1 } satisfies ShapeTextPaintOptions;
}
function warpOptions(preset: TextWarpPresetName, text = "ab", flipX = false, flipY = false) {
  const base = options(),
    shapeText = createDefaultShapeText();
  shapeText.layout.wrap = false;
  shapeText.layout.overflow = true;
  shapeText.layout.marginsPt = { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 };
  shapeText.fontFamily = "Exact Family";
  shapeText.warp = { preset };
  const drawing: SheetGraphicDrawing = {
    ...base.drawing,
    wordArt: true,
    shapeGeometry: { preset: "rect" },
    text,
    width: 48,
    height: 24,
    fontSize: 16,
    shapeText,
    ...(flipX ? { shapeFlipX: true } : {}),
    ...(flipY ? { shapeFlipY: true } : {}),
  };
  return {
    drawing,
    density: 1,
    layout: layoutDrawingShapeText(drawing, {
      measurer: {
        measure: (value) => value.length * 4,
        measureMetrics: (value) => ({
          width: value.length * 4,
          ascent: value.trim() ? 4 : 0,
          descent: 0,
          inkLeft: 0,
          inkRight: value.trim() ? value.length * 4 : 0,
        }),
      },
      normalLineMetrics: { ascent: 4, descent: 1, lineAdvance: 5 },
    }),
  } satisfies ShapeTextPaintOptions;
}

describe("actual native WordArt mask consumers", () => {
  test("active warp body fallback never promotes its empty text rectangle to an alpha hit", () => {
    const input = warpOptions("textWave1");
    const drawing = {
      ...input.drawing,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
    };
    expect(drawing.shapeStyle).toBeUndefined();
    const geometry = getDrawingShapeGeometry(drawing, false);
    const frame = { x: 100, y: 80, width: drawing.width, height: drawing.height };
    const point = { x: 124, y: 92 };
    expect(shapeDrawingContainsWorldPoint(drawing, geometry, frame, point)).toBe(false);
    expect(
      shapeDrawingContainsWorldPoint({ ...drawing, fill: "#ff0000" }, geometry, frame, point),
    ).toBe(true);
  });
  test("attributed envelopes charge every full native source Canvas/readback pass", () => {
    const input = warpOptions("textPlain", "abcdefghijklm");
    const drawing = { ...input.drawing, width: 200, height: 100, fontSize: 500 };
    const tuple = {
      measurer: {
        measure: (text: string) => text.length * 300,
        measureMetrics: (text: string) => ({
          width: text.length * 300,
          ascent: 450,
          descent: 50,
          inkLeft: 0,
          inkRight: text.length * 300,
        }),
      },
      normalLineMetrics: { ascent: 450, descent: 50, lineAdvance: 500 },
    };
    const uniform = planShapeTextPaint({
      drawing,
      density: 1,
      layout: layoutDrawingShapeText(drawing, tuple),
    });
    expect(uniform.warpPlan!.proof.sourceRasterBytes).toBeGreaterThan(15_000_000);
    drawing.shapeText = {
      ...drawing.shapeText!,
      characterRuns: Array.from(drawing.text, (_, index) => ({
        start: index,
        end: index + 1,
        color: `#${(index + 1).toString(16).padStart(6, "0")}`,
      })),
    };
    expect(() =>
      planShapeTextPaint({ drawing, density: 1, layout: layoutDrawingShapeText(drawing, tuple) }),
    ).toThrow(/aggregate raster-span work budget/);
  });
  test.each(TEXT_WARP_PRESET_NAMES)(
    "%s has real source calls, alpha and bounded owned release",
    (preset) => {
      const native = factory(),
        input = warpOptions(preset);
      const plan = planShapeTextPaint(input);
      expect(plan.warpPlan?.family).toBeDefined();
      const result = prepareShapeTextPaint({ ...input, canvasFactory: native.make });
      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") throw new Error("Expected native WordArt pixels.");
      try {
        const pixels = (result.canvas as unknown as MemoryCanvas).data;
        expect(pixels.some((alpha, index) => index % 4 === 3 && alpha > 0)).toBe(true);
        const calls = native.calls().filter((call) => call.mode === "fill");
        if (plan.warpPlan!.family === "envelope")
          expect(calls.map((call) => call.text)).toEqual(["ab"]);
        else {
          expect(calls.map((call) => call.text)).toEqual(["a", "b"]);
          for (const { matrix, font } of calls) {
            expect(matrix[0] * matrix[3] - matrix[1] * matrix[2]).toBeCloseTo(1, 10);
            expect(font).toContain("16px");
          }
        }
        expect(result.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
      } finally {
        result.dispose();
      }
      expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
        true,
      );
    },
  );
  test.each(["textArchUp", "textCircle"] as const)(
    "%s H reflection mirrors actual rigid glyph axes once",
    (preset) => {
      const native = factory();
      const result = prepareShapeTextPaint({
        ...warpOptions(preset, "ab", true),
        canvasFactory: native.make,
      });
      if (result.kind !== "ready") throw new Error("Expected reflected glyphs.");
      try {
        expect(native.calls().map((call) => call.text)).toEqual(["a", "b"]);
        for (const { matrix } of native.calls())
          expect(matrix[0] * matrix[3] - matrix[1] * matrix[2]).toBeCloseTo(-1, 10);
      } finally {
        result.dispose();
      }
    },
  );
  test("every active warp requires actual native alpha preflight and rejects stale or unsupported sources", () => {
    const native = factory(),
      input = warpOptions("textWave1");
    expect(preflightShapeTextGlyphBudgets({ ...input, canvasFactory: native.make })).toMatchObject({
      kind: "ready",
      proof: "native-alpha-warp",
    });
    input.drawing.text = "changed";
    expect(() => planShapeTextPaint(input)).toThrow(/prepare its layout/);
    expect(() => planShapeTextPaint(warpOptions("textArchUp", "中文"))).toThrow(/printable ASCII/);
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test.each(["textWave1", "textCircle"] as const)(
    "%s consumes the united leaf and actual reflected alpha hit source",
    (preset) => {
      const input = warpOptions(preset, "ab", true),
        native = factory();
      const tuple = getDrawingShapeTextNativeWarpSource(input.drawing, input.layout);
      const drawing = {
        ...input.drawing,
        shapeStyle: { fill: { kind: "none" as const }, line: { kind: "none" as const } },
      };
      const result = prepareShapeLeafPixels({
        drawing,
        density: 1,
        canvasFactory: native.make,
        textRuntimeOptions: {
          measurer: tuple.measurer,
          normalLineMetrics: tuple.normalLineMetrics,
          resolveNormalLineMetrics: tuple.resolveNormalLineMetrics,
        },
      });
      if (result.kind !== "ready") throw new Error("Expected actual united WordArt leaf.");
      try {
        expect(result.textPlan?.warpPlan?.family).toBeDefined();
        const pixels = result.canvas
          .getContext("2d")!
          .getImageData(0, 0, result.canvas.width, result.canvas.height).data;
        const ink = pixels.findIndex((value, index) => index % 4 === 3 && value > 1);
        expect(ink).toBeGreaterThanOrEqual(3);
        const pixelIndex = Math.floor(ink / 4);
        const frame = { x: 100, y: 80, width: drawing.width, height: drawing.height };
        const point = pictureFrameLocalToWorld(frame, drawing.rotation, {
          x:
            result.logicalBounds.left +
            ((pixelIndex % result.canvas.width) + 0.5) / result.actualDensity,
          y:
            result.logicalBounds.top +
            (Math.floor(pixelIndex / result.canvas.width) + 0.5) / result.actualDensity,
        });
        expect(
          detailedShapeContainsWorldPoint(drawing, frame, point, {
            drawing,
            canvas: result.canvas,
            density: result.actualDensity,
            bounds: {
              left: result.logicalBounds.left,
              top: result.logicalBounds.top,
              width: result.logicalBounds.right - result.logicalBounds.left,
              height: result.logicalBounds.bottom - result.logicalBounds.top,
            },
            unflipped: true,
          }),
        ).toBe(true);
        expect(native.calls().map((call) => call.text)).toContain(
          preset === "textCircle" ? "a" : "ab",
        );
      } finally {
        result.dispose();
      }
      expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
        true,
      );
    },
  );
});
function solid(rgb: string, opacity = 1): ShapePaint {
  return { kind: "solid", color: { kind: "rgb", rgb }, opacity };
}
function glyph3dStyle(): ShapeDetailedStyle {
  return {
    format3d: {
      kind: "value",
      value: {
        depthPt: 3,
        depthColor: { kind: "rgb", rgb: "#ff0000" },
        contourPt: 0,
        contourColor: { kind: "rgb", rgb: "#000000" },
        material: "flat",
        lighting: "flat",
        lightingAngleDeg: 0,
      },
    },
    rotation3d: {
      kind: "value",
      value: { projection: "parallel", xDeg: 30, yDeg: 20, zDeg: 0, distanceFromGroundPt: 0 },
    },
  };
}
function glyphRun(text: "O" | "L"): ShapeTextRun {
  return {
    ...run(text),
    x: 2,
    y: 10,
    advancePx: 8,
    inlineAdvancePx: 8,
    ascentPx: 8,
    inkBounds: { x: 2, y: 2, width: 8, height: 8 },
  };
}
function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  const source = canvas as unknown as MemoryCanvas,
    index = (y * canvas.width + x) * 4;
  return [...source.data.subarray(index, index + 4)];
}
function ready(result: ReturnType<typeof prepareShapeTextPaint>) {
  if (result.kind !== "ready") throw new Error("expected ready");
  return result;
}
const owned: { dispose: () => void }[] = [];
function paint(input: ShapeTextPaintOptions, canvasFactory?: () => HTMLCanvasElement) {
  const result = ready(prepareShapeTextPaint({ ...input, canvasFactory }));
  owned.push(result);
  return result;
}
afterEach(() => {
  for (const result of owned.splice(0)) result.dispose();
  clearShapeTextPaintCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pure independent text paint planning", () => {
  test.each([
    { width: 4000, height: 4000, density: 1, x: 45, z: 0 },
    { width: 320, height: 180, density: 8, x: 0, z: 45 },
  ])(
    "own3D adapts initial oversized projected trial for $width×$height atdensity$density",
    (trial) => {
      const input = options();
      input.drawing.width = trial.width;
      input.drawing.height = trial.height;
      const plan = planShapeTextPaint({
        ...input,
        density: trial.density,
        style: {
          rotation3d: {
            kind: "value",
            value: {
              projection: "parallel",
              xDeg: trial.x,
              yDeg: 0,
              zDeg: trial.z,
              distanceFromGroundPt: 0,
            },
          },
        },
      });
      expect(plan.kind).toBe("ready");
      expect(plan.actualDensity).toBeLessThan(trial.density);
      expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(
        SHAPE_TEXT_PAINT_LIMITS.pixels,
      );
      expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
    },
  );
  test("inherits only glyph color; never shape body fill, outline or effects", () => {
    const input = options();
    input.drawing.fill = "#ff0000";
    input.drawing.stroke = "#00ff00";
    input.drawing.shapeStyle = {
      fill: { kind: "value", value: solid("#ff0000") },
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 20 },
      },
    };
    expect(resolveShapeTextPaintStyle(input.drawing)).toEqual({
      fill: { kind: "value", value: solid("#123456") },
      line: { kind: "none" },
    });
    expect(planShapeTextPaint(input).effectStyle).toEqual({});
    expect(resolveShapeTextPaintStyle(input.drawing, { fill: { kind: "none" } }).fill).toEqual({
      kind: "none",
    });
  });
  test("preflight detaches numeric runs/style and includes source/effect budgets", () => {
    const input = options();
    input.drawing.shapeText!.underline = true;
    input.drawing.shapeText!.strike = true;
    const planned = planShapeTextPaint({
      ...input,
      density: 64,
      style: {
        glow: {
          kind: "value",
          value: { color: { kind: "rgb", rgb: "#ffffff" }, opacity: 1, sizePt: 5 },
        },
      },
    });
    expect(planned.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
    expect(planned.sourceScratchBytes).toBeGreaterThan(0);
    expect(planned.effectStyle.fill).toBeUndefined();
    expect(planned.effectStyle.line).toBeUndefined();
    input.layout.runs[0]!.text = "changed";
    input.layout.runs[0]!.font.family = "changed";
    expect(planned.runs[0]!.text).toBe("ab");
    expect(planned.runs[0]!.font.family).toBe("Exact Family");
    expect(Object.isFrozen(planned.runs[0]!.font)).toBe(true);
  });
  test("missing glyph picture metadata stays unavailable without Canvas or decoding", () => {
    const input = options(),
      decode = vi.fn(),
      make = vi.fn();
    const style: ShapeDetailedStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "glyph-asset",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
    };
    const result = prepareShapeTextPaint({
      ...input,
      style,
      resources: { getAssetImage: decode },
      canvasFactory: make,
    });
    expect(result).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["glyph-asset"],
    });
    expect(make).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });
  test("local text3D pure preflight never invokes native raster work", () => {
    const make = vi.fn();
    const plan = planShapeTextPaint({
      ...options(),
      style: {
        rotation3d: {
          kind: "value",
          value: {
            projection: "parallel",
            xDeg: 45,
            yDeg: 0,
            zDeg: 0,
            distanceFromGroundPt: 0,
          },
        },
      },
    });
    expect(plan.requiresGlyphProjection).toBe(true);
    expect(plan.isProjected).toBe(true);
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
    expect(make).not.toHaveBeenCalled();
  });
  test("invalid numeric run/density and conflicting clip fail before native work", () => {
    const input = options();
    input.layout.runs[0]!.x = NaN;
    expect(() => planShapeTextPaint(input)).toThrow(/coordinates/);
    expect(() => planShapeTextPaint({ ...options(), density: Infinity })).toThrow(/density/);
    const conflict = options();
    conflict.layout.clipRect = { x: 0, y: 0, width: 1, height: 1 };
    expect(() => planShapeTextPaint(conflict)).toThrow(/conflict/);
  });
});
describe("real native run source and shared glyph paints", () => {
  test("paints ordered whole Unicode/bidi runs using identical font and baseline", () => {
    const input = options(),
      native = factory(),
      texts = ["A\u0301👩🏽‍💻", "אבג", "漢字"];
    input.layout = layout(
      texts.map((text, index) => ({
        ...run(text, index === 0 ? 0 : index === 1 ? 90 : 270),
        direction: index === 1 ? "rtl" : "ltr",
        x: 2 + index * 4,
        y: 10,
      })),
    );
    paint(input, native.make);
    expect(native.calls().map((call) => call.text)).toEqual(texts);
    expect(native.calls().every((call) => call.font === 'italic 700 16px "Exact Family"')).toBe(
      true,
    );
    expect(native.calls()[1]!.direction).toBe("rtl");
    expect(native.calls()[1]!.matrix[1]).toBeCloseTo(1);
    expect(native.calls()[2]!.matrix[1]).toBeCloseTo(-1);
  });
  test("all detached glyph canvases inherit the current document language", () => {
    const documentElement = { lang: "zh-CN" };
    vi.stubGlobal("document", { documentElement });
    for (const language of ["zh-CN", "en-US"]) {
      documentElement.lang = language;
      const native = factory();
      paint(options(), native.make);
      expect(native.canvases.length).toBeGreaterThan(0);
      expect(native.canvases.every((canvas) => canvas.lang === language)).toBe(true);
      const proof = factory();
      preflightShapeTextGlyphBudgets({ ...warpOptions("textWave1"), canvasFactory: proof.make });
      expect(proof.canvases.length).toBeGreaterThan(0);
      expect(proof.canvases.every((canvas) => canvas.lang === language)).toBe(true);
    }
  });
  test("ordinary fill is actual glyph alpha with independent RGBA and no backplate", () => {
    const native = factory(),
      result = paint(options(), native.make);
    expect(pixel(result.canvas, 3, 3)).toEqual([18, 52, 86, 255]);
    expect(pixel(result.canvas, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.canvas, 15, 10)).toEqual([0, 0, 0, 0]);
    expect(native.canvases.filter((canvas) => canvas.width > 0)).toHaveLength(1);
  });
  test.each([90, 270] as const)("underline/strike follow each native %s degree run", (angle) => {
    const input = options(),
      native = factory();
    input.drawing.shapeText!.underline = true;
    input.drawing.shapeText!.strike = true;
    input.layout = layout([
      {
        ...run("ab", angle),
        x: 10,
        y: 10,
        inkBounds: { x: 6, y: angle === 90 ? 10 : 2, width: 5, height: 8 },
      },
    ]);
    const result = paint(input, native.make);
    const painted = (result.canvas as unknown as MemoryCanvas).data.filter(
      (_, index) => index % 4 === 3 && _ > 0,
    ).length;
    expect(painted).toBeGreaterThan(32);
    expect(native.calls()).toHaveLength(1);
  });
  test("vertical body flip can consume a readable whole-run180 baseline and decorations", () => {
    const input = options(),
      native = factory();
    input.drawing.shapeText!.underline = true;
    input.layout = layout([
      { ...run("ab", 180), x: 10, y: 10, inkBounds: { x: 2, y: 10, width: 8, height: 5 } },
    ]);
    const result = paint(input, native.make),
      call = native.calls()[0]!;
    expect(call.text).toBe("ab");
    expect(call.matrix[0]).toBeCloseTo(-1);
    expect(call.matrix[3]).toBeCloseTo(-1);
    expect(pixel(result.canvas, 3, 12)[3]).toBe(255);
    expect(pixel(result.canvas, 3, 9)[3]).toBe(255);
    expect(result.sourceBounds.top).toBeLessThan(10);
  });
  test("overflow extends actual source and clip removes pixels outside physical content", () => {
    const input = options(),
      native = factory();
    input.layout = layout([
      { ...run("abcdefgh"), x: 18, inkBounds: { x: 18, y: 2, width: 32, height: 5 } },
    ]);
    const result = paint(input, native.make);
    expect(result.logicalBounds.right).toBeGreaterThan(20);
    expect(pixel(result.canvas, 30, 3)[3]).toBe(255);
    const clipped = options();
    clipped.layout = layout(
      [{ ...run("abcd"), x: 2, inkBounds: { x: 2, y: 2, width: 16, height: 5 } }],
      false,
    );
    const clipResult = paint(clipped, native.make);
    expect(pixel(clipResult.canvas, 12, 3)[3]).toBe(0);
    expect(pixel(clipResult.canvas, 3, 3)[3]).toBe(255);
  });
  test("solid alpha, gradient and pattern use real shared numeric paint sampling", () => {
    const native = factory(),
      input = options();
    const translucent = paint(
      { ...input, style: { fill: { kind: "value", value: solid("#ff0000", 0.5) } } },
      native.make,
    );
    expect(pixel(translucent.canvas, 3, 3)).toEqual([255, 0, 0, 128]);
    const gradient = paint(
      {
        ...input,
        style: {
          fill: {
            kind: "value",
            value: {
              kind: "linear",
              opacity: 1,
              rotateWithShape: true,
              angleDeg: 0,
              stops: [
                { offset: 0, color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, brightness: 0 },
                { offset: 1, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
              ],
            },
          },
        },
      },
      native.make,
    );
    expect(pixel(gradient.canvas, 3, 3)[0]).toBeGreaterThan(pixel(gradient.canvas, 8, 3)[0]!);
    const pattern = paint(
      {
        ...input,
        style: {
          fill: {
            kind: "value",
            value: {
              kind: "pattern",
              preset: "smCheck",
              foreground: { kind: "rgb", rgb: "#ffffff" },
              background: { kind: "rgb", rgb: "#000000" },
              opacity: 1,
              rotateWithShape: true,
            },
          },
        },
      },
      native.make,
    );
    expect(pixel(pattern.canvas, 3, 3)[3]).toBe(255);
    expect(pixel(pattern.canvas, 0, 0)[3]).toBe(0);
  });
  test("picture glyph fill uses real pixels and reports unavailable pixels without substitution", () => {
    const native = factory(),
      image = new MemoryCanvas();
    image.width = 2;
    image.height = 1;
    image.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const picture: ShapePaint = {
      kind: "picture",
      assetId: "glyph",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    const input = {
      ...options(),
      style: { fill: { kind: "value", value: picture } } as ShapeDetailedStyle,
      resources: {
        getAssetSize: () => ({ width: 2, height: 1 }),
        getAssetImage: () => image as unknown as HTMLCanvasElement,
      },
    };
    const result = paint(input, native.make);
    expect(pixel(result.canvas, 3, 3)[0]).toBeGreaterThan(0);
    expect(pixel(result.canvas, 0, 0)[3]).toBe(0);
    const broken = factory();
    const unavailable = prepareShapeTextPaint({
      ...input,
      canvasFactory: () => {
        const canvas = broken.make();
        if (broken.canvases.length === 2) (canvas as unknown as MemoryCanvas).failRead = true;
        return canvas;
      },
    });
    expect(unavailable).toMatchObject({
      kind: "unavailable",
      reason: "asset-pixels-unavailable",
      missingAssetIds: ["glyph"],
    });
    expect(broken.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("normal solid outline is native strokeText, rich outline is actual alpha contours", () => {
    const native = factory(),
      input = options(),
      line = {
        paint: solid("#ff0000"),
        widthPt: 1.5,
        compound: "single" as const,
        dash: "solid" as const,
        cap: "round" as const,
        join: "round" as const,
        miterLimit: 4,
      };
    paint({ ...input, style: { line: { kind: "value", value: line } } }, native.make);
    expect(native.calls().map((call) => call.mode)).toEqual(["fill", "stroke"]);
    const rich = factory();
    paint(
      {
        ...input,
        style: { line: { kind: "value", value: { ...line, compound: "double", dash: "dash" } } },
      },
      rich.make,
    );
    expect(rich.calls().map((call) => call.mode)).toEqual(["fill"]);
    expect(rich.canvases.flatMap((canvas) => canvas.context.strokes).length).toBeGreaterThan(0);
  });
  test("text effects derive from glyph alpha and never a colored body rectangle", () => {
    const native = factory(),
      result = paint(
        {
          ...options(),
          style: {
            glow: {
              kind: "value",
              value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 1.5 },
            },
          },
        },
        native.make,
      );
    const source = result.canvas as unknown as MemoryCanvas;
    expect(
      source.data.filter((value, index) => index % 4 === 3 && value > 0).length,
    ).toBeGreaterThan(32);
    expect(pixel(result.canvas, result.canvas.width - 1, result.canvas.height - 1)[3]).toBe(0);
  });
  test("captured silhouette is real numeric glyph extent and reserves its extra scratch", () => {
    const input = options(),
      native = factory();
    const result = ready(
      prepareShapeTextPaint({ ...input, captureSilhouette: true, canvasFactory: native.make }),
    );
    owned.push(result);
    expect(result.silhouette?.contours).toHaveLength(1);
    expect(result.silhouette?.contours[0]!.area).toBe(32);
    expect(result.sourceScratchBytes).toBeGreaterThan(12 * 1024 * 1024);
  });
});
describe("actual native glyph budgets before publishing an update", () => {
  test("own3D proof capture preserves clipped render density, bounds and native alpha", () => {
    const input = options(),
      native = factory();
    input.layout = layout(
      [
        {
          ...run("a".repeat(10000)),
          inkBounds: { x: 2, y: 2, width: 40000, height: 5 },
        },
      ],
      false,
    );
    input.layout.clipRect = { x: 1.25, y: 1.25, width: 8.5, height: 8.5 };
    const render = planShapeTextPaint({ ...input, style: glyph3dStyle() }),
      proof = planShapeTextPaint({ ...input, style: glyph3dStyle(), captureSilhouette: true });
    expect(proof.actualDensity).toBe(render.actualDensity);
    expect(proof.frontBoundsRaster).toEqual(render.frontBoundsRaster);
    expect(proof.sourceBounds).toEqual(render.sourceBounds);
    const ordinary = paint({ ...input, style: glyph3dStyle() }, native.make),
      captured = ready(
        prepareShapeTextPaint({
          ...input,
          style: glyph3dStyle(),
          captureSilhouette: true,
          canvasFactory: native.make,
        }),
      );
    owned.push(captured);
    expect(captured.logicalBounds).toEqual(ordinary.logicalBounds);
    expect((captured.canvas as unknown as MemoryCanvas).data).toEqual(
      (ordinary.canvas as unknown as MemoryCanvas).data,
    );
  });
  const richLine = (widthPt = 0.75): ShapeDetailedStyle => ({
    line: {
      kind: "value",
      value: {
        paint: solid("#ffffff"),
        widthPt,
        compound: "double",
        dash: "dash",
        cap: "round",
        join: "round",
        miterLimit: 4,
      },
    },
  });
  const separated = (count: number) =>
    Array.from({ length: count }, (_, index) => {
      const x = 2 + (index % 50) * 8,
        y = 6 + Math.floor(index / 50) * 8;
      return { ...run("a"), x, y, inkBounds: { x, y: y - 4, width: 4, height: 4 } };
    });
  test("high-density native staircases retry the exact density-1 glyph proof once", () => {
    // A slanted native glyph has many more alpha-cell vertices at high DPR.
    // Actual numeric alpha is traced; this double never throws a budget error.
    vi.spyOn(MemoryContext.prototype, "fillText").mockImplementation(
      function (this: MemoryContext, text, x, y) {
        this.calls.push({
          mode: "fill",
          text,
          font: this.font,
          direction: this.direction,
          matrix: [...this.matrix],
        });
        this.save();
        this.translate(x, y);
        this.rotate(Math.PI / 4);
        this.paintRect(0, -4, 4, 4);
        this.restore();
      },
    );
    const input = options(),
      native = factory(),
      proofNative = factory(),
      count = 50;
    input.drawing.width = 90;
    input.drawing.height = 50;
    input.layout = layout(
      Array.from({ length: count }, (_, index) => {
        const x = 2 + (index % 10) * 8,
          y = 6 + Math.floor(index / 10) * 8;
        return { ...run("a"), x, y, inkBounds: { x, y: y - 4, width: 6, height: 8 } };
      }),
    );
    const style = glyph3dStyle(),
      proof = preflightShapeTextGlyphBudgets({ ...input, style, canvasFactory: proofNative.make });
    expect(proof).toMatchObject({
      kind: "ready",
      proof: "painted-alpha-projection",
      actualDensity: 1,
    });
    expect(proofNative.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
    const rendered = ready(
      prepareShapeTextPaint({ ...input, density: 8, style, canvasFactory: native.make }),
    );
    try {
      expect(rendered.actualDensity).toBe(1);
      expect(rendered.glyphContourErrorLogicalPx).toBe(Math.SQRT2);
      expect(rendered.glyphGeometry!.paths[0]!.commands.length).toBeLessThanOrEqual(2048);
      const calls = native.calls();
      expect(calls).toHaveLength(count * 2);
      expect(calls[0]!.matrix[0]).toBe(8);
      expect(calls[count]!.matrix[0]).toBe(1);
      expect(native.canvases[0]!.width).toBe(0);
      expect(native.canvases[0]!.height).toBe(0);
      const reference = ready(
        prepareShapeTextPaint({ ...input, style, canvasFactory: proofNative.make }),
      );
      try {
        expect(rendered.logicalBounds).toEqual(reference.logicalBounds);
        expect((rendered.canvas as unknown as MemoryCanvas).data).toEqual(
          (reference.canvas as unknown as MemoryCanvas).data,
        );
      } finally {
        reference.dispose();
      }
    } finally {
      rendered.dispose();
    }
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
  });
  test.each([8, 1, 0.5])(
    "density %s never hides a density-1-or-lower contour failure",
    (density) => {
      const input = options(),
        native = factory();
      input.drawing.width = 410;
      input.drawing.height = 90;
      input.layout = layout(separated(500));
      expect(() =>
        prepareShapeTextPaint({
          ...input,
          density,
          style: glyph3dStyle(),
          canvasFactory: native.make,
        }),
      ).toThrow(/2048-command/);
      expect(native.calls()).toHaveLength(density > 1 ? 1000 : 500);
      expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
        true,
      );
      expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
    },
  );
  test("native font and read failures cannot masquerade as retryable contour budgets", () => {
    const native = factory(),
      failure = new RangeError("Glyph alpha contour exceeds its boundary edge budget."),
      draw = vi.spyOn(MemoryContext.prototype, "fillText").mockImplementation(() => {
        throw failure;
      });
    expect(() =>
      prepareShapeTextPaint({
        ...options(),
        density: 8,
        style: glyph3dStyle(),
        canvasFactory: native.make,
      }),
    ).toThrow(failure);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(native.canvases).toHaveLength(1);
    draw.mockRestore();
    const read = vi.spyOn(MemoryContext.prototype, "getImageData").mockImplementation(() => {
      throw failure;
    });
    expect(() =>
      prepareShapeTextPaint({
        ...options(),
        density: 8,
        style: glyph3dStyle(),
        canvasFactory: native.make,
      }),
    ).toThrow(failure);
    expect(read).toHaveBeenCalledTimes(1);
    expect(native.canvases).toHaveLength(2);
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
  });
  test("ordinary text does numeric proof without native allocation", () => {
    const native = vi.fn(),
      result = preflightShapeTextGlyphBudgets({ ...options(), canvasFactory: native });
    expect(result).toMatchObject({ kind: "ready", proof: "numeric-source", glyphCommandCount: 0 });
    expect(native).not.toHaveBeenCalled();
  });
  test("normal rich-outline proof needs actual native alpha but no picture reads", () => {
    const native = factory(),
      decode = vi.fn(),
      picture: ShapePaint = {
        kind: "picture",
        assetId: "unused-geometric-paint",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      };
    const style = richLine();
    style.fill = { kind: "value", value: picture };
    const result = preflightShapeTextGlyphBudgets({
      ...options(),
      style,
      resources: { getAssetImage: decode },
      canvasFactory: native.make,
    });
    expect(result).toMatchObject({
      kind: "ready",
      proof: "native-alpha-outline",
      contourCount: 1,
      pointCount: 4,
    });
    expect(decode).not.toHaveBeenCalled();
    expect(native.calls()[0]!.text).toBe("ab");
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("native separated glyph contours reject own3D commands before an update publishes", () => {
    const input = options(),
      native = factory(),
      commit = vi.fn();
    input.drawing.width = 410;
    input.drawing.height = 90;
    input.layout = layout(separated(500));
    expect(() => {
      const proof = preflightShapeTextGlyphBudgets({
        ...input,
        style: glyph3dStyle(),
        canvasFactory: native.make,
      });
      if (proof.kind === "ready") commit();
    }).toThrow(/2048-command/);
    expect(commit).not.toHaveBeenCalled();
    expect(native.calls()).toHaveLength(500);
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(getShapeTextPaintOwnedBytes().liveResults).toBe(0);
  });
  test("own3D no-fill separated glyphs prove only final zero alpha and release all bytes", () => {
    const input = options(),
      native = factory();
    input.drawing.width = 410;
    input.drawing.height = 410;
    input.layout = layout(separated(2500));
    const style: ShapeDetailedStyle = {
        ...glyph3dStyle(),
        fill: { kind: "none" },
        line: { kind: "none" },
      },
      proof = preflightShapeTextGlyphBudgets({ ...input, style, canvasFactory: native.make });
    expect(proof).toMatchObject({
      kind: "ready",
      proof: "painted-alpha-projection",
      contourCount: 0,
      edgeCount: 0,
      pointCount: 0,
      glyphCommandCount: 0,
    });
    expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    const rendered = ready(prepareShapeTextPaint({ ...input, style, canvasFactory: native.make }));
    try {
      expect(rendered.glyphGeometry).toBeUndefined();
      expect((rendered.canvas as unknown as MemoryCanvas).data.every((value) => value === 0)).toBe(
        true,
      );
    } finally {
      rendered.dispose();
    }
    expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("native component edges reject compound outline before an update publishes", () => {
    const input = options(),
      native = factory(),
      commit = vi.fn();
    input.drawing.width = 410;
    input.drawing.height = 410;
    input.layout = layout(separated(2500));
    expect(() => {
      const proof = preflightShapeTextGlyphBudgets({
        ...input,
        style: richLine(),
        canvasFactory: native.make,
      });
      if (proof.kind === "ready") commit();
    }).toThrow(/edge budget/);
    expect(commit).not.toHaveBeenCalled();
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("real contour dash intervals reject narrow dashed outline before publishing", () => {
    const native = factory(),
      commit = vi.fn();
    expect(() => {
      const proof = preflightShapeTextGlyphBudgets({
        ...options(),
        style: richLine(0.000001),
        canvasFactory: native.make,
      });
      if (proof.kind === "ready") commit();
    }).toThrow(/interval budget/);
    expect(commit).not.toHaveBeenCalled();
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("text-own3D proof uses composed alpha and releases its real raster", () => {
    const input = options(),
      native = factory();
    input.layout = layout([glyphRun("O")]);
    const result = preflightShapeTextGlyphBudgets({
      ...input,
      style: glyph3dStyle(),
      canvasFactory: native.make,
    });
    expect(result).toMatchObject({
      kind: "ready",
      proof: "painted-alpha-projection",
      contourCount: 2,
      glyphCommandCount: 10,
    });
    expect(getShapeTextPaintOwnedBytes().liveCanvases).toBe(0);
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("picture alpha needed by own3D stays unavailable before publishing", () => {
    const native = vi.fn(),
      decode = vi.fn(),
      picture: ShapePaint = {
        kind: "picture",
        assetId: "needed-alpha",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      };
    const result = preflightShapeTextGlyphBudgets({
      ...options(),
      style: { ...glyph3dStyle(), fill: { kind: "value", value: picture } },
      resources: { getAssetSize: () => ({ width: 10, height: 10 }), getAssetImage: decode },
      canvasFactory: native,
    });
    expect(result).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["needed-alpha"],
    });
    expect(native).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledWith("needed-alpha");
  });
});
describe("true painted glyph text-own3D", () => {
  test("counter holes and concavity drive actual extrusion geometry rather than a frame", () => {
    const native = factory(),
      input = options();
    input.layout = layout([
      glyphRun("O"),
      { ...glyphRun("L"), x: 12, inkBounds: { x: 12, y: 2, width: 8, height: 8 } },
    ]);
    const result = ready(
      prepareShapeTextPaint({
        ...input,
        style: glyph3dStyle(),
        captureSilhouette: true,
        canvasFactory: native.make,
      }),
    );
    owned.push(result);
    const commands = result.glyphGeometry!.paths[0]!.commands;
    expect(commands.filter((command) => command[0] === "M")).toHaveLength(3);
    expect(commands.filter((command) => command[0] === "Z")).toHaveLength(3);
    expect(commands.length).toBeGreaterThan(15); // L has genuine concave vertices.
    expect(result.silhouette!.contours.some((contour) => contour.area < 0)).toBe(true);
    expect(result.silhouette!.contours.filter((contour) => contour.area > 0)).toHaveLength(2);
    expect(result.isProjected).toBe(true);
    expect(
      (result.canvas as unknown as MemoryCanvas).data.some(
        (value, index) => index % 4 === 3 && value > 0,
      ),
    ).toBe(true);
    expect(result.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
  });
  test("translucent front alpha still has a real glyph silhouette", () => {
    const native = factory(),
      input = options();
    input.layout = layout([glyphRun("O")]);
    const result = paint(
      {
        ...input,
        style: { ...glyph3dStyle(), fill: { kind: "value", value: solid("#123456", 0.1) } },
      },
      native.make,
    );
    expect(
      result.glyphGeometry!.paths[0]!.commands.filter((command) => command[0] === "Z"),
    ).toHaveLength(2);
    expect(
      (result.canvas as unknown as MemoryCanvas).data.some(
        (value, index) => index % 4 === 3 && value > 0,
      ),
    ).toBe(true);
  });
  test("zero painted glyph alpha never fabricates depth or contour rectangle pixels", () => {
    const native = factory(),
      result = paint(
        {
          ...options(),
          style: { ...glyph3dStyle(), fill: { kind: "none" }, line: { kind: "none" } },
        },
        native.make,
      );
    expect(result.glyphGeometry).toBeUndefined();
    expect((result.canvas as unknown as MemoryCanvas).data.every((value) => value === 0)).toBe(
      true,
    );
  });
  test("outline alpha contributes to the extruded source and soft edges apply once", () => {
    const native = factory(),
      input = options();
    input.layout = layout([glyphRun("O")]);
    const result = paint(
      {
        ...input,
        style: {
          ...glyph3dStyle(),
          line: {
            kind: "value",
            value: {
              paint: solid("#00ff00"),
              widthPt: 1.5,
              compound: "single",
              dash: "solid",
              cap: "round",
              join: "round",
              miterLimit: 4,
            },
          },
          softEdges: { kind: "value", value: { sizePt: 0.75 } },
        },
      },
      native.make,
    );
    expect(result.glyphGeometry).toBeDefined();
    expect(result.isProjected).toBe(true);
    const x = result.glyphGeometry!.paths[0]!.commands.flatMap((command) =>
      command[0] === "M" || command[0] === "L" ? [command[1]] : [],
    );
    // The alpha-softening stage can erase its outermost low-coverage cell. The
    // compositor receives no second softEdges pass after tracing this front.
    expect(Math.min(...x)).toBeLessThanOrEqual(2);
    expect(result.style?.softEdges).toEqual({ kind: "none" });
    expect(result.effectiveStyle.softEdges).toEqual({ kind: "value", value: { sizePt: 0.75 } });
  });
  test("local3D cache returns actual projected bounds and independent owned canvas", () => {
    const native = factory();
    vi.stubGlobal("document", { createElement: () => native.make() });
    const input = options();
    input.layout = layout([glyphRun("O")]);
    const first = ready(
      prepareShapeTextPaint({ ...input, style: glyph3dStyle(), key: "3d-font1" }),
    );
    owned.push(first);
    const calls = native.calls().length,
      second = ready(prepareShapeTextPaint({ ...input, style: glyph3dStyle(), key: "3d-font1" }));
    owned.push(second);
    expect(native.calls()).toHaveLength(calls);
    expect(second.logicalBounds).toEqual(first.logicalBounds);
    expect(second.glyphGeometry).toEqual(first.glyphGeometry);
    expect(second.canvas).not.toBe(first.canvas);
    first.dispose();
    expect(second.canvas.width).toBeGreaterThan(0);
  });
});
describe("detached cache and returned Canvas ownership", () => {
  test("document language changes invalidate an otherwise identical paint cache key", () => {
    const native = factory();
    const documentElement = { lang: "zh-CN" };
    vi.stubGlobal("document", { documentElement, createElement: () => native.make() });
    const input = { ...options(), key: "same-font-revision" };
    owned.push(ready(prepareShapeTextPaint(input)));
    const calls = native.calls().length;
    owned.push(ready(prepareShapeTextPaint(input)));
    expect(native.calls()).toHaveLength(calls);
    documentElement.lang = "en-US";
    const next = ready(prepareShapeTextPaint(input));
    owned.push(next);
    expect(native.calls().length).toBeGreaterThan(calls);
    expect(next.canvas.lang).toBe("en-US");
  });

  test("cache borrows no returned Canvas; dispose is independent and idempotent", () => {
    const native = factory();
    vi.stubGlobal("document", { createElement: () => native.make() });
    const input = options();
    const first = ready(prepareShapeTextPaint({ ...input, key: "font-revision1" }));
    owned.push(first);
    const calls = native.calls().length,
      second = ready(prepareShapeTextPaint({ ...input, key: "font-revision1" }));
    owned.push(second);
    expect(native.calls()).toHaveLength(calls);
    expect(second.canvas).not.toBe(first.canvas);
    first.dispose();
    first.dispose();
    expect(first.canvas.width).toBe(0);
    expect(second.canvas.width).toBeGreaterThan(0);
    expect(getShapeTextPaintOwnedBytes().liveCanvases).toBe(
      second.canvas.width * second.canvas.height * 4,
    );
    const third = ready(prepareShapeTextPaint({ ...input, key: "font-revision2" }));
    owned.push(third);
    expect(native.calls().length).toBeGreaterThan(calls);
    clearShapeTextPaintCache();
    expect(second.canvas.width).toBeGreaterThan(0);
    expect(getShapeTextPaintOwnedBytes().cached).toBe(0);
  });
  test("missing decoded resources return typed failure before native allocations", () => {
    const native = factory(),
      input = options();
    const picture: ShapePaint = {
      kind: "picture",
      assetId: "missing",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    expect(
      prepareShapeTextPaint({
        ...input,
        style: { fill: { kind: "value", value: picture } },
        resources: { getAssetSize: () => ({ width: 1, height: 1 }) },
        canvasFactory: native.make,
      }),
    ).toMatchObject({ kind: "unavailable", missingAssetIds: ["missing"] });
    expect(native.canvases).toHaveLength(0);
  });
});

describe("attributed actual glyph and decoration pixels", () => {
  const attributedRuns = (): ShapeTextRun[] => [
    { ...run("a"), sourceStart: 0, sourceEnd: 1, underline: true, strike: false, color: "#ff0000" },
    {
      ...run("b"),
      sourceStart: 1,
      sourceEnd: 2,
      x: 10,
      inkBounds: { x: 10, y: 2, width: 4, height: 5 },
      underline: false,
      strike: true,
    },
  ];
  test("selected RGB colors actual glyphs and decorations and explicit false overrides base", () => {
    const input = options(),
      native = factory();
    input.drawing.shapeText!.underline = true;
    input.layout = layout(attributedRuns());
    const result = paint(input, native.make);
    expect(pixel(result.canvas, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(result.canvas, 11, 3)).toEqual([18, 52, 86, 255]);
    expect(pixel(result.canvas, 3, 6)).toEqual([255, 0, 0, 255]);
    expect(pixel(result.canvas, 11, 6)[3]).toBe(0);
    expect(native.calls().map((call) => call.text)).toEqual(["a", "b", "a", "b"]);
  });
  test("selected strike draws real colored alpha on a whitespace run", () => {
    const input = options();
    input.layout = layout([{ ...run(" "), underline: false, strike: true, color: "#00ff00" }]);
    const result = paint(input, factory().make);
    expect(pixel(result.canvas, 3, 4)).toEqual([0, 255, 0, 255]);
    expect(pixel(result.canvas, 3, 3)[3]).toBe(0);
  });
  test("native glyph calls consume the selected family, size, weight and italic tuple", () => {
    const input = options(),
      native = factory();
    input.layout = layout([
      {
        ...run("a"),
        font: { family: "Selected Family", size: 24, weight: 700, italic: true },
        color: "#ff0000",
      },
      {
        ...run("b"),
        font: { family: "Ordinary Family", size: 12, weight: 400, italic: false },
        x: 10,
      },
    ]);
    paint(input, native.make);
    expect(native.calls().map((call) => call.font)).toEqual([
      'italic 700 24px "Selected Family"',
      '400 12px "Ordinary Family"',
      'italic 700 24px "Selected Family"',
      '400 12px "Ordinary Family"',
    ]);
  });
  test("uncolored spans retain detailed gradient fill while selected RGB overrides it", () => {
    const input = options();
    input.layout = layout(attributedRuns());
    const result = paint(
      {
        ...input,
        style: {
          fill: {
            kind: "value",
            value: {
              kind: "linear",
              opacity: 1,
              rotateWithShape: true,
              angleDeg: 0,
              stops: [
                { offset: 0, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
                { offset: 1, color: { kind: "rgb", rgb: "#00ff00" }, opacity: 1, brightness: 0 },
              ],
            },
          },
        },
      },
      factory().make,
    );
    expect(pixel(result.canvas, 3, 3)).toEqual([255, 0, 0, 255]);
    const inherited = pixel(result.canvas, 11, 3);
    expect(inherited[0]).toBe(0);
    expect(inherited[1]).toBeGreaterThan(0);
    expect(inherited[2]).toBeGreaterThan(0);
    expect(inherited[3]).toBe(255);
  });
  test("transparent range has no front alpha while inherited glyphs remain", () => {
    const input = options();
    input.layout = layout(
      attributedRuns().map((value, index) => (index ? value : { ...value, color: "transparent" })),
    );
    const result = paint(input, factory().make);
    expect(pixel(result.canvas, 3, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.canvas, 3, 6)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.canvas, 11, 3)[3]).toBe(255);
  });
  test("front spans retain source painter order when glyphs overlap", () => {
    const input = options();
    input.layout = layout([
      { ...run("a"), color: "#ff0000" },
      { ...run("b"), color: "#0000ff" },
      { ...run("c"), color: "#00ff00" },
    ]);
    const result = paint(input, factory().make);
    expect(pixel(result.canvas, 3, 3)).toEqual([0, 255, 0, 255]);
  });
  test("uniform outline is retained on a transparent colored range", () => {
    const input = options();
    input.layout = layout([{ ...run("a"), color: "transparent" }]);
    const result = paint(
      {
        ...input,
        style: {
          line: {
            kind: "value",
            value: {
              paint: solid("#00ff00"),
              widthPt: 1.5,
              compound: "single",
              dash: "solid",
              cap: "butt",
              join: "round",
              miterLimit: 4,
            },
          },
        },
      },
      factory().make,
    );
    const at = (x: number, y: number) =>
      pixel(
        result.canvas,
        Math.floor((x - result.logicalBounds.left) * result.actualDensity),
        Math.floor((y - result.logicalBounds.top) * result.actualDensity),
      );
    expect(at(2, 3)).toEqual([0, 255, 0, 255]);
    expect(at(4, 4)[3]).toBe(0);
  });
  test("raster span scans fail explicitly at the aggregate work limit", () => {
    const input = options();
    input.drawing.width = 1024;
    input.drawing.height = 1024;
    input.layout = layout(
      Array.from({ length: 100 }, (_, index) => ({
        ...run("x"),
        color: index % 2 ? "#ff0000" : "#0000ff",
        inkBounds: { x: 0, y: 0, width: 1024, height: 1024 },
      })),
    );
    expect(() => planShapeTextPaint(input)).toThrow(/raster-span work budget/);
  });
});

describe("run-local modern WordArt glyph appearance", () => {
  const line = (rgb = "#0000ff", widthPt = 1.5) => ({
    kind: "value" as const,
    value: {
      paint: solid(rgb),
      widthPt,
      compound: "single" as const,
      dash: "solid" as const,
      cap: "butt" as const,
      join: "round" as const,
      miterLimit: 4,
    },
  });
  const separatedRuns = (): ShapeTextRun[] => [
    {
      ...run("alpha"),
      fill: { kind: "value", value: solid("#ff0000") },
      line: line(),
      underline: true,
    },
    { ...run("beta"), x: 30, inkBounds: { x: 30, y: 2, width: 16, height: 5 } },
  ];
  const at = (result: ReturnType<typeof paint>, x: number, y: number) =>
    pixel(
      result.canvas,
      Math.floor((x - result.logicalBounds.left) * result.actualDensity),
      Math.floor((y - result.logicalBounds.top) * result.actualDensity),
    );
  test("selected fill and native outline paint only their authored whole run and decorations", () => {
    const input = options(),
      native = factory();
    input.drawing.width = 50;
    input.layout = layout(separatedRuns());
    const result = paint(input, native.make);
    expect(at(result, 5, 3)).toEqual([255, 0, 0, 255]);
    expect(at(result, 1, 3)).toEqual([0, 0, 255, 255]);
    expect(at(result, 5, 7)).toEqual([0, 0, 255, 255]);
    expect(at(result, 31, 3)).toEqual([18, 52, 86, 255]);
    expect(at(result, 29, 3)[3]).toBe(0);
    expect(
      native
        .calls()
        .filter((call) => call.mode === "stroke")
        .map((call) => call.text),
    ).toEqual(["alpha"]);
    expect(native.calls().every((call) => ["alpha", "beta"].includes(call.text))).toBe(true);
  });
  test("direct RGB wins over run paint; explicit None removes inherited fill and line", () => {
    const input = options();
    input.drawing.width = 50;
    input.layout = layout([
      { ...run("a"), color: "#00ff00", fill: { kind: "none" }, line: { kind: "none" } },
      {
        ...run("b"),
        x: 30,
        inkBounds: { x: 30, y: 2, width: 4, height: 5 },
        fill: { kind: "none" },
        line: { kind: "none" },
      },
    ]);
    const result = paint({ ...input, style: { line: line() } }, factory().make);
    expect(at(result, 3, 3)).toEqual([0, 255, 0, 255]);
    expect(at(result, 1, 3)[3]).toBe(0);
    expect(at(result, 31, 3)[3]).toBe(0);
    expect(result.sourceBounds.right).toBeLessThan(30);
  });
  test("effective run picture resources fail before native allocation and unused inherited assets do not", () => {
    const input = options(),
      make = vi.fn(),
      decode = vi.fn();
    const picture: ShapePaint = {
      kind: "picture",
      assetId: "selected-glyph",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    input.layout.runs[0]!.fill = { kind: "value", value: picture };
    expect(
      prepareShapeTextPaint({
        ...input,
        canvasFactory: make,
        resources: { getAssetImage: decode },
      }),
    ).toMatchObject({ kind: "unavailable", missingAssetIds: ["selected-glyph"] });
    expect(make).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    input.layout.runs[0]!.color = "#ff0000";
    expect(
      planShapeTextPaint({ ...input, style: { fill: { kind: "value", value: picture } } }).assetIds,
    ).toEqual([]);
  });
  test("run outline participates in source bounds and captured painted alpha", () => {
    const input = options();
    input.layout = layout([{ ...run("a"), fill: { kind: "none" }, line: line("#0000ff", 1.5) }]);
    const result = ready(
      prepareShapeTextPaint({ ...input, captureSilhouette: true, canvasFactory: factory().make }),
    );
    owned.push(result);
    expect(result.sourceBounds.left).toBeLessThan(2);
    expect(result.silhouette?.contours[0]?.area).toBeGreaterThan(16);
    expect(result.silhouette?.contours.some((contour) => contour.area < 0)).toBe(true);
  });
  test("selected gradient sampling retains the uniform drawing coordinate system", () => {
    const input = options();
    input.layout = layout([
      { ...run("a"), line: { kind: "none" } },
      { ...run("b"), x: 10, inkBounds: { x: 10, y: 2, width: 4, height: 5 } },
    ]);
    const gradient: ShapePaint = {
      kind: "linear",
      opacity: 1,
      rotateWithShape: true,
      angleDeg: 0,
      stops: [
        { offset: 0, color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, brightness: 0 },
        { offset: 1, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
      ],
    };
    const uniform = paint(
      { ...input, style: { fill: { kind: "value", value: gradient } } },
      factory().make,
    );
    input.layout.runs[1]!.fill = { kind: "value", value: gradient };
    const selected = paint(input, factory().make);
    expect(at(selected, 11, 3)).toEqual(at(uniform, 11, 3));
    expect(at(selected, 13, 3)).toEqual(at(uniform, 13, 3));
    expect(at(selected, 3, 3)).toEqual([18, 52, 86, 255]);
  });
  test("selected picture fill and picture outline decode their own real assets", () => {
    const input = options(),
      native = factory(),
      image = new MemoryCanvas();
    image.width = 1;
    image.height = 1;
    image.data.set([255, 0, 255, 255]);
    const picture: ShapePaint = {
      kind: "picture",
      assetId: "selected-texture",
      opacity: 1,
      rotateWithShape: true,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    input.layout = layout([
      { ...run("a"), fill: { kind: "value", value: picture } },
      {
        ...run("b"),
        x: 10,
        inkBounds: { x: 10, y: 2, width: 4, height: 5 },
        line: { ...line(), value: { ...line().value, paint: picture } },
      },
    ]);
    const result = paint(
      {
        ...input,
        resources: {
          getAssetSize: () => ({ width: 1, height: 1 }),
          getAssetImage: () => image as unknown as HTMLCanvasElement,
        },
      },
      native.make,
    );
    expect(result.assetIds).toEqual(["selected-texture"]);
    expect(at(result, 3, 3)).toEqual([255, 0, 255, 255]);
    expect(at(result, 9, 3)).toEqual([255, 0, 255, 255]);
    expect(at(result, 11, 3)).toEqual([18, 52, 86, 255]);
  });
  test("run fill/outline content changes invalidate otherwise identical paint cache keys", () => {
    const input = options(),
      native = factory();
    vi.stubGlobal("document", { createElement: () => native.make() });
    input.layout.runs[0]!.fill = { kind: "value", value: solid("#ff0000") };
    input.layout.runs[0]!.line = line("#0000ff");
    const first = ready(prepareShapeTextPaint({ ...input, key: "same-font-owner" }));
    owned.push(first);
    const calls = native.calls().length;
    input.layout.runs[0]!.fill = { kind: "value", value: solid("#00ff00") };
    input.layout.runs[0]!.line = line("#ff0000");
    const second = ready(prepareShapeTextPaint({ ...input, key: "same-font-owner" }));
    owned.push(second);
    expect(native.calls().length).toBeGreaterThan(calls);
    expect(at(first, 5, 3)).toEqual([255, 0, 0, 255]);
    expect(at(second, 5, 3)).toEqual([0, 255, 0, 255]);
    expect(at(second, 1, 3)).toEqual([255, 0, 0, 255]);
  });
  test("uniform glow consumes selected outline-only alpha with no body plate", () => {
    const input = options();
    input.layout = layout([{ ...run("a"), fill: { kind: "none" }, line: line() }]);
    const result = paint(
      {
        ...input,
        style: {
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 1.5 },
          },
        },
      },
      factory().make,
    );
    expect(at(result, 1, 3)).toEqual([0, 0, 255, 255]);
    expect(at(result, 0, 3)[3]).toBeGreaterThan(0);
    expect(at(result, 0, 3)[0]).toBeGreaterThan(0);
    expect(at(result, 18, 14)[3]).toBe(0);
  });
  test("local outline changes have real projected glyph geometry", () => {
    const input = options();
    input.layout = layout([{ ...run("a"), fill: { kind: "none" }, line: line() }]);
    const result = paint({ ...input, style: glyph3dStyle() }, factory().make);
    expect(result.requiresGlyphProjection).toBe(true);
    expect(result.glyphGeometry?.paths[0]?.commands.length).toBeGreaterThan(0);
    expect(result.glyphGeometry?.paths[0]?.commands).not.toEqual([
      ["M", 0, 0],
      ["L", 20, 0],
      ["L", 20, 16],
      ["L", 0, 16],
      ["Z"],
    ]);
  });
  test("local outline spans and nested paint data have explicit aggregate preflight bounds", () => {
    const input = options(),
      localLine = line();
    input.layout.runs[0]!.line = localLine;
    const detached = planShapeTextPaint(input);
    localLine.value.widthPt = 12;
    localLine.value.paint.opacity = 0;
    expect(detached.runs[0]!.line).toMatchObject({
      value: { widthPt: 1.5, paint: { opacity: 1 } },
    });
    expect(Object.isFrozen(detached.runs[0]!.line)).toBe(true);
    input.drawing.width = 1024;
    input.drawing.height = 1024;
    input.layout = layout(
      Array.from({ length: 100 }, (_, index) => ({
        ...run("x"),
        line: line(index % 2 ? "#ff0000" : "#0000ff"),
        inkBounds: { x: 0, y: 0, width: 1024, height: 1024 },
      })),
    );
    expect(() => planShapeTextPaint(input)).toThrow(/raster-span work budget/);
  });
  test("local compound outline preflight traces only selected glyphs", () => {
    const input = options(),
      native = factory();
    const selected = separatedRuns();
    selected[0]!.line = { ...line(), value: { ...line().value, compound: "double", dash: "dash" } };
    input.layout = layout(selected);
    const proof = preflightShapeTextGlyphBudgets({ ...input, canvasFactory: native.make });
    expect(proof).toMatchObject({ kind: "ready", proof: "native-alpha-outline", contourCount: 1 });
    expect(native.calls().map((call) => call.text)).toEqual(["alpha"]);
  });
});

describe("native colored glyph RGBA in ordinary solid text", () => {
  const at = (result: ReturnType<typeof paint>, x: number, y: number) =>
    pixel(
      result.canvas,
      Math.floor(x * result.actualDensity - result.outputBoundsRaster.left),
      Math.floor(y * result.actualDensity - result.outputBoundsRaster.top),
    );
  function coloredInput() {
    const original = MemoryContext.prototype.fillText;
    vi.spyOn(MemoryContext.prototype, "fillText").mockImplementation(function (
      this: MemoryContext,
      text: string,
      x: number,
      y: number,
    ) {
      original.call(this, text, x, y);
      if (text !== "a🙂") return;
      const previous = this.fillStyle;
      // A color-font face ignores ordinary fillStyle, including white mask paint.
      this.fillStyle = "#ffcc00";
      this.paintRect(x + 4, y - 4, 4, 4);
      this.fillStyle = "#332211";
      this.paintRect(x + 5, y - 3, 1, 1);
      const edge = this.transformed(x + 7, y - 4);
      this.pixel(Math.floor(edge.x), Math.floor(edge.y), [255, 204, 0, 128]);
      this.fillStyle = previous;
    });
    const input = options();
    input.layout = layout([run("a🙂")]);
    return input;
  }
  test("uniform fill keeps native face details and authored ordinary text color", () => {
    const input = coloredInput(),
      before = JSON.stringify(input),
      native = factory(),
      result = paint(input, native.make);
    expect(at(result, 3, 3)).toEqual([18, 52, 86, 255]);
    expect(at(result, 6, 3)).toEqual([255, 204, 0, 255]);
    expect(at(result, 7, 3)).toEqual([51, 34, 17, 255]);
    expect(at(result, 9, 2)).toEqual([255, 204, 0, 128]);
    expect(native.calls().map((call) => call.text)).toEqual(["a🙂"]);
    expect(JSON.stringify(input)).toBe(before);
  });
  test.each([false, true])("solid opacity is applied once (attributed=%s)", (attributed) => {
    const input = coloredInput();
    const fill = { kind: "value", value: solid("#00ff00", 0.5) } as const;
    if (attributed) input.layout.runs[0]!.fill = fill;
    else input.drawing.shapeText!.style = { fill };
    const result = paint(input, factory().make);
    expect(at(result, 3, 3)).toEqual([0, 255, 0, 128]);
    expect(at(result, 6, 3)).toEqual([255, 204, 0, 128]);
    expect(at(result, 7, 3)).toEqual([51, 34, 17, 128]);
    expect(at(result, 9, 2)).toEqual([255, 204, 0, 64]);
  });
  test("explicit RGB and owned character-effect fronts retain color", () => {
    const input = coloredInput();
    input.layout.runs[0]!.color = "#00ff00";
    input.layout.runs[0]!.reflection = {
      kind: "value",
      value: { size: 1, opacity: 1, blurPt: 0, distancePt: 0 },
    };
    const result = paint(input, factory().make);
    expect(result.attributedEffects).toBe(true);
    expect(at(result, 3, 3)).toEqual([0, 255, 0, 255]);
    expect(at(result, 6, 3)).toEqual([255, 204, 0, 255]);
    // The reflected owner must also retain native yellow, not the run's green.
    const data = (result.canvas as unknown as MemoryCanvas).data;
    let reflectedYellow = false;
    for (let y = 7; y < result.canvas.height; y++)
      for (let x = 0; x < result.canvas.width; x++) {
        const index = (y * result.canvas.width + x) * 4;
        if (data[index] === 255 && data[index + 1] === 204 && data[index + 3]! > 0)
          reflectedYellow = true;
      }
    expect(reflectedYellow).toBe(true);
  });
  test.each(["none", "transparent", "zero"] as const)("%s never leaks native color", (kind) => {
    const input = coloredInput();
    if (kind === "transparent") input.layout.runs[0]!.color = "transparent";
    else
      input.drawing.shapeText!.style = {
        fill: kind === "none" ? { kind: "none" } : { kind: "value", value: solid("#00ff00", 0) },
      };
    const result = paint(input, factory().make);
    expect(at(result, 3, 3)).toEqual([0, 0, 0, 0]);
    expect(at(result, 6, 3)).toEqual([0, 0, 0, 0]);
  });
  test("clipping applies to native color and cached results remain independently owned", () => {
    const input = coloredInput(),
      native = factory();
    input.layout = {
      ...input.layout,
      overflow: false,
      clipRect: { x: 0, y: 0, width: 7, height: 8 },
    };
    vi.stubGlobal("document", { createElement: () => native.make() });
    const first = ready(prepareShapeTextPaint({ ...input, key: "ready-font-1" }));
    owned.push(first);
    const calls = native.calls().length;
    const second = ready(prepareShapeTextPaint({ ...input, key: "ready-font-1" }));
    owned.push(second);
    expect(native.calls()).toHaveLength(calls);
    expect(at(second, 6, 3)).toEqual([255, 204, 0, 255]);
    expect(at(second, 7, 3)[3]).toBe(0);
    first.dispose();
    expect(at(second, 6, 3)).toEqual([255, 204, 0, 255]);
    second.dispose();
    clearShapeTextPaintCache();
    expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
  });
  test("gradient retains its explicit alpha-mask appearance policy", () => {
    const input = coloredInput();
    input.drawing.shapeText!.style = {
      fill: {
        kind: "value",
        value: {
          kind: "linear",
          angleDeg: 0,
          rotateWithShape: true,
          opacity: 1,
          stops: [
            { offset: 0, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
            { offset: 1, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
          ],
        },
      },
    };
    const result = paint(input, factory().make);
    expect(at(result, 6, 3)).toEqual([0, 0, 255, 255]);
    expect(at(result, 7, 3)).toEqual([0, 0, 255, 255]);
  });
});
