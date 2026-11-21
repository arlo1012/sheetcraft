import type { CustomSeriesOption, EChartsOption, SeriesOption } from "echarts";
import type { ChartData, ChartErrorBarType, SheetChart } from "@sheetcraft/core/sheet-charts";
import { chartPlotSeries } from "./chart-bubble";

export function supportsChartErrorBars(chart: SheetChart): boolean {
  return (
    ["column", "bar", "line", "area", "scatter", "combo"].includes(chart.type) &&
    !chart.stacked &&
    !chart.presentation?.percentStacked
  );
}

export function computeErrorBarDeltas(
  values: readonly (number | null)[],
  mode: Exclude<ChartErrorBarType, "none">,
): (number | null)[] {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!valid.length) return values.map(() => null);
  if (mode === "percentage") {
    return values.map((v) =>
      typeof v === "number" && Number.isFinite(v) ? Math.abs(v) * 0.05 : null,
    );
  }
  if (valid.length < 2) return values.map(() => null);
  const mean = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  const variance = valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (valid.length - 1);
  const sd = Math.sqrt(variance);
  const delta = mode === "standardError" ? sd / Math.sqrt(valid.length) : sd;
  if (!Number.isFinite(delta) || delta <= 0) return values.map(() => null);
  return values.map((v) => (typeof v === "number" && Number.isFinite(v) ? delta : null));
}

export function appendChartErrorBarSeries(
  option: EChartsOption,
  chart: SheetChart,
  data: ChartData,
): EChartsOption {
  const mode = chart.elements?.errorBars;
  if (!mode || mode === "none" || !supportsChartErrorBars(chart) || !Array.isArray(option.series))
    return option;

  const baseSeries = option.series;
  const overlays: SeriesOption[] = [];
  const horizontal = chart.type === "bar";
  const isScatter = chart.type === "scatter";
  const xValues = isScatter && data.series.length > 1 ? data.series[0]!.values : undefined;
  const targetSeries = isScatter ? chartPlotSeries(chart, data) : data.series;
  const barLikeCount =
    chart.type === "column" || chart.type === "bar" ? Math.max(1, targetSeries.length) : 1;

  targetSeries.forEach((entry, seriesIndex) => {
    const deltas = computeErrorBarDeltas(entry.values, mode);
    const items: Array<[number, number, number]> = [];
    entry.values.forEach((y, pointIndex) => {
      const delta = deltas[pointIndex];
      if (typeof y !== "number" || !Number.isFinite(y) || delta === null || delta === undefined)
        return;
      const x = isScatter ? (xValues ? xValues[pointIndex] : pointIndex + 1) : pointIndex;
      if (typeof x !== "number" || !Number.isFinite(x)) return;
      items.push([x, y - delta, y + delta]);
    });
    if (!items.length) return;

    const sourceSeries = baseSeries[seriesIndex];
    const yAxisIndex =
      sourceSeries &&
      typeof sourceSeries === "object" &&
      "yAxisIndex" in sourceSeries &&
      typeof sourceSeries.yAxisIndex === "number"
        ? sourceSeries.yAxisIndex
        : undefined;

    const barOffsetRatio =
      barLikeCount > 1 ? (seriesIndex - (barLikeCount - 1) / 2) * (0.6 / barLikeCount) : 0;

    const customSeries: CustomSeriesOption = {
      type: "custom",
      data: items,
      ...(yAxisIndex !== undefined ? { yAxisIndex } : {}),
      silent: true,
      legendHoverLink: false,
      tooltip: { show: false },
      z: 11,
      renderItem(_params, api) {
        const cat = api.value(0) as number;
        const low = api.value(1) as number;
        const high = api.value(2) as number;
        const halfCap = 4;
        const style = { stroke: "#374151", lineWidth: 1.2 };
        if (horizontal) {
          const band = api.size?.([0, 1]) as [number, number] | undefined;
          const dy = band ? barOffsetRatio * band[1] : 0;
          const lowPt = api.coord([low, cat]);
          const highPt = api.coord([high, cat]);
          if (!lowPt || !highPt) return;
          const y = lowPt[1]! + dy;
          return {
            type: "group",
            children: [
              { type: "line", shape: { x1: lowPt[0]!, y1: y, x2: highPt[0]!, y2: y }, style },
              {
                type: "line",
                shape: { x1: lowPt[0]!, y1: y - halfCap, x2: lowPt[0]!, y2: y + halfCap },
                style,
              },
              {
                type: "line",
                shape: { x1: highPt[0]!, y1: y - halfCap, x2: highPt[0]!, y2: y + halfCap },
                style,
              },
            ],
          };
        }
        const band = isScatter ? undefined : (api.size?.([1, 0]) as [number, number] | undefined);
        const dx = band ? barOffsetRatio * band[0] : 0;
        const lowPt = api.coord([cat, low]);
        const highPt = api.coord([cat, high]);
        if (!lowPt || !highPt) return;
        const x = lowPt[0]! + dx;
        return {
          type: "group",
          children: [
            { type: "line", shape: { x1: x, y1: lowPt[1]!, x2: x, y2: highPt[1]! }, style },
            {
              type: "line",
              shape: { x1: x - halfCap, y1: lowPt[1]!, x2: x + halfCap, y2: lowPt[1]! },
              style,
            },
            {
              type: "line",
              shape: { x1: x - halfCap, y1: highPt[1]!, x2: x + halfCap, y2: highPt[1]! },
              style,
            },
          ],
        };
      },
    };
    overlays.push(customSeries);
  });

  if (!overlays.length) return option;
  return {
    ...option,
    series: [...baseSeries, ...overlays],
  };
}
