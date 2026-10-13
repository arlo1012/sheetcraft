import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import type {
  EvaluatedShapePresetGeometry,
  ShapePathCommand,
} from "@sheetcraft/core/shape-presets";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import type { PictureEffectBounds } from "../../shared/images/picture-effect-geometry";
import type { PicturePaintResources } from "../../shared/images/picture-detailed-render";
import type { DecodedPicturePaintImage } from "../../shared/images/picture-detailed-compositor";
import { getDrawingShapeGeometry } from "./shape-geometry";
import { getLegacyShapeGeometry } from "./legacy-shape-geometry";
import {
  planShapeDetailedPaint,
  prepareShapeDetailedPaint,
  resolveShapeDetailedPaintStyle,
  type ShapeDetailedPaintPlan,
} from "./shape-detailed-paint";
import {
  layoutShapeText,
  type ShapeTextLayoutResult,
  type ShapeTextRect,
} from "./shape-text-layout";
import {
  applyShapeTextVerticalFlip,
  layoutDrawingShapeText,
  resolveDrawingShapeText,
  ShapeTextRuntimeError,
  type DrawingShapeTextRuntimeOptions,
  type ResolvedDrawingShapeText,
} from "./shape-text-runtime";
import {
  planShapeTextPaint,
  prepareShapeTextPaint,
  resolveShapeTextPaintStyle,
  type ShapeTextPaintPlan,
  type ShapeTextPaintReady,
} from "./shape-text-paint";
import {
  projectedShapeTextBounds,
  projectShapeTextSurface,
  shapeTextFollowsBodyProjection,
} from "./shape-text-projection";
import type { ShapeGroupSceneProjection } from "./shape-group-scene";

export const SHAPE_LEAF_PIXELS_LIMITS = Object.freeze({
  side: 4096,
  pixels: 4_000_000,
  memoryBytes: 64 * 1024 * 1024,
  replans: 12,
});
export type ShapeLeafRenderPolicy = "legacy-svg" | "legacy-text-box" | "standard";
export type ShapeLeafPixelsOptions = Readonly<{
  /** The real disposable world-view leaf; never a synthetic image/document asset. */
  drawing: SheetGraphicDrawing;
  /** Exact Core numeric source; never re-evaluate a preset in its padded paint frame. */
  connectorRoute?: ReadyShapeConnectorRoute;
  density: number;
  resources?: PicturePaintResources;
  /** Full owning-tree world angle. It informs fixed-direction paints; pixels stay local. */
  angleDeg?: number;
  sourceIdentity?: object;
  legacyLineHeightPx?: number;
  canvasFactory?: () => HTMLCanvasElement;
  /** Reuse genuine ready native metrics, including in deterministic Canvas-boundary tests. */
  textRuntimeOptions?: DrawingShapeTextRuntimeOptions;
  resolvedText?: ResolvedDrawingShapeText;
  /** A live editor replaces this leaf's glyph surface; source text stays untouched. */
  hideText?: boolean;
  /** Complete canonical leaf-to-camera placement, independent of own appearance. */
  groupScene?: ShapeGroupSceneProjection;
}>;
type LeafBase = Readonly<{
  renderPolicy: ShapeLeafRenderPolicy;
  actualDensity: number;
  logicalBounds: PictureEffectBounds;
  outputBoundsRaster: PictureEffectBounds;
  widthRaster: number;
  heightRaster: number;
  estimatedPeakBytes: number;
  ownedBytes: number;
  bodyFlipX: boolean;
  bodyFlipY: boolean;
  textFollowsBodyProjection: boolean;
  richText: boolean;
  bodyPlan: ShapeDetailedPaintPlan;
  textPlan?: ShapeTextPaintPlan;
  textLayout?: ShapeTextLayoutResult;
  /** Transient actual CSS source geometry is distinct from centered shape outlines. */
  cssBorderRects?: readonly ShapeTextRect[];
}>;
export type ShapeLeafPixelsUnavailableReason =
  | "asset-unavailable"
  | "asset-pixels-unavailable"
  | "text-unavailable";
