import { normalizeSheetDrawing, type SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  cloneShapeText,
  type ShapeTextLayout,
  type ShapeTextParagraph,
} from "@sheetcraft/core/shape-text";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
  getCellFontResourceStatus,
} from "../../shared/cell-text/font-resources";
import { cellTextFontRevision } from "../../shared/cell-text/text-metrics";
import { getDrawingShapeGeometry } from "./shape-geometry";
import { getLegacyShapeGeometry } from "./legacy-shape-geometry";
import {
  layoutShapeText,
  type ShapeTextFont,
  type ShapeTextLayoutResult,
  type ShapeTextMeasurer,
  type ShapeTextNormalLineMetrics,
  type ShapeTextRect,
} from "./shape-text-layout";
import {
  getBrowserShapeTextMeasurement,
  type ShapeTextNormalMetricPolicy,
} from "./shape-text-measure";
import {
  getDrawingShapeTextFamily,
  materializeDrawingShapeText,
  withDrawingShapeText,
} from "./shape-text-options";

export type ShapeTextRuntimeErrorCode =
  | "unsupported-drawing"
  | "invalid-input"
  | "font-not-ready"
  | "unavailable-text-rect"
  | "autofit-no-fit"
  | "autofit-budget";
export class ShapeTextRuntimeError extends Error {
  constructor(
    public readonly code: ShapeTextRuntimeErrorCode,
    message: string,
    public readonly family?: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ShapeTextRuntimeError";
  }
}
export type DrawingShapeTextRuntimeOptions = {
  /** Both injected fields are required together; no canvas/approximate fallback. */
  measurer?: ShapeTextMeasurer;
  normalLineMetrics?: ShapeTextNormalLineMetrics;
  normalLineMetricPolicy?: ShapeTextNormalMetricPolicy;
  pointsToPx?: number;
  /** A caller with a different geometry adapter can supply its actual local rect. */
  getTextRect?: (drawing: SheetGraphicDrawing) => ShapeTextRect | undefined;
};
export type ResolvedDrawingShapeText = {
  drawing: SheetGraphicDrawing;
  text: string;
  textRect: ShapeTextRect;
  layoutOptions: ShapeTextLayout;
  paragraph: ShapeTextParagraph;
  font: ShapeTextFont;
  measurer: ShapeTextMeasurer;
  normalLineMetrics: ShapeTextNormalLineMetrics;
  normalLineMetricPolicy: ShapeTextNormalMetricPolicy;
  /** Genuine ready-resource/loadingdone revision; reading never changes geometry. */
  fontRevision: number;
  pointsToPx: number;
};
function assertTextDrawing(drawing: SheetGraphicDrawing): void {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new ShapeTextRuntimeError(
      "unsupported-drawing",
      "Shape text is available only on a shape or text box.",
    );
}
function assertFontReady(drawing: SheetGraphicDrawing): void {
  for (const family of getCellFontResourceFamilies(getDrawingShapeTextFamily(drawing))) {
    const status = getCellFontResourceStatus(family);
    if (status.state !== "ready")
      throw new ShapeTextRuntimeError(
        "font-not-ready",
        `The shape-text font resource ${family} is ${status.state}.`,
        family,
        status.error,
      );
  }
}
/** Explicit loading of packaged/persisted aliases only, never queryLocalFonts. */
export async function ensureDrawingShapeTextFont(drawing: SheetGraphicDrawing): Promise<void> {
  assertTextDrawing(drawing);
  await Promise.all(
    getCellFontResourceFamilies(getDrawingShapeTextFamily(drawing)).map(ensureCellFontResource),
  );
  assertFontReady(drawing);
}
export function getDrawingShapeTextRect(drawing: SheetGraphicDrawing): ShapeTextRect | undefined {
  assertTextDrawing(drawing);
  if (drawing.kind === "textBox")
    return { x: 0, y: 0, width: drawing.width, height: drawing.height };
  const geometry =
    getDrawingShapeGeometry(drawing) ??
    (!drawing.shapeGeometry && !drawing.shapePath
      ? getLegacyShapeGeometry(drawing.shape, drawing.width, drawing.height)
      : undefined);
  const rect = geometry?.textRect;
  return rect
    ? {
        x: drawing.shapeFlipX ? drawing.width - rect.right : rect.left,
        y: drawing.shapeFlipY ? drawing.height - rect.bottom : rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }
    : undefined;
}
function usableTextRect(rect: ShapeTextRect | undefined): rect is ShapeTextRect {
  return !!(
    rect &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.width <= SHAPE_TEXT_AUTOFIT_LIMITS.extentPx &&
    rect.height <= SHAPE_TEXT_AUTOFIT_LIMITS.extentPx
  );
}

