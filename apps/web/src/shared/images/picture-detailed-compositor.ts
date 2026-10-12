import {
  getDetailedPictureStyleAssetIds,
  normalizeDetailedPictureStyle,
  type Choice,
  type PictureAnchor,
  type PictureDetailedStyle,
  type PictureLine,
  type PicturePaint,
  type PictureShadow,
} from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { ShapePresetGeometry } from "@sheetcraft/core/shape-presets";
import {
  assertPictureEffectBounds,
  expandPictureEffectBounds,
  getPictureLineCompoundBands,
  getPictureLineDashIntervals,
  getPictureReflectionBounds,
  getPictureShadowBounds,
  integerPictureEffectBounds,
  unionPictureEffectBounds,
  type PictureDashInterval,
  type PictureEffectAffine,
  type PictureEffectBounds,
  type PictureShadowGeometry,
} from "./picture-effect-geometry";
import {
  createPictureGlowLayer,
  createPictureReflectionLayer,
  createPictureRgbaSurface,
  createPictureShadowLayer,
  pictureAlphaMaskFromSurface,
  softenPictureEdges,
  type PictureRasterLayer,
  type PictureRgbaSurface,
} from "./picture-effect-raster";
import { resolvePictureColor, resolvePicturePaintStops } from "./picture-paint-color";
import { createPicturePatternSampler } from "./picture-paint-pattern";
import {
  applyPictureShapeAlphaMask,
  createPictureShapeAlphaMask,
  getPictureShapeOutlineIntervalCount,
  getPictureShapeStrokeBounds,
  preparePictureShapeGeometry,
  paintPictureShapeFillMask,
  validatePictureShapeLineDecorations,
  type PictureShapeSourceProfile,
  strokePictureShapeOutline,
  type PreparedPictureShapeGeometry,
} from "./picture-shape-mask";

/** Domain lengths are points; frames and returned paint bounds are logical CSS pixels. */
export const PICTURE_POINT_TO_LOGICAL_PIXEL = 4 / 3;
export const PICTURE_DETAILED_RASTER_LIMITS = Object.freeze({
  side: 4096,
  pixels: 4_000_000,
  memoryBytes: 256 * 1024 * 1024,
  effectRadiusPx: 256,
  requestedDensity: 64,
  logicalCoordinate: 10_000_000,
});

export type PicturePaintAssetSize = Readonly<{ width: number; height: number }>;
export type DecodedPicturePaintImage =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas;
export type PictureDetailedRasterLimits = Readonly<{
  /** These options may tighten the product limits, never raise them. */
  side?: number;
  pixels?: number;
  memoryBytes?: number;
}>;
export type PictureDetailedSurfaceProjector = (
  input: PictureRasterLayer,
  density: number,
  /** Raster-pixel dimensions of the actual local frame, excluding outline padding. */
  frame: Readonly<{ widthPx: number; heightPx: number }>,
) => PictureRasterLayer;
export type PictureRasterProjectionBoundsResolver = (
  density: number,
  frontBoundsRaster: PictureEffectBounds,
  frameRaster: Readonly<{ width: number; height: number }>,
) => PictureEffectBounds;
export type PictureDetailedRasterPlanOptions = Readonly<{
  widthPx: number;
  heightPx: number;
  pixelDensity: number;
  style?: PictureDetailedStyle;
  outerAngleDeg?: number;
  /** Read-only metadata. An unknown asset is explicit unavailability, never a solid fill. */
  getAssetSize?: (assetId: string) => PicturePaintAssetSize | undefined;
  limits?: PictureDetailedRasterLimits;
  /** A static box is LOGICAL pixels. A resolver receives/returns RASTER pixels,
   * so reconstruction/contour padding stays exact even at adaptive density<1.
   * It may do geometry only; preflight never invokes projectSurface. */
  projectedBounds?: PictureEffectBounds | PictureRasterProjectionBoundsResolver;
  projectSurface?: PictureDetailedSurfaceProjector;
  /** Extra front paint such as an inherited outline must declare any outside-frame extent. */
  frontPaintBounds?: PictureEffectBounds;
  /** Already evaluated numeric paths in the actual local frame. No rectangular fallback. */
  shapeGeometry?: ShapePresetGeometry;
  /** Actual source shapes allow stroke-only geometry and preserve per-path fill shading. */
  shapeSource?: PictureShapeSourceProfile;
}>;
type PictureDetailedRasterPlanBase = Readonly<{
  widthPx: number;
  heightPx: number;
  actualDensity: number;
  outerAngleDeg: number;
  style: PictureDetailedStyle | undefined;
  logicalBounds: PictureEffectBounds;
  bodyBoundsRaster: PictureEffectBounds;
  frontBoundsRaster: PictureEffectBounds;
  outputBoundsRaster: PictureEffectBounds;
  widthRaster: number;
  heightRaster: number;
  bodyWidthRaster: number;
  bodyHeightRaster: number;
  frontWidthRaster: number;
  frontHeightRaster: number;
  isProjected: boolean;
  shape: PreparedPictureShapeGeometry | undefined;
  lineDecorations: PreparedPictureShapeGeometry | undefined;
  estimatedPeakBytes: number;
  assetIds: readonly string[];
}>;
export type PictureDetailedRasterReadyPlan = PictureDetailedRasterPlanBase &
  Readonly<{ kind: "ready" }>;
export type PictureDetailedRasterUnavailable = PictureDetailedRasterPlanBase &
  Readonly<{
    kind: "unavailable";
    reason: "asset-unavailable" | "asset-pixels-unavailable";
    missingAssetIds: readonly string[];
  }>;
export type PictureDetailedRasterPlan =
  | PictureDetailedRasterReadyPlan
  | PictureDetailedRasterUnavailable;
export type PictureDetailedRasterOptions = Omit<PictureDetailedRasterPlanOptions, "getAssetSize"> &
  Readonly<{
    theme: WorkbookTheme;
    /** Draw source pixels, pixel filters and annotations in the unrotated local frame.
     * With a shape, its true out-of-frame bounds are available; no second frame rect clips tails.
     * The context is already scaled. Do not apply whole-picture opacity here. */
    sourcePainter: (context: CanvasRenderingContext2D) => void;
    getAssetImage?: (assetId: string) => DecodedPicturePaintImage | undefined;
    canvasFactory?: () => HTMLCanvasElement;
    /** App-owned inherited outline/bevel, painted after detailed line and before soft edges/3D.
     * Coordinates are the original logical frame; full-picture opacity still belongs outside. */
    finishFrontPainter?: (context: CanvasRenderingContext2D) => void;
  }>;
export type PictureDetailedRaster =
  | (PictureDetailedRasterReadyPlan & Readonly<{ canvas: HTMLCanvasElement }>)
  | PictureDetailedRasterUnavailable;

