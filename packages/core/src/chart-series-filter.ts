import {
  ensureChartRangeSeriesIdentity,
  MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION,
  type ChartRangeSeriesBand,
} from "./chart-range-series.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";

/** Sparse source-owned selections. Retired and inactive IDs remain reserved and dormant. */
export type ChartSeriesFilter = { hiddenSeriesIds: string[] };
export const MAX_CHART_HIDDEN_SERIES_IDS = 512;
export type ChartSeriesVisibilityChange =
  | { seriesId: string; visible: boolean }
  | { rangeBand: ChartRangeSeriesBand; visible: boolean };

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart series filters require ordinary data records.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart series filters require ordinary data records.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart series filters require known own data fields, not accessors.");
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      throw new TypeError("Chart series filters require complete own data fields.");
  return result;
}

function seriesId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128)
    throw new RangeError("Chart series filter IDs must be bounded nonblank strings.");
  return value;
}

/** Strict detached boundary. Explicit empty payloads are retained here. */
export function normalizeChartSeriesFilter(value: unknown): ChartSeriesFilter {
  const source = record(value, ["hiddenSeriesIds"]);
  const entries = readPictureDataArray<unknown>(
    source.hiddenSeriesIds as readonly unknown[],
    "chart hidden series IDs",
    MAX_CHART_HIDDEN_SERIES_IDS,
  );
  const ids = new Set<string>();
  const hiddenSeriesIds = entries.map((value) => {
    const id = seriesId(value);
    if (ids.has(id)) throw new RangeError("Chart series filter IDs must be distinct.");
    ids.add(id);
    return id;
  });
  return { hiddenSeriesIds };
}

