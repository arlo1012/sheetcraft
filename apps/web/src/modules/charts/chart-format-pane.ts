import type {
  ChartAxisLineFormat,
  ChartLegendFormat,
  ChartBarFormat,
  ChartCategoryAxisFormat,
  ChartFormatSettings,
  ChartSeriesFormat,
  ChartSurfaceFormat,
  ChartTextFormat,
  ChartValueAxisFormat,
} from "@sheetcraft/core/chart-format";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  lookupChartRangeSeriesId,
  type ChartRangeSeriesBand,
} from "@sheetcraft/core/chart-range-series";
import { getChartElementCapabilities } from "./chart-elements";
import type { ChartElementPatch } from "./chart-element-controls";
import { resolveChartComboSeriesSettings } from "@sheetcraft/core/chart-combo";

export type ChartFormatTarget =
  | {
      kind:
        | "chart"
        | "title"
        | "legend"
        | "plot"
        | "categoryAxis"
        | "valueAxis"
        | "secondaryValueAxis";
    }
  | { kind: "series"; seriesId: string; rangeBand?: ChartRangeSeriesBand };
// Shared by Ribbon and pane; every non-series target must have an explicit label.
export const chartFormatTargetLabelKeys = {
  chart: "chart.formatChartArea",
  title: "chart.title",
  legend: "chart.legend",
  plot: "chart.formatPlotArea",
  categoryAxis: "chart.formatCategoryAxis",
  valueAxis: "chart.formatValueAxis",
  secondaryValueAxis: "chart.formatSecondaryValueAxis",
} as const satisfies Record<Exclude<ChartFormatTarget["kind"], "series">, string>;

export type ChartFormatIntent =
  | { kind: "chart"; format: ChartBarFormat | undefined }
  | { kind: "title"; format: ChartTextFormat | undefined }
  | { kind: "plot"; format: ChartSurfaceFormat | undefined }
  | { kind: "categoryAxis"; format: ChartCategoryAxisFormat | undefined }
  | { kind: "valueAxis" | "secondaryValueAxis"; format: ChartValueAxisFormat | undefined }
  | { kind: "series"; seriesId: string; format: Omit<ChartSeriesFormat, "id"> | undefined }
  | { kind: "elements"; patch: ChartElementPatch }
  | { kind: "legend"; reset: true }
  | { kind: "legend"; format: ChartLegendFormat | undefined };
export type ChartFormatIntentHandler = (intent: ChartFormatIntent) => boolean;
export type ChartFormatNumericField =
  | "min"
  | "max"
  | "majorUnit"
  | "minorUnit"
  | "labelAngle"
  | "titleRotation"
  | "fontSize"
  | "strokeWidth"
  | "markerSizePt"
  | "gapWidth"
  | "overlap";
export type ChartFormatDraftError = "number" | "bounds" | "format" | "rejected" | "composition";
export interface ChartFormatDraft {
  text: string;
  dirty: boolean;
  composing: boolean;
  error?: ChartFormatDraftError;
}

export function chartFormatTargetKey(target: ChartFormatTarget): string {
  if (target.kind === "series" && target.rangeBand)
    return `range-series:${target.rangeBand.seriesBy}:${target.rangeBand.index}`;
  return target.kind === "series" ? `series:${target.seriesId}` : target.kind;
}

/** Range bands identify a captured physical vector; their temporary UI token is never painted. */
export function getChartFormatSeries(chart: SheetChart, data: ChartData) {
  const sourceIds = new Set(chart.source?.series.map((entry) => entry.id) ?? []);
  const rangeIds = new Map(
    chart.rectangleSeries?.[chart.seriesBy].map((entry) => [entry.index, entry.id]) ?? [],
  );
  return data.series.flatMap((entry) => {
    if (entry.id && sourceIds.has(entry.id)) return [{ ...entry, id: entry.id }];
    if (!entry.rangeBand || !isChartRangeBandEditable(chart, entry.rangeBand)) return [];
    return [
      {
        ...entry,
        id:
          rangeIds.get(entry.rangeBand.index) ??
          `unbound-range:${entry.rangeBand.seriesBy}:${entry.rangeBand.index}`,
      },
    ];
  });
}

export function isChartRangeBandEditable(chart: SheetChart, band: ChartRangeSeriesBand): boolean {
  if (
    chart.source ||
    chart.pivotTableId ||
    chart.dataCache ||
    !chart.range ||
    !["column", "bar", "line", "area", "radar", "combo"].includes(chart.type) ||
    band.seriesBy !== chart.seriesBy ||
    !Number.isInteger(band.index)
  )
    return false;
  const rows = band.seriesBy === "rows";
  const axis = rows ? "row" : "column";
  const start = chart.range.start[axis] + Number(rows ? chart.headerRow : chart.headerColumn);
  return band.index >= start && band.index <= chart.range.end[axis];
}

