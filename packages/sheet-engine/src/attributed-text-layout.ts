import { normalizeCellTextFontRuns, type CellTextDocument } from "@sheetcraft/core/text-font-runs";
import type { CellTextDirection } from "@sheetcraft/core/style";
import {
  getCellTextGraphemes,
  getCellTextWrapTokens,
  MAX_CELL_TEXT_LAYOUT_LINES,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "./text-layout.js";

export type AttributedTextSegment = {
  text: string;
  /** UTF-16 offsets into the original document, never a newline-normalized copy. */
  start: number;
  end: number;
  font: AutoRowHeightFont;
};

export type MeasuredAttributedTextSegment = AttributedTextSegment & {
  width: number;
  ascent?: number;
  descent?: number;
};

export type AttributedTextLine = {
  text: string;
  start: number;
  end: number;
  width: number;
  paragraphEnd: boolean;
  segments: MeasuredAttributedTextSegment[];
  /** Maximal segment extents. Omitted when the measurer does not provide valid extents. */
  ascent?: number;
  descent?: number;
};

type FontInterval = { start: number; end: number; font: AutoRowHeightFont };
type LayoutContext = {
  document: CellTextDocument;
  baseFont: AutoRowHeightFont;
  intervals: FontInterval[];
  boundaries: ReadonlySet<number>;
};

/** Without Intl.Segmenter, the shared fallback protects scalars, not full clusters. */
export function supportsAttributedGraphemeSegmentation(): boolean {
  return typeof Intl.Segmenter === "function";
}

/** Nominal leading is retained, but actual glyph extents may require a taller advance. */
export function getAttributedTextLineHeight(
  line: Pick<AttributedTextLine, "ascent" | "descent">,
  baseFont: AutoRowHeightFont,
  nominalLineHeight = 1.25,
): number {
  const ascent = Number.isFinite(line.ascent) && line.ascent! >= 0 ? line.ascent! : 0;
  const descent = Number.isFinite(line.descent) && line.descent! >= 0 ? line.descent! : 0;
  return Math.max(baseFont.size * nominalLineHeight, ascent + descent);
}

/**
 * A run only changes family; size, weight, and italic always inherit the cell font.
 * If scalar-safe stored runs divide a grapheme, the family at its leading scalar
 * governs the entire cluster. This avoids splitting combining/ZWJ shaping without
 * rewriting stored metadata. This partition is logical order, not a bidi algorithm.
 * Full cluster safety requires Intl.Segmenter; the inherited fallback is scalar-only.
 */
function createLayoutContext(
  document: CellTextDocument,
  baseFont: AutoRowHeightFont,
): LayoutContext {
  const runs = normalizeCellTextFontRuns(document.text, document.fontRuns) ?? [];
  const intervals: FontInterval[] = [];
  const boundaries = new Set<number>([0]);
  let start = 0;
  let runIndex = 0;
  for (const grapheme of getCellTextGraphemes(document.text)) {
    const end = start + grapheme.length;
    while (runIndex < runs.length && runs[runIndex]!.end <= start) runIndex++;
    const run = runs[runIndex];
    const family = run && run.start <= start ? run.fontFamily : baseFont.family;
    const previous = intervals.at(-1);
    if (previous?.font.family === family) previous.end = end;
    else intervals.push({ start, end, font: { ...baseFont, family } });
    boundaries.add(end);
    start = end;
  }
  return { document, baseFont, intervals, boundaries };
}

function assertRange(context: LayoutContext, start: number, end: number): void {
  if (start > end || !context.boundaries.has(start) || !context.boundaries.has(end)) {
    throw new RangeError(
      "Attributed text measurement ranges must be grapheme-aligned UTF-16 offsets.",
    );
  }
}

function getSegments(context: LayoutContext, start: number, end: number): AttributedTextSegment[] {
  // Locate the first intersecting interval without rescanning a large document for each line.
  let low = 0;
  let high = context.intervals.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (context.intervals[middle]!.end <= start) low = middle + 1;
    else high = middle;
  }
  const segments: AttributedTextSegment[] = [];
  for (let index = low; index < context.intervals.length; index++) {
    const interval = context.intervals[index]!;
    if (interval.start >= end) break;
    const segmentStart = Math.max(start, interval.start);
    const segmentEnd = Math.min(end, interval.end);
    segments.push({
      text: context.document.text.slice(segmentStart, segmentEnd),
      start: segmentStart,
      end: segmentEnd,
      font: interval.font,
    });
  }
  return segments;
}