/** Resolves transient effective options without persisting or migrating old data. */
export function resolveDrawingShapeText(
  drawing: SheetGraphicDrawing,
  options: DrawingShapeTextRuntimeOptions = {},
): ResolvedDrawingShapeText {
  assertTextDrawing(drawing);
  assertFontReady(drawing);
  const shapeText = materializeDrawingShapeText(drawing);
  const textRect = (options.getTextRect ?? getDrawingShapeTextRect)(drawing);
  if (!usableTextRect(textRect))
    throw new ShapeTextRuntimeError(
      "unavailable-text-rect",
      "This drawing has no usable bounded shape-text rectangle.",
    );
  const font: ShapeTextFont = {
    family: getDrawingShapeTextFamily(drawing),
    size: drawing.fontSize,
    weight: drawing.bold ? 700 : 400,
    italic: drawing.italic,
  };
  if (!!options.measurer !== !!options.normalLineMetrics)
    throw new ShapeTextRuntimeError(
      "invalid-input",
      "A native measurer and native normal-line metrics must be injected together.",
    );
  const browser = options.measurer ? undefined : getBrowserShapeTextMeasurement();
  const normal = options.normalLineMetrics
    ? {
        metrics: options.normalLineMetrics,
        policy: options.normalLineMetricPolicy ?? "provided-native",
      }
    : browser!.resolveNormalLineMetrics(font);
  return {
    drawing,
    text: drawing.text,
    textRect: { ...textRect },
    layoutOptions: shapeText.layout,
    paragraph: shapeText.paragraph,
    font,
    measurer: options.measurer ?? browser!.measurer,
    normalLineMetrics: { ...normal.metrics },
    normalLineMetricPolicy: normal.policy,
    fontRevision: cellTextFontRevision.value,
    pointsToPx: options.pointsToPx ?? 96 / 72,
  };
}
/** Reuse the actual layout for CSS and detailed text consumers. Glyphs never
 * receive the body's reflection; V turns the text inside its own local box. */
export function applyShapeTextVerticalFlip(
  drawing: Readonly<{ shapeFlipY?: true }>,
  textRect: ShapeTextRect,
  result: ShapeTextLayoutResult,
): ShapeTextLayoutResult {
  if (!drawing.shapeFlipY) return result;
  // Desktop vertical flip turns the readable text by 180 degrees rather than
  // mirroring glyphs. Horizontal flip only changes the asymmetric text rect.
  const cx = textRect.x + textRect.width / 2;
  const cy = textRect.y + textRect.height / 2;
  const rotateRect = (rect: ShapeTextRect): ShapeTextRect => ({
    ...rect,
    x: 2 * cx - rect.x - rect.width,
    y: 2 * cy - rect.y - rect.height,
  });
  const runs = result.runs.map((run) => ({
    ...run,
    x: 2 * cx - run.x,
    y: 2 * cy - run.y,
    angle: ((run.angle + 180) % 360) as typeof run.angle,
    inkBounds: rotateRect(run.inkBounds),
  }));
  const byRun = new Map(result.runs.map((run, index) => [run, runs[index]!]));
  return {
    ...result,
    runs,
    lines: result.lines.map((line) => ({
      ...line,
      rect: rotateRect(line.rect),
      runs: line.runs.map((run) => byRun.get(run)!),
    })),
    contentRect: rotateRect(result.contentRect),
    inkBounds: result.inkBounds ? rotateRect(result.inkBounds) : null,
    visibleInkBounds: result.visibleInkBounds ? rotateRect(result.visibleInkBounds) : null,
  };
}
function resolvedLayout(resolved: ResolvedDrawingShapeText): ShapeTextLayoutResult {
  return applyShapeTextVerticalFlip(
    resolved.drawing,
    resolved.textRect,
    layoutShapeText({ ...resolved, layout: resolved.layoutOptions }),
  );
}
export function layoutDrawingShapeText(
  drawing: SheetGraphicDrawing,
  options: DrawingShapeTextRuntimeOptions = {},
): ShapeTextLayoutResult {
  return resolvedLayout(resolveDrawingShapeText(drawing, options));
}

export const SHAPE_TEXT_AUTOFIT_LIMITS = {
  evaluations: 32,
  extentPx: 16384,
  minimumHeightPx: 1,
  refinementPx: 1 / 64,
} as const;
export type PrepareDrawingShapeTextCandidateOptions = DrawingShapeTextRuntimeOptions & {
  /** Set only for an explicit manual height edit, including numeric/drag resizing. */
  manualHeightChange?: boolean;
  /** Canonical owners validate their disposable views through an exact inverse. */
  normalizeView?: (drawing: SheetGraphicDrawing) => SheetGraphicDrawing;
};
export type PreparedDrawingShapeTextCandidate = {
  drawing: SheetGraphicDrawing;
  layout: ShapeTextLayoutResult;
  resized: boolean;
  evaluations: number;
};

/**
 * One pure, synchronous candidate for the owning Core command. It never writes
 * document state/history, starts loading, or watches/changes height during paint.
 * Width and sheet anchor stay fixed. The owner preserves its rotated local top
 * edge in sheet coordinates before committing this height and every text edit
 * together under the same owner CAS/history entry.
 *
 * Search samples the current height then doubles/halves to find a real fitting
 * bracket, refining only within a <=32-evaluation budget. The final returned
 * layout was measured at the exact returned height. Arbitrary preset textRect
 * functions may be non-monotonic; this deliberately makes no globally-minimal
 * height claim. A search with no verified fitting candidate fails explicitly.
 */
