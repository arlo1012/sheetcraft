import { formatComputedValueForDisplay, MergedCellRangeResolver } from "@sheetcraft/core";
import type { FormulaValue } from "@sheetcraft/core/formula";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  type Cell,
  type CellAddress,
  type CellRange,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  getCellTextGraphemes,
  splitCellTextLines,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@sheetcraft/sheet-engine/text-layout";
import { WRAPPED_CELL_LINE_HEIGHT } from "@sheetcraft/sheet-engine/row-height";
import {
  getCellIndentPixels,
  getCellTextRenderFont,
  isCellTextWrapped,
  resolveCellHorizontalAlignment,
  resolveCellTextDirection,
} from "../../shared/cell-text/text-presentation";

const CELL_HORIZONTAL_INSET = 5;
const CELL_VERTICAL_INSET = 4;
const GRIDLINE_WIDTH = 1;

export type AxisAutoFitInput = Readonly<{
  sheet: Sheet;
  range: CellRange;
  getComputedValue: (address: CellAddress, cell: Readonly<Cell>) => FormulaValue;
  /** Supplies the same locale and number-format text used by the cell renderer. */
  formatValue?: (address: CellAddress, cell: Readonly<Cell>, value: FormulaValue) => string;
  measurer: TextMeasurer;
}>;

function parseCellAddress(key: string): CellAddress | undefined {
  const separator = key.indexOf(":");
  if (separator < 1) return undefined;
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && column >= 0
    ? { row, column }
    : undefined;
}

function isInRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function isAxisHidden(sheet: Sheet, axis: "row" | "column", index: number): boolean {
  return axis === "row"
    ? Boolean(sheet.hiddenRows?.has(index))
    : Boolean(sheet.hiddenColumns?.has(index));
}

function getColumnWidth(sheet: Sheet, column: number): number {
  return sheet.columnWidths.get(column) ?? sheet.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.ceil(value)));
}

function hasLineBreak(text: string): boolean {
  return /[\r\n]/u.test(text);
}

function getText(
  text: string,
  value: FormulaValue,
  style: Cell["style"],
  width: number,
  measurer: TextMeasurer,
): {
  font: AutoRowHeightFont;
  lines: ReturnType<typeof splitCellTextLines>;
  wrap: boolean;
} {
  const font = getCellTextRenderFont(style);
  const wrap = isCellTextWrapped(style);
  const horizontal = resolveCellHorizontalAlignment(
    style?.horizontalAlign,
    value,
    resolveCellTextDirection(text, style?.textDirection),
  );
  const indent = getCellIndentPixels(style, measurer);
  const leftInset =
    (horizontal === "right" && !wrap && !hasLineBreak(text) ? 0 : CELL_HORIZONTAL_INSET) +
    (horizontal === "left" || horizontal === "distributed" ? indent : 0);
  const rightInset =
    (horizontal === "left" && !wrap && !hasLineBreak(text) ? 0 : CELL_HORIZONTAL_INSET) +
    (horizontal === "right" || horizontal === "distributed" ? indent : 0);
  const availableWidth = Math.max(1, width - leftInset - rightInset - GRIDLINE_WIDTH);
  return { font, lines: splitCellTextLines(text, availableWidth, font, measurer, wrap), wrap };
}

