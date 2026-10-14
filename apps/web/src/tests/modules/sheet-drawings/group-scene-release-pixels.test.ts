// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots, ungroupShapeRoot } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing, type ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import type { SheetDrawing, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { framedShape } from "./framed-shape-fixture";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import {
  planShapeLeafPixels,
  prepareShapeLeafPixels,
  getShapeLeafPixelsOwnedBytes,
  type ShapeLeafPixelsOptions,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";
import { prepareShapeGroupPaint } from "../../../modules/sheet-drawings/shape-group-paint";
import { getShapePresentationAllocatedBytes } from "../../../modules/sheet-drawings/shape-detailed-presentation";
import type { DrawingShapeTextRuntimeOptions } from "../../../modules/sheet-drawings/shape-text-runtime";

vi.mock("../../../shared/cell-text/font-resources", () => ({
  getCellFontResourceFamilies: () => [],
  getCellFontResourceStatus: () => ({ state: "ready" }),
  ensureCellFontResource: async () => {},
}));
vi.mock("../../../shared/cell-text/text-metrics", () => ({ cellTextFontRevision: { value: 1 } }));

type Matrix = [number, number, number, number, number, number];
type Rect = { left: number; top: number; right: number; bottom: number };
/** Same deterministic native-Canvas boundary as the leaf-pixel fixtures, reduced
 * to the genuine legacy TextBox rectangle/glyph calls. Camera, contour depth,
 * owner effects and composition remain their real production implementations. */
