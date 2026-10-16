import type {
  EChartsOption,
  SeriesOption,
  LegendComponentOption,
  TooltipComponentFormatterCallbackParams,
} from "echarts";
import { format } from "echarts/core";
import { resolveChartSeriesColors } from "@sheetcraft/core/chart-presentation";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";

const seriesLegendTypes = new Set(["column", "bar", "line", "area", "combo", "scatter"]);

/** A renderer-only name; never a Core ID or a saved source/series mutation. */
function legendKey(entry: ChartData["series"][number], index: number): string {
  const identity =
    entry.id !== undefined
      ? ["id", entry.id]
      : entry.rangeBand !== undefined
        ? ["range", entry.rangeBand.seriesBy, entry.rangeBand.index]
        : // Cache/test data without a source identity has only its current ordinal.
          ["ordinal", index];
  return `sheetcraft-series:${JSON.stringify(identity)}`;
}

function plainValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(plainValue).join(" / ");
  if (value === null || value === undefined) return "-";
  return typeof value === "number" ? format.addCommas(value) : String(value);
}

/**
 * ECharts legend selection and palette lookup use names, not series IDs. Project
 * six Cartesian families together so equal/empty user labels remain independent.
 * Data-owned legends (pie/radar/river etc.) have a different identity contract.
 */
export function applySeriesLegendIdentity(
  option: EChartsOption,
  chart: SheetChart,
  data: ChartData,
): EChartsOption {
  if (!seriesLegendTypes.has(chart.type) || !Array.isArray(option.series) || !option.series.length)
    return option;
  const entries = chart.type === "scatter" ? data.series.slice(1) : data.series;
  if (option.series.length !== entries.length)
    throw new RangeError("Chart legend projection requires one series per source entry.");
  const keys = entries.map(legendKey);
  if (new Set(keys).size !== keys.length)
    throw new RangeError("Chart legend projection requires distinct source identities.");
  const labels = new Map(keys.map((key, index) => [key, entries[index]!.name]));
  const palette = Array.isArray(option.color) ? option.color : [option.color];
  const items = option.series.map((item) => {
    if (item.type !== "bar" && item.type !== "line" && item.type !== "scatter")
      throw new RangeError("Unsupported series in the Cartesian legend projection.");
    return item;
  });
  // Resolve the original display-name cache before projecting unique keys. Keep
  // the renderer's truthy-paint boundary when passing automatic paints to Core.
  const resolvedColors = resolveChartSeriesColors(
    items.map((item, index) => ({
      name: entries[index]!.name,
      color: item.itemStyle?.color || undefined,
    })),
    palette,
  );
  const series = items.map((item, index): SeriesOption => {
    const label = entries[index]!.name;
    const color = resolvedColors[index];
    const valueFormatter = item.tooltip?.valueFormatter;
    const tooltip = (params: TooltipComponentFormatterCallbackParams): string => {
      const point = Array.isArray(params) ? params[0] : params;
      if (!point) return "";
      const raw = point.value;
      const scalarOrArray =
        raw == null ||
        typeof raw === "string" ||
        typeof raw === "number" ||
        raw instanceof Date ||
        Array.isArray(raw);
      const value =
        valueFormatter && scalarOrArray ? valueFormatter(raw, point.dataIndex) : plainValue(raw);
      const category = point.name ?? "";
      return `${label ? `${label}\n` : ""}${point.marker ?? ""}${category ? `${category}: ` : ""}${value}`;
    };
    return {
      ...item,
      name: keys[index],
      itemStyle: { ...item.itemStyle, ...(color ? { color } : {}) },
      tooltip: { ...item.tooltip, formatter: tooltip },
    };
  });
  const legendEntries = series.map((item, index) => ({
    name: keys[index]!,
    ...(chart.type === "combo" && item.type === "line" && item.showSymbol === false
      ? {
          icon: "line",
          itemStyle: { borderColor: "auto", borderWidth: item.lineStyle?.width ?? 2 },
        }
      : {}),
  }));
  const projectLegend = (legend: LegendComponentOption) => {
    const originalFormatter = legend.formatter;
    return {
      ...legend,
      data: chart.type === "bar" ? [...legendEntries].reverse() : legendEntries,
      formatter: (key: string) => {
        const label = labels.get(key) ?? key;
        return typeof originalFormatter === "function"
          ? originalFormatter(label)
          : typeof originalFormatter === "string"
            ? originalFormatter.replaceAll("{name}", label)
            : label;
      },
    };
  };
  return {
    ...option,
    series,
    ...(option.legend
      ? {
          legend: Array.isArray(option.legend)
            ? option.legend.map(projectLegend)
            : projectLegend(option.legend),
        }
      : {}),
  };
}