export function prepareDrawingShapeTextCandidate(
  drawing: SheetGraphicDrawing,
  options: PrepareDrawingShapeTextCandidateOptions = {},
): PreparedDrawingShapeTextCandidate {
  assertTextDrawing(drawing);
  const normalized = options.normalizeView
    ? options.normalizeView(drawing)
    : (normalizeSheetDrawing(drawing) as SheetGraphicDrawing);
  let candidate = drawing;
  if (options.manualHeightChange && normalized.shapeText?.layout.autoFit === "resize-shape") {
    const text = cloneShapeText(normalized.shapeText)!;
    text.layout.autoFit = "none";
    candidate = withDrawingShapeText(normalized, text);
  }
  // A validated unchanged source keeps its object identity. Core owns canonical
  // storage; normalizing for validation must not migrate a read-only old drawing.
  const initial = resolveDrawingShapeText(candidate, options);
  if (candidate.shapeText?.layout.autoFit !== "resize-shape")
    return { drawing: candidate, layout: resolvedLayout(initial), resized: false, evaluations: 1 };

  let evaluations = 1;
  type Evaluation = { drawing: SheetGraphicDrawing; layout: ShapeTextLayoutResult | null };
  const atRect = (next: SheetGraphicDrawing, rect: ShapeTextRect | undefined): Evaluation => {
    // Tiny geometry/margins can yield no positive rectangle. This is a sampled
    // non-fitting height, never a replacement rectangle or approximate layout.
    if (!usableTextRect(rect)) return { drawing: next, layout: null };
    const physicalInline =
      initial.layoutOptions.direction === "horizontal" ? rect.width : rect.height;
    const margins = initial.layoutOptions.marginsPt;
    const inlineMargins =
      initial.layoutOptions.direction === "horizontal"
        ? margins.leftPt + margins.rightPt
        : margins.topPt + margins.bottomPt;
    if (physicalInline <= inlineMargins * initial.pointsToPx)
      return { drawing: next, layout: null };
    return {
      drawing: next,
      layout: resolvedLayout({ ...initial, drawing: next, textRect: rect }),
    };
  };
  const evaluate = (height: number): Evaluation => {
    if (++evaluations > SHAPE_TEXT_AUTOFIT_LIMITS.evaluations)
      throw new ShapeTextRuntimeError(
        "autofit-budget",
        "Shape-text AutoFit exhausted its search budget.",
      );
    const next = height === candidate.height ? candidate : { ...candidate, height };
    return atRect(next, (options.getTextRect ?? getDrawingShapeTextRect)(next));
  };
  let fit = atRect(candidate, initial.textRect);
  let low: number;
  if (fit.layout?.fits) {
    let probe = candidate.height;
    low = SHAPE_TEXT_AUTOFIT_LIMITS.minimumHeightPx;
    while (probe > SHAPE_TEXT_AUTOFIT_LIMITS.minimumHeightPx) {
      probe = Math.max(SHAPE_TEXT_AUTOFIT_LIMITS.minimumHeightPx, probe / 2);
      const next = evaluate(probe);
      if (!next.layout?.fits) {
        low = probe;
        break;
      }
      fit = next;
    }
  } else {
    low = candidate.height;
    let probe = candidate.height;
    while (probe < SHAPE_TEXT_AUTOFIT_LIMITS.extentPx) {
      probe = Math.min(SHAPE_TEXT_AUTOFIT_LIMITS.extentPx, Math.max(probe + 1, probe * 2));
      const next = evaluate(probe);
      if (next.layout?.fits) {
        fit = next;
        break;
      }
      low = probe;
    }
    if (!fit.layout?.fits)
      throw new ShapeTextRuntimeError(
        "autofit-no-fit",
        "No verified fixed-width shape-text fit was found within the 16384px height bound.",
      );
  }
  while (
    fit.drawing.height - low > SHAPE_TEXT_AUTOFIT_LIMITS.refinementPx &&
    evaluations < SHAPE_TEXT_AUTOFIT_LIMITS.evaluations
  ) {
    const middle = (fit.drawing.height + low) / 2;
    const next = evaluate(middle);
    if (next.layout?.fits) fit = next;
    else low = middle;
  }
  // fit holds the native layout for exactly this already-normalized data except
  // bounded height. No deferred layout or second command can invalidate it.
  const final =
    fit.drawing.height === candidate.height
      ? candidate
      : options.normalizeView
        ? options.normalizeView(fit.drawing)
        : (normalizeSheetDrawing(fit.drawing) as SheetGraphicDrawing);
  return {
    drawing: final,
    layout: fit.layout!,
    resized: final.height !== drawing.height,
    evaluations,
  };
}
