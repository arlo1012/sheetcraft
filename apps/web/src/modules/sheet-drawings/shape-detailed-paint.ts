import { isShapeLinePreset } from "@sheetcraft/core/shape-line-ends";
import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  normalizeShapeStyle,
  type ShapeDetailedStyle,
  type ShapePaint,
} from "@sheetcraft/core/shape-style";
import {
  FREE_SHAPE_PATH_WORK_BUDGET,
  type EvaluatedShapePresetGeometry,
} from "@sheetcraft/core/shape-presets";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  createDetailedPictureRaster,
  planDetailedPictureRaster,
  type PictureDetailedRaster,
  type PictureDetailedRasterPlan,
  type PictureDetailedRasterUnavailable,
  type DecodedPicturePaintImage,
} from "../../shared/images/picture-detailed-compositor";
import {
  getPictureRasterProjection,
  type PicturePaintResources,
} from "../../shared/images/picture-detailed-render";
import {
  preparePictureShapeGeometry,
  type PictureShapeSourceProfile,
} from "../../shared/images/picture-shape-mask";
import { getShapeEndPaint } from "./shape-line-paint";

export type ShapePaintResources = PicturePaintResources;
export type ShapeDetailedPaintOptions = Readonly<{
  drawing: SheetGraphicDrawing;
  /** The actual evaluated preset/free/legacy numeric source, before flip/outer rotation. */
  geometry: EvaluatedShapePresetGeometry;
  /** Explicit preview style; omitted means drawing.shapeStyle. */
  style?: ShapeDetailedStyle;
  density: number;
  resources?: ShapePaintResources;
  /** World angle includes the existing outer drawing rotation, without baking it into paths. */
  angleDeg?: number;
}>;
export type ShapeDetailedPaintPlan = PictureDetailedRasterPlan &
  Readonly<{
    effectiveGeometry: EvaluatedShapePresetGeometry;
    sourceProfile: PictureShapeSourceProfile;
    effectiveStyle: ShapeDetailedStyle;
  }>;
export type ShapeDetailedPaintRaster = PictureDetailedRaster &
  Readonly<{
    effectiveGeometry: EvaluatedShapePresetGeometry;
    sourceProfile: PictureShapeSourceProfile;
    effectiveStyle: ShapeDetailedStyle;
  }>;

