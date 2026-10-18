import { createChartTextPlan, measureChartText, type ChartFontContext } from "./chart-script-fonts";
import type { EChartsOption, LegendComponentOption } from "echarts";
import { format } from "echarts/core";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { getChartElementCapabilities, getChartElementSettings } from "./chart-elements";
type ChartDimensions = { width: number; height: number } & ChartFontContext;
export type ChartLegendBounds = { x: number; y: number; width: number; height: number };

/** Public legend options and hit geometry use exactly the same text metrics. */
function legendMetrics(
  chart: SheetChart,
  names: string[],
  height: number,
  context?: ChartFontContext,
) {
  const settings = chart.format?.legend;
  const text = settings?.text;
  const surface = settings?.surface;
  const border = surface?.strokeWidth ?? (surface?.stroke ? 1 : 0);
  const padding = settings ? 4 : 0;
  const inset = padding * 2 + border;
  // An explicit document size never silently changes with the drawing viewport.
  const fontSize = text?.fontSize ?? Math.max(1, Math.min(12, height - inset - 4));
  const fontFamily = text?.fontFamily ?? "Arial, sans-serif";
  const fontWeight = text?.bold ? "bold" : "normal";
  const fontStyle = text?.italic ? "italic" : "normal";
  const measure = (value: string, family: string) =>
    format.getTextRect(value, `${fontStyle} ${fontWeight} ${fontSize}px ${family}`).width;
  const lineHeight = settings ? Math.ceil(fontSize * 1.2) : fontSize;
  const measuredWidth =
    Math.ceil(
      Math.max(
        0,
        ...names.map((name) =>
          measureChartText(
            createChartTextPlan(
              name.replace(/[\r\n]+/g, " "),
              text,
              context?.theme,
              fontFamily,
              context?.resolveFontFamily,
            ),
            measure,
          ),
        ),
      ),
    ) + 1;
  return {
    border,
    padding,
    inset,
    fontSize,
    lineHeight,
    measuredWidth,
    textStyle: {
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      lineHeight,
      ...(text?.color !== undefined ? { color: text.color } : {}),
    },
  } as const;
}

export function createChartElementLayout(
  chart: SheetChart,
  data: ChartData,
  dimensions?: ChartDimensions,
) {
  const capabilities = getChartElementCapabilities(chart.type);
  const elements = chart.elements;
  // An old chart, or a label-only edit, keeps the original renderer's geometry.
  if (
    !chart.format?.legend &&
    (!elements ||
      (elements.titlePosition === undefined &&
        (!capabilities.legend ||
          (elements.legendPosition === undefined && elements.legendOverlay === undefined))))
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
    const metrics = legendMetrics(chart, names, plot.height, dimensions);
    const styled = chart.format?.legend !== undefined;
    const legendWidth = vertical
      ? Math.min(
          styled ? Math.max(144, metrics.measuredWidth + 22 + metrics.inset) : 144,
          styled
            ? Math.max(64, metrics.measuredWidth + 22 + metrics.inset)
            : Math.max(64, ...names.map((name) => name.length * 7 + 22)),
          plot.width * 0.3,
        )
      : plot.width;
    const legendHeight = vertical
      ? Math.min(plot.height, Math.max(16, names.length * (metrics.lineHeight + 8) + metrics.inset))
      : Math.min(
          styled ? metrics.lineHeight + metrics.inset + 4 : 28,
          plot.height * (styled ? 0.5 : 0.22),
        );
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
  const legacyInset = Math.min(5, width / 10);
  const viewport = layout?.legendBounds ?? {
    x: legacyInset,
    y: Math.max(0, height - 28),
    width: width - legacyInset * 2,
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
  const metrics = legendMetrics(chart, names, viewport.height, dimensions);
  const { fontSize, lineHeight, padding, border } = metrics;
  // On tiny drawings reduce padding before shrinking the native scroll viewport.
  const inset = Math.min(metrics.inset, Math.max(0, Math.min(viewport.width, viewport.height) - 1));
  const effectivePadding = Math.max(0, (inset - border) / 2);
  const contentWidth = Math.max(1, viewport.width - inset);
  const contentHeight = Math.max(1, viewport.height - inset);
  const itemWidth = Math.min(12, contentWidth * 0.2);
  const itemHeight = Math.min(10, contentHeight * 0.5);
  const textWidth = Math.max(
    1,
    Math.min(
      140,
      contentWidth - itemWidth - 7,
      // ZRender reserves one pixel before truncating. Round fractional glyph
      // measurements upward and retain that guard inside the viewport cap.
      metrics.measuredWidth,
    ),
  );
  // A fixed measured text width and line height make the screen legend's public
  // layout deterministic. Truncation and native scrolling handle overflow.
  const entryWidth = itemWidth + 5 + textWidth;
  const textHeight = chart.format?.legend ? Math.min(lineHeight, contentHeight) : lineHeight;
  const entryHeight = Math.max(textHeight, itemHeight);
  const pageIconSize = Math.min(8, fontSize, contentWidth / 8);
  const pageFontSize = Math.min(10, fontSize, contentWidth / 7);
  // Native scroll legends retain their pager's cross-axis footprint even when
  // its controls are hidden. Its fixed layout placeholder is "xx/xx".
  const controllerWidth =
    2 * pageIconSize + 4 + format.getTextRect("xx/xx", `${pageFontSize}px Arial, sans-serif`).width;
  const tightWidth = Math.min(
    viewport.width,
    (vertical ? Math.max(entryWidth, controllerWidth) : names.length * (entryWidth + 8) - 8) +
      inset,
  );
  const tightHeight = Math.min(
    viewport.height,
    (vertical ? names.length * (entryHeight + 8) - 8 : entryHeight) + inset,
  );
  const bounds = {
    x: vertical ? viewport.x : (width - tightWidth) / 2,
    y: viewport.y,
    width: tightWidth,
    height: tightHeight,
  };
  const option: LegendComponentOption = {
    ...(layout?.legend as LegendComponentOption | undefined),
    left: bounds.x + border / 2,
    top: bounds.y + border / 2,
    bottom: undefined,
    width: Math.max(1, bounds.width - inset),
    height: Math.max(1, bounds.height - inset),
    padding: Math.min(padding, effectivePadding),
    itemWidth,
    itemHeight,
    itemGap: 8,
    pageIconSize,
    pageButtonItemGap: 2,
    pageButtonGap: 4,
    pageFormatter: "{current}",
    pageTextStyle: {
      fontFamily: "Arial, sans-serif",
      fontSize: pageFontSize,
      lineHeight: pageFontSize,
    },
    textStyle: {
      ...metrics.textStyle,
      ...(chart.format?.legend ? { height: textHeight, lineOverflow: "truncate" as const } : {}),
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