export type ShapeLeafPixelsPlan = LeafBase &
  (
    | Readonly<{ kind: "ready" }>
    | Readonly<{
        kind: "unavailable";
        reason: ShapeLeafPixelsUnavailableReason;
        missingAssetIds: readonly string[];
        message?: string;
      }>
  );
export type ShapeLeafPixelsResult =
  | (Extract<ShapeLeafPixelsPlan, { kind: "ready" }> &
      Readonly<{ canvas: HTMLCanvasElement; dispose: () => void }>)
  | Extract<ShapeLeafPixelsPlan, { kind: "unavailable" }>;

function union(a: PictureEffectBounds, b: PictureEffectBounds): PictureEffectBounds {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
function flipBounds(
  bounds: PictureEffectBounds,
  drawing: SheetGraphicDrawing,
  x: boolean,
  y: boolean,
): PictureEffectBounds {
  return {
    left: x ? drawing.width - bounds.right : bounds.left,
    right: x ? drawing.width - bounds.left : bounds.right,
    top: y ? drawing.height - bounds.bottom : bounds.top,
    bottom: y ? drawing.height - bounds.top : bounds.bottom,
  };
}
function rasterBounds(bounds: PictureEffectBounds, density: number): PictureEffectBounds {
  if (!Object.values(bounds).every((v) => Number.isFinite(v) && Math.abs(v) <= 10_000_000))
    throw new RangeError("Shape leaf union exceeds its finite-coordinate budget.");
  return {
    left: Math.floor(bounds.left * density),
    top: Math.floor(bounds.top * density),
    right: Math.ceil(bounds.right * density),
    bottom: Math.ceil(bounds.bottom * density),
  };
}
function rectPath(rect: ShapeTextRect): readonly ShapePathCommand[] {
  return [
    ["M", rect.x, rect.y],
    ["L", rect.x + rect.width, rect.y],
    ["L", rect.x + rect.width, rect.y + rect.height],
    ["L", rect.x, rect.y + rect.height],
    ["Z"],
  ];
}
function policy(drawing: SheetGraphicDrawing): ShapeLeafRenderPolicy {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new TypeError("Shape leaf pixels require an actual shape or text box.");
  return drawing.kind === "textBox" && !drawing.shapeText
    ? "legacy-text-box"
    : drawing.shapeGeometry || drawing.shapePath || drawing.shapeStyle || drawing.shapeText
      ? "standard"
      : "legacy-svg";
}
function source(options: ShapeLeafPixelsOptions) {
  const drawing = options.drawing,
    renderPolicy = policy(drawing);
  const geometry = options.connectorRoute
    ? options.connectorRoute.geometry
    : renderPolicy === "legacy-text-box"
      ? getDrawingShapeGeometry(drawing, true)
      : renderPolicy === "legacy-svg"
        ? getLegacyShapeGeometry(drawing.shape, drawing.width, drawing.height)
        : getDrawingShapeGeometry(drawing);
  if (!geometry) throw new RangeError("The actual shape leaf geometry is unavailable.");
  const style = resolveShapeDetailedPaintStyle(
    drawing,
    renderPolicy === "legacy-text-box"
      ? {
          // Keep its real CSS inside-border and plain glyph branch. Explicit
          // body 3D is a contour consumer, including after shared-scene release.
          ...(drawing.shapeStyle?.format3d ? { format3d: drawing.shapeStyle.format3d } : {}),
          ...(drawing.shapeStyle?.rotation3d ? { rotation3d: drawing.shapeStyle.rotation3d } : {}),
        }
      : drawing.shapeStyle,
  );
  let cssBorderRects: readonly ShapeTextRect[] | undefined;
  let effectiveGeometry: EvaluatedShapePresetGeometry = geometry;
  if (renderPolicy === "legacy-svg" && style.line?.kind === "value")
    style.line = { kind: "value", value: { ...style.line.value, cap: "butt", join: "round" } };
  if (renderPolicy === "legacy-text-box") {
    const { width: w, height: h, strokeWidth: border } = drawing;
    const bx = Math.min(border, w / 2),
      by = Math.min(border, h / 2);
    cssBorderRects = Object.freeze(
      [
        { x: 0, y: 0, width: w, height: by },
        { x: 0, y: h - by, width: w, height: by },
        { x: 0, y: by, width: bx, height: Math.max(0, h - by * 2) },
        { x: w - bx, y: by, width: bx, height: Math.max(0, h - by * 2) },
      ].map((rect) => Object.freeze(rect)),
    );
    effectiveGeometry = {
      ...geometry,
      paths: [
        {
          filled: true,
          fillMode: "norm",
          stroke: false,
          commands: rectPath({ x: 0, y: 0, width: w, height: h }),
        },
        ...cssBorderRects
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({
            filled: true,
            fillMode: "norm" as const,
            stroke: false,
            commands: rectPath(r),
          })),
      ],
    };
    // The old CSS branch paints two distinct colors inside its box, with no centered stroke.
    style.fill = { kind: "none" };
    style.line = { kind: "none" };
  }
  const richText =
    !!drawing.shapeText ||
    (renderPolicy === "standard" && drawing.shapeStyle?.rotation3d?.kind === "value");
  const rect = geometry.textRect;
  const plainTextRect = !!rect && rect.right > rect.left && rect.bottom > rect.top;
  const hasText =
    renderPolicy === "legacy-svg" || renderPolicy === "legacy-text-box" || drawing.shapeText
      ? !!drawing.text
      : !!drawing.text.trim();
  const visibleText =
    !options.hideText &&
    hasText &&
    (richText || drawing.color !== "transparent") &&
    (renderPolicy !== "standard" || richText || plainTextRect);
  return {
    geometry: effectiveGeometry,
    style,
    renderPolicy,
    cssBorderRects,
    richText,
    visibleText,
    bodyFlipX: drawing.shapeFlipX === true,
    bodyFlipY: drawing.shapeFlipY === true,
  };
}
function bodyDrawing(
  options: ShapeLeafPixelsOptions,
  renderPolicy: ShapeLeafRenderPolicy,
): SheetGraphicDrawing {
  // The old SVG/CSS templates never rendered line-end metadata by itself.
  return renderPolicy === "standard"
    ? options.drawing
    : { ...options.drawing, shapeLineEnds: undefined };
}
/** Body source reflection belongs before the common camera. The final leaf
 * compositor still applies F, so its adapter is F*B and its physical map A*F.
 * Readable glyph pixels already contain their H-position/V180 layout contract
 * and use the original unreflected scene instead. */
