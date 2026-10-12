import { getShapePresetFillBounds, type ShapePresetGeometry } from "@sheetcraft/core/shape-presets";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  createDetailedPictureRaster,
  planDetailedPictureRaster,
  type DecodedPicturePaintImage,
  type PictureDetailedRaster,
  type PictureDetailedRasterPlanOptions,
  type PictureDetailedRasterUnavailable,
} from "./picture-detailed-compositor";
import { createPictureProjectiveGeometry } from "./picture-projective-geometry";
import {
  createPictureProjectiveRaster,
  getPictureProjectivePaintBounds,
} from "./picture-projective-raster";
import { resolvePictureDetailedPaintStyle } from "./picture-detailed-paint-style";
import type { PictureShapeSourceProfile } from "./picture-shape-mask";
import type { DrawingThemeEffects } from "./picture-inherited-effects";

export type PicturePaintResources = Readonly<{
  theme?: WorkbookTheme;
  /** Metadata-only lookup: must not start decoding or fetching. */
  getAssetSize?: (assetId: string) => { width: number; height: number } | undefined;
  getAssetImage?: (assetId: string) => DecodedPicturePaintImage | undefined;
}>;

/** Density is read before local source transforms; this includes worksheet zoom/print scale. */
export function getPicturePaintDensity(context: CanvasRenderingContext2D): number {
  if (typeof context.getTransform !== "function") return 1;
  const matrix = context.getTransform();
  const density = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
  if (!Number.isFinite(density) || density <= 0)
    throw new RangeError("Picture paint density must be positive and finite.");
  return Math.min(64, density);
}

/** Pure projective adapters share the exact density/front bounds used by the raster planner. */
export function getPictureRasterProjection(
  style: PictureDetailedStyle,
  theme: WorkbookTheme,
  shapeGeometry?: ShapePresetGeometry,
  shapeSource?: PictureShapeSourceProfile,
) {
  const format = style.format3d?.kind === "value" ? style.format3d.value : undefined;
  const rotation = style.rotation3d?.kind === "value" ? style.rotation3d.value : undefined;
  if (!format && !rotation) return {};
  const geometry = (density: number, width: number, height: number) =>
    createPictureProjectiveGeometry({
      widthPx: width,
      heightPx: height,
      depthPx: (((format?.depthPt ?? 0) * 4) / 3) * density,
      rotation: rotation
        ? { ...rotation, distanceFromGroundPx: ((rotation.distanceFromGroundPt * 4) / 3) * density }
        : { projection: "parallel", xDeg: 0, yDeg: 0, zDeg: 0, distanceFromGroundPx: 0 },
    });
  const projection: Pick<PictureDetailedRasterPlanOptions, "projectedBounds" | "projectSurface"> = {
    projectedBounds: (density, frontBounds, frame) =>
      getPictureProjectivePaintBounds(
        geometry(density, frame.width, frame.height),
        frontBounds,
        Math.max(
          (((format?.contourPt ?? 0) * 4) / 3) * density,
          format?.material === "wire-frame" ? density : 0,
        ),
        shapeGeometry,
        density,
        shapeSource,
      ),
    projectSurface: (input, density, frame) =>
      createPictureProjectiveRaster({
        geometry: geometry(density, frame.widthPx, frame.heightPx),
        input,
        theme,
        format,
        density,
        shapeGeometry,
        shapeSource,
      }),
  };
  return projection;
}

export function planPictureDetailedPaint(options: {
  width: number;
  height: number;
  density: number;
  appearance: ImageAppearance | undefined;
  inherited?: DrawingThemeEffects;
  resources?: PicturePaintResources;
  angleDeg?: number;
  shapeGeometry?: ShapePresetGeometry;
}) {
  const resolved = resolvePictureDetailedPaintStyle(
    options.appearance,
    options.inherited,
    !!options.shapeGeometry,
  );
  if (!resolved) return;
  const theme = options.resources?.theme ?? DEFAULT_WORKBOOK_THEME;
  return planDetailedPictureRaster({
    widthPx: options.width,
    heightPx: options.height,
    pixelDensity: options.density,
    style: resolved.style,
    outerAngleDeg: options.angleDeg,
    ...getPictureRasterProjection(resolved.style, theme, options.shapeGeometry),
    shapeGeometry: options.shapeGeometry,
    frontPaintBounds: shapeThemePaintBounds(options.shapeGeometry, resolved.remainingTheme),
    getAssetSize: options.resources?.getAssetSize,
  });
}

function shapeThemePaintBounds(
  shape: ShapePresetGeometry | undefined,
  remaining: DrawingThemeEffects | undefined,
) {
  if (!shape || !remaining?.bevel) return undefined;
  const bounds = getShapePresetFillBounds({
    ...shape,
    paths: shape.paths.filter((path) => path.stroke).map((path) => ({ ...path, filled: true })),
  });
  return bounds
    ? {
        left: bounds.left - 1,
        top: bounds.top - 1,
        right: bounds.left + bounds.width + 1,
        bottom: bounds.top + bounds.height + 1,
      }
    : undefined;
}

