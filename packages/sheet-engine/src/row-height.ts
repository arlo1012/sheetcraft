import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStyle,
} from "@sheetcraft/core/style";
import { formatComputedValueForDisplay, type FormulaValue } from "@sheetcraft/core";
import { type CellTextDocument } from "@sheetcraft/core/text-font-runs";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  type CellAddress,
  type Cell,
} from "@sheetcraft/core/workbook";
import {
  getCellTextGraphemes,
  isCellTextCjkGrapheme,
  splitCellTextLines,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "./text-layout.js";
import {
  getAttributedTextLineHeight,
  getAttributedTextLayoutLineHeights,
  splitAttributedTextLines,
} from "./attributed-text-layout.js";

export type { AutoRowHeightFont, TextMeasurer } from "./text-layout.js";

export const WRAPPED_CELL_HORIZONTAL_PADDING = 10;
export const WRAPPED_CELL_VERTICAL_PADDING = 4;
export const WRAPPED_CELL_GRIDLINE_WIDTH = 1;
export const WRAPPED_CELL_LINE_HEIGHT = 1.25;

const NORMAL_STYLE_FONT: AutoRowHeightFont = {
  family: DEFAULT_CELL_FONT_FAMILY,
  size: DEFAULT_CELL_FONT_SIZE,
  weight: 400,
  italic: false,
};

export type AutoRowHeightInput = {
  cells: ReadonlyMap<string, Readonly<Cell>>;
  /**
   * Resolves the current computed value without making sheet-engine evaluate
   * formula expressions or depend on a particular cell-content representation.
   */
  getComputedValue: (address: CellAddress, cell: Readonly<Cell>) => FormulaValue;
  /**
   * Formats a computed value for measuring. This lets runtime adapters use the
   * same presentation text as their rendered cell layer.
   */
  formatValue?: (address: CellAddress, cell: Readonly<Cell>, value: FormulaValue) => string;
  /** Formatted display text and projected font runs, shared with the rendered cell layer. */
  formatPresentation?: (
    address: CellAddress,
    cell: Readonly<Cell>,
    value: FormulaValue,
  ) => CellTextDocument;
  /** Display-only table/theme/rule formatting, without changing stored cells. */
  getCellStyle?: (address: CellAddress, cell: Readonly<Cell>) => Readonly<CellStyle> | undefined;
  columnWidths: ReadonlyMap<number, number>;
  /** Width used by columns without a stored manual dimension. */
  defaultColumnWidth?: number;
  rowCount: number;
  columnCount: number;
  defaultFontFamily?: string;
  measurementVersion?: number;
};

export type AutoRowHeightCalculator = {
  reconcile: (input: AutoRowHeightInput) => ReadonlyMap<number, number>;
  clear: () => void;
};

type CachedCellHeight = {
  fingerprint: string;
  height: number;
};

function parseCellKey(key: string): { row: number; column: number } | null {
  const separator = key.indexOf(":");
  if (separator < 1) {
    return null;
  }
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function getCellFont(
  style: Readonly<CellStyle> | undefined,
  defaultFontFamily: string,
): AutoRowHeightFont {
  return {
    family: style?.fontFamily ?? defaultFontFamily,
    size: style?.fontSize ?? DEFAULT_CELL_FONT_SIZE,
    weight: style?.bold ? 700 : 400,
    italic: Boolean(style?.italic),
  };
}

export function measureWrappedCellHeight(
  value: string | CellTextDocument,
  columnWidth: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wrapText = true,
): number {
  const document = typeof value === "string" ? { text: value } : value;
  const { text } = document;
  if (!text) {
    return DEFAULT_ROW_HEIGHT;
  }
  const availableWidth = Math.max(
    1,
    columnWidth - WRAPPED_CELL_HORIZONTAL_PADDING - WRAPPED_CELL_GRIDLINE_WIDTH,
  );
  if (document.fontRuns?.length || measurer.measureMetrics) {
    return measureAttributedCellHeight(
      document,
      availableWidth,
      undefined,
      font,
      measurer,
      wrapText,
    );
  }
  const lineCount = Math.min(
    splitCellTextLines(text, availableWidth, font, measurer, wrapText).length,
    getMaximumLineCount(font),
  );
  return getHeightForLineCount(lineCount, font);
}

function getMaximumLineCount(font: AutoRowHeightFont): number {
  return Math.max(
    1,
    Math.ceil(
      (MAX_ROW_HEIGHT - WRAPPED_CELL_VERTICAL_PADDING - WRAPPED_CELL_GRIDLINE_WIDTH) /
        (font.size * WRAPPED_CELL_LINE_HEIGHT),
    ),
  );
}

function getHeightForLineCount(lineCount: number, font: AutoRowHeightFont): number {
  return Math.min(
    MAX_ROW_HEIGHT,
    Math.max(
      DEFAULT_ROW_HEIGHT,
      Math.ceil(
        lineCount * font.size * WRAPPED_CELL_LINE_HEIGHT +
          WRAPPED_CELL_VERTICAL_PADDING +
          WRAPPED_CELL_GRIDLINE_WIDTH,
      ),
    ),
  );
}

function getAvailableTextWidth(
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  measurer: TextMeasurer,
): number {
  const horizontalAlign = style?.horizontalAlign;
  const indent = style?.indent ?? 0;
  // OOXML defines indentation in units of three spaces of the Normal style,
  // independently of the formatted cell's font.
  const indentWidth = measurer.measure("   ", NORMAL_STYLE_FONT) * indent;
  const indentAllowance =
    horizontalAlign === "distributed"
      ? indentWidth * 2
      : horizontalAlign === "left" || horizontalAlign === "right"
        ? indentWidth
        : 0;
  return Math.max(
    1,
    columnWidth - WRAPPED_CELL_HORIZONTAL_PADDING - WRAPPED_CELL_GRIDLINE_WIDTH - indentAllowance,
  );
}

function hasExplicitLineBreak(text: string): boolean {
  return /[\r\n]/u.test(text);
}

function shouldWrapText(style: Readonly<CellStyle> | undefined, text: string): boolean {
  const wraps =
    Boolean(style?.wrapText) ||
    style?.horizontalAlign === "justify" ||
    style?.horizontalAlign === "distributed";
  // Excel does not shrink a cell that already has a multiline alignment.
  // Explicit line breaks still form paragraphs when neither alignment wraps.
  if (wraps) return true;
  if (style?.shrinkToFit && !hasExplicitLineBreak(text)) return false;
  return false;
}

function getSingleLineAvailableTextWidth(
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  measurer: TextMeasurer,
): number {
  const horizontalAlign = style?.horizontalAlign;
  const indent =
    horizontalAlign === "left" || horizontalAlign === "right"
      ? (style?.indent ?? 0) * measurer.measure("   ", NORMAL_STYLE_FONT)
      : 0;
  const isCentered = horizontalAlign === "center" || horizontalAlign === "centerContinuous";
  return Math.max(1, columnWidth - WRAPPED_CELL_GRIDLINE_WIDTH - (isCentered ? 10 : 5) - indent);
}

function getShrinkToFitFont(
  document: CellTextDocument,
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wraps: boolean,
): AutoRowHeightFont {
  const { text } = document;
  const textRotation = style?.textRotation;
  if (
    !style?.shrinkToFit ||
    wraps ||
    hasExplicitLineBreak(text) ||
    textRotation === "vertical" ||
    style?.horizontalAlign === "fill"
  ) {
    return font;
  }
  const radians = typeof textRotation === "number" ? (Math.abs(textRotation) * Math.PI) / 180 : 0;
  const naturalLine =
    document.fontRuns?.length || measurer.measureMetrics
      ? splitAttributedTextLines(document, Infinity, font, measurer, false)[0]
      : undefined;
  const naturalWidth = naturalLine?.width ?? measurer.measure(text, font);
  const naturalHeight = naturalLine
    ? getAttributedTextLineHeight(naturalLine, font, WRAPPED_CELL_LINE_HEIGHT)
    : font.size * WRAPPED_CELL_LINE_HEIGHT;
  const rotatedWidth =
    naturalWidth * Math.abs(Math.cos(radians)) + naturalHeight * Math.abs(Math.sin(radians));
  const availableWidth = getSingleLineAvailableTextWidth(columnWidth, style, measurer);
  const factor = rotatedWidth > 0 ? Math.min(1, availableWidth / rotatedWidth) : 1;
  return { ...font, size: Math.max(1, font.size * factor) };
}

function measureCellHeight(
  document: CellTextDocument,
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): number {
  const { text } = document;
  const availableWidth = getAvailableTextWidth(columnWidth, style, measurer);
  const wraps = shouldWrapText(style, text);
  const measuredFont = getShrinkToFitFont(document, columnWidth, style, font, measurer, wraps);
  if (document.fontRuns?.length || measurer.measureMetrics) {
    return measureAttributedCellHeight(
      document,
      availableWidth,
      style,
      measuredFont,
      measurer,
      wraps,
    );
  }
  const lines = splitCellTextLines(text, availableWidth, measuredFont, measurer, wraps);
  const textRotation = style?.textRotation;
  if (textRotation === "vertical") {
    const graphemeCount = text
      .replace(/\r\n?/gu, "\n")
      .split("\n")
      .reduce((maximum, paragraph) => Math.max(maximum, getCellTextGraphemes(paragraph).length), 1);
    return getHeightForLineCount(
      Math.min(graphemeCount, getMaximumLineCount(measuredFont)),
      measuredFont,
    );
  }
  if (typeof textRotation === "number" && textRotation !== 0) {
    const radians = (Math.abs(textRotation) * Math.PI) / 180;
    const textWidth = wraps ? availableWidth : Math.max(0, ...lines.map((line) => line.width));
    const textHeight =
      Math.min(lines.length, getMaximumLineCount(measuredFont)) *
      measuredFont.size *
      WRAPPED_CELL_LINE_HEIGHT;
    const rotatedHeight = textWidth * Math.sin(radians) + textHeight * Math.cos(radians);
    return Math.min(
      MAX_ROW_HEIGHT,
      Math.max(
        DEFAULT_ROW_HEIGHT,
        Math.ceil(rotatedHeight + WRAPPED_CELL_VERTICAL_PADDING + WRAPPED_CELL_GRIDLINE_WIDTH),
      ),
    );
  }
  return getHeightForLineCount(
    Math.min(lines.length, getMaximumLineCount(measuredFont)),
    measuredFont,
  );
}

function getHeightForTextExtent(height: number): number {
  return Math.min(
    MAX_ROW_HEIGHT,
    Math.max(
      DEFAULT_ROW_HEIGHT,
      Math.ceil(height + WRAPPED_CELL_VERTICAL_PADDING + WRAPPED_CELL_GRIDLINE_WIDTH),
    ),
  );
}

function getAttributedStackedHeight(
  document: CellTextDocument,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): number {
  let maximum = font.size * WRAPPED_CELL_LINE_HEIGHT;
  for (const paragraph of splitAttributedTextLines(document, Infinity, font, measurer, false)) {
    let offset = paragraph.start;
    let segmentIndex = 0;
    let height = 0;
    for (const grapheme of getCellTextGraphemes(paragraph.text)) {
      while (
        paragraph.segments[segmentIndex]?.end !== undefined &&
        paragraph.segments[segmentIndex]!.end <= offset
      )
        segmentIndex++;
      const graphemeFont = paragraph.segments[segmentIndex]?.font ?? font;
      const metrics = measurer.measureMetrics?.(grapheme, graphemeFont);
      height += getAttributedTextLineHeight(metrics ?? {}, graphemeFont, WRAPPED_CELL_LINE_HEIGHT);
      offset += grapheme.length;
      if (height >= MAX_ROW_HEIGHT) break;
    }
    maximum = Math.max(maximum, height);
    if (maximum >= MAX_ROW_HEIGHT) break;
  }
  return getHeightForTextExtent(maximum);
}

function measureAttributedCellHeight(
  document: CellTextDocument,
  availableWidth: number,
  style: Readonly<CellStyle> | undefined,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wraps: boolean,
): number {
  if (style?.textRotation === "vertical")
    return getAttributedStackedHeight(document, font, measurer);
  const lines = splitAttributedTextLines(document, availableWidth, font, measurer, wraps);
  const heights = getAttributedTextLayoutLineHeights(
    document,
    lines,
    font,
    WRAPPED_CELL_LINE_HEIGHT,
    style?.textDirection,
  );
  const textHeight = heights.reduce(
    (height, lineHeight) => Math.min(MAX_ROW_HEIGHT, height + lineHeight),
    0,
  );
  const rotation = style?.textRotation;
  if (typeof rotation === "number" && rotation !== 0) {
    const radians = (Math.abs(rotation) * Math.PI) / 180;
    const textWidth = wraps ? availableWidth : Math.max(0, ...lines.map((line) => line.width));
    return getHeightForTextExtent(textWidth * Math.sin(radians) + textHeight * Math.cos(radians));
  }
  return getHeightForTextExtent(textHeight);
}

function getMeasuredExtentsFingerprint(
  document: CellTextDocument,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): unknown {
  if (!measurer.measureMetrics) return undefined;
  // Actual extents can change after font loading even when text and metadata are unchanged.
  return splitAttributedTextLines(document, Infinity, font, measurer, false).map((line) => [
    line.width,
    line.ascent,
    line.descent,
    line.segments.map((segment) => [
      segment.font.family,
      segment.width,
      segment.ascent,
      segment.descent,
    ]),
  ]);
}

export function createAutoRowHeightCalculator(measurer: TextMeasurer): AutoRowHeightCalculator {
  const cellHeights = new Map<string, CachedCellHeight>();

  return {
    reconcile(input) {
      const currentCellKeys = new Set<string>();
      const rowHeights = new Map<number, number>();
      const defaultFontFamily = input.defaultFontFamily ?? DEFAULT_CELL_FONT_FAMILY;

      for (const [key, cell] of input.cells) {
        const address = parseCellKey(key);
        if (
          !address ||
          address.row < 0 ||
          address.row >= input.rowCount ||
          address.column < 0 ||
          address.column >= input.columnCount
        ) {
          continue;
        }
        if (cell.content?.kind === "image") continue;
        const value = input.getComputedValue(address, cell);
        const document = input.formatPresentation?.(address, cell, value) ?? {
          text: input.formatValue?.(address, cell, value) ?? formatComputedValueForDisplay(value),
        };
        const { text } = document;
        const style = input.getCellStyle?.(address, cell) ?? cell.style;
        const wrapText = shouldWrapText(style, text);
        const hasLineBreak = hasExplicitLineBreak(text);
        const hasHeightSensitiveTextLayout =
          style?.textRotation !== undefined || Boolean(measurer.measureMetrics);
        if (!text || (!wrapText && !hasLineBreak && !hasHeightSensitiveTextLayout)) {
          continue;
        }

        currentCellKeys.add(key);
        const columnWidth =
          input.columnWidths.get(address.column) ??
          input.defaultColumnWidth ??
          DEFAULT_COLUMN_WIDTH;
        const font = getCellFont(style, defaultFontFamily);
        const fingerprint = JSON.stringify([
          text,
          document.fontRuns,
          wrapText || hasLineBreak || hasHeightSensitiveTextLayout ? columnWidth : undefined,
          font,
          style?.horizontalAlign,
          style?.indent,
          style?.shrinkToFit,
          style?.textRotation,
          style?.textDirection,
          input.measurementVersion ?? 0,
          getMeasuredExtentsFingerprint(document, font, measurer),
        ]);
        const cached = cellHeights.get(key);
        const height =
          cached?.fingerprint === fingerprint
            ? cached.height
            : measureCellHeight(document, columnWidth, style, font, measurer);
        if (!cached || cached.fingerprint !== fingerprint) {
          cellHeights.set(key, { fingerprint, height });
        }
        if (height > DEFAULT_ROW_HEIGHT) {
          rowHeights.set(address.row, Math.max(rowHeights.get(address.row) ?? 0, height));
        }
      }

      for (const key of cellHeights.keys()) {
        if (!currentCellKeys.has(key)) {
          cellHeights.delete(key);
        }
      }
      return rowHeights;
    },
    clear() {
      cellHeights.clear();
    },
  };
}

export function createApproximateTextMeasurer(): TextMeasurer {
  return {
    measure(text, font) {
      let units = 0;
      for (const grapheme of getCellTextGraphemes(text)) {
        units += isCellTextCjkGrapheme(grapheme) ? 1 : /\s/u.test(grapheme) ? 0.33 : 0.56;
      }
      return units * font.size * (font.weight === 700 ? 1.05 : 1) * (font.italic ? 1.02 : 1);
    },
  };
}

export function mergeRowHeightOverrides(
  automatic: ReadonlyMap<number, number>,
  manual: ReadonlyMap<number, number>,
): Map<number, number> {
  return new Map([...automatic, ...manual]);
}