function bodyGroupScene(options: ShapeLeafPixelsOptions): ShapeGroupSceneProjection | undefined {
  const group = options.groupScene,
    drawing = options.drawing;
  if (!group || (!drawing.shapeFlipX && !drawing.shapeFlipY)) return group;
  const sx = drawing.shapeFlipX ? -1 : 1,
    sy = drawing.shapeFlipY ? -1 : 1,
    tx = drawing.shapeFlipX ? drawing.width : 0,
    ty = drawing.shapeFlipY ? drawing.height : 0,
    a = group.scene.sourceToScene,
    b = group.scene.sceneToOutput;
  return {
    ...group,
    scene: {
      ...group.scene,
      sourceToScene: {
        a: a.a * sx,
        b: a.b * sx,
        c: a.c * sy,
        d: a.d * sy,
        e: a.a * tx + a.c * ty + a.e,
        f: a.b * tx + a.d * ty + a.f,
      },
      ...(b
        ? {
            sceneToOutput: {
              a: sx * b.a,
              b: sy * b.b,
              c: sx * b.c,
              d: sy * b.d,
              e: sx * b.e + tx,
              f: sy * b.f + ty,
            },
          }
        : {}),
    },
  };
}
function plainTextRect(
  options: ShapeLeafPixelsOptions,
  prepared: ReturnType<typeof source>,
): ShapeTextRect {
  const drawing = options.drawing;
  if (prepared.renderPolicy === "legacy-svg")
    return { x: 0, y: 0, width: drawing.width, height: drawing.height };
  if (prepared.renderPolicy === "legacy-text-box") {
    const x = Math.min(drawing.strokeWidth, drawing.width / 2),
      y = Math.min(drawing.strokeWidth, drawing.height / 2);
    return { x, y, width: drawing.width - 2 * x, height: drawing.height - 2 * y };
  }
  const rect = prepared.geometry.textRect;
  if (!rect) throw new RangeError("The actual standard shape text rectangle is unavailable.");
  return {
    x: drawing.shapeFlipX ? drawing.width - rect.right : rect.left,
    y: drawing.shapeFlipY ? drawing.height - rect.bottom : rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}
function textLayout(
  options: ShapeLeafPixelsOptions,
  prepared: ReturnType<typeof source>,
): ShapeTextLayoutResult | undefined {
  if (
    !prepared.visibleText ||
    (options.drawing.color === "transparent" && !options.drawing.shapeText)
  )
    return;
  if (prepared.richText) return layoutDrawingShapeText(options.drawing, options.textRuntimeOptions);
  const rect = plainTextRect(options, prepared);
  // A CSS box with no content area has no visible text, rather than an invented layout.
  if (rect.width <= 0 || rect.height <= 0) return;
  const resolved =
    options.resolvedText ??
    resolveDrawingShapeText(options.drawing, {
      ...options.textRuntimeOptions,
      getTextRect: () => rect,
    });
  const margin = prepared.renderPolicy === "standard" ? 0 : 4.5;
  const lineHeight = options.legacyLineHeightPx ?? 20;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0 || lineHeight > 4096)
    throw new RangeError("Legacy shape line height exceeds its finite line-spacing budget.");
  const layout = layoutShapeText({
    ...resolved,
    text: options.drawing.text,
    textRect: rect,
    layout: {
      blockAlignment: "center",
      direction:
        prepared.renderPolicy === "legacy-text-box" && options.drawing.textDirection === "vertical"
          ? "vertical-rl"
          : "horizontal",
      lineOrder: "rtl",
      marginsPt: { leftPt: margin, rightPt: margin, topPt: margin, bottomPt: margin },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "center",
      beforePt: 0,
      afterPt: 0,
      lineSpacing:
        prepared.renderPolicy === "legacy-text-box"
          ? { kind: "normal" }
          : { kind: "exact", pt: lineHeight * 0.75 },
    },
    pointsToPx: 4 / 3,
  });
  return applyShapeTextVerticalFlip(options.drawing, rect, layout);
}
function textProjectionDrawing(
  options: ShapeLeafPixelsOptions,
  richText: boolean,
): SheetGraphicDrawing {
  return richText || options.drawing.kind === "textBox"
    ? options.drawing
    : { ...options.drawing, shapeStyle: undefined };
}
function textResourcePreflight(
  options: ShapeLeafPixelsOptions,
  visible: boolean,
): readonly string[] {
  if (!visible) return [];
  const ids = getShapeStyleAssetIds(resolveShapeTextPaintStyle(options.drawing)),
    missing: string[] = [];
  for (const id of ids) {
    const size = options.resources?.getAssetSize?.(id);
    if (!size) missing.push(id);
    else if (
      ![size.width, size.height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 10_000_000)
    )
      throw new RangeError("Shape leaf glyph paint asset metadata is invalid.");
  }
  return missing;
}

