import {
  MAX_CELL_STYLE_PATCH_CELLS,
  areCellNumberFormatsEqual,
  cloneCellNumberFormat,
  type CellNumberFormat,
  type CellBorder,
  type CellStyle,
  type HorizontalCellAlignment,
  type VerticalCellAlignment,
} from "./style.js";
import { MergedCellRangeResolver } from "./merged-cells.js";
import { getCellStyle, isCellAddressInBounds, type CellRange, type Sheet } from "./workbook.js";

export type ToggleStyleState = "on" | "off" | "mixed";

export type StyleValueState<Value> = {
  value: Value | undefined;
  mixed: boolean;
};

export type SelectionCellStyleState = {
  fontFamily: StyleValueState<string>;
  fontSize: StyleValueState<number>;
  bold: ToggleStyleState;
  italic: ToggleStyleState;
  underline: ToggleStyleState;
  textColor: StyleValueState<string>;
  fillColor: StyleValueState<string>;
  horizontalAlign: StyleValueState<HorizontalCellAlignment>;
  verticalAlign: StyleValueState<VerticalCellAlignment>;
  wrapText: ToggleStyleState;
  numberFormat: StyleValueState<CellNumberFormat>;
};

export type SelectionBorderState = {
  top: StyleValueState<CellBorder>;
  right: StyleValueState<CellBorder>;
  bottom: StyleValueState<CellBorder>;
  left: StyleValueState<CellBorder>;
  innerHorizontal: StyleValueState<CellBorder>;
  innerVertical: StyleValueState<CellBorder>;
  diagonalUp: StyleValueState<CellBorder>;
  diagonalDown: StyleValueState<CellBorder>;
};

type ValueAccumulator<Value> = {
  initialized: boolean;
  value: Value | undefined;
  mixed: boolean;
};

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function addValue<Value>(
  accumulator: ValueAccumulator<Value>,
  value: Value | undefined,
  equals: (left: Value | undefined, right: Value | undefined) => boolean = Object.is,
): void {
  if (!accumulator.initialized) {
    accumulator.initialized = true;
    accumulator.value = value;
  } else if (!equals(accumulator.value, value)) {
    accumulator.mixed = true;
  }
}

function createAccumulator<Value>(): ValueAccumulator<Value> {
  return { initialized: false, value: undefined, mixed: false };
}

function areBordersEqual(left: CellBorder | undefined, right: CellBorder | undefined): boolean {
  return left?.style === right?.style && left?.color === right?.color;
}

function cloneBorder(border: CellBorder | undefined): CellBorder | undefined {
  return border && { ...border };
}

function toValueState<Value>(accumulator: ValueAccumulator<Value>): StyleValueState<Value> {
  return { value: accumulator.value, mixed: accumulator.mixed };
}

function toToggleState(accumulator: ValueAccumulator<true>): ToggleStyleState {
  if (accumulator.mixed) {
    return "mixed";
  }
  return accumulator.value ? "on" : "off";
}

function parseCellKey(key: string): { row: number; column: number } {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

export function createDefaultSelectionCellStyleState(): SelectionCellStyleState {
  return {
    fontFamily: { value: undefined, mixed: false },
    fontSize: { value: undefined, mixed: false },
    bold: "off",
    italic: "off",
    underline: "off",
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
    verticalAlign: { value: undefined, mixed: false },
    wrapText: "off",
    numberFormat: { value: undefined, mixed: false },
  };
}

export function getCellRangeSize(range: CellRange): number {
  const normalized = normalizeRange(range);
  return (
    (normalized.end.row - normalized.start.row + 1) *
    (normalized.end.column - normalized.start.column + 1)
  );
}

export function isCellStyleRangeSupported(range: CellRange): boolean {
  return getCellRangeSize(range) <= MAX_CELL_STYLE_PATCH_CELLS;
}

export function getSelectionCellStyleState(
  sheet: Sheet,
  range: CellRange,
): SelectionCellStyleState {
  const normalized = normalizeRange(range);
  const fontFamily = createAccumulator<string>();
  const fontSize = createAccumulator<number>();
  const bold = createAccumulator<true>();
  const italic = createAccumulator<true>();
  const underline = createAccumulator<true>();
  const textColor = createAccumulator<string>();
  const fillColor = createAccumulator<string>();
  const horizontalAlign = createAccumulator<HorizontalCellAlignment>();
  const verticalAlign = createAccumulator<VerticalCellAlignment>();
  const wrapText = createAccumulator<true>();
  const numberFormat = createAccumulator<CellNumberFormat>();
  let materializedCellCount = 0;

  const addStyle = (style: CellStyle | undefined) => {
    addValue(fontFamily, style?.fontFamily);
    addValue(fontSize, style?.fontSize);
    addValue(bold, style?.bold);
    addValue(italic, style?.italic);
    addValue(underline, style?.underline);
    addValue(textColor, style?.textColor);
    addValue(fillColor, style?.fillColor);
    addValue(horizontalAlign, style?.horizontalAlign);
    addValue(verticalAlign, style?.verticalAlign);
    addValue(wrapText, style?.wrapText);
    addValue(numberFormat, cloneCellNumberFormat(style?.numberFormat), areCellNumberFormatsEqual);
  };

  const rangeSize = getCellRangeSize(normalized);
  if (rangeSize <= sheet.cells.size) {
    for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
      for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
        addStyle(getCellStyle(sheet, { row, column }) as CellStyle | undefined);
      }
    }
  } else {
    for (const [key, cell] of sheet.cells) {
      const address = parseCellKey(key);
      if (
        address.row < normalized.start.row ||
        address.row > normalized.end.row ||
        address.column < normalized.start.column ||
        address.column > normalized.end.column
      ) {
        continue;
      }
      materializedCellCount += 1;
      addStyle(cell.style);
    }

    if (materializedCellCount < rangeSize) {
      addStyle(undefined);
    }
  }

  return {
    fontFamily: toValueState(fontFamily),
    fontSize: toValueState(fontSize),
    bold: toToggleState(bold),
    italic: toToggleState(italic),
    underline: toToggleState(underline),
    textColor: toValueState(textColor),
    fillColor: toValueState(fillColor),
    horizontalAlign: toValueState(horizontalAlign),
    verticalAlign: toValueState(verticalAlign),
    wrapText: toToggleState(wrapText),
    numberFormat: toValueState(numberFormat),
  };
}

