// @vitest-environment node
import { describe, expect, test } from "vitest";
import { getPictureRasterProjection } from "../../../shared/images/picture-detailed-render";
import {
  PICTURE_PATTERN_PRESETS,
  type PictureDetailedStyle,
  type PictureLine,
  type PicturePaint,
  type PictureShadow,
} from "@sheetcraft/core/picture-detailed-style";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { evaluateShapePreset, type ShapePresetGeometry } from "@sheetcraft/core/shape-presets";
import {
  createDetailedPictureRaster,
  planDetailedPictureRaster,
  PictureDetailedRasterUnsupportedError,
  PICTURE_DETAILED_RASTER_LIMITS,
  type PictureDetailedRaster,
  type PictureDetailedRasterOptions,
} from "../../../shared/images/picture-detailed-compositor";

type Point = readonly [number, number];
type Stroke = {
  points: readonly Point[];
  closed: boolean;
  width: number;
  cap: string;
  join: string;
  miter: number;
};

/** Deterministic Canvas boundary double, not a claim of browser stroke fidelity.
 * Pure raster primitives own pixel-effect tests; these cases verify the adapter,
 * real premultiplied composition, bounded reads, clipping and continuous paths. */
class MemoryCanvas {
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray();
  readonly context = new MemoryContext(this);
  readonly strokes: Stroke[] = [];
  readonly dots: { point: Point; radius: number }[] = [];
  reads = 0;
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
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  miterLimit = 10;
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  lineDashOffset = 0;
  private dash: number[] = [];
  private sx = 1;
  private sy = 1;
  private tx = 0;
  private ty = 0;
  private clipping: readonly [number, number, number, number] | undefined;
  private readonly stack: (readonly [number, number, number, number, typeof this.clipping])[] = [];
  private points: Point[] = [];
  private contours: { points: Point[]; closed: boolean }[] = [];
  private closed = false;
  private rectangle: readonly [number, number, number, number] | undefined;
  constructor(readonly canvas: MemoryCanvas) {}
  save() {
    this.stack.push([this.sx, this.sy, this.tx, this.ty, this.clipping]);
  }
  restore() {
    const state = this.stack.pop();
    if (state) [this.sx, this.sy, this.tx, this.ty, this.clipping] = state;
  }
  scale(x: number, y: number) {
    this.sx *= x;
    this.sy *= y;
  }
  translate(x: number, y: number) {
    this.tx += this.sx * x;
    this.ty += this.sy * y;
  }
  beginPath() {
    this.points = [];
    this.contours = [];
    this.closed = false;
    this.rectangle = undefined;
  }
  rect(x: number, y: number, width: number, height: number) {
    this.rectangle = [
      x * this.sx + this.tx,
      y * this.sy + this.ty,
      (x + width) * this.sx + this.tx,
      (y + height) * this.sy + this.ty,
    ];
  }
  clip() {
    this.clipping = this.rectangle;
  }
  moveTo(x: number, y: number) {
    const point: Point = [x * this.sx + this.tx, y * this.sy + this.ty];
    this.contours.push({ points: [point], closed: false });
    this.points.push(point);
  }
  lineTo(x: number, y: number) {
    const point: Point = [x * this.sx + this.tx, y * this.sy + this.ty];
    if (!this.contours.length) this.contours.push({ points: [], closed: false });
    this.contours.at(-1)!.points.push(point);
    this.points.push(point);
  }
  closePath() {
    this.closed = true;
    if (this.contours.length) this.contours.at(-1)!.closed = true;
  }
  setLineDash(value: number[]) {
    this.dash = [...value];
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const current = this.points.at(-1)!;
    const px = (current[0] - this.tx) / this.sx,
      py = (current[1] - this.ty) / this.sy;
    for (let index = 1; index <= 48; index++) {
      const t = index / 48,
        s = 1 - t;
      this.lineTo(s * s * px + 2 * s * t * cx + t * t * x, s * s * py + 2 * s * t * cy + t * t * y);
    }
  }
  bezierCurveTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number) {
    const current = this.points.at(-1)!;
    const px = (current[0] - this.tx) / this.sx,
      py = (current[1] - this.ty) / this.sy;
    for (let index = 1; index <= 48; index++) {
      const t = index / 48,
        s = 1 - t;
      this.lineTo(
        s ** 3 * px + 3 * s * s * t * cx1 + 3 * s * t * t * cx2 + t ** 3 * x,
        s ** 3 * py + 3 * s * s * t * cy1 + 3 * s * t * t * cy2 + t ** 3 * y,
      );
    }
  }
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    _rotation: number,
    start: number,
    end: number,
  ) {
    const count = Math.max(1, Math.ceil((Math.abs(end - start) / (2 * Math.PI)) * 128));
    const firstX = cx + rx * Math.cos(start),
      firstY = cy + ry * Math.sin(start);
    if (this.contours.length) this.lineTo(firstX, firstY);
    else this.moveTo(firstX, firstY);
    for (let index = 1; index <= count; index++) {
      const t = start + ((end - start) * index) / count;
      this.lineTo(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
    }
  }
  stroke() {
    this.canvas.strokes.push({
      points: [...this.points],
      closed: this.closed,
      width: this.lineWidth,
      cap: this.lineCap,
      join: this.lineJoin,
      miter: this.miterLimit,
    });
    const width = this.lineWidth * this.sx,
      half = width / 2;
    const pattern = this.dash.map((value) => value * this.sx),
      period = pattern.reduce((sum, value) => sum + value, 0);
    this.rasterPath((x, y) => {
      for (const contour of this.contours) {
        let along = 0;
        for (let index = 1; index < contour.points.length + (contour.closed ? 1 : 0); index++) {
          const a = contour.points[index - 1]!,
            b = contour.points[index % contour.points.length]!;
          const dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy);
          if (length === 0) continue;
          const t = Math.max(
            0,
            Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length)),
          );
          if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= half) {
            let phase = period
              ? (((along + t * length + this.lineDashOffset) % period) + period) % period
              : 0;
            let entry = 0;
            while (period && entry < pattern.length - 1 && phase > pattern[entry]!) {
              phase -= pattern[entry]!;
              entry++;
            }
            if (!period || entry % 2 === 0) return true;
          }
          along += length;
        }
      }
      return false;
    }, half);
  }
  arc(x: number, y: number, radius: number) {
    this.canvas.dots.push({ point: [x + this.tx, y + this.ty], radius });
    this.ellipse(x, y, radius, radius, 0, 0, 2 * Math.PI);
  }
  private rasterPath(inside: (x: number, y: number) => boolean, margin = 0) {
    if (!this.points.length) return;
    const left = Math.max(
      0,
      Math.floor(Math.min(...this.points.map((point) => point[0])) - margin),
    );
    const top = Math.max(0, Math.floor(Math.min(...this.points.map((point) => point[1])) - margin));
    const right = Math.min(
      this.canvas.width,
      Math.ceil(Math.max(...this.points.map((point) => point[0])) + margin),
    );
    const bottom = Math.min(
      this.canvas.height,
      Math.ceil(Math.max(...this.points.map((point) => point[1])) + margin),
    );
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        let hits = 0;
        for (const sx of [0.25, 0.75])
          for (const sy of [0.25, 0.75]) if (inside(x + sx, y + sy)) hits++;
        const index = (y * this.canvas.width + x) * 4,
          sa = hits / 4,
          da = this.canvas.data[index + 3]! / 255;
        if (sa === 0) continue;
        this.canvas.data[index] = 255;
        this.canvas.data[index + 1] = 255;
        this.canvas.data[index + 2] = 255;
        this.canvas.data[index + 3] = (sa + da * (1 - sa)) * 255;
      }
  }
  fill() {
    this.rasterPath((x, y) => {
      let winding = 0;
      for (const contour of this.contours)
        for (let index = 0; index < contour.points.length; index++) {
          const a = contour.points[index]!,
            b = contour.points[(index + 1) % contour.points.length]!;
          const cross = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
          if (a[1] <= y && b[1] > y && cross > 0) winding++;
          else if (a[1] > y && b[1] <= y && cross < 0) winding--;
        }
      return winding !== 0;
    });
  }
  fillRect(x: number, y: number, width: number, height: number) {
    const rectangle = [
      x * this.sx + this.tx,
      y * this.sy + this.ty,
      (x + width) * this.sx + this.tx,
      (y + height) * this.sy + this.ty,
    ];
    const parsed = this.fillStyle.startsWith("#")
      ? [1, 3, 5].map((offset) => Number.parseInt(this.fillStyle.slice(offset, offset + 2), 16))
      : this.fillStyle.match(/[\d.]+/g)!.map(Number);
    const color = parsed.slice(0, 3),
      opacity = parsed[3] ?? 1;
    const left = Math.max(0, rectangle[0]!, this.clipping?.[0] ?? 0),
      top = Math.max(0, rectangle[1]!, this.clipping?.[1] ?? 0);
    const right = Math.min(
      this.canvas.width,
      rectangle[2]!,
      this.clipping?.[2] ?? this.canvas.width,
    );
    const bottom = Math.min(
      this.canvas.height,
      rectangle[3]!,
      this.clipping?.[3] ?? this.canvas.height,
    );
    for (let py = Math.floor(top); py < Math.ceil(bottom); py++)
      for (let px = Math.floor(left); px < Math.ceil(right); px++) {
        const coverage =
          Math.max(0, Math.min(px + 1, right) - Math.max(px, left)) *
          Math.max(0, Math.min(py + 1, bottom) - Math.max(py, top));
        const sa = opacity * coverage,
          index = (py * this.canvas.width + px) * 4,
          da = this.canvas.data[index + 3]! / 255;
        const alpha = sa + da * (1 - sa);
        if (alpha === 0) continue;
        for (let channel = 0; channel < 3; channel++)
          this.canvas.data[index + channel] =
            (color[channel]! * sa + this.canvas.data[index + channel]! * da * (1 - sa)) / alpha;
        this.canvas.data[index + 3] = alpha * 255;
      }
  }
  drawImage(source: MemoryCanvas, x: number, y: number, width: number, height: number) {
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++) {
        const sx = Math.min(source.width - 1, Math.floor(((px + 0.5) / width) * source.width));
        const sy = Math.min(source.height - 1, Math.floor(((py + 0.5) / height) * source.height));
        const output = ((py + y) * this.canvas.width + px + x) * 4;
        this.canvas.data.set(
          source.data.subarray((sy * source.width + sx) * 4, (sy * source.width + sx + 1) * 4),
          output,
        );
      }
  }
  getImageData(_x: number, _y: number, width: number, height: number) {
    this.canvas.reads++;
    if (this.canvas.failRead) throw new Error("tainted canvas");
    return { width, height, data: new Uint8ClampedArray(this.canvas.data) };
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
    canvasFactory: () => {
      const canvas = new MemoryCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
  };
}
function options(extra: Partial<PictureDetailedRasterOptions> = {}): PictureDetailedRasterOptions {
  return {
    widthPx: 12,
    heightPx: 10,
    pixelDensity: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    sourcePainter: () => {},
    ...extra,
  };
}
function pixel(result: PictureDetailedRaster, x: number, y: number): number[] {
  if (result.kind !== "ready") throw new Error("expected available raster");
  const canvas = result.canvas as unknown as MemoryCanvas;
  return Array.from(canvas.data.slice((y * canvas.width + x) * 4, (y * canvas.width + x + 1) * 4));
}
function framePixel(result: PictureDetailedRaster, x: number, y: number): number[] {
  return pixel(
    result,
    Math.floor(x * result.actualDensity - result.outputBoundsRaster.left),
    Math.floor(y * result.actualDensity - result.outputBoundsRaster.top),
  );
}
function solid(rgb = "#ff0000", opacity = 1): PicturePaint {
  return { kind: "solid", color: { kind: "rgb", rgb }, opacity };
}
function filled(paint: PicturePaint): PictureDetailedStyle {
  return { fill: { kind: "value", value: paint } };
}
function source(context: CanvasRenderingContext2D) {
  context.fillStyle = "rgba(0,0,255,0.5)";
  context.fillRect(0, 0, 2, 2);
}
function shadow(extra: Partial<PictureShadow> = {}): PictureShadow {
  return {
    kind: "outer",
    color: { kind: "rgb", rgb: "#000000" },
    opacity: 0.7,
    scale: 1,
    blurPt: 0,
    distancePt: 3,
    angleDeg: 0,
    anchor: "center",
    ...extra,
  } as PictureShadow;
}
function texture(): MemoryCanvas {
  const canvas = new MemoryCanvas();
  canvas.width = 2;
  canvas.height = 2;
  canvas.data.set([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0]);
  return canvas;
}
function picture(layout: Extract<PicturePaint, { kind: "picture" }>["layout"]): PicturePaint {
  return { kind: "picture", assetId: "texture", opacity: 1, rotateWithShape: true, layout };
}

