import type { EChartsOption, SeriesOption } from "echarts";
import type { ChartData, ChartTrendlineType, SheetChart } from "@sheetcraft/core/sheet-charts";
import { chartPlotSeries } from "./chart-bubble";

type Point = { x: number; y: number };

export function computeLinearTrendline(points: readonly Point[]): Point[] {
  if (points.length < 2) return [];
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }
  const n = points.length;
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return [];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return points.map((p) => ({ x: p.x, y: slope * p.x + intercept }));
}

export function computeExponentialTrendline(points: readonly Point[]): Point[] {
  const positive = points.filter((p) => p.y > 0);
  if (positive.length < 2) return [];
  let sumX = 0;
  let sumLnY = 0;
  let sumXX = 0;
  let sumXLnY = 0;
  for (const p of positive) {
    const lnY = Math.log(p.y);
    sumX += p.x;
    sumLnY += lnY;
    sumXX += p.x * p.x;
    sumXLnY += p.x * lnY;
  }
  const n = positive.length;
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return [];
  const b = (n * sumXLnY - sumX * sumLnY) / denom;
  const lnA = (sumLnY - b * sumX) / n;
  const a = Math.exp(lnA);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  return points
    .map((p) => ({ x: p.x, y: a * Math.exp(b * p.x) }))
    .filter((p) => Number.isFinite(p.y));
}

export function computeMovingAverageTrendline(points: readonly Point[], period = 2): Point[] {
  if (points.length < period || period < 2) return [];
  const result: Point[] = [];
  for (let i = period - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += points[j]!.y;
    result.push({ x: points[i]!.x, y: sum / period });
  }
  return result;
}

function computeTrendPoints(
  points: readonly Point[],
  type: Exclude<ChartTrendlineType, "none">,
): Point[] {
  if (type === "linear") return computeLinearTrendline(points);
  if (type === "exponential") return computeExponentialTrendline(points);
  return computeMovingAverageTrendline(points, 2);
}

export function supportsChartTrendline(chart: SheetChart): boolean {
  return (
    ["column", "bar", "line", "area", "scatter", "combo"].includes(chart.type) &&
    !chart.stacked &&
    !chart.presentation?.percentStacked
  );
}

function resolveSeriesColor(
  series: SeriesOption | undefined,
  fallbackPalette: readonly string[],
  index: number,
): string {
  if (series && typeof series === "object") {
    const lineColor =
      "lineStyle" in series && series.lineStyle && typeof series.lineStyle === "object"
        ? (series.lineStyle as { color?: unknown }).color
        : undefined;
    if (typeof lineColor === "string" && lineColor) return lineColor;
    const itemColor =
      "itemStyle" in series && series.itemStyle && typeof series.itemStyle === "object"
        ? (series.itemStyle as { color?: unknown }).color
        : undefined;
    if (typeof itemColor === "string" && itemColor) return itemColor;
  }
  return fallbackPalette[index % fallbackPalette.length] ?? "#4f81bd";
}

export function appendChartTrendlineSeries(
  option: EChartsOption,
  chart: SheetChart,
  data: ChartData,
  palette: readonly string[],
): EChartsOption {
  const mode = chart.elements?.trendline;
  if (!mode || mode === "none" || !supportsChartTrendline(chart) || !Array.isArray(option.series))
    return option;

  const baseSeries = option.series;
  const overlays: SeriesOption[] = [];

  if (chart.type === "scatter") {
    const xValues = data.series.length > 1 ? data.series[0]!.values : undefined;
    const ySeries = chartPlotSeries(chart, data);
    ySeries.forEach((entry, index) => {
      const points: Point[] = [];
      entry.values.forEach((y, pointIndex) => {
        const x = xValues ? xValues[pointIndex] : pointIndex + 1;
        if (
          typeof x === "number" &&
          Number.isFinite(x) &&
          typeof y === "number" &&
          Number.isFinite(y)
        )
          points.push({ x, y });
      });
      points.sort((a, b) => a.x - b.x);
      const trend = computeTrendPoints(points, mode);
      if (trend.length < 2) return;
      const color = resolveSeriesColor(baseSeries[index], palette, index);
      overlays.push({
        type: "line",
        data: trend.map((p) => [p.x, p.y]),
        showSymbol: false,
        smooth: mode === "exponential",
        silent: true,
        legendHoverLink: false,
        tooltip: { show: false },
        label: { show: false },
        lineStyle: { color, width: 1.5, type: "dashed" },
        z: 10,
      });
    });
  } else {
    const horizontal = chart.type === "bar";
    data.series.forEach((entry, index) => {
      const points: Point[] = [];
      entry.values.forEach((y, pointIndex) => {
        if (typeof y === "number" && Number.isFinite(y)) points.push({ x: pointIndex, y });
      });
      const trend = computeTrendPoints(points, mode);
      if (trend.length < 2) return;
      const color = resolveSeriesColor(baseSeries[index], palette, index);
      const sourceSeries = baseSeries[index];
      const yAxisIndex =
        sourceSeries &&
        typeof sourceSeries === "object" &&
        "yAxisIndex" in sourceSeries &&
        typeof sourceSeries.yAxisIndex === "number"
          ? sourceSeries.yAxisIndex
          : undefined;
      let lineData: Array<number | null | [number, number]>;
      if (horizontal) {
        lineData = trend.map((p) => [p.y, p.x] as [number, number]);
      } else {
        const byIndex = new Map<number, number>(trend.map((p) => [p.x, p.y]));
        lineData = data.categories.map((_, catIndex) => byIndex.get(catIndex) ?? null);
      }
      overlays.push({
        type: "line",
        data: lineData,
        ...(yAxisIndex !== undefined ? { yAxisIndex } : {}),
        connectNulls: true,
        showSymbol: false,
        smooth: mode === "exponential",
        silent: true,
        legendHoverLink: false,
        tooltip: { show: false },
        label: { show: false },
        lineStyle: { color, width: 1.5, type: "dashed" },
        z: 10,
      });
    });
  }

  if (!overlays.length) return option;
  return {
    ...option,
    series: [...baseSeries, ...overlays],
  };
}
