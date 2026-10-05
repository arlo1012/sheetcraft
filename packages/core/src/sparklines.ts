import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";
export type CellSparkline = {
  type: "line" | "column" | "winLoss";
  source: CellRange | null;
  color: string;
  negativeColor: string;
  markers: boolean;
  axis: boolean;
  showHidden: boolean;
  empty: "gap" | "zero" | "connect";
};
export function normalizeCellSparkline(
  value: CellSparkline | null | undefined,
): CellSparkline | undefined {
  if (value == null) return undefined;
  if (
    !["line", "column", "winLoss"].includes(value.type) ||
    !["gap", "zero", "connect"].includes(value.empty) ||
    typeof value.color !== "string" ||
    typeof value.negativeColor !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(value.color) ||
    !/^#[0-9a-f]{6}$/i.test(value.negativeColor) ||
    ["markers", "axis", "showHidden"].some(
      (key) => typeof value[key as keyof CellSparkline] !== "boolean",
    )
  )
    throw new RangeError("Invalid sparkline.");
  const source = value.source;
  if (
    source !== null &&
    (!source ||
      !source.start ||
      !source.end ||
      [source.start.row, source.start.column, source.end.row, source.end.column].some(
        (index) => !Number.isInteger(index) || index < 0,
      ) ||
      source.end.row >= MAX_SHEET_ROWS ||
      source.end.column >= MAX_SHEET_COLUMNS ||
      source.start.row > source.end.row ||
      source.start.column > source.end.column ||
      (source.start.row !== source.end.row && source.start.column !== source.end.column) ||
      Math.max(source.end.row - source.start.row, source.end.column - source.start.column) >= 10000)
  )
    throw new RangeError("A sparkline needs one row or column of at most 10,000 cells.");
  return {
    type: value.type,
    source: source ? { start: { ...source.start }, end: { ...source.end } } : null,
    color: value.color,
    negativeColor: value.negativeColor,
    markers: value.markers,
    axis: value.axis,
    showHidden: value.showHidden,
    empty: value.empty,
  };
}
export const cloneCellSparkline = normalizeCellSparkline;
export function translateCellSparkline(
  value: CellSparkline | null | undefined,
  delta: CellAddress,
): CellSparkline | undefined {
  const sparkline = cloneCellSparkline(value);
  if (!sparkline?.source) return sparkline;
  const source = {
    start: {
      row: sparkline.source.start.row + delta.row,
      column: sparkline.source.start.column + delta.column,
    },
    end: {
      row: sparkline.source.end.row + delta.row,
      column: sparkline.source.end.column + delta.column,
    },
  };
  return {
    ...sparkline,
    source:
      source.start.row < 0 ||
      source.start.column < 0 ||
      source.end.row >= MAX_SHEET_ROWS ||
      source.end.column >= MAX_SHEET_COLUMNS
        ? null
        : source,
  };
}
export function getSparklineValues(
  sheet: Sheet,
  value: CellSparkline,
  evaluator: SheetEvaluator,
): Array<number | null> {
  const sparkline = normalizeCellSparkline(value)!;
  if (!sparkline.source) return [];
  const { start, end } = sparkline.source;
  const values: Array<number | null> = [];
  for (let row = start.row; row <= end.row; row++)
    for (let column = start.column; column <= end.column; column++) {
      if (!sparkline.showHidden && (sheet.hiddenRows?.has(row) || sheet.hiddenColumns?.has(column)))
        continue;
      const value = evaluator.getComputedValue({ row, column });
      values.push(
        typeof value === "number" && Number.isFinite(value)
          ? value
          : value == null || value === ""
            ? sparkline.empty === "zero"
              ? 0
              : null
            : null,
      );
    }
  return values;
}