describe("actual picture-shape alpha and outline composition", () => {
  function shaped(
    preset: Parameters<typeof evaluateShapePreset>[0],
    extra: Partial<PictureDetailedRasterOptions> = {},
  ) {
    return createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 20,
        heightPx: 20,
        shapeGeometry: evaluateShapePreset(preset, 20, 20),
        sourcePainter: (context) => {
          context.fillStyle = "#0000ff";
          context.fillRect(-100, -100, 200, 200);
        },
        ...extra,
      }),
    );
  }
  test("ellipse has real transparent corners while rect matches the complete legacy frame", () => {
    const ellipse = shaped({ preset: "ellipse" });
    expect(framePixel(ellipse, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(framePixel(ellipse, 10, 10)).toEqual([0, 0, 255, 255]);
    const rect = shaped({ preset: "rect" });
    expect(framePixel(rect, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(framePixel(rect, 19, 19)).toEqual([0, 0, 255, 255]);
    const legacy = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 20,
        heightPx: 20,
        sourcePainter: (context) => {
          context.fillStyle = "#0000ff";
          context.fillRect(0, 0, 20, 20);
        },
      }),
    );
    expect(rect.logicalBounds).toEqual(legacy.logicalBounds);
    expect(
      (rect.kind === "ready" ? (rect.canvas as unknown as MemoryCanvas) : undefined)?.data,
    ).toEqual(
      (legacy.kind === "ready" ? (legacy.canvas as unknown as MemoryCanvas) : undefined)?.data,
    );
  });
  test("Arc fills a quarter sector in its true upper-right bounds, rather than an empty open arc", () => {
    const result = shaped({ preset: "arc" });
    expect(result.logicalBounds).toEqual({ left: 10, top: 0, right: 20, bottom: 10 });
    expect(framePixel(result, 12, 8)).toEqual([0, 0, 255, 255]);
    expect(framePixel(result, 19, 0)[3]).toBe(0);
  });
  test("leftBrace retains its closed colored area and donut retains its nonzero hole", () => {
    const brace = shaped({ preset: "leftBrace" });
    if (brace.kind !== "ready") throw new Error("missing brace");
    expect(
      (brace.canvas as unknown as MemoryCanvas).data.some(
        (value, index) => index % 4 === 3 && value > 0,
      ),
    ).toBe(true);
    const donut = shaped({ preset: "donut" });
    expect(framePixel(donut, 10, 10)).toEqual([0, 0, 0, 0]);
    expect(framePixel(donut, 10, 1)).toEqual([0, 0, 255, 255]);
  });
  test("callout tail remains colored outside the original frame without a second rect clip", () => {
    const result = shaped({ preset: "wedgeRectCallout" });
    expect(result.logicalBounds.bottom).toBeGreaterThan(20);
    const canvas = result.kind === "ready" ? (result.canvas as unknown as MemoryCanvas) : undefined;
    expect(canvas).toBeDefined();
    let outsideAlpha = 0;
    for (let y = 20; y < canvas!.height; y++)
      for (let x = 0; x < canvas!.width; x++) outsideAlpha += pixel(result, x, y)[3]!;
    expect(outsideAlpha).toBeGreaterThan(0);
  });
  test("source and behind-image fill are masked together once, including partial edge alpha", () => {
    const result = shaped(
      { preset: "ellipse" },
      {
        style: filled(solid("#ff0000")),
        sourcePainter: (context) => {
          context.fillStyle = "rgba(0,0,255,0.5)";
          context.fillRect(-100, -100, 200, 200);
        },
      },
    );
    expect(framePixel(result, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(framePixel(result, 10, 10)).toEqual([127, 0, 128, 255]);
    const canvas = result.kind === "ready" ? (result.canvas as unknown as MemoryCanvas) : undefined;
    const edge = Array.from(
      { length: canvas!.width * canvas!.height },
      (_, index) => index * 4,
    ).find((index) => canvas!.data[index + 3]! > 0 && canvas!.data[index + 3]! < 255)!;
    expect(edge).toBeDefined();
    expect(Array.from(canvas!.data.slice(edge, edge + 3))).toEqual([127, 0, 128]);
  });
  test("separate filled paths union while reversed contours inside one path remain holes", () => {
    const rectangle = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      reverse = false,
    ): ShapePresetGeometry["paths"][number]["commands"] =>
      reverse
        ? [["M", left, top], ["L", left, bottom], ["L", right, bottom], ["L", right, top], ["Z"]]
        : [["M", left, top], ["L", right, top], ["L", right, bottom], ["L", left, bottom], ["Z"]];
    const geometry: ShapePresetGeometry = {
      width: 20,
      height: 20,
      handles: [],
      adjustments: {},
      paths: [
        {
          filled: true,
          stroke: false,
          commands: [
            ...rectangle(0, 0, 16, 16),
            ...rectangle(4, 4, 12, 12, true),
          ] as ShapePresetGeometry["paths"][number]["commands"],
        },
        {
          filled: true,
          stroke: false,
          commands: rectangle(
            8,
            8,
            20,
            20,
            true,
          ) as ShapePresetGeometry["paths"][number]["commands"],
        },
      ],
    };
    const result = shaped(undefined, { shapeGeometry: geometry });
    expect(framePixel(result, 6, 6)[3]).toBe(0);
    expect(framePixel(result, 10, 10)[3]).toBe(255);
    expect(framePixel(result, 14, 14)[3]).toBe(255);
  });
  test("ellipse outline follows its actual perimeter, not the enclosing rectangle", () => {
    const result = shaped(
      { preset: "ellipse" },
      {
        sourcePainter: () => {},
        style: {
          line: {
            kind: "value",
            value: {
              paint: solid("#ff0000"),
              widthPt: 0.75,
              compound: "single",
              dash: "solid",
              cap: "round",
              join: "round",
              miterLimit: 10,
            },
          },
        },
      },
    );
    expect(framePixel(result, 0, 0)[3]).toBe(0);
    expect(framePixel(result, 10, 0)[0]).toBe(255);
    expect(framePixel(result, 10, 10)[3]).toBe(0);
  });
  test("Arc's filled radial closure is never added to its stroke-only arc", () => {
    const result = shaped(
      { preset: "arc" },
      {
        sourcePainter: () => {},
        style: {
          line: {
            kind: "value",
            value: {
              paint: solid(),
              widthPt: 0.75,
              compound: "single",
              dash: "solid",
              cap: "butt",
              join: "round",
              miterLimit: 10,
            },
          },
        },
      },
    );
    expect(framePixel(result, 10, 8)[3]).toBe(0);
    expect(framePixel(result, 15, 9)[3]).toBe(0);
    expect(framePixel(result, 10, 0)[3]).toBeGreaterThan(0);
  });
  test.each(["single", "double", "thick-thin", "thin-thick", "triple"] as const)(
    "%s compound strokes actual curved contours and never draws Arc radial edges",
    (compound) => {
      const style: PictureDetailedStyle = {
        line: {
          kind: "value",
          value: {
            paint: solid(),
            widthPt: 1.5,
            compound,
            dash: "solid",
            cap: "butt",
            join: "round",
            miterLimit: 10,
          },
        },
      };
      for (const preset of ["ellipse", "donut", "arc"] as const) {
        const result = shaped({ preset }, { sourcePainter: () => {}, style });
        expect(framePixel(result, 10, 0)[3]).toBeGreaterThan(0);
        if (preset !== "arc") expect(framePixel(result, 10, 10)[3]).toBe(0);
        else {
          expect(framePixel(result, 10, 8)[3]).toBe(0);
          expect(framePixel(result, 15, 9)[3]).toBe(0);
        }
      }
    },
  );
  test("shape silhouettes and holes feed true-alpha shadow/glow/reflection/projector stages", () => {
    let checked = false;
    const result = shaped(
      { preset: "donut" },
      {
        projectedBounds: (_density, front) => front,
        projectSurface: (layer) => {
          checked = true;
          expect(layer.surface.data[(10 * layer.surface.width + 10) * 4 + 3]).toBe(0);
          return layer;
        },
        style: {
          shadow: { kind: "value", value: shadow({ distancePt: 1.5, opacity: 1 }) },
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 0.75 },
          },
          reflection: {
            kind: "value",
            value: { size: 0.5, opacity: 0.5, blurPt: 0, distancePt: 0.75 },
          },
        },
      },
    );
    expect(checked).toBe(true);
    expect(framePixel(result, 0, 0)[3]).toBe(0);
    expect(framePixel(result, 10, 10)[3]).toBe(0);
    expect(result.logicalBounds.bottom).toBeGreaterThan(20);
  });
  test("invalid/mismatched/over-budget shapes fail before Canvas or source callbacks", () => {
    const canvas = factory();
    let painted = 0;
    const base = evaluateShapePreset({ preset: "rect" }, 20, 20);
    for (const geometry of [
      { ...base, width: 19 },
      { ...base, paths: [] },
      { ...base, paths: [{ ...base.paths[0]!, filled: false }] },
      {
        ...base,
        paths: [
          { ...base.paths[0]!, commands: Array.from({ length: 1025 }, () => ["M", 0, 0] as const) },
        ],
      },
    ]) {
      expect(() =>
        createDetailedPictureRaster(
          options({
            ...canvas,
            widthPx: 20,
            heightPx: 20,
            shapeGeometry: geometry,
            sourcePainter: () => {
              painted++;
            },
          }),
        ),
      ).toThrow();
    }
    expect(canvas.canvases).toHaveLength(0);
    expect(painted).toBe(0);
  });
  test("shape-mask scratch and real tail/outline bounds obey tightened aggregate budgets", () => {
    const plan = planDetailedPictureRaster({
      widthPx: 4000,
      heightPx: 4000,
      pixelDensity: 1,
      shapeGeometry: evaluateShapePreset({ preset: "wedgeRectCallout" }, 4000, 4000),
      limits: { side: 128, pixels: 8000, memoryBytes: 1_000_000 },
    });
    expect(plan.actualDensity).toBeLessThan(1);
    expect(plan.widthRaster).toBeLessThanOrEqual(128);
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(8000);
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(1_000_000);
    expect(plan.logicalBounds.bottom).toBeGreaterThan(4000);
  });
});

