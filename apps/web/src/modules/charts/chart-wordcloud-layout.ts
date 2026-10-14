import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { getChartElementSettings } from "./chart-elements";
import {
  createChartPresentationData,
  getChartRenderPresentation,
} from "./chart-presentation-render";

export type WordCloudLayout = {
  title: { show: boolean; offset: number };
  words: Array<{
    text: string;
    value: number;
    x: number;
    y: number;
    size: number;
    color: string;
  }>;
};

/** Shared screen/print geometry; preserve the original word cloud's grid and palette. */
export function createWordCloudLayout(
  chart: SheetChart,
  data: ChartData,
  dimensions: { width: number; height: number },
): WordCloudLayout {
  const presentation = getChartRenderPresentation(chart);
  createChartPresentationData(chart, data, presentation);
  const position = getChartElementSettings(chart).titlePosition;
  const title = {
    show: position !== "none",
    offset:
      chart.elements?.titlePosition === undefined
        ? 30
        : position === "above" && chart.title
          ? Math.min(30, dimensions.height * 0.24)
          : 0,
  };
  const source = data.categories
    .map((text, index) => ({ text, value: data.series[0]?.values[index] ?? 0 }))
    .filter((word) => word.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 100);
  const columns = Math.max(
    1,
    Math.ceil(Math.sqrt((source.length * dimensions.width) / Math.max(1, dimensions.height))),
  );
  const rows = Math.ceil(source.length / columns);
  const width = dimensions.width / columns;
  const height = Math.max(1, (dimensions.height - title.offset - 5) / Math.max(1, rows));
  const max = source[0]?.value ?? 1;
  const palette = presentation?.palette ?? ["#2563eb", "#16a34a", "#8b5cf6", "#ef4444", "#f59e0b"];
  return {
    title,
    words: source.map((word, index) => ({
      ...word,
      x: ((index % columns) + 0.5) * width,
      y: (Math.floor(index / columns) + 0.5) * height + title.offset,
      size: Math.max(
        6,
        Math.min(
          height * 0.8,
          (width / Math.max(1, [...word.text].length)) * 1.5,
          12 + 36 * Math.sqrt(word.value / max),
        ),
      ),
      color: palette[index % palette.length]!,
    })),
  };
}
