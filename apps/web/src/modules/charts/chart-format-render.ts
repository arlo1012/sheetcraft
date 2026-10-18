import { format as echartsFormat } from "echarts/core";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  chartRichStyles,
  chartRichText,
  createChartTextPlan,
  truncateChartText,
} from "./chart-script-fonts";
import type {
  EChartsOption,
  ScrollableLegendComponentOption,
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
import type { ChartPresentationSettings } from "@sheetcraft/core/chart-presentation";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import {
  effectiveChartMinorGridlines,
  getChartComboDataSeriesSettings,
  isChartSecondaryAxisSeries,
  resolveChartValueAxisState,
} from "./chart-axis-state";
export { getChartComboDataSeriesSettings, resolveChartAxisIntervals } from "./chart-axis-state";
import {
  getChartPresentationTextColor,
  getChartRenderPresentation,
} from "./chart-presentation-render";

type AxisWithoutMainType<T> = T extends unknown ? Omit<T, "mainType"> : never;
type AxisOption = AxisWithoutMainType<XAXisComponentOption | YAXisComponentOption>;
type ValueAxisOption = Extract<AxisOption, { type?: "value" }>;
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
  percent = false,
): ValueAxisOption {
  const state = resolveChartValueAxisState(settings, entries, stacked, percent);
  settings = state.settings;
  const { percentageDomain, intervals } = state;
  const overrideNumber =
    percent ||
    sourceGroupChanged ||
    settings?.numberFormat !== undefined ||
    settings?.linkedToSource !== undefined;
  const numberFormat: CellNumberFormat | undefined = percent
    ? settings?.linkedToSource === true
      ? { kind: "percent", fractionDigits: 0 }
      : (settings?.numberFormat ?? { kind: "percent", fractionDigits: 0 })
    : settings?.linkedToSource === true
      ? uniformFormat(entries)
      : (settings?.numberFormat ??
        (settings?.linkedToSource === false ? undefined : uniformFormat(entries)));
  const { minorDivisions, ...domain } = intervals;
  const result: ValueAxisOption = {
    ...base,
    type: "value",
    ...percentageDomain,
    ...domain,
    ...(settings?.show !== undefined ? { show: settings.show } : {}),
    ...(settings?.min !== undefined ? { min: settings.min } : {}),
    ...(settings?.max !== undefined ? { max: settings.max } : {}),
    ...(settings?.reverse !== undefined ? { inverse: settings.reverse } : {}),
    ...(settings?.titleVisible === false || settings?.title !== undefined
      ? {
          name: settings.titleVisible === false ? "" : settings.title,
          nameLocation: "middle",
          nameGap: 42,
        }
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
          minorSplitLine: { show: effectiveChartMinorGridlines(settings, minorDivisions) },
        }
      : {}),
    ...(settings?.majorGridlines !== undefined
      ? { splitLine: { ...base.splitLine, show: settings.majorGridlines } }
      : {}),
    ...(settings?.minorGridlines !== undefined
      ? {
          minorSplitLine: {
            ...base.minorSplitLine,
            show: effectiveChartMinorGridlines(settings, minorDivisions),
          },
          ...(settings.minorGridlines
            ? { minorTick: { ...base.minorTick, show: true, splitNumber: minorDivisions ?? 5 } }
            : {}),
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

/** Seed surface-readable defaults without coupling separately editable elements. */
function presentationText(
  option: EChartsOption,
  presentation: ChartPresentationSettings | undefined,
  color: string | undefined,
): EChartsOption {
  if (!presentation || color === undefined) return option;
  // Empty explicit sources intentionally keep the entire interior cleared.
  if (Array.isArray(option.series) && !option.series.length && !option.title) return option;
  const legend = (entry: ScrollableLegendComponentOption) => ({
    ...entry,
    textStyle: { color, ...entry.textStyle },
    pageTextStyle: { color, ...entry.pageTextStyle },
  });
  const tooltip = (entry: Exclude<EChartsOption["tooltip"], undefined | unknown[]>) => {
    // Keep an explicit tooltip scheme together; changing only its other half
    // could turn readable custom dark-on-light text into light-on-light text.
    if (entry.backgroundColor !== undefined || entry.textStyle?.color !== undefined) return entry;
    return {
      ...entry,
      // A light recipe text color must travel with its opaque panel background.
      ...(presentation.background !== undefined
        ? { backgroundColor: presentation.background }
        : {}),
      textStyle: { color, ...entry.textStyle },
    };
  };
  const labels = (entry: SeriesOption): SeriesOption => {
    switch (entry.type) {
      case "bar":
        return { ...entry, label: { color, ...entry.label } };
      case "line":
        return { ...entry, label: { color, ...entry.label } };
      case "scatter":
        return { ...entry, label: { color, ...entry.label } };
      case "pie":
        return { ...entry, label: { color, ...entry.label } };
      case "radar":
        return { ...entry, label: { color, ...entry.label } };
      case "treemap":
        return { ...entry, label: { color, ...entry.label } };
      case "sankey":
        return { ...entry, label: { color, ...entry.label } };
      case "themeRiver":
        return { ...entry, label: { color, ...entry.label } };
      default:
        return entry;
    }
  };
  const singleAxis = <T extends Exclude<EChartsOption["singleAxis"], undefined | unknown[]>>(
    entry: T,
  ): T => {
    const next = { ...entry };
    next.axisLabel = { color, ...entry.axisLabel };
    next.nameTextStyle = { color, ...entry.nameTextStyle };
    return next;
  };
  const axis = <T extends AxisOption>(entry: T): T => {
    const next = { ...entry };
    next.axisLabel = { color, ...entry.axisLabel };
    next.nameTextStyle = { color, ...entry.nameTextStyle };
    return next;
  };
  return {
    ...option,
    textStyle: { color, ...option.textStyle },
    ...(option.legend
      ? { legend: Array.isArray(option.legend) ? option.legend.map(legend) : legend(option.legend) }
      : {}),
    ...(option.tooltip
      ? {
          tooltip: Array.isArray(option.tooltip)
            ? option.tooltip.map(tooltip)
            : tooltip(option.tooltip),
        }
      : {}),
    ...(option.series
      ? { series: Array.isArray(option.series) ? option.series.map(labels) : labels(option.series) }
      : {}),
    ...(option.radar && !Array.isArray(option.radar)
      ? { radar: { ...option.radar, axisName: { color, ...option.radar.axisName } } }
      : {}),
    ...(option.singleAxis
      ? {
          singleAxis: Array.isArray(option.singleAxis)
            ? option.singleAxis.map(singleAxis)
            : singleAxis(option.singleAxis),
        }
      : {}),
    ...(option.xAxis
      ? { xAxis: Array.isArray(option.xAxis) ? option.xAxis.map(axis) : axis(option.xAxis) }
      : {}),
    ...(option.yAxis
      ? { yAxis: Array.isArray(option.yAxis) ? option.yAxis.map(axis) : axis(option.yAxis) }
      : {}),
  };
}

/** Keep the original option when neither format nor surface text defaults are requested. */
export function applyChartCommonFormat(
  option: EChartsOption,
  chart: SheetChart,
  data: ChartData,
  comboSeriesChanges?: readonly ChartComboSeriesChange[],
): EChartsOption {
  const presentation = getChartRenderPresentation(chart);
  const percent = presentation?.percentStacked === true;
  option = presentationText(option, presentation, getChartPresentationTextColor(chart));
  const field = Object.getOwnPropertyDescriptor(chart, "format");
  const combo = chart.type === "combo";
  if (!field && !combo) return option;
  if (field && !("value" in field)) throw new TypeError("Chart format requires an own data field.");
  const format = field ? normalizeChartFormat(field.value) : {};
  const next: EChartsOption = { ...option };
  if (format.title && option.title && !Array.isArray(option.title))
    next.title = {
      ...option.title,
      textStyle: { ...option.title.textStyle, ...textStyle(format.title) },
    };
  if (format.legend && option.legend) {
    const settings = format.legend;
    const legend = (entry: ScrollableLegendComponentOption): ScrollableLegendComponentOption => ({
      ...entry,
      textStyle: { ...entry.textStyle, ...textStyle(settings.text) },
      ...(settings.surface
        ? {
            backgroundColor: settings.surface.fill ?? "transparent",
            borderColor:
              settings.surface.stroke ?? (settings.surface.strokeWidth ? "#d1d5db" : "transparent"),
            borderWidth: settings.surface.strokeWidth ?? (settings.surface.stroke ? 1 : 0),
          }
        : {}),
    });
    next.legend = Array.isArray(option.legend) ? option.legend.map(legend) : legend(option.legend);
  }
  const bars = chart.type === "bar" || chart.type === "column";
  const lines = chart.type === "line" || chart.type === "area";
  const cartesian = bars || lines || combo || chart.type === "scatter";
  const selectedFormat = (entry: ChartSeries | undefined) =>
    entry?.id !== undefined ? format.series?.find((item) => item.id === entry.id) : undefined;
  const secondary = (entry: ChartSeries) =>
    isChartSecondaryAxisSeries(chart, entry, format, comboSeriesChanges);
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
  const secondaryColumns =
    combo &&
    secondaryEntries.some(
      (entry) =>
        getChartComboDataSeriesSettings(chart, entry, comboSeriesChanges).drawType === "column",
    );
  const isStacked = chart.stacked && (bars || lines);
  const mainBase = horizontal ? x : y;
  if (mainBase.type !== "value")
    throw new TypeError("Chart formatting requires an actual value axis.");
  const mainAxis = valueAxis(mainBase, format.valueAxis, primary, isStacked, hasSecondary, percent);
  let category: AxisOption = horizontal ? y : x;
  if (format.categoryAxis && chart.type !== "scatter" && category.type === "category") {
    const settings = format.categoryAxis;
    category = {
      ...category,
      ...(settings.show !== undefined ? { show: settings.show } : {}),
      ...(settings.reverse !== undefined ? { inverse: settings.reverse } : {}),
      ...(settings.titleVisible === false || settings.title !== undefined
        ? {
            name: settings.titleVisible === false ? "" : settings.title,
            nameLocation: "middle",
            nameGap: 32,
          }
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
        percent,
      )
    : undefined;
  if (horizontal) {
    next.xAxis = otherAxis ? [mainAxis, otherAxis] : mainAxis;
    next.yAxis = hasSecondary && bars ? [category, { ...category, show: false }] : category;
  } else {
    next.yAxis = otherAxis ? [mainAxis, otherAxis] : mainAxis;
    next.xAxis =
      (hasSecondary && bars) || secondaryColumns
        ? [category, { ...category, show: false }]
        : category;
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
          : {
              yAxisIndex: axisIndex,
              xAxisIndex: bars || (combo && series.type === "bar") ? axisIndex : 0,
            }),
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
          ...(combo
            ? { smooth: false }
            : settings?.smooth !== undefined
              ? { smooth: settings.smooth }
              : {}),
          ...(!combo && settings?.markers !== undefined
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
              isStacked
                ? 1
                : (isSecondary ? secondaryEntries : primary).filter(
                    (entry) =>
                      !combo ||
                      getChartComboDataSeriesSettings(chart, entry, comboSeriesChanges).drawType ===
                        "column",
                  ).length,
              format.bar.gapWidth,
              format.bar.overlap,
            )
          : {}),
      };
    });
  return next;
}

/** Last-stage text projection: preserve existing numeric/identity formatters and
 * compose rich script faces only after ordinary chart layout/style decisions. */
export function applyChartScriptFontFormat(
  option: EChartsOption,
  chart: SheetChart,
  theme?: WorkbookTheme,
  resolveFontFamily?: (family: string) => string,
): EChartsOption {
  const f = chart.format;
  if (!f || typeof Intl.Segmenter !== "function") return option;
  type BaseText = {
    fontFamily?: string;
    fontSize?: number | string;
    fontWeight?: string | number;
    fontStyle?: string;
    width?: number | string;
  };
  const baseSize = (base?: BaseText) => {
    const value =
      typeof base?.fontSize === "string" ? Number.parseFloat(base.fontSize) : base?.fontSize;
    return value !== undefined && Number.isFinite(value) ? value : 12;
  };
  const paint = (text: string, settings: ChartTextFormat, base?: BaseText) => {
    const fallback = base?.fontFamily ?? "sans-serif";
    const effective = { ...settings, fontSize: settings.fontSize ?? baseSize(base) };
    const make = (value: string) =>
      createChartTextPlan(value, effective, theme, fallback, resolveFontFamily);
    const measure = (value: string, family: string) =>
      echartsFormat.getTextRect(
        value,
        `${effective.italic ? "italic" : (base?.fontStyle ?? "normal")} ${effective.bold === undefined ? (base?.fontWeight ?? "normal") : effective.bold ? "bold" : "normal"} ${effective.fontSize}px ${family}`,
      ).width;
    const plan =
      typeof base?.width === "number"
        ? truncateChartText(text, base.width, make, measure)
        : make(text);
    return chartRichText(plan);
  };
  const rich = (settings: ChartTextFormat, base?: BaseText) => ({
    fontFamily: base?.fontFamily ?? "sans-serif",
    rich: chartRichStyles(
      { ...settings, fontSize: settings.fontSize ?? baseSize(base) },
      theme,
      base?.fontFamily ?? "sans-serif",
    ),
    // Native rich truncation can split graphemes. Width is handled before encoding.
    overflow: "none" as const,
  });
  const axis = <T extends AxisOption>(entry: T, settings?: ChartTextFormat): T => {
    if (!settings?.scriptFonts) return entry;
    const formatter = entry.axisLabel?.formatter;
    return {
      ...entry,
      ...(entry.name ? { name: paint(entry.name, settings, entry.nameTextStyle) } : {}),
      nameTextStyle: { ...entry.nameTextStyle, ...rich(settings, entry.nameTextStyle) },
      axisLabel: {
        ...entry.axisLabel,
        ...rich(settings, entry.axisLabel),
        formatter: (value: string | number, index: number, extra?: unknown) => {
          const text =
            typeof formatter === "function"
              ? (formatter as (value: string | number, index: number, extra?: unknown) => string)(
                  value,
                  index,
                  extra,
                )
              : typeof formatter === "string"
                ? formatter.replaceAll("{value}", String(value))
                : entry.type === "value" && typeof value === "number"
                  ? echartsFormat.addCommas(value)
                  : String(value);
          return paint(text, settings, entry.axisLabel);
        },
      },
    };
  };
  const axes = (entries: EChartsOption["xAxis"] | EChartsOption["yAxis"], horizontal: boolean) => {
    if (!entries) return entries;
    const apply = (entry: AxisOption, index: number) =>
      axis(
        entry,
        entry.type === "category"
          ? f.categoryAxis?.text
          : index > 0 && horizontal === (chart.type === "bar")
            ? f.secondaryValueAxis?.text
            : f.valueAxis?.text,
      );
    return Array.isArray(entries) ? entries.map(apply) : apply(entries, 0);
  };
  const legend = (entry: ScrollableLegendComponentOption): ScrollableLegendComponentOption => {
    const settings = f.legend?.text;
    if (!settings?.scriptFonts) return entry;
    const formatter = entry.formatter;
    return {
      ...entry,
      textStyle: { ...entry.textStyle, ...rich(settings, entry.textStyle) },
      formatter: (name: string) =>
        paint(
          typeof formatter === "function"
            ? formatter(name)
            : typeof formatter === "string"
              ? formatter.replaceAll("{name}", name)
              : name,
          settings,
          entry.textStyle,
        ),
    };
  };
  return {
    ...option,
    ...(option.title && !Array.isArray(option.title) && f.title?.scriptFonts
      ? {
          title: {
            ...option.title,
            text: paint(option.title.text ?? "", f.title, option.title.textStyle),
            textStyle: { ...option.title.textStyle, ...rich(f.title, option.title.textStyle) },
          },
        }
      : {}),
    ...(option.legend
      ? { legend: Array.isArray(option.legend) ? option.legend.map(legend) : legend(option.legend) }
      : {}),
    ...(option.xAxis ? { xAxis: axes(option.xAxis, true) as EChartsOption["xAxis"] } : {}),
    ...(option.yAxis ? { yAxis: axes(option.yAxis, false) as EChartsOption["yAxis"] } : {}),
  };
}