describe("pure detailed-picture preflight", () => {
  test.each([NaN, Infinity, 0, -1])(
    "rejects invalid frame/density %s before Canvas or source work",
    (invalid) => {
      const canvas = factory();
      let paints = 0;
      expect(() =>
        createDetailedPictureRaster(
          options({
            ...canvas,
            widthPx: invalid,
            sourcePainter: () => {
              paints++;
            },
          }),
        ),
      ).toThrow();
      expect(() =>
        createDetailedPictureRaster(options({ ...canvas, pixelDensity: invalid })),
      ).toThrow();
      expect(canvas.canvases).toHaveLength(0);
      expect(paints).toBe(0);
    },
  );
  test("adapts huge valid points, transformed shadows and inner scratch before allocating", () => {
    for (const kind of ["outer", "inner", "perspective"] as const) {
      const effect =
        kind === "perspective"
          ? {
              ...shadow(),
              kind,
              scale: 16,
              scaleX: 16,
              scaleY: -16,
              skewXDeg: 80,
              originX: 0.1,
              originY: 0.8,
            }
          : { ...shadow(), kind };
      const plan = planDetailedPictureRaster({
        widthPx: 4000,
        heightPx: 3000,
        pixelDensity: 64,
        style: {
          shadow: { kind: "value", value: { ...effect, blurPt: 4096, distancePt: 4096 } },
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, sizePt: 4096 },
          },
          reflection: {
            kind: "value",
            value: { size: 1, opacity: 1, blurPt: 4096, distancePt: 4096 },
          },
          softEdges: { kind: "value", value: { sizePt: 4096 } },
        },
      });
      expect(plan.kind).toBe("ready");
      expect(plan.actualDensity).toBeLessThanOrEqual(256 / ((4096 * 4) / 3));
      expect(plan.widthRaster).toBeLessThanOrEqual(4096);
      expect(plan.heightRaster).toBeLessThanOrEqual(4096);
      expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(4_000_000);
      expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(
        PICTURE_DETAILED_RASTER_LIMITS.memoryBytes,
      );
    }
  });
  test("also adapts a maximum-width compound line instead of prematurely rejecting it", () => {
    const plan = planDetailedPictureRaster({
      widthPx: 10,
      heightPx: 8,
      pixelDensity: 64,
      style: {
        line: {
          kind: "value",
          value: {
            paint: solid(),
            widthPt: 4096,
            compound: "triple",
            dash: "solid",
            cap: "round",
            join: "miter",
            miterLimit: 1000,
          },
        },
      },
    });
    expect(plan.kind).toBe("ready");
    expect(plan.widthRaster).toBeLessThanOrEqual(4096);
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(4_000_000);
  });
  test("missing fill/line texture metadata reports all missing IDs and retains paint bounds", () => {
    const paint = picture({
      kind: "stretch",
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    });
    const plan = planDetailedPictureRaster({
      widthPx: 10,
      heightPx: 8,
      pixelDensity: 1,
      style: {
        fill: { kind: "value", value: paint },
        line: {
          kind: "value",
          value: {
            paint: { ...paint, assetId: "border" } as PicturePaint,
            widthPt: 3,
            compound: "single",
            dash: "solid",
            cap: "butt",
            join: "round",
            miterLimit: 10,
          },
        },
      },
    });
    expect(plan.kind).toBe("unavailable");
    expect(plan.assetIds).toEqual(["texture", "border"]);
    if (plan.kind === "unavailable") expect(plan.missingAssetIds).toEqual(["texture", "border"]);
    expect(plan.logicalBounds.left).toBeLessThan(0);
    const canvas = factory();
    let called = false;
    expect(
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: filled(paint),
          sourcePainter: () => {
            called = true;
          },
        }),
      ).kind,
    ).toBe("unavailable");
    expect(canvas.canvases).toHaveLength(0);
    expect(called).toBe(false);
  });
  test("tightened budgets are honored and cannot expand product budgets", () => {
    const plan = planDetailedPictureRaster({
      widthPx: 1000,
      heightPx: 1000,
      pixelDensity: 4,
      limits: { side: 128, pixels: 8000, memoryBytes: 1_000_000 },
    });
    expect(plan.widthRaster).toBeLessThanOrEqual(128);
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(8000);
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(1_000_000);
    expect(() =>
      planDetailedPictureRaster({
        widthPx: 2,
        heightPx: 2,
        pixelDensity: 1,
        limits: { pixels: 4_000_001 },
      }),
    ).toThrow();
  });
  test("explicit 3D None is a supported 2D choice; 3D values fail before assets/Canvas", () => {
    const canvas = factory();
    let assetReads = 0;
    const rotation3d = {
      kind: "value" as const,
      value: {
        projection: "parallel" as const,
        xDeg: 0,
        yDeg: 0,
        zDeg: 0,
        distanceFromGroundPt: 0,
      },
    };
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: { rotation3d },
          getAssetImage: () => {
            assetReads++;
            return undefined;
          },
        }),
      ),
    ).toThrow(PictureDetailedRasterUnsupportedError);
    expect(canvas.canvases).toHaveLength(0);
    expect(assetReads).toBe(0);
    expect(
      planDetailedPictureRaster({
        widthPx: 2,
        heightPx: 2,
        pixelDensity: 1,
        style: { format3d: { kind: "none" }, rotation3d: { kind: "none" } },
      }).kind,
    ).toBe("ready");
  });
  test("malformed choices and pathological dash counts are gated before allocation", () => {
    const canvas = factory();
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: { fill: { kind: "value", value: { ...solid(), opacity: NaN } } },
        }),
      ),
    ).toThrow();
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: {
            line: {
              kind: "value",
              value: {
                paint: solid(),
                widthPt: 1e-8,
                compound: "single",
                dash: "round-dot",
                cap: "round",
                join: "round",
                miterLimit: 10,
              },
            },
          },
        }),
      ),
    ).toThrow(/interval budget/);
    expect(canvas.canvases).toHaveLength(0);
  });
});

