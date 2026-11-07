import { calendarDateFormat } from "@sheetcraft/core/number-format";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  getCellStyle,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";

/** Conservative initial interpretation for new range charts only; never used on edit. */
export function inferChartInsertHeaders(
  sheet: Sheet,
  chart: SheetChart,
  evaluator: SheetEvaluator,
): Pick<SheetChart, "headerRow" | "headerColumn"> {
  const range = chart.range;
  if (!range || chart.source || chart.dataCache || chart.pivotTableId)
    return { headerRow: chart.headerRow, headerColumn: chart.headerColumn };
  const visible = ({ row, column }: CellAddress) =>
    chart.showHidden || (!sheet.hiddenRows?.has(row) && !sheet.hiddenColumns?.has(column));
  function textBand(addresses: CellAddress[]): boolean {
    const values = addresses.filter(visible).map((address) => evaluator.getComputedValue(address));
    const nonblank = values.filter((value) => value !== null && value !== "");
    return (
      nonblank.length > 0 &&
      nonblank.every((value) => typeof value === "string" && value.trim() !== "")
    );
  }
  function dateLabels(axis: "rows" | "columns") {
    if (chart.type !== "stock" || chart.seriesBy !== axis || !range) return false;
    const vertical = axis === "columns";
    const length = vertical
      ? range.end.row - range.start.row + 1
      : range.end.column - range.start.column + 1;
    for (let i = 0; i < Math.min(32, length); i++) {
      const address = {
        row: range.start.row + (vertical ? i : 0),
        column: range.start.column + (vertical ? 0 : i),
      };
      if (!visible(address)) continue;
      const value = evaluator.getComputedValue(address);
      if (value === null || value === "" || (i === 0 && typeof value === "string")) continue;
      return (
        typeof value === "number" &&
        !!calendarDateFormat(getCellStyle(sheet, address)?.numberFormat)
      );
    }
    return false;
  }
  const { start, end } = range;
  try {
    // Read evaluated values, not raw formulas or formatted date strings. Blank,
    // numeric, mixed, boolean and error bands do not imply textual headers.
    return {
      headerRow:
        end.row > start.row &&
        !(!chart.showHidden && sheet.hiddenRows?.has(start.row)) &&
        (dateLabels("rows") ||
          textBand(
            Array.from({ length: Math.min(32, end.column - start.column + 1) }, (_, index) => ({
              row: start.row,
              column: start.column + index,
            })),
          )),
      headerColumn:
        chart.type !== "scatter" &&
        chart.type !== "bubble" &&
        end.column > start.column &&
        !(!chart.showHidden && sheet.hiddenColumns?.has(start.column)) &&
        (dateLabels("columns") ||
          textBand(
            Array.from({ length: Math.min(32, end.row - start.row + 1) }, (_, index) => ({
              row: start.row + index,
              column: start.column,
            })),
          )),
    };
  } catch {
    // Do not consume an unknown first band as a header. Existing source
    // diagnostics remain responsible for explaining evaluation failures.
    return { headerRow: false, headerColumn: false };
  }
}