/** A caller can gate unsupported 3D before fetching/decompressing assets or making a Canvas. */
export class PictureDetailedRasterUnsupportedError extends Error {
  readonly code = "unsupported-picture-3d";
  constructor(readonly category: "format3d" | "rotation3d") {
    super(`Detailed picture ${category} requires the projective compositor.`);
    this.name = "PictureDetailedRasterUnsupportedError";
  }
}
class PicturePaintAssetReadError extends Error {
  constructor(
    readonly assetId: string,
    options?: ErrorOptions,
  ) {
    super("Picture paint asset pixels are unavailable.", options);
    this.name = "PicturePaintAssetReadError";
  }
}
function value<T>(choice: Choice<T> | undefined): T | undefined {
  return choice?.kind === "value" ? choice.value : undefined;
}
function numberIn(value: number, name: string, low: number, high: number): void {
  if (!Number.isFinite(value) || value < low || value > high)
    throw new RangeError(`Picture ${name} must be finite and within [${low}, ${high}].`);
}
function anchorPosition(anchor: PictureAnchor): readonly [number, number] {
  switch (anchor) {
    case "top-left":
      return [0, 0];
    case "top":
      return [0.5, 0];
    case "top-right":
      return [1, 0];
    case "left":
      return [0, 0.5];
    case "center":
      return [0.5, 0.5];
    case "right":
      return [1, 0.5];
    case "bottom-left":
      return [0, 1];
    case "bottom":
      return [0.5, 1];
    case "bottom-right":
      return [1, 1];
  }
}
function checkedLimits(options?: PictureDetailedRasterLimits) {
  const side = options?.side ?? PICTURE_DETAILED_RASTER_LIMITS.side;
  const pixels = options?.pixels ?? PICTURE_DETAILED_RASTER_LIMITS.pixels;
  const memoryBytes = options?.memoryBytes ?? PICTURE_DETAILED_RASTER_LIMITS.memoryBytes;
  for (const [entry, name, max] of [
    [side, "side budget", 4096],
    [pixels, "pixel budget", 4_000_000],
    [memoryBytes, "memory budget", 256 * 1024 * 1024],
  ] as const) {
    numberIn(entry, name, 1, max);
    if (!Number.isSafeInteger(entry)) throw new RangeError(`Picture ${name} must be an integer.`);
  }
  if (memoryBytes < 8192)
    throw new RangeError("Picture memory budget cannot hold the minimum compositor scratch.");
  return { side, pixels, memoryBytes };
}
function assetSize(size: PicturePaintAssetSize): void {
  numberIn(
    size.width,
    "asset width",
    Number.MIN_VALUE,
    PICTURE_DETAILED_RASTER_LIMITS.logicalCoordinate,
  );
  numberIn(
    size.height,
    "asset height",
    Number.MIN_VALUE,
    PICTURE_DETAILED_RASTER_LIMITS.logicalCoordinate,
  );
}
function shadowGeometry(
  shadow: PictureShadow,
  density: number,
  frameWidth: number,
  frameHeight: number,
  body: PictureEffectBounds,
  projected = false,
): PictureShadowGeometry {
  const anchor = anchorPosition(shadow.anchor);
  const width = body.right - body.left,
    height = body.bottom - body.top;
  const geometry: PictureShadowGeometry = {
    kind: shadow.kind,
    scale: shadow.scale,
    blurRadiusPx: shadow.blurPt * PICTURE_POINT_TO_LOGICAL_PIXEL * density,
    distancePx: shadow.distancePt * PICTURE_POINT_TO_LOGICAL_PIXEL * density,
    angleDeg: shadow.angleDeg,
    anchorX: projected ? anchor[0] : (anchor[0] * frameWidth - body.left) / width,
    anchorY: projected ? anchor[1] : (anchor[1] * frameHeight - body.top) / height,
  };
  if (shadow.kind === "perspective")
    geometry.cast = {
      scaleX: shadow.scaleX,
      scaleY: shadow.scaleY,
      skewX: Math.tan((shadow.skewXDeg * Math.PI) / 180),
      originX: projected ? shadow.originX : (shadow.originX * frameWidth - body.left) / width,
      originY: projected ? shadow.originY : (shadow.originY * frameHeight - body.top) / height,
    };
  return geometry;
}

/** Pure, bounded preflight. Bounds are appearance-only and never change the durable frame.
 * Density is reduced uniformly to respect both finite filter support and aggregate memory.
 * Missing metadata still returns the correct appearance bounds for placeholder/culling use. */