const cache = new Map<string, Extract<PictureDetailedRaster, { kind: "ready" }>>();
const imageIdentities = new WeakMap<object, number>();
let nextIdentity = 1,
  cachedBytes = 0;
const CACHE_BYTES = 32 * 1024 * 1024,
  CACHE_ENTRIES = 32;
function identity(image: object): number {
  let id = imageIdentities.get(image);
  if (id === undefined) {
    id = nextIdentity++;
    imageIdentities.set(image, id);
  }
  return id;
}
function removeCache(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cachedBytes -= entry.canvas.width * entry.canvas.height * 4;
  entry.canvas.width = 0;
  entry.canvas.height = 0;
  cache.delete(key);
}
export function clearPictureDetailedPaintCache(): void {
  for (const key of cache.keys()) removeCache(key);
}

/** Caller key contains source/crop/annotations/2D geometry; resources are identity-bound here. */
export function preparePictureDetailedPaint(options: {
  key: string;
  sourceIdentity: object;
  width: number;
  height: number;
  density: number;
  appearance: ImageAppearance | undefined;
  inherited?: DrawingThemeEffects;
  resources?: PicturePaintResources;
  angleDeg?: number;
  shapeGeometry?: ShapePresetGeometry;
  sourcePainter: (context: CanvasRenderingContext2D) => void;
  finishFrontPainter?: (context: CanvasRenderingContext2D) => void;
}): PictureDetailedRaster | undefined {
  const resolved = resolvePictureDetailedPaintStyle(
    options.appearance,
    options.inherited,
    !!options.shapeGeometry,
  );
  if (!resolved) return;
  const theme = options.resources?.theme ?? DEFAULT_WORKBOOK_THEME;
  // A pure plan validates geometry/style/budgets before any Canvas or source painter.
  const projection = getPictureRasterProjection(resolved.style, theme, options.shapeGeometry);
  const plan = planPictureDetailedPaint(options)!;
  const images = new Map<string, DecodedPicturePaintImage>();
  for (const id of plan.assetIds) {
    const image = options.resources?.getAssetImage?.(id);
    if (image) images.set(id, image);
  }
  const missingAssetIds = plan.assetIds.filter((id) => !images.has(id));
  if (missingAssetIds.length)
    return { ...plan, kind: "unavailable", reason: "asset-unavailable", missingAssetIds };
  const key = JSON.stringify([
    identity(options.sourceIdentity),
    options.key,
    options.width,
    options.height,
    options.density,
    options.angleDeg ?? 0,
    options.shapeGeometry ?? null,
    !!options.finishFrontPainter,
    resolved.style,
    resolved.remainingTheme ?? null,
    theme,
    [...images].map(([id, image]) => [id, identity(image)]),
  ]);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const result = createDetailedPictureRaster({
    widthPx: options.width,
    heightPx: options.height,
    pixelDensity: options.density,
    style: resolved.style,
    outerAngleDeg: options.angleDeg,
    ...projection,
    shapeGeometry: options.shapeGeometry,
    frontPaintBounds: shapeThemePaintBounds(options.shapeGeometry, resolved.remainingTheme),
    theme,
    sourcePainter: options.sourcePainter,
    finishFrontPainter: options.finishFrontPainter,
    getAssetImage: (id) => images.get(id),
  });
  if (result.kind === "ready") {
    const bytes = result.canvas.width * result.canvas.height * 4;
    while (cache.size >= CACHE_ENTRIES || cachedBytes + bytes > CACHE_BYTES) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      removeCache(first);
    }
    if (bytes <= CACHE_BYTES) {
      cache.set(key, result);
      cachedBytes += bytes;
    }
  }
  return result;
}

/** An incomplete paint is never presented as the original unformatted picture. */
export class PicturePaintUnavailableError extends Error {
  readonly code = "picture-paint-unavailable";
  readonly missingAssetIds: readonly string[];
  constructor(result: PictureDetailedRasterUnavailable) {
    super("Picture appearance resources are unavailable.");
    this.name = "PicturePaintUnavailableError";
    this.missingAssetIds = result.missingAssetIds;
  }
}

/** Decorations are composed after the actual source; preserve corrections and color keying. */
export function getPicturePixelAppearance(
  appearance: ImageAppearance | undefined,
): ImageAppearance | undefined {
  if (!appearance) return;
  const pixel: ImageAppearance = {};
  for (const field of [
    "brightness",
    "contrast",
    "saturation",
    "grayscale",
    "sepia",
    "transparentColor",
    "transparentTolerance",
  ] as const) {
    const value = appearance[field];
    if (value !== undefined) Object.assign(pixel, { [field]: value });
  }
  return Object.keys(pixel).length ? pixel : undefined;
}
