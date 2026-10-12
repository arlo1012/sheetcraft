import type {
  ShapeTextLayout as ShapeTextLayoutOptions,
  ShapeTextParagraph,
} from "@sheetcraft/core/shape-text";
import {
  getCellTextGraphemes,
  getCellTextWrapTokens,
  type AutoRowHeightFont,
  type TextMeasurer,
  type TextMeasurementMetrics,
} from "@sheetcraft/sheet-engine/text-layout";
import {
  getShapeTextVerticalOrientation,
  type ShapeTextVerticalOrientation,
} from "./shape-text-vertical-orientation";

export type ShapeTextRect = { x: number; y: number; width: number; height: number };
export type ShapeTextFont = AutoRowHeightFont;
export type ShapeTextMeasurementMetrics = TextMeasurementMetrics & {
  /** Signed horizontal ink extents relative to a left-aligned alphabetic baseline. */
  inkLeft?: number;
  inkRight?: number;
};
export type ShapeTextMeasurer = Omit<TextMeasurer, "measureMetrics"> & {
  measureMetrics?: (text: string, font: ShapeTextFont) => ShapeTextMeasurementMetrics;
};
export type ShapeTextNormalLineMetrics = {
  ascent: number;
  descent: number;
  lineAdvance: number;
};
export type ShapeTextLayoutInput = {
  text: string;
  /** Actual preset textRect or text-box frame, before physical margins. */
  textRect: ShapeTextRect | undefined;
  layout: ShapeTextLayoutOptions;
  paragraph: ShapeTextParagraph;
  font: ShapeTextFont;
  measurer: ShapeTextMeasurer;
  /** Resolved from the same ready font resource used by the painter. */
  normalLineMetrics: ShapeTextNormalLineMetrics;
  /** Defaults to 96/72; apply density here once, never again in margins. */
  pointsToPx?: number;
};
export type ShapeTextRun = {
  text: string;
  font: ShapeTextFont;
  direction: "ltr" | "rtl";
  /** Native left-aligned, alphabetic baseline; rotate around this origin. */
  x: number;
  y: number;
  angle: 0 | 90 | 180 | 270;
  advancePx: number;
  inlineAdvancePx: number;
  /** Resolved font metrics for decorations; per-glyph ink is in inkBounds. */
  ascentPx: number;
  descentPx: number;
  inkBounds: ShapeTextRect;
  verticalOrientation?: ShapeTextVerticalOrientation;
  /** UAX50 fallback: Tu stays upright; Tr rotates without a vertical alternate. */
  verticalGlyphFallback?: true;
};
export type ShapeTextLine = {
  /** Source text remains intact, including spaces and trailing blank paragraphs. */
  text: string;
  paragraphIndex: number;
  paragraphEnd: boolean;
  inlineStart: number;
  blockStart: number;
  inlineExtent: number;
  blockAdvance: number;
  rect: ShapeTextRect;
  runs: ShapeTextRun[];
};
export type ShapeTextLayoutResult = {
  lines: ShapeTextLine[];
  runs: ShapeTextRun[];
  contentRect: ShapeTextRect;
  /** Outer actual textRect; margin space is available to glyph ink. */
  clipRect: ShapeTextRect | null;
  overflow: boolean;
  inkBounds: ShapeTextRect | null;
  visibleInkBounds: ShapeTextRect | null;
  inkBoundsAccuracy: "ink-metrics" | "advance-box";
  /** Physical width/height include margins; inline/block retain natural unclipped text extents. */
  requiredExtent: { width: number; height: number; inline: number; block: number };
  fits: boolean;
  measurementCount: number;
  /** A declared product policy, not a WPS CJK equivalence claim. */
  verticalGlyphPolicy: "unicode-17-uax50-fallback";
};
export type ShapeTextLayoutErrorCode =
  | "invalid-input"
  | "unavailable-text-rect"
  | "unavailable-metrics"
  | "unavailable-grapheme-segmentation"
  | "unavailable-script"
  | "layout-budget";