export function planDetailedPictureRaster(
  options: PictureDetailedRasterPlanOptions,
): PictureDetailedRasterPlan {
  numberIn(
    options.widthPx,
    "frame width",
    Number.MIN_VALUE,
    PICTURE_DETAILED_RASTER_LIMITS.logicalCoordinate,
  );
  numberIn(
    options.heightPx,
    "frame height",
    Number.MIN_VALUE,
    PICTURE_DETAILED_RASTER_LIMITS.logicalCoordinate,
  );
  numberIn(
    options.pixelDensity,
    "pixel density",
    Number.MIN_VALUE,
    PICTURE_DETAILED_RASTER_LIMITS.requestedDensity,
  );
  numberIn(options.outerAngleDeg ?? 0, "outer angle", -3600, 3600);
  const style = normalizeDetailedPictureStyle(options.style);
  const isProjected = options.projectedBounds !== undefined;
  const hasProjector = options.projectSurface !== undefined;
  if (value(style?.format3d) && (!isProjected || !hasProjector))
    throw new PictureDetailedRasterUnsupportedError("format3d");
  if (value(style?.rotation3d) && (!isProjected || !hasProjector))
    throw new PictureDetailedRasterUnsupportedError("rotation3d");
  if (isProjected !== hasProjector)
    throw new TypeError("Picture projection requires both pure bounds and a raster projector.");
  if (options.frontPaintBounds) assertPictureEffectBounds(options.frontPaintBounds);
  const shape = options.shapeGeometry
    ? preparePictureShapeGeometry(
        options.shapeGeometry,
        {
          width: options.widthPx,
          height: options.heightPx,
        },
        options.shapeSource,
      )
    : undefined;
  if (options.shapeSource && !shape)
    throw new TypeError("Drawing source profile requires numeric shape geometry.");
  const decorationPaths = validatePictureShapeLineDecorations(options.shapeSource);
  const lineDecorations = decorationPaths.length
    ? preparePictureShapeGeometry(
        {
          width: options.widthPx,
          height: options.heightPx,
          paths: decorationPaths,
          handles: [],
          adjustments: {},
        },
        { width: options.widthPx, height: options.heightPx },
        { kind: "drawing" },
      )
    : undefined;
  const limits = checkedLimits(options.limits);
  const line = value(style?.line),
    shadow = value(style?.shadow),
    reflection = value(style?.reflection);
  const glow = value(style?.glow),
    softEdges = value(style?.softEdges);
  const activeShadow = shadow && shadow.opacity > 0 ? shadow : undefined;
  const activeReflection =
    reflection && reflection.opacity > 0 && reflection.size > 0 ? reflection : undefined;
  const activeGlow = glow && glow.opacity > 0 ? glow : undefined;
  const activeLineWidthPt = line && line.paint.opacity > 0 ? line.widthPt : 0;
  const radii = [
    activeShadow?.blurPt ?? 0,
    activeReflection?.blurPt ?? 0,
    activeGlow?.sizePt ?? 0,
    softEdges?.sizePt ?? 0,
  ];
  const largestRadius = Math.max(...radii) * PICTURE_POINT_TO_LOGICAL_PIXEL;
  const largestDistance =
    Math.max(activeShadow?.distancePt ?? 0, activeReflection?.distancePt ?? 0) *
    PICTURE_POINT_TO_LOGICAL_PIXEL;
  let density = Math.min(
    options.pixelDensity,
    limits.side / options.widthPx,
    limits.side / options.heightPx,
    largestRadius > 0 ? 256 / largestRadius : Infinity,
    largestDistance > 0 ? 4096 / largestDistance : Infinity,
    activeLineWidthPt > 0 ? 4096 / (activeLineWidthPt * PICTURE_POINT_TO_LOGICAL_PIXEL) : Infinity,
  );
  const assetIds = getDetailedPictureStyleAssetIds(style);
  const missingAssetIds: string[] = [];
  for (const id of assetIds) {
    const size = options.getAssetSize?.(id);
    if (!size) missingAssetIds.push(id);
    else assetSize(size);
  }
  for (let attempt = 0; attempt < 32; attempt++) {
    if (!Number.isFinite(density) || density <= 0)
      throw new RangeError("Picture raster density cannot fit the resource budget.");
    const frameWidth = options.widthPx * density,
      frameHeight = options.heightPx * density;
    if (frameWidth === 0 || frameHeight === 0)
      throw new RangeError("Picture raster frame underflows the sampling coordinate range.");
    const frame: PictureEffectBounds = {
      left: 0,
      top: 0,
      right: Math.max(1, Math.ceil(frameWidth)),
      bottom: Math.max(1, Math.ceil(frameHeight)),
    };
    const lineWidth = activeLineWidthPt * PICTURE_POINT_TO_LOGICAL_PIXEL * density;
    const filledFrame = shape
      ? {
          left: shape.fillBounds.left * density,
          top: shape.fillBounds.top * density,
          right: shape.fillBounds.right * density,
          bottom: shape.fillBounds.bottom * density,
        }
      : frame;
    const shapeStroke = shape && line ? getPictureShapeStrokeBounds(shape, line) : undefined;
    let front = shape
      ? integerPictureEffectBounds(
          shapeStroke
            ? unionPictureEffectBounds(filledFrame, {
                left: shapeStroke.left * density - 1,
                top: shapeStroke.top * density - 1,
                right: shapeStroke.right * density + 1,
                bottom: shapeStroke.bottom * density + 1,
              })
            : filledFrame,
        )
      : lineWidth > 0
        ? integerPictureEffectBounds(
            unionPictureEffectBounds(frame, {
              left: -lineWidth / 2 - 1,
              top: -lineWidth / 2 - 1,
              right: frameWidth + lineWidth / 2 + 1,
              bottom: frameHeight + lineWidth / 2 + 1,
            }),
          )
        : frame;
    if (lineDecorations && line && line.widthPt > 0 && line.paint.opacity > 0) {
      const decorationStroke = getPictureShapeStrokeBounds(lineDecorations, line);
      const extent = decorationStroke
        ? unionPictureEffectBounds(lineDecorations.fillBounds, decorationStroke)
        : lineDecorations.fillBounds;
      front = integerPictureEffectBounds(
        unionPictureEffectBounds(front, {
          left: extent.left * density - 1,
          top: extent.top * density - 1,
          right: extent.right * density + 1,
          bottom: extent.bottom * density + 1,
        }),
      );
    }
    if (options.frontPaintBounds)
      front = integerPictureEffectBounds(
        unionPictureEffectBounds(front, {
          left: options.frontPaintBounds.left * density,
          top: options.frontPaintBounds.top * density,
          right: options.frontPaintBounds.right * density,
          bottom: options.frontPaintBounds.bottom * density,
        }),
      );
    let body = front;
    if (isProjected) {
      const resolver =
        typeof options.projectedBounds === "function" ? options.projectedBounds : undefined;
      const pureBounds = resolver
        ? resolver(density, { ...front }, { width: frameWidth, height: frameHeight })
        : (options.projectedBounds as PictureEffectBounds);
      assertPictureEffectBounds(pureBounds);
      body = integerPictureEffectBounds(
        resolver
          ? pureBounds
          : {
              left: pureBounds.left * density,
              top: pureBounds.top * density,
              right: pureBounds.right * density,
              bottom: pureBounds.bottom * density,
            },
      );
    }
    const bodyWidth = body.right - body.left,
      bodyHeight = body.bottom - body.top;
    const localBody = { left: 0, top: 0, right: bodyWidth, bottom: bodyHeight };
    const painted: PictureEffectBounds[] = [body];
    const scratch: PictureEffectBounds[] = [front, body];
    const addEffect = (bounds: PictureEffectBounds | null) => {
      if (!bounds) return;
      const global = {
        left: bounds.left + body.left,
        top: bounds.top + body.top,
        right: bounds.right + body.left,
        bottom: bounds.bottom + body.top,
      };
      painted.push(global);
      scratch.push(integerPictureEffectBounds(bounds));
    };
    if (shadow && shadow.opacity > 0) {
      const geometry = shadowGeometry(
        shadow,
        density,
        frameWidth,
        frameHeight,
        body,
        isProjected || !!shape,
      );
      addEffect(getPictureShadowBounds(localBody, geometry));
      if (shadow.kind === "inner")
        scratch.push(expandPictureEffectBounds(localBody, Math.ceil(geometry.blurRadiusPx)));
    }
    if (glow && glow.opacity > 0 && glow.sizePt > 0)
      addEffect(
        expandPictureEffectBounds(
          localBody,
          Math.ceil(glow.sizePt * PICTURE_POINT_TO_LOGICAL_PIXEL * density),
        ),
      );
    if (reflection && reflection.opacity > 0 && reflection.size > 0)
      addEffect(
        getPictureReflectionBounds(
          localBody,
          reflection.size,
          reflection.distancePt * PICTURE_POINT_TO_LOGICAL_PIXEL * density,
          reflection.blurPt * PICTURE_POINT_TO_LOGICAL_PIXEL * density,
        ),
      );
    const output = integerPictureEffectBounds(unionPictureEffectBounds(...painted));
    scratch.push(output);
    let maxSide = 1,
      maxPixels = 1;
    for (const bounds of scratch) {
      const width = Math.ceil(bounds.right) - Math.floor(bounds.left),
        height = Math.ceil(bounds.bottom) - Math.floor(bounds.top);
      maxSide = Math.max(maxSide, width, height);
      maxPixels = Math.max(maxPixels, width * height);
    }
    // Check path expansion before any Canvas, reads or raster loops. The same
    // centerline phase drives every compound band; no four independently phased sides.
    const intervalCount =
      shape && line
        ? getPictureShapeOutlineIntervalCount(shape, line, density)
        : (lineWidth > 0 && line
            ? getPictureLineDashIntervals(2 * (frameWidth + frameHeight), lineWidth, line.dash)
            : []
          ).length;
    // Immutable preparation plus up to three compound offset/length work sets.
    const pathBytes = shape
      ? (shape.pointCount + (lineDecorations?.pointCount ?? 0)) * 256 +
        (shape.commandCount + (lineDecorations?.commandCount ?? 0)) * 256
      : 0;
    // The union alpha's Canvas/readback/Float32 buffers and source group stay
    // within the aggregate estimate, including line and subsequent effect scratch.
    const bytesPerPixel = shape ? 80 : 64;
    const estimatedPeakBytes = Math.ceil(
      maxPixels * bytesPerPixel + intervalCount * 256 + pathBytes + 4096,
    );
    const ratio = Math.min(
      1,
      limits.side / maxSide,
      Math.sqrt(limits.pixels / maxPixels),
      Math.sqrt(
        Math.max(0, limits.memoryBytes - intervalCount * 256 - pathBytes - 4096) /
          (maxPixels * bytesPerPixel),
      ),
    );
    if (ratio < 1) {
      density *= ratio * 0.99;
      continue;
    }
    const base: PictureDetailedRasterPlanBase = {
      widthPx: options.widthPx,
      heightPx: options.heightPx,
      actualDensity: density,
      outerAngleDeg: options.outerAngleDeg ?? 0,
      style,
      logicalBounds: {
        left: output.left / density,
        top: output.top / density,
        right: output.right / density,
        bottom: output.bottom / density,
      },
      bodyBoundsRaster: body,
      frontBoundsRaster: front,
      outputBoundsRaster: output,
      widthRaster: output.right - output.left,
      heightRaster: output.bottom - output.top,
      bodyWidthRaster: bodyWidth,
      bodyHeightRaster: bodyHeight,
      frontWidthRaster: front.right - front.left,
      frontHeightRaster: front.bottom - front.top,
      isProjected,
      shape,
      lineDecorations,
      estimatedPeakBytes,
      assetIds,
    };
    return missingAssetIds.length
      ? { ...base, kind: "unavailable", reason: "asset-unavailable", missingAssetIds }
      : { ...base, kind: "ready" };
  }
  throw new RangeError("Picture raster cannot satisfy the minimum rounded resource budget.");
}