/** Source/style/budget failures are explicit. Callers must not substitute an unformatted shape. */
export class ShapePaintPreflightError extends RangeError {
  readonly code = "shape-paint-preflight";
  constructor(cause: RangeError) {
    super(cause.message, { cause });
    this.name = "ShapePaintPreflightError";
  }
}
export class ShapePaintUnavailableError extends Error {
  readonly code = "shape-paint-unavailable";
  readonly missingAssetIds: readonly string[];
  readonly reason: PictureDetailedRasterUnavailable["reason"];
  constructor(result: PictureDetailedRasterUnavailable) {
    super("Shape appearance resources are unavailable.");
    this.name = "ShapePaintUnavailableError";
    this.reason = result.reason;
    this.missingAssetIds = result.missingAssetIds;
  }
}
function solid(color: string): ShapePaint | undefined {
  if (color.toLowerCase() === "transparent") return;
  if (!/^#[\da-f]{6}$/i.test(color))
    throw new TypeError("Shape source colors require RGB or transparent.");
  return { kind: "solid", color: { kind: "rgb", rgb: color }, opacity: 1 };
}
/** Sparse detailed categories inherit only the real shape's basic fill/line. No image theme backplate. */
export function resolveShapeDetailedPaintStyle(
  drawing: SheetGraphicDrawing,
  style: ShapeDetailedStyle | undefined = drawing.shapeStyle,
): ShapeDetailedStyle {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new TypeError("Detailed shape paint requires a shape or text box drawing.");
  const own = normalizeShapeStyle(style),
    result: ShapeDetailedStyle = { ...own };
  if (result.fill === undefined) {
    const noDefaultFill =
      (drawing.shapeGeometry && isShapeLinePreset(drawing.shapeGeometry.preset)) ||
      (drawing.shapePath && !isShapeFreePathClosed(drawing.shapePath)) ||
      (!drawing.shapeGeometry && !drawing.shapePath && drawing.shape === "line");
    const paint = noDefaultFill ? undefined : solid(drawing.fill);
    result.fill = paint ? { kind: "value", value: paint } : { kind: "none" };
  }
  if (result.line === undefined) {
    if (
      !Number.isFinite(drawing.strokeWidth) ||
      drawing.strokeWidth < 0 ||
      drawing.strokeWidth > 32
    )
      throw new RangeError("Shape source stroke width exceeds its ordinary drawing budget.");
    const paint = solid(drawing.stroke);
    result.line =
      paint && drawing.strokeWidth > 0
        ? {
            kind: "value",
            value: {
              paint,
              widthPt: drawing.strokeWidth * 0.75,
              compound: "single",
              dash: "solid",
              cap: "round",
              join: "round",
              miterLimit: 4,
            },
          }
        : { kind: "none" };
  }
  return normalizeShapeStyle(result)!;
}
function prepareSource(options: ShapeDetailedPaintOptions) {
  const { drawing, geometry } = options;
  const explicit = normalizeShapeStyle(options.style ?? drawing.shapeStyle);
  const style = resolveShapeDetailedPaintStyle(drawing, explicit);
  const workBudget = drawing.shapePath ? FREE_SHAPE_PATH_WORK_BUDGET : undefined;
  // A free path's explicit detailed fill requests Canvas fill closure. It never adds a Z stroke.
  const fillOpen = !!drawing.shapePath && explicit?.fill?.kind === "value";
  const lineShape =
    (drawing.shapeGeometry && isShapeLinePreset(drawing.shapeGeometry.preset)) ||
    (!drawing.shapeGeometry && !drawing.shapePath && drawing.shape === "line");
  const input = lineShape
    ? {
        ...geometry,
        paths: geometry.paths.map((path) => ({
          ...path,
          filled: false,
          fillMode: "none" as const,
        })),
      }
    : fillOpen
      ? {
          ...geometry,
          paths: geometry.paths.map((path) => ({
            ...path,
            filled: true,
            fillMode: "norm" as const,
          })),
        }
      : geometry;
  const prepared = preparePictureShapeGeometry(
    input,
    { width: drawing.width, height: drawing.height },
    { kind: "drawing", workBudget },
  );
  const detached = Object.freeze({
    ...prepared.geometry,
    paths: Object.freeze(
      prepared.geometry.paths.map((path) =>
        Object.freeze({ ...path, fillMode: path.fillMode ?? ("norm" as const) }),
      ),
    ),
    textRect: geometry.textRect ? Object.freeze({ ...geometry.textRect }) : null,
    connectionSites: Object.freeze(
      geometry.connectionSites.map((site) =>
        Object.freeze({ ...site, position: Object.freeze({ ...site.position }) }),
      ),
    ),
  }) as EvaluatedShapePresetGeometry;
  const line = style.line?.kind === "value" ? style.line.value : undefined;
  const markerDrawing: SheetGraphicDrawing = {
    ...drawing,
    stroke: line && line.paint.opacity > 0 ? "#000000" : "transparent",
    strokeWidth: line ? (line.widthPt * 4) / 3 : 0,
  };
  const markers = getShapeEndPaint(markerDrawing, detached);
  const sourceProfile: PictureShapeSourceProfile = Object.freeze({
    kind: "drawing",
    workBudget,
    lineDecorations: Object.freeze(
      markers.map((marker) =>
        Object.freeze({
          filled: marker.filled,
          fillMode: marker.filled ? ("norm" as const) : ("none" as const),
          stroke: true,
          commands: marker.commands,
        }),
      ),
    ),
  });
  return { effectiveGeometry: detached, sourceProfile, effectiveStyle: style };
}
function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof RangeError && !(error instanceof ShapePaintPreflightError))
      throw new ShapePaintPreflightError(error);
    throw error;
  }
}
/** Pure support, resources and bounds preflight. No Canvas, decoding, source callback or asset mutation. */
export function planShapeDetailedPaint(options: ShapeDetailedPaintOptions): ShapeDetailedPaintPlan {
  return checked(() => {
    const source = prepareSource(options);
    const theme = options.resources?.theme ?? DEFAULT_WORKBOOK_THEME;
    const plan = planDetailedPictureRaster({
      widthPx: options.drawing.width,
      heightPx: options.drawing.height,
      pixelDensity: options.density,
      style: source.effectiveStyle,
      outerAngleDeg: options.angleDeg ?? options.drawing.rotation,
      shapeGeometry: source.effectiveGeometry,
      shapeSource: source.sourceProfile,
      ...getPictureRasterProjection(
        source.effectiveStyle,
        theme,
        source.effectiveGeometry,
        source.sourceProfile,
      ),
      getAssetSize: options.resources?.getAssetSize,
    });
    return { ...plan, ...source };
  });
}
const cache = new Map<string, Extract<ShapeDetailedPaintRaster, { kind: "ready" }>>();
const identities = new WeakMap<object, number>();
let nextIdentity = 1,
  cachedBytes = 0;
