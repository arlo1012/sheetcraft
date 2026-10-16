import type { EChartsOption, LegendComponentOption } from "echarts";
import { format } from "echarts/core";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { getChartElementCapabilities, getChartElementSettings } from "./chart-elements";
type ChartDimensions = { width: number; height: number };
export type ChartLegendBounds = { x: number; y: number; width: number; height: number };

export function createChartElementLayout(
  chart: SheetChart,
  data: ChartData,
  dimensions?: ChartDimensions,
) {
  const capabilities = getChartElementCapabilities(chart.type);
  const elements = chart.elements;
  // An old chart, or a label-only edit, keeps the original renderer's geometry.
  if (
    !elements ||
    (elements.titlePosition === undefined &&
      (!capabilities.legend ||
        (elements.legendPosition === undefined && elements.legendOverlay === undefined)))
  )
    return undefined;
  const settings = getChartElementSettings(chart);
  const width = Math.max(1, dimensions?.width ?? 480);
  const height = Math.max(1, dimensions?.height ?? 300);
  const margin = Math.min(8, width / 10, height / 10);
  const titleHeight =
    chart.title && settings.titlePosition === "above" ? Math.min(30, height * 0.24) : 0;
  const plot = {
    left: margin,
    top: margin + titleHeight,
    right: margin,
    bottom: margin,
    width: width - margin * 2,
    height: height - margin * 2 - titleHeight,
  };
  const title: EChartsOption["title"] = {
    text: chart.title,
    show: settings.titlePosition !== "none",
    top: margin,
    left: "center",
    textStyle: {
      fontSize: 15,
      fontWeight: "normal",
      width: plot.width,
      height: Math.max(1, Math.min(20, height * 0.2)),
      overflow: "truncate",
      lineOverflow: "truncate",
    },
  };
  const legend: EChartsOption["legend"] = {
    show: chart.legend && capabilities.legend,
    type: "scroll",
  };
  let legendBounds: ChartLegendBounds | undefined;
  if (chart.legend && capabilities.legend) {
    const names =
      chart.type === "pie" || chart.type === "doughnut"
        ? data.categories
        : data.series.slice(chart.type === "scatter" ? 1 : 0).map((entry) => entry.name);
    const vertical = ["left", "right", "topRight"].includes(settings.legendPosition);
    const gap = Math.min(8, plot.width * 0.04, plot.height * 0.04);
    // A bounded scroll viewport and truncated one-line names keep even very long
    // legends in their reserved strip. Moving legend coordinates alone cannot do this.
    const legendWidth = vertical
      ? Math.min(144, Math.max(64, ...names.map((name) => name.length * 7 + 22)), plot.width * 0.3)
      : plot.width;
    const legendHeight = vertical
      ? Math.min(plot.height, Math.max(16, names.length * 20))
      : Math.min(28, plot.height * 0.22);
    const left = settings.legendPosition === "left" ? plot.left : width - plot.right - legendWidth;
    const top =
      settings.legendPosition === "bottom"
        ? height - plot.bottom - legendHeight
        : settings.legendPosition === "left" || settings.legendPosition === "right"
          ? plot.top + (plot.height - legendHeight) / 2
          : plot.top;
    legendBounds = {
      x: vertical ? left : (width - legendWidth) / 2,
      y: top,
      width: legendWidth,
      height: legendHeight,
    };
    const itemWidth = Math.min(12, legendWidth * 0.2);
    Object.assign(legend, {
      orient: vertical ? "vertical" : "horizontal",
      left: vertical ? left : "center",
      top,
      width: legendWidth,
      height: legendHeight,
      padding: 0,
      itemWidth,
      itemHeight: Math.min(10, legendHeight * 0.5),
      itemGap: 8,
      formatter: (name: string) => name.replace(/[\r\n]+/g, " "),
      textStyle: {
        fontSize: Math.max(1, Math.min(12, legendHeight - 4)),
        width: Math.max(1, Math.min(140, legendWidth - itemWidth - 7)),
        overflow: "truncate",
      },
      pageIconSize: Math.min(8, legendWidth / 8),
      pageButtonItemGap: 2,
      pageButtonGap: 4,
      pageFormatter: "{current}",
      pageTextStyle: { fontSize: Math.min(10, legendWidth / 7) },
    });
    if (!settings.legendOverlay) {
      if (vertical) {
        if (settings.legendPosition === "left") plot.left += legendWidth + gap;
        else plot.right += legendWidth + gap;
        plot.width -= legendWidth + gap;
      } else {
        if (settings.legendPosition === "top") plot.top += legendHeight + gap;
        else plot.bottom += legendHeight + gap;
        plot.height -= legendHeight + gap;
      }
    }
  }
  return { title, legend, plot, legendBounds };
}