function imageSize(image: DecodedPicturePaintImage): PicturePaintAssetSize {
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  return { width, height };
}
type CanvasMaker = (width: number, height: number) => HTMLCanvasElement;
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Detailed picture Canvas processing is unavailable.");
  return context;
}
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
function readCanvas(canvas: HTMLCanvasElement): PictureRgbaSurface {
  return {
    width: canvas.width,
    height: canvas.height,
    data: context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data,
  };
}
function sourceOverInto(
  destination: PictureRgbaSurface,
  source: PictureRgbaSurface,
  left: number,
  top: number,
): void {
  const x0 = Math.max(0, left),
    y0 = Math.max(0, top);
  const x1 = Math.min(destination.width, left + source.width),
    y1 = Math.min(destination.height, top + source.height);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const input = ((y - top) * source.width + x - left) * 4,
        output = (y * destination.width + x) * 4;
      const sa = source.data[input + 3]! / 255;
      if (sa === 0) continue;
      const da = destination.data[output + 3]! / 255,
        alpha = sa + da * (1 - sa);
      for (let channel = 0; channel < 3; channel++)
        destination.data[output + channel] =
          (source.data[input + channel]! * sa +
            destination.data[output + channel]! * da * (1 - sa)) /
          alpha;
      destination.data[output + 3] = alpha * 255;
    }
}
function paintAffine(
  plan: PictureDetailedRasterReadyPlan,
  paint: PicturePaint,
): PictureEffectAffine {
  const body = plan.frontBoundsRaster;
  if (paint.kind === "solid" || paint.rotateWithShape || plan.outerAngleDeg === 0)
    return { a: 1, b: 0, c: 0, d: 1, e: body.left, f: body.top };
  const radians = (-plan.outerAngleDeg * Math.PI) / 180;
  const a = Math.cos(radians),
    b = Math.sin(radians),
    c = -b,
    d = a;
  const cx = (plan.widthPx * plan.actualDensity) / 2,
    cy = (plan.heightPx * plan.actualDensity) / 2;
  return {
    a,
    b,
    c,
    d,
    e: a * body.left + c * body.top + cx - a * cx - c * cy,
    f: b * body.left + d * body.top + cy - b * cx - d * cy,
  };
}
type CompiledPaint = (surface: PictureRgbaSurface, affine: PictureEffectAffine) => void;
function compilePaint(
  paint: PicturePaint,
  theme: WorkbookTheme,
  plan: PictureDetailedRasterReadyPlan,
  images: ReadonlyMap<string, DecodedPicturePaintImage>,
  makeCanvas: CanvasMaker,
  limits: ReturnType<typeof checkedLimits>,
): CompiledPaint {
  const width = plan.widthPx * plan.actualDensity,
    height = plan.heightPx * plan.actualDensity;
  if (paint.kind === "solid") {
    const color = resolvePictureColor(paint.color, theme),
      alpha = Math.round(paint.opacity * 255);
    return (surface) => {
      if (alpha === 0) return;
      for (let index = 0; index < surface.data.length; index += 4) {
        surface.data[index] = color[0];
        surface.data[index + 1] = color[1];
        surface.data[index + 2] = color[2];
        surface.data[index + 3] = alpha;
      }
    };
  }
  if (paint.kind === "pattern") {
    const foreground = resolvePictureColor(paint.foreground, theme),
      background = resolvePictureColor(paint.background, theme);
    const sampler = createPicturePatternSampler(paint.preset, {
      scale: plan.actualDensity,
      antialias: true,
      seed: 0x53434654,
    });
    return (surface, affine) => {
      const alpha = Math.round(paint.opacity * 255);
      if (alpha === 0) return;
      for (let y = 0; y < surface.height; y++)
        for (let x = 0; x < surface.width; x++) {
          const px = affine.a * (x + 0.5) + affine.c * (y + 0.5) + affine.e;
          const py = affine.b * (x + 0.5) + affine.d * (y + 0.5) + affine.f;
          const coverage = sampler.sample(Math.floor(px), Math.floor(py)),
            index = (y * surface.width + x) * 4;
          for (let channel = 0; channel < 3; channel++)
            surface.data[index + channel] =
              foreground[channel]! * coverage + background[channel]! * (1 - coverage);
          surface.data[index + 3] = alpha;
        }
    };
  }
  if (paint.kind === "picture") {
    const image = images.get(paint.assetId);
    if (!image) throw new PicturePaintAssetReadError(paint.assetId);
    const intrinsic = imageSize(image);
    return (surface, affine) => {
      // One bounded texture read, then inverse sampling. Loop count is output
      // pixels, never the potentially enormous number of tiny repeat tiles.
      const texturePixels = Math.min(limits.pixels, plan.widthRaster * plan.heightRaster);
      const readScale = Math.min(
        1,
        limits.side / intrinsic.width,
        limits.side / intrinsic.height,
        Math.sqrt(texturePixels / (intrinsic.width * intrinsic.height)),
      );
      let textureWidth = Math.max(1, Math.floor(intrinsic.width * readScale));
      let textureHeight = Math.max(1, Math.floor(intrinsic.height * readScale));
      // A one-pixel minor axis must not defeat the pixel bound for long textures.
      if (textureWidth * textureHeight > texturePixels) {
        if (textureWidth >= textureHeight)
          textureWidth = Math.max(1, Math.floor(texturePixels / textureHeight));
        else textureHeight = Math.max(1, Math.floor(texturePixels / textureWidth));
      }
      const canvas = makeCanvas(textureWidth, textureHeight);
      let texture: PictureRgbaSurface;
      try {
        context2d(canvas).drawImage(image, 0, 0, textureWidth, textureHeight);
        texture = readCanvas(canvas);
      } catch (error) {
        throw new PicturePaintAssetReadError(paint.assetId, { cause: error });
      } finally {
        releaseCanvas(canvas);
      }
      const layout = paint.layout;
      let originX: number, originY: number, imageWidth: number, imageHeight: number;
      let collapseX = false,
        collapseY = false;
      if (layout.kind === "stretch") {
        originX = layout.offsetXRatio * width;
        originY = layout.offsetYRatio * height;
        imageWidth = layout.widthRatio * width;
        imageHeight = layout.heightRatio * height;
      } else {
        const anchor = anchorPosition(layout.anchor);
        imageWidth = intrinsic.width * layout.scaleX * plan.actualDensity;
        imageHeight = intrinsic.height * layout.scaleY * plan.actualDensity;
        originX =
          (width - imageWidth) * anchor[0] +
          layout.offsetXPt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity;
        originY =
          (height - imageHeight) * anchor[1] +
          layout.offsetYPt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity;
        // Many complete periods inside one output pixel need a prefilter, not
        // infinite tile indices or an enormous tile loop. Axis means preserve
        // premultiplied transparency and the uncollapsed axis's texture detail.
        collapseX = imageWidth < 0.25;
        collapseY = imageHeight < 0.25;
        if (collapseX || collapseY) texture = averageTextureAxes(texture, collapseX, collapseY);
      }
      for (let y = 0; y < surface.height; y++)
        for (let x = 0; x < surface.width; x++) {
          const px = affine.a * (x + 0.5) + affine.c * (y + 0.5) + affine.e;
          const py = affine.b * (x + 0.5) + affine.d * (y + 0.5) + affine.f;
          let tx = collapseX ? 0.5 : (px - originX) / imageWidth;
          let ty = collapseY ? 0.5 : (py - originY) / imageHeight;
          let repeatX = false,
            repeatY = false;
          if (layout.kind === "stretch") {
            if (tx < 0 || tx >= 1 || ty < 0 || ty >= 1) continue;
          } else {
            const tileX = Math.floor(tx),
              tileY = Math.floor(ty);
            tx -= tileX;
            ty -= tileY;
            const mirrorX = layout.flip === "x" || layout.flip === "xy";
            const mirrorY = layout.flip === "y" || layout.flip === "xy";
            if (mirrorX && Math.abs(tileX % 2) === 1) tx = 1 - tx;
            if (mirrorY && Math.abs(tileY % 2) === 1) ty = 1 - ty;
            repeatX = !mirrorX;
            repeatY = !mirrorY;
          }
          sampleTextureInto(
            texture,
            tx * texture.width - 0.5,
            ty * texture.height - 0.5,
            repeatX,
            repeatY,
            surface.data,
            (y * surface.width + x) * 4,
            paint.opacity,
          );
        }
    };
  }
  const stops = resolvePicturePaintStops(paint.stops, theme);
  const angle = paint.kind === "linear" ? (paint.angleDeg * Math.PI) / 180 : 0;
  const dx = Math.cos(angle),
    dy = Math.sin(angle),
    extent = Math.abs(width * dx) + Math.abs(height * dy);
  return (surface, affine) => {
    for (let y = 0; y < surface.height; y++)
      for (let x = 0; x < surface.width; x++) {
        const px = affine.a * (x + 0.5) + affine.c * (y + 0.5) + affine.e;
        const py = affine.b * (x + 0.5) + affine.d * (y + 0.5) + affine.f;
        let position: number;
        if (paint.kind === "linear")
          position = 0.5 + ((px - width / 2) * dx + (py - height / 2) * dy) / extent;
        else {
          const nx = (px / width - paint.centerX) / paint.radiusX,
            ny = (py / height - paint.centerY) / paint.radiusY;
          position =
            paint.kind === "radial" ? Math.hypot(nx, ny) : Math.max(Math.abs(nx), Math.abs(ny));
        }
        const t = Math.max(0, Math.min(1, position));
        let next = 0;
        while (next < stops.length && stops[next]!.offset <= t) next++;
        const first = stops[Math.max(0, next - 1)]!,
          last = stops[Math.min(stops.length - 1, next)]!;
        const mix =
          first === last || last.offset === first.offset
            ? 0
            : (t - first.offset) / (last.offset - first.offset);
        const stopAlpha = first.opacity * (1 - mix) + last.opacity * mix;
        const index = (y * surface.width + x) * 4;
        surface.data[index + 3] = stopAlpha * paint.opacity * 255;
        if (surface.data[index + 3] === 0) continue;
        for (let channel = 0; channel < 3; channel++)
          surface.data[index + channel] =
            (first.color[channel]! * first.opacity * (1 - mix) +
              last.color[channel]! * last.opacity * mix) /
            stopAlpha;
      }
  };
}
/** DrawingML path modifiers apply to every paint kind while retaining its alpha/holes. */
function paintDrawingShapeFill(
  paint: PicturePaint,
  compiled: CompiledPaint,
  plan: PictureDetailedRasterReadyPlan,
  makeCanvas: CanvasMaker,
): PictureRgbaSurface {
  const shape = plan.shape!;
  const output = createPictureRgbaSurface(plan.frontWidthRaster, plan.frontHeightRaster);
  const painted = paintRaster(paint, compiled, plan, false);
  for (let pathIndex = 0; pathIndex < shape.geometry.paths.length; pathIndex++) {
    const path = shape.geometry.paths[pathIndex]!;
    if (!path.filled || path.fillMode === "none") continue;
    const mask = createPictureShapeAlphaMask({
      shape,
      density: plan.actualDensity,
      boundsRaster: plan.frontBoundsRaster,
      pathIndex,
      canvasFactory: () => makeCanvas(plan.frontWidthRaster, plan.frontHeightRaster),
    });
    const mode = path.fillMode ?? "norm";
    const brightness =
      mode === "lighten"
        ? 0.4
        : mode === "lightenLess"
          ? 0.2
          : mode === "darken"
            ? -0.4
            : mode === "darkenLess"
              ? -0.2
              : 0;
    // Reuse one layer at a time; the estimate includes masks/readback/three RGBA surfaces.
    const layer = createPictureRgbaSurface(painted.width, painted.height);
    for (let pixel = 0; pixel < mask.data.length; pixel++) {
      const index = pixel * 4;
      layer.data[index + 3] = painted.data[index + 3]! * mask.data[pixel]!;
      if (layer.data[index + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const color = painted.data[index + channel]!;
        layer.data[index + channel] =
          brightness < 0 ? color * (1 + brightness) : color + (255 - color) * brightness;
      }
    }
    sourceOverInto(output, layer, 0, 0);
  }
  return output;
}

function sampleTextureInto(
  texture: PictureRgbaSurface,
  x: number,
  y: number,
  repeatX: boolean,
  repeatY: boolean,
  output: Uint8ClampedArray,
  index: number,
  opacity: number,
): void {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    tx = x - x0,
    ty = y - y0;
  let alpha = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      let sx = x0 + dx,
        sy = y0 + dy;
      sx = repeatX
        ? ((sx % texture.width) + texture.width) % texture.width
        : Math.max(0, Math.min(texture.width - 1, sx));
      sy = repeatY
        ? ((sy % texture.height) + texture.height) % texture.height
        : Math.max(0, Math.min(texture.height - 1, sy));
      const input = (sy * texture.width + sx) * 4;
      const weight =
        ((dx === 0 ? 1 - tx : tx) * (dy === 0 ? 1 - ty : ty) * texture.data[input + 3]!) / 255;
      alpha += weight;
      red += texture.data[input]! * weight;
      green += texture.data[input + 1]! * weight;
      blue += texture.data[input + 2]! * weight;
    }
  output[index + 3] = alpha * opacity * 255;
  if (output[index + 3] === 0 || alpha === 0) return;
  output[index] = red / alpha;
  output[index + 1] = green / alpha;
  output[index + 2] = blue / alpha;
}
function averageTextureAxes(
  texture: PictureRgbaSurface,
  collapseX: boolean,
  collapseY: boolean,
): PictureRgbaSurface {
  const width = collapseX ? 1 : texture.width,
    height = collapseY ? 1 : texture.height;
  const output = createPictureRgbaSurface(width, height);
  const sampleWidth = collapseX ? texture.width : 1,
    sampleHeight = collapseY ? texture.height : 1;
  const count = sampleWidth * sampleHeight;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let alpha = 0,
        red = 0,
        green = 0,
        blue = 0;
      for (let sy = 0; sy < sampleHeight; sy++)
        for (let sx = 0; sx < sampleWidth; sx++) {
          const input = ((collapseY ? sy : y) * texture.width + (collapseX ? sx : x)) * 4;
          const a = texture.data[input + 3]! / 255;
          alpha += a;
          red += texture.data[input]! * a;
          green += texture.data[input + 1]! * a;
          blue += texture.data[input + 2]! * a;
        }
      const index = (y * width + x) * 4;
      output.data[index + 3] = (alpha / count) * 255;
      if (alpha > 0 && output.data[index + 3]! > 0) {
        output.data[index] = red / alpha;
        output.data[index + 1] = green / alpha;
        output.data[index + 2] = blue / alpha;
      }
    }
  return output;
}
function paintRaster(
  paint: PicturePaint,
  compiled: CompiledPaint,
  plan: PictureDetailedRasterReadyPlan,
  clipFrame: boolean,
): PictureRgbaSurface {
  const surface = createPictureRgbaSurface(plan.frontWidthRaster, plan.frontHeightRaster);
  compiled(surface, paintAffine(plan, paint));
  if (clipFrame) {
    const body = plan.frontBoundsRaster,
      width = plan.widthPx * plan.actualDensity,
      height = plan.heightPx * plan.actualDensity;
    for (let y = 0; y < surface.height; y++)
      for (let x = 0; x < surface.width; x++) {
        const px = body.left + x,
          py = body.top + y;
        const coverage =
          Math.max(0, Math.min(px + 1, width) - Math.max(px, 0)) *
          Math.max(0, Math.min(py + 1, height) - Math.max(py, 0));
        const index = (y * surface.width + x) * 4;
        surface.data[index + 3] = surface.data[index + 3]! * coverage;
        if (surface.data[index + 3] === 0) surface.data.fill(0, index, index + 3);
      }
  }
  return surface;
}