/** Numeric/resource preflight precedes native layout resolution and all paint/decode calls.
 * Ready metrics are measured once; bounded replanning aligns both surfaces and their true union. */
export function planShapeLeafPixels(options: ShapeLeafPixelsOptions): ShapeLeafPixelsPlan {
  if (
    !Number.isFinite(options.legacyLineHeightPx ?? 20) ||
    (options.legacyLineHeightPx ?? 20) <= 0 ||
    (options.legacyLineHeightPx ?? 20) > 4096
  )
    throw new RangeError("Legacy shape line height exceeds its finite line-spacing budget.");
  if (
    typeof options.drawing.text !== "string" ||
    options.drawing.text.length > 100_000 ||
    !Number.isFinite(options.drawing.fontSize) ||
    options.drawing.fontSize <= 0 ||
    options.drawing.fontSize > 512
  )
    throw new RangeError("Shape leaf native text source exceeds its numeric budget.");
  const prepared = source(options);
  const bodyScene = bodyGroupScene(options),
    textDrawing = textProjectionDrawing(options, prepared.richText),
    textFollowsBodyProjection = shapeTextFollowsBodyProjection(textDrawing, options.groupScene);
  let density = options.density;
  let layout: ShapeTextLayoutResult | undefined;
  let resolvedLayout = false;
  for (let attempt = 0; attempt < SHAPE_LEAF_PIXELS_LIMITS.replans; attempt++) {
    let bodyPlan: ShapeDetailedPaintPlan;
    try {
      bodyPlan = planShapeDetailedPaint({
        drawing: bodyDrawing(options, prepared.renderPolicy),
        geometry: prepared.geometry,
        connectorRoute: options.connectorRoute,
        style: prepared.style,
        density,
        resources: options.resources,
        angleDeg: options.angleDeg,
        groupScene: bodyScene,
      });
    } catch (error) {
      // The contour projector must reject an oversized individual scratch before
      // allocating it. A whole-leaf replan can satisfy that exact raster budget;
      // singular/near-plane/invalid-source failures never become affine fallbacks.
      if (
        !(error instanceof RangeError) ||
        ![
          "Picture projected raster exceeds the 4096-side/4MP rendering budget.",
          "Picture shape projection exceeds its simultaneous memory budget.",
        ].includes(error.message)
      )
        throw error;
      density *= 0.5;
      continue;
    }
    const missingText = textResourcePreflight(options, prepared.visibleText);
    const baseBounds = flipBounds(
      bodyPlan.logicalBounds,
      options.drawing,
      prepared.bodyFlipX,
      prepared.bodyFlipY,
    );
    const makeBase = (
      bounds: PictureEffectBounds,
      actualDensity: number,
      peak: number,
      textPlan?: ShapeTextPaintPlan,
    ): LeafBase => {
      const output = rasterBounds(bounds, actualDensity),
        width = output.right - output.left,
        height = output.bottom - output.top;
      return {
        ...prepared,
        bodyPlan,
        textPlan,
        textLayout: layout,
        actualDensity,
        textFollowsBodyProjection,
        logicalBounds: {
          left: output.left / actualDensity,
          top: output.top / actualDensity,
          right: output.right / actualDensity,
          bottom: output.bottom / actualDensity,
        },
        outputBoundsRaster: output,
        widthRaster: width,
        heightRaster: height,
        estimatedPeakBytes: peak,
        ownedBytes: width * height * 4,
      };
    };
    if (bodyPlan.kind === "unavailable" || missingText.length)
      return {
        ...makeBase(baseBounds, bodyPlan.actualDensity, bodyPlan.estimatedPeakBytes),
        kind: "unavailable",
        reason: "asset-unavailable",
        missingAssetIds: Object.freeze([
          ...new Set([
            ...(bodyPlan.kind === "unavailable" ? bodyPlan.missingAssetIds : []),
            ...missingText,
          ]),
        ]),
      };
    if (!resolvedLayout) {
      try {
        layout = textLayout(options, prepared);
      } catch (error) {
        if (
          !(error instanceof ShapeTextRuntimeError) ||
          !["font-not-ready", "unavailable-text-rect"].includes(error.code)
        )
          throw error;
        return {
          ...makeBase(baseBounds, bodyPlan.actualDensity, bodyPlan.estimatedPeakBytes),
          kind: "unavailable",
          reason: "text-unavailable",
          missingAssetIds: [],
          message: error.message,
        };
      }
      resolvedLayout = true;
    }
    const textPlan = layout
      ? planShapeTextPaint({
          drawing: options.drawing,
          layout,
          density,
          resources: options.resources,
          angleDeg: options.angleDeg,
        })
      : undefined;
    const common = Math.min(
      bodyPlan.actualDensity,
      textPlan?.actualDensity ?? bodyPlan.actualDensity,
    );
    if (common < density * (1 - 1e-9)) {
      density = common;
      continue;
    }
    let bounds = baseBounds;
    if (textPlan) {
      try {
        bounds = union(
          bounds,
          projectedShapeTextBounds(
            textDrawing,
            textPlan,
            options.resources?.theme,
            options.groupScene,
          ),
        );
      } catch (error) {
        if (
          !(error instanceof RangeError) ||
          !error.message.includes("Projected shape text exceeds")
        )
          throw error;
        density *= 0.5;
        continue;
      }
    }
    const output = rasterBounds(bounds, common),
      width = output.right - output.left,
      height = output.bottom - output.top;
    const bodyBytes = bodyPlan.widthRaster * bodyPlan.heightRaster * 4,
      textBytes = textPlan ? textPlan.widthRaster * textPlan.heightRaster * 4 : 0,
      projectionBytes =
        textPlan && textFollowsBodyProjection ? width * height * 32 + textBytes * 2 : 0;
    const peak =
      bodyPlan.estimatedPeakBytes +
      (textPlan?.estimatedPeakBytes ?? 0) +
      bodyBytes +
      textBytes +
      projectionBytes +
      width * height * 8;
    const ratio = Math.min(
      1,
      SHAPE_LEAF_PIXELS_LIMITS.side / Math.max(width, height),
      Math.sqrt(SHAPE_LEAF_PIXELS_LIMITS.pixels / (width * height)),
      Math.sqrt(SHAPE_LEAF_PIXELS_LIMITS.memoryBytes / peak),
    );
    if (ratio < 1) {
      density *= ratio * 0.98;
      continue;
    }
    const base = makeBase(bounds, common, peak, textPlan);
    return textPlan?.kind === "unavailable"
      ? {
          ...base,
          kind: "unavailable",
          reason: textPlan.reason,
          missingAssetIds: textPlan.missingAssetIds,
        }
      : { ...base, kind: "ready" };
  }
  throw new RangeError("Shape leaf body/text union cannot satisfy its aggregate raster budget.");
}
let liveOwnedBytes = 0;
export function getShapeLeafPixelsOwnedBytes(): number {
  return liveOwnedBytes;
}
function cssSourcePainter(options: ShapeLeafPixelsOptions, plan: ShapeLeafPixelsPlan) {
  if (plan.renderPolicy !== "legacy-text-box") return undefined;
  return (context: CanvasRenderingContext2D) => {
    const drawing = options.drawing;
    if (drawing.fill !== "transparent") {
      context.fillStyle = drawing.fill;
      context.fillRect(0, 0, drawing.width, drawing.height);
    }
    if (drawing.stroke !== "transparent" && drawing.strokeWidth > 0) {
      context.fillStyle = drawing.stroke;
      for (const rect of plan.cssBorderRects ?? [])
        if (rect.width > 0 && rect.height > 0)
          context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  };
}
function compositePixels(
  target: ImageData,
  source: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
): void {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = left + x,
        dy = top + y;
      if (dx < 0 || dy < 0 || dx >= target.width || dy >= target.height)
        throw new RangeError("Projected glyph pixels exceed their preflight leaf union.");
      const from = (y * width + x) * 4,
        to = (dy * target.width + dx) * 4,
        alpha = source[from + 3]! / 255;
      if (alpha === 0) continue;
      const destAlpha = target.data[to + 3]! / 255,
        outAlpha = alpha + destAlpha * (1 - alpha);
      for (let channel = 0; channel < 3; channel++)
        target.data[to + channel] =
          (source[from + channel]! * alpha + target.data[to + channel]! * destAlpha * (1 - alpha)) /
          outAlpha;
      target.data[to + 3] = outAlpha * 255;
    }
}
/** Owns one independent entire-leaf raster. Only body paths are locally flipped;
 * readable glyphs retain their branch's semantics. No outer rotation or overall alpha is baked in. */
