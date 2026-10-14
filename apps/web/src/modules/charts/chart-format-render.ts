import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import {
  normalizeChartFormat,
  type ChartTextFormat,
  type ChartValueAxisFormat,
} from "@sheetcraft/core/chart-format";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import type { ChartData, ChartSeries, SheetChart } from "@sheetcraft/core/sheet-charts";

type AxisWithoutMainType<T> = T extends unknown ? Omit<T, "mainType"> : never;
type AxisOption = AxisWithoutMainType<XAXisComponentOption | YAXisComponentOption>;
type ValueAxisOption = Extract<AxisOption, { type?: "value" }>;
type ChartAxisIntervals = {
  min?: number;
  max?: number;
  interval?: number;
  minorDivisions?: number;
};
const MAX_AXIS_TICKS = 2048;

function textStyle(format?: ChartTextFormat) {
  return {
    ...(format?.fontFamily !== undefined ? { fontFamily: format.fontFamily } : {}),
    ...(format?.fontSize !== undefined ? { fontSize: format.fontSize } : {}),
    ...(format?.color !== undefined ? { color: format.color } : {}),
    ...(format?.bold !== undefined
      ? { fontWeight: format.bold ? ("bold" as const) : ("normal" as const) }
      : {}),
    ...(format?.italic !== undefined
      ? { fontStyle: format.italic ? ("italic" as const) : ("normal" as const) }
      : {}),
  };
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

function uniformFormat(series: ChartSeries[]): CellNumberFormat | undefined {
  const first = series[0]?.numberFormat;
  return first &&
    series.every((entry) => JSON.stringify(entry.numberFormat) === JSON.stringify(first))
    ? first
    : undefined;
}

function valueAxis(
  base: ValueAxisOption,
  settings: ChartValueAxisFormat | undefined,
  entries: ChartSeries[],
  stacked: boolean,
  sourceGroupChanged = false,
): ValueAxisOption {
  const intervals = resolveChartAxisIntervals(settings, axisValues(entries, stacked));
  const overrideNumber =
    sourceGroupChanged ||
    settings?.numberFormat !== undefined ||
    settings?.linkedToSource !== undefined;
  const numberFormat =
    settings?.linkedToSource === true
      ? uniformFormat(entries)
      : (settings?.numberFormat ??
        (settings?.linkedToSource === false ? undefined : uniformFormat(entries)));
  const { minorDivisions, ...domain } = intervals;
  const result: ValueAxisOption = {
    ...base,
    type: "value",
    ...domain,
    ...(settings?.show !== undefined ? { show: settings.show } : {}),
    ...(settings?.min !== undefined ? { min: settings.min } : {}),
    ...(settings?.max !== undefined ? { max: settings.max } : {}),
    ...(settings?.reverse !== undefined ? { inverse: settings.reverse } : {}),
    ...(settings?.title !== undefined
      ? { name: settings.title, nameLocation: "middle", nameGap: 42 }
      : {}),
    nameTextStyle: { ...base.nameTextStyle, ...textStyle(settings?.text) },
    axisLabel: {
      ...base.axisLabel,
      ...textStyle(settings?.text),
      ...(overrideNumber
        ? { formatter: (value: number) => formatCellNumberValue(value, numberFormat).text }
        : {}),
      ...(overrideNumber && numberFormat
        ? {
            color: (value?: string | number) => {
              const number = typeof value === "number" ? value : Number(value);
              return Number.isFinite(number)
                ? (formatCellNumberValue(number, numberFormat).color ??
                    settings?.text?.color ??
                    "#6e7079")
                : (settings?.text?.color ?? "#6e7079");
            },
          }
        : {}),
    },
    ...(settings?.line
      ? {
          axisLine: {
            ...base.axisLine,
            show: settings.line.stroke !== "transparent" && settings.line.strokeWidth !== 0,
            lineStyle: {
              ...base.axisLine?.lineStyle,
              ...(settings.line.stroke ? { color: settings.line.stroke } : {}),
              ...(settings.line.strokeWidth !== undefined
                ? { width: settings.line.strokeWidth }
                : {}),
            },
          },
        }
      : {}),
    ...(minorDivisions !== undefined
      ? {
          minorTick: { show: minorDivisions > 1, splitNumber: minorDivisions },
          minorSplitLine: { show: minorDivisions > 1 },
        }
      : {}),
  };
  return result;
}

/** WPS gap is a percentage of a bar, while ECharts category gap is of the whole band. */
export function chartBarGapRatios(
  groups: number,
  gapWidth: number | undefined,
  overlap: number | undefined,
) {
  const gap = overlap === undefined ? 0.1 : -overlap / 100;
  const span = Math.max(1, groups) + (Math.max(1, groups) - 1) * gap;
  return {
    ...(overlap !== undefined ? { barGap: `${gap * 100}%` } : {}),
    ...(gapWidth !== undefined
      ? { barCategoryGap: `${(100 * (gapWidth / 100)) / (span + gapWidth / 100)}%` }
      : {}),
  };
}

/** The option has native numeric presentation already. No-format returns it unchanged. */
export function applyChartCommonFormat(
  option: EChartsOption,
  chart: SheetChart,
  data: ChartData,
): EChartsOption {
  const field = Object.getOwnPropertyDescriptor(chart, "format");
  if (!field) return option;
  if (!("value" in field)) throw new TypeError("Chart format requires an own data field.");
  const format = normalizeChartFormat(field.value);
  const next: EChartsOption = { ...option };
  if (format.title && option.title && !Array.isArray(option.title))
    next.title = {
      ...option.title,
      textStyle: { ...option.title.textStyle, ...textStyle(format.title) },
    };
  const bars = chart.type === "bar" || chart.type === "column";
  const lines = chart.type === "line" || chart.type === "area";
  const cartesian = bars || lines || chart.type === "scatter";
  const selectedFormat = (entry: ChartSeries | undefined) =>
    entry?.id !== undefined ? format.series?.find((item) => item.id === entry.id) : undefined;
  const secondary = (entry: ChartSeries) =>
    (bars || lines) && selectedFormat(entry)?.axis === "secondary";
  if (cartesian && format.plot && option.grid && !Array.isArray(option.grid))
    next.grid = {
      ...option.grid,
      show: true,
      backgroundColor: format.plot.fill ?? "transparent",
      borderColor: format.plot.stroke ?? (format.plot.strokeWidth ? "#d1d5db" : "transparent"),
      borderWidth: format.plot.strokeWidth ?? (format.plot.stroke ? 1 : 0),
    };
  if (!cartesian) {
    if (chart.type === "radar" && Array.isArray(option.series))
      next.series = option.series.map((series) =>
        series.type !== "radar"
          ? series
          : {
              ...series,
              data: series.data?.map((item, index) => {
                const settings = selectedFormat(data.series[index]);
                if (!settings || !item || typeof item !== "object" || Array.isArray(item))
                  return item;
                return {
                  ...item,
                  ...(settings.color
                    ? { itemStyle: { ...item.itemStyle, color: settings.color } }
                    : {}),
                  lineStyle: {
                    ...item.lineStyle,
                    ...(settings.color ? { color: settings.color } : {}),
                    ...(settings.strokeWidth !== undefined ? { width: settings.strokeWidth } : {}),
                  },
                  ...(settings.markers !== undefined
                    ? { symbol: settings.markers ? "circle" : "none" }
                    : {}),
                };
              }),
            },
      );
    return next;
  }
  const x = option.xAxis,
    y = option.yAxis;
  if (!x || !y || Array.isArray(x) || Array.isArray(y)) return next;
  const horizontal = chart.type === "bar";
  const valueSeries = chart.type === "scatter" ? data.series.slice(1) : data.series;
  const primary = valueSeries.filter((entry) => !secondary(entry));
  const secondaryEntries = data.series.filter(secondary);
  const hasSecondary = secondaryEntries.length > 0;
  const isStacked = chart.stacked && (bars || lines);
  const mainBase = horizontal ? x : y;
  if (mainBase.type !== "value")
    throw new TypeError("Chart formatting requires an actual value axis.");
  const mainAxis = valueAxis(mainBase, format.valueAxis, primary, isStacked, hasSecondary);
  let category: AxisOption = horizontal ? y : x;
  if (format.categoryAxis && chart.type !== "scatter" && category.type === "category") {
    const settings = format.categoryAxis;
    category = {
      ...category,
      ...(settings.show !== undefined ? { show: settings.show } : {}),
      ...(settings.reverse !== undefined ? { inverse: settings.reverse } : {}),
      ...(settings.title !== undefined
        ? { name: settings.title, nameLocation: "middle", nameGap: 32 }
        : {}),
      nameTextStyle: { ...category.nameTextStyle, ...textStyle(settings.text) },
      axisLabel: {
        ...category.axisLabel,
        ...textStyle(settings.text),
        ...(settings.labelAngle !== undefined ? { rotate: settings.labelAngle } : {}),
      },
      ...(settings.line
        ? {
            axisLine: {
              ...category.axisLine,
              show: settings.line.stroke !== "transparent" && settings.line.strokeWidth !== 0,
              lineStyle: {
                ...category.axisLine?.lineStyle,
                ...(settings.line.stroke ? { color: settings.line.stroke } : {}),
                ...(settings.line.strokeWidth !== undefined
                  ? { width: settings.line.strokeWidth }
                  : {}),
              },
            },
          }
        : {}),
    };
  }
  if (format.valueAxis?.reverse && chart.type !== "scatter")
    category = {
      ...category,
      position: horizontal ? "right" : "top",
      axisLine: { ...category.axisLine, onZero: false },
    };
  const otherAxis = hasSecondary
    ? valueAxis(
        { type: "value", position: horizontal ? "top" : "right" },
        format.secondaryValueAxis,
        secondaryEntries,
        isStacked,
        true,
      )
    : undefined;
  if (horizontal) {
    next.xAxis = otherAxis ? [mainAxis, otherAxis] : mainAxis;
    next.yAxis = hasSecondary && bars ? [category, { ...category, show: false }] : category;
  } else {
    next.yAxis = otherAxis ? [mainAxis, otherAxis] : mainAxis;
    next.xAxis = hasSecondary && bars ? [category, { ...category, show: false }] : category;
  }
  if (Array.isArray(option.series))
    next.series = option.series.map((series, index): SeriesOption => {
      const entry = chart.type === "scatter" ? data.series[index + 1] : data.series[index];
      const settings = selectedFormat(entry);
      if (series.type !== "bar" && series.type !== "line") return series;
      const isSecondary = entry !== undefined && secondary(entry);
      const axisIndex = isSecondary ? 1 : 0;
      const common = {
        ...(horizontal
          ? { xAxisIndex: axisIndex, yAxisIndex: bars ? axisIndex : 0 }
          : { yAxisIndex: axisIndex, xAxisIndex: bars ? axisIndex : 0 }),
        ...(isStacked ? { stack: isSecondary ? "secondary-total" : "primary-total" } : {}),
        ...(settings?.color ? { itemStyle: { ...series.itemStyle, color: settings.color } } : {}),
        ...(hasSecondary ? { z: isSecondary ? 3 : 2 } : {}),
      };
      if (series.type === "line")
        return {
          ...series,
          ...common,
          type: "line",
          lineStyle: {
            ...series.lineStyle,
            ...(settings?.color ? { color: settings.color } : {}),
            ...(settings?.strokeWidth !== undefined ? { width: settings.strokeWidth } : {}),
          },
          ...(settings?.smooth !== undefined ? { smooth: settings.smooth } : {}),
          ...(settings?.markers !== undefined
            ? { showSymbol: settings.markers, symbol: settings.markers ? "circle" : "none" }
            : {}),
          ...(chart.type === "area" && settings?.color
            ? { areaStyle: { ...series.areaStyle, color: settings.color } }
            : {}),
        };
      return {
        ...series,
        ...common,
        type: "bar",
        ...(format.bar
          ? chartBarGapRatios(
              isStacked ? 1 : (isSecondary ? secondaryEntries : primary).length,
              format.bar.gapWidth,
              format.bar.overlap,
            )
          : {}),
      };
    });
  return next;
}
