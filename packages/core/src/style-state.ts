import {
  MAX_CELL_STYLE_PATCH_CELLS,
  areCellNumberFormatsEqual,
  cloneCellNumberFormat,
  type CellNumberFormat,
  type CellStyle,
  type HorizontalCellAlignment,
  type VerticalCellAlignment,
} from "./style.js";
import { getCellStyle, type CellRange, type Sheet } from "./workbook.js";

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
