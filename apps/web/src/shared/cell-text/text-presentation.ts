import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStyle,
  type CellTextDirection,
  type HorizontalCellAlignment,
} from "@sheetcraft/core/style";
import type { CellTextFontRun, FormulaValue } from "@sheetcraft/core/formula";
import type { CellNumberFormatPresentation } from "@sheetcraft/core/number-format";
import {
  getCellTextGraphemes,
  splitCellTextLines,
  MAX_CELL_TEXT_LAYOUT_LINES,
  type CellTextLine as PlainCellTextLine,
} from "@sheetcraft/sheet-engine/text-layout";
import {
  WRAPPED_CELL_LINE_HEIGHT,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@sheetcraft/sheet-engine/row-height";
import {
  getAttributedTextLineHeight,
  getAttributedTextLayoutLineHeights,
  measureAttributedText,
  requiresAttributedNativeBidiLayout,
  splitAttributedTextLines,
  type MeasuredAttributedTextSegment,
  type AttributedTextLine,
} from "@sheetcraft/sheet-engine/attributed-text-layout";
import { normalizeCellTextFontRuns, type CellTextDocument } from "@sheetcraft/core/text-font-runs";
import { getCellTextRenderFontSize } from "./font-presentation";

export type ResolvedCellTextAlignment =
  | "left"
  | "center"
  | "right"
  | "fill"
  | "justify"
  | "distributed";
export type CellTextLine = Readonly<{
  text: string;
  x: number;
  y: number;
  width: number;
  align: "left" | "right" | "center" | "justify";
  /** Logical-order, complete effective-family spans, preserving grapheme affinity. */
  segments?: readonly MeasuredAttributedTextSegment[];
  textWidth?: number;
  height?: number;
  ascent?: number;
  descent?: number;
}>;
export type CellTextLayout = Readonly<{
  direction: "ltr" | "rtl";
  horizontal: ResolvedCellTextAlignment;
  font: AutoRowHeightFont;
  lineHeight: number;
  lines: readonly CellTextLine[];
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  rotationX: number;
  rotationY: number;
  /** Multi-family bidi needs paragraph-level visual runs or a browser DOM fallback. */
  canvasBidiRequired?: true;
  /** Final display text, including fill expansion; native bidi must see whole paragraphs. */
  bidiDocument?: CellTextDocument;
}>;

export function resolveCellTextDirection(
  text: string,
  direction?: CellTextDirection,
): "ltr" | "rtl" {
  if (direction === "ltr" || direction === "rtl") return direction;
  // OOXML context checks the first non-whitespace character, including numbers.
  const first = text.trimStart()[Symbol.iterator]().next().value ?? "";
  const code = first.codePointAt(0) ?? 0;
  const rtlBlock =
    (code >= 0x590 && code <= 0x8ff) ||
    (code >= 0xfb1d && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfefc) ||
    (code >= 0x10800 && code <= 0x10fff) ||
    (code >= 0x1e800 && code <= 0x1efff);
  return first === "\u200f" || (rtlBlock && /\p{Letter}/u.test(first)) ? "rtl" : "ltr";
}

export function resolveCellHorizontalAlignment(
  alignment: HorizontalCellAlignment | undefined,
  value: FormulaValue | undefined,
  direction: "ltr" | "rtl",
): ResolvedCellTextAlignment {
  if (alignment === "centerContinuous") return "center";
  if (alignment && alignment !== "general") return alignment;
  if (typeof value === "number") return "right";
  if (typeof value === "boolean" || (value !== null && typeof value === "object")) return "center";
  return direction === "rtl" ? "right" : "left";
}

export function isCellTextWrapped(style?: Readonly<CellStyle>): boolean {
  return (
    Boolean(style?.wrapText) ||
    style?.horizontalAlign === "justify" ||
    style?.horizontalAlign === "distributed"
  );
}

export function getCellTextFont(style?: Readonly<CellStyle>): AutoRowHeightFont {
  return {
    family: style?.fontFamily ?? DEFAULT_CELL_FONT_FAMILY,
    size: style?.fontSize ?? DEFAULT_CELL_FONT_SIZE,
    weight: style?.bold ? 700 : 400,
    italic: Boolean(style?.italic),
  };
}

/** The measurement font mirrors rendered scripts without mutating workbook style data. */
export function getCellTextRenderFont(style?: Readonly<CellStyle>): AutoRowHeightFont {
  return { ...getCellTextFont(style), size: getCellTextRenderFontSize(style) };
}

export function getCellIndentPixels(
  style: Readonly<CellStyle> | undefined,
  measurer: TextMeasurer,
): number {
  if (
    !style?.indent ||
    !["left", "right", "distributed"].includes(style.horizontalAlign ?? "general")
  )
    return 0;
  // Indent units are three spaces in the workbook's normal font, not the cell's font.
  return style.indent * measurer.measure("   ", getCellTextFont());
}

export type CellTextFillFontRuns = Readonly<{
  /** UTF-16 offsets into fill.before and fill.after, respectively. */
  before?: readonly CellTextFontRun[];
  after?: readonly CellTextFontRun[];
}>;

function expandedNumberFill(
  document: CellTextDocument,
  fill: CellNumberFormatPresentation["fill"],
  fillFontRuns: CellTextFillFontRuns | undefined,
  width: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): CellTextDocument {
  if (!fill) return document;
  if (document.fontRuns?.length && !fillFontRuns)
    throw new RangeError("Number-format font runs require verified before/after projection.");
  const beforeRuns = normalizeCellTextFontRuns(fill.before, fillFontRuns?.before) ?? [];
  const afterRuns = normalizeCellTextFontRuns(fill.after, fillFontRuns?.after) ?? [];
  const unfilled = {
    text: fill.before + fill.after,
    fontRuns: [
      ...beforeRuns,
      ...afterRuns.map((run) => ({
        ...run,
        start: run.start + fill.before.length,
        end: run.end + fill.before.length,
      })),
    ],
  };
  const characterWidth = measurer.measure(fill.character, font);
  const unfilledWidth = unfilled.fontRuns.length
    ? measureAttributedText(unfilled, font, measurer)
    : measurer.measure(unfilled.text, font);
  const remaining = width - unfilledWidth;
  const repetitions =
    characterWidth > 0 ? Math.min(10000, Math.max(0, Math.floor(remaining / characterWidth))) : 0;
  const repeated = fill.character.repeat(repetitions);
  const afterOffset = fill.before.length + repeated.length;
  const fontRuns = [
    ...beforeRuns,
    ...afterRuns.map((run) => ({
      ...run,
      start: run.start + afterOffset,
      end: run.end + afterOffset,
    })),
  ];
  return {
    text: fill.before + repeated + fill.after,
    ...(fontRuns.length ? { fontRuns } : {}),
  };
}

function repeatTextDocument(document: CellTextDocument, count: number): CellTextDocument {
  const fontRuns = document.fontRuns?.length
    ? Array.from({ length: count }, (_, index) =>
        document.fontRuns!.map((run) => ({
          ...run,
          start: run.start + index * document.text.length,
          end: run.end + index * document.text.length,
        })),
      ).flat()
    : undefined;
  return { text: document.text.repeat(count), ...(fontRuns ? { fontRuns } : {}) };
}

function isAttributedTextLine(line: PlainCellTextLine): line is AttributedTextLine {
  return "segments" in line;
}

export function layoutCellText(options: {
  text: string;
  fontRuns?: readonly CellTextFontRun[];
  fillFontRuns?: CellTextFillFontRuns;
  value?: FormulaValue;
  style?: Readonly<CellStyle>;
  fill?: CellNumberFormatPresentation["fill"];
  width: number;
  height: number;
  measurer: TextMeasurer;
}): CellTextLayout {
  const { text, value, style, measurer } = options;
  const direction = resolveCellTextDirection(text, style?.textDirection);
  const horizontal = resolveCellHorizontalAlignment(style?.horizontalAlign, value, direction);
  const wrap = isCellTextWrapped(style);
  const multiline = wrap || /[\r\n]/u.test(text);
  const indent = getCellIndentPixels(style, measurer);
  const leftInset =
    (horizontal === "right" && !multiline ? 0 : 5) +
    (horizontal === "left" || horizontal === "distributed" ? indent : 0);
  const rightInset =
    (horizontal === "left" && !multiline ? 0 : 5) +
    (horizontal === "right" || horizontal === "distributed" ? indent : 0);
  const availableWidth = Math.max(1, options.width - leftInset - rightInset);
  const availableHeight = Math.max(0, options.height - 4);
  let font = getCellTextRenderFont(style);
  let lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  const angle = typeof style?.textRotation === "number" ? -style.textRotation : 0;
  const radians = (angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const stacked = style?.textRotation === "vertical";
  let renderedDocument = expandedNumberFill(
    { text, fontRuns: options.fontRuns },
    options.fill,
    options.fillFontRuns,
    availableWidth,
    font,
    measurer,
  );
  const attributed = Boolean(renderedDocument.fontRuns?.length);
  const measure = (document: CellTextDocument) =>
    attributed
      ? measureAttributedText(document, font, measurer)
      : measurer.measure(document.text, font);
  if (attributed && style?.shrinkToFit && !multiline && !stacked && horizontal !== "fill") {
    lineHeight = Math.max(
      lineHeight,
      ...splitAttributedTextLines(renderedDocument, availableWidth, font, measurer, false).map(
        (line) => getAttributedTextLineHeight(line, font, WRAPPED_CELL_LINE_HEIGHT),
      ),
    );
  }
  if (style?.shrinkToFit && !multiline && !stacked && horizontal !== "fill") {
    const naturalWidth = measure(renderedDocument);
    const rotatedWidth = naturalWidth * Math.abs(cosine) + lineHeight * Math.abs(sine);
    const factor = rotatedWidth > 0 ? Math.min(1, availableWidth / rotatedWidth) : 1;
    font = { ...font, size: Math.max(1, font.size * factor) };
    lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  }
  if (horizontal === "fill" && text) {
    const textWidth = measure(renderedDocument);
    const count =
      textWidth > 0 ? Math.min(10000, Math.max(1, Math.floor(availableWidth / textWidth))) : 1;
    renderedDocument = repeatTextDocument(renderedDocument, count);
  }

  const renderedText = renderedDocument.text;
  const canvasBidiRequired =
    attributed && !stacked && requiresAttributedNativeBidiLayout(renderedDocument, font, direction);
  let lines: CellTextLine[] = [];
  let width: number;
  let naturalHeight: number;
  const vertical = style?.verticalAlign ?? "bottom";
  if (stacked && attributed) {
    const paragraphs = splitAttributedTextLines(
      renderedDocument,
      availableWidth,
      font,
      measurer,
      false,
    );
    const columns = paragraphs.map((paragraph) => {
      let offset = paragraph.start;
      let segmentIndex = 0;
      return getCellTextGraphemes(paragraph.text).map((grapheme) => {
        const start = offset;
        offset += grapheme.length;
        while (paragraph.segments[segmentIndex] && paragraph.segments[segmentIndex]!.end <= start)
          segmentIndex++;
        const graphemeFont = paragraph.segments[segmentIndex]?.font ?? font;
        const metrics = measurer.measureMetrics?.(grapheme, graphemeFont);
        const validExtents =
          metrics &&
          Number.isFinite(metrics.ascent) &&
          metrics.ascent >= 0 &&
          Number.isFinite(metrics.descent) &&
          metrics.descent >= 0;
        const segments = [
          {
            text: grapheme,
            start,
            end: offset,
            font: graphemeFont,
            width:
              metrics && Number.isFinite(metrics.width)
                ? metrics.width
                : measurer.measure(grapheme, graphemeFont),
            ...(validExtents ? { ascent: metrics.ascent, descent: metrics.descent } : {}),
          },
        ];
        const ascent = segments.every((segment) => segment.ascent !== undefined)
          ? Math.max(0, ...segments.map((segment) => segment.ascent!))
          : undefined;
        const descent = segments.every((segment) => segment.descent !== undefined)
          ? Math.max(0, ...segments.map((segment) => segment.descent!))
          : undefined;
        return {
          text: grapheme,
          segments,
          ascent,
          descent,
          textWidth: segments.reduce((total, segment) => total + segment.width, 0),
          height: getAttributedTextLineHeight({ ascent, descent }, font, WRAPPED_CELL_LINE_HEIGHT),
        };
      });
    });
    const columnWidths = columns.map((column) =>
      Math.max(font.size, ...column.map((line) => line.textWidth)),
    );
    lineHeight = Math.max(
      font.size * WRAPPED_CELL_LINE_HEIGHT,
      ...columns.flatMap((column) => column.map((line) => line.height)),
    );
    width = Math.max(
      1,
      columnWidths.reduce((total, current) => total + current, 0),
    );
    naturalHeight = Math.max(
      font.size * WRAPPED_CELL_LINE_HEIGHT,
      ...columns.map((column) => column.reduce((total, line) => total + line.height, 0)),
    );
    const horizontalOffset =
      horizontal === "right"
        ? availableWidth - width
        : horizontal === "center"
          ? (availableWidth - width) / 2
          : 0;
    let columnStart = 0;
    columns.forEach((column, columnIndex) => {
      const columnWidth = columnWidths[columnIndex]!;
      const x = direction === "rtl" ? width - columnStart - columnWidth : columnStart;
      columnStart += columnWidth;
      if (x + horizontalOffset + columnWidth < 0 || x + horizontalOffset > availableWidth) return;
      let y = 0;
      for (const line of column) {
        if (lines.length >= MAX_CELL_TEXT_LAYOUT_LINES || y > availableHeight) break;
        lines.push({
          ...line,
          x,
          y,
          width: columnWidth,
          align: "center",
        });
        y += line.height;
      }
    });
  } else if (stacked) {
    const columns = renderedText.replace(/\r\n?/gu, "\n").split("\n").map(getCellTextGraphemes);
    const columnWidth = columns.reduce(
      (widest, column) =>
        column.reduce((current, char) => Math.max(current, measurer.measure(char, font)), widest),
      font.size,
    );
    width = Math.max(1, columns.length * columnWidth);
    naturalHeight =
      columns.reduce((longest, column) => Math.max(longest, column.length), 1) * lineHeight;
    const visibleRows = Math.ceil(availableHeight / lineHeight) + 1;
    const horizontalOffset =
      horizontal === "right"
        ? availableWidth - width
        : horizontal === "center"
          ? (availableWidth - width) / 2
          : 0;
    columns.forEach((column, columnIndex) => {
      const x =
        (direction === "rtl" ? columns.length - columnIndex - 1 : columnIndex) * columnWidth;
      if (x + horizontalOffset + columnWidth < 0 || x + horizontalOffset > availableWidth) return;
      for (let index = 0; index < Math.min(column.length, visibleRows); index += 1) {
        if (lines.length >= MAX_CELL_TEXT_LAYOUT_LINES) break;
        lines.push({
          text: column[index]!,
          x,
          y: index * lineHeight,
          width: columnWidth,
          align: "center",
        });
      }
    });
  } else {
    const attributedParagraphs = attributed
      ? splitAttributedTextLines(renderedDocument, availableWidth, font, measurer, wrap)
      : undefined;
    const paragraphs =
      attributedParagraphs ??
      splitCellTextLines(renderedText, availableWidth, font, measurer, wrap);
    const heights = attributedParagraphs
      ? getAttributedTextLayoutLineHeights(
          renderedDocument,
          attributedParagraphs,
          font,
          WRAPPED_CELL_LINE_HEIGHT,
          direction,
        )
      : paragraphs.map(() => lineHeight);
    if (attributed) lineHeight = Math.max(...heights);
    width =
      wrap || options.fill || horizontal === "fill"
        ? availableWidth
        : Math.max(1, ...paragraphs.map((line) => line.width));
    naturalHeight = attributed
      ? heights.reduce((total, height) => total + height, 0)
      : paragraphs.length * lineHeight;
    const spare = Math.max(0, availableHeight - naturalHeight);
    const spread =
      angle === 0 &&
      paragraphs.length > 1 &&
      (vertical === "justify" || vertical === "distributed");
    const gap = spread
      ? spare / (vertical === "distributed" ? paragraphs.length : paragraphs.length - 1)
      : 0;
    let lineY = spread && vertical === "distributed" ? gap / 2 : 0;
    lines = paragraphs.map((line, index) => {
      const justified =
        horizontal === "distributed" || (horizontal === "justify" && !line.paragraphEnd);
      const canExpand =
        /\s/u.test(line.text.trim()) ||
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(line.text);
      const align =
        justified && canExpand
          ? "justify"
          : horizontal === "distributed"
            ? "center"
            : horizontal === "right" || horizontal === "center"
              ? horizontal
              : direction === "rtl" && horizontal === "justify"
                ? "right"
                : "left";
      const y = attributed
        ? lineY
        : index * (lineHeight + gap) + (spread && vertical === "distributed" ? gap / 2 : 0);
      lineY += heights[index]! + gap;
      return {
        ...(isAttributedTextLine(line)
          ? {
              segments: line.segments,
              textWidth: line.width,
              height: heights[index],
              ascent: line.ascent,
              descent: line.descent,
            }
          : {}),
        text: line.text,
        x: 0,
        y,
        width,
        align,
      };
    });
    if (spread) naturalHeight = availableHeight;
  }
  const minimumX = Math.min(
    0,
    width * cosine,
    -naturalHeight * sine,
    width * cosine - naturalHeight * sine,
  );
  const minimumY = Math.min(
    0,
    width * sine,
    naturalHeight * cosine,
    width * sine + naturalHeight * cosine,
  );
  const rotatedWidth = width * Math.abs(cosine) + naturalHeight * Math.abs(sine);
  const rotatedHeight = width * Math.abs(sine) + naturalHeight * Math.abs(cosine);
  const x =
    leftInset +
    (horizontal === "right"
      ? availableWidth - rotatedWidth
      : horizontal === "center"
        ? (availableWidth - rotatedWidth) / 2
        : 0);
  const y =
    2 +
    Math.max(
      0,
      vertical === "bottom"
        ? availableHeight - rotatedHeight
        : vertical === "middle" || vertical === "distributed"
          ? (availableHeight - rotatedHeight) / 2
          : 0,
    );
  return {
    direction,
    horizontal,
    font,
    lineHeight,
    lines,
    x,
    y,
    width,
    height: naturalHeight,
    angle,
    rotationX: -minimumX,
    rotationY: -minimumY,
    ...(canvasBidiRequired
      ? { canvasBidiRequired: true as const, bidiDocument: renderedDocument }
      : {}),
  };
}