/** A band's own offset path follows the shared frame-centerline parameter.
 * Inner paths collapse safely for widths larger than the frame; no inverted rectangles. */
function pointOnBand(
  position: number,
  width: number,
  height: number,
  offset: number,
): readonly [number, number] {
  const perimeter = 2 * (width + height);
  const t = ((position % perimeter) + perimeter) % perimeter;
  const insetOffset = Math.max(offset, -Math.min(width, height) / 2);
  const left = -insetOffset,
    top = -insetOffset,
    w = width + 2 * insetOffset,
    h = height + 2 * insetOffset;
  if (t <= width) return [left + (t / width) * w, top];
  if (t <= width + height) return [left + w, top + ((t - width) / height) * h];
  if (t <= 2 * width + height) return [left + w - ((t - width - height) / width) * w, top + h];
  return [left, top + h - ((t - 2 * width - height) / height) * h];
}
function traceBandInterval(
  context: CanvasRenderingContext2D,
  start: number,
  end: number,
  width: number,
  height: number,
  offset: number,
): void {
  const perimeter = 2 * (width + height),
    first = pointOnBand(start, width, height, offset);
  context.beginPath();
  context.moveTo(first[0], first[1]);
  // At most two circuits: the second exists only when joining the closing seam.
  const cycleStart = Math.floor(start / perimeter),
    cycleEnd = Math.floor(end / perimeter);
  for (let cycle = cycleStart; cycle <= cycleEnd; cycle++) {
    for (const corner of [width, width + height, 2 * width + height, perimeter]) {
      const position = cycle * perimeter + corner;
      if (position <= start || position >= end) continue;
      const point = pointOnBand(position, width, height, offset);
      context.lineTo(point[0], point[1]);
    }
  }
  const last = pointOnBand(end, width, height, offset);
  context.lineTo(last[0], last[1]);
  context.stroke();
}
function lineMask(
  line: PictureLine,
  plan: PictureDetailedRasterReadyPlan,
  makeCanvas: CanvasMaker,
): PictureRgbaSurface {
  const canvas = makeCanvas(plan.frontWidthRaster, plan.frontHeightRaster);
  try {
    const context = context2d(canvas),
      body = plan.frontBoundsRaster;
    if (plan.shape) {
      context.translate(-body.left, -body.top);
      strokePictureShapeOutline(context, plan.shape, line, plan.actualDensity);
      if (plan.lineDecorations) {
        context.save();
        context.scale(plan.actualDensity, plan.actualDensity);
        paintPictureShapeFillMask(context, plan.lineDecorations);
        context.restore();
        // Marker outlines are continuous, independent of the centerline's dash phase.
        strokePictureShapeOutline(
          context,
          plan.lineDecorations,
          { ...line, dash: "solid", compound: "single" },
          plan.actualDensity,
        );
      }
      return readCanvas(canvas);
    }
    const width = plan.widthPx * plan.actualDensity,
      height = plan.heightPx * plan.actualDensity;
    const totalWidth = line.widthPt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity,
      perimeter = 2 * (width + height);
    const intervals = getPictureLineDashIntervals(perimeter, totalWidth, line.dash);
    context.translate(-body.left, -body.top);
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineCap = line.cap;
    context.lineJoin = line.join;
    context.miterLimit = line.miterLimit;
    for (const [inner, outer] of getPictureLineCompoundBands(line.compound)) {
      context.lineWidth = (outer - inner) * totalWidth;
      const offset = ((inner + outer) / 2) * totalWidth;
      if (line.dash === "solid") {
        context.beginPath();
        const first = pointOnBand(0, width, height, offset);
        context.moveTo(first[0], first[1]);
        for (const t of [width, width + height, 2 * width + height]) {
          const point = pointOnBand(t, width, height, offset);
          context.lineTo(point[0], point[1]);
        }
        context.closePath();
        context.stroke();
        continue;
      }
      const first = intervals[0],
        last = intervals[intervals.length - 1];
      const closesSeam =
        line.dash !== "round-dot" &&
        first &&
        last &&
        first !== last &&
        first.start <= 0 &&
        last.end >= perimeter;
      if (closesSeam)
        traceBandInterval(context, last.start, perimeter + first.end, width, height, offset);
      for (let index = 0; index < intervals.length; index++) {
        if (closesSeam && (index === 0 || index === intervals.length - 1)) continue;
        const interval: PictureDashInterval = intervals[index]!;
        if (interval.dot === "round") {
          if (interval.start < 0 || interval.start >= perimeter) continue;
          const point = pointOnBand(interval.start, width, height, offset);
          context.beginPath();
          context.arc(point[0], point[1], context.lineWidth / 2, 0, 2 * Math.PI);
          context.fill();
        } else {
          const start = Math.max(0, interval.start),
            end = Math.min(perimeter, interval.end);
          if (end > start) traceBandInterval(context, start, end, width, height, offset);
        }
      }
    }
    return readCanvas(canvas);
  } finally {
    releaseCanvas(canvas);
  }
}
function drawSource(
  plan: PictureDetailedRasterReadyPlan,
  painter: PictureDetailedRasterOptions["sourcePainter"],
  makeCanvas: CanvasMaker,
): PictureRgbaSurface {
  if (plan.shape) {
    const canvas = makeCanvas(plan.frontWidthRaster, plan.frontHeightRaster);
    try {
      const context = context2d(canvas);
      context.save();
      context.translate(-plan.frontBoundsRaster.left, -plan.frontBoundsRaster.top);
      context.scale(plan.actualDensity, plan.actualDensity);
      painter(context);
      context.restore();
      return readCanvas(canvas);
    } finally {
      releaseCanvas(canvas);
    }
  }
  const canvas = makeCanvas(
    Math.max(1, Math.ceil(plan.widthPx * plan.actualDensity)),
    Math.max(1, Math.ceil(plan.heightPx * plan.actualDensity)),
  );
  try {
    const context = context2d(canvas);
    context.save();
    context.scale(plan.actualDensity, plan.actualDensity);
    context.beginPath();
    context.rect(0, 0, plan.widthPx, plan.heightPx);
    context.clip();
    painter(context);
    context.restore();
    return readCanvas(canvas);
  } finally {
    releaseCanvas(canvas);
  }
}
function applyInnerShadow(body: PictureRgbaSurface, shadow: PictureRgbaSurface): void {
  // A color wash inside the existing alpha, not a second layer making translucent PNGs opaque.
  for (let index = 0; index < body.data.length; index += 4) {
    const alpha = body.data[index + 3]!;
    if (alpha === 0) continue;
    const strength = Math.min(1, shadow.data[index + 3]! / alpha);
    for (let channel = 0; channel < 3; channel++)
      body.data[index + channel] =
        body.data[index + channel]! * (1 - strength) + shadow.data[index + channel]! * strength;
  }
}
function finishFront(
  body: PictureRgbaSurface,
  plan: PictureDetailedRasterReadyPlan,
  painter: NonNullable<PictureDetailedRasterOptions["finishFrontPainter"]>,
  makeCanvas: CanvasMaker,
): PictureRgbaSurface {
  const canvas = makeCanvas(body.width, body.height);
  try {
    const context = context2d(canvas),
      pixels = context.createImageData(body.width, body.height);
    pixels.data.set(body.data);
    context.putImageData(pixels, 0, 0);
    context.save();
    context.translate(-plan.frontBoundsRaster.left, -plan.frontBoundsRaster.top);
    context.scale(plan.actualDensity, plan.actualDensity);
    painter(context);
    context.restore();
    return readCanvas(canvas);
  } finally {
    releaseCanvas(canvas);
  }
}
function projectFront(
  body: PictureRgbaSurface,
  plan: PictureDetailedRasterReadyPlan,
  projector: PictureDetailedSurfaceProjector,
): PictureRgbaSurface {
  const projected = projector(
    { surface: body, left: plan.frontBoundsRaster.left, top: plan.frontBoundsRaster.top },
    plan.actualDensity,
    { widthPx: plan.widthPx * plan.actualDensity, heightPx: plan.heightPx * plan.actualDensity },
  );
  const surface = projected.surface,
    bounds = plan.bodyBoundsRaster;
  if (
    !Number.isSafeInteger(surface.width) ||
    !Number.isSafeInteger(surface.height) ||
    surface.width < 1 ||
    surface.height < 1 ||
    surface.width > 4096 ||
    surface.height > 4096 ||
    surface.width * surface.height > 4_000_000 ||
    !(surface.data instanceof Uint8ClampedArray) ||
    surface.data.length !== surface.width * surface.height * 4 ||
    !Number.isSafeInteger(projected.left) ||
    !Number.isSafeInteger(projected.top) ||
    projected.left < bounds.left ||
    projected.top < bounds.top ||
    projected.left + surface.width > bounds.right ||
    projected.top + surface.height > bounds.bottom
  )
    throw new RangeError("Projected picture raster exceeds its pure preflight bounds/budget.");
  if (
    projected.left === bounds.left &&
    projected.top === bounds.top &&
    surface.width === plan.bodyWidthRaster &&
    surface.height === plan.bodyHeightRaster
  )
    return surface;
  const padded = createPictureRgbaSurface(plan.bodyWidthRaster, plan.bodyHeightRaster);
  sourceOverInto(padded, surface, projected.left - bounds.left, projected.top - bounds.top);
  return padded;
}