export class ShapeTextLayoutError extends Error {
  constructor(
    public readonly code: ShapeTextLayoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShapeTextLayoutError";
  }
}
export const SHAPE_TEXT_LAYOUT_LIMITS = {
  textUnits: 100_000,
  graphemes: 100_000,
  lines: 4_096,
  measurements: 100_000,
  measuredUnits: 2_000_000,
  cachedMeasurements: 8_192,
  cachedUnits: 200_000,
} as const;

type Metrics = ShapeTextMeasurementMetrics & { inkLeft: number; inkRight: number };
type Piece = {
  text: string;
  metrics: Metrics;
  inlineAdvance: number;
  upright: boolean;
  orientation?: ShapeTextVerticalOrientation;
};
type DraftLine = {
  text: string;
  paragraphIndex: number;
  paragraphEnd: boolean;
  pieces: Piece[];
  width: number;
  advance: number;
  blockStart: number;
  baselineAscent: number;
  baselineDescent: number;
};
const RTL_PATTERN =
  /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u200e\u200f\u202a-\u202e\u2066-\u206f\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;
const STACKED_COMPLEX_PATTERN =
  /[\u0590-\u0fff\u1000-\u109f\u1780-\u18af\ua800-\ua8ff\u{11000}-\u{11fff}\u{1e800}-\u{1efff}]/u;
const UNSUPPORTED_VERTICAL_SCRIPT = /[\u1680-\u169f\u{10c00}-\u{10c4f}]/u;
function fail(code: ShapeTextLayoutErrorCode, message: string): never {
  throw new ShapeTextLayoutError(code, message);
}
function validNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
export function getShapeTextNativeDirection(text: string): "ltr" | "rtl" {
  // First strong characters set the native paragraph base direction.

  for (const scalar of text) {
    if (scalar === "\u200f" || scalar === "\u061c") return "rtl";
    if (scalar === "\u200e") return "ltr";
    if (/\p{Letter}/u.test(scalar)) return RTL_PATTERN.test(scalar) ? "rtl" : "ltr";
  }
  return "ltr";
}
/** Same resolved CSS family stack for measurement and painting. */
export function shapeTextCanvasFont(font: ShapeTextFont): string {
  const family = font.family.includes(",") ? font.family : JSON.stringify(font.family);
  return `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${family}`;
}
function union(left: ShapeTextRect | null, right: ShapeTextRect): ShapeTextRect {
  if (!left) return { ...right };
  const x = Math.min(left.x, right.x),
    y = Math.min(left.y, right.y);
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  };
}
function intersection(left: ShapeTextRect | null, right: ShapeTextRect): ShapeTextRect | null {
  if (!left) return null;
  const x = Math.max(left.x, right.x),
    y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  return endX > x && endY > y ? { x, y, width: endX - x, height: endY - y } : null;
}
function rotatedInk(x: number, y: number, angle: 0 | 90 | 270, m: Metrics): ShapeTextRect {
  if (angle === 0)
    return {
      x: x + m.inkLeft,
      y: y - m.ascent,
      width: m.inkRight - m.inkLeft,
      height: m.ascent + m.descent,
    };
  if (angle === 90)
    return {
      x: x - m.descent,
      y: y + m.inkLeft,
      width: m.ascent + m.descent,
      height: m.inkRight - m.inkLeft,
    };
  return {
    x: x - m.ascent,
    y: y - m.inkRight,
    width: m.ascent + m.descent,
    height: m.inkRight - m.inkLeft,
  };
}

/**
 * Numeric, transient uniform shape text layout. The measurer and painter must use
 * the same native shaping/font resource. No drawing mutation, 2D rotation, body
 * projection, font loading, DOM ownership or AutoFit solving occurs here.
 *
 * Wrapping searches whole shaped ranges with exponential then binary probes. It
 * never measures every growing prefix. Hard paragraphs and grapheme boundaries
 * are preserved, and exhausting a budget throws rather than truncating output.
 */
