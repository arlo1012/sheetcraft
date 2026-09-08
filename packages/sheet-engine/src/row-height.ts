import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStyle,
} from "@idea10/core/style";
import { formatComputedValueForDisplay, type FormulaValue } from "@idea10/core";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  type CellAddress,
  type Cell,
} from "@idea10/core/workbook";

export const WRAPPED_CELL_HORIZONTAL_PADDING = 10;
export const WRAPPED_CELL_VERTICAL_PADDING = 4;
export const WRAPPED_CELL_GRIDLINE_WIDTH = 1;
export const WRAPPED_CELL_LINE_HEIGHT = 1.25;

export type AutoRowHeightFont = {
  family: string;
  size: number;
  weight: 400 | 700;
  italic: boolean;
};

export type TextMeasurer = {
  measure: (text: string, font: AutoRowHeightFont) => number;
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

const CJK_GRAPHEME_PATTERN =
  /[\u2e80-\u2fff\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

function parseCellKey(key: string): { row: number; column: number } | null {
  const separator = key.indexOf(":");
  if (separator < 1) {
    return null;
  }
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function getGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
      ({ segment }) => segment,
    );
  }
  return Array.from(text);
}

function getWrapTokens(text: string): string[] {
  const tokens: string[] = [];
  let buffered = "";
  let bufferKind: "space" | "word" | undefined;

  const flush = () => {
    if (buffered) {
      tokens.push(buffered);
      buffered = "";
      bufferKind = undefined;
    }
  };

  for (const grapheme of getGraphemes(text)) {
    if (/\s/u.test(grapheme)) {
      if (bufferKind !== "space") {
        flush();
        bufferKind = "space";
      }
      buffered += grapheme;
    } else if (CJK_GRAPHEME_PATTERN.test(grapheme)) {
      flush();
      tokens.push(grapheme);
    } else {
      if (bufferKind !== "word") {
        flush();
        bufferKind = "word";
      }
      buffered += grapheme;
    }
  }
  flush();
  return tokens;
}

function countWrappedLines(
  text: string,
  availableWidth: number,
  font: AutoRowHeightFont,
  measurer: TextMeasurer,
  wrapText: boolean,
): number {
  const maximumLines = Math.max(
    1,
    Math.ceil(
      (MAX_ROW_HEIGHT - WRAPPED_CELL_VERTICAL_PADDING - WRAPPED_CELL_GRIDLINE_WIDTH) /
        (font.size * WRAPPED_CELL_LINE_HEIGHT),
    ),
  );
  const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
  if (!wrapText) {
    return Math.min(paragraphs.length, maximumLines);
  }
  let lineCount = 0;

  for (const paragraph of paragraphs) {
    lineCount += 1;
    let lineWidth = 0;

    for (const token of getWrapTokens(paragraph)) {
      const tokenWidth = measurer.measure(token, font);
      if (lineWidth > 0 && lineWidth + tokenWidth <= availableWidth) {
        lineWidth += tokenWidth;
        continue;
      }
      if (lineWidth === 0 && tokenWidth <= availableWidth) {
        lineWidth = tokenWidth;
        continue;
      }
      if (lineWidth > 0) {
        lineCount += 1;
        if (lineCount >= maximumLines) {
          return maximumLines;
        }
        lineWidth = 0;
      }
      if (tokenWidth <= availableWidth) {
        lineWidth = tokenWidth;
        continue;
      }

      for (const grapheme of getGraphemes(token)) {
        const graphemeWidth = measurer.measure(grapheme, font);
        if (lineWidth > 0 && lineWidth + graphemeWidth > availableWidth) {
          lineCount += 1;
          if (lineCount >= maximumLines) {
            return maximumLines;
          }
          lineWidth = 0;
        }
        lineWidth += graphemeWidth;
      }
    }

    if (lineCount >= maximumLines) {
      return maximumLines;
    }
  }
  return Math.max(1, lineCount);
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
  const lineCount = countWrappedLines(text, availableWidth, font, measurer, wrapText);
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
        const wrapText = Boolean(cell.style?.wrapText);
        if (!text || (!wrapText && !/[\r\n]/u.test(text))) {
          continue;
        }

        currentCellKeys.add(key);
        const columnWidth = input.columnWidths.get(address.column) ?? DEFAULT_COLUMN_WIDTH;
        const font = getCellFont(cell.style, defaultFontFamily);
        const fingerprint = JSON.stringify([
          text,
          wrapText ? columnWidth : undefined,
          font,
          input.measurementVersion ?? 0,
        ]);
        const cached = cellHeights.get(key);
        const height =
          cached?.fingerprint === fingerprint
            ? cached.height
            : measureWrappedCellHeight(text, columnWidth, font, measurer, wrapText);
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
      for (const grapheme of getGraphemes(text)) {
        units += CJK_GRAPHEME_PATTERN.test(grapheme) ? 1 : /\s/u.test(grapheme) ? 0.33 : 0.56;
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