function getAutoFitRowHeight(
  text: string,
  value: FormulaValue,
  cell: Readonly<Cell>,
  columnWidth: number,
  measurer: TextMeasurer,
): number {
  const { font, lines } = getText(text, value, cell.style, columnWidth, measurer);
  const lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  const rotation = cell.style?.textRotation;
  if (rotation === "vertical") {
    const lineCount = text
      .replace(/\r\n?/gu, "\n")
      .split("\n")
      .reduce((maximum, paragraph) => Math.max(maximum, getCellTextGraphemes(paragraph).length), 1);
    return clamp(
      lineCount * lineHeight + CELL_VERTICAL_INSET + GRIDLINE_WIDTH,
      MIN_ROW_HEIGHT,
      MAX_ROW_HEIGHT,
    );
  }
  const textHeight = Math.max(1, lines.length) * lineHeight;
  if (typeof rotation === "number" && rotation !== 0) {
    const radians = (Math.abs(rotation) * Math.PI) / 180;
    const textWidth = Math.max(0, ...lines.map((line) => line.width));
    return clamp(
      textWidth * Math.sin(radians) +
        textHeight * Math.cos(radians) +
        CELL_VERTICAL_INSET +
        GRIDLINE_WIDTH,
      MIN_ROW_HEIGHT,
      MAX_ROW_HEIGHT,
    );
  }
  return clamp(textHeight + CELL_VERTICAL_INSET + GRIDLINE_WIDTH, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
}

function getAutoFitColumnWidth(
  text: string,
  value: FormulaValue,
  cell: Readonly<Cell>,
  measurer: TextMeasurer,
): number {
  const font = getCellTextRenderFont(cell.style);
  const rotation = cell.style?.textRotation;
  const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
  const lineHeight = font.size * WRAPPED_CELL_LINE_HEIGHT;
  let textWidth: number;
  if (rotation === "vertical") {
    const characterWidth = paragraphs.reduce(
      (widest, paragraph) =>
        Math.max(
          widest,
          ...getCellTextGraphemes(paragraph).map((character) => measurer.measure(character, font)),
        ),
      font.size,
    );
    textWidth = characterWidth * Math.max(1, paragraphs.length);
  } else {
    textWidth = Math.max(0, ...paragraphs.map((paragraph) => measurer.measure(paragraph, font)));
    if (typeof rotation === "number" && rotation !== 0) {
      const radians = (Math.abs(rotation) * Math.PI) / 180;
      textWidth =
        textWidth * Math.abs(Math.cos(radians)) + lineHeight * Math.abs(Math.sin(radians));
    }
  }
  const horizontal = resolveCellHorizontalAlignment(
    cell.style?.horizontalAlign,
    value,
    resolveCellTextDirection(text, cell.style?.textDirection),
  );
  const indent = getCellIndentPixels(cell.style, measurer);
  const inset =
    horizontal === "left" || horizontal === "right"
      ? CELL_HORIZONTAL_INSET + indent
      : CELL_HORIZONTAL_INSET * 2;
  return clamp(textWidth + inset + GRIDLINE_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
}

function getFormattedCellText(
  input: AxisAutoFitInput,
  address: CellAddress,
  cell: Readonly<Cell>,
): { text: string; value: FormulaValue } {
  const value = input.getComputedValue(address, cell);
  return {
    text: input.formatValue?.(address, cell, value) ?? formatComputedValueForDisplay(value),
    value,
  };
}

function differs(current: number | undefined, next: number, fallback: number): boolean {
  return (current ?? fallback) !== next;
}

function getMergedAxisIndexes(
  range: CellRange,
  merges: readonly CellRange[],
  axis: "row" | "column",
): ReadonlySet<number> {
  const blocked = new Set<number>();
  for (const merge of merges) {
    const start = axis === "row" ? merge.start.row : merge.start.column;
    const end = axis === "row" ? merge.end.row : merge.end.column;
    const perpendicularStart = axis === "row" ? merge.start.column : merge.start.row;
    const perpendicularEnd = axis === "row" ? merge.end.column : merge.end.row;
    const rangeStart = axis === "row" ? range.start.row : range.start.column;
    const rangeEnd = axis === "row" ? range.end.row : range.end.column;
    const perpendicularRangeStart = axis === "row" ? range.start.column : range.start.row;
    const perpendicularRangeEnd = axis === "row" ? range.end.column : range.end.row;
    if (end < rangeStart || start > rangeEnd) continue;
    if (perpendicularEnd < perpendicularRangeStart || perpendicularStart > perpendicularRangeEnd)
      continue;
    for (let index = Math.max(start, rangeStart); index <= Math.min(end, rangeEnd); index += 1) {
      blocked.add(index);
    }
  }
  return blocked;
}

/**
 * Measures each selected, visible row against its populated visible cells.
 * Merged cells are deliberately omitted: Excel-style row auto-fit cannot
 * determine a reliable height for an anchor spanning several rows or columns.
 */
export function getAutoFitRowHeights(input: AxisAutoFitInput): Map<number, number> {
  const sheet = input.sheet;
  const merged = new MergedCellRangeResolver(sheet.mergedCells);
  const mergedRows = getMergedAxisIndexes(input.range, sheet.mergedCells, "row");
  const manualRows = new Set<number>();
  const measured = new Map<number, number>();

  for (const row of sheet.rowHeights.keys()) {
    if (
      row >= input.range.start.row &&
      row <= input.range.end.row &&
      !isAxisHidden(sheet, "row", row) &&
      !mergedRows.has(row)
    ) {
      manualRows.add(row);
    }
  }
  for (const [key, cell] of sheet.cells) {
    const address = parseCellAddress(key);
    if (
      !address ||
      !isInRange(address, input.range) ||
      cell.content?.kind === "image" ||
      isAxisHidden(sheet, "row", address.row) ||
      isAxisHidden(sheet, "column", address.column) ||
      mergedRows.has(address.row) ||
      merged.getRangeAtAddress(address)
    )
      continue;
    const { text, value } = getFormattedCellText(input, address, cell);
    if (!text) continue;
    const height = getAutoFitRowHeight(
      text,
      value,
      cell,
      getColumnWidth(sheet, address.column),
      input.measurer,
    );
    measured.set(address.row, Math.max(measured.get(address.row) ?? 0, height));
  }

  return new Map(
    [...new Set([...manualRows, ...measured.keys()])]
      .map((row) => [row, measured.get(row) ?? DEFAULT_ROW_HEIGHT] as const)
      .filter(([row, height]) => differs(sheet.rowHeights.get(row), height, DEFAULT_ROW_HEIGHT)),
  );
}

/**
 * Measures each selected, visible column against its populated visible cells.
 * Wrapped text is measured as its unwrapped paragraphs so AutoFit exposes the
 * displayed value instead of preserving a narrow, clipped column.
 */
export function getAutoFitColumnWidths(input: AxisAutoFitInput): Map<number, number> {
  const sheet = input.sheet;
  const merged = new MergedCellRangeResolver(sheet.mergedCells);
  const defaultWidth = sheet.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH;
  const mergedColumns = getMergedAxisIndexes(input.range, sheet.mergedCells, "column");
  const manualColumns = new Set<number>();
  const measured = new Map<number, number>();

  for (const column of sheet.columnWidths.keys()) {
    if (
      column < input.range.start.column ||
      column > input.range.end.column ||
      isAxisHidden(sheet, "column", column) ||
      mergedColumns.has(column)
    )
      continue;
    manualColumns.add(column);
  }
  for (const [key, cell] of sheet.cells) {
    const address = parseCellAddress(key);
    if (
      !address ||
      !isInRange(address, input.range) ||
      cell.content?.kind === "image" ||
      isAxisHidden(sheet, "row", address.row) ||
      isAxisHidden(sheet, "column", address.column) ||
      mergedColumns.has(address.column) ||
      merged.getRangeAtAddress(address)
    )
      continue;
    const { text, value } = getFormattedCellText(input, address, cell);
    if (!text) continue;
    const width = getAutoFitColumnWidth(text, value, cell, input.measurer);
    measured.set(address.column, Math.max(measured.get(address.column) ?? 0, width));
  }

  return new Map(
    [...new Set([...manualColumns, ...measured.keys()])]
      .map((column) => [column, measured.get(column) ?? defaultWidth] as const)
      .filter(([column, width]) => differs(sheet.columnWidths.get(column), width, defaultWidth)),
  );
}