export function getSelectionBorderState(sheet: Sheet, range: CellRange): SelectionBorderState {
  const normalized = normalizeRange(range);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const top = createAccumulator<CellBorder>();
  const right = createAccumulator<CellBorder>();
  const bottom = createAccumulator<CellBorder>();
  const left = createAccumulator<CellBorder>();
  const innerHorizontal = createAccumulator<CellBorder>();
  const innerVertical = createAccumulator<CellBorder>();
  const diagonalUp = createAccumulator<CellBorder>();
  const diagonalDown = createAccumulator<CellBorder>();
  const styleAt = (row: number, column: number) => {
    const address = { row, column };
    if (!isCellAddressInBounds(address)) return undefined;
    return getCellStyle(sheet, mergeResolver.getAnchor(address) ?? address);
  };
  const horizontal = (rowEdge: number, column: number) => {
    const upperAddress = { row: rowEdge - 1, column };
    const lowerAddress = { row: rowEdge, column };
    const upperRange = mergeResolver.getRangeAtAddress(upperAddress);
    const lowerRange = mergeResolver.getRangeAtAddress(lowerAddress);
    const upper =
      isCellAddressInBounds(upperAddress) &&
      (!upperRange || upperRange.end.row === upperAddress.row)
        ? styleAt(upperAddress.row, upperAddress.column)?.borderBottom
        : undefined;
    const lower =
      isCellAddressInBounds(lowerAddress) &&
      (!lowerRange || lowerRange.start.row === lowerAddress.row)
        ? styleAt(lowerAddress.row, lowerAddress.column)?.borderTop
        : undefined;
    return upper ?? lower;
  };
  const vertical = (row: number, columnEdge: number) => {
    const leftAddress = { row, column: columnEdge - 1 };
    const rightAddress = { row, column: columnEdge };
    const leftRange = mergeResolver.getRangeAtAddress(leftAddress);
    const rightRange = mergeResolver.getRangeAtAddress(rightAddress);
    const left =
      isCellAddressInBounds(leftAddress) &&
      (!leftRange || leftRange.end.column === leftAddress.column)
        ? styleAt(leftAddress.row, leftAddress.column)?.borderRight
        : undefined;
    const right =
      isCellAddressInBounds(rightAddress) &&
      (!rightRange || rightRange.start.column === rightAddress.column)
        ? styleAt(rightAddress.row, rightAddress.column)?.borderLeft
        : undefined;
    return left ?? right;
  };
  const add = (accumulator: ValueAccumulator<CellBorder>, border: CellBorder | undefined) =>
    addValue(accumulator, cloneBorder(border), areBordersEqual);

  for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
    add(top, horizontal(normalized.start.row, column));
    add(bottom, horizontal(normalized.end.row + 1, column));
  }
  const diagonalAnchors = new Set<string>();
  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    add(left, vertical(row, normalized.start.column));
    add(right, vertical(row, normalized.end.column + 1));
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      const address = { row, column };
      const anchor = mergeResolver.getAnchor(address) ?? address;
      const key = `${anchor.row}:${anchor.column}`;
      if (diagonalAnchors.has(key)) continue;
      diagonalAnchors.add(key);
      const style = styleAt(anchor.row, anchor.column);
      add(diagonalUp, style?.borderDiagonalUp);
      add(diagonalDown, style?.borderDiagonalDown);
    }
  }
  for (let row = normalized.start.row + 1; row <= normalized.end.row; row += 1) {
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      add(innerHorizontal, horizontal(row, column));
    }
  }
  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    for (let column = normalized.start.column + 1; column <= normalized.end.column; column += 1) {
      add(innerVertical, vertical(row, column));
    }
  }
  return {
    top: toValueState(top),
    right: toValueState(right),
    bottom: toValueState(bottom),
    left: toValueState(left),
    innerHorizontal: toValueState(innerHorizontal),
    innerVertical: toValueState(innerVertical),
    diagonalUp: toValueState(diagonalUp),
    diagonalDown: toValueState(diagonalDown),
  };
}