const CACHE_BYTES = 32 * 1024 * 1024,
  CACHE_ENTRIES = 32;
function identity(object: object): number {
  let id = identities.get(object);
  if (id === undefined) {
    id = nextIdentity++;
    identities.set(object, id);
  }
  return id;
}
function remove(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cachedBytes -= entry.canvas.width * entry.canvas.height * 4;
  entry.canvas.width = 0;
  entry.canvas.height = 0;
  cache.delete(key);
}
export function clearShapeDetailedPaintCache(): void {
  for (const key of cache.keys()) remove(key);
}
/** Prepared pixels belong to the actual shape identity and decoded paint-resource identities.
 * Numeric path masks paint the source; no FloatingImage, synthetic document asset or persisted bitmap.
 * Optional sourcePainter paints additional numeric source pixels in the actual logical frame.
 * Caller owns flip/outer rotation and applies overall alpha once when presenting the final Canvas. */
export function prepareShapeDetailedPaint(
  options: ShapeDetailedPaintOptions &
    Readonly<{
      key?: string;
      sourceIdentity?: object;
      sourcePainter?: (context: CanvasRenderingContext2D) => void;
      canvasFactory?: () => HTMLCanvasElement;
    }>,
): ShapeDetailedPaintRaster {
  return checked(() => {
    const plan = planShapeDetailedPaint(options);
    const images = new Map<string, DecodedPicturePaintImage>();
    for (const id of plan.assetIds) {
      const image = options.resources?.getAssetImage?.(id);
      if (image) images.set(id, image);
    }
    const missingAssetIds = plan.assetIds.filter((id) => !images.has(id));
    if (missingAssetIds.length)
      return { ...plan, kind: "unavailable", reason: "asset-unavailable", missingAssetIds };
    const theme = options.resources?.theme ?? DEFAULT_WORKBOOK_THEME;
    const key = JSON.stringify([
      identity(options.sourceIdentity ?? options.drawing),
      options.key ?? "",
      plan.effectiveGeometry,
      plan.sourceProfile,
      plan.effectiveStyle,
      options.density,
      options.angleDeg ?? options.drawing.rotation,
      theme,
      options.sourcePainter ? identity(options.sourcePainter) : null,
      [...images].map(([id, image]) => [id, identity(image)]),
    ]);
    // Additional source pixels require an explicit caller revision/content key.
    const cacheable =
      !options.canvasFactory && (!options.sourcePainter || options.key !== undefined);
    const existing = cacheable ? cache.get(key) : undefined;
    if (existing) {
      cache.delete(key);
      cache.set(key, existing);
      return existing;
    }
    const raster = createDetailedPictureRaster({
      widthPx: options.drawing.width,
      heightPx: options.drawing.height,
      pixelDensity: options.density,
      style: plan.effectiveStyle,
      outerAngleDeg: options.angleDeg ?? options.drawing.rotation,
      shapeGeometry: plan.effectiveGeometry,
      shapeSource: plan.sourceProfile,
      theme,
      ...getPictureRasterProjection(
        plan.effectiveStyle,
        theme,
        plan.effectiveGeometry,
        plan.sourceProfile,
      ),
      sourcePainter: options.sourcePainter ?? (() => {}),
      getAssetImage: (id) => images.get(id),
      canvasFactory: options.canvasFactory,
    });
    const result: ShapeDetailedPaintRaster = {
      ...raster,
      effectiveGeometry: plan.effectiveGeometry,
      sourceProfile: plan.sourceProfile,
      effectiveStyle: plan.effectiveStyle,
    };
    if (result.kind === "ready" && cacheable) {
      const bytes = result.canvas.width * result.canvas.height * 4;
      while (cache.size >= CACHE_ENTRIES || cachedBytes + bytes > CACHE_BYTES) {
        const first = cache.keys().next().value;
        if (first === undefined) break;
        remove(first);
      }
      if (bytes <= CACHE_BYTES) {
        cache.set(key, result);
        cachedBytes += bytes;
      }
    }
    return result;
  });
}
