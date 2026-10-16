// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle, ShapePaint, ShapeShadow } from "@sheetcraft/core/shape-style";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { layoutDrawingShapeText } from "../../../modules/sheet-drawings/shape-text-runtime";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import { clearShapeDetailedPaintCache } from "../../../modules/sheet-drawings/shape-detailed-paint";
import { detailedShapeContainsWorldPoint } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import {
  createPrintShapeMetrics,
  paintPrintShapes,
} from "../../../modules/page-layout/page-print-shapes";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import type {
  ShapeTextLayoutResult,
  ShapeTextRun,
} from "../../../modules/sheet-drawings/shape-text-layout";
import {
  clearShapeTextPaintCache,
  getShapeTextPaintOwnedBytes,
  planShapeTextPaint,
  preflightShapeTextGlyphBudgets,
  prepareShapeTextPaint,
  SHAPE_TEXT_PAINT_LIMITS,
  type ShapeTextPaintOptions,
  type ShapeTextPaintReady,
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

const owned: ShapeTextPaintReady[] = [];
afterEach(() => {
  for (const value of owned.splice(0)) value.dispose();
  clearShapeTextPaintCache();
  clearShapeDetailedPaintCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(getShapeTextPaintOwnedBytes()).toEqual({ cached: 0, liveCanvases: 0, liveResults: 0 });
});
function run(text = "a", x = 2, y = 8): ShapeTextRun {
  return {
    text,
    font: { family: "Exact Family", size: 16, weight: 400, italic: false },
    direction: "ltr",
    x,
    y,
    angle: 0,
    advancePx: text.length * 4,
    inlineAdvancePx: text.length * 4,
    ascentPx: 4,
    descentPx: 1,
    inkBounds: { x, y: y - 4, width: text.length * 4, height: 4 },
  };
}
function layout(runs: ShapeTextRun[]): ShapeTextLayoutResult {
  return {
    runs,
    lines: [],
    contentRect: { x: 0, y: 0, width: 28, height: 20 },
    clipRect: null,
    overflow: true,
    inkBounds: null,
    visibleInkBounds: null,
    inkBoundsAccuracy: "ink-metrics",
    requiredExtent: { width: 28, height: 20, inline: 28, block: 20 },
    fits: true,
    measurementCount: 1,
    verticalGlyphPolicy: "unicode-17-uax50-fallback",
  };
}
function input(runs: ShapeTextRun[] = [run(), run("b", 14)]) {
  const drawing: SheetGraphicDrawing = {
    ...createGraphicDrawing("effects", "shape", "Effects", { row: 0, column: 0 }),
    width: 28,
    height: 20,
    text: "ab",
    color: "#123456",
    rotation: 0,
    shapeText: createDefaultShapeText(),
  };
  return { drawing, layout: layout(runs), density: 1 } satisfies ShapeTextPaintOptions;
}
function paint(value: ShapeTextPaintOptions, native = factory()): ShapeTextPaintReady {
  const result = prepareShapeTextPaint({ ...value, canvasFactory: native.make });
  if (result.kind !== "ready") throw new Error("Expected actual glyph effect raster.");
  owned.push(result);
  return result;
}
function at(value: ShapeTextPaintReady, x: number, y: number): number[] {
  const canvas = value.canvas as unknown as MemoryCanvas,
    px = Math.floor(x * value.actualDensity - value.outputBoundsRaster.left),
    py = Math.floor(y * value.actualDensity - value.outputBoundsRaster.top);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return [0, 0, 0, 0];
  const index = (py * canvas.width + px) * 4;
  return [...canvas.data.subarray(index, index + 4)];
}
const none = { kind: "none" } as const;
const solid = (rgb: string, opacity = 1): ShapePaint => ({
  kind: "solid",
  color: { kind: "rgb", rgb },
  opacity,
});
function shadow(kind: "outer" | "inner" = "outer", color = "#ff0000"): ShapeShadow {
  return {
    kind,
    color: { kind: "rgb", rgb: color },
    opacity: 1,
    scale: 1,
    blurPt: 0,
    distancePt: 6,
    angleDeg: 0,
    anchor: "center",
  };
}
const effectStyle: ShapeDetailedStyle = {
  shadow: { kind: "value", value: shadow() },
  glow: {
    kind: "value",
    value: { color: { kind: "rgb", rgb: "#00ff00" }, opacity: 1, sizePt: 1.5 },
  },
  reflection: { kind: "value", value: { size: 1, opacity: 1, blurPt: 0, distancePt: 0 } },
};

describe("bounded real per-character effect masks", () => {
  test("no attributed fields retains the uniform native fast path", () => {
    const native = factory(),
      value = input([run("ab")]);
    const result = paint({ ...value, style: effectStyle }, native);
    expect(result.attributedEffects).toBe(false);
    expect(result.effectSpans).toEqual([]);
    expect(native.calls().map((call) => call.text)).toEqual(["ab"]);
    expect(at(result, 3, 5)).toEqual([18, 52, 86, 255]);
  });
  test("absence inherits the three uniform effects and explicit None suppresses only its subset", () => {
    const result = paint({
      ...input([run(), { ...run("b", 14), shadow: none, glow: none, reflection: none }]),
      style: effectStyle,
    });
    expect(result.effectSpans).toHaveLength(2);
    expect(at(result, 11, 5)).toEqual([255, 0, 0, 255]);
    expect(at(result, 23, 5)[3]).toBe(0);
    expect(at(result, 1, 5)[3]).toBeGreaterThan(0);
    expect(at(result, 19, 5)[3]).toBe(0);
    expect(at(result, 3, 34)[3]).toBeGreaterThan(0);
    expect(at(result, 15, 34)[3]).toBe(0);
    expect(at(result, 3, 5)).toEqual([18, 52, 86, 255]);
    expect(at(result, 15, 5)).toEqual([18, 52, 86, 255]);
  });
  test("adjacent identical EFFECTIVE tuples batch even when their sparse authoring differs", () => {
    const value = input([
      { ...run(), glow: effectStyle.glow },
      run("b", 6),
      { ...run("c", 10), glow: none },
    ]);
    const plan = planShapeTextPaint({ ...value, style: { glow: effectStyle.glow } });
    expect(plan.effectSpans.map(({ start, end }) => [start, end])).toEqual([
      [0, 2],
      [2, 3],
    ]);
    const native = factory();
    paint({ ...value, style: { glow: effectStyle.glow } }, native);
    expect(
      native
        .calls()
        .filter((call) => call.mode === "fill")
        .map((call) => call.text),
    ).toEqual(["a", "b", "c", "a", "b", "c"]);
  });
  test("reflection owns actual RGBA instead of leaking an opaque overlapping run", () => {
    const result = paint(
      input([
        {
          ...run(),
          fill: { kind: "value", value: solid("#0000ff", 0.5) },
          reflection: effectStyle.reflection,
        },
        { ...run("b"), fill: { kind: "value", value: solid("#ff0000") }, reflection: none },
      ]),
    );
    expect(at(result, 3, 5)).toEqual([255, 0, 0, 255]);
    const reflected = at(result, 3, 34);
    expect(reflected.slice(0, 3)).toEqual([0, 0, 255]);
    expect(reflected[3]).toBeGreaterThan(0);
    expect(reflected[3]).toBeLessThan(128);
  });
  test("an invisible owned fill never turns an overlapping visible run into an effect source", () => {
    const result = paint(
      input([
        {
          ...run(),
          fill: none,
          shadow: effectStyle.shadow,
          glow: effectStyle.glow,
          reflection: effectStyle.reflection,
        },
        { ...run("b"), shadow: none, glow: none, reflection: none },
      ]),
    );
    expect(at(result, 3, 5)[3]).toBe(255);
    expect(at(result, 11, 5)[3]).toBe(0);
    expect(at(result, 1, 5)[3]).toBe(0);
    expect(at(result, 3, 34)[3]).toBe(0);
  });
  test("inner shadow washes only its owned front while keeping original alpha", () => {
    const inner = { ...shadow("inner", "#000000"), distancePt: 1.5 };
    const result = paint(
      input([
        {
          ...run(),
          fill: { kind: "value", value: solid("#0000ff", 0.5) },
          shadow: { kind: "value", value: inner },
        },
        { ...run("b", 14), fill: { kind: "value", value: solid("#ff0000") }, shadow: none },
      ]),
    );
    expect(at(result, 2, 5)).toEqual([0, 0, 0, 128]);
    expect(at(result, 5, 5)).toEqual([0, 0, 128, 128]);
    expect(at(result, 15, 5)).toEqual([255, 0, 0, 255]);
    expect(at(result, 12, 5)[3]).toBe(0);
  });
  test("local inner shadow never moves another overlapping glyph outline behind a fill", () => {
    const outline = {
      kind: "value" as const,
      value: {
        paint: solid("#ff0000"),
        widthPt: 3,
        compound: "single" as const,
        dash: "solid" as const,
        cap: "round" as const,
        join: "round" as const,
        miterLimit: 4,
      },
    };
    const runs = [
      { ...run(), line: outline, shadow: none },
      {
        ...run("b"),
        shadow: {
          kind: "value" as const,
          value: { ...shadow("inner", "#000000"), distancePt: 1.5 },
        },
      },
    ];
    const value = input(runs),
      result = paint(value),
      baseline = paint(input(runs.map((entry) => ({ ...entry, shadow: none }))));
    // All fill layers precede all outline layers in the existing renderer.
    expect(at(baseline, 3, 5)).toEqual([255, 0, 0, 255]);
    expect(at(result, 3, 5)).toEqual(at(baseline, 3, 5));
  });
  test("an inner shadow elsewhere cannot inflate the union alpha of overlapping translucent glyphs", () => {
    const runs = [
      { ...run(), glow: none },
      run("b"),
      {
        ...run("c", 22),
        shadow: {
          kind: "value" as const,
          value: { ...shadow("inner", "#000000"), distancePt: 1.5 },
        },
      },
    ];
    const style: ShapeDetailedStyle = {
      fill: { kind: "value", value: solid("#0000ff", 0.5) },
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 0, sizePt: 2 },
      },
    };
    const result = paint({ ...input(runs), style }),
      baseline = paint({ ...input(runs.map((entry) => ({ ...entry, shadow: none }))), style });
    expect(result.effectSpans).toHaveLength(3);
    expect(at(baseline, 3, 5)).toEqual([0, 0, 255, 128]);
    expect(at(result, 3, 5)).toEqual(at(baseline, 3, 5));
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) expect(at(result, x, y)).toEqual(at(baseline, x, y));
  });
  test("owned outline-only alpha and selected decorations feed effects after physical clip", () => {
    const value = input([
      {
        ...run(),
        fill: none,
        underline: true,
        line: {
          kind: "value",
          value: {
            paint: solid("#ff0000"),
            widthPt: 0.75,
            compound: "single",
            dash: "solid",
            cap: "round",
            join: "round",
            miterLimit: 4,
          },
        },
        reflection: effectStyle.reflection,
      },
      { ...run("b", 14), reflection: none },
    ]);
    value.layout.overflow = false;
    value.layout.clipRect = { x: 0, y: 0, width: 8, height: 9 };
    const result = paint(value);
    expect(at(result, 1, 4)[3]).toBeGreaterThan(0);
    expect(at(result, 1, 35)[3]).toBeGreaterThan(0);
    expect(at(result, 15, 5)[3]).toBe(0);
    expect(at(result, 15, 34)[3]).toBe(0);
  });
  test("actual attributed preflight reads native pixels and disposes every surface", () => {
    const native = factory(),
      value = input([{ ...run(), glow: effectStyle.glow }]);
    const proof = preflightShapeTextGlyphBudgets({ ...value, canvasFactory: native.make });
    expect(proof).toMatchObject({ kind: "ready", proof: "painted-alpha-character-effects" });
    expect(native.calls().length).toBeGreaterThan(1);
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    const broken = factory();
    expect(() =>
      preflightShapeTextGlyphBudgets({
        ...value,
        canvasFactory: () => {
          const canvas = broken.make();
          (canvas as unknown as MemoryCanvas).failRead = true;
          return canvas;
        },
      }),
    ).toThrow("tainted");
    expect(broken.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("missing and unreadable paint assets atomically reject attributed preflight", () => {
    const value = input([
      {
        ...run(),
        glow: effectStyle.glow,
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId: "owned-texture",
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
      },
    ]);
    const native = factory();
    expect(preflightShapeTextGlyphBudgets({ ...value, canvasFactory: native.make })).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["owned-texture"],
    });
    expect(native.canvases).toHaveLength(0);
    const image = new MemoryCanvas();
    image.width = 2;
    image.height = 1;
    image.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(
      preflightShapeTextGlyphBudgets({
        ...value,
        resources: {
          getAssetSize: () => ({ width: 2, height: 1 }),
          getAssetImage: () => image as unknown as HTMLCanvasElement,
        },
        canvasFactory: () => {
          const canvas = native.make();
          if (native.canvases.length === 2) (canvas as unknown as MemoryCanvas).failRead = true;
          return canvas;
        },
      }),
    ).toMatchObject({
      kind: "unavailable",
      reason: "asset-pixels-unavailable",
      missingAssetIds: ["owned-texture"],
    });
    expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  test("all local effect extents settle one adaptive union density before native allocation", () => {
    const value = input([
      { ...run(), shadow: { kind: "value", value: { ...shadow(), distancePt: 2000 } } },
      {
        ...run("b", 14),
        shadow: { kind: "value", value: { ...shadow(), angleDeg: 180, distancePt: 2000 } },
        glow: effectStyle.glow,
      },
    ]);
    const plan = planShapeTextPaint({ ...value, density: 64 });
    expect(plan.actualDensity).toBeLessThan(1);
    expect(plan.widthRaster).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.side);
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_TEXT_PAINT_LIMITS.memoryBytes);
    const result = paint({ ...value, density: 64 });
    expect(result.actualDensity).toBe(plan.actualDensity);
    expect(result.outputBoundsRaster).toEqual(plan.outputBoundsRaster);
  });
  test("repeated local native/effect work is bounded before allocation", () => {
    const runs = Array.from({ length: 100 }, (_, index) => ({
      ...run("a", index % 20),
      glow: {
        kind: "value" as const,
        value: {
          color: { kind: "rgb" as const, rgb: index % 2 ? "#ff0000" : "#0000ff" },
          opacity: 1,
          sizePt: 2,
        },
      },
    }));
    const value = input(runs);
    value.drawing.width = 400;
    value.drawing.height = 400;
    const native = factory();
    expect(() => prepareShapeTextPaint({ ...value, canvasFactory: native.make })).toThrow(
      "aggregate native/effect raster work budget",
    );
    expect(native.canvases).toHaveLength(0);
  });
  test("complex text projection and common-soft-edge combinations reject with specific messages", () => {
    const value = input([{ ...run(), glow: effectStyle.glow }]);
    expect(() =>
      planShapeTextPaint({
        ...value,
        style: {
          rotation3d: {
            kind: "value",
            value: {
              projection: "parallel",
              xDeg: 20,
              yDeg: 0,
              zDeg: 0,
              distanceFromGroundPt: 0,
            },
          },
        },
      }),
    ).toThrow("cannot be combined with text 3D");
    expect(() =>
      planShapeTextPaint({
        ...value,
        style: { softEdges: { kind: "value", value: { sizePt: 1 } } },
      }),
    ).toThrow("cannot be combined with shared text soft edges");
    expect(() =>
      planShapeTextPaint({ ...value, style: { rotation3d: none, softEdges: none } }),
    ).not.toThrow();
  });
  test.each(["shape", "textBox"] as const)(
    "%s attributed alpha drives effect hit-testing and the genuine print painter",
    (kind) => {
      const value = input([run(), { ...run("b", 14), shadow: none, glow: none, reflection: none }]);
      value.drawing.kind = kind;
      if (kind === "textBox") delete value.drawing.shapeGeometry;
      value.drawing.shapeText!.style = effectStyle;
      value.drawing.shapeStyle = { fill: none, line: none };
      value.drawing.offsetX = 0;
      value.drawing.offsetY = 0;
      expect(() => normalizeSheetDrawing(value.drawing)).not.toThrow();
      const ready = paint(value),
        frame = { x: 100, y: 80, width: 28, height: 20 };
      const presentation = {
        drawing: value.drawing,
        canvas: ready.canvas,
        density: ready.actualDensity,
        bounds: {
          left: ready.logicalBounds.left,
          top: ready.logicalBounds.top,
          width: ready.logicalBounds.right - ready.logicalBounds.left,
          height: ready.logicalBounds.bottom - ready.logicalBounds.top,
        },
        unflipped: true as const,
      };
      for (const [x, y, hit] of [
        [11, 5, true],
        [3, 34, true],
        [23, 5, false],
        [15, 34, false],
      ] as const)
        expect(
          detailedShapeContainsWorldPoint(
            value.drawing,
            frame,
            pictureFrameLocalToWorld(frame, 0, { x: x + 0.5, y: y + 0.5 }),
            presentation,
          ),
        ).toBe(hit);
      const native = factory();
      vi.stubGlobal("document", { createElement: () => native.make() });
      // Only native metrics are injected. The actual print entry, body painter,
      // owned character-effect compositor and final drawImage all remain real.
      vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue(value.layout);
      const sheet = createSheet("Character effects print", "effects-print");
      sheet.drawings = [value.drawing];
      const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet)),
        target = new MemoryCanvas();
      target.width = 48;
      target.height = 48;
      paintPrintShapes(target.context as unknown as CanvasRenderingContext2D, {
        sheet,
        metrics,
        viewport: { x: 0, y: 0, width: 48, height: 48 },
        images: createCanvasImageCache(() => {}),
        density: 1,
      });
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 28; x++) {
          const index = (y * target.width + x) * 4;
          expect([...target.data.subarray(index, index + 4)]).toEqual(at(ready, x, y));
        }
      clearShapeDetailedPaintCache();
      expect(native.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
        true,
      );
    },
  );
  test.each(["shape", "textBox"] as const)(
    "%s envelope and follow-path warps preserve selected subset ownership",
    (kind) => {
      for (const preset of ["textArchUpPour", "textArchUp"] as const) {
        const value = input(),
          shapeText = createDefaultShapeText();
        shapeText.layout.wrap = false;
        shapeText.layout.overflow = true;
        shapeText.layout.marginsPt = { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 };
        shapeText.fontFamily = "Exact Family";
        shapeText.warp = { preset };
        value.drawing = {
          ...value.drawing,
          kind,
          ...(kind === "shape" ? { wordArt: true, shapeGeometry: { preset: "rect" } } : {}),
          width: 48,
          height: 24,
          fontSize: 16,
          shapeText,
        };
        if (kind === "textBox") delete value.drawing.shapeGeometry;
        expect(() => normalizeSheetDrawing(value.drawing)).not.toThrow();
        value.layout = layoutDrawingShapeText(value.drawing, {
          measurer: {
            measure: (text) => text.length * 4,
            measureMetrics: (text) => ({
              width: text.length * 4,
              ascent: text.trim() ? 4 : 0,
              descent: 0,
              inkLeft: 0,
              inkRight: text.trim() ? text.length * 4 : 0,
            }),
          },
          normalLineMetrics: { ascent: 4, descent: 1, lineAdvance: 5 },
        });
        const baseline = value.layout.runs[0]!;
        value.layout.runs = [
          {
            ...baseline,
            text: "a",
            sourceStart: 0,
            sourceEnd: 1,
            advancePx: 4,
            inlineAdvancePx: 4,
            inkBounds: { ...baseline.inkBounds, width: 4 },
            reflection: effectStyle.reflection,
          },
          {
            ...baseline,
            text: "b",
            sourceStart: 1,
            sourceEnd: 2,
            x: baseline.x + 4,
            advancePx: 4,
            inlineAdvancePx: 4,
            inkBounds: { ...baseline.inkBounds, x: baseline.inkBounds.x + 4, width: 4 },
            reflection: none,
          },
        ];
        value.layout.lines[0]!.runs = value.layout.runs;
        const native = factory(),
          result = paint(value, native);
        expect(result.warpPlan?.family).toBe(preset.endsWith("Pour") ? "envelope" : "follow-path");
        expect(native.calls().some((call) => call.text === "a")).toBe(true);
        expect(result.attributedEffects).toBe(true);
        expect(
          (result.canvas as unknown as MemoryCanvas).data.some(
            (alpha, index) => index % 4 === 3 && alpha > 0,
          ),
        ).toBe(true);
      }
    },
  );
});
