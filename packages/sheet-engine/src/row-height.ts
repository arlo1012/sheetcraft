import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStyle,
} from "@sheetcraft/core/style";
import { formatComputedValueForDisplay, type FormulaValue } from "@sheetcraft/core";
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
  text: string,
  columnWidth: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wrapText = true,
): number {
  if (!text) {
    return DEFAULT_ROW_HEIGHT;
  }
  const availableWidth = Math.max(
    1,
    columnWidth - WRAPPED_CELL_HORIZONTAL_PADDING - WRAPPED_CELL_GRIDLINE_WIDTH,
  );
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
  text: string,
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wraps: boolean,
): AutoRowHeightFont {
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
  const naturalWidth = measurer.measure(text, font);
  const rotatedWidth =
    naturalWidth * Math.abs(Math.cos(radians)) +
    font.size * WRAPPED_CELL_LINE_HEIGHT * Math.abs(Math.sin(radians));
  const availableWidth = getSingleLineAvailableTextWidth(columnWidth, style, measurer);
  const factor = rotatedWidth > 0 ? Math.min(1, availableWidth / rotatedWidth) : 1;
  return { ...font, size: Math.max(1, font.size * factor) };
}

function measureCellHeight(
  text: string,
  columnWidth: number,
  style: Readonly<CellStyle> | undefined,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
): number {
  const availableWidth = getAvailableTextWidth(columnWidth, style, measurer);
  const wraps = shouldWrapText(style, text);
  const measuredFont = getShrinkToFitFont(text, columnWidth, style, font, measurer, wraps);
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
        const text =
          input.formatValue?.(address, cell, value) ?? formatComputedValueForDisplay(value);
        const wrapText = shouldWrapText(cell.style, text);
        const hasLineBreak = hasExplicitLineBreak(text);
        const hasHeightSensitiveTextLayout = cell.style?.textRotation !== undefined;
        if (!text || (!wrapText && !hasLineBreak && !hasHeightSensitiveTextLayout)) {
          continue;
        }

        currentCellKeys.add(key);
        const columnWidth =
          input.columnWidths.get(address.column) ??
          input.defaultColumnWidth ??
          DEFAULT_COLUMN_WIDTH;
        const font = getCellFont(cell.style, defaultFontFamily);
        const fingerprint = JSON.stringify([
          text,
          wrapText || hasLineBreak || hasHeightSensitiveTextLayout ? columnWidth : undefined,
          font,
          cell.style?.horizontalAlign,
          cell.style?.indent,
          cell.style?.shrinkToFit,
          cell.style?.textRotation,
          input.measurementVersion ?? 0,
        ]);
        const cached = cellHeights.get(key);
        const height =
          cached?.fingerprint === fingerprint
            ? cached.height
            : measureCellHeight(text, columnWidth, cell.style, font, measurer);
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
