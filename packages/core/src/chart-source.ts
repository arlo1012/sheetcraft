import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeTextBoxTextReference } from "./text-box-reference.js";
import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";
import type { CellAddress, CellRange, Sheet } from "./workbook.js";

export const MAX_CHART_SOURCE_CELLS = 10000;
export const MAX_CHART_SOURCE_SERIES = 256;
export type ChartSourceName =
  | { kind: "literal"; text: string }
  | { kind: "cell"; sheetId: string; cell: CellAddress | null };
export type ChartSourceValues =
  | { kind: "literal"; values: number[] }
  | { kind: "range"; sheetId: string; range: CellRange | null };
export type ChartSourceCategories =
  | { kind: "generated" }
  | { kind: "range"; sheetId: string; range: CellRange | null };
export type ChartSourceSeries = {
  id: string;
  /** Stable palette position, independent of the ordered series list. */
  colorIndex: number;
  name: ChartSourceName;
  values: ChartSourceValues;
};
/** Authoritative ordered sources. Null references are permanent deletion tombstones. */
export type ChartSeriesSource = {
  kind: "series";
  categories: ChartSourceCategories;
  series: ChartSourceSeries[];
};
export type ChartSourceDiagnostic = {
  code: "blank" | "text" | "error" | "broken-reference" | "length-mismatch" | "hidden";
  role: "name" | "categories" | "values";
  seriesId?: string;
  /** Source ordinal before the shared visibility mask. */
  index?: number;
};
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart source requires an ordinary data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart source requires an ordinary data record.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart source requires known own data fields, not accessors.");
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      throw new TypeError("Chart source requires complete own data.");
  return result;
}
function tag(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const field = Object.getOwnPropertyDescriptor(value, "kind");
  return field && "value" in field ? field.value : undefined;
}
function sheetId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024)
    throw new RangeError("Chart reference sheet ID must be a bounded nonempty string.");
  return value;
}
/** A chart vector is a bounded absolute single row or column; no unions or formulas. */
export function normalizeChartSourceRange(value: unknown): CellRange | null {
  if (value === null) return null;
  const source = record(value, ["start", "end"]);
  const address = (entry: unknown): CellAddress => {
    const point = record(entry, ["row", "column"]);
    if (
      typeof point.row !== "number" ||
      !Number.isInteger(point.row) ||
      point.row < 0 ||
      point.row >= MAX_SHEET_ROWS ||
      typeof point.column !== "number" ||
      !Number.isInteger(point.column) ||
      point.column < 0 ||
      point.column >= MAX_SHEET_COLUMNS
    )
      throw new RangeError("Chart source addresses must be bounded absolute cells.");
    return { row: point.row, column: point.column };
  };
  const start = address(source.start),
    end = address(source.end);
  if (
    start.row > end.row ||
    start.column > end.column ||
    (start.row !== end.row && start.column !== end.column) ||
    Math.max(end.row - start.row, end.column - start.column) + 1 > MAX_CHART_SOURCE_CELLS
  )
    throw new RangeError("Chart source must be a bounded single-row or single-column vector.");
  return { start, end };
}
export function getChartSourceRangeLength(range: CellRange | null): number {
  return range
    ? Math.max(range.end.row - range.start.row, range.end.column - range.start.column) + 1
    : 0;
}
function normalizeName(value: unknown): ChartSourceName {
  if (tag(value) === "literal") {
    const source = record(value, ["kind", "text"]);
    if (typeof source.text !== "string" || source.text.length > 32767)
      throw new RangeError("Chart series names must be bounded text.");
    return { kind: "literal", text: source.text };
  }
  const source = record(value, ["kind", "sheetId", "cell"]);
  if (source.kind !== "cell") throw new TypeError("Unknown chart name source.");
  return {
    kind: "cell",
    ...normalizeTextBoxTextReference({ sheetId: source.sheetId, cell: source.cell }),
  };
}
function normalizeValues(value: unknown): ChartSourceValues {
  if (tag(value) === "literal") {
    const source = record(value, ["kind", "values"]);
    const entries = readPictureDataArray<unknown>(
      source.values as readonly unknown[],
      "chart literal values",
      MAX_CHART_SOURCE_CELLS,
    );
    const values = entries.map((entry) => {
      if (typeof entry !== "number" || !Number.isFinite(entry))
        throw new RangeError("Chart literal values must be finite numbers.");
      return entry;
    });
    return { kind: "literal", values };
  }
  const source = record(value, ["kind", "sheetId", "range"]);
  if (source.kind !== "range") throw new TypeError("Unknown chart values source.");
  return {
    kind: "range",
    sheetId: sheetId(source.sheetId),
    range: normalizeChartSourceRange(source.range),
  };
}
function normalizeCategories(value: unknown): ChartSourceCategories {
  if (tag(value) === "generated") {
    record(value, ["kind"]);
    return { kind: "generated" };
  }
  const source = record(value, ["kind", "sheetId", "range"]);
  if (source.kind !== "range") throw new TypeError("Unknown chart category source.");
  return {
    kind: "range",
    sheetId: sheetId(source.sheetId),
    range: normalizeChartSourceRange(source.range),
  };
}
/** Strict document boundary and detached draft clone. Length disagreement remains a derived diagnostic. */
export function normalizeChartSource(value: unknown): ChartSeriesSource {
  const source = record(value, ["kind", "categories", "series"]);
  if (source.kind !== "series") throw new TypeError("Unknown chart source kind.");
  const categories = normalizeCategories(source.categories);
  const ids = new Set<string>();
  const entries = readPictureDataArray<unknown>(
    source.series as readonly unknown[],
    "chart series",
    MAX_CHART_SOURCE_SERIES,
  );
  const series = entries.map((value): ChartSourceSeries => {
    const entry = record(value, ["id", "colorIndex", "name", "values"]);
    if (
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      entry.id.length > 128 ||
      ids.has(entry.id)
    )
      throw new RangeError("Chart series require distinct bounded stable IDs.");
    if (
      typeof entry.colorIndex !== "number" ||
      !Number.isInteger(entry.colorIndex) ||
      entry.colorIndex < 0 ||
      entry.colorIndex >= MAX_CHART_SOURCE_CELLS
    )
      throw new RangeError("Chart series require a bounded stable palette index.");
    ids.add(entry.id);
    return {
      id: entry.id,
      colorIndex: entry.colorIndex,
      name: normalizeName(entry.name),
      values: normalizeValues(entry.values),
    };
  });
  const lengths = series.map((entry) =>
    entry.values.kind === "literal"
      ? entry.values.values.length
      : getChartSourceRangeLength(entry.values.range),
  );
  const categoryLength =
    categories.kind === "range"
      ? getChartSourceRangeLength(categories.range)
      : Math.max(0, ...lengths);
  const names = series.filter(
    (entry) => entry.name.kind === "cell" && entry.name.cell !== null,
  ).length;
  if (
    categoryLength + lengths.reduce((total, length) => total + length, 0) + names >
    MAX_CHART_SOURCE_CELLS
  )
    throw new RangeError("Chart source and output must contain at most 10,000 cells.");
  return { kind: "series", categories, series };
}
export function getChartSourceApplicability(
  chart: SheetChart,
): "editable" | "pivot" | "cached" | "unsupported-type" | "broken-range" {
  if (chart.pivotTableId !== undefined) return "pivot";
  if (chart.dataCache !== undefined) return "cached";
  if (!["column", "bar", "line", "area", "radar", "combo"].includes(chart.type))
    return "unsupported-type";
  return chart.source !== undefined || chart.range !== null ? "editable" : "broken-range";
}
/** Lossless promotion includes hidden vectors and the original absolute header references. */
export function createChartSourceFromRange(
  sheetIdValue: string,
  input: SheetChart,
  sourceSheet?: Sheet,
): ChartSeriesSource {
  const chart = normalizeSheetChart(input);
  const id = sheetId(sheetIdValue);
  if (sourceSheet !== undefined && sourceSheet.id !== id)
    throw new RangeError("Chart source visibility must belong to the referenced sheet.");
  if (getChartSourceApplicability(chart) !== "editable")
    throw new RangeError("Chart type or source does not support explicit live series.");
  if (chart.source !== undefined) return normalizeChartSource(chart.source);
  if (chart.pivotTableId !== undefined || chart.dataCache !== undefined || !chart.range)
    throw new RangeError("Only a live rectangular chart can be promoted to series sources.");
  const { start, end } = chart.range;
  const rows = chart.seriesBy === "rows";
  const seriesStart =
    (rows ? start.row : start.column) +
    (rows ? Number(chart.headerRow) : Number(chart.headerColumn));
  const seriesEnd = rows ? end.row : end.column;
  const valuesStart =
    (rows ? start.column : start.row) +
    (rows ? Number(chart.headerColumn) : Number(chart.headerRow));
  const valuesEnd = rows ? end.column : end.row;
  const count = Math.max(0, seriesEnd - seriesStart + 1);
  const indices = Array.from({ length: count }, (_, index) => index);
  const isHidden = (index: number) =>
    !chart.showHidden &&
    sourceSheet !== undefined &&
    (rows
      ? sourceSheet.hiddenRows?.has(seriesStart + index)
      : sourceSheet.hiddenColumns?.has(seriesStart + index)) === true;
  const visible = indices.filter((index) => !isHidden(index));
  const hidden = indices.filter(isHidden);
  const palette = new Map([...visible, ...hidden].map((index, slot) => [index, slot]));
  const reservedIds = new Set([
    ...(chart.rectangleSeries?.rows ?? []).map((entry) => entry.id),
    ...(chart.rectangleSeries?.columns ?? []).map((entry) => entry.id),
    ...(chart.format?.series ?? []).map((entry) => entry.id),
    ...(chart.seriesFilter?.hiddenSeriesIds ?? []),
  ]);
  const bindings = new Map(
    (chart.rectangleSeries?.[chart.seriesBy] ?? []).map((entry) => [entry.index, entry.id]),
  );
  let generatedSuffix = 1;
  const nextId = (fixed: number): string => {
    const existing = bindings.get(fixed);
    if (existing !== undefined) return existing;
    while (reservedIds.has(`series-${generatedSuffix}`)) generatedSuffix++;
    const result = `series-${generatedSuffix++}`;
    reservedIds.add(result);
    return result;
  };
  const vector = (fixed: number): CellRange | null =>
    valuesStart > valuesEnd
      ? null
      : rows
        ? { start: { row: fixed, column: valuesStart }, end: { row: fixed, column: valuesEnd } }
        : { start: { row: valuesStart, column: fixed }, end: { row: valuesEnd, column: fixed } };
  return normalizeChartSource({
    kind: "series",
    categories:
      (rows ? chart.headerRow : chart.headerColumn) && valuesStart <= valuesEnd
        ? { kind: "range", sheetId: id, range: vector(rows ? start.row : start.column) }
        : { kind: "generated" },
    series: indices.map((index) => {
      const fixed = seriesStart + index;
      return {
        id: nextId(fixed),
        colorIndex: palette.get(index)!,
        name: (rows ? chart.headerColumn : chart.headerRow)
          ? {
              kind: "cell",
              sheetId: id,
              cell: rows ? { row: fixed, column: start.column } : { row: start.row, column: fixed },
            }
          : { kind: "literal", text: String(palette.get(index)! + 1) },
        values:
          valuesStart <= valuesEnd
            ? { kind: "range", sheetId: id, range: vector(fixed) }
            : { kind: "literal", values: [] },
      };
    }),
  });
}

/** Reference-only mapping retains every source field except explicit addresses/sheet identities. */
export function mapChartSourceReferences(
  value: ChartSeriesSource,
  mapCell: (
    reference: Extract<ChartSourceName, { kind: "cell" }>,
  ) => Extract<ChartSourceName, { kind: "cell" }>,
  mapRange: (
    reference: Extract<ChartSourceValues, { kind: "range" }>,
  ) => Extract<ChartSourceValues, { kind: "range" }>,
): ChartSeriesSource {
  const source = normalizeChartSource(value);
  return normalizeChartSource({
    ...source,
    categories:
      source.categories.kind === "range" ? mapRange(source.categories) : source.categories,
    series: source.series.map((entry) => ({
      ...entry,
      name: entry.name.kind === "cell" ? mapCell(entry.name) : entry.name,
      values: entry.values.kind === "range" ? mapRange(entry.values) : entry.values,
    })),
  });
}