describe("source, fill and opacity ownership", () => {
  test("zero-opacity quantified effects neither lower density nor invoke out-of-budget filters", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        sourcePainter: source,
        style: {
          shadow: { kind: "value", value: shadow({ opacity: 0, blurPt: 4096, distancePt: 4096 }) },
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#ff0000" }, opacity: 0, sizePt: 4096 },
          },
          reflection: {
            kind: "value",
            value: { size: 1, opacity: 0, blurPt: 4096, distancePt: 4096 },
          },
          line: {
            kind: "value",
            value: {
              paint: solid("#ff0000", 0),
              widthPt: 4096,
              compound: "triple",
              dash: "round-dot",
              cap: "round",
              join: "miter",
              miterLimit: 10,
            },
          },
        },
      }),
    );
    expect(result.actualDensity).toBe(1);
    expect(result.logicalBounds).toEqual({ left: 0, top: 0, right: 12, bottom: 10 });
    expect(framePixel(result, 0, 0)).toEqual([0, 0, 255, 128]);
    const emptyReflection = createDetailedPictureRaster(
      options({
        ...factory(),
        sourcePainter: source,
        style: {
          reflection: {
            kind: "value",
            value: { size: 0, opacity: 1, blurPt: 4096, distancePt: 4096 },
          },
        },
      }),
    );
    expect(emptyReflection.actualDensity).toBe(1);
    expect(framePixel(emptyReflection, 0, 0)).toEqual([0, 0, 255, 128]);
  });
  test("paint is behind true source alpha and whole-picture opacity is not duplicated", () => {
    const canvas = factory();
    const result = createDetailedPictureRaster(
      options({ ...canvas, style: filled(solid()), sourcePainter: source }),
    );
    expect(framePixel(result, 0, 0)).toEqual([127, 0, 128, 255]);
    expect(framePixel(result, 4, 4)).toEqual([255, 0, 0, 255]);
    expect(canvas.canvases.filter((item) => item.width > 0)).toHaveLength(1);
    expect(result.kind === "ready" && result.canvas).toBe(canvas.canvases.at(-1));
  });
  test("absent and explicit None categories retain transparent PNG pixels", () => {
    const style: PictureDetailedStyle = {
      fill: { kind: "none" },
      line: { kind: "none" },
      shadow: { kind: "none" },
      reflection: { kind: "none" },
      glow: { kind: "none" },
      softEdges: { kind: "none" },
    };
    for (const detailed of [undefined, style]) {
      const result = createDetailedPictureRaster(
        options({ ...factory(), style: detailed, sourcePainter: source }),
      );
      expect(framePixel(result, 0, 0)).toEqual([0, 0, 255, 128]);
      expect(framePixel(result, 5, 5)).toEqual([0, 0, 0, 0]);
    }
  });
  test("fractional density clips source and fill to the actual frame", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 3,
        heightPx: 3,
        pixelDensity: 1.5,
        style: filled(solid()),
        sourcePainter: (context) => {
          context.fillStyle = "#0000ff";
          context.fillRect(-100, -100, 200, 200);
        },
      }),
    );
    expect(result.widthRaster).toBe(5);
    expect(pixel(result, 4, 4)[3]).toBeGreaterThan(0);
    expect(pixel(result, 4, 4)[3]).toBeLessThan(255);
  });
  test("live theme colors are resolved for each output without mutating stored references", () => {
    const style = filled({
      kind: "solid",
      opacity: 1,
      color: { kind: "theme", reference: { slot: "accent1" } },
    });
    const before = JSON.stringify(style);
    const theme: WorkbookTheme = {
      ...DEFAULT_WORKBOOK_THEME,
      accentColors: [
        "#00ff00",
        ...DEFAULT_WORKBOOK_THEME.accentColors.slice(1),
      ] as WorkbookTheme["accentColors"],
    };
    expect(
      framePixel(createDetailedPictureRaster(options({ ...factory(), style })), 0, 0).slice(0, 3),
    ).toEqual([79, 129, 189]);
    expect(
      framePixel(createDetailedPictureRaster(options({ ...factory(), style, theme })), 0, 0).slice(
        0,
        3,
      ),
    ).toEqual([0, 255, 0]);
    expect(JSON.stringify(style)).toBe(before);
  });
  test("every temporary Canvas is released after a source error", () => {
    const canvas = factory();
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          sourcePainter: () => {
            throw new Error("source failure");
          },
        }),
      ),
    ).toThrow("source failure");
    expect(canvas.canvases.length).toBeGreaterThan(0);
    expect(canvas.canvases.every((item) => item.width === 0 && item.height === 0)).toBe(true);
  });
});

