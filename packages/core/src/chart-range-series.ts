import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";
import type { CellRange } from "./workbook.js";

/** A transient absolute physical band. This is never persisted in chart values. */
export type ChartRangeSeriesBand = { seriesBy: "rows" | "columns"; index: number };
export type ChartRangeSeriesBinding = { index: number; id: string };
/** Sparse chart-local identities, including inactive directions and header bands. */
export type ChartRectangleSeries = {
  rows: ChartRangeSeriesBinding[];
  columns: ChartRangeSeriesBinding[];
};
export const MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION = 256;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart rectangle series require ordinary data records.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart rectangle series require ordinary data records.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart rectangle series require known own data fields, not accessors.");
    if (field.value === undefined)
      throw new TypeError("Chart rectangle series require explicit data fields.");
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      throw new TypeError("Chart rectangle series require complete own data fields.");
  return result;
}

/** Strict detached document boundary; IDs are unique across both orientations. */
export function normalizeChartRectangleSeries(
  value: unknown,
  range: CellRange,
): ChartRectangleSeries {
  const source = record(value, ["rows", "columns"]);
  const ids = new Set<string>();
  const bindings = (direction: "rows" | "columns"): ChartRangeSeriesBinding[] => {
    const indices = new Set<number>();
    const axis = direction === "rows" ? "row" : "column";
    return readPictureDataArray<unknown>(
      source[direction] as readonly unknown[],
      `chart rectangle ${direction}`,
      MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION,
    ).map((entry) => {
      const binding = record(entry, ["index", "id"]);
      if (
        typeof binding.index !== "number" ||
        !Number.isInteger(binding.index) ||
        binding.index < range.start[axis] ||
        binding.index > range.end[axis] ||
        indices.has(binding.index)
      )
        throw new RangeError(
          "Chart rectangle series require distinct indices inside their live range.",
        );
      if (
        typeof binding.id !== "string" ||
        !binding.id.trim() ||
        binding.id.length > 128 ||
        ids.has(binding.id)
      )
        throw new RangeError("Chart rectangle series require distinct bounded chart-local IDs.");
      indices.add(binding.index);
      ids.add(binding.id);
      return { index: binding.index, id: binding.id };
    });
  };
  return { rows: bindings("rows"), columns: bindings("columns") };
}

function normalizeBand(value: ChartRangeSeriesBand, chart: SheetChart): ChartRangeSeriesBand {
  const band = record(value, ["seriesBy", "index"]);
  if (band.seriesBy !== "rows" && band.seriesBy !== "columns")
    throw new RangeError("Invalid chart range band direction.");
  const axis = band.seriesBy === "rows" ? "row" : "column";
  if (
    !chart.range ||
    typeof band.index !== "number" ||
    !Number.isInteger(band.index) ||
    band.index < chart.range.start[axis] ||
    band.index > chart.range.end[axis]
  )
    throw new RangeError("Chart range band must be inside the live rectangle.");
  return { seriesBy: band.seriesBy, index: band.index };
}

/** Read-only lookup never creates document data. */
export function lookupChartRangeSeriesId(
  input: SheetChart,
  band: ChartRangeSeriesBand,
): string | undefined {
  const chart = normalizeSheetChart(input);
  const target = normalizeBand(band, chart);
  return chart.rectangleSeries?.[target.seriesBy].find((entry) => entry.index === target.index)?.id;
}

