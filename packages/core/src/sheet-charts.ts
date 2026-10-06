import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";
export type ChartType =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "scatter"
  | "radar"
  | "treemap"
  | "sankey"
  | "river"
  | "wordCloud";
export type SheetChart = {
  pivotTableId?: string;
  type: ChartType;
  /** Null means structural edits deleted or split the source range. */
  range: CellRange | null;
  title: string;
  headerRow: boolean;
  headerColumn: boolean;
  seriesBy: "columns" | "rows";
  legend: boolean;
  labels: boolean;
  stacked: boolean;
  showHidden: boolean;
};
const types = new Set([
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
]);
export function normalizeSheetChart(chart: SheetChart): SheetChart {
  if (
    !chart ||
    (chart.pivotTableId !== undefined &&
      (typeof chart.pivotTableId !== "string" || !chart.pivotTableId.trim())) ||
    !types.has(chart.type) ||
    typeof chart.title !== "string" ||
    chart.title.length > 1000 ||
    !["columns", "rows"].includes(chart.seriesBy) ||
    ["headerRow", "headerColumn", "legend", "labels", "stacked", "showHidden"].some(
      (key) => typeof chart[key as keyof SheetChart] !== "boolean",
    )
  )
    throw new RangeError("Invalid chart.");
  const range = chart.range;
  if (
    range !== null &&
    (!range ||
      !range.start ||
      !range.end ||
      [range.start.row, range.start.column, range.end.row, range.end.column].some(
        (index) => !Number.isInteger(index) || index < 0,
      ) ||
      range.end.row >= MAX_SHEET_ROWS ||
      range.end.column >= MAX_SHEET_COLUMNS ||
      range.start.row > range.end.row ||
      range.start.column > range.end.column ||
      (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) > 10000)
  )
    throw new RangeError("Chart source must contain at most 10,000 cells.");
  return {
    ...(chart.pivotTableId ? { pivotTableId: chart.pivotTableId } : {}),
    type: chart.type,
    range: range ? { start: { ...range.start }, end: { ...range.end } } : null,
    title: chart.title,
    headerRow: chart.headerRow,
    headerColumn: chart.headerColumn,
    seriesBy: chart.seriesBy,
    legend: chart.legend,
    labels: chart.labels,
    stacked: chart.stacked,
    showHidden: chart.showHidden,
  };
}
export type ChartSeries = { name: string; values: Array<number | null> };
export type ChartData = {
  categories: string[];
  series: ChartSeries[];
  records: Array<Array<string | number | null>>;
};
export function getSheetChartData(
  sheet: Sheet,
  chart: SheetChart,
  evaluator: SheetEvaluator,
): ChartData {
  if (chart.pivotTableId) {
    const pivot = sheet.pivotTables?.find((table) => table.id === chart.pivotTableId);
    const range = pivot?.outputRange;
    if (!pivot || !range) return { categories: [], series: [], records: [] };
    const labelColumns = pivot.resultLayout?.labelColumns ?? Math.max(1, pivot.rowFields.length);
    const endRow = range.end.row - (pivot.rowTotals && pivot.rowFields.length ? 1 : 0);
    const endColumn =
      range.end.column -
      (pivot.columnTotals && pivot.columnFields.length ? pivot.values.length : 0);
    const categories: string[] = [];
    const series: ChartSeries[] = [];
    const records: ChartData["records"] = [];
    for (let column = range.start.column + labelColumns; column <= endColumn; column++)
      series.push({
        name:
          pivot.resultLayout?.seriesLabels?.[column - range.start.column - labelColumns] ??
          String(
            evaluator.getComputedValue({
              row: range.start.row + (pivot.resultLayout?.headerRows ?? 1) - 1,
              column,
            }) ?? "",
          ),
        values: [],
      });
    const dataRows =
      pivot.resultLayout?.dataRows ??
      Array.from({ length: Math.max(0, endRow - range.start.row) }, (_, index) => index + 1);
    for (const [rowIndex, offset] of dataRows.entries()) {
      const row = range.start.row + offset;
      if (row > range.end.row) continue;
      const name =
        pivot.resultLayout?.rowLabels[rowIndex] ??
        Array.from({ length: labelColumns }, (_, index) =>
          String(evaluator.getComputedValue({ row, column: range.start.column + index }) ?? ""),
        ).join(" / ");
      categories.push(name);
      const record: Array<string | number | null> = [name];
      series.forEach((entry, index) => {
        const value = evaluator.getComputedValue({
          row,
          column: range.start.column + labelColumns + index,
        });
        const number = typeof value === "number" && Number.isFinite(value) ? value : null;
        entry.values.push(number);
        record.push(number);
      });
      records.push(record);
    }
    return { categories, series, records };
  }
  const { range } = normalizeSheetChart(chart);
  if (!range) return { categories: [], series: [], records: [] };
  const rows: number[] = [];
  const columns: number[] = [];
  for (let row = range.start.row + (chart.headerRow ? 1 : 0); row <= range.end.row; row++)
    if (chart.showHidden || !sheet.hiddenRows?.has(row)) rows.push(row);
  for (
    let column = range.start.column + (chart.headerColumn ? 1 : 0);
    column <= range.end.column;
    column++
  )
    if (chart.showHidden || !sheet.hiddenColumns?.has(column)) columns.push(column);
  const read = (row: number, column: number): string | number | null => {
    const value = evaluator.getComputedValue({ row, column });
    return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
      ? value
      : null;
  };
  const numeric = (row: number, column: number): number | null => {
    const value = read(row, column);
    return typeof value === "number" ? value : null;
  };
  const records = rows.map((row) => {
    const record: Array<string | number | null> = [];
    for (let column = range.start.column; column <= range.end.column; column++)
      record.push(read(row, column));
    return record;
  });
  if (chart.seriesBy === "rows")
    return {
      categories: columns.map((column, index) =>
        chart.headerRow ? String(read(range.start.row, column) ?? "") : String(index + 1),
      ),
      series: rows.map((row, index) => ({
        name: chart.headerColumn ? String(read(row, range.start.column) ?? "") : String(index + 1),
        values: columns.map((column) => numeric(row, column)),
      })),
      records,
    };
  return {
    categories: rows.map((row, index) =>
      chart.headerColumn ? String(read(row, range.start.column) ?? "") : String(index + 1),
    ),
    series: columns.map((column, index) => ({
      name: chart.headerRow ? String(read(range.start.row, column) ?? "") : String(index + 1),
      values: rows.map((row) => numeric(row, column)),
    })),
    records,
  };
}
