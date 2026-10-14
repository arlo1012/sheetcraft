import { normalizeChartFormat, type ChartSeriesFormat } from "./chart-format.js";
import {
  ensureChartRangeSeriesIdentity,
  MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION,
  type ChartRangeSeriesBand,
} from "./chart-range-series.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { normalizeSheetChart, type SheetChart } from "./sheet-charts.js";

export type ChartComboSeriesTarget = { seriesId: string } | { rangeBand: ChartRangeSeriesBand };
export type ChartComboSeriesSettings = {
  drawType: "column" | "line";
  axis: "primary" | "secondary";
  markers: boolean;
};
export type ChartComboSeriesChange = ChartComboSeriesTarget & ChartComboSeriesSettings;
export const MAX_CHART_COMBO_SERIES_CHANGES = 256;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart combo requires ordinary data records.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart combo requires ordinary data records.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart combo requires known own data fields, not accessors.");
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      throw new TypeError("Chart combo requires complete own data fields.");
  return result;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128)
    throw new RangeError("Chart combo series IDs must be bounded nonblank strings.");
  return value;
}
function band(value: unknown): ChartRangeSeriesBand {
  const source = record(value, ["seriesBy", "index"]);
  if (
    (source.seriesBy !== "rows" && source.seriesBy !== "columns") ||
    typeof source.index !== "number" ||
    !Number.isInteger(source.index) ||
    source.index < 0
  )
    throw new RangeError("Chart combo requires a valid physical series band.");
  return { seriesBy: source.seriesBy, index: source.index };
}
function normalizeTarget(value: unknown): ChartComboSeriesTarget {
  const explicit = !!value && typeof value === "object" && "seriesId" in value;
  const source = record(value, explicit ? ["seriesId"] : ["rangeBand"]);
  return explicit ? { seriesId: id(source.seriesId) } : { rangeBand: band(source.rangeBand) };
}
function settings(source: Record<string, unknown>): ChartComboSeriesSettings {
  if (source.drawType !== "column" && source.drawType !== "line")
    throw new RangeError("Chart combo draw type must be column or line.");
  if (source.axis !== "primary" && source.axis !== "secondary")
    throw new RangeError("Chart combo value axis must be primary or secondary.");
  if (typeof source.markers !== "boolean")
    throw new TypeError("Chart combo markers must be a boolean.");
  return { drawType: source.drawType, axis: source.axis, markers: source.markers };
}
function targetKey(target: ChartComboSeriesTarget): string {
  return "seriesId" in target
    ? `id:${target.seriesId}`
    : `band:${target.rangeBand.seriesBy}:${target.rangeBand.index}`;
}
/** Complete, distinct detached choices. No getters, sparse arrays or unknown fields are admitted. */
export function normalizeChartComboSeriesChanges(value: unknown): ChartComboSeriesChange[] {
  const entries = readPictureDataArray<unknown>(
    value as readonly unknown[],
    "chart combo series changes",
    MAX_CHART_COMBO_SERIES_CHANGES,
  );
  const targets = new Set<string>();
  return entries.map((entry) => {
    const explicit = !!entry && typeof entry === "object" && "seriesId" in entry;
    const source = record(entry, [
      explicit ? "seriesId" : "rangeBand",
      "drawType",
      "axis",
      "markers",
    ]);
    const target: ChartComboSeriesTarget = explicit
      ? { seriesId: id(source.seriesId) }
      : { rangeBand: band(source.rangeBand) };
    const key = targetKey(target);
    if (targets.has(key)) throw new RangeError("Chart combo changes require distinct targets.");
    targets.add(key);
    return { ...target, ...settings(source) };
  });
}