function validateVisibilityOwner(input: SheetChart): void {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Filtered charts require an ordinary source owner.");
  // Raw flags are incompatible, even when they would normalize away as undefined.
  if ("pivotTableId" in input || "dataCache" in input)
    throw new RangeError(
      "Chart series filters require an ordinary source, not PivotTable/cache owners.",
    );
  const required = [
    "type",
    "range",
    "title",
    "headerRow",
    "headerColumn",
    "seriesBy",
    "legend",
    "labels",
    "stacked",
    "showHidden",
  ];
  const optional = ["source", "rectangleSeries", "format", "presentation", "elements"];
  for (const key of [...required, ...optional]) {
    if (!required.includes(key) && !(key in input)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Filtered charts require own data fields, not owner accessors.");
  }
  const range: unknown = Object.getOwnPropertyDescriptor(input, "range")!.value;
  if (range !== null) {
    const bounds = record(range, ["start", "end"]);
    record(bounds.start, ["row", "column"]);
    record(bounds.end, ["row", "column"]);
  }
}

/** Guard the new raw feature before legacy normalization can read owner accessors. */
export function readChartSeriesFilter(input: SheetChart): ChartSeriesFilter | undefined {
  if (
    !input ||
    (typeof input !== "object" && typeof input !== "function") ||
    !("seriesFilter" in input)
  )
    return undefined;
  const field = Object.getOwnPropertyDescriptor(input, "seriesFilter");
  if (!field || !("value" in field) || field.value === undefined)
    throw new TypeError("Chart series filter must be an explicit own data field, not an accessor.");
  validateVisibilityOwner(input);
  return normalizeChartSeriesFilter(field.value);
}

/**
 * Pure atomic candidate for one existing drawing command. UI callers submit net
 * final changes against their captured base; preview reads never allocate IDs.
 */
export function planChartSeriesVisibility(
  input: SheetChart,
  changes: readonly ChartSeriesVisibilityChange[],
): SheetChart {
  const entries = readPictureDataArray<unknown>(changes, "chart visibility changes", 512);
  // Validate the complete delta before normalization, allocation or any write.
  const normalized = entries.map((value): ChartSeriesVisibilityChange => {
    if (!value || typeof value !== "object")
      throw new TypeError("Chart visibility changes require own data records.");
    const explicit = "seriesId" in value;
    const change = record(value, explicit ? ["seriesId", "visible"] : ["rangeBand", "visible"]);
    if (typeof change.visible !== "boolean")
      throw new TypeError("Chart series visibility must be a boolean.");
    if (explicit) return { seriesId: seriesId(change.seriesId), visible: change.visible };
    const band = record(change.rangeBand, ["seriesBy", "index"]);
    if (
      (band.seriesBy !== "rows" && band.seriesBy !== "columns") ||
      typeof band.index !== "number" ||
      !Number.isInteger(band.index) ||
      band.index < 0
    )
      throw new RangeError("Chart visibility changes require a valid physical band.");
    return { rangeBand: { seriesBy: band.seriesBy, index: band.index }, visible: change.visible };
  });
  const targets = new Set<string>();
  for (const change of normalized) {
    const key =
      "seriesId" in change
        ? `id:${change.seriesId}`
        : `band:${change.rangeBand.seriesBy}:${change.rangeBand.index}`;
    if (targets.has(key))
      throw new RangeError("Chart visibility changes require distinct targets.");
    targets.add(key);
  }
  validateVisibilityOwner(input);
  let chart = normalizeSheetChart(input);
  if (
    "pivotTableId" in input ||
    "dataCache" in input ||
    !["column", "bar", "line", "area", "radar"].includes(chart.type)
  )
    throw new RangeError("Only ordinary supported chart sources have editable series visibility.");
  const explicitIds = new Set(chart.source?.series.map((entry) => entry.id));
  for (const change of normalized) {
    if ("seriesId" in change) {
      if (chart.source === undefined || !explicitIds.has(change.seriesId))
        throw new RangeError("Chart visibility changes require an active explicit source ID.");
    } else {
      const band = change.rangeBand;
      const axis = band.seriesBy === "rows" ? "row" : "column";
      const header = band.seriesBy === "rows" ? chart.headerRow : chart.headerColumn;
      if (
        chart.source !== undefined ||
        chart.range === null ||
        band.seriesBy !== chart.seriesBy ||
        band.index < chart.range.start[axis] ||
        band.index > chart.range.end[axis] ||
        (header && band.index === chart.range.start[axis])
      )
        throw new RangeError("Chart visibility changes require an active physical data band.");
    }
  }
  const hidden = new Set(chart.seriesFilter?.hiddenSeriesIds);
  // Determine all effective hides and their budgets before allocating candidates.
  let missingBindings = 0;
  let newHidden = 0;
  let removedHidden = 0;
  for (const change of normalized) {
    const id =
      "seriesId" in change
        ? change.seriesId
        : chart.rectangleSeries?.[change.rangeBand.seriesBy].find(
            (entry) => entry.index === change.rangeBand.index,
          )?.id;
    if (change.visible) {
      if (id !== undefined && hidden.has(id)) removedHidden++;
    } else if (id === undefined || !hidden.has(id)) {
      newHidden++;
      if (id === undefined) missingBindings++;
    }
  }
  if (hidden.size - removedHidden + newHidden > MAX_CHART_HIDDEN_SERIES_IDS)
    throw new RangeError("Chart hidden series ID budget exceeded.");
  if (
    (chart.rectangleSeries?.[chart.seriesBy].length ?? 0) + missingBindings >
    MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION
  )
    throw new RangeError("Chart rectangle series identity budget exceeded.");
  // Shows first permit an exactly full filter to replace selections atomically.
  for (const change of normalized) {
    if (!change.visible) continue;
    const id =
      "seriesId" in change
        ? change.seriesId
        : chart.rectangleSeries?.[change.rangeBand.seriesBy].find(
            (entry) => entry.index === change.rangeBand.index,
          )?.id;
    if (id !== undefined) hidden.delete(id);
  }
  for (const change of normalized) {
    if (change.visible) continue;
    let id: string;
    if ("seriesId" in change) id = change.seriesId;
    else {
      const ensured = ensureChartRangeSeriesIdentity(chart, change.rangeBand);
      chart = ensured.chart;
      id = ensured.id;
    }
    hidden.add(id);
  }
  const { seriesFilter: _previous, ...rest } = chart;
  return hidden.size ? { ...rest, seriesFilter: { hiddenSeriesIds: [...hidden] } } : rest;
}