export function prepareShapeLeafPixels(options: ShapeLeafPixelsOptions): ShapeLeafPixelsResult {
  let plan = planShapeLeafPixels(options);
  if (plan.kind === "unavailable") return plan;
  const images = new Map<string, DecodedPicturePaintImage>();
  for (const id of new Set([...plan.bodyPlan.assetIds, ...(plan.textPlan?.assetIds ?? [])])) {
    const image = options.resources?.getAssetImage?.(id);
    if (image) images.set(id, image);
  }
  const missing = [
    ...new Set([...plan.bodyPlan.assetIds, ...(plan.textPlan?.assetIds ?? [])]),
  ].filter((id) => !images.has(id));
  if (missing.length)
    return { ...plan, kind: "unavailable", reason: "asset-unavailable", missingAssetIds: missing };
  const resources = { ...options.resources, getAssetImage: (id: string) => images.get(id) };
  for (let attempt = 0; attempt < 4; attempt++) {
    const owned = new Set<HTMLCanvasElement>();
    const make = () => {
      const canvas = options.canvasFactory?.() ?? document.createElement("canvas");
      if (owned.has(canvas) || [...images.values()].includes(canvas))
        throw new TypeError("Shape leaf canvas factory must return a fresh unowned Canvas.");
      owned.add(canvas);
      return canvas;
    };
    let text: ShapeTextPaintReady | undefined;
    let resultCanvas: HTMLCanvasElement | undefined;
    try {
      const body = prepareShapeDetailedPaint({
        drawing: bodyDrawing(options, plan.renderPolicy),
        geometry: options.connectorRoute
          ? options.connectorRoute.geometry
          : plan.bodyPlan.effectiveGeometry,
        connectorRoute: options.connectorRoute,
        style: plan.bodyPlan.effectiveStyle,
        density: plan.actualDensity,
        resources,
        angleDeg: options.angleDeg,
        sourceIdentity: options.sourceIdentity,
        groupScene: bodyGroupScene(options),
        sourcePainter: cssSourcePainter(options, plan),
        // A factory makes the body transient and explicitly ours. Cached bodies, if used
        // by other consumers, are never released or modified by this adapter.
        canvasFactory: make,
      });
      if (body.kind === "unavailable")
        return {
          ...plan,
          kind: "unavailable",
          reason: body.reason,
          missingAssetIds: body.missingAssetIds,
        };
      if (plan.textLayout) {
        const glyphs = prepareShapeTextPaint({
          drawing: options.drawing,
          layout: plan.textLayout,
          density: plan.actualDensity,
          resources,
          angleDeg: options.angleDeg,
          sourceIdentity: options.sourceIdentity,
          canvasFactory: make,
        });
        if (glyphs.kind === "unavailable")
          return {
            ...plan,
            kind: "unavailable",
            reason: glyphs.reason,
            missingAssetIds: glyphs.missingAssetIds,
          };
        text = glyphs;
      }
      const density = Math.min(body.actualDensity, text?.actualDensity ?? body.actualDensity);
      if (density < plan.actualDensity * (1 - 1e-9)) {
        plan = planShapeLeafPixels({ ...options, density });
        if (plan.kind === "unavailable") return plan;
        continue;
      }
      const layer = text
        ? projectShapeTextSurface(
            textProjectionDrawing(options, plan.richText),
            text,
            options.resources?.theme,
            options.groupScene,
          )
        : undefined;
      let actualBounds = union(
        plan.logicalBounds,
        flipBounds(body.logicalBounds, options.drawing, plan.bodyFlipX, plan.bodyFlipY),
      );
      if (layer && text)
        actualBounds = union(actualBounds, {
          left: layer.left / text.actualDensity,
          top: layer.top / text.actualDensity,
          right: (layer.left + layer.surface.width) / text.actualDensity,
          bottom: (layer.top + layer.surface.height) / text.actualDensity,
        });
      const actualOutput = rasterBounds(actualBounds, density),
        actualWidth = actualOutput.right - actualOutput.left,
        actualHeight = actualOutput.bottom - actualOutput.top;
      const actualPeak = Math.max(
        plan.estimatedPeakBytes,
        body.estimatedPeakBytes +
          (text?.estimatedPeakBytes ?? 0) +
          body.canvas.width * body.canvas.height * 4 +
          (text ? text.canvas.width * text.canvas.height * 4 : 0) +
          (layer ? layer.surface.data.byteLength * (plan.textFollowsBodyProjection ? 8 : 2) : 0) +
          actualWidth * actualHeight * 8,
      );
      const actualRatio = Math.min(
        1,
        SHAPE_LEAF_PIXELS_LIMITS.side / Math.max(actualWidth, actualHeight),
        Math.sqrt(SHAPE_LEAF_PIXELS_LIMITS.pixels / (actualWidth * actualHeight)),
        Math.sqrt(SHAPE_LEAF_PIXELS_LIMITS.memoryBytes / actualPeak),
      );
      if (actualRatio < 1) {
        plan = planShapeLeafPixels({ ...options, density: density * actualRatio * 0.98 });
        if (plan.kind === "unavailable") return plan;
        continue;
      }
      plan = {
        ...plan,
        actualDensity: density,
        outputBoundsRaster: actualOutput,
        widthRaster: actualWidth,
        heightRaster: actualHeight,
        logicalBounds: {
          left: actualOutput.left / density,
          top: actualOutput.top / density,
          right: actualOutput.right / density,
          bottom: actualOutput.bottom / density,
        },
        estimatedPeakBytes: actualPeak,
        ownedBytes: actualWidth * actualHeight * 4,
      };
      if (liveOwnedBytes + plan.ownedBytes > SHAPE_LEAF_PIXELS_LIMITS.memoryBytes)
        throw new RangeError("Live shape leaf canvases exceed their 64MiB ownership budget.");
      const canvas = make();
      canvas.width = plan.widthRaster;
      canvas.height = plan.heightRaster;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Actual shape leaf Canvas processing is unavailable.");
      context.save();
      context.translate(-plan.outputBoundsRaster.left, -plan.outputBoundsRaster.top);
      context.scale(density, density);
      context.translate(
        plan.bodyFlipX ? options.drawing.width : 0,
        plan.bodyFlipY ? options.drawing.height : 0,
      );
      context.scale(plan.bodyFlipX ? -1 : 1, plan.bodyFlipY ? -1 : 1);
      const bounds = body.logicalBounds;
      context.drawImage(
        body.canvas,
        bounds.left,
        bounds.top,
        bounds.right - bounds.left,
        bounds.bottom - bounds.top,
      );
      context.restore();
      if (layer && text) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        if (text.actualDensity === density) {
          compositePixels(
            pixels,
            layer.surface.data,
            layer.surface.width,
            layer.surface.height,
            layer.left - plan.outputBoundsRaster.left,
            layer.top - plan.outputBoundsRaster.top,
          );
        } else {
          const envelope = rasterBounds(
            {
              left: layer.left / text.actualDensity,
              top: layer.top / text.actualDensity,
              right: (layer.left + layer.surface.width) / text.actualDensity,
              bottom: (layer.top + layer.surface.height) / text.actualDensity,
            },
            density,
          );
          const w = envelope.right - envelope.left,
            h = envelope.bottom - envelope.top;
          const sampled = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              const sx = Math.floor(
                  ((envelope.left + x + 0.5) / density) * text.actualDensity - layer.left,
                ),
                sy = Math.floor(
                  ((envelope.top + y + 0.5) / density) * text.actualDensity - layer.top,
                );
              if (sx >= 0 && sy >= 0 && sx < layer.surface.width && sy < layer.surface.height)
                sampled.set(
                  layer.surface.data.subarray(
                    (sy * layer.surface.width + sx) * 4,
                    (sy * layer.surface.width + sx) * 4 + 4,
                  ),
                  (y * w + x) * 4,
                );
            }
          compositePixels(
            pixels,
            sampled,
            w,
            h,
            envelope.left - plan.outputBoundsRaster.left,
            envelope.top - plan.outputBoundsRaster.top,
          );
        }
        context.putImageData(pixels, 0, 0);
      }
      resultCanvas = canvas;
      liveOwnedBytes += plan.ownedBytes;
      let disposed = false;
      return {
        ...plan,
        canvas,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          liveOwnedBytes -= plan.ownedBytes;
          canvas.width = 0;
          canvas.height = 0;
        },
      };
    } finally {
      text?.dispose();
      for (const canvas of owned)
        if (canvas !== resultCanvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
    }
  }
  throw new RangeError("Actual shape leaf pixels cannot stabilize their bounded native density.");
}
