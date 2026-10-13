import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  FREE_SHAPE_PATH_WORK_BUDGET,
  type ShapePathCommand,
  type ShapePresetGeometry,
} from "@sheetcraft/core/shape-presets";
import {
  getShapeStyleAssetIds,
  normalizeShapeStyle,
  type ShapeDetailedStyle,
  type ShapeLine,
  type ShapePaint,
} from "@sheetcraft/core/shape-style";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  createDetailedPicturePaintSurface,
  createDetailedPictureRaster,
  planDetailedPictureRaster,
  PicturePaintAssetReadError,
  type DecodedPicturePaintImage,
  type PictureDetailedRasterPlan,
  type PictureDetailedRasterPlanOptions,
  type PictureDetailedRasterReadyPlan,
  type PictureDetailedRasterUnavailable,
  type PictureDetailedSurfaceProjector,
} from "../../shared/images/picture-detailed-compositor";
import {
  getPictureRasterProjection,
  type PicturePaintResources,
} from "../../shared/images/picture-detailed-render";
import type { PictureEffectBounds } from "../../shared/images/picture-effect-geometry";
import {
  createPictureRgbaSurface,
  softenPictureEdges,
  type PictureRgbaSurface,
} from "../../shared/images/picture-effect-raster";
import { createPictureProjectiveGeometry } from "../../shared/images/picture-projective-geometry";
import { projectPictureShapePoint } from "../../shared/images/picture-shape-extrusion";
import {
  SHAPE_GLYPH_CONTOUR_LIMITS,
  strokeShapeGlyphSilhouette,
  traceShapeGlyphSilhouette,
  type ShapeGlyphSilhouette,
} from "./shape-glyph-mask";
import {
  shapeTextCanvasFont,
  type ShapeTextLayoutResult,
  type ShapeTextRect,
  type ShapeTextRun,
} from "./shape-text-layout";

export const SHAPE_TEXT_PAINT_LIMITS = Object.freeze({
  side: 4096,
  pixels: 4_000_000,
  memoryBytes: 64 * 1024 * 1024,
  cacheBytes: 32 * 1024 * 1024,
  cacheEntries: 32,
  liveCanvasBytes: 64 * 1024 * 1024,
  runs: 100_000,
  textUnits: 100_000,
  /** Full-raster span scans, including clear/read/composition, are explicitly bounded. */
  rasterWork: 128_000_000,
});
export type ShapeTextPaintOptions = Readonly<{
  drawing: SheetGraphicDrawing;
  /** Ready numeric layout, measured with the exact ready font resources used by native Canvas. */
  layout: ShapeTextLayoutResult;
  density: number;
  resources?: PicturePaintResources;
  /** Preview override; absence inherits only drawing.shapeText.style. */
  style?: ShapeDetailedStyle;
  angleDeg?: number;
  /** Capture quantized native alpha loops for an explicitly owned projection consumer. */
  captureSilhouette?: boolean;
}>;
type ShapeTextPaintSource = Readonly<{
  runs: readonly Readonly<ShapeTextRun>[];
  clipRect: Readonly<ShapeTextRect> | null;
  overflow: boolean;
  underline: boolean;
  strike: boolean;
  effectiveStyle: ShapeDetailedStyle;
  /** Conservative visible glyph/decoration envelope, before glyph effects or body projection. */
  sourceBounds: PictureEffectBounds;
  /** Effects contain no fill/line/body categories. Native glyph paint is a separate source. */
  effectStyle: ShapeDetailedStyle;
  contourRequired: boolean;
  sourceScratchBytes: number;
  rasterMemoryBytes: number;
  requiresGlyphProjection: boolean;
  sourceNumericBytes: number;
}>;
export type ShapeTextPaintPlan = PictureDetailedRasterPlan & ShapeTextPaintSource;
export type ShapeTextPaintReady = PictureDetailedRasterReadyPlan &
  ShapeTextPaintSource &
  Readonly<{
    canvas: HTMLCanvasElement;
    /** Optional real native alpha contours in front-raster coordinates. Never a body rectangle. */
    silhouette?: ShapeGlyphSilhouette;
    /** Real transient painted glyph geometry used by text-own3D, never document geometry. */
    glyphGeometry?: ShapePresetGeometry;
    /** Quantized-alpha contour envelope error at the actual chosen raster density. */
    glyphContourErrorLogicalPx?: number;
    /** Caller owns this Canvas; disposing it cannot invalidate another caller/cache entry. */
    dispose: () => void;
  }>;
export type ShapeTextPaintRaster =
  | ShapeTextPaintReady
  | (PictureDetailedRasterUnavailable & ShapeTextPaintSource);
export type ShapeTextGlyphBudgetPreflight =
  | Readonly<{
      kind: "ready";
      /** This result proves glyph budgets; normal paint-resource availability stays separate. */
      proof: "numeric-source" | "native-alpha-outline" | "painted-alpha-projection";
      actualDensity: number;
      estimatedPeakBytes: number;
      contourCount: number;
      edgeCount: number;
      pointCount: number;
      glyphCommandCount: number;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: PictureDetailedRasterUnavailable["reason"];
      missingAssetIds: readonly string[];
    }>;

export class ShapeTextPaintPreflightError extends RangeError {
  readonly code = "shape-text-paint-preflight";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShapeTextPaintPreflightError";
  }
}

/** Only native alpha complexity can justify the bounded density-1 retry. */
class ShapeTextGlyphContourBudgetError extends ShapeTextPaintPreflightError {}

function traceGlyphSilhouette(surface: PictureRgbaSurface): ShapeGlyphSilhouette {
  try {
    return traceShapeGlyphSilhouette(surface, 1);
  } catch (error) {
    if (
      error instanceof RangeError &&
      [
        "Glyph alpha contour exceeds its boundary edge budget.",
        "Glyph alpha contour exceeds its component budget.",
        "Glyph alpha contour exceeds its simplified point budget.",
      ].includes(error.message)
    )
      throw new ShapeTextGlyphContourBudgetError(error.message, { cause: error });
    throw error;
  }
}