/** Descriptor-only routing also finds inherited malformed payloads without invoking getters. */
function dataField(value: unknown, key: string): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  let owner: object | null = value;
  const seen = new WeakSet<object>();
  while (owner !== null) {
    if (seen.has(owner)) throw new TypeError("Cyclic chart combo owner prototype.");
    seen.add(owner);
    const field = Object.getOwnPropertyDescriptor(owner, key);
    if (field) return "value" in field ? (field.value as unknown) : undefined;
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  return undefined;
}
function hasDrawType(value: unknown): boolean {
  const series = dataField(dataField(value, "format"), "series");
  if (!series || (typeof series !== "object" && typeof series !== "function")) return false;
  // Scan descriptors rather than trusting caller array iteration or sparse entries.
  for (const key of Reflect.ownKeys(series)) {
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) continue;
    const entry = dataField(series, key);
    if (entry && (typeof entry === "object" || typeof entry === "function") && "drawType" in entry)
      return true;
  }
  return false;
}
function validateOwner(value: unknown): asserts value is SheetChart {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart combo requires an ordinary source owner.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart combo requires an ordinary source owner.");
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
  for (const key of [
    ...required,
    "source",
    "rectangleSeries",
    "seriesFilter",
    "elements",
    "format",
    "presentation",
  ]) {
    if (!required.includes(key) && !(key in value)) continue;
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !("value" in field))
      throw new TypeError("Chart combo requires own source data fields, not owner accessors.");
  }
  const range: unknown = Object.getOwnPropertyDescriptor(value, "range")!.value;
  if (range !== null) {
    const bounds = record(range, ["start", "end"]);
    record(bounds.start, ["row", "column"]);
    record(bounds.end, ["row", "column"]);
  }
}
/**
 * Read raw combo/drawType presence and admit common formatting before legacy reads.
 * A drawType remains dormant outside combo; merely reading never allocates identities.
 */