export function resolveChartFormatSeriesId(
  chart: SheetChart,
  target: Extract<ChartFormatTarget, { kind: "series" }>,
): string | undefined {
  return target.rangeBand
    ? lookupChartRangeSeriesId(chart, target.rangeBand)
    : chart.source?.series.some((entry) => entry.id === target.seriesId)
      ? target.seriesId
      : undefined;
}

export function getChartFormatCapabilities(
  chart: SheetChart,
  data?: ChartData,
  target?: ChartFormatTarget,
) {
  const plotSeries = chart.type === "scatter" ? data?.series.slice(1) : data?.series;
  const hasData = data === undefined || !!plotSeries?.some((entry) => entry.values.length > 0);
  const bars = chart.type === "column" || chart.type === "bar";
  const lines = chart.type === "line" || chart.type === "area";
  const combo = chart.type === "combo";
  const selectedCombo =
    combo && target?.kind === "series"
      ? resolveChartComboSeriesSettings(
          chart,
          target.rangeBand ? { rangeBand: target.rangeBand } : { seriesId: target.seriesId },
        )
      : undefined;
  const cartesian = bars || lines || combo || chart.type === "scatter";
  const series = data ? getChartFormatSeries(chart, data) : (chart.source?.series ?? []);
  const comboKinds = combo
    ? series.map(
        (entry) =>
          resolveChartComboSeriesSettings(
            chart,
            "rangeBand" in entry && entry.rangeBand
              ? { rangeBand: entry.rangeBand }
              : { seriesId: entry.id },
          ).drawType,
      )
    : [];
  const comboLine =
    combo && (selectedCombo ? selectedCombo.drawType === "line" : comboKinds.includes("line"));
  const comboColumn =
    combo && (selectedCombo ? selectedCombo.drawType === "column" : comboKinds.includes("column"));
  const boundIds = new Set(chart.rectangleSeries?.[chart.seriesBy].map((entry) => entry.id) ?? []);
  return {
    hasData,
    legend: hasData && chart.legend && getChartElementCapabilities(chart.type).legend,
    title: !!chart.title.trim() && chart.elements?.titlePosition !== "none",
    plot: hasData && cartesian,
    categoryAxis:
      hasData && (bars || lines || combo) && (data === undefined || data.categories.length > 0),
    valueAxis: hasData && cartesian,
    secondaryValueAxis:
      hasData &&
      (bars || lines || combo) &&
      series.some(
        (entry) =>
          (chart.source !== undefined || boundIds.has(entry.id)) &&
          chart.format?.series?.some(
            (format) => format.id === entry.id && format.axis === "secondary",
          ),
      ),
    bar: hasData && (bars || comboColumn),
    series: hasData && series.length > 0 && (bars || lines || combo || chart.type === "radar"),
    seriesAxis: bars || lines || combo,
    seriesStroke: lines || comboLine || chart.type === "radar",
    seriesSmooth: lines,
    seriesMarkers: lines || comboLine || chart.type === "radar",
    seriesMarkerSize: chart.type === "line",
  };
}

export function getChartFormatTargets(
  chart: SheetChart,
  data: ChartData,
  visibleData: ChartData = data,
): ChartFormatTarget[] {
  const capabilities = getChartFormatCapabilities(chart, visibleData);
  const targets: ChartFormatTarget[] = [{ kind: "chart" }];
  if (capabilities.title) targets.push({ kind: "title" });
  if (capabilities.legend) targets.push({ kind: "legend" });
  if (capabilities.plot) targets.push({ kind: "plot" });
  if (capabilities.categoryAxis) targets.push({ kind: "categoryAxis" });
  if (capabilities.valueAxis) targets.push({ kind: "valueAxis" });
  if (capabilities.secondaryValueAxis) targets.push({ kind: "secondaryValueAxis" });
  // Hidden definitions remain format targets; painted axes follow only visible data.
  if (getChartFormatCapabilities(chart, data).series)
    targets.push(
      ...getChartFormatSeries(chart, data).map((entry) => ({
        kind: "series" as const,
        seriesId: entry.id,
        ...(entry.rangeBand ? { rangeBand: { ...entry.rangeBand } } : {}),
      })),
    );
  return targets;
}