/**
 * Complete effective-family segments, including inherited gaps, merged for shaping.
 * A run boundary inside a grapheme uses its leading scalar's family for the whole
 * cluster, leaving stored runs untouched. Full cluster safety requires Intl.Segmenter;
 * supportsAttributedGraphemeSegmentation reports when the scalar-only fallback applies.
 * Segments are logical-order spans; this function does not implement bidi layout.
 */
export function getAttributedTextSegments(
  document: CellTextDocument,
  baseFont: AutoRowHeightFont,
  start = 0,
  end = document.text.length,
): AttributedTextSegment[] {
  const context = createLayoutContext(document, baseFont);
  assertRange(context, start, end);
  return getSegments(context, start, end);
}

/**
 * Conservative native-layout signal for text using multiple effective families.
 * This is not a Unicode bidi algorithm or a Unicode-version conformance claim.
 * Inherited gaps and leading-grapheme family affinity match attributed measurement;
 * a family assigned only to CR/LF delimiters does not add an effective text family.
 */
export function requiresAttributedNativeBidiLayout(
  document: CellTextDocument,
  baseFont: AutoRowHeightFont,
  direction?: CellTextDirection,
): boolean {
  if (
    !document.fontRuns?.length ||
    (direction !== "rtl" &&
      !/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1efff}\u200e\u200f\u202a-\u202e\u2066-\u206f]/u.test(
        document.text,
      ))
  )
    return false;
  const families = new Set<string>();
  for (const segment of getAttributedTextSegments(document, baseFont)) {
    if (!segment.text.replace(/[\r\n]/gu, "")) continue;
    families.add(segment.font.family);
    if (families.size > 1) return true;
  }
  return false;
}

/**
 * Shared measured advances for renderer and automatic dimensions. Native
 * multi-family bidi paragraphs inherit one CSS line-height, so every estimated
 * line conservatively reserves the largest measured advance in that document.
 * Other attributed layouts retain per-line extents. Browser-native wrapping,
 * justification and rotated bounding boxes are not pixel-exact guarantees here.
 * Stacked glyph layouts use their own per-grapheme advances instead.
 */
export function getAttributedTextLayoutLineHeights(
  document: CellTextDocument,
  lines: readonly Pick<AttributedTextLine, "ascent" | "descent">[],
  baseFont: AutoRowHeightFont,
  nominalLineHeight = 1.25,
  direction?: CellTextDirection,
): number[] {
  const heights = lines.map((line) =>
    getAttributedTextLineHeight(line, baseFont, nominalLineHeight),
  );
  if (!requiresAttributedNativeBidiLayout(document, baseFont, direction)) return heights;
  const maximum = heights.reduce(
    (height, current) => Math.max(height, current),
    baseFont.size * nominalLineHeight,
  );
  return heights.map(() => maximum);
}

function measureRange(
  context: LayoutContext,
  start: number,
  end: number,
  measurer: TextMeasurer,
  paragraphEnd: boolean,
): AttributedTextLine {
  let width = 0;
  let ascent = 0;
  let descent = 0;
  let hasMetrics = Boolean(measurer.measureMetrics);
  const segments = getSegments(context, start, end).map((segment) => {
    const metrics = measurer.measureMetrics?.(segment.text, segment.font);
    const segmentWidth =
      metrics && Number.isFinite(metrics.width)
        ? metrics.width
        : measurer.measure(segment.text, segment.font);
    const validExtents = Boolean(
      metrics &&
      Number.isFinite(metrics.ascent) &&
      metrics.ascent >= 0 &&
      Number.isFinite(metrics.descent) &&
      metrics.descent >= 0,
    );
    if (validExtents) {
      ascent = Math.max(ascent, metrics!.ascent);
      descent = Math.max(descent, metrics!.descent);
    } else hasMetrics = false;
    width += segmentWidth;
    return {
      ...segment,
      width: segmentWidth,
      ...(validExtents ? { ascent: metrics!.ascent, descent: metrics!.descent } : {}),
    };
  });
  if (!segments.length) {
    const metrics = measurer.measureMetrics?.("", context.baseFont);
    width =
      metrics && Number.isFinite(metrics.width)
        ? metrics.width
        : measurer.measure("", context.baseFont);
    hasMetrics = Boolean(
      metrics &&
      Number.isFinite(metrics.ascent) &&
      metrics.ascent >= 0 &&
      Number.isFinite(metrics.descent) &&
      metrics.descent >= 0,
    );
    ascent = metrics?.ascent ?? 0;
    descent = metrics?.descent ?? 0;
  }
  return {
    text: context.document.text.slice(start, end),
    start,
    end,
    width,
    paragraphEnd,
    segments,
    ...(hasMetrics ? { ascent, descent } : {}),
  };
}