export function readChartComboFeature(value: unknown): boolean {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  const combo = dataField(value, "type") === "combo";
  const feature = combo || hasDrawType(value);
  if (combo && ("pivotTableId" in value || "dataCache" in value))
    throw new RangeError(
      "Chart combo requires ordinary live source ownership, not PivotTable/cache fields.",
    );
  if (feature) validateOwner(value);
  if ("format" in value) {
    const field = Object.getOwnPropertyDescriptor(value, "format");
    if (!field || !("value" in field))
      throw new TypeError("Chart format must be an own data field, not an accessor.");
    normalizeChartFormat(field.value);
  }
  return feature;
}
function validateTarget(chart: SheetChart, target: ChartComboSeriesTarget): void {
  if ("seriesId" in target) {
    if (!chart.source?.series.some((entry) => entry.id === target.seriesId))
      throw new RangeError("Chart combo requires an active explicit source ID.");
    return;
  }
  const { rangeBand } = target;
  const axis = rangeBand.seriesBy === "rows" ? "row" : "column";
  const header = rangeBand.seriesBy === "rows" ? chart.headerRow : chart.headerColumn;
  if (
    chart.source !== undefined ||
    chart.range === null ||
    rangeBand.seriesBy !== chart.seriesBy ||
    rangeBand.index < chart.range.start[axis] ||
    rangeBand.index > chart.range.end[axis] ||
    (header && rangeBand.index === chart.range.start[axis])
  )
    throw new RangeError("Chart combo requires an active physical data band.");
}
function targetId(chart: SheetChart, target: ChartComboSeriesTarget): string | undefined {
  return "seriesId" in target
    ? target.seriesId
    : chart.rectangleSeries?.[target.rangeBand.seriesBy].find(
        (entry) => entry.index === target.rangeBand.index,
      )?.id;
}
function resolved(chart: SheetChart, target: ChartComboSeriesTarget): ChartComboSeriesSettings {
  const identity = targetId(chart, target);
  const format =
    identity === undefined
      ? undefined
      : chart.format?.series?.find((entry) => entry.id === identity);
  const combo = chart.type === "combo";
  return {
    drawType: combo ? (format?.drawType ?? "column") : chart.type === "line" ? "line" : "column",
    axis: format?.axis ?? "primary",
    markers:
      format?.markers ??
      (!combo && chart.type === "line" ? (chart.presentation?.lineMarkers ?? true) : false),
  };
}
/** Resolve persisted ID overrides and transient physical preview choices without document writes. */
export function resolveChartComboSeriesSettings(
  input: SheetChart,
  targetValue: ChartComboSeriesTarget,
  changes?: readonly ChartComboSeriesChange[],
): ChartComboSeriesSettings {
  const target = normalizeTarget(targetValue);
  const entries = changes === undefined ? [] : normalizeChartComboSeriesChanges(changes);
  const chart = normalizeSheetChart(input);
  validateTarget(chart, target);
  for (const entry of entries) validateTarget(chart, entry);
  const change = entries.find((entry) => targetKey(entry) === targetKey(target));
  return change === undefined
    ? resolved(chart, target)
    : {
        drawType: change.drawType,
        axis: change.axis,
        markers: change.markers,
      };
}
function defaultSettings(value: ChartComboSeriesSettings): boolean {
  return value.drawType === "column" && value.axis === "primary" && value.markers === false;
}
function updateFormat(
  previous: ChartSeriesFormat | undefined,
  value: ChartComboSeriesSettings,
  identity: string,
): ChartSeriesFormat {
  const {
    drawType: _drawType,
    axis: _axis,
    markers: _markers,
    ...rest
  } = previous ?? { id: identity };
  return {
    ...rest,
    ...(value.drawType !== "column" ? { drawType: value.drawType } : {}),
    ...(value.axis !== "primary" ? { axis: value.axis } : {}),
    ...(value.markers ? { markers: true } : {}),
  };
}
/** Atomic detached candidate: validate every target/budget before acquiring any physical identities. */
export function planChartColumnLineCombo(
  input: SheetChart,
  changes: readonly ChartComboSeriesChange[],
): SheetChart {
  const entries = normalizeChartComboSeriesChanges(changes);
  validateOwner(input);
  if ("pivotTableId" in input || "dataCache" in input)
    throw new RangeError(
      "Chart combo requires ordinary live source ownership, not PivotTable/cache fields.",
    );
  const original = normalizeSheetChart(input);
  if (!["column", "bar", "line", "area", "radar", "combo"].includes(original.type))
    throw new RangeError("Chart type does not support bounded column–line combos.");
  for (const entry of entries) validateTarget(original, entry);
  // New combo choices retire incompatible chart-wide stacking/marker switches only.
  const { presentation: oldPresentation, ...rest } = original;
  const {
    percentStacked: _percent,
    lineMarkers: _lineMarkers,
    ...presentation
  } = oldPresentation ?? {};
  let chart = normalizeSheetChart({
    ...rest,
    type: "combo",
    stacked: false,
    ...(Object.keys(presentation).length ? { presentation } : {}),
  });
  const formats = new Map((chart.format?.series ?? []).map((entry) => [entry.id, entry]));
  let missingBindings = 0;
  let nextFormatCount = formats.size;
  for (const entry of entries) {
    const identity = targetId(chart, entry);
    if (identity === undefined) {
      if (!defaultSettings(entry)) {
        missingBindings++;
        nextFormatCount++;
      }
      continue;
    }
    const previous = formats.get(identity);
    const next = updateFormat(previous, entry, identity);
    if (Object.keys(next).length === 1) {
      if (previous !== undefined) nextFormatCount--;
    } else if (previous === undefined) nextFormatCount++;
  }
  if (nextFormatCount > MAX_CHART_COMBO_SERIES_CHANGES)
    throw new RangeError("Chart combo series format budget exceeded.");
  if (
    (chart.rectangleSeries?.[chart.seriesBy].length ?? 0) + missingBindings >
    MAX_CHART_RECTANGLE_SERIES_PER_DIRECTION
  )
    throw new RangeError("Chart rectangle series identity budget exceeded.");
  for (const entry of entries) {
    let identity = targetId(chart, entry);
    if (identity === undefined) {
      if (defaultSettings(entry)) continue;
      if (!("rangeBand" in entry)) throw new RangeError("Missing chart combo source identity.");
      const ensured = ensureChartRangeSeriesIdentity(chart, entry.rangeBand);
      chart = ensured.chart;
      identity = ensured.id;
    }
    const next = updateFormat(formats.get(identity), entry, identity);
    if (Object.keys(next).length === 1) formats.delete(identity);
    else formats.set(identity, next);
  }
  const { series: _series, ...common } = chart.format ?? {};
  const format = { ...common, ...(formats.size ? { series: [...formats.values()] } : {}) };
  const { format: _format, ...candidate } = chart;
  return normalizeSheetChart({ ...candidate, ...(Object.keys(format).length ? { format } : {}) });
}