/** The screen renderer and hit testing share this bounded legend viewport.
 * Legacy charts retain their original plot layout; only the editable legend gets
 * an explicit bottom viewport. No ECharts scene-tree access is needed.
 */
export function getChartLegendLayout(
  chart: SheetChart,
  data: ChartData,
  dimensions: ChartDimensions,
) {
  const series = chart.type === "scatter" ? data.series.slice(1) : data.series;
  if (
    !chart.legend ||
    !getChartElementCapabilities(chart.type).legend ||
    !series.some((entry) => entry.values.length > 0) ||
    (chart.source && chart.source.series.length === 0)
  )
    return;
  const layout = createChartElementLayout(chart, data, dimensions);
  const width = Math.max(1, dimensions.width);
  const height = Math.max(1, dimensions.height);
  const inset = Math.min(5, width / 10);
  const viewport = layout?.legendBounds ?? {
    x: inset,
    y: Math.max(0, height - 28),
    width: width - inset * 2,
    height: Math.min(28, height),
  };
  const vertical = ["left", "right", "topRight"].includes(
    getChartElementSettings(chart).legendPosition,
  );
  const names =
    chart.type === "pie" || chart.type === "doughnut"
      ? data.categories
      : series.map((entry) => entry.name);
  if (!names.length) return;
  const fontSize = Math.max(1, Math.min(12, viewport.height - 4));
  const itemWidth = Math.min(12, viewport.width * 0.2);
  const itemHeight = Math.min(10, viewport.height * 0.5);
  const textWidth = Math.max(
    1,
    Math.min(
      140,
      viewport.width - itemWidth - 7,
      // ZRender reserves one pixel before truncating. Round fractional glyph
      // measurements upward and retain that guard inside the viewport cap.
      Math.ceil(
        Math.max(
          ...names.map(
            (name) =>
              format.getTextRect(name.replace(/[\r\n]+/g, " "), `${fontSize}px Arial, sans-serif`)
                .width,
          ),
        ),
      ) + 1,
    ),
  );
  // A fixed measured text width and line height make the screen legend's public
  // layout deterministic. Truncation and native scrolling handle overflow.
  const entryWidth = itemWidth + 5 + textWidth;
  const entryHeight = Math.max(fontSize, itemHeight);
  const tightWidth = Math.min(
    viewport.width,
    vertical ? entryWidth : names.length * (entryWidth + 8) - 8,
  );
  const tightHeight = Math.min(
    viewport.height,
    vertical ? names.length * (entryHeight + 8) - 8 : entryHeight,
  );
  const bounds = {
    x: vertical ? viewport.x : (width - tightWidth) / 2,
    y: viewport.y,
    width: tightWidth,
    height: tightHeight,
  };
  const option: LegendComponentOption = {
    ...(layout?.legend as LegendComponentOption | undefined),
    left: bounds.x,
    top: bounds.y,
    bottom: undefined,
    width: bounds.width,
    height: bounds.height,
    padding: 0,
    itemWidth,
    itemHeight,
    itemGap: 8,
    pageIconSize: Math.min(8, fontSize, viewport.width / 8),
    pageButtonItemGap: 2,
    pageButtonGap: 4,
    pageFormatter: "{current}",
    pageTextStyle: { fontSize: Math.min(10, fontSize), lineHeight: Math.min(10, fontSize) },
    textStyle: {
      fontFamily: "Arial, sans-serif",
      fontSize,
      lineHeight: fontSize,
      width: textWidth,
      overflow: "truncate",
    },
  };
  return { bounds, option };
}

export function chartLegendContainsPoint(
  bounds: ChartLegendBounds | undefined,
  x: number,
  y: number,
): boolean {
  return (
    !!bounds &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}