/**
 * Measure each complete effective-family span once, preserving kerning within that span.
 * Ranges must be grapheme-aligned. Family affinity and fallback limitations match
 * getAttributedTextSegments; exact per-scalar mixed fonts inside a cluster are not promised.
 */
export function measureAttributedText(
  document: CellTextDocument,
  baseFont: AutoRowHeightFont,
  measurer: TextMeasurer,
  start = 0,
  end = document.text.length,
): number {
  const context = createLayoutContext(document, baseFont);
  assertRange(context, start, end);
  return measureRange(context, start, end, measurer, true).width;
}

function* getParagraphs(text: string): Generator<{ start: number; end: number }> {
  let start = 0;
  for (const match of text.matchAll(/\r\n|\r|\n/gu)) {
    yield { start, end: match.index };
    start = match.index + match[0].length;
  }
  yield { start, end: text.length };
}

/**
 * Word/CJK/grapheme wrapping is independent of font boundaries. Candidate lines
 * are remeasured as whole family spans instead of adding per-character widths.
 * Explicit CRLF/CR/LF delimiters are omitted from lines without shifting offsets.
 * Family affinity and Intl.Segmenter fallback limitations match getAttributedTextSegments.
 */
export function splitAttributedTextLines(
  document: CellTextDocument,
  availableWidth: number,
  baseFont: AutoRowHeightFont,
  measurer: TextMeasurer,
  wrapText: boolean,
): AttributedTextLine[] {
  const context = createLayoutContext(document, baseFont);
  const lines: AttributedTextLine[] = [];
  const normalizedWidth = Math.max(1, availableWidth);
  const measure = (start: number, end: number, paragraphEnd = false) =>
    measureRange(context, start, end, measurer, paragraphEnd);
  const append = (line: AttributedTextLine): boolean => {
    if (lines.length >= MAX_CELL_TEXT_LAYOUT_LINES) return false;
    lines.push(line);
    return lines.length < MAX_CELL_TEXT_LAYOUT_LINES;
  };

  for (const paragraph of getParagraphs(document.text)) {
    if (!wrapText || paragraph.start === paragraph.end) {
      if (!append(measure(paragraph.start, paragraph.end, true))) break;
      continue;
    }
    let lineStart = paragraph.start;
    let lineEnd = paragraph.start;
    let line: AttributedTextLine | undefined;
    let tokenStart = paragraph.start;
    for (const token of getCellTextWrapTokens(
      document.text.slice(paragraph.start, paragraph.end),
    )) {
      const tokenEnd = tokenStart + token.length;
      const candidate = measure(lineStart, tokenEnd);
      if (candidate.width <= normalizedWidth) {
        line = candidate;
        lineEnd = tokenEnd;
        tokenStart = tokenEnd;
        continue;
      }
      if (lineEnd > lineStart) {
        if (!append(line!)) return lines;
        lineStart = lineEnd;
        line = undefined;
      }
      const tokenLine = measure(tokenStart, tokenEnd);
      if (tokenLine.width <= normalizedWidth) {
        line = tokenLine;
        lineEnd = tokenEnd;
      } else {
        let graphemeStart = tokenStart;
        for (const grapheme of getCellTextGraphemes(token)) {
          const graphemeEnd = graphemeStart + grapheme.length;
          const next = measure(lineStart, graphemeEnd);
          if (lineEnd > lineStart && next.width > normalizedWidth) {
            if (!append(line!)) return lines;
            lineStart = lineEnd;
            line = measure(lineStart, graphemeEnd);
          } else line = next;
          lineEnd = graphemeEnd;
          graphemeStart = graphemeEnd;
        }
      }
      tokenStart = tokenEnd;
    }
    if (!append({ ...line!, paragraphEnd: true })) break;
  }
  return lines;
}