export function getChartSeriesFormat(chart: SheetChart, id: string): Omit<ChartSeriesFormat, "id"> {
  const entry = chart.format?.series?.find((format) => format.id === id);
  if (!entry) return {};
  const { id: _id, ...format } = entry;
  return format;
}

/** Produces detached branch data. Host validates/normalizes and owns the workbook command. */
export function getChartFormatIntentSettings(
  current: ChartFormatSettings | undefined,
  intent: Exclude<ChartFormatIntent, { kind: "elements" } | { kind: "legend"; reset: true }>,
): ChartFormatSettings | undefined {
  const result: ChartFormatSettings = { ...current };
  if (intent.kind === "series") {
    const previous = current?.series ?? [];
    const index = previous.findIndex((entry) => entry.id === intent.seriesId);
    const series = previous.map((entry) => ({ ...entry }));
    if (intent.format === undefined) {
      if (index >= 0) series.splice(index, 1);
    } else {
      const next = { id: intent.seriesId, ...intent.format };
      if (index < 0) series.push(next);
      else series[index] = next;
    }
    if (series.length) result.series = series;
    else delete result.series;
  } else {
    const key = intent.kind === "chart" ? "bar" : intent.kind;
    if (intent.format === undefined) delete result[key];
    else {
      // Narrow each branch separately so union assignment cannot cross their contracts.
      switch (intent.kind) {
        case "chart":
          result.bar = { ...intent.format };
          break;
        case "legend":
          result.legend = {
            ...intent.format,
            ...(intent.format.text ? { text: { ...intent.format.text } } : {}),
            ...(intent.format.surface ? { surface: { ...intent.format.surface } } : {}),
          };
          break;
        case "title":
          result.title = { ...intent.format };
          break;
        case "plot":
          result.plot = { ...intent.format };
          break;
        case "categoryAxis":
          result.categoryAxis = cloneAxis(intent.format);
          break;
        case "valueAxis":
          result.valueAxis = cloneAxis(intent.format);
          break;
        case "secondaryValueAxis":
          result.secondaryValueAxis = cloneAxis(intent.format);
          break;
      }
    }
  }
  return Object.keys(result).length ? result : undefined;
}
function cloneAxis<T extends ChartCategoryAxisFormat | ChartValueAxisFormat>(axis: T): T {
  return {
    ...axis,
    ...(axis.text ? { text: cloneChartTextFormat(axis.text) } : {}),
    ...(axis.titleText ? { titleText: cloneChartTextFormat(axis.titleText) } : {}),
    ...(axis.line ? { line: { ...axis.line } } : {}),
    ...("numberFormat" in axis && axis.numberFormat
      ? { numberFormat: { ...axis.numberFormat } }
      : {}),
  };
}

/** Preserve script choices when a shared legacy title becomes independently editable. */
export function cloneChartTextFormat(text: ChartTextFormat): ChartTextFormat {
  return {
    ...text,
    ...(text.scriptFonts
      ? {
          scriptFonts: Object.fromEntries(
            Object.entries(text.scriptFonts).map(([key, value]) => [key, { ...value }]),
          ),
        }
      : {}),
  };
}

/** Initialize only new title content; dormant independent choices survive re-enabling. */
export function initializeChartAxisTitle<T extends ChartCategoryAxisFormat | ChartValueAxisFormat>(
  axis: T,
  type: SheetChart["type"],
  kind: "categoryAxis" | "valueAxis" | "secondaryValueAxis",
  title: string,
): T & { title: string; titleText: ChartTextFormat; titleRotation: number } {
  return {
    ...axis,
    title,
    titleText: cloneChartTextFormat(
      axis.titleText ?? {
        fontSize: 40 / 3,
        bold: true,
        italic: false,
        scriptFonts: {
          latin: { kind: "theme", role: "minor", slot: "latin" },
          eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
          complexScript: { kind: "theme", role: "minor", slot: "complexScript" },
        },
      },
    ),
    titleRotation: axis.titleRotation ?? ((kind === "categoryAxis") === (type !== "bar") ? 0 : -90),
  };
}

export function createChartFormatDraft(value?: string | number): ChartFormatDraft {
  return { text: value === undefined ? "" : String(value), dirty: false, composing: false };
}
export function editChartFormatDraft(draft: ChartFormatDraft, text: string): void {
  draft.text = text;
  draft.dirty = true;
  delete draft.error;
}
export function syncChartFormatDraft(draft: ChartFormatDraft, value?: string | number): void {
  if (draft.dirty || draft.composing) return;
  draft.text = value === undefined ? "" : String(value);
  delete draft.error;
}

