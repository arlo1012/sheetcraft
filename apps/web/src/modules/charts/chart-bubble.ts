import type { ChartData, ChartType, SheetChart, ChartSeries } from "@sheetcraft/core/sheet-charts";
import type { ScatterSeriesOption } from "echarts";
import { color } from "echarts/core";

export function isXYChart(type: ChartType): boolean {
  return type === "scatter" || type === "bubble";
}

/** WPS pairs each Y band with its size band; only an odd band count supplies X. */
function bubbleBands(data: ChartData) {
  const pairs: Array<{ y: ChartSeries; size?: ChartSeries }> = [];
  if (data.series.length === 1) {
    pairs.push({ y: data.series[0]! });
    return { x: undefined, pairs };
  }
  const firstY = data.series.length % 2;
  for (let index = firstY; index + 1 < data.series.length; index += 2) {
    pairs.push({ y: data.series[index]!, size: data.series[index + 1]! });
  }
  return { x: firstY ? data.series[0] : undefined, pairs };
}

export function chartPlotSeries(chart: SheetChart, data: ChartData) {
  if (chart.type === "bubble") return bubbleBands(data).pairs.map(({ y }) => y);
  return chart.type === "scatter" ? data.series.slice(1) : data.series;
}

export function bubbleFormats(data: ChartData, index: number) {
  const { x, pairs } = bubbleBands(data);
  return { x: x?.numberFormat, size: pairs[index]?.size?.numberFormat };
}

export function bubbleSeries(
  chart: SheetChart,
  data: ChartData,
  palette: readonly string[],
  diameter: number,
): ScatterSeriesOption[] {
  const { x, pairs } = bubbleBands(data);
  let largest = 0;
  const series = pairs.map(({ y, size }) => {
    const points: Array<[number, number, number]> = [];
    y.values.forEach((value, index) => {
      const horizontal = x ? x.values[index] : index + 1;
      const area = size ? size.values[index] : 1;
      if (horizontal == null || value === null || area == null || area <= 0) return;
      largest = Math.max(largest, area);
      points.push([horizontal, value, area]);
    });
    return { name: y.name, points };
  });
  return series.map(({ name, points }, index) => {
    const base = palette[index % palette.length]!;
    return {
      name,
      type: "scatter",
      symbol: "circle",
      data: points,
      symbolSize: (point: number[]) => diameter * Math.sqrt(point[2]! / largest),
      encode: { x: 0, y: 1, tooltip: [0, 1, 2], label: 1 },
      label: { show: chart.labels },
      itemStyle: {
        opacity: 0.86,
        color: chart.presentation?.bubbleShading
          ? {
              type: "radial",
              x: 0.33,
              y: 0.28,
              r: 0.8,
              colorStops: [
                { offset: 0, color: "#ffffff" },
                { offset: 0.45, color: base },
                { offset: 1, color: color.lerp(0.4, [base, "#000000"])! },
              ],
            }
          : base,
      },
    };
  });
}
