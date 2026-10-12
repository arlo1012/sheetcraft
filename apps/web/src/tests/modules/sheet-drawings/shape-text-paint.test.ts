// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle, ShapePaint } from "@sheetcraft/core/shape-style";
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
          this.pixel(px, py, [255, 255, 255, 255]);
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
    if (!dot) return;
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
  getImageData() {
    if (this.canvas.failRead) throw new Error("tainted");
    return { data: this.canvas.data.slice() };
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