describe("complete picture paint adapters", () => {
  const stops = [
    { offset: 0, color: { kind: "rgb" as const, rgb: "#ff0000" }, opacity: 0, brightness: 0 },
    { offset: 1, color: { kind: "rgb" as const, rgb: "#0000ff" }, opacity: 1, brightness: 0.5 },
  ];
  test.each(["linear", "radial", "rectangular"] as const)(
    "%s gradient resolves brightness and premultiplied translucent stops",
    (kind) => {
      const paint: PicturePaint =
        kind === "linear"
          ? { kind, angleDeg: 0, opacity: 0.5, rotateWithShape: true, stops }
          : {
              kind,
              centerX: 0.5,
              centerY: 0.5,
              radiusX: 0.5,
              radiusY: 0.5,
              opacity: 0.5,
              rotateWithShape: true,
              stops,
            };
      const result = createDetailedPictureRaster(options({ ...factory(), style: filled(paint) }));
      const rgba = framePixel(result, 6, 5);
      expect(rgba.slice(0, 3)).toEqual([128, 128, 255]);
      expect(rgba[3]).toBeGreaterThan(0);
      expect(rgba[3]).toBeLessThan(128);
    },
  );
  test("coincident gradient stops retain a right-continuous hard transition", () => {
    const paint: PicturePaint = {
      kind: "linear",
      angleDeg: 0,
      opacity: 1,
      rotateWithShape: true,
      stops: [
        { offset: 0, color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, brightness: 0 },
        { offset: 0.5, color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, brightness: 0 },
        { offset: 0.5, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
        { offset: 1, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
      ],
    };
    const result = createDetailedPictureRaster(
      options({ ...factory(), widthPx: 3, heightPx: 3, style: filled(paint) }),
    );
    expect(framePixel(result, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(framePixel(result, 1, 1)).toEqual([0, 0, 255, 255]);
  });
  test.each(PICTURE_PATTERN_PRESETS)("renders %s with independent colors and opacity", (preset) => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 16,
        heightPx: 16,
        style: filled({
          kind: "pattern",
          preset,
          foreground: { kind: "rgb", rgb: "#ff0000" },
          background: { kind: "rgb", rgb: "#0000ff" },
          opacity: 0.25,
          rotateWithShape: true,
        }),
      }),
    );
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      const data = (result.canvas as unknown as MemoryCanvas).data;
      for (let index = 0; index < data.length; index += 4) {
        expect(Math.abs(data[index]! + data[index + 2]! - 255)).toBeLessThanOrEqual(1);
        expect(data[index + 1]).toBe(0);
        expect(data[index + 3]).toBe(64);
      }
    }
  });
  test("world-fixed gradients use the inverse outer angle about the frame center", () => {
    const paint: PicturePaint = {
      kind: "linear",
      angleDeg: 0,
      opacity: 1,
      rotateWithShape: false,
      stops: [
        { offset: 0, color: { kind: "rgb", rgb: "#000000" }, opacity: 1, brightness: 0 },
        { offset: 1, color: { kind: "rgb", rgb: "#ffffff" }, opacity: 1, brightness: 0 },
      ],
    };
    const fixed = createDetailedPictureRaster(
      options({ ...factory(), widthPx: 8, heightPx: 8, outerAngleDeg: 90, style: filled(paint) }),
    );
    const rotating = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 8,
        heightPx: 8,
        outerAngleDeg: 90,
        style: filled({ ...paint, rotateWithShape: true }),
      }),
    );
    expect(framePixel(fixed, 0, 1)).toEqual(framePixel(fixed, 7, 1));
    expect(framePixel(fixed, 0, 1)).not.toEqual(framePixel(fixed, 0, 6));
    expect(framePixel(rotating, 0, 1)).toEqual(framePixel(rotating, 0, 6));
  });
  test("stretch offsets and ratios leave transparent regions inside a clipped frame", () => {
    const image = texture();
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 8,
        heightPx: 8,
        getAssetImage: () => image as unknown as HTMLCanvasElement,
        style: filled(
          picture({
            kind: "stretch",
            offsetXRatio: 0.25,
            offsetYRatio: 0.25,
            widthRatio: 0.5,
            heightRatio: 0.5,
          }),
        ),
      }),
    );
    expect(framePixel(result, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(framePixel(result, 2, 2)[3]).toBe(255);
    expect(framePixel(result, 7, 7)).toEqual([0, 0, 0, 0]);
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
  });
  test("tile offsets are points and mirrors alternate adjacent tiles", () => {
    const image = texture();
    const render = (flip: "none" | "x", offsetXPt: number) =>
      createDetailedPictureRaster(
        options({
          ...factory(),
          widthPx: 6,
          heightPx: 2,
          getAssetImage: () => image as unknown as HTMLCanvasElement,
          style: filled(
            picture({
              kind: "tile",
              scaleX: 1,
              scaleY: 1,
              offsetXPt,
              offsetYPt: 0,
              anchor: "top-left",
              flip,
            }),
          ),
        }),
      );
    expect(framePixel(render("none", 0), 2, 0)).toEqual([255, 0, 0, 255]);
    expect(framePixel(render("x", 0), 2, 0)).toEqual([0, 0, 255, 255]);
    expect(framePixel(render("none", 0.75), 1, 0)).toEqual([255, 0, 0, 255]);
    expect(framePixel(render("none", 0.75), 0, 0)).toEqual([0, 0, 255, 255]);
  });
  test.each([
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ] as const)("tile alignment supports %s", (anchor) => {
    const image = texture();
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 5,
        heightPx: 5,
        getAssetImage: () => image as unknown as HTMLCanvasElement,
        style: filled(
          picture({
            kind: "tile",
            scaleX: 1.5,
            scaleY: 0.5,
            offsetXPt: -0.5,
            offsetYPt: 0.75,
            anchor,
            flip: "xy",
          }),
        ),
      }),
    );
    expect(result.kind).toBe("ready");
    expect(framePixel(result, 2, 2)[3]).toBeGreaterThanOrEqual(0);
  });
  test("unreadable textures are explicit unavailable results and release every scratch Canvas", () => {
    const image = texture(),
      canvas = factory();
    const result = createDetailedPictureRaster(
      options({
        ...canvas,
        canvasFactory: () => {
          const created = canvas.canvasFactory() as unknown as MemoryCanvas;
          created.failRead = true;
          return created as unknown as HTMLCanvasElement;
        },
        getAssetImage: () => image as unknown as HTMLCanvasElement,
        style: filled(
          picture({
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          }),
        ),
      }),
    );
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toBe("asset-pixels-unavailable");
      expect(result.missingAssetIds).toEqual(["texture"]);
    }
    expect(canvas.canvases.every((item) => item.width === 0 && item.height === 0)).toBe(true);
    expect(image.width).toBe(2);
  });
  test("extremely small tiles prefilter premultiplied RGBA without overflow or tile loops", () => {
    const image = texture();
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 4,
        heightPx: 4,
        getAssetImage: () => image as unknown as HTMLCanvasElement,
        style: filled(
          picture({
            kind: "tile",
            scaleX: Number.MIN_VALUE,
            scaleY: Number.MIN_VALUE,
            offsetXPt: 4096,
            offsetYPt: -4096,
            anchor: "bottom-right",
            flip: "xy",
          }),
        ),
      }),
    );
    expect(framePixel(result, 0, 0)).toEqual([85, 85, 85, 191]);
    expect(framePixel(result, 3, 3)).toEqual([85, 85, 85, 191]);
  });
});