/** Bounded shared Canvas adapter for worksheet/print/export. Whole-picture
 * opacity is deliberately absent: apply it exactly once when drawing this final canvas.
 * No CSS shadow/filter stands in for a detailed effect, and no asset/source is owned or released here. */
export function createDetailedPictureRaster(
  options: PictureDetailedRasterOptions,
): PictureDetailedRaster {
  const images = new Map<string, DecodedPicturePaintImage>();
  const plan = planDetailedPictureRaster({
    ...options,
    getAssetSize: (id) => {
      const image = options.getAssetImage?.(id);
      if (!image) return undefined;
      const size = imageSize(image);
      if (size.width <= 0 || size.height <= 0) return undefined;
      images.set(id, image);
      return size;
    },
  });
  if (plan.kind === "unavailable") return plan;
  const limits = checkedLimits(options.limits),
    canvases = new Set<HTMLCanvasElement>();
  let returnedCanvas: HTMLCanvasElement | undefined;
  const makeCanvas: CanvasMaker = (width, height) => {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > limits.side ||
      height > limits.side ||
      width * height > limits.pixels
    )
      throw new RangeError("Picture Canvas allocation exceeds the preflight budget.");
    const canvas = options.canvasFactory
      ? options.canvasFactory()
      : document.createElement("canvas");
    if (canvases.has(canvas) || [...images.values()].includes(canvas))
      throw new TypeError("Picture canvas factory must return a fresh, unowned Canvas.");
    canvases.add(canvas);
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  try {
    const style = plan.style,
      fill = value(style?.fill),
      line = value(style?.line);
    // Resolve colors/pattern contracts before the first Canvas allocation.
    const fillPainter = fill
      ? compilePaint(fill, options.theme, plan, images, makeCanvas, limits)
      : undefined;
    const linePainter = line
      ? compilePaint(line.paint, options.theme, plan, images, makeCanvas, limits)
      : undefined;
    const shadow = value(style?.shadow),
      glow = value(style?.glow),
      reflection = value(style?.reflection),
      softEdges = value(style?.softEdges);
    const shadowColor = shadow ? resolvePictureColor(shadow.color, options.theme) : undefined;
    const glowColor = glow ? resolvePictureColor(glow.color, options.theme) : undefined;
    let body =
      fill && fillPainter
        ? plan.shape?.drawingSource
          ? paintDrawingShapeFill(fill, fillPainter, plan, makeCanvas)
          : paintRaster(fill, fillPainter, plan, !plan.shape)
        : createPictureRgbaSurface(plan.frontWidthRaster, plan.frontHeightRaster);
    const source = drawSource(plan, options.sourcePainter, makeCanvas);
    sourceOverInto(
      body,
      source,
      plan.shape ? 0 : -plan.frontBoundsRaster.left,
      plan.shape ? 0 : -plan.frontBoundsRaster.top,
    );
    if (plan.shape && !plan.shape.drawingSource) {
      const shapeMask = createPictureShapeAlphaMask({
        shape: plan.shape,
        density: plan.actualDensity,
        boundsRaster: plan.frontBoundsRaster,
        canvasFactory: () => makeCanvas(plan.frontWidthRaster, plan.frontHeightRaster),
      });
      applyPictureShapeAlphaMask(body, shapeMask);
    }
    if (line && linePainter && line.widthPt > 0 && line.paint.opacity > 0) {
      const mask = lineMask(line, plan, makeCanvas),
        outline = paintRaster(line.paint, linePainter, plan, false);
      for (let index = 0; index < outline.data.length; index += 4) {
        outline.data[index + 3] = (outline.data[index + 3]! * mask.data[index + 3]!) / 255;
        if (outline.data[index + 3] === 0) outline.data.fill(0, index, index + 3);
      }
      sourceOverInto(body, outline, 0, 0);
    }
    if (options.finishFrontPainter)
      body = finishFront(body, plan, options.finishFrontPainter, makeCanvas);
    if (softEdges && softEdges.sizePt > 0)
      body = softenPictureEdges(
        body,
        softEdges.sizePt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity,
      );
    if (options.projectSurface) body = projectFront(body, plan, options.projectSurface);
    const mask = pictureAlphaMaskFromSurface(body);
    const geometry = shadow
      ? shadowGeometry(
          shadow,
          plan.actualDensity,
          plan.widthPx * plan.actualDensity,
          plan.heightPx * plan.actualDensity,
          plan.bodyBoundsRaster,
          plan.isProjected || !!plan.shape,
        )
      : undefined;
    if (shadow?.kind === "inner" && shadow.opacity > 0 && shadowColor && geometry) {
      const inner = createPictureShadowLayer(mask, {
        ...geometry,
        color: shadowColor,
        opacity: shadow.opacity,
      });
      if (inner) applyInnerShadow(body, inner.surface);
    }
    const output = createPictureRgbaSurface(plan.widthRaster, plan.heightRaster);
    const left = plan.bodyBoundsRaster.left - plan.outputBoundsRaster.left,
      top = plan.bodyBoundsRaster.top - plan.outputBoundsRaster.top;
    const addLayer = (layer: PictureRasterLayer | null) => {
      if (layer) sourceOverInto(output, layer.surface, left + layer.left, top + layer.top);
    };
    if (shadow && shadow.opacity > 0 && shadow.kind !== "inner" && shadowColor && geometry)
      addLayer(
        createPictureShadowLayer(mask, {
          ...geometry,
          color: shadowColor,
          opacity: shadow.opacity,
        }),
      );
    if (glow && glow.opacity > 0 && glowColor)
      addLayer(
        createPictureGlowLayer(mask, {
          color: glowColor,
          opacity: glow.opacity,
          radiusPx: glow.sizePt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity,
        }),
      );
    if (reflection && reflection.opacity > 0 && reflection.size > 0)
      addLayer(
        createPictureReflectionLayer(body, {
          coverage: reflection.size,
          opacity: reflection.opacity,
          gapPx: reflection.distancePt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity,
          blurRadiusPx: reflection.blurPt * PICTURE_POINT_TO_LOGICAL_PIXEL * plan.actualDensity,
        }),
      );
    sourceOverInto(output, body, left, top);
    const canvas = makeCanvas(plan.widthRaster, plan.heightRaster),
      context = context2d(canvas);
    const pixels = context.createImageData(output.width, output.height);
    pixels.data.set(output.data);
    context.putImageData(pixels, 0, 0);
    returnedCanvas = canvas;
    return { ...plan, canvas };
  } catch (error) {
    if (error instanceof PicturePaintAssetReadError)
      return {
        ...plan,
        kind: "unavailable",
        reason: "asset-pixels-unavailable",
        missingAssetIds: [error.assetId],
      };
    throw error;
  } finally {
    for (const canvas of canvases) if (canvas !== returnedCanvas) releaseCanvas(canvas);
  }
}