/** Empty means auto, not zero. Incomplete exponents/signs and non-decimal syntax stay drafts. */
export function parseChartFormatNumber(
  text: string,
  field: ChartFormatNumericField,
): { valid: true; value: number | undefined } | { valid: false } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: true, value: undefined };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return { valid: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { valid: false };
  if (
    (field === "fontSize" && (value < 1 || value > 256)) ||
    (field === "strokeWidth" && (value < 0 || value > 32)) ||
    (field === "markerSizePt" && (!Number.isSafeInteger(value) || value < 2 || value > 72)) ||
    ((field === "labelAngle" || field === "titleRotation") && (value < -90 || value > 90)) ||
    (field === "gapWidth" && (value < 0 || value > 500)) ||
    (field === "overlap" && (value < -100 || value > 100)) ||
    ((field === "majorUnit" || field === "minorUnit") && value <= 0)
  )
    return { valid: false };
  return { valid: true, value: Object.is(value, -0) ? 0 : value };
}
export type ChartValueAxisDraftError =
  | "number"
  | "bounds"
  | "positiveUnit"
  | "minorTooLarge"
  | "divisionLimit"
  | "unevenDivision";

export function getChartValueAxisDraftError(
  axis: ChartValueAxisFormat,
): ChartValueAxisDraftError | undefined {
  if (
    [axis.min, axis.max, axis.majorUnit, axis.minorUnit].some(
      (value) => value !== undefined && !Number.isFinite(value),
    )
  )
    return "number";
  if (axis.min !== undefined && axis.max !== undefined && axis.min >= axis.max) return "bounds";
  if (axis.majorUnit !== undefined && axis.majorUnit <= 0) return "positiveUnit";
  if (axis.minorUnit !== undefined && axis.minorUnit <= 0) return "positiveUnit";
  if (axis.majorUnit !== undefined && axis.minorUnit !== undefined) {
    const divisions = axis.majorUnit / axis.minorUnit;
    if (!Number.isFinite(divisions)) return "divisionLimit";
    if (divisions < 1) return "minorTooLarge";
    if (divisions > 100) return "divisionLimit";
    if (Math.abs(divisions - Math.round(divisions)) > 1e-9) return "unevenDivision";
  }
  return undefined;
}
export function isChartValueAxisDraftValid(axis: ChartValueAxisFormat): boolean {
  return getChartValueAxisDraftError(axis) === undefined;
}

export function commitChartFormatNumberDraft(
  draft: ChartFormatDraft,
  field: ChartFormatNumericField,
  apply: (value: number | undefined) => boolean,
  validate?: (value: number | undefined) => boolean,
): boolean {
  if (draft.composing) {
    draft.error = "composition";
    return false;
  }
  if (!draft.dirty) return true;
  const parsed = parseChartFormatNumber(draft.text, field);
  if (!parsed.valid) {
    draft.error = "number";
    return false;
  }
  if (validate && !validate(parsed.value)) {
    draft.error = "bounds";
    return false;
  }
  let accepted = false;
  try {
    accepted = apply(parsed.value);
  } catch {
    /* Keep the exact draft on a stale owner. */
  }
  if (!accepted) {
    draft.error = "rejected";
    return false;
  }
  draft.dirty = false;
  delete draft.error;
  return true;
}

export function setChartFormatField<T extends object, K extends keyof T>(
  current: T,
  field: K,
  value: T[K] | undefined,
): T | undefined {
  const next = { ...current };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return Object.keys(next).length ? next : undefined;
}
/** A single-family selection deliberately replaces every script/theme binding. */
export function setChartTextFontFamily(
  current: ChartTextFormat,
  family: string | undefined,
): ChartTextFormat | undefined {
  const next = { ...current };
  delete next.scriptFonts;
  delete next.fontFamily;
  if (family) next.fontFamily = family;
  return Object.keys(next).length ? next : undefined;
}

export function compactChartAxis<T extends ChartCategoryAxisFormat | ChartValueAxisFormat>(
  axis: T,
): T | undefined {
  const next = cloneAxis(axis);
  if (next.text && !Object.keys(next.text).length) delete next.text;
  if (next.line && !Object.keys(next.line).length) delete next.line;
  return Object.keys(next).length ? next : undefined;
}
export function chartAxisLine(
  axis: ChartCategoryAxisFormat | ChartValueAxisFormat,
): ChartAxisLineFormat {
  return axis.line ?? {};
}