describe("bounded delegated projective stage", () => {
  const rotation3d: PictureDetailedStyle["rotation3d"] = {
    kind: "value",
    value: { projection: "parallel", xDeg: 20, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
  };
  test("pure projected bounds receive exact raster padding and never call the projector", () => {
    let projections = 0,
      boundCalls = 0;
    const plan = planDetailedPictureRaster({
      widthPx: 4000,
      heightPx: 3000,
      pixelDensity: 1,
      style: { rotation3d },
      projectSurface: (layer) => {
        projections++;
        return layer;
      },
      projectedBounds: (density, front, frame) => {
        boundCalls++;
        expect(frame.width).toBe(4000 * density);
        expect(frame.height).toBe(3000 * density);
        return {
          left: front.left - 3,
          top: front.top - 3,
          right: front.right + 3,
          bottom: front.bottom + 3,
        };
      },
    });
    expect(boundCalls).toBeGreaterThan(0);
    expect(projections).toBe(0);
    expect(plan.isProjected).toBe(true);
    expect(plan.actualDensity).toBeLessThan(1);
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(4_000_000);
  });
  test("front finishing precedes projection and negative projected origins remain exact", () => {
    let projections = 0;
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 4,
        heightPx: 4,
        style: { rotation3d },
        frontPaintBounds: { left: -2, top: -1, right: 5, bottom: 5 },
        finishFrontPainter: (context) => {
          context.fillStyle = "#00ff00";
          context.fillRect(-2, -1, 1, 1);
        },
        projectedBounds: (_density, front) => ({
          left: front.left - 3,
          top: front.top - 2,
          right: front.right - 3,
          bottom: front.bottom - 2,
        }),
        projectSurface: (input, density, frame) => {
          projections++;
          expect(density).toBe(1);
          expect(frame).toEqual({ widthPx: 4, heightPx: 4 });
          expect(input.left).toBe(-2);
          expect(input.top).toBe(-1);
          expect(Array.from(input.surface.data.subarray(0, 4))).toEqual([0, 255, 0, 255]);
          return { surface: input.surface, left: input.left - 3, top: input.top - 2 };
        },
      }),
    );
    expect(projections).toBe(1);
    expect(result.logicalBounds).toEqual({ left: -5, top: -3, right: 2, bottom: 3 });
    expect(pixel(result, 0, 0)).toEqual([0, 255, 0, 255]);
  });
  test("effects derive from projected alpha rather than the unprojected frame", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 4,
        heightPx: 4,
        sourcePainter: (context) => {
          context.fillStyle = "#ff0000";
          context.fillRect(0, 0, 1, 1);
        },
        style: {
          rotation3d,
          shadow: { kind: "value", value: shadow({ opacity: 1, distancePt: 1.5 }) },
        },
        projectedBounds: { left: -2, top: -3, right: 2, bottom: 1 },
        projectSurface: (input) => ({ surface: input.surface, left: -2, top: -3 }),
      }),
    );
    expect(framePixel(result, -2, -3)).toEqual([255, 0, 0, 255]);
    expect(framePixel(result, 0, -3)).toEqual([0, 0, 0, 255]);
    expect(framePixel(result, 1, 0)).toEqual([0, 0, 0, 0]);
  });
  test("missing one projection half fails before source/asset work", () => {
    const canvas = factory();
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: { rotation3d },
          projectedBounds: { left: 0, top: 0, right: 12, bottom: 10 },
        }),
      ),
    ).toThrow(PictureDetailedRasterUnsupportedError);
    expect(() =>
      createDetailedPictureRaster(
        options({ ...canvas, style: { rotation3d }, projectSurface: (layer) => layer }),
      ),
    ).toThrow(PictureDetailedRasterUnsupportedError);
    expect(canvas.canvases).toHaveLength(0);
  });
  test("out-of-plan projector results fail loudly and release temporary Canvas resources", () => {
    const canvas = factory();
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvas,
          style: { rotation3d },
          projectedBounds: { left: 0, top: 0, right: 12, bottom: 10 },
          projectSurface: (input) => ({ ...input, left: -1 }),
        }),
      ),
    ).toThrow(/preflight bounds/);
    expect(canvas.canvases.every((item) => item.width === 0 && item.height === 0)).toBe(true);
  });
});