export function layoutShapeText(input: ShapeTextLayoutInput): ShapeTextLayoutResult {
  const { text, layout, paragraph, measurer, normalLineMetrics: normal } = input;
  const font = { ...input.font };
  const scale = input.pointsToPx ?? 96 / 72;
  if (typeof text !== "string" || text.length > SHAPE_TEXT_LAYOUT_LIMITS.textUnits)
    fail("layout-budget", "Shape text exceeds the 100000 UTF-16-unit layout budget.");
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 16 ||
    !font.family ||
    !Number.isFinite(font.size) ||
    font.size <= 0 ||
    font.size > 512 ||
    ![400, 700].includes(font.weight) ||
    typeof font.italic !== "boolean"
  )
    fail("invalid-input", "Shape text requires a resolved valid font and unit scale.");
  if (
    ![normal.ascent, normal.descent].every(validNonnegative) ||
    normal.ascent + normal.descent <= 0 ||
    !Number.isFinite(normal.ascent + normal.descent) ||
    !Number.isFinite(normal.lineAdvance) ||
    normal.lineAdvance <= 0
  )
    fail("unavailable-metrics", "Ready-font ascent, descent and normal line advance are required.");
  const rect = input.textRect;
  if (
    !rect ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.width > 16384 ||
    rect.height > 16384
  )
    fail("unavailable-text-rect", "The shape has no usable bounded text rectangle.");
  const margins = layout.marginsPt;
  if (
    ![
      margins.leftPt,
      margins.rightPt,
      margins.topPt,
      margins.bottomPt,
      paragraph.beforePt,
      paragraph.afterPt,
    ].every((n) => validNonnegative(n) && n <= 4096)
  )
    fail("invalid-input", "Physical margins and paragraph spacing must be finite bounded points.");
  if (
    !Number.isFinite(paragraph.lineSpacing.kind === "exact" ? paragraph.lineSpacing.pt : 1) ||
    (paragraph.lineSpacing.kind === "exact" &&
      (paragraph.lineSpacing.pt <= 0 || paragraph.lineSpacing.pt > 4096))
  )
    fail("invalid-input", "Exact line advance must be positive and bounded.");
  if (typeof Intl.Segmenter !== "function")
    fail(
      "unavailable-grapheme-segmentation",
      "Full grapheme segmentation is required for shape text layout.",
    );
  if (/[\ud800-\udfff]/u.test(text))
    fail("invalid-input", "Shape text contains an unpaired UTF-16 surrogate.");
  if (
    !["horizontal", "vertical-rl", "vertical-lr", "rotate-90", "rotate-270", "stacked"].includes(
      layout.direction,
    ) ||
    !["start", "center", "end"].includes(layout.blockAlignment) ||
    !["rtl", "ltr"].includes(layout.lineOrder) ||
    !["left", "center", "right", "justify"].includes(paragraph.alignment) ||
    !["normal", "exact"].includes(paragraph.lineSpacing.kind) ||
    typeof layout.wrap !== "boolean" ||
    typeof layout.overflow !== "boolean"
  )
    fail("invalid-input", "Shape text contains invalid resolved layout options.");
  const mode = layout.direction;
  const horizontal = mode === "horizontal";
  const mixed = mode === "vertical-rl" || mode === "vertical-lr";
  const stacked = mode === "stacked";
  const rtlColumns =
    mode === "vertical-rl" || mode === "rotate-90" || (stacked && layout.lineOrder === "rtl");
  if (stacked && STACKED_COMPLEX_PATTERN.test(text))
    fail(
      "unavailable-script",
      "Stacked cursive or bidirectional text requires a native upright-script layout adapter.",
    );
  if (mixed && UNSUPPORTED_VERTICAL_SCRIPT.test(text))
    fail(
      "unavailable-script",
      "This script requires vertical shaping not available to the numeric adapter.",
    );
  const left = margins.leftPt * scale,
    right = margins.rightPt * scale;
  const top = margins.topPt * scale,
    bottom = margins.bottomPt * scale;
  const contentRect = {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
  const inlineAvailable = horizontal ? contentRect.width : contentRect.height;
  const blockAvailable = horizontal ? contentRect.height : contentRect.width;
  if (inlineAvailable <= 0)
    fail("unavailable-text-rect", "Margins leave no positive inline extent for text.");
  let measurementCount = 0,
    measuredUnits = 0,
    cachedUnits = 0,
    graphemeCount = 0;
  let inkAccurate = Boolean(measurer.measureMetrics);
  let layoutUnits = 0;
  const cache = new Map<string, Metrics>();
  const measure = (value: string): Metrics => {
    const cached = cache.get(value);
    if (cached) return cached;
    if (
      ++measurementCount > SHAPE_TEXT_LAYOUT_LIMITS.measurements ||
      (measuredUnits += value.length) > SHAPE_TEXT_LAYOUT_LIMITS.measuredUnits
    )
      fail("layout-budget", "Shape text exhausted its bounded native measurement budget.");
    let raw: ShapeTextMeasurementMetrics | undefined;
    let width: number;
    try {
      raw = measurer.measureMetrics?.(value, font);
      width = raw ? raw.width : measurer.measure(value, font);
    } catch {
      fail("unavailable-metrics", "Native metrics are unavailable for the resolved shape font.");
    }
    if (
      !validNonnegative(width!) ||
      (raw &&
        (!validNonnegative(raw.ascent) ||
          !validNonnegative(raw.descent) ||
          !Number.isFinite(raw.ascent + raw.descent)))
    )
      fail("unavailable-metrics", "Native text measurement returned invalid extents.");
    const exactInk = raw?.inkLeft !== undefined && raw.inkRight !== undefined;
    if (
      exactInk &&
      (!Number.isFinite(raw!.inkLeft) ||
        !Number.isFinite(raw!.inkRight) ||
        raw!.inkRight! < raw!.inkLeft! ||
        !Number.isFinite(raw!.inkRight! - raw!.inkLeft!))
    )
      fail("unavailable-metrics", "Native text ink bounds are invalid.");
    if (!exactInk) inkAccurate = false;
    const result: Metrics = {
      width: width!,
      ascent: raw?.ascent ?? normal.ascent,
      descent: raw?.descent ?? normal.descent,
      inkLeft: exactInk ? raw!.inkLeft! : 0,
      inkRight: exactInk ? raw!.inkRight! : width!,
    };
    if (value.length <= SHAPE_TEXT_LAYOUT_LIMITS.cachedUnits) {
      while (
        cache.size >= SHAPE_TEXT_LAYOUT_LIMITS.cachedMeasurements ||
        cachedUnits + value.length > SHAPE_TEXT_LAYOUT_LIMITS.cachedUnits
      ) {
        const oldest = cache.keys().next().value as string;
        cache.delete(oldest);
        cachedUnits -= oldest.length;
      }
      cache.set(value, result);
      cachedUnits += value.length;
    }
    return result;
  };
  const piecesFor = (value: string): Piece[] => {
    if (!value) return [];
    if ((layoutUnits += value.length) > SHAPE_TEXT_LAYOUT_LIMITS.measuredUnits * 2)
      fail("layout-budget", "Shape text exhausted its bounded segmentation work budget.");
    if (!mixed && !stacked) {
      const metrics = measure(value);
      return [{ text: value, metrics, inlineAdvance: metrics.width, upright: false }];
    }
    const pieces: Piece[] = [];
    let sideways = "";
    const flush = () => {
      if (!sideways) return;
      const metrics = measure(sideways);
      pieces.push({
        text: sideways,
        metrics,
        inlineAdvance: metrics.width,
        upright: false,
        orientation: "R",
      });
      sideways = "";
    };
    for (const cluster of getCellTextGraphemes(value)) {
      const orientation = getShapeTextVerticalOrientation(cluster.codePointAt(0)!);
      const upright = stacked || orientation === "U" || orientation === "Tu";
      if (!upright && orientation === "R") {
        sideways += cluster;
        continue;
      }
      flush();
      const metrics = measure(cluster);
      pieces.push({
        text: cluster,
        metrics,
        inlineAdvance: upright ? normal.lineAdvance : metrics.width,
        upright,
        orientation,
      });
    }
    flush();
    if (mixed && pieces.some((piece) => piece.upright && STACKED_COMPLEX_PATTERN.test(piece.text)))
      fail(
        "unavailable-script",
        "Upright complex-script graphemes require native vertical shaping.",
      );
    if (mixed && RTL_PATTERN.test(value) && pieces.some((piece) => piece.upright))
      fail(
        "unavailable-script",
        "Mixed upright and bidirectional vertical runs require a native bidi layout adapter.",
      );
    return pieces;
  };
  const draftLines: DraftLine[] = [];
  let blockCursor = 0,
    maxInline = 0;
  const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const source = paragraphs[paragraphIndex]!;
    const clusters = getCellTextGraphemes(source);
    graphemeCount += clusters.length;
    if (graphemeCount > SHAPE_TEXT_LAYOUT_LIMITS.graphemes)
      fail("layout-budget", "Shape text exceeds its grapheme budget.");
    const offsets = [0];
    for (const cluster of clusters) offsets.push(offsets.at(-1)! + cluster.length);
    const breaks = new Set<number>();
    let tokenOffset = 0;
    for (const token of getCellTextWrapTokens(source)) {
      tokenOffset += token.length;
      breaks.add(tokenOffset);
    }
    const range = (start: number, end: number) => source.slice(offsets[start]!, offsets[end]!);
    const widthOf = (start: number, end: number) =>
      piecesFor(range(start, end)).reduce((sum, piece) => sum + piece.inlineAdvance, 0);
    const append = (start: number, end: number, paragraphEnd: boolean) => {
      if (draftLines.length >= SHAPE_TEXT_LAYOUT_LIMITS.lines)
        fail("layout-budget", "Shape text exceeds 4096 output lines.");
      const value = range(start, end),
        pieces = piecesFor(value);
      let width = pieces.reduce((sum, piece) => sum + piece.inlineAdvance, 0);
      if (paragraph.alignment === "justify" && !paragraphEnd && width < inlineAvailable) {
        if (RTL_PATTERN.test(value))
          fail(
            "unavailable-script",
            "Expanded bidi justification requires a native paragraph layout adapter.",
          );
        const matches = [...value.matchAll(/[ \t]+/gu)].filter(
          (match) => match.index! > 0 && match.index! + match[0].length < value.length,
        );
        if (matches.length) {
          const justified: Piece[] = [];
          let cursor = 0;
          const gaps: number[] = [];
          for (const match of matches) {
            justified.push(...piecesFor(value.slice(cursor, match.index!)));
            const gap = piecesFor(match[0]);
            if (gap.length) gaps.push(justified.length + gap.length - 1);
            justified.push(...gap);
            cursor = match.index! + match[0].length;
          }
          justified.push(...piecesFor(value.slice(cursor)));
          const nativeWidth = justified.reduce((sum, piece) => sum + piece.inlineAdvance, 0);
          if (nativeWidth > inlineAvailable)
            fail(
              "unavailable-metrics",
              "Native justification cannot fit the shaped word segments.",
            );
          const extra = (inlineAvailable - nativeWidth) / gaps.length;
          for (const gap of gaps) justified[gap]!.inlineAdvance += extra;
          pieces.splice(0, pieces.length, ...justified);
          width = pieces.reduce((sum, piece) => sum + piece.inlineAdvance, 0);
        } else if (!matches.length) {
          const clusters = getCellTextGraphemes(value);
          const cjk = (cluster: string) =>
            /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
              cluster,
            );
          // Pure CJK lines use inter-character gaps. Keep horizontal-only words
          // intact: breaking a native word to imitate tracking would lose shaping.
          if (
            clusters.length > 1 &&
            clusters.some(cjk) &&
            clusters.every(
              (cluster) =>
                cjk(cluster) ||
                (/\p{Punctuation}/u.test(cluster) &&
                  getShapeTextVerticalOrientation(cluster.codePointAt(0)!) !== "R"),
            )
          ) {
            const justified = clusters.flatMap(piecesFor);
            const nativeWidth = justified.reduce((sum, piece) => sum + piece.inlineAdvance, 0);
            if (nativeWidth > inlineAvailable)
              fail(
                "unavailable-metrics",
                "Native inter-character justification cannot fit the shaped clusters.",
              );
            const extra = (inlineAvailable - nativeWidth) / (justified.length - 1);
            for (let index = 0; index < justified.length - 1; index++)
              justified[index]!.inlineAdvance += extra;
            pieces.splice(0, pieces.length, ...justified);
            width = pieces.reduce((sum, piece) => sum + piece.inlineAdvance, 0);
          }
        }
      }
      // Glyph ink extents never establish independent baselines for words.
      const baselineAscent = pieces.reduce(
        (value, piece) => (piece.upright ? value : Math.max(value, piece.metrics.ascent)),
        normal.ascent,
      );
      const baselineDescent = pieces.reduce(
        (value, piece) => (piece.upright ? value : Math.max(value, piece.metrics.descent)),
        normal.descent,
      );
      const inkThickness = pieces.reduce(
        (extent, piece) => Math.max(extent, piece.upright ? piece.metrics.width : 0),
        baselineAscent + baselineDescent,
      );
      const advance =
        paragraph.lineSpacing.kind === "exact"
          ? paragraph.lineSpacing.pt * scale
          : Math.max(normal.lineAdvance, inkThickness);
      draftLines.push({
        text: value,
        paragraphIndex,
        paragraphEnd,
        pieces,
        width,
        advance,
        blockStart: blockCursor,
        baselineAscent,
        baselineDescent,
      });
      blockCursor += advance;
      maxInline = Math.max(maxInline, width);
    };
    blockCursor += paragraph.beforePt * scale;
    if (!layout.wrap || clusters.length === 0 || widthOf(0, clusters.length) <= inlineAvailable) {
      append(0, clusters.length, true);
    } else {
      let start = 0,
        nextProbe = 1;
      while (start < clusters.length) {
        let fitting = start,
          probe = nextProbe,
          exceeding = clusters.length;
        while (
          start + probe < clusters.length &&
          widthOf(start, start + probe) <= inlineAvailable
        ) {
          fitting = start + probe;
          probe *= 2;
        }
        exceeding = Math.min(clusters.length, start + probe);
        if (widthOf(start, exceeding) <= inlineAvailable) fitting = exceeding;
        else {
          let low = fitting + 1,
            high = exceeding - 1;
          while (low <= high) {
            const middle = (low + high) >>> 1;
            if (widthOf(start, middle) <= inlineAvailable) {
              fitting = middle;
              low = middle + 1;
            } else high = middle - 1;
          }
        }
        // A single oversize cluster stays intact and may overflow; it is never split.
        if (fitting === start) fitting = start + 1;
        nextProbe = Math.max(1, fitting - start);
        let end = fitting;
        if (fitting < clusters.length) {
          for (let candidate = fitting; candidate > start; candidate--) {
            if (breaks.has(offsets[candidate]!)) {
              end = candidate;
              break;
            }
          }
        }
        append(start, end, end === clusters.length);
        start = end;
      }
    }
    blockCursor += paragraph.afterPt * scale;
  }
  const blockOffset =
    layout.blockAlignment === "center"
      ? (blockAvailable - blockCursor) / 2
      : layout.blockAlignment === "end"
        ? blockAvailable - blockCursor
        : 0;
  const lines: ShapeTextLine[] = [],
    runs: ShapeTextRun[] = [];
  let inkBounds: ShapeTextRect | null = null;
  let naturalInlineMin = 0,
    naturalInlineMax = maxInline,
    naturalBlockMin = 0,
    naturalBlockMax = blockCursor;
  for (const line of draftLines) {
    const inlineStart =
      paragraph.alignment === "center"
        ? (inlineAvailable - line.width) / 2
        : paragraph.alignment === "right"
          ? inlineAvailable - line.width
          : 0;
    const v = line.blockStart + blockOffset;
    const rectForLine: ShapeTextRect = horizontal
      ? {
          x: contentRect.x + inlineStart,
          y: contentRect.y + v,
          width: line.width,
          height: line.advance,
        }
      : {
          x: rtlColumns ? contentRect.x + contentRect.width - v - line.advance : contentRect.x + v,
          y:
            mode === "rotate-270"
              ? contentRect.y + contentRect.height - inlineStart - line.width
              : contentRect.y + inlineStart,
          width: line.advance,
          height: line.width,
        };
    const lineRuns: ShapeTextRun[] = [];
    let inlineCursor = 0;
    for (const piece of line.pieces) {
      const m = piece.metrics,
        u = inlineStart + inlineCursor;
      const leading = (line.advance - line.baselineAscent - line.baselineDescent) / 2;
      let x: number, y: number, angle: 0 | 90 | 270;
      if (horizontal) {
        x = contentRect.x + u;
        y = contentRect.y + v + leading + line.baselineAscent;
        angle = 0;
      } else if (piece.upright) {
        const center = rtlColumns
          ? contentRect.x + contentRect.width - v - line.advance / 2
          : contentRect.x + v + line.advance / 2;
        x = center - m.width / 2;
        y =
          contentRect.y +
          u +
          (normal.lineAdvance - normal.ascent - normal.descent) / 2 +
          normal.ascent;
        angle = 0;
      } else if (mode === "rotate-270") {
        x = contentRect.x + v + leading + line.baselineAscent;
        y = contentRect.y + contentRect.height - u;
        angle = 270;
      } else {
        x = rtlColumns
          ? contentRect.x + contentRect.width - v - leading - line.baselineAscent
          : contentRect.x + v + leading + line.baselineDescent;
        y = contentRect.y + u;
        angle = 90;
      }
      const runInk = rotatedInk(x, y, angle, m);
      const run: ShapeTextRun = {
        text: piece.text,
        font: { ...font },
        direction: getShapeTextNativeDirection(piece.text),
        x,
        y,
        angle,
        advancePx: !piece.upright && !/\S/u.test(piece.text) ? piece.inlineAdvance : m.width,
        inlineAdvancePx: piece.inlineAdvance,
        ascentPx: normal.ascent,
        descentPx: normal.descent,
        inkBounds: runInk,
        ...(piece.orientation ? { verticalOrientation: piece.orientation } : {}),
        ...(mixed && (piece.orientation === "Tu" || piece.orientation === "Tr")
          ? { verticalGlyphFallback: true as const }
          : {}),
      };
      lineRuns.push(run);
      runs.push(run);
      if (/\S/u.test(piece.text) && runInk.width > 0 && runInk.height > 0)
        inkBounds = union(inkBounds, runInk);
      // Natural requirements ignore alignment offsets and painting permission.
      const inlineInkMin = piece.upright
        ? inlineCursor +
          (normal.lineAdvance - normal.ascent - normal.descent) / 2 +
          normal.ascent -
          m.ascent
        : inlineCursor + m.inkLeft;
      const inlineInkMax = piece.upright
        ? inlineInkMin + m.ascent + m.descent
        : inlineCursor + m.inkRight;
      const blockInkMin = piece.upright
        ? line.blockStart +
          (rtlColumns
            ? (line.advance + m.width) / 2 - m.inkRight
            : (line.advance - m.width) / 2 + m.inkLeft)
        : line.blockStart + leading + line.baselineAscent - m.ascent;
      const blockInkMax = piece.upright
        ? line.blockStart +
          (rtlColumns
            ? (line.advance + m.width) / 2 - m.inkLeft
            : (line.advance - m.width) / 2 + m.inkRight)
        : blockInkMin + m.ascent + m.descent;
      naturalInlineMin = Math.min(naturalInlineMin, inlineInkMin);
      naturalInlineMax = Math.max(naturalInlineMax, inlineInkMax);
      naturalBlockMin = Math.min(naturalBlockMin, blockInkMin);
      naturalBlockMax = Math.max(naturalBlockMax, blockInkMax);
      inlineCursor += piece.inlineAdvance;
    }
    lines.push({
      text: line.text,
      paragraphIndex: line.paragraphIndex,
      paragraphEnd: line.paragraphEnd,
      inlineStart,
      blockStart: v,
      inlineExtent: line.width,
      blockAdvance: line.advance,
      rect: rectForLine,
      runs: lineRuns,
    });
  }
  const inline = naturalInlineMax - naturalInlineMin,
    block = naturalBlockMax - naturalBlockMin;
  // Margins constrain logical advances; they remain available to glyph ink.
  // Reuse that reserved space instead of adding the same overhang outside it.
  const inlineStartMargin = horizontal ? left : mode === "rotate-270" ? bottom : top;
  const inlineEndMargin = horizontal ? right : mode === "rotate-270" ? top : bottom;
  const blockStartMargin = horizontal ? top : rtlColumns ? right : left;
  const blockEndMargin = horizontal ? bottom : rtlColumns ? left : right;
  const requiredInline =
    Math.max(
      maxInline + inlineStartMargin + inlineEndMargin,
      naturalInlineMax + inlineStartMargin,
    ) - Math.min(0, naturalInlineMin + inlineStartMargin);
  const requiredBlock =
    Math.max(blockCursor + blockStartMargin + blockEndMargin, naturalBlockMax + blockStartMargin) -
    Math.min(0, naturalBlockMin + blockStartMargin);
  const requiredExtent = {
    inline,
    block,
    width: horizontal ? requiredInline : requiredBlock,
    height: horizontal ? requiredBlock : requiredInline,
  };
  if (
    !Object.values(requiredExtent).every(Number.isFinite) ||
    (inkBounds && !Object.values(inkBounds).every(Number.isFinite)) ||
    runs.some(
      (run) =>
        ![run.x, run.y, run.advancePx, run.inlineAdvancePx, ...Object.values(run.inkBounds)].every(
          Number.isFinite,
        ),
    )
  )
    fail("unavailable-metrics", "Native metrics produced non-finite numeric layout extents.");
  const containsInk =
    !inkBounds ||
    (inkBounds.x >= rect.x - 1e-7 &&
      inkBounds.y >= rect.y - 1e-7 &&
      inkBounds.x + inkBounds.width <= rect.x + rect.width + 1e-7 &&
      inkBounds.y + inkBounds.height <= rect.y + rect.height + 1e-7);
  return {
    lines,
    runs,
    contentRect,
    clipRect: layout.overflow ? null : { ...rect },
    overflow: layout.overflow,
    inkBounds,
    visibleInkBounds: layout.overflow
      ? inkBounds && { ...inkBounds }
      : intersection(inkBounds, rect),
    inkBoundsAccuracy: inkAccurate ? "ink-metrics" : "advance-box",
    requiredExtent,
    fits:
      containsInk && maxInline <= inlineAvailable + 1e-7 && blockCursor <= blockAvailable + 1e-7,
    measurementCount,
    verticalGlyphPolicy: "unicode-17-uax50-fallback",
  };
}