class PixelCanvas {
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray();
  context = new PixelContext(this);
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
class PixelContext {
  font = "";
  direction = "ltr";
  textAlign = "left";
  textBaseline = "alphabetic";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle = "#ffffff";
  matrix: Matrix = [1, 0, 0, 1, 0, 0];
  clipBounds: Rect | undefined;
  pathRect: [number, number, number, number] | undefined;
  stack: { matrix: Matrix; clipBounds: Rect | undefined }[] = [];
  glyphCalls: { text: string; matrix: Matrix }[] = [];
  rectCalls: { x: number; y: number; width: number; height: number; color: string }[] = [];
  constructor(readonly canvas: PixelCanvas) {}
  save() {
    this.stack.push({ matrix: [...this.matrix], clipBounds: this.clipBounds });
  }
  restore() {
    const state = this.stack.pop()!;
    this.matrix = state.matrix;
    this.clipBounds = state.clipBounds;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [aa, bb, cc, dd, ee, ff] = this.matrix;
    this.matrix = [
      aa * a + cc * b,
      bb * a + dd * b,
      aa * c + cc * d,
      bb * c + dd * d,
      aa * e + cc * f + ee,
      bb * e + dd * f + ff,
    ];
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(angle: number) {
    this.transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0);
  }
  beginPath() {
    this.pathRect = undefined;
  }
  rect(x: number, y: number, width: number, height: number) {
    this.pathRect = [x, y, width, height];
  }
  clip() {
    const [x, y, w, h] = this.pathRect!,
      [a, b, c, d, e, f] = this.matrix;
    const xs = [a * x + c * y + e, a * (x + w) + c * (y + h) + e],
      ys = [b * x + d * y + f, b * (x + w) + d * (y + h) + f];
    this.clipBounds = {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  }
  pixel(x: number, y: number, rgba: ArrayLike<number>) {
    const clip = this.clipBounds;
    if (
      clip &&
      (x + 0.5 < clip.left || x + 0.5 >= clip.right || y + 0.5 < clip.top || y + 0.5 >= clip.bottom)
    )
      return;
    const index = (y * this.canvas.width + x) * 4,
      alpha = rgba[3]! / 255,
      old = this.canvas.data[index + 3]! / 255,
      out = alpha + old * (1 - alpha);
    if (out === 0) return;
    for (let c = 0; c < 3; c++)
      this.canvas.data[index + c] =
        (rgba[c]! * alpha + this.canvas.data[index + c]! * old * (1 - alpha)) / out;
    this.canvas.data[index + 3] = out * 255;
  }
  fillRect(x: number, y: number, width: number, height: number) {
    this.rectCalls.push({ x, y, width, height, color: this.fillStyle });
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    const color = [1, 3, 5].map((i) => Number.parseInt(this.fillStyle.slice(i, i + 2), 16));
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          lx = (d * dx - c * dy) / det,
          ly = (-b * dx + a * dy) / det;
        if (lx >= x && lx < x + width && ly >= y && ly < y + height)
          this.pixel(px, py, [...color, 255]);
      }
  }
  fillText(text: string, x: number, y: number) {
    this.glyphCalls.push({ text, matrix: [...this.matrix] });
    if (text.trim()) this.fillRect(x, y - 4, Array.from(text).length * 4, 4);
  }
  drawImage(image: PixelCanvas, x: number, y: number, width = image.width, height = image.height) {
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f,
          u = ((d * dx - c * dy) / det - x) / width,
          v = ((-b * dx + a * dy) / det - y) / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const index =
          (Math.floor(v * image.height) * image.width + Math.floor(u * image.width)) * 4;
        this.pixel(px, py, image.data.subarray(index, index + 4));
      }
  }
  getImageData() {
    return { width: this.canvas.width, height: this.canvas.height, data: this.canvas.data.slice() };
  }
  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    this.canvas.data.set(image.data);
  }
}
const canvases: PixelCanvas[] = [];
const makeCanvas = () => {
  const canvas = new PixelCanvas();
  canvases.push(canvas);
  return canvas as unknown as HTMLCanvasElement;
};
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
  normalLineMetrics: { ascent: 4, descent: 1, lineAdvance: 20 },
};
const camera = {
  projection: "parallel",
  xDeg: 30,
  yDeg: 0,
  zDeg: 0,
  distanceFromGroundPt: 0,
} as const;
const format: ShapeDetailedStyle["format3d"] = {
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
};
function textbox(id: string, x: number) {
  const source = framedShape();
  source.kind = "textBox";
  source.id = id;
  source.name = id;
  delete source.shapeGeometry;
  delete source.shapeText;
  delete source.shapeStyle;
  source.shapeFrame.anchor = { mode: "fixed", x, y: 20, size: { width: 80, height: 60 } };
  source.rotation = 0;
  source.text = "abc";
  source.fill = "#0000ff";
  source.stroke = "#111111";
  source.strokeWidth = 3;
  source.color = "#ff0000";
  return source;
}
function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() }),
    sheet = getActiveSheet(workbook);
  sheet.drawings = [textbox("first", 20), textbox("second", 200)];
  return {
    sheet,
    session: createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
    metrics: createPictureSheetMetrics(sheet),
  };
}
function leafOptions(
  drawings: readonly SheetDrawing[],
  metrics: ReturnType<typeof createPictureSheetMetrics>,
  id: string,
): ShapeLeafPixelsOptions {
  const pass = resolveShapeForestForRender({ drawings, metrics, revision: 0 }),
    leaf = pass.getLeaf(id)!;
  const drawing = leaf.carrierLeaf?.view ?? leaf.carrierRoot?.view;
  if (!drawing || (drawing.kind !== "textBox" && drawing.kind !== "shape"))
    throw new Error("Missing genuine graphic leaf");
  return {
    drawing: drawing as SheetGraphicDrawing,
    groupScene: leaf.groupScene,
    density: 1,
    textRuntimeOptions: native,
  };
}
function pixels(options: ShapeLeafPixelsOptions) {
  const result = prepareShapeLeafPixels({ ...options, canvasFactory: makeCanvas });
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") throw new Error(result.reason);
  try {
    return {
      bounds: result.logicalBounds,
      width: result.widthRaster,
      height: result.heightRaster,
      density: result.actualDensity,
      data: Array.from((result.canvas as unknown as PixelCanvas).data),
    };
  } finally {
    result.dispose();
  }
}
function coloredBounds(value: ReturnType<typeof pixels>, color: "red" | "blue") {
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < value.height; y++)
    for (let x = 0; x < value.width; x++) {
      const i = (y * value.width + x) * 4,
        r = value.data[i]!,
        g = value.data[i + 1]!,
        b = value.data[i + 2]!;
      if (
        value.data[i + 3]! > 0 &&
        (color === "red" ? r > g + 80 && r > b + 80 : b > r + 80 && b > g + 80)
      )
        points.push({
          x: x / value.density + value.bounds.left,
          y: y / value.density + value.bounds.top,
        });
    }
  expect(points.length).toBeGreaterThan(0);
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)) + 1 / value.density,
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)) + 1 / value.density,
  };
}
afterEach(() => {
  expect(getShapeLeafPixelsOwnedBytes()).toBe(0);
  expect(getShapePresentationAllocatedBytes()).toBe(0);
  expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  canvases.length = 0;
});

