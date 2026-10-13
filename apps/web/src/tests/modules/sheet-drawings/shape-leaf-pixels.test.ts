// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type { DrawingShape, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { DrawingShapeTextRuntimeOptions } from "../../../modules/sheet-drawings/shape-text-runtime";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import {
  getDrawingShapeGeometry,
  standardShapeFlipPoint,
  standardShapeLocalToWorld,
  standardShapeWorldToLocal,
} from "../../../modules/sheet-drawings/shape-geometry";
import { getLegacyShapeGeometry } from "../../../modules/sheet-drawings/legacy-shape-geometry";
import * as detailed from "../../../modules/sheet-drawings/shape-detailed-paint";
import {
  planShapeLeafPixels,
  prepareShapeLeafPixels,
  getShapeLeafPixelsOwnedBytes,
  SHAPE_LEAF_PIXELS_LIMITS,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import type { ShapeGroupSceneProjection } from "../../../modules/sheet-drawings/shape-group-scene";
import { projectedShapeTextBounds } from "../../../modules/sheet-drawings/shape-text-projection";
import * as textProjection from "../../../modules/sheet-drawings/shape-text-projection";
import * as fontResources from "../../../shared/cell-text/font-resources";
vi.mock("../../../shared/cell-text/font-resources", () => ({
  getCellFontResourceFamilies: () => [],
  getCellFontResourceStatus: () => ({ state: "ready" }),
  ensureCellFontResource: async () => {},
}));
vi.mock("../../../shared/cell-text/text-metrics", () => ({ cellTextFontRevision: { value: 1 } }));
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
  contours: Point[][] = [];
  rectCalls: { x: number; y: number; w: number; h: number; color: string }[] = [];
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
    this.contours = [];
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
    this.contours.push([]);
    const point = this.transformed(x, y);
    this.points.push(point);
    this.contours.at(-1)!.push(point);
  }
  lineTo(x: number, y: number) {
    const point = this.transformed(x, y);
    this.points.push(point);
    this.contours.at(-1)?.push(point);
  }
  bezierCurveTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number) {
    const start = this.points.at(-1)!,
      a = this.transformed(cx1, cy1),
      b = this.transformed(cx2, cy2),
      end = this.transformed(x, y);
    for (let index = 1; index <= 80; index++) {
      const t = index / 80,
        u = 1 - t,
        point = {
          x: u ** 3 * start.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * end.x,
          y: u ** 3 * start.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * end.y,
        };
      this.points.push(point);
      this.contours.at(-1)!.push(point);
    }
  }
  closePath() {
    if (this.points[0]) this.points.push(this.points[0]);
  }
  setLineDash() {}
  arc(x: number, y: number, radius: number) {
    this.circle = { ...this.transformed(x, y), radius };
  }
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    anti = false,
  ) {
    let delta = end - start;
    if (anti && delta > 0) delta -= Math.PI * 2;
    if (!anti && delta < 0) delta += Math.PI * 2;
    const count = Math.max(4, Math.ceil(Math.abs(delta) * 20));
    for (let i = 1; i <= count; i++) {
      const a = start + (delta * i) / count,
        x = rx * Math.cos(a),
        y = ry * Math.sin(a);
      this.lineTo(
        cx + x * Math.cos(rotation) - y * Math.sin(rotation),
        cy + x * Math.sin(rotation) + y * Math.cos(rotation),
      );
    }
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
    this.rectCalls.push({ x, y, w, h, color: this.fillStyle });
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
      for (let y = 0; y < this.canvas.height; y++)
        for (let x = 0; x < this.canvas.width; x++) {
          let winding = 0;
          for (const contour of this.contours)
            for (let i = 0; i < contour.length; i++) {
              const a = contour[i]!,
                b = contour[(i + 1) % contour.length]!,
                py = y + 0.5,
                px = x + 0.5;
              const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
              if (a.y <= py && b.y > py && cross > 0) winding++;
              else if (a.y > py && b.y <= py && cross < 0) winding--;
            }
          if (winding !== 0) this.pixel(x, y, [255, 255, 255, 255]);
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
  getImageData() {
    if (this.canvas.failRead) throw new Error("tainted");
    return { width: this.canvas.width, height: this.canvas.height, data: this.canvas.data.slice() };
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
const native: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => Array.from(text).length * 4,
    measureMetrics: (text) => ({
      width: Array.from(text).length * 4,
      ascent: 4,
      descent: 1,
      inkLeft: 0,
      inkRight: Array.from(text).length * 4,
    }),
  },
  normalLineMetrics: { ascent: 4, descent: 1, lineAdvance: 30 },
};
function drawing(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("leaf", "shape", "Leaf", { row: 0, column: 0 }),
    shapeGeometry: undefined,
    shapeText: undefined,
    width: 80,
    height: 60,
    fill: "#ffffff",
    stroke: "transparent",
    strokeWidth: 0,
    text: "abc\ndef",
    color: "#123456",
    ...changes,
  };
}
function options(source = drawing()) {
  return { drawing: source, density: 1, textRuntimeOptions: native };
}
function sharedScene(e = 20): ShapeGroupSceneProjection {
  return {
    ownerPath: [],
    rotation3d: {
      projection: "parallel",
      xDeg: 45,
      yDeg: 0,
      zDeg: 0,
      distanceFromGroundPt: 0,
    },
    scene: {
      widthPx: 300,
      heightPx: 100,
      sourceToScene: { a: 1, b: 0, c: 0, d: 1, e, f: 20 },
    },
  };
}
function inkBounds(result: Extract<ReturnType<typeof prepareShapeLeafPixels>, { kind: "ready" }>) {
  const canvas = result.canvas as unknown as MemoryCanvas;
  let left = canvas.width,
    top = canvas.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (canvas.data[(y * canvas.width + x) * 4 + 3]! > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  return {
    left: left / result.actualDensity + result.logicalBounds.left,
    top: top / result.actualDensity + result.logicalBounds.top,
    right: right / result.actualDensity + result.logicalBounds.left,
    bottom: bottom / result.actualDensity + result.logicalBounds.top,
  };
}
function alpha(
  result: Extract<ReturnType<typeof prepareShapeLeafPixels>, { kind: "ready" }>,
  x: number,
  y: number,
) {
  const canvas = result.canvas as unknown as MemoryCanvas;
  const px = Math.floor((x - result.logicalBounds.left) * result.actualDensity),
    py = Math.floor((y - result.logicalBounds.top) * result.actualDensity);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return 0;
  return canvas.data[(py * canvas.width + px) * 4 + 3]!;
}
afterEach(() => {
  vi.restoreAllMocks();
  detailed.clearShapeDetailedPaintCache();
  expect(getShapeLeafPixelsOwnedBytes()).toBe(0);
});
describe("actual leaf branch and layout policy", () => {
  test.each([
    ["legacy SVG", { shapeStyle: undefined }],
    ["legacy text box", { kind: "textBox" }],
    ["standard plain shape", { shapeGeometry: { preset: "rightArrow" } }],
    [
      "rich shape",
      { shapeGeometry: { preset: "rightArrow" }, shapeText: createDefaultShapeText() },
    ],
  ] satisfies readonly (readonly [string, Partial<SheetGraphicDrawing>])[])(
    "a live editor hides only %s glyph layout and paint while preserving the detailed body and source",
    (_policy, changes) => {
      const source = drawing({
          text: "Saved text",
          shapeFlipX: true,
          shapeFlipY: true,
          shapeStyle: {
            glow: {
              kind: "value",
              value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 0.5, sizePt: 3 },
            },
          },
          ...changes,
        }),
        before = structuredClone(source),
        measure = vi.fn(native.measurer!.measure),
        measureMetrics = vi.fn(native.measurer!.measureMetrics!),
        input = {
          ...options(source),
          angleDeg: 37,
          textRuntimeOptions: {
            ...native,
            measurer: { measure, measureMetrics },
          },
        },
        visible = planShapeLeafPixels(input);
      expect(visible.kind).toBe("ready");
      expect(visible.renderPolicy).toBe(
        _policy === "legacy SVG"
          ? "legacy-svg"
          : _policy === "legacy text box"
            ? "legacy-text-box"
            : "standard",
      );
      expect(visible.textLayout).toBeDefined();
      expect(visible.textPlan).toBeDefined();
      expect(measureMetrics).toHaveBeenCalled();
      measure.mockClear();
      measureMetrics.mockClear();
      const hidden = planShapeLeafPixels({ ...input, hideText: true });
      expect(hidden.kind).toBe("ready");
      expect(hidden.textLayout).toBeUndefined();
      expect(hidden.textPlan).toBeUndefined();
      expect(hidden.bodyPlan).toEqual(visible.bodyPlan);
      expect(hidden.renderPolicy).toBe(visible.renderPolicy);
      expect(hidden.bodyFlipX).toBe(visible.bodyFlipX);
      expect(hidden.bodyFlipY).toBe(visible.bodyFlipY);
      expect(hidden.richText).toBe(visible.richText);
      expect(measure).not.toHaveBeenCalled();
      expect(measureMetrics).not.toHaveBeenCalled();
      expect(source).toEqual(before);
      const restored = planShapeLeafPixels({ ...input, hideText: false });
      expect(restored.textLayout).toEqual(visible.textLayout);
      expect(restored.textPlan).toEqual(visible.textPlan);
      expect(source).toEqual(before);
    },
  );
  test("plain standard line history text without a text rectangle stays hidden without blocking its body", () => {
    const source = drawing({
      shape: "line",
      shapeGeometry: { preset: "line" },
      text: "Preserved history text",
      fill: "transparent",
    });
    const plan = planShapeLeafPixels(options(source));
    expect(plan.kind).toBe("ready");
    expect(plan.textPlan).toBeUndefined();
    expect(plan.textLayout).toBeUndefined();
    expect(source.text).toBe("Preserved history text");
    const transparent = planShapeLeafPixels(
      options(
        drawing({
          shapeGeometry: { preset: "rect" },
          text: "Hidden glyph",
          color: "transparent",
        }),
      ),
    );
    expect(transparent.kind).toBe("ready");
    expect(transparent.textPlan).toBeUndefined();
  });
  test("legacy SVG retains viewBox100 paths, non-scaling butt stroke and full-frame six-pixel padding", () => {
    const source = drawing({
      width: 150,
      height: 70,
      shape: "arrow",
      stroke: "#222222",
      strokeWidth: 3,
      shapeFlipX: true,
      shapeFlipY: true,
    });
    const before = structuredClone(source),
      plan = planShapeLeafPixels(options(source));
    expect(plan.kind).toBe("ready");
    expect(plan.renderPolicy).toBe("legacy-svg");
    expect(plan.bodyPlan.effectiveGeometry.paths).toEqual(
      getLegacyShapeGeometry("arrow", 150, 70)!.paths,
    );
    expect(plan.bodyPlan.effectiveStyle.line).toMatchObject({
      value: { widthPt: 2.25, cap: "butt", join: "round" },
    });
    expect(plan.bodyFlipX).toBe(true);
    expect(plan.bodyFlipY).toBe(true);
    expect(plan.textLayout!.contentRect).toEqual({ x: 6, y: 6, width: 138, height: 58 });
    expect(plan.textLayout!.clipRect).toEqual({ x: 0, y: 0, width: 150, height: 70 });
    expect(plan.textLayout!.lines.map((line) => line.blockAdvance)).toEqual([20, 20]);
    expect(plan.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    expect(source).toEqual(before);
    expect(source.shapeText).toBeUndefined();
  });
  test("standard plain text uses flipped actual asymmetric textRect, zero padding, exact20 and V180 glyphs", () => {
    const source = drawing({
      shapeGeometry: { preset: "triangle" },
      shapeFlipX: true,
      shapeFlipY: true,
    });
    const rect = getDrawingShapeGeometry(source)!.textRect!,
      plan = planShapeLeafPixels(options(source));
    expect(plan.renderPolicy).toBe("standard");
    expect(plan.bodyFlipX).toBe(true);
    expect(plan.bodyFlipY).toBe(true);
    expect(plan.bodyPlan.effectiveStyle.line).toMatchObject({ kind: "none" });
    expect(plan.textLayout!.contentRect).toEqual({
      x: source.width - rect.right,
      y: source.height - rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    });
    expect(plan.textLayout!.lines.every((line) => line.blockAdvance === 20)).toBe(true);
    expect(plan.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    expect(plan.richText).toBe(false);
    expect(source.shapeText).toBeUndefined();
  });
  test("rich text keeps native runtime flipY180, its own effects, and full world-angle paint policy", () => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.marginsPt = { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 };
    shapeText.style = {
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 0.5, sizePt: 3 },
      },
    };
    const source = drawing({ shapeText, shapeFlipY: true, rotation: 10 });
    const plan = planShapeLeafPixels({ ...options(source), angleDeg: 75 });
    expect(plan.richText).toBe(true);
    expect(plan.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    expect(plan.bodyPlan.outerAngleDeg).toBe(75);
    expect(plan.textPlan!.outerAngleDeg).toBe(75);
    expect(plan.textPlan!.effectiveStyle.glow).toMatchObject({
      value: { color: { rgb: "#FF0000" }, sizePt: 3 },
    });
    expect(plan.bodyPlan.effectiveStyle.glow).toBeUndefined();
  });
  test("body3D selects the original rich projection branch and keepFlat bypasses only that map", () => {
    const source = drawing({
      shapeGeometry: { preset: "rect" },
      shapeFlipY: true,
      shapeStyle: {
        rotation3d: {
          kind: "value",
          value: { projection: "parallel", xDeg: 25, yDeg: 30, zDeg: 15, distanceFromGroundPt: 0 },
        },
      },
    });
    const projected = planShapeLeafPixels(options(source));
    expect(projected.richText).toBe(true);
    expect(projected.textFollowsBodyProjection).toBe(true);
    expect(projected.bodyPlan.isProjected).toBe(true);
    expect(projected.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    const model = createDefaultShapeText();
    model.layout.keepFlat = true;
    source.shapeText = model;
    const flat = planShapeLeafPixels(options(source));
    expect(flat.richText).toBe(true);
    expect(flat.textFollowsBodyProjection).toBe(false);
    expect(flat.bodyFlipY).toBe(true);
    expect(flat.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    expect(projected.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_LEAF_PIXELS_LIMITS.memoryBytes);
  });
  test("plain CSS textBox keeps native normal lineheight and border-consuming padding with actual own3D", () => {
    const source = drawing({
      kind: "textBox",
      stroke: "#000000",
      strokeWidth: 3,
      textDirection: "vertical",
      shapeFlipY: true,
      shapeStyle: {
        rotation3d: {
          kind: "value",
          value: { projection: "parallel", xDeg: 35, yDeg: 20, zDeg: 15, distanceFromGroundPt: 0 },
        },
      },
    });
    const plan = planShapeLeafPixels(options(source));
    expect(plan.renderPolicy).toBe("legacy-text-box");
    expect(plan.bodyFlipY).toBe(true);
    expect(plan.richText).toBe(false);
    expect(plan.textFollowsBodyProjection).toBe(true);
    expect(plan.bodyPlan.isProjected).toBe(true);
    expect(plan.bodyPlan.effectiveGeometry.paths.every((p) => !p.stroke)).toBe(true);
    expect(plan.cssBorderRects).toEqual([
      { x: 0, y: 0, width: 80, height: 3 },
      { x: 0, y: 57, width: 80, height: 3 },
      { x: 0, y: 3, width: 3, height: 54 },
      { x: 77, y: 3, width: 3, height: 54 },
    ]);
    expect(plan.textLayout!.contentRect).toEqual({ x: 9, y: 9, width: 62, height: 42 });
    const original = planShapeLeafPixels(options({ ...source, shapeFlipY: undefined }));
    expect(plan.textLayout!.runs.map((run) => run.angle)).toEqual(
      original.textLayout!.runs.map((run) => (run.angle + 180) % 360),
    );
    expect(source.shapeText).toBeUndefined();
  });
  test("holes, tails and end markers are real body geometry; true flipped extents enlarge union without frame clipping", () => {
    const donut = planShapeLeafPixels(
      options(drawing({ text: "", shapeGeometry: { preset: "donut" } })),
    );
    expect(
      donut.bodyPlan.effectiveGeometry.paths[0]!.commands.filter((c) => c[0] === "Z"),
    ).toHaveLength(2);
    const tail = planShapeLeafPixels(
      options(
        drawing({ text: "", shapeGeometry: { preset: "wedgeRectCallout" }, shapeFlipY: true }),
      ),
    );
    expect(tail.bodyPlan.logicalBounds.bottom).toBeGreaterThan(60);
    expect(tail.logicalBounds.top).toBeLessThan(0);
    const legacyLine = planShapeLeafPixels(
      options(
        drawing({
          text: "",
          shape: "line",
          stroke: "#000000",
          strokeWidth: 3,
          shapeLineEnds: { end: { kind: "triangle", length: "large", width: "large" } },
        }),
      ),
    );
    expect(legacyLine.bodyPlan.sourceProfile.lineDecorations).toHaveLength(0);
    const line = planShapeLeafPixels(
      options(
        drawing({
          text: "",
          stroke: "#000000",
          strokeWidth: 3,
          shapeGeometry: { preset: "line" },
          shapeLineEnds: { end: { kind: "triangle", length: "large", width: "large" } },
        }),
      ),
    );
    expect(line.bodyPlan.sourceProfile.lineDecorations!.length).toBe(1);
    expect(line.bodyPlan.effectiveGeometry.paths.every((p) => !p.filled)).toBe(true);
  });
});
describe("actual leaves in a common body scene", () => {
  test("legacy textBox consumes genuine depth and released own camera without migrating its border/glyph branch", () => {
    const groupScene = sharedScene(),
      source = drawing({
        kind: "textBox",
        stroke: "#111111",
        strokeWidth: 3,
        shapeStyle: {
          rotation3d: { kind: "value", value: { ...groupScene.rotation3d, xDeg: 12 } },
          format3d: {
            kind: "value",
            value: {
              depthPt: 24,
              contourPt: 0,
              depthColor: { kind: "rgb", rgb: "#777777" },
              contourColor: { kind: "rgb", rgb: "#000000" },
              material: "plastic",
              lighting: "flat",
              lightingAngleDeg: 0,
            },
          },
          fill: { kind: "none" },
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 20 },
          },
        },
      }),
      before = structuredClone(source),
      grouped = planShapeLeafPixels({ ...options(source), groupScene }),
      releasedSource = {
        ...source,
        shapeStyle: {
          ...source.shapeStyle,
          rotation3d: { kind: "value" as const, value: groupScene.rotation3d },
        },
      },
      released = planShapeLeafPixels(options(releasedSource));
    expect(grouped.renderPolicy).toBe("legacy-text-box");
    expect(released.renderPolicy).toBe("legacy-text-box");
    expect(grouped.cssBorderRects).toEqual(released.cssBorderRects);
    expect(grouped.textLayout).toEqual(released.textLayout);
    expect(released.bodyPlan.isProjected).toBe(true);
    expect(released.textFollowsBodyProjection).toBe(true);
    expect(released.bodyPlan.effectiveStyle.rotation3d).toEqual({
      kind: "value",
      value: groupScene.rotation3d,
    });
    expect(released.bodyPlan.effectiveStyle.format3d!.kind).toBe("value");
    expect(released.bodyPlan.effectiveStyle.format3d).toEqual(
      grouped.bodyPlan.effectiveStyle.format3d,
    );
    expect(released.bodyPlan.effectiveStyle.glow).toBeUndefined();
    expect(released.bodyPlan.effectiveStyle.fill).toEqual({ kind: "none" });
    expect(grouped.bodyPlan.logicalBounds).not.toEqual(released.bodyPlan.logicalBounds);
    expect(source).toEqual(before);
    expect(source.shapeText).toBeUndefined();
    expect(releasedSource.shapeText).toBeUndefined();
    const boundary = factory(),
      result = prepareShapeLeafPixels({ ...options(releasedSource), canvasFactory: boundary.make });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(
      boundary.canvases.flatMap((c) => c.context.rectCalls).filter((r) => r.color === "#111111"),
    ).toEqual(
      released.cssBorderRects!.map((r) => ({
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        color: "#111111",
      })),
    );
    result.dispose();
  });
  test("common pivot compresses member center spacing and keeps own camera/depth/source untouched", () => {
    const source = drawing({
        text: "",
        shapeGeometry: { preset: "donut" },
        shapeStyle: {
          rotation3d: {
            kind: "value",
            value: { projection: "parallel", xDeg: 12, yDeg: 15, zDeg: 9, distanceFromGroundPt: 0 },
          },
          format3d: {
            kind: "value",
            value: {
              depthPt: 24,
              contourPt: 0,
              depthColor: { kind: "rgb", rgb: "#777777" },
              contourColor: { kind: "rgb", rgb: "#000000" },
              material: "plastic",
              lighting: "flat",
              lightingAngleDeg: 0,
            },
          },
        },
      }),
      before = structuredClone(source);
    const first = planShapeLeafPixels({ ...options(source), groupScene: sharedScene(20) }),
      second = planShapeLeafPixels({ ...options(source), groupScene: sharedScene(200) });
    const center = (plan: typeof first, e: number) =>
      e + (plan.bodyPlan.logicalBounds.left + plan.bodyPlan.logicalBounds.right) / 2;
    expect(center(second, 200) - center(first, 20)).toBeCloseTo(180 / Math.SQRT2, 0);
    expect(first.bodyPlan.effectiveStyle.rotation3d).toEqual({
      kind: "value",
      value: sharedScene().rotation3d,
    });
    expect(first.bodyPlan.effectiveStyle.format3d).toEqual(source.shapeStyle!.format3d);
    expect(
      first.bodyPlan.effectiveGeometry.paths[0]!.commands.filter((c) => c[0] === "Z"),
    ).toHaveLength(2);
    expect(first.bodyPlan.isProjected).toBe(true);
    expect(source).toEqual(before);
  });
  test.each(["shape", "textBox"] as const)(
    "%s glyphs follow common positions and widths; KeepFlat restores the real preprojection footprint",
    (kind) => {
      const shapeText = createDefaultShapeText();
      const source = drawing({
        kind,
        shapeGeometry: { preset: "rect" },
        shapeText,
        fill: "transparent",
        text: "abc",
      });
      const input = { ...options(source), groupScene: sharedScene() },
        projected = planShapeLeafPixels(input),
        projectedBounds = projectedShapeTextBounds(
          source,
          projected.textPlan!,
          undefined,
          input.groupScene,
        ),
        ownBounds = projected.textPlan!.logicalBounds;
      expect(projected.textFollowsBodyProjection).toBe(true);
      expect(projectedBounds.left).toBeGreaterThan(ownBounds.left + 20);
      expect(projectedBounds.right - projectedBounds.left).toBeLessThan(
        ownBounds.right - ownBounds.left,
      );
      shapeText.layout.keepFlat = true;
      const flat = planShapeLeafPixels(input);
      expect(flat.textFollowsBodyProjection).toBe(false);
      expect(projectedShapeTextBounds(source, flat.textPlan!, undefined, input.groupScene)).toEqual(
        flat.textPlan!.logicalBounds,
      );
      expect(flat.textLayout).toEqual(projected.textLayout);
      const boundary = factory(),
        ordinary = prepareShapeLeafPixels({ ...options(source), canvasFactory: boundary.make }),
        sceneFlat = prepareShapeLeafPixels({ ...input, canvasFactory: boundary.make });
      expect(ordinary.kind).toBe("ready");
      expect(sceneFlat.kind).toBe("ready");
      if (ordinary.kind !== "ready" || sceneFlat.kind !== "ready") return;
      expect(inkBounds(sceneFlat)).toEqual(inkBounds(ordinary));
      ordinary.dispose();
      sceneFlat.dispose();
      expect(boundary.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
        true,
      );
    },
  );
  test.each(["legacy-svg", "legacy-text-box", "standard"] as const)(
    "%s plain glyphs join the scene without replacing their actual layout policy",
    (renderPolicy) => {
      const source = drawing({
          ...(renderPolicy === "legacy-text-box" ? { kind: "textBox" } : {}),
          ...(renderPolicy === "standard" ? { shapeGeometry: { preset: "triangle" } } : {}),
          shapeFlipX: true,
          shapeFlipY: true,
        }),
        own = planShapeLeafPixels(options(source)),
        scene = planShapeLeafPixels({ ...options(source), groupScene: sharedScene() });
      expect(scene.renderPolicy).toBe(renderPolicy);
      expect(scene.richText).toBe(false);
      expect(scene.textFollowsBodyProjection).toBe(true);
      expect(scene.textLayout).toEqual(own.textLayout);
      expect(scene.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    },
  );
  test.each([
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    "body H=%s V=%s reflection stays before the common camera and glyphs keep their readable map",
    (shapeFlipX, shapeFlipY) => {
      const source = drawing({
          text: "abc",
          shapeGeometry: { preset: "rightArrow" },
          shapeText: createDefaultShapeText(),
          ...(shapeFlipX ? { shapeFlipX: true } : {}),
          ...(shapeFlipY ? { shapeFlipY: true } : {}),
        }),
        groupScene = sharedScene(),
        spy = vi.spyOn(detailed, "planShapeDetailedPaint"),
        plan = planShapeLeafPixels({ ...options(source), groupScene });
      const reflected = spy.mock.calls[0]![0].groupScene!.scene.sourceToScene;
      expect(reflected).toEqual({
        a: shapeFlipX ? -1 : 1,
        b: shapeFlipX ? -0 : 0,
        c: shapeFlipY ? -0 : 0,
        d: shapeFlipY ? -1 : 1,
        e: 20 + (shapeFlipX ? 80 : 0),
        f: 20 + (shapeFlipY ? 60 : 0),
      });
      expect(plan.textLayout!.runs.every((run) => run.angle === (shapeFlipY ? 180 : 0))).toBe(true);
      const bodyLeft = shapeFlipX
        ? source.width - plan.bodyPlan.logicalBounds.right
        : plan.bodyPlan.logicalBounds.left;
      expect(bodyLeft).toBeGreaterThan(30);
      const boundary = factory(),
        result = prepareShapeLeafPixels({
          ...options(source),
          groupScene,
          canvasFactory: boundary.make,
        });
      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") return;
      expect(
        boundary
          .calls()
          .every((call) =>
            shapeFlipY
              ? call.matrix[0] < 0 && call.matrix[3] < 0
              : call.matrix[0] > 0 && call.matrix[3] > 0,
          ),
      ).toBe(true);
      expect(inkBounds(result).left).toBeGreaterThan(30);
      result.dispose();
    },
  );
  test("explicit scene output adapter receives the matching final body flip compensation", () => {
    const groupScene = sharedScene();
    const explicit = {
      ...groupScene,
      scene: { ...groupScene.scene, sceneToOutput: { a: 1, b: 0, c: 0, d: 1, e: -20, f: -20 } },
    };
    const spy = vi.spyOn(detailed, "planShapeDetailedPaint");
    planShapeLeafPixels({
      ...options(drawing({ text: "", shapeFlipX: true, shapeFlipY: true })),
      groupScene: explicit,
    });
    expect(spy.mock.calls[0]![0].groupScene!.scene.sceneToOutput).toEqual({
      a: -1,
      b: -0,
      c: -0,
      d: -1,
      e: 100,
      f: 80,
    });
    expect(explicit.scene.sceneToOutput).toEqual({ a: 1, b: 0, c: 0, d: 1, e: -20, f: -20 });
  });
  test("KeepFlat preserves text-own 3D, attributed native runs, overflow, and V180", () => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.keepFlat = true;
    shapeText.layout.overflow = true;
    shapeText.layout.wrap = false;
    shapeText.layout.marginsPt = { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 };
    shapeText.characterRuns = [{ start: 1, end: 3, fontSize: 24, bold: true, color: "#ff0000" }];
    shapeText.style = {
      rotation3d: {
        kind: "value",
        value: { projection: "parallel", xDeg: 20, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
      },
    };
    const source = drawing({
        shapeGeometry: { preset: "rect" },
        width: 15,
        text: "abcdefghij",
        fill: "transparent",
        shapeText,
        shapeFlipY: true,
      }),
      before = structuredClone(source),
      input = {
        ...options(source),
        textRuntimeOptions: {
          ...native,
          resolveNormalLineMetrics: () => native.normalLineMetrics!,
        },
      },
      plan = planShapeLeafPixels({ ...input, groupScene: sharedScene() });
    expect(plan.textPlan!.requiresGlyphProjection).toBe(true);
    expect(plan.textFollowsBodyProjection).toBe(false);
    expect(plan.textPlan!.overflow).toBe(true);
    expect(
      plan.textLayout!.runs.some((run) => run.font.size === 24 && run.font.weight === 700),
    ).toBe(true);
    expect(plan.textLayout!.runs.every((run) => run.angle === 180)).toBe(true);
    expect(projectedShapeTextBounds(source, plan.textPlan!, undefined, sharedScene())).toEqual(
      plan.textPlan!.logicalBounds,
    );
    const boundary = factory(),
      own = prepareShapeLeafPixels({ ...input, canvasFactory: boundary.make }),
      flat = prepareShapeLeafPixels({
        ...input,
        groupScene: sharedScene(),
        canvasFactory: boundary.make,
      });
    expect(own.kind).toBe("ready");
    expect(flat.kind).toBe("ready");
    if (own.kind !== "ready" || flat.kind !== "ready") return;
    expect(inkBounds(flat)).toEqual(inkBounds(own));
    expect(
      boundary.calls().some((call) => call.font.includes("700") && call.font.includes("24px")),
    ).toBe(true);
    expect(source).toEqual(before);
    own.dispose();
    flat.dispose();
  });
  test("scene errors fail before native pixels and missing fonts stay explicit unless the editor hides glyphs", () => {
    const source = drawing({
        shapeGeometry: { preset: "rect" },
        shapeText: createDefaultShapeText(),
      }),
      make = vi.fn(),
      group = sharedScene(),
      singular = {
        ...group,
        scene: { ...group.scene, sourceToScene: { a: 0, b: 0, c: 0, d: 1, e: 20, f: 20 } },
      };
    expect(() =>
      prepareShapeLeafPixels({ ...options(source), groupScene: singular, canvasFactory: make }),
    ).toThrow(/singular/);
    expect(make).not.toHaveBeenCalled();
    const families = vi
      .spyOn(fontResources, "getCellFontResourceFamilies")
      .mockReturnValue(["missing-scene-font"]);
    vi.spyOn(fontResources, "getCellFontResourceStatus").mockReturnValue({
      family: "missing-scene-font",
      kind: "managed",
      state: "loading",
    });
    expect(
      prepareShapeLeafPixels({ ...options(source), groupScene: group, canvasFactory: make }),
    ).toMatchObject({ kind: "unavailable", reason: "text-unavailable" });
    expect(make).not.toHaveBeenCalled();
    families.mockClear();
    const hidden = planShapeLeafPixels({ ...options(source), groupScene: group, hideText: true });
    expect(hidden.kind).toBe("ready");
    expect(hidden.textPlan).toBeUndefined();
    expect(hidden.bodyPlan.isProjected).toBe(true);
    expect(families).not.toHaveBeenCalled();
  });
  test.each([true, false])(
    "KeepFlat=%s body-glyph union includes scene scratch in the aggregate replan",
    (keepFlat) => {
      const shapeText = createDefaultShapeText();
      shapeText.layout.keepFlat = keepFlat;
      const plan = planShapeLeafPixels({
        ...options(
          drawing({ width: 1200, height: 600, shapeGeometry: { preset: "rect" }, shapeText }),
        ),
        groupScene: {
          ...sharedScene(),
          scene: { ...sharedScene().scene, widthPx: 6000, heightPx: 1000 },
        },
        density: 16,
      });
      expect(plan.kind).toBe("ready");
      expect(plan.actualDensity).toBeLessThan(16);
      expect(Math.max(plan.widthRaster, plan.heightRaster)).toBeLessThanOrEqual(
        SHAPE_LEAF_PIXELS_LIMITS.side,
      );
      expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(
        SHAPE_LEAF_PIXELS_LIMITS.pixels,
      );
      expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_LEAF_PIXELS_LIMITS.memoryBytes);
    },
  );
  test("a failed scene glyph projection releases every transient body/glyph canvas", () => {
    const boundary = factory(),
      source = drawing({ shapeGeometry: { preset: "rect" }, shapeText: createDefaultShapeText() });
    vi.spyOn(textProjection, "projectShapeTextSurface").mockImplementation(() => {
      throw new Error("projected native pixel failure");
    });
    expect(() =>
      prepareShapeLeafPixels({
        ...options(source),
        groupScene: sharedScene(),
        canvasFactory: boundary.make,
      }),
    ).toThrow("projected native pixel failure");
    expect(boundary.canvases.length).toBeGreaterThan(1);
    expect(boundary.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
    expect(getShapeLeafPixelsOwnedBytes()).toBe(0);
  });
  test("active scene missing body/glyph assets return typed unavailability before decoding or allocating", () => {
    const texture: ShapeDetailedStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "scene-paint",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "tile",
            scaleX: 1,
            scaleY: 1,
            offsetXPt: 0,
            offsetYPt: 0,
            flip: "none",
            anchor: "center",
          },
        },
      },
    };
    const shapeText = createDefaultShapeText(),
      source = drawing({ shapeGeometry: { preset: "rect" }, shapeText }),
      make = vi.fn(),
      decode = vi.fn(),
      input = {
        ...options(source),
        groupScene: sharedScene(),
        canvasFactory: make,
        resources: { getAssetImage: decode },
      };
    source.shapeStyle = texture;
    expect(prepareShapeLeafPixels(input)).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["scene-paint"],
    });
    source.shapeStyle = undefined;
    shapeText.style = texture;
    expect(prepareShapeLeafPixels(input)).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["scene-paint"],
    });
    expect(decode).not.toHaveBeenCalled();
    expect(make).not.toHaveBeenCalled();
    expect(
      prepareShapeLeafPixels({
        ...input,
        resources: { getAssetSize: () => ({ width: 4, height: 4 }), getAssetImage: decode },
      }),
    ).toMatchObject({ kind: "unavailable", reason: "asset-unavailable" });
    expect(decode).toHaveBeenCalledOnce();
    expect(make).not.toHaveBeenCalled();
  });
});
describe("resource and aggregate preflight", () => {
  const texture: ShapeDetailedStyle = {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "paint",
        opacity: 1,
        rotateWithShape: false,
        layout: {
          kind: "tile",
          scaleX: 1,
          scaleY: 1,
          offsetXPt: 0,
          offsetYPt: 0,
          flip: "none",
          anchor: "center",
        },
      },
    },
  };
  test("hidden glyph resources stay dormant while body resource failures remain explicit", () => {
    const shapeText = createDefaultShapeText();
    shapeText.style = texture;
    const source = drawing({ shapeGeometry: { preset: "rect" }, shapeText }),
      before = structuredClone(source),
      getAssetSize = vi.fn(),
      input = { ...options(source), resources: { getAssetSize } };
    expect(planShapeLeafPixels(input)).toMatchObject({
      kind: "unavailable",
      missingAssetIds: ["paint"],
    });
    getAssetSize.mockClear();
    const hidden = planShapeLeafPixels({ ...input, hideText: true });
    expect(hidden.kind).toBe("ready");
    expect(hidden.textLayout).toBeUndefined();
    expect(hidden.textPlan).toBeUndefined();
    expect(hidden.bodyPlan.assetIds).toEqual([]);
    expect(getAssetSize).not.toHaveBeenCalled();
    expect(source).toEqual(before);
    expect(
      planShapeLeafPixels({
        ...input,
        drawing: { ...source, shapeStyle: texture },
        hideText: true,
      }),
    ).toMatchObject({ kind: "unavailable", missingAssetIds: ["paint"] });
    expect(getAssetSize).toHaveBeenCalledWith("paint");
  });
  test("missing body/text metadata or pixels stay explicit and do not paint, decode or allocate", () => {
    const decode = vi.fn(),
      make = vi.fn(),
      measured = vi.fn(native.measurer!.measureMetrics!);
    const source = drawing({ shapeStyle: texture }),
      input = {
        ...options(source),
        resources: { getAssetImage: decode },
        canvasFactory: make,
        textRuntimeOptions: {
          ...native,
          measurer: { ...native.measurer!, measureMetrics: measured },
        },
      };
    expect(prepareShapeLeafPixels(input)).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["paint"],
    });
    expect(decode).not.toHaveBeenCalled();
    expect(make).not.toHaveBeenCalled();
    expect(measured).not.toHaveBeenCalled();
    const text = createDefaultShapeText();
    text.style = texture;
    source.shapeStyle = undefined;
    source.shapeText = text;
    expect(prepareShapeLeafPixels(input)).toMatchObject({
      kind: "unavailable",
      missingAssetIds: ["paint"],
    });
    expect(decode).not.toHaveBeenCalled();
    expect(measured).not.toHaveBeenCalled();
    expect(
      prepareShapeLeafPixels({
        ...input,
        resources: { getAssetSize: () => ({ width: 10, height: 10 }), getAssetImage: decode },
      }),
    ).toMatchObject({ kind: "unavailable", reason: "asset-unavailable" });
    expect(decode).toHaveBeenCalledOnce();
    expect(make).not.toHaveBeenCalled();
  });
  test("invalid dimensions, density and lineheight fail before native measurement or decoding", () => {
    const decode = vi.fn(),
      make = vi.fn(),
      measured = vi.fn(native.measurer!.measureMetrics!);
    for (const changes of [{ width: NaN }, { height: Infinity }] as const)
      expect(() =>
        prepareShapeLeafPixels({
          ...options(drawing(changes)),
          canvasFactory: make,
          resources: { getAssetImage: decode },
        }),
      ).toThrow();
    expect(() =>
      prepareShapeLeafPixels({ ...options(), density: NaN, canvasFactory: make }),
    ).toThrow();
    expect(() =>
      prepareShapeLeafPixels({
        ...options(),
        legacyLineHeightPx: NaN,
        textRuntimeOptions: {
          ...native,
          measurer: { ...native.measurer!, measureMetrics: measured },
        },
      }),
    ).toThrow();
    expect(decode).not.toHaveBeenCalled();
    expect(make).not.toHaveBeenCalled();
    expect(measured).not.toHaveBeenCalled();
  });
  test("enlarged body/glyph union adapts density under side, pixel and aggregate memory limits", () => {
    const text = createDefaultShapeText();
    text.style = {
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 0.7, sizePt: 30 },
      },
    };
    const plan = planShapeLeafPixels({
      ...options(
        drawing({
          width: 1200,
          height: 600,
          shapeText: text,
          shapeGeometry: { preset: "wedgeRectCallout" },
        }),
      ),
      density: 16,
    });
    expect(plan.kind).toBe("ready");
    expect(plan.actualDensity).toBeLessThan(16);
    expect(plan.bodyPlan.actualDensity).toBeCloseTo(plan.textPlan!.actualDensity, 8);
    expect(Math.max(plan.widthRaster, plan.heightRaster)).toBeLessThanOrEqual(
      SHAPE_LEAF_PIXELS_LIMITS.side,
    );
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(
      SHAPE_LEAF_PIXELS_LIMITS.pixels,
    );
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_LEAF_PIXELS_LIMITS.memoryBytes);
  });
});
describe("owned actual source pixels", () => {
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
  ] satisfies DrawingShape[])(
    "legacy %s retains its actual source and mirrors local pixels before outer37deg",
    (shape) => {
      const source = drawing({
          shape,
          width: 100,
          height: 100,
          rotation: 37,
          text: "",
          stroke: "#111111",
          strokeWidth: 2,
        }),
        before = structuredClone(source),
        baseline = prepareShapeLeafPixels({
          ...options(source),
          canvasFactory: factory().make,
          angleDeg: 37,
        });
      expect(baseline.kind).toBe("ready");
      if (baseline.kind !== "ready") return;
      try {
        for (const flags of [
          { shapeFlipX: true },
          { shapeFlipY: true },
          { shapeFlipX: true, shapeFlipY: true },
        ] as const) {
          const flipped = prepareShapeLeafPixels({
            ...options({ ...source, ...flags }),
            canvasFactory: factory().make,
            angleDeg: 37,
          });
          expect(flipped.kind).toBe("ready");
          if (flipped.kind !== "ready") continue;
          try {
            expect(flipped.bodyPlan.effectiveGeometry.paths).toEqual(
              getLegacyShapeGeometry(shape, 100, 100)!.paths,
            );
            expect(flipped.bodyPlan.outerAngleDeg).toBe(37);
            const actual: number[] = [],
              expected: number[] = [];
            for (let y = 0; y < 100; y++)
              for (let x = 0; x < 100; x++) {
                actual.push(alpha(flipped, x + 0.5, y + 0.5));
                expected.push(
                  alpha(
                    baseline,
                    "shapeFlipX" in flags ? 99.5 - x : x + 0.5,
                    "shapeFlipY" in flags ? 99.5 - y : y + 0.5,
                  ),
                );
              }
            expect(actual).toEqual(expected);
          } finally {
            flipped.dispose();
          }
        }
        expect(source).toEqual(before);
        expect(source.shapeGeometry).toBeUndefined();
        expect(source.shapeText).toBeUndefined();
      } finally {
        baseline.dispose();
      }
    },
  );
  test.each([
    ["legacy SVG", {}],
    ["old horizontal textBox", { kind: "textBox" }],
    ["old vertical textBox", { kind: "textBox", textDirection: "vertical" }],
    ["styled legacy", { shapeStyle: {} }],
    ["detailed legacy text", { shapeText: createDefaultShapeText() }],
    [
      "detailed vertical legacy text",
      {
        shapeText: {
          ...createDefaultShapeText(),
          layout: { ...createDefaultShapeText().layout, direction: "vertical-rl" },
        },
      },
    ],
    ["standard plain", { shapeGeometry: { preset: "triangle" } }],
  ] satisfies readonly (readonly [string, Partial<SheetGraphicDrawing>])[])(
    "%s preserves readable H glyph pixels and applies V180 without migrating its source",
    (_branch, changes) => {
      const source = drawing({
          ...changes,
          width: 100,
          height: 80,
          rotation: 37,
          text: "L",
          fill: "transparent",
        }),
        before = structuredClone(source),
        nativeGlyph: DrawingShapeTextRuntimeOptions = {
          measurer: {
            measure: () => 8,
            measureMetrics: () => ({ width: 8, ascent: 8, descent: 0, inkLeft: 0, inkRight: 8 }),
          },
          normalLineMetrics: { ascent: 8, descent: 0, lineAdvance: 12 },
        },
        baselineBoundary = factory(),
        baseline = prepareShapeLeafPixels({
          ...options(source),
          textRuntimeOptions: nativeGlyph,
          canvasFactory: baselineBoundary.make,
        });
      expect(baseline.kind).toBe("ready");
      if (baseline.kind !== "ready") return;
      try {
        for (const flags of [
          { shapeFlipX: true },
          { shapeFlipY: true },
          { shapeFlipX: true, shapeFlipY: true },
        ] as const) {
          const boundary = factory(),
            flipped = prepareShapeLeafPixels({
              ...options({ ...source, ...flags }),
              textRuntimeOptions: nativeGlyph,
              canvasFactory: boundary.make,
            });
          expect(flipped.kind).toBe("ready");
          if (flipped.kind !== "ready") continue;
          try {
            expect(boundary.calls().map((call) => call.text)).toEqual(["L"]);
            expect(flipped.textPlan!.outerAngleDeg).toBe(37);
            const originalMatrix = baselineBoundary.calls()[0]!.matrix.slice(0, 4),
              matrix = boundary.calls()[0]!.matrix.slice(0, 4),
              vertical = "shapeFlipY" in flags;
            for (let index = 0; index < 4; index++)
              expect(matrix[index]).toBeCloseTo(originalMatrix[index]! * (vertical ? -1 : 1), 10);
            if (_branch !== "standard plain") {
              const actual: number[] = [],
                expected: number[] = [];
              for (let y = 0; y < 80; y++)
                for (let x = 0; x < 100; x++) {
                  actual.push(alpha(flipped, x + 0.5, y + 0.5));
                  expected.push(
                    alpha(baseline, vertical ? 99.5 - x : x + 0.5, vertical ? 79.5 - y : y + 0.5),
                  );
                }
              expect(actual).toEqual(expected);
            }
            expect(flipped.textLayout!.runs.map((run) => run.angle)).toEqual(
              baseline.textLayout!.runs.map((run) => (run.angle + (vertical ? 180 : 0)) % 360),
            );
          } finally {
            flipped.dispose();
          }
        }
        expect(source).toEqual(before);
      } finally {
        baseline.dispose();
      }
    },
  );
  test("legacy H/V transparent hits use the known local reflection inverse after outer37deg", () => {
    const frame = { x: 120, y: 80, width: 100, height: 80 };
    for (const flags of [
      { shapeFlipX: true },
      { shapeFlipY: true },
      { shapeFlipX: true, shapeFlipY: true },
    ] as const) {
      const source = drawing({
          ...flags,
          shape: "arrow",
          width: frame.width,
          height: frame.height,
          rotation: 37,
          text: "",
        }),
        result = prepareShapeLeafPixels({ ...options(source), canvasFactory: factory().make });
      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") continue;
      try {
        for (const [point, expectedAlpha] of [
          [{ x: 20.5, y: 40.5 }, 255],
          [{ x: 20.5, y: 5.5 }, 0],
        ] as const) {
          const world = standardShapeLocalToWorld(frame, 37, standardShapeFlipPoint(source, point)),
            local = standardShapeWorldToLocal(frame, 37, world),
            inverse = standardShapeFlipPoint(source, local);
          expect(inverse.x).toBeCloseTo(point.x, 10);
          expect(inverse.y).toBeCloseTo(point.y, 10);
          expect(alpha(result, local.x, local.y)).toBe(expectedAlpha);
        }
      } finally {
        result.dispose();
      }
    }
  });
  test("hiding active-editor glyph pixels keeps the real body border and saved text", () => {
    const source = drawing({
        shapeGeometry: { preset: "rect" },
        text: "abc",
        fill: "transparent",
        stroke: "#111111",
        strokeWidth: 3,
      }),
      before = structuredClone(source),
      visibleBoundary = factory(),
      hiddenBoundary = factory(),
      visible = prepareShapeLeafPixels({
        ...options(source),
        canvasFactory: visibleBoundary.make,
      }),
      hidden = prepareShapeLeafPixels({
        ...options(source),
        hideText: true,
        canvasFactory: hiddenBoundary.make,
      });
    try {
      expect(visible.kind).toBe("ready");
      expect(hidden.kind).toBe("ready");
      if (visible.kind !== "ready" || hidden.kind !== "ready") return;
      expect(visibleBoundary.calls().some((call) => call.text === "abc")).toBe(true);
      expect(hiddenBoundary.calls()).toEqual([]);
      expect(hidden.textLayout).toBeUndefined();
      expect(hidden.textPlan).toBeUndefined();
      expect(hidden.bodyPlan).toEqual(visible.bodyPlan);
      expect(alpha(visible, 1, 20)).toBe(255);
      expect(alpha(hidden, 1, 20)).toBe(255);
      const run = visible.textLayout!.runs[0]!;
      expect(alpha(visible, run.x + 1, run.y - 1)).toBe(255);
      expect(alpha(hidden, run.x + 1, run.y - 1)).toBe(0);
      expect(source).toEqual(before);
    } finally {
      if (visible.kind === "ready") visible.dispose();
      if (hidden.kind === "ready") hidden.dispose();
    }
  });
  test("CSS inside-border sourcePainter paints only genuine inside strips and preserves transparent center", () => {
    const boundary = factory(),
      source = drawing({
        kind: "textBox",
        text: "",
        fill: "transparent",
        stroke: "#111111",
        strokeWidth: 3,
      });
    const result = prepareShapeLeafPixels({ ...options(source), canvasFactory: boundary.make });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(alpha(result, 1, 20)).toBe(255);
    expect(alpha(result, 40, 1)).toBe(255);
    expect(alpha(result, 40, 30)).toBe(0);
    const calls = boundary.canvases
      .flatMap((c) => c.context.rectCalls)
      .filter((r) => r.color === "#111111");
    expect(calls).toEqual(
      result.cssBorderRects!.map((r) => ({
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        color: "#111111",
      })),
    );
    expect(boundary.canvases.filter((c) => c.width > 0)).toEqual([result.canvas]);
    expect(getShapeLeafPixelsOwnedBytes()).toBe(result.ownedBytes);
    result.dispose();
    result.dispose();
    expect(result.canvas.width).toBe(0);
    expect(result.canvas.height).toBe(0);
  });
  test("real shared body masks preserve donut hole and out-of-frame tail pixels", () => {
    const boundary = factory();
    const result = prepareShapeLeafPixels({
      ...options(drawing({ text: "", shapeGeometry: { preset: "donut" } })),
      canvasFactory: boundary.make,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(alpha(result, 40, 30)).toBe(0);
    expect(alpha(result, 40, 3)).toBe(255);
    result.dispose();
    const tail = prepareShapeLeafPixels({
      ...options(
        drawing({ text: "", shapeGeometry: { preset: "wedgeRectCallout" }, shapeFlipY: true }),
      ),
      canvasFactory: boundary.make,
    });
    expect(tail.kind).toBe("ready");
    if (tail.kind !== "ready") return;
    const canvas = tail.canvas as unknown as MemoryCanvas;
    const rowsOutside = Math.max(0, Math.floor(-tail.logicalBounds.top * tail.actualDensity));
    expect(
      canvas.data.subarray(0, rowsOutside * canvas.width * 4).some((v, i) => i % 4 === 3 && v > 0),
    ).toBe(true);
    tail.dispose();
  });
  test("actual native glyph calls stay independent/readable after body flip; borrowed cached body is never released", () => {
    const boundary = factory(),
      cached = new MemoryCanvas();
    cached.width = 80;
    cached.height = 60;
    cached.context.fillRect(0, 0, 10, 10);
    vi.spyOn(detailed, "prepareShapeDetailedPaint").mockImplementation((input) => ({
      ...detailed.planShapeDetailedPaint(input),
      kind: "ready",
      canvas: cached as unknown as HTMLCanvasElement,
    }));
    const source = drawing({
      shapeGeometry: { preset: "rect" },
      shapeFlipX: true,
      shapeFlipY: true,
      fill: "transparent",
      text: "abc",
    });
    const result = prepareShapeLeafPixels({
      ...options(source),
      canvasFactory: boundary.make,
      angleDeg: 65,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    const calls = boundary.calls();
    expect(calls.some((call) => call.text === "abc")).toBe(true);
    expect(calls.every((call) => call.matrix[0] < 0 && call.matrix[3] < 0)).toBe(true);
    expect(alpha(result, 75, 55)).toBe(255);
    expect(alpha(result, 3, 3)).toBe(0);
    result.dispose();
    expect(cached.width).toBe(80);
    expect(cached.height).toBe(60);
  });
});