describe("complete effect composition", () => {
  test("outer shadow uses actual source alpha and never casts the empty frame", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        sourcePainter: source,
        style: { shadow: { kind: "value", value: shadow({ opacity: 1 }) } },
      }),
    );
    expect(framePixel(result, 4, 0)).toEqual([0, 0, 0, 128]);
    expect(framePixel(result, 10, 5)).toEqual([0, 0, 0, 0]);
  });
  test("inner shadow colors the existing PNG alpha without making it opaque", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        sourcePainter: source,
        style: { shadow: { kind: "value", value: shadow({ kind: "inner", opacity: 1 }) } },
      }),
    );
    expect(framePixel(result, 0, 0)).toEqual([0, 0, 0, 128]);
    expect(framePixel(result, 5, 5)).toEqual([0, 0, 0, 0]);
  });
  test("glow follows source holes and soft edges feather inward", () => {
    const paint = (context: CanvasRenderingContext2D) => {
      context.fillStyle = "#ff0000";
      context.fillRect(2, 2, 8, 6);
    };
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        sourcePainter: paint,
        style: {
          softEdges: { kind: "value", value: { sizePt: 0.75 } },
          glow: {
            kind: "value",
            value: { color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, sizePt: 2.25 },
          },
        },
      }),
    );
    expect(result.logicalBounds.left).toBeLessThan(0);
    expect(framePixel(result, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(framePixel(result, 1, 4)[2]).toBe(255);
    expect(framePixel(result, 1, 4)[3]).toBeGreaterThan(0);
  });
  test("reflection has quantified coverage, point gap, fade and actual reflected colors", () => {
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        widthPx: 4,
        heightPx: 8,
        sourcePainter: (context) => {
          context.fillStyle = "#ff0000";
          context.fillRect(0, 0, 4, 8);
        },
        style: {
          reflection: {
            kind: "value",
            value: { size: 0.5, opacity: 0.8, distancePt: 1.5, blurPt: 0 },
          },
        },
      }),
    );
    expect(framePixel(result, 1, 9)).toEqual([0, 0, 0, 0]);
    expect(framePixel(result, 1, 10).slice(0, 3)).toEqual([255, 0, 0]);
    expect(framePixel(result, 1, 10)[3]!).toBeGreaterThan(framePixel(result, 1, 13)[3]!);
    expect(result.logicalBounds.bottom).toBe(14);
  });
});