describe("real group scene release pixels and history", () => {
  test("Core Group/Ungroup and Undo/Redo retain X30/depth24 legacy TextBox bodies, glyphs and owner effects", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    const grouped = groupShapeRoots(
      f.sheet.drawings!,
      ["first", "second"],
      { id: "group", name: "Group" },
      f.metrics,
    );
    const root = grouped[0]!;
    expect(isShapeGroupDrawing(root)).toBe(true);
    if (!isShapeGroupDrawing(root)) return;
    root.group3d = { rotation3d: { kind: "value", value: camera } };
    root.groupEffects = {
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#00ff00" }, opacity: 1, sizePt: 1.5 },
      },
    };
    for (const member of root.members) {
      if (member.kind !== "shape" && member.kind !== "textBox")
        throw new Error("Expected graphic member");
      member.shapeStyle = {
        format3d: format,
        rotation3d: { kind: "value", value: { ...camera, xDeg: 12 } },
      };
    }
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, grouped)),
    ).toBe(true);
    const groupedSnapshot = serializeWorkbook(f.session.workbook),
      activeRoot = f.sheet.drawings![0] as ShapeGroupDrawing;
    expect(groupedSnapshot.version).toBe(68);
    expect(serializeWorkbook(deserializeWorkbook(groupedSnapshot))).toEqual(groupedSnapshot);
    const active = leafOptions(f.sheet.drawings!, f.metrics, "first"),
      activePlan = planShapeLeafPixels(active),
      activePixels = pixels(active);
    expect(active.drawing.shapeText).toBeUndefined();
    expect(active.drawing.shapeStyle!.rotation3d).toMatchObject({ value: { xDeg: 12 } });
    expect(activePlan.renderPolicy).toBe("legacy-text-box");
    expect(activePlan.richText).toBe(false);
    expect(activePlan.textFollowsBodyProjection).toBe(true);
    expect(activePlan.bodyPlan.effectiveStyle.rotation3d).toEqual({ kind: "value", value: camera });
    expect(activePlan.bodyPlan.effectiveStyle.format3d).toEqual(format);
    expect(activePlan.bodyPlan.effectiveStyle.glow).toBeUndefined();
    const paint = prepareShapeGroupPaint({
      root: activeRoot,
      metrics: f.metrics,
      density: 1,
      interactive: false,
      textRuntimeOptions: native,
      canvasFactory: makeCanvas,
    });
    expect(paint.kind).toBe("ready");
    if (paint.kind !== "ready") throw new Error(paint.reason);
    try {
      const data = (paint.canvas as unknown as PixelCanvas).data;
      expect(
        data.some(
          (g, i) =>
            i % 4 === 1 && g > 150 && data[i - 1]! < 50 && data[i + 1]! < 50 && data[i + 2]! > 0,
        ),
      ).toBe(true);
    } finally {
      paint.dispose();
    }
    const released = ungroupShapeRoot(f.sheet.drawings!, "group", f.metrics);
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, released)),
    ).toBe(true);
    const releasedSnapshot = serializeWorkbook(f.session.workbook),
      own = leafOptions(f.sheet.drawings!, f.metrics, "first"),
      ownPlan = planShapeLeafPixels(own),
      ownPixels = pixels(own);
    expect(releasedSnapshot.version).toBe(68);
    expect(serializeWorkbook(deserializeWorkbook(releasedSnapshot))).toEqual(releasedSnapshot);
    expect(own.groupScene).toBeUndefined();
    expect(own.drawing.shapeText).toBeUndefined();
    expect(own.drawing.width).toBe(80);
    expect(own.drawing.height).toBe(60);
    expect(ownPlan.bodyPlan.effectiveStyle.rotation3d).toEqual({ kind: "value", value: camera });
    expect(ownPlan.bodyPlan.effectiveStyle.format3d).toEqual(format);
    expect(ownPlan.bodyPlan.isProjected).toBe(true);
    expect(ownPlan.textFollowsBodyProjection).toBe(true);
    expect(ownPlan.cssBorderRects).toEqual(activePlan.cssBorderRects);
    expect(ownPlan.textLayout).toEqual(activePlan.textLayout);
    expect(
      coloredBounds(activePixels, "blue").left - coloredBounds(ownPixels, "blue").left,
    ).toBeCloseTo(90 * (1 - Math.cos(Math.PI / 6)), 0);
    expect(
      coloredBounds(activePixels, "red").left - coloredBounds(ownPixels, "red").left,
    ).toBeCloseTo(90 * (1 - Math.cos(Math.PI / 6)), 0);
    expect(
      ownPixels.data.some(
        (g, i) =>
          i % 4 === 1 && g > 150 && ownPixels.data[i - 1]! < 50 && ownPixels.data[i + 1]! < 50,
      ),
    ).toBe(false);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(groupedSnapshot);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(activePixels);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(releasedSnapshot);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(ownPixels);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("no-3D legacy TextBox pixels and actual CSS inside-border survive Group/Ungroup and exact history", () => {
    const f = fixture(),
      original = leafOptions(f.sheet.drawings!, f.metrics, "first"),
      originalPixels = pixels(original),
      before = serializeWorkbook(f.session.workbook);
    expect(before.version).toBe(60);
    const plan = planShapeLeafPixels(original);
    expect(plan.bodyPlan.isProjected).toBe(false);
    expect(plan.textFollowsBodyProjection).toBe(false);
    expect(plan.renderPolicy).toBe("legacy-text-box");
    expect(plan.cssBorderRects).toEqual([
      { x: 0, y: 0, width: 80, height: 3 },
      { x: 0, y: 57, width: 80, height: 3 },
      { x: 0, y: 3, width: 3, height: 54 },
      { x: 77, y: 3, width: 3, height: 54 },
    ]);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetSheetDrawingsCommand(
          f.sheet.id,
          groupShapeRoots(
            f.sheet.drawings!,
            ["first", "second"],
            { id: "group", name: "Group" },
            f.metrics,
          ),
        ),
      ),
    ).toBe(true);
    const grouped = serializeWorkbook(f.session.workbook);
    expect(grouped.version).toBe(61);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(originalPixels);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetSheetDrawingsCommand(
          f.sheet.id,
          ungroupShapeRoot(f.sheet.drawings!, "group", f.metrics),
        ),
      ),
    ).toBe(true);
    const released = serializeWorkbook(f.session.workbook);
    expect(released.version).toBe(60);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(originalPixels);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(grouped);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(originalPixels);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(released);
    expect(pixels(leafOptions(f.sheet.drawings!, f.metrics, "first"))).toEqual(originalPixels);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(
      canvases
        .flatMap((canvas) => canvas.context.glyphCalls)
        .every((call) => call.matrix[0] > 0 && call.matrix[3] > 0),
    ).toBe(true);
  });
});
