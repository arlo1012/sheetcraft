import type { ChartFormatSettings, ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import type { ChartData, ChartSeries, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  resolveChartComboSeriesSettings,
  type ChartComboSeriesChange,
  type ChartComboSeriesSettings,
} from "@sheetcraft/core/chart-combo";
import {
  chartPercentAxisDomain,
  chartPercentAxisSettings,
  getChartRenderPresentation,
} from "./chart-presentation-render";

type ChartAxisIntervals = {
  min?: number;
  max?: number;
  interval?: number;
  minorDivisions?: number;
};
const MAX_AXIS_TICKS = 2048;

/** Range bands remain physical preview identities; saved ID formats are resolved by Core. */
export function getChartComboDataSeriesSettings(
  chart: SheetChart,
  series: ChartSeries,
  changes?: readonly ChartComboSeriesChange[],
): ChartComboSeriesSettings {
  const target = series.rangeBand
    ? { rangeBand: series.rangeBand }
    : series.id !== undefined
      ? { seriesId: series.id }
      : undefined;
  return target
    ? resolveChartComboSeriesSettings(chart, target, changes)
    : { drawType: "column", axis: "primary", markers: false };
}

function niceUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Unsafe chart axis extent.");
  const scale = 10 ** Math.floor(Math.log10(value)) || Number.MIN_VALUE;
  const fraction = value / scale;
  const result = scale * (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10);
  if (!Number.isFinite(result) || result <= 0) throw new RangeError("Unsafe chart axis unit.");
  return result;
}

function axisValues(entries: ChartSeries[], stacked: boolean): number[] {
  if (!stacked)
    return entries.flatMap((entry) =>
      entry.values.filter((value): value is number => value !== null),
    );
  const count = Math.max(0, ...entries.map((entry) => entry.values.length));
  const result: number[] = [];
  for (let index = 0; index < count; index++) {
    let positive = 0,
      negative = 0;
    for (const entry of entries) {
      const value = entry.values[index];
      if (value === null || value === undefined) continue;
      if (value >= 0) positive += value;
      else negative += value;
    }
    if (!Number.isFinite(positive) || !Number.isFinite(negative))
      throw new RangeError("Chart stack exceeds the finite axis budget.");
    result.push(positive, negative);
  }
  return result;
}

/** Derive real intervals only when requested; styles alone retain the renderer's auto scale. */
export function resolveChartAxisIntervals(
  settings: ChartValueAxisFormat | undefined,
  values: readonly number[],
): ChartAxisIntervals {
  let minimum = 0,
    maximum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RangeError("Chart values must be finite.");
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  let min = settings?.min ?? minimum,
    max = settings?.max ?? maximum;
  if (min === max && settings?.min === undefined && settings?.max === undefined) max = min + 1;
  if (min >= max) {
    if (settings?.min === undefined) min = max - Math.max(1, Math.abs(max) * 0.1);
    else if (settings.max === undefined) max = min + Math.max(1, Math.abs(min) * 0.1);
  }
  const extent = max - min;
  if (!Number.isFinite(extent) || extent <= 0)
    throw new RangeError("Chart axis bounds do not have a finite positive span.");
  if (settings?.majorUnit === undefined && settings?.minorUnit === undefined)
    return {
      ...(settings?.max !== undefined && min !== minimum ? { min } : {}),
      ...(settings?.min !== undefined && max !== maximum ? { max } : {}),
    };
  const minor = settings.minorUnit;
  const major =
    settings.majorUnit ??
    (minor !== undefined
      ? minor *
        Math.min(
          100,
          Math.max(1, Math.ceil(niceUnit(Math.max(extent / 5, Number.MIN_VALUE)) / minor)),
        )
      : niceUnit(Math.max(extent / 5, Number.MIN_VALUE)));
  if (!Number.isFinite(major) || major <= 0) throw new RangeError("Unsafe chart axis unit.");
  if (settings.min === undefined) min = Math.floor(min / major) * major;
  if (settings.max === undefined) max = Math.ceil(max / major) * major;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max)
    throw new RangeError("Unsafe chart axis bounds.");
  for (const unit of [major, minor]) {
    if (unit === undefined) continue;
    const count = Math.ceil((max - min) / unit) + 1;
    if (!Number.isFinite(count) || count > MAX_AXIS_TICKS)
      throw new RangeError("Chart axis exceeds the 2048-tick budget.");
  }
  const split = minor === undefined ? undefined : major / minor;
  if (
    split !== undefined &&
    (!Number.isFinite(split) ||
      split < 1 ||
      split > 100 ||
      Math.abs(split - Math.round(split)) > Number.EPSILON * 16 * Math.max(1, split))
  )
    throw new RangeError("The minor unit must evenly divide the major unit.");
  return {
    min,
    max,
    interval: major,
    ...(split !== undefined ? { minorDivisions: Math.round(split) } : {}),
  };
}

/** Use the same physical/saved series routing in the pane and rendered axis. */
export function isChartSecondaryAxisSeries(
  chart: SheetChart,
  entry: ChartSeries,
  format: ChartFormatSettings | undefined,
  changes?: readonly ChartComboSeriesChange[],
): boolean {
  if (chart.type === "combo")
    return getChartComboDataSeriesSettings(chart, entry, changes).axis === "secondary";
  return (
    ["bar", "column", "line", "area"].includes(chart.type) &&
    entry.id !== undefined &&
    format?.series?.some((item) => item.id === entry.id && item.axis === "secondary") === true
  );
}

export function resolveChartValueAxisState(
  settings: ChartValueAxisFormat | undefined,
  entries: ChartSeries[],
  stacked: boolean,
  percent: boolean,
) {
  if (percent) settings = chartPercentAxisSettings(settings);
  const percentageDomain = percent ? chartPercentAxisDomain(entries) : undefined;
  const intervals = resolveChartAxisIntervals(
    settings,
    percentageDomain ? [percentageDomain.min, percentageDomain.max] : axisValues(entries, stacked),
  );
  return { settings, percentageDomain, intervals };
}

/** Grid visibility is independent of tick visibility when explicitly disabled. */
export function effectiveChartMinorGridlines(
  settings: ChartValueAxisFormat | undefined,
  minorDivisions: number | undefined,
): boolean {
  return settings?.minorGridlines ?? (minorDivisions !== undefined && minorDivisions > 1);
}

/** Read-only effective state; never materialize derived defaults in the workbook. */
export function chartMinorGridlinesForAxis(
  chart: SheetChart,
  visibleData: ChartData,
  secondary: boolean,
): boolean {
  const format = chart.format;
  const settings = secondary ? format?.secondaryValueAxis : format?.valueAxis;
  const entries = (
    chart.type === "scatter" ? visibleData.series.slice(1) : visibleData.series
  ).filter((entry) => isChartSecondaryAxisSeries(chart, entry, format) === secondary);
  const stacked = chart.stacked && ["bar", "column", "line", "area"].includes(chart.type);
  const percent = getChartRenderPresentation(chart)?.percentStacked === true;
  const state = resolveChartValueAxisState(settings, entries, stacked, percent);
  return effectiveChartMinorGridlines(state.settings, state.intervals.minorDivisions);
}