describe("outline Canvas mask contracts", () => {
  const compounds: PictureLine["compound"][] = [
    "single",
    "double",
    "thick-thin",
    "thin-thick",
    "triple",
  ];
  const dashes: PictureLine["dash"][] = [
    "solid",
    "round-dot",
    "square-dot",
    "dash",
    "short-dash",
    "long-dash",
    "long-dash-dot",
    "long-dash-dot-dot",
  ];
  test.each(compounds)(
    "%s bands retain total width, all dash types and cap/join/miter controls",
    (compound) => {
      for (const dash of dashes)
        for (const cap of ["butt", "round", "square"] as const)
          for (const join of ["round", "bevel", "miter"] as const) {
            const canvas = factory();
            createDetailedPictureRaster(
              options({
                ...canvas,
                widthPx: 32,
                heightPx: 28,
                style: {
                  line: {
                    kind: "value",
                    value: {
                      paint: solid(),
                      widthPt: 1.5,
                      compound,
                      dash,
                      cap,
                      join,
                      miterLimit: 1.25,
                    },
                  },
                },
              }),
            );
            const mask = canvas.canvases.find((item) => item.strokes.length || item.dots.length)!;
            expect(mask).toBeDefined();
            if (dash === "round-dot") expect(mask.dots.length).toBeGreaterThan(0);
            else
              for (const stroke of mask.strokes) {
                expect(stroke.cap).toBe(cap);
                expect(stroke.join).toBe(join);
                expect(stroke.miter).toBe(1.25);
                expect(stroke.width).toBeGreaterThan(0);
                expect(stroke.width).toBeLessThanOrEqual(2);
                if (dash === "solid") expect(stroke.closed).toBe(true);
              }
          }
    },
  );
  test("a dash crossing a corner is one joined path rather than independently phased sides", () => {
    const canvas = factory();
    createDetailedPictureRaster(
      options({
        ...canvas,
        widthPx: 11,
        heightPx: 13,
        style: {
          line: {
            kind: "value",
            value: {
              paint: solid(),
              widthPt: 1.5,
              compound: "single",
              dash: "long-dash",
              cap: "round",
              join: "round",
              miterLimit: 10,
            },
          },
        },
      }),
    );
    const mask = canvas.canvases.find((item) => item.strokes.length)!;
    expect(mask.strokes.some((stroke) => stroke.points.length >= 3)).toBe(true);
  });
});

describe("actual projective raster integration", () => {
  test("real identity format consumes source alpha and preserves a live fill", () => {
    const style: PictureDetailedStyle = {
      ...filled(solid("#ff0000")),
      format3d: {
        kind: "value",
        value: {
          depthPt: 0,
          depthColor: { kind: "automatic" },
          contourPt: 0,
          contourColor: { kind: "automatic" },
          material: "flat",
          lighting: "flat",
          lightingAngleDeg: 0,
        },
      },
    };
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        style,
        sourcePainter: source,
        ...getPictureRasterProjection(style, DEFAULT_WORKBOOK_THEME),
      }),
    );
    expect(framePixel(result, 6, 5)).toEqual([255, 0, 0, 255]);
    expect(framePixel(result, 0, 0)).toEqual([127, 0, 128, 255]);
  });
  test("real perspective, lit extrusion, contour, glow and reflection fit the exact pure plan", () => {
    const style: PictureDetailedStyle = {
      ...filled(solid("#ff0000")),
      format3d: {
        kind: "value",
        value: {
          depthPt: 3,
          depthColor: { kind: "rgb", rgb: "#0000ff" },
          contourPt: 0.75,
          contourColor: { kind: "rgb", rgb: "#00ff00" },
          material: "matte",
          lighting: "three-point",
          lightingAngleDeg: 30,
        },
      },
      rotation3d: {
        kind: "value",
        value: {
          projection: "perspective",
          perspectiveDeg: 45,
          xDeg: 30,
          yDeg: 20,
          zDeg: 10,
          distanceFromGroundPt: 0,
        },
      },
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#ffff00" }, opacity: 0.5, sizePt: 1.5 },
      },
      reflection: {
        kind: "value",
        value: { size: 0.5, opacity: 0.3, blurPt: 0.75, distancePt: 1.5 },
      },
    };
    const input = options({
      ...factory(),
      widthPx: 40,
      heightPx: 30,
      pixelDensity: 1.5,
      style,
      ...getPictureRasterProjection(style, DEFAULT_WORKBOOK_THEME),
    });
    const plan = planDetailedPictureRaster(input),
      result = createDetailedPictureRaster(input);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Missing actual paint");
    expect(result.outputBoundsRaster).toEqual(plan.outputBoundsRaster);
    expect(result.canvas.width).toBe(plan.widthRaster);
    expect(result.canvas.height).toBe(plan.heightRaster);
    const pixels = (result.canvas as unknown as MemoryCanvas).data;
    expect(pixels.some((channel, index) => index % 4 === 3 && channel > 0)).toBe(true);
    expect(pixels.some((channel, index) => index % 4 === 2 && channel > 0)).toBe(true);
    expect(result.logicalBounds.bottom).toBeGreaterThan(30);
  });
  test("a legitimate zero-depth edge-on plane composes an empty bitmap instead of rejecting its document", () => {
    const style: PictureDetailedStyle = {
      ...filled(solid()),
      rotation3d: {
        kind: "value",
        value: { projection: "parallel", xDeg: 90, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
      },
    };
    const result = createDetailedPictureRaster(
      options({
        ...factory(),
        style,
        ...getPictureRasterProjection(style, DEFAULT_WORKBOOK_THEME),
      }),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Missing empty paint");
    expect((result.canvas as unknown as MemoryCanvas).data.every((channel) => channel === 0)).toBe(
      true,
    );
  });
  test("actual unsafe camera depth fails before allocating any Canvas", () => {
    const canvases = factory();
    const style: PictureDetailedStyle = {
      rotation3d: {
        kind: "value",
        value: {
          projection: "perspective",
          perspectiveDeg: 45,
          xDeg: 0,
          yDeg: 0,
          zDeg: 0,
          distanceFromGroundPt: 2000,
        },
      },
    };
    expect(() =>
      createDetailedPictureRaster(
        options({
          ...canvases,
          style,
          ...getPictureRasterProjection(style, DEFAULT_WORKBOOK_THEME),
        }),
      ),
    ).toThrow();
    expect(canvases.canvases).toHaveLength(0);
  });
});