function bounds(rect: ShapeTextRect): PictureEffectBounds {
  return { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
}
function checkRect(rect: ShapeTextRect): void {
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0 ||
    Math.max(Math.abs(rect.x), Math.abs(rect.y), rect.width, rect.height) > 10_000_000
  )
    throw new ShapeTextPaintPreflightError(
      "Glyph layout bounds exceed their finite coordinate budget.",
    );
}
function union(a: PictureEffectBounds | undefined, b: PictureEffectBounds): PictureEffectBounds {
  if (!a) return { ...b };
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
function intersect(
  a: PictureEffectBounds,
  b: PictureEffectBounds,
): PictureEffectBounds | undefined {
  const result = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return result.right > result.left && result.bottom > result.top ? result : undefined;
}
function decoration(run: Readonly<ShapeTextRun>, kind: "underline" | "strike") {
  const thickness = Math.max(1, run.font.size / 16);
  const center =
    kind === "underline" ? Math.max(thickness, run.descentPx * 0.5) : -run.ascentPx * 0.35;
  return { x: 0, y: center - thickness / 2, width: run.advancePx, height: thickness };
}
function transformedDecoration(run: Readonly<ShapeTextRun>, rect: ShapeTextRect) {
  if (run.angle === 180)
    return {
      left: run.x - rect.x - rect.width,
      top: run.y - rect.y - rect.height,
      right: run.x - rect.x,
      bottom: run.y - rect.y,
    };
  if (run.angle === 90)
    return {
      left: run.x - rect.y - rect.height,
      top: run.y + rect.x,
      right: run.x - rect.y,
      bottom: run.y + rect.x + rect.width,
    };
  if (run.angle === 270)
    return {
      left: run.x + rect.y,
      top: run.y - rect.x - rect.width,
      right: run.x + rect.y + rect.height,
      bottom: run.y - rect.x,
    };
  return {
    left: run.x + rect.x,
    top: run.y + rect.y,
    right: run.x + rect.x + rect.width,
    bottom: run.y + rect.y + rect.height,
  };
}
/** Sparse text categories inherit the base drawing COLOR, never its body paint/effects. */
export function resolveShapeTextPaintStyle(
  drawing: SheetGraphicDrawing,
  style: ShapeDetailedStyle | undefined = drawing.shapeText?.style,
): ShapeDetailedStyle {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new TypeError("Shape text paint requires a shape or text box.");
  const result = { ...normalizeShapeStyle(style) };
  if (result.fill === undefined) {
    if (drawing.color.toLowerCase() === "transparent") result.fill = { kind: "none" };
    else {
      if (!/^#[\da-f]{6}$/i.test(drawing.color))
        throw new TypeError("Glyph source color requires RGB or transparent.");
      result.fill = {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: drawing.color }, opacity: 1 },
      };
    }
  }
  if (result.line === undefined) result.line = { kind: "none" };
  return normalizeShapeStyle(result)!;
}
function prepareSource(options: ShapeTextPaintOptions) {
  const style = resolveShapeTextPaintStyle(options.drawing, options.style);
  const requiresGlyphProjection =
    style.format3d?.kind === "value" || style.rotation3d?.kind === "value";
  const { layout } = options;
  if (!Array.isArray(layout.runs) || layout.runs.length > SHAPE_TEXT_PAINT_LIMITS.runs)
    throw new ShapeTextPaintPreflightError("Glyph layout exceeds its ordered run budget.");
  if (typeof layout.overflow !== "boolean" || (layout.overflow && layout.clipRect !== null))
    throw new TypeError("Glyph layout overflow and clip ownership conflict.");
  if (layout.clipRect) checkRect(layout.clipRect);
  let units = 0,
    source: PictureEffectBounds | undefined;
  const underline = options.drawing.shapeText?.underline === true,
    strike = options.drawing.shapeText?.strike === true;
  const runs = Object.freeze(
    layout.runs.map((run) => {
      units += typeof run.text === "string" ? run.text.length : Infinity;
      if (
        units > SHAPE_TEXT_PAINT_LIMITS.textUnits ||
        ![run.x, run.y, run.advancePx, run.inlineAdvancePx, run.ascentPx, run.descentPx].every(
          Number.isFinite,
        ) ||
        [run.advancePx, run.inlineAdvancePx, run.ascentPx, run.descentPx].some((n) => n < 0) ||
        ![0, 90, 180, 270].includes(run.angle) ||
        !["ltr", "rtl"].includes(run.direction) ||
        Math.max(Math.abs(run.x), Math.abs(run.y)) > 10_000_000 ||
        (run.underline !== undefined && typeof run.underline !== "boolean") ||
        (run.strike !== undefined && typeof run.strike !== "boolean") ||
        (run.color !== undefined && !/^(?:#[\da-f]{6}|transparent)$/iu.test(run.color))
      )
        throw new ShapeTextPaintPreflightError(
          "Glyph layout contains invalid native run coordinates.",
        );
      // Shared formatter validates/resolves the same font identity as measurement.
      if (
        typeof run.font.family !== "string" ||
        !run.font.family ||
        !Number.isFinite(run.font.size) ||
        run.font.size < 1 ||
        run.font.size > 512 ||
        ![400, 700].includes(run.font.weight) ||
        typeof run.font.italic !== "boolean"
      )
        throw new TypeError("Glyph layout requires a valid resolved native font.");
      shapeTextCanvasFont(run.font);
      checkRect(run.inkBounds);
      source = union(source, bounds(run.inkBounds));
      if (run.underline ?? underline)
        source = union(source, transformedDecoration(run, decoration(run, "underline")));
      if (run.strike ?? strike)
        source = union(source, transformedDecoration(run, decoration(run, "strike")));
      return Object.freeze({
        ...run,
        font: Object.freeze({ ...run.font }),
        inkBounds: Object.freeze({ ...run.inkBounds }),
      });
    }),
  );
  const line = style.line?.kind === "value" ? style.line.value : undefined;
  const contourRequired =
    !!line &&
    line.widthPt > 0 &&
    line.paint.opacity > 0 &&
    (line.compound !== "single" || line.dash !== "solid");
  if (source && line && line.widthPt > 0 && line.paint.opacity > 0) {
    const radius = (line.widthPt * 4) / 3 / 2;
    // Compound offset miters and square caps are bounded conservatively.
    const padding = radius * Math.max(line.miterLimit, line.cap === "square" ? Math.SQRT2 : 1);
    source = {
      left: source.left - padding,
      top: source.top - padding,
      right: source.right + padding,
      bottom: source.bottom + padding,
    };
  }
  // Rich-outline contours must see original glyph alpha, rather than inventing
  // an outline along a clipped rectangle edge. Clip their final paint instead.
  if (
    source &&
    layout.clipRect &&
    !contourRequired &&
    (!options.captureSilhouette || requiresGlyphProjection)
  )
    source = intersect(source, bounds(layout.clipRect));
  // Empty text is transparent; a finite nonempty bound lets the compositor retain its frame.
  source ??= { left: 0, top: 0, right: 1, bottom: 1 };
  const effectStyle =
    normalizeShapeStyle({
      ...(style.shadow ? { shadow: style.shadow } : {}),
      ...(style.reflection ? { reflection: style.reflection } : {}),
      ...(style.glow ? { glow: style.glow } : {}),
      ...(style.softEdges ? { softEdges: style.softEdges } : {}),
      ...(style.format3d ? { format3d: style.format3d } : {}),
      ...(style.rotation3d ? { rotation3d: style.rotation3d } : {}),
    }) ?? {};
  return {
    runs,
    underline,
    strike,
    overflow: layout.overflow,
    clipRect: layout.clipRect ? Object.freeze({ ...layout.clipRect }) : null,
    effectiveStyle: style,
    effectStyle,
    sourceBounds: source,
    contourRequired,
    requiresGlyphProjection,
    sourceNumericBytes: runs.length * 512 + units * 4 + 8192,
  };
}

const glyphSourceProfile = Object.freeze({
  kind: "drawing" as const,
  workBudget: FREE_SHAPE_PATH_WORK_BUDGET,
});
function sourceEnvelopeGeometry(
  drawing: SheetGraphicDrawing,
  source: PictureEffectBounds,
): ShapePresetGeometry {
  return {
    width: drawing.width,
    height: drawing.height,
    handles: [],
    adjustments: {},
    paths: [
      {
        filled: true,
        fillMode: "norm",
        stroke: true,
        commands: [
          ["M", source.left, source.top],
          ["L", source.right, source.top],
          ["L", source.right, source.bottom],
          ["L", source.left, source.bottom],
          ["Z"],
        ],
      },
    ],
  };
}
function createGlyphGeometry(
  drawing: SheetGraphicDrawing,
  silhouette: ShapeGlyphSilhouette,
  origin: PictureEffectBounds,
  density: number,
): ShapePresetGeometry | undefined {
  if (!silhouette.contours.length) return undefined;
  const commands: ShapePathCommand[] = [];
  for (const contour of silhouette.contours) {
    for (let index = 0; index < contour.points.length; index++) {
      const point = contour.points[index]!;
      commands.push([
        index === 0 ? "M" : "L",
        (point.x + origin.left) / density,
        (point.y + origin.top) / density,
      ]);
    }
    commands.push(["Z"]);
    if (commands.length > FREE_SHAPE_PATH_WORK_BUDGET.commands)
      throw new ShapeTextGlyphContourBudgetError(
        "Painted glyph projection exceeds its 2048-command contour budget.",
      );
  }
  return Object.freeze({
    width: drawing.width,
    height: drawing.height,
    handles: Object.freeze([]),
    adjustments: Object.freeze({}),
    paths: Object.freeze([
      Object.freeze({
        filled: true,
        fillMode: "norm" as const,
        stroke: true,
        commands: Object.freeze(commands.map((command) => Object.freeze(command))),
      }),
    ]),
  });
}
function conservativeGlyphProjection(
  _drawing: SheetGraphicDrawing,
  style: ShapeDetailedStyle,
  _theme: WorkbookTheme,
) {
  return {
    projectedBounds: (
      density: number,
      front: PictureEffectBounds,
      frame: { width: number; height: number },
    ) => {
      // Rounded native-alpha cells can reach the front raster edge. Project its
      // entire envelope at BOTH depth planes, also when glyph overflow lies
      // beyond the durable frame. Geometry is only used for numeric preflight.
      // Analytic vertices only. Shared extrusion pixel/work preflight must run
      // AFTER adaptive density settles, not reject an oversized first trial.
      const format = style.format3d?.kind === "value" ? style.format3d.value : undefined,
        rotation = style.rotation3d?.kind === "value" ? style.rotation3d.value : undefined,
        geometry = createPictureProjectiveGeometry({
          widthPx: frame.width,
          heightPx: frame.height,
          depthPx: (((format?.depthPt ?? 0) * 4) / 3) * density,
          rotation: rotation
            ? {
                ...rotation,
                distanceFromGroundPx: ((rotation.distanceFromGroundPt * 4) / 3) * density,
              }
            : { projection: "parallel", xDeg: 0, yDeg: 0, zDeg: 0, distanceFromGroundPx: 0 },
        });
      const corners = [
          { x: front.left, y: front.top },
          { x: front.right, y: front.top },
          { x: front.right, y: front.bottom },
          { x: front.left, y: front.bottom },
        ],
        points = corners.flatMap((point) => [
          projectPictureShapePoint(geometry, point),
          projectPictureShapePoint(geometry, point, -geometry.depthPx),
        ]),
        width = Math.max(
          (((format?.contourPt ?? 0) * 4) / 3) * density,
          format?.material === "wire-frame" ? density : 0,
        ),
        margin = width / 2 + 1;
      return {
        left: Math.floor(Math.min(...points.map((point) => point.x)) - margin),
        top: Math.floor(Math.min(...points.map((point) => point.y)) - margin),
        right: Math.ceil(Math.max(...points.map((point) => point.x)) + margin),
        bottom: Math.ceil(Math.max(...points.map((point) => point.y)) + margin),
      };
    },
    projectSurface: () => {
      throw new TypeError("A conservative glyph envelope must never render pixels.");
    },
  };
}

/** Pure preflight: no Canvas, font lookup, image decoding or paint callbacks. */
export function planShapeTextPaint(options: ShapeTextPaintOptions): ShapeTextPaintPlan {
  const source = prepareSource(options),
    assetIds = getShapeStyleAssetIds(source.effectiveStyle),
    missingAssetIds: string[] = [];
  for (const id of assetIds) {
    const size = options.resources?.getAssetSize?.(id);
    if (!size) missingAssetIds.push(id);
    else if (
      !Number.isSafeInteger(size.width) ||
      !Number.isSafeInteger(size.height) ||
      size.width <= 0 ||
      size.height <= 0 ||
      size.width > 10_000_000 ||
      size.height > 10_000_000
    )
      throw new ShapeTextPaintPreflightError("Glyph paint asset metadata is invalid.");
  }
  const contourBytes =
    source.contourRequired || source.requiresGlyphProjection || options.captureSilhouette
      ? SHAPE_GLYPH_CONTOUR_LIMITS.scratchBytes
      : 0;
  // Compositor reserves 64 bytes/pixel. Glyph masks, two paint surfaces, own source
  // Canvas/readback and cache detach additionally reserve 32 bytes/front pixel.
  const memoryBytes = Math.floor(
    (SHAPE_TEXT_PAINT_LIMITS.memoryBytes - contourBytes - source.sourceNumericBytes) / 1.5,
  );
  if (memoryBytes < 8192)
    throw new ShapeTextPaintPreflightError(
      "Glyph ordered numeric source exceeds its aggregate memory budget.",
    );
  if (!Number.isFinite(options.density) || options.density <= 0 || options.density > 64)
    throw new ShapeTextPaintPreflightError("Glyph pixel density must be finite within (0,64].");
  const format =
      source.effectiveStyle.format3d?.kind === "value"
        ? source.effectiveStyle.format3d.value
        : undefined,
    rotation =
      source.effectiveStyle.rotation3d?.kind === "value"
        ? source.effectiveStyle.rotation3d.value
        : undefined;
  // Keep the first projective trial finite for far-overflow ink. This only
  // lowers density; shared adaptive preflight still owns final pixel/memory limits.
  const initialDensity = source.requiresGlyphProjection
    ? Math.min(
        options.density,
        4096 /
          Math.max(
            1,
            options.drawing.width,
            options.drawing.height,
            ...Object.values(source.sourceBounds).map(Math.abs),
            ((format?.depthPt ?? 0) * 4) / 3,
            ((rotation?.distanceFromGroundPt ?? 0) * 4) / 3,
          ),
      )
    : options.density;
  const rasterOptions = {
    widthPx: options.drawing.width,
    heightPx: options.drawing.height,
    pixelDensity: initialDensity,
    style: source.effectStyle,
    outerAngleDeg: options.angleDeg ?? options.drawing.rotation,
    sourceBounds: source.sourceBounds,
    // PURE conservative envelope only. This projector is never invoked; actual
    // pixels use the composed glyph-alpha contour geometry below instead.
    ...(source.requiresGlyphProjection
      ? conservativeGlyphProjection(
          options.drawing,
          source.effectStyle,
          options.resources?.theme ?? DEFAULT_WORKBOOK_THEME,
        )
      : {}),
    limits: { memoryBytes },
  };
  let raster = planDetailedPictureRaster(rasterOptions);
  if (source.contourRequired) {
    // Quantized alpha cells add at most sqrt(2) raster pixels beyond the
    // mathematical ink contour. Reserve two pixels after adaptive sampling;
    // four at the first density leaves room for the second bounded preflight.
    const padding = 4 / raster.actualDensity,
      base = source.sourceBounds;
    source.sourceBounds = {
      left: base.left - padding,
      top: base.top - padding,
      right: base.right + padding,
      bottom: base.bottom + padding,
    };
    raster = planDetailedPictureRaster({ ...rasterOptions, sourceBounds: source.sourceBounds });
    if (padding * raster.actualDensity < 2)
      throw new ShapeTextPaintPreflightError(
        "Glyph contour reconstruction cannot fit its conservative bounds budget.",
      );
  }
  if (source.runs.some((run) => run.color !== undefined)) {
    let spans = 0,
      previousColor: string | undefined,
      first = true;
    for (const run of source.runs) {
      if (first || run.color !== previousColor) spans++;
      first = false;
      previousColor = run.color;
    }
    if (
      raster.frontWidthRaster * raster.frontHeightRaster * (4 + spans * 4) >
      SHAPE_TEXT_PAINT_LIMITS.rasterWork
    )
      throw new ShapeTextPaintPreflightError(
        "Attributed glyph fill exceeds its bounded raster-span work budget.",
      );
  }
  const sourceScratchBytes =
    raster.frontWidthRaster * raster.frontHeightRaster * 32 +
    contourBytes +
    source.sourceNumericBytes;
  const estimatedPeakBytes = raster.estimatedPeakBytes + sourceScratchBytes;
  if (estimatedPeakBytes > SHAPE_TEXT_PAINT_LIMITS.memoryBytes)
    throw new ShapeTextPaintPreflightError(
      "Glyph paint exceeds its aggregate 64MiB presentation budget.",
    );
  const result = {
    ...raster,
    ...source,
    sourceScratchBytes,
    rasterMemoryBytes: memoryBytes,
    estimatedPeakBytes,
    assetIds: Object.freeze([...assetIds]),
  };
  return missingAssetIds.length
    ? { ...result, kind: "unavailable", reason: "asset-unavailable", missingAssetIds }
    : result;
}

function nativeMask(
  context: CanvasRenderingContext2D,
  plan: ShapeTextPaintPlan,
  outline?: ShapeLine,
  clip = true,
  runs: readonly Readonly<ShapeTextRun>[] = plan.runs,
): void {
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    if (clip && plan.clipRect) {
      context.beginPath();
      context.rect(plan.clipRect.x, plan.clipRect.y, plan.clipRect.width, plan.clipRect.height);
      context.clip();
    }
    if (outline) {
      context.lineWidth = (outline.widthPt * 4) / 3;
      context.lineCap = outline.cap;
      context.lineJoin = outline.join;
      context.miterLimit = outline.miterLimit;
      context.setLineDash([]);
    }
    for (const run of runs) {
      context.save();
      try {
        context.translate(run.x, run.y);
        if (run.angle) context.rotate((run.angle * Math.PI) / 180);
        context.font = shapeTextCanvasFont(run.font);
        context.direction = run.direction;
        if (outline) context.strokeText(run.text, 0, 0);
        else context.fillText(run.text, 0, 0);
        for (const kind of ["underline", "strike"] as const) {
          if (!(run[kind] ?? plan[kind])) continue;
          const rect = decoration(run, kind);
          if (outline) context.strokeRect(rect.x, rect.y, rect.width, rect.height);
          else context.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
}
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Native glyph Canvas processing is unavailable.");
  return context;
}
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
function read(canvas: HTMLCanvasElement): PictureRgbaSurface {
  return {
    width: canvas.width,
    height: canvas.height,
    data: context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data,
  };
}
function write(canvas: HTMLCanvasElement, surface: PictureRgbaSurface): void {
  const context = context2d(canvas),
    data = context.createImageData(surface.width, surface.height);
  data.data.set(surface.data);
  context.putImageData(data, 0, 0);
}
function masked(paint: PictureRgbaSurface, mask: PictureRgbaSurface): void {
  if (paint.width !== mask.width || paint.height !== mask.height)
    throw new TypeError("Glyph paint and native mask dimensions must match.");
  for (let index = 0; index < paint.data.length; index += 4) {
    paint.data[index + 3] = (paint.data[index + 3]! * mask.data[index + 3]!) / 255;
    if (paint.data[index + 3] === 0) paint.data.fill(0, index, index + 3);
  }
}
function clipMask(surface: PictureRgbaSurface, plan: ShapeTextPaintPlan): void {
  if (!plan.clipRect) return;
  const rect = plan.clipRect,
    left = rect.x * plan.actualDensity - plan.frontBoundsRaster.left,
    top = rect.y * plan.actualDensity - plan.frontBoundsRaster.top,
    right = left + rect.width * plan.actualDensity,
    bottom = top + rect.height * plan.actualDensity;
  for (let y = 0; y < surface.height; y++)
    for (let x = 0; x < surface.width; x++) {
      const coverage =
        Math.max(0, Math.min(x + 1, right) - Math.max(x, left)) *
        Math.max(0, Math.min(y + 1, bottom) - Math.max(y, top));
      const index = (y * surface.width + x) * 4;
      surface.data[index + 3] = surface.data[index + 3]! * coverage;
      if (surface.data[index + 3] === 0) surface.data.fill(0, index, index + 3);
    }
}
function over(target: PictureRgbaSurface, input: PictureRgbaSurface): void {
  for (let index = 0; index < target.data.length; index += 4) {
    const sa = input.data[index + 3]! / 255,
      da = target.data[index + 3]! / 255,
      alpha = sa + da * (1 - sa);
    if (alpha === 0) continue;
    for (let channel = 0; channel < 3; channel++)
      target.data[index + channel] =
        (input.data[index + channel]! * sa + target.data[index + channel]! * da * (1 - sa)) / alpha;
    target.data[index + 3] = alpha * 255;
  }
}
/** Compose a single ordered mask without allocating a paint surface per character. */
function overMaskedFill(
  target: PictureRgbaSurface,
  mask: PictureRgbaSurface,
  fill: PictureRgbaSurface | undefined,
  color: string | undefined,
): void {
  if (color === "transparent" || (color === undefined && !fill)) return;
  const rgb =
    color !== undefined
      ? [
          parseInt(color.slice(1, 3), 16),
          parseInt(color.slice(3, 5), 16),
          parseInt(color.slice(5, 7), 16),
        ]
      : undefined;
  for (let index = 0; index < target.data.length; index += 4) {
    const sa = (mask.data[index + 3]! / 255) * (rgb ? 1 : fill!.data[index + 3]! / 255);
    if (!sa) continue;
    const da = target.data[index + 3]! / 255,
      alpha = sa + da * (1 - sa);
    for (let channel = 0; channel < 3; channel++)
      target.data[index + channel] =
        ((rgb ? rgb[channel]! : fill!.data[index + channel]!) * sa +
          target.data[index + channel]! * da * (1 - sa)) /
        alpha;
    target.data[index + 3] = alpha * 255;
  }
}
const identities = new WeakMap<object, number>();
let nextIdentity = 1,
  cachedBytes = 0,
  liveCanvasBytes = 0,
  liveResultBytes = 0;
type CacheEntry = Readonly<{
  pixels: PictureRgbaSurface;
  raster: Pick<
    PictureDetailedRasterReadyPlan,
    | "actualDensity"
    | "logicalBounds"
    | "bodyBoundsRaster"
    | "frontBoundsRaster"
    | "outputBoundsRaster"
    | "widthRaster"
    | "heightRaster"
    | "bodyWidthRaster"
    | "bodyHeightRaster"
    | "frontWidthRaster"
    | "frontHeightRaster"
    | "isProjected"
    | "estimatedPeakBytes"
    | "style"
  >;
  glyphGeometry?: ShapePresetGeometry;
  bytes: number;
}>;
const cache = new Map<string, CacheEntry>();
function identity(object: object): number {
  let value = identities.get(object);
  if (value === undefined) {
    value = nextIdentity++;
    identities.set(object, value);
  }
  return value;
}
function removeCache(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cachedBytes -= entry.bytes;
  cache.delete(key);
}
export function clearShapeTextPaintCache(): void {
  cache.clear();
  cachedBytes = 0;
}
export function getShapeTextPaintOwnedBytes(): Readonly<{
  cached: number;
  liveCanvases: number;
  liveResults: number;
}> {
  return { cached: cachedBytes, liveCanvases: liveCanvasBytes, liveResults: liveResultBytes };
}
function layoutSignature(runs: readonly Readonly<ShapeTextRun>[]): string {
  // Bounded retained key; never keep100000-character text or100000-run JSON in
  // each LRU entry. Source/layout identities also partition this content digest.
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (const run of runs) {
    const part = JSON.stringify(run);
    for (let index = 0; index < part.length; index++) {
      const value = part.charCodeAt(index);
      a = Math.imul(a ^ value, 0x01000193);
      b = Math.imul(b ^ value, 0x85ebca6b);
    }
  }
  return `${a >>> 0}:${b >>> 0}`;
}
function cacheRaster(plan: ShapeTextPaintPlan & { kind: "ready" }): CacheEntry["raster"] {
  return {
    actualDensity: plan.actualDensity,
    logicalBounds: Object.freeze({ ...plan.logicalBounds }),
    bodyBoundsRaster: Object.freeze({ ...plan.bodyBoundsRaster }),
    frontBoundsRaster: Object.freeze({ ...plan.frontBoundsRaster }),
    outputBoundsRaster: Object.freeze({ ...plan.outputBoundsRaster }),
    widthRaster: plan.widthRaster,
    heightRaster: plan.heightRaster,
    bodyWidthRaster: plan.bodyWidthRaster,
    bodyHeightRaster: plan.bodyHeightRaster,
    frontWidthRaster: plan.frontWidthRaster,
    frontHeightRaster: plan.frontHeightRaster,
    isProjected: plan.isProjected,
    estimatedPeakBytes: plan.estimatedPeakBytes,
    style: normalizeShapeStyle(plan.style),
  };
}
function ownedResult(
  plan: ShapeTextPaintPlan & { kind: "ready" },
  canvas: HTMLCanvasElement,
  silhouette?: ShapeGlyphSilhouette,
  actualGlyphGeometry?: ShapePresetGeometry,
): ShapeTextPaintReady {
  const bytes = canvas.width * canvas.height * 4;
  const ownedBytes =
    bytes +
    plan.sourceNumericBytes +
    (actualGlyphGeometry?.paths[0]?.commands.length ?? 0) * 64 +
    (silhouette ? silhouette.pointCount * 64 + silhouette.contours.length * 256 : 0);
  if (liveResultBytes + ownedBytes > SHAPE_TEXT_PAINT_LIMITS.liveCanvasBytes) {
    release(canvas);
    throw new ShapeTextPaintPreflightError(
      "Live glyph canvases exceed their 64MiB ownership budget.",
    );
  }
  liveCanvasBytes += bytes;
  liveResultBytes += ownedBytes;
  let disposed = false;
  return {
    ...plan,
    canvas,
    ...(silhouette ? { silhouette } : {}),
    ...(actualGlyphGeometry
      ? {
          glyphGeometry: actualGlyphGeometry,
          glyphContourErrorLogicalPx: Math.SQRT2 / plan.actualDensity,
        }
      : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      liveCanvasBytes -= bytes;
      liveResultBytes -= ownedBytes;
      release(canvas);
    },
  };
}

/** Concrete independent glyph raster. Native Canvas shapes whole runs; fill,
 * outline, decorations and effects never inherit body fill/shadow/glow. The
 * returned local raster includes text-own 3D, but has no body 3D or ordinary 2D
 * rotation baked into pixels. 3D extrusion follows bounded real glyph contours,
 * preserving holes; pixel-cell quantization is not vector font/WPS parity.
 * Overall drawing opacity belongs to the final body/text presentation once.
 * Explicit key must include the caller's ready-font resource revision to cache. */
export function prepareShapeTextPaint(
  options: Parameters<typeof prepareShapeTextPaintAtDensity>[0],
): ShapeTextPaintRaster {
  try {
    return prepareShapeTextPaintAtDensity(options);
  } catch (error) {
    if (options.density <= 1 || !(error instanceof ShapeTextGlyphContourBudgetError)) throw error;
    // Higher DPR can introduce native-alpha staircase vertices that were absent
    // in the pre-command density-1 proof. Exactly one matching retry is allowed;
    // the failed attempt's finally has already released every owned Canvas.
    // Density-1 failure remains explicit, including its adaptive actual density.
    return prepareShapeTextPaintAtDensity({ ...options, density: 1 });
  }
}

function prepareShapeTextPaintAtDensity(
  options: ShapeTextPaintOptions &
    Readonly<{
      key?: string;
      sourceIdentity?: object;
      canvasFactory?: () => HTMLCanvasElement;
    }>,
): ShapeTextPaintRaster {
  const plan = planShapeTextPaint(options);
  if (plan.kind === "unavailable") return plan;
  if (
    liveResultBytes + plan.sourceNumericBytes + plan.widthRaster * plan.heightRaster * 4 >
    SHAPE_TEXT_PAINT_LIMITS.liveCanvasBytes
  )
    throw new ShapeTextPaintPreflightError(
      "Live glyph canvases exceed their 64MiB ownership budget.",
    );
  const images = new Map<string, DecodedPicturePaintImage>();
  for (const id of plan.assetIds) {
    const image = options.resources?.getAssetImage?.(id);
    if (image) images.set(id, image);
  }
  const missingAssetIds = plan.assetIds.filter((id) => !images.has(id));
  if (missingAssetIds.length)
    return { ...plan, kind: "unavailable", reason: "asset-unavailable", missingAssetIds };
  const theme = options.resources?.theme ?? DEFAULT_WORKBOOK_THEME,
    cacheable = options.key !== undefined && !options.canvasFactory && !options.captureSilhouette,
    key = JSON.stringify([
      identity(options.sourceIdentity ?? options.drawing),
      identity(options.layout),
      options.key,
      layoutSignature(plan.runs),
      plan.clipRect,
      plan.underline,
      plan.strike,
      plan.effectiveStyle,
      plan.actualDensity,
      plan.outerAngleDeg,
      options.drawing.width,
      options.drawing.height,
      theme,
      [...images].map(([id, image]) => [id, identity(image)]),
    ]),
    canvases = new Set<HTMLCanvasElement>();
  let resultCanvas: HTMLCanvasElement | undefined;
  let returned = false;
  const make = (width: number, height: number) => {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > SHAPE_TEXT_PAINT_LIMITS.side ||
      height > SHAPE_TEXT_PAINT_LIMITS.side ||
      width * height > SHAPE_TEXT_PAINT_LIMITS.pixels
    )
      throw new ShapeTextPaintPreflightError(
        "Glyph Canvas allocation exceeds its pure plan budget.",
      );
    const canvas = options.canvasFactory?.() ?? document.createElement("canvas");
    if (canvases.has(canvas) || [...images.values()].includes(canvas))
      throw new TypeError("Glyph canvas factory must return a fresh unowned Canvas.");
    canvases.add(canvas);
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  try {
    const existing = cacheable ? cache.get(key) : undefined;
    if (existing) {
      cache.delete(key);
      cache.set(key, existing);
      resultCanvas = make(existing.pixels.width, existing.pixels.height);
      write(resultCanvas, existing.pixels);
      const result = ownedResult(
        { ...plan, ...existing.raster },
        resultCanvas,
        undefined,
        existing.glyphGeometry,
      );
      returned = true;
      return result;
    }
    const maskCanvas = make(plan.frontWidthRaster, plan.frontHeightRaster),
      maskContext = context2d(maskCanvas);
    maskContext.translate(-plan.frontBoundsRaster.left, -plan.frontBoundsRaster.top);
    maskContext.scale(plan.actualDensity, plan.actualDensity);
    nativeMask(
      maskContext,
      plan,
      undefined,
      !plan.contourRequired && (!options.captureSilhouette || plan.requiresGlyphProjection),
    );
    const glyphMask = read(maskCanvas),
      silhouette =
        plan.contourRequired || (options.captureSilhouette && !plan.requiresGlyphProjection)
          ? traceGlyphSilhouette(glyphMask)
          : undefined,
      fill =
        plan.effectiveStyle.fill?.kind === "value" ? plan.effectiveStyle.fill.value : undefined,
      line =
        plan.effectiveStyle.line?.kind === "value" ? plan.effectiveStyle.line.value : undefined;
    if (plan.contourRequired || (options.captureSilhouette && !plan.requiresGlyphProjection))
      clipMask(glyphMask, plan);
    const paintSurface = (paint: ShapePaint) =>
      createDetailedPicturePaintSurface({
        paint,
        theme,
        widthPx: options.drawing.width,
        heightPx: options.drawing.height,
        pixelDensity: plan.actualDensity,
        outerAngleDeg: plan.outerAngleDeg,
        boundsRaster: plan.frontBoundsRaster,
        getAssetImage: (id) => images.get(id),
        canvasFactory: () => make(1, 1),
        limits: { memoryBytes: SHAPE_TEXT_PAINT_LIMITS.memoryBytes },
      });
    let source: PictureRgbaSurface;
    if (!plan.runs.some((run) => run.color !== undefined)) {
      if (fill) {
        source = paintSurface(fill);
        masked(source, glyphMask);
      } else source = createPictureRgbaSurface(glyphMask.width, glyphMask.height);
    } else {
      // Keep the original aggregate mask for the one uniform outline/effect pass.
      // Reuse its Canvas for contiguous front-fill spans in source painter order.
      source = createPictureRgbaSurface(glyphMask.width, glyphMask.height);
      const inheritedFill = fill ? paintSurface(fill) : undefined;
      const emptyMask = createPictureRgbaSurface(glyphMask.width, glyphMask.height);
      let start = 0;
      while (start < plan.runs.length) {
        let end = start + 1;
        const color = plan.runs[start]!.color;
        while (end < plan.runs.length && plan.runs[end]!.color === color) end++;
        if (color !== "transparent" && (color !== undefined || inheritedFill)) {
          write(maskCanvas, emptyMask);
          nativeMask(maskContext, plan, undefined, true, plan.runs.slice(start, end));
          overMaskedFill(source, read(maskCanvas), inheritedFill, color);
        }
        start = end;
      }
    }
    if (line && line.widthPt > 0 && line.paint.opacity > 0) {
      const outlineCanvas = make(plan.frontWidthRaster, plan.frontHeightRaster),
        outlineContext = context2d(outlineCanvas);
      if (plan.contourRequired) {
        strokeShapeGlyphSilhouette(outlineContext, silhouette!, line, plan.actualDensity);
      } else {
        outlineContext.translate(-plan.frontBoundsRaster.left, -plan.frontBoundsRaster.top);
        outlineContext.scale(plan.actualDensity, plan.actualDensity);
        nativeMask(outlineContext, plan, line);
      }
      const outline = paintSurface(line.paint),
        outlineMask = read(outlineCanvas);
      if (plan.contourRequired) clipMask(outlineMask, plan);
      masked(outline, outlineMask);
      over(source, outline);
      release(outlineCanvas);
    }
    // Match the compositor's order: soft edges first, then text-own3D, then
    // text-owned shadow/glow/reflection. The contour sees that actual front alpha.
    const softEdges =
      plan.effectStyle.softEdges?.kind === "value" ? plan.effectStyle.softEdges.value : undefined;
    if (plan.requiresGlyphProjection && softEdges && softEdges.sizePt > 0)
      source = softenPictureEdges(source, (softEdges.sizePt * 4 * plan.actualDensity) / 3);
    const composedSilhouette = plan.requiresGlyphProjection
      ? traceGlyphSilhouette(source)
      : undefined;
    const actualGlyphGeometry = composedSilhouette
      ? createGlyphGeometry(
          options.drawing,
          composedSilhouette,
          plan.frontBoundsRaster,
          plan.actualDensity,
        )
      : undefined;
    const baseProjection = plan.requiresGlyphProjection
      ? getPictureRasterProjection(
          plan.effectStyle,
          theme,
          actualGlyphGeometry ?? sourceEnvelopeGeometry(options.drawing, plan.sourceBounds),
          glyphSourceProfile,
        )
      : {};
    const projection: Pick<PictureDetailedRasterPlanOptions, "projectedBounds" | "projectSurface"> =
      (() => {
        if (!plan.requiresGlyphProjection || actualGlyphGeometry) return baseProjection;
        // Bounds can remain conservative when there is no alpha. The render path
        // itself returns TRANSPARENT pixels and never extrudes a frame/envelope.
        const resolver = baseProjection.projectedBounds;
        if (typeof resolver !== "function")
          throw new TypeError("Glyph projection requires a pure numeric bounds resolver.");
        const projectSurface: PictureDetailedSurfaceProjector = (input, density, frame) => {
          const projected = resolver(
            density,
            {
              left: input.left,
              top: input.top,
              right: input.left + input.surface.width,
              bottom: input.top + input.surface.height,
            },
            { width: frame.widthPx, height: frame.heightPx },
          );
          return {
            surface: createPictureRgbaSurface(
              projected.right - projected.left,
              projected.bottom - projected.top,
            ),
            left: projected.left,
            top: projected.top,
          };
        };
        return { ...baseProjection, projectSurface };
      })();
    const sourceCanvas = make(source.width, source.height);
    write(sourceCanvas, source);
    release(maskCanvas);
    const raster = createDetailedPictureRaster({
      widthPx: options.drawing.width,
      heightPx: options.drawing.height,
      pixelDensity: plan.actualDensity,
      style:
        plan.requiresGlyphProjection && softEdges
          ? { ...plan.effectStyle, softEdges: { kind: "none" } }
          : plan.effectStyle,
      theme,
      outerAngleDeg: plan.outerAngleDeg,
      sourceBounds: plan.sourceBounds,
      ...projection,
      limits: { memoryBytes: plan.rasterMemoryBytes },
      sourcePainter: (context) =>
        context.drawImage(
          sourceCanvas,
          plan.frontBoundsRaster.left / plan.actualDensity,
          plan.frontBoundsRaster.top / plan.actualDensity,
          sourceCanvas.width / plan.actualDensity,
          sourceCanvas.height / plan.actualDensity,
        ),
      canvasFactory: () => make(1, 1),
    });
    if (raster.kind === "unavailable") return { ...plan, ...raster };
    resultCanvas = raster.canvas;
    const renderedPlan = {
      ...plan,
      ...raster,
      assetIds: plan.assetIds,
      estimatedPeakBytes: raster.estimatedPeakBytes + plan.sourceScratchBytes,
    };
    if (cacheable) {
      const pixels = read(resultCanvas),
        bytes =
          pixels.data.byteLength +
          key.length * 2 +
          4096 +
          (actualGlyphGeometry?.paths[0]?.commands.length ?? 0) * 64;
      while (
        cache.size >= SHAPE_TEXT_PAINT_LIMITS.cacheEntries ||
        cachedBytes + bytes > SHAPE_TEXT_PAINT_LIMITS.cacheBytes
      ) {
        const first = cache.keys().next().value;
        if (first === undefined) break;
        removeCache(first);
      }
      if (bytes <= SHAPE_TEXT_PAINT_LIMITS.cacheBytes) {
        cache.set(key, {
          pixels,
          raster: cacheRaster(renderedPlan),
          bytes,
          ...(actualGlyphGeometry ? { glyphGeometry: actualGlyphGeometry } : {}),
        });
        cachedBytes += bytes;
      }
    }
    const result = ownedResult(
      renderedPlan,
      resultCanvas,
      options.captureSilhouette ? (composedSilhouette ?? silhouette) : undefined,
      actualGlyphGeometry,
    );
    returned = true;
    return result;
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
    for (const canvas of canvases) if (canvas !== resultCanvas || !returned) release(canvas);
  }
}

/** Before publishing a Core command, prove budgets that require ACTUAL native
 * glyph alpha. The caller must already have resolved the same ready fonts and
 * revalidate its owner/resource revision after this work. No drawing mutation.
 *
 * Ordinary single/solid text has no contour expansion and uses numeric proof.
 * Compound/dashed outlines draw native masks and validate real contours/shared
 * dash phases WITHOUT decoding/reading paint assets. For text-own3D, paint alpha
 * can add holes/components (including picture textures), so actual composed
 * fill/outline/soft alpha and projective work must be checked. That route needs
 * the same resources as rendering and reports missing assets explicitly.
 * Every temporary/returned Canvas is disposed before this function returns or
 * throws. A pure numeric projection envelope never counts as this proof. */
export function preflightShapeTextGlyphBudgets(
  options: ShapeTextPaintOptions & Readonly<{ canvasFactory?: () => HTMLCanvasElement }>,
): ShapeTextGlyphBudgetPreflight {
  const plan = planShapeTextPaint(options);
  const summary = (
    proof: Extract<ShapeTextGlyphBudgetPreflight, { kind: "ready" }>["proof"],
    silhouette?: ShapeGlyphSilhouette,
    commands = 0,
    density = plan.actualDensity,
    peakBytes = plan.estimatedPeakBytes,
  ): ShapeTextGlyphBudgetPreflight => ({
    kind: "ready",
    proof,
    actualDensity: density,
    estimatedPeakBytes: peakBytes,
    contourCount: silhouette?.contours.length ?? 0,
    edgeCount: silhouette?.edgeCount ?? 0,
    pointCount: silhouette?.pointCount ?? 0,
    glyphCommandCount: commands,
  });
  if (plan.requiresGlyphProjection) {
    // No cache key: a previously rendered envelope cannot bypass current native
    // glyph/paint-alpha budget proof. Owned output is released in all cases.
    const raster = prepareShapeTextPaint({ ...options, captureSilhouette: true });
    if (raster.kind === "unavailable")
      return {
        kind: "unavailable",
        reason: raster.reason,
        missingAssetIds: [...raster.missingAssetIds],
      };
    try {
      return summary(
        "painted-alpha-projection",
        raster.silhouette,
        raster.glyphGeometry?.paths.reduce((sum, path) => sum + path.commands.length, 0) ?? 0,
        raster.actualDensity,
        raster.estimatedPeakBytes,
      );
    } finally {
      raster.dispose();
    }
  }
  if (!plan.contourRequired) return summary("numeric-source");
  const canvases = new Set<HTMLCanvasElement>();
  const make = () => {
    const canvas = options.canvasFactory?.() ?? document.createElement("canvas");
    if (canvases.has(canvas))
      throw new TypeError("Glyph preflight factory must return a fresh unowned Canvas.");
    canvases.add(canvas);
    canvas.width = plan.frontWidthRaster;
    canvas.height = plan.frontHeightRaster;
    return canvas;
  };
  try {
    const maskCanvas = make(),
      maskContext = context2d(maskCanvas);
    maskContext.translate(-plan.frontBoundsRaster.left, -plan.frontBoundsRaster.top);
    maskContext.scale(plan.actualDensity, plan.actualDensity);
    // Same unclipped native mask as rich-outline rendering, never a frame box.
    nativeMask(maskContext, plan, undefined, false);
    const silhouette = traceGlyphSilhouette(read(maskCanvas)),
      line = plan.effectiveStyle.line;
    if (line?.kind !== "value")
      throw new TypeError("Native glyph outline proof requires a detailed line.");
    strokeShapeGlyphSilhouette(context2d(make()), silhouette, line.value, plan.actualDensity);
    return summary("native-alpha-outline", silhouette);
  } finally {
    for (const canvas of canvases) release(canvas);
  }
}