/** Call only for a nonempty, effective per-series formatting write, in that same command. */
export function ensureChartRangeSeriesIdentity(
  input: SheetChart,
  band: ChartRangeSeriesBand,
): { chart: SheetChart; id: string } {
  const chart = normalizeSheetChart(input);
  if (
    chart.source !== undefined ||
    chart.dataCache !== undefined ||
    chart.pivotTableId !== undefined ||
    !["column", "bar", "line", "area", "radar"].includes(chart.type)
  )
    throw new RangeError("Only ordinary live rectangular chart series can acquire identities.");
  const target = normalizeBand(band, chart);
  const axis = target.seriesBy === "rows" ? "row" : "column";
  const header = target.seriesBy === "rows" ? chart.headerRow : chart.headerColumn;
  if (target.seriesBy !== chart.seriesBy || (header && target.index === chart.range!.start[axis]))
    throw new RangeError("Only an active data series band can acquire a formatting identity.");
  const previous = chart.rectangleSeries ?? { rows: [], columns: [] };
  const existing = previous[target.seriesBy].find((entry) => entry.index === target.index);
  if (existing) return { chart, id: existing.id };
  if (previous[target.seriesBy].length >= MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION)
    throw new RangeError("Chart rectangle series identity budget exceeded.");
  const used = new Set([
    ...previous.rows.map((entry) => entry.id),
    ...previous.columns.map((entry) => entry.id),
    ...(chart.format?.series ?? []).map((entry) => entry.id),
  ]);
  let suffix = 1;
  while (used.has(`range-series-${suffix}`)) suffix++;
  const id = `range-series-${suffix}`;
  const rectangleSeries = {
    rows: previous.rows.map((entry) => ({ ...entry })),
    columns: previous.columns.map((entry) => ({ ...entry })),
  };
  rectangleSeries[target.seriesBy].push({ index: target.index, id });
  return { chart: { ...chart, rectangleSeries }, id };
}

function withoutBindings(chart: SheetChart, range: CellRange | null): SheetChart {
  const { rectangleSeries: _bindings, ...rest } = chart;
  return { ...rest, range };
}

/** Explicit edits retain fixed coordinates only inside a genuine 2D same-sheet intersection. */
export function reconcileChartRangeSeriesForRange(
  input: SheetChart,
  nextRange: CellRange | null,
  sameSheet = true,
): SheetChart {
  const chart = normalizeSheetChart(input);
  const next = normalizeSheetChart(withoutBindings(chart, nextRange));
  const oldRange = chart.range;
  if (!chart.rectangleSeries || !oldRange || !next.range || !sameSheet) return next;
  const start = {
    row: Math.max(oldRange.start.row, next.range.start.row),
    column: Math.max(oldRange.start.column, next.range.start.column),
  };
  const end = {
    row: Math.min(oldRange.end.row, next.range.end.row),
    column: Math.min(oldRange.end.column, next.range.end.column),
  };
  if (start.row > end.row || start.column > end.column) return next;
  return {
    ...next,
    rectangleSeries: {
      rows: chart.rectangleSeries.rows.filter(
        (entry) => entry.index >= start.row && entry.index <= end.row,
      ),
      columns: chart.rectangleSeries.columns.filter(
        (entry) => entry.index >= start.column && entry.index <= end.column,
      ),
    },
  };
}

/** Map old full bands before compaction; split/deleted/colliding bindings become dormant format. */
export function mapChartRangeSeries(
  chart: SheetChart,
  nextRange: CellRange | null,
  mapBand: (range: CellRange) => CellRange | null,
): SheetChart {
  const next = withoutBindings(chart, nextRange);
  if (!chart.rectangleSeries || !chart.range || !nextRange) return next;
  const old = chart.range;
  const mapped = (direction: "rows" | "columns"): ChartRangeSeriesBinding[] => {
    const rows = direction === "rows";
    const entries = chart.rectangleSeries![direction].flatMap((entry) => {
      const band = rows
        ? {
            start: { row: entry.index, column: old.start.column },
            end: { row: entry.index, column: old.end.column },
          }
        : {
            start: { row: old.start.row, column: entry.index },
            end: { row: old.end.row, column: entry.index },
          };
      const range = mapBand(band);
      if (!range) return [];
      const index = rows ? range.start.row : range.start.column;
      const complete = rows
        ? range.end.row === index &&
          range.start.column === nextRange.start.column &&
          range.end.column === nextRange.end.column &&
          index >= nextRange.start.row &&
          index <= nextRange.end.row
        : range.end.column === index &&
          range.start.row === nextRange.start.row &&
          range.end.row === nextRange.end.row &&
          index >= nextRange.start.column &&
          index <= nextRange.end.column;
      return complete ? [{ index, id: entry.id }] : [];
    });
    const counts = new Map<number, number>();
    for (const entry of entries) counts.set(entry.index, (counts.get(entry.index) ?? 0) + 1);
    return entries.filter((entry) => counts.get(entry.index) === 1);
  };
  return { ...next, rectangleSeries: { rows: mapped("rows"), columns: mapped("columns") } };
}
