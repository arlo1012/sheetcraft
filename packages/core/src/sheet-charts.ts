import {
  normalizeChartSource,
  type ChartSeriesSource,
  type ChartSourceDiagnostic,
} from "./chart-source.js";
import { getChartSourceData } from "./chart-source-data.js";
import {
  getCellStyle,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";
import { normalizeCellNumberFormat, type CellNumberFormat } from "./style.js";

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
/** Sparse element layout choices; omission retains the existing chart behavior. */
export type ChartElementSettings = {
  titlePosition?: "none" | "above" | "overlay";
  legendPosition?: "top" | "bottom" | "left" | "right" | "topRight";
  /** False reserves plot space for the legend. */
  legendOverlay?: boolean;
  labelPosition?: "center" | "insideEnd" | "insideBase" | "outsideEnd";
};
export type SheetChart = {
  /** Ordered live sources, exclusive of rectangle and PivotTable/cache sources. */
  source?: ChartSeriesSource;
  pivotTableId?: string;
  /** Values retained when a PivotTable is removed; no worksheet data dependency. */
  dataCache?: ChartData;
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
  elements?: ChartElementSettings;
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
function normalizeChartElementSettings(value: unknown): ChartElementSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid chart element settings.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart element settings must be an ordinary data record.");
  const keys = ["titlePosition", "legendPosition", "legendOverlay", "labelPosition"] as const;
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key))
      throw new TypeError("Chart element settings must be own data fields.");
  const source: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key as (typeof keys)[number]))
      throw new TypeError("Unknown chart element setting.");
    if (!("value" in field))
      throw new TypeError("Chart element settings require own data fields, not accessors.");
    source[key] = field.value as unknown;
  }
  const result: ChartElementSettings = {};
  if (Object.hasOwn(source, "titlePosition")) {
    if (!["none", "above", "overlay"].includes(source.titlePosition as string))
      throw new RangeError("Invalid chart title position.");
    result.titlePosition = source.titlePosition as ChartElementSettings["titlePosition"];
  }
  if (Object.hasOwn(source, "legendPosition")) {
    if (!["top", "bottom", "left", "right", "topRight"].includes(source.legendPosition as string))
      throw new RangeError("Invalid chart legend position.");
    result.legendPosition = source.legendPosition as ChartElementSettings["legendPosition"];
  }
  if (Object.hasOwn(source, "legendOverlay")) {
    if (typeof source.legendOverlay !== "boolean")
      throw new TypeError("Chart legend overlay must be a boolean.");
    result.legendOverlay = source.legendOverlay;
  }
  if (Object.hasOwn(source, "labelPosition")) {
    if (
      !["center", "insideEnd", "insideBase", "outsideEnd"].includes(source.labelPosition as string)
    )
      throw new RangeError("Invalid chart label position.");
    result.labelPosition = source.labelPosition as ChartElementSettings["labelPosition"];
  }
  return result;
}
export function normalizeSheetChart(chart: SheetChart): SheetChart {
  let source: ChartSeriesSource | undefined;
  if (chart && typeof chart === "object" && "source" in chart) {
    const field = Object.getOwnPropertyDescriptor(chart, "source");
    if (!field || !("value" in field))
      throw new TypeError("Chart source must be an own data field, not an accessor.");
    source = normalizeChartSource(field.value);
  }
  let elements: ChartElementSettings | undefined;
  if (chart && typeof chart === "object" && "elements" in chart) {
    const field = Object.getOwnPropertyDescriptor(chart, "elements");
    if (!field || !("value" in field))
      throw new TypeError("Chart elements must be an own data field, not an accessor.");
    elements = normalizeChartElementSettings(field.value);
  }
  if (
    !chart ||
    (source !== undefined &&
      (chart.range !== null ||
        chart.pivotTableId !== undefined ||
        chart.dataCache !== undefined ||
        !["column", "bar", "line", "area", "radar"].includes(chart.type))) ||
    (chart.pivotTableId !== undefined && chart.dataCache !== undefined) ||
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
    ...(source !== undefined ? { source } : {}),
    ...(chart.pivotTableId ? { pivotTableId: chart.pivotTableId } : {}),
    ...(chart.dataCache !== undefined
      ? { dataCache: normalizeChartDataCache(chart.dataCache) }
      : {}),
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
    ...(elements !== undefined ? { elements } : {}),
  };
}
export type ChartSeries = {
  id?: string;
  colorIndex?: number;
  name: string;
  values: Array<number | null>;
  numberFormat?: CellNumberFormat;
};
export type ChartData = {
  /** Derived only; not part of static caches or snapshots. */
  diagnostics?: ChartSourceDiagnostic[];
  categories: string[];
  series: ChartSeries[];
  records: Array<Array<string | number | null>>;
};
/** Validate and clone persisted static chart values at the document boundary. */
export function normalizeChartDataCache(data: ChartData): ChartData {
  const text = (value: unknown): value is string =>
    typeof value === "string" && value.length <= 32767;
  const number = (value: unknown): value is number | null =>
    value === null || (typeof value === "number" && Number.isFinite(value));
  if (
    !data ||
    !Array.isArray(data.categories) ||
    !data.categories.every(text) ||
    !Array.isArray(data.series) ||
    !Array.isArray(data.records) ||
    data.categories.length > 10000 ||
    data.series.length > 10000 ||
    data.records.length > 10000 ||
    data.categories.length * Math.max(1, data.series.length) > 10000 ||
    data.series.some(
      (entry) =>
        !entry ||
        !text(entry.name) ||
        !Array.isArray(entry.values) ||
        entry.values.length !== data.categories.length ||
        !entry.values.every(number),
    ) ||
    data.records.some(
      (row) => !Array.isArray(row) || row.some((value) => !text(value) && !number(value)),
    ) ||
    data.records.reduce((count, row) => count + row.length, 0) > 10000
  )
    throw new RangeError("Invalid cached chart data.");
  return {
    categories: [...data.categories],
    series: data.series.map((entry) => ({
      name: entry.name,
      values: [...entry.values],
      ...(entry.numberFormat !== undefined
        ? { numberFormat: normalizeCellNumberFormat(entry.numberFormat) }
        : {}),
    })),
    records: data.records.map((row) => [...row]),
  };
}
export function getSheetChartData(
  sheet: Sheet,
  chart: SheetChart,
  evaluator: SheetEvaluator,
  resolveSheet?: (sheetId: string) => Sheet | undefined,
): ChartData {
  if ("source" in chart)
    return getChartSourceData(sheet, normalizeSheetChart(chart), evaluator, resolveSheet);
  if (chart.dataCache !== undefined) return normalizeChartDataCache(chart.dataCache);
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
    const sourceColumns: number[] = [];
    for (let column = range.start.column + labelColumns; column <= endColumn; column++) {
      if (!chart.showHidden && sheet.hiddenColumns?.has(column)) continue;
      sourceColumns.push(column);
      const measure =
        pivot.values[(column - range.start.column - labelColumns) % pivot.values.length];
      const displayType = measure?.display?.type;
      const numberFormat =
        measure?.numberFormat ??
        (displayType?.startsWith("percent")
          ? { kind: "custom" as const, code: "0.00%" }
          : undefined);
      series.push({
        ...(numberFormat ? { numberFormat: { ...numberFormat } } : {}),
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
    }
    const dataRows =
      pivot.resultLayout?.dataRows ??
      Array.from({ length: Math.max(0, endRow - range.start.row) }, (_, index) => index + 1);
    for (const [rowIndex, offset] of dataRows.entries()) {
      const row = range.start.row + offset;
      if (row > range.end.row || (!chart.showHidden && sheet.hiddenRows?.has(row))) continue;
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
          column: sourceColumns[index]!,
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
  const seriesFormat = (addresses: Array<{ row: number; column: number }>) => {
    const formats = addresses
      .filter(({ row, column }) => numeric(row, column) !== null)
      .map((address) => getCellStyle(sheet, address)?.numberFormat);
    const first = formats[0];
    return first && formats.every((format) => JSON.stringify(format) === JSON.stringify(first))
      ? { numberFormat: { ...first } }
      : {};
  };
  if (chart.seriesBy === "rows")
    return {
      categories: columns.map((column, index) =>
        chart.headerRow ? String(read(range.start.row, column) ?? "") : String(index + 1),
      ),
      series: rows.map((row, index) => ({
        ...seriesFormat(columns.map((column) => ({ row, column }))),
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
      ...seriesFormat(rows.map((row) => ({ row, column }))),
      name: chart.headerRow ? String(read(range.start.row, column) ?? "") : String(index + 1),
      values: rows.map((row) => numeric(row, column)),
    })),
    records,
  };
}
