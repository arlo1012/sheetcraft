import { pieOutsideLabels, pieLabelPaint, pieSectorPaint } from "./chart-pie-appearance";
import type { EChartsOption, LegendComponentOption, PieSeriesOption } from "echarts";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { perspectivePie, type PieSector } from "./chart-pie-perspective";
import { splitPieOption } from "./chart-pie-split";

type PlotBounds = { left: number; right: number; top: number; bottom: number };

export function pieChartOption(
  chart: SheetChart,
  data: ChartData,
  common: EChartsOption,
  palette: readonly string[],
  size: { width: number; height: number },
  bounds?: PlotBounds,
): EChartsOption {
  const rings = chart.type === "doughnut";
  const style = chart.presentation?.pieStyle;
  const split = style === "pieOfPie" || style === "barOfPie";
  const entries = rings ? data.series : data.series.slice(0, 1);
  const format = chart.presentation;
  const outside = chart.labels && pieOutsideLabels(format);
  const outer = outside ? 63 : 82;
  const hole = rings ? (outer * (format?.doughnutHole ?? 50)) / 100 : 0;
  const thickness = entries.length ? (outer - hole) / entries.length : 0;
  const names = data.categories;
  // Native pie legends match sectors by name. Give duplicate and empty category
  // labels independent identities, shared consistently across every ring.
  const needsKeys =
    new Set(names).size !== names.length || names.includes("") || (split && names.includes("Σ"));
  const keys = needsKeys ? names.map((_, index) => `category-${index}`) : names;
  const labelsByKey = new Map(keys.map((key, index) => [key, names[index]!]));
  const legend: LegendComponentOption = {
    ...(common.legend as LegendComponentOption),
    data: keys,
    formatter: (key: string) => labelsByKey.get(key) ?? key,
  };
  const inset = bounds ?? {
    left: 8,
    right: 8,
    top: chart.title ? 32 : 8,
    bottom: chart.legend ? 32 : 8,
  };
  const plot = {
    x: inset.left,
    y: inset.top,
    width: Math.max(1, size.width - inset.left - inset.right),
    height: Math.max(1, size.height - inset.top - inset.bottom),
  };
  const slices = entries.map((entry) => {
    const max = entry.values.reduce<number>((n, v) => Math.max(n, Math.abs(v ?? 0)), 0);
    const total = max ? entry.values.reduce<number>((n, v) => n + Math.abs(v ?? 0) / max, 0) : 0;
    return keys.map((name, index): PieSector => {
      const raw = entry.values[index],
        amount = Math.abs(raw ?? 0);
      const fraction = total ? amount / max / total : 0;
      const text = raw == null ? "" : formatCellNumberValue(raw, entry.numberFormat).text;
      const percent = `${!split && raw != null && raw < 0 ? "-" : ""}${Math.round(fraction * 100)}%`;
      const label =
        chart.presentation?.pieLabels === "categoryPercent"
          ? `${names[index]}\n${percent}`
          : chart.presentation?.pieLabels === "percent"
            ? percent
            : text;
      return {
        name,
        value: raw == null ? "-" : amount,
        color: format?.pieFocusFirst && index > 0 ? "#d9dce2" : palette[index % palette.length]!,
        text: `${entry.name}\n${names[index]}: ${text}`,
        label: raw == null ? "" : label,
        fraction,
      };
    });
  });
  const series = entries.map((entry, ring): PieSeriesOption => {
    const sectors = slices[ring]!;
    return {
      type: "pie",
      name: entry.name,
      ...inset,
      radius: rings
        ? [`${hole + ring * thickness}%`, `${hole + (ring + 1) * thickness}%`]
        : `${outer}%`,
      center: ["50%", "50%"],
      stillShowZeroSum: false,
      showEmptyCircle: false,
      selectedMode: chart.presentation?.pieExploded ? "multiple" : false,
      selectedOffset: Math.min(plot.width, plot.height) * 0.035,
      label: {
        show: chart.labels,
        position: outside ? "outside" : "inside",
        formatter: (p) => sectors[p.dataIndex]?.label ?? "",
      },
      tooltip: {
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          return p ? (sectors[p.dataIndex]?.text ?? "") : "";
        },
      },
      labelLine: { show: outside, length: 8, length2: 6 },
      data: sectors.map((s) => ({
        name: s.name,
        value: s.value,
        itemStyle: pieSectorPaint(s.color, format),
        label: { ...pieLabelPaint(s.color, format), ...(s.value === "-" ? { show: false } : {}) },
        ...(chart.presentation?.pieExploded ? { selected: true } : {}),
      })),
    };
  });
  const first = series[0],
    sectors = slices[0];
  if (!first || !sectors) return { ...common, legend, series };
  if (style === "threeD") {
    // The zero-radius pie supplies the native per-category legend provider.
    // The visible series draws the projected sector surfaces.
    const radius = Math.max(
      1,
      Math.min(plot.width * (outside ? 0.33 : 0.45), plot.height * (outside ? 0.52 : 0.68)),
    );
    return {
      ...common,
      legend,
      series: [
        {
          ...first,
          silent: true,
          radius: 0,
          selectedOffset: 0,
          label: { show: false },
          tooltip: { show: false },
        },
        perspectivePie(
          entries[0]!.name,
          sectors,
          plot.x + plot.width / 2,
          plot.y + plot.height / 2,
          radius,
          !!chart.presentation?.pieExploded,
          chart.labels,
          format,
        ),
      ],
    };
  }
  if (split)
    return {
      ...common,
      legend,
      ...splitPieOption(
        sectors,
        first,
        plot,
        style === "barOfPie",
        chart.labels,
        !!chart.presentation?.pieLabels,
        format,
      ),
    };
  if (rings && format?.doughnutRim) {
    const radius = Math.min(plot.width, plot.height) / 200;
    return {
      ...common,
      legend,
      series,
      graphic: [outer + 2.5, hole - 1.5].map((r) => ({
        type: "circle" as const,
        silent: true,
        shape: { cx: plot.x + plot.width / 2, cy: plot.y + plot.height / 2, r: r * radius },
        style: { fill: "none", stroke: palette[0], lineWidth: 1 },
        z: 3,
      })),
    };
  }
  return { ...common, legend, series };
}
