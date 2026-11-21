import { stockChartOption } from "./chart-stock";
import { pieChartOption } from "./chart-pie";
import { chartPlotSeries, bubbleSeries, bubbleFormats, isXYChart } from "./chart-bubble";
import { appendChartTrendlineSeries } from "./chart-trendline";
import { appendChartErrorBarSeries } from "./chart-error-bars";
import { specialtyOption } from "./chart-specialty-options";
import { applyChartSeriesRenderOrder } from "./chart-series-render-order";
import { reserveChartAxisTitles } from "./chart-axis-title-layout";
import type { ChartFontContext } from "./chart-script-fonts";
import { createChartElementLayout, getChartLegendLayout } from "./chart-element-layout";
import { applySeriesLegendIdentity } from "./chart-series-legend";
import type { EChartsOption, SeriesOption } from "echarts";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import {
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import {
  DEFAULT_CHART_PALETTE,
  rotateChartPalette,
  type ChartPresentationSettings,
} from "@sheetcraft/core/chart-presentation";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { getChartElementSettings } from "./chart-elements";
import {
  applyChartCommonFormat,
  applyChartScriptFontFormat,
  getChartComboDataSeriesSettings,
} from "./chart-format-render";
import {
  chartPercentAxisDomain,
  createChartPresentationData,
  getChartRenderPresentation,
} from "./chart-presentation-render";
const colors = DEFAULT_CHART_PALETTE;
type ChartDimensions = { width: number; height: number; animate?: boolean } & ChartFontContext;

/** Explicit sources keep each series' original palette slot when reordered. */
function seriesAppearance(series: ChartData["series"][number], palette: readonly string[]) {
  const color =
    series.colorIndex === undefined ? undefined : palette[series.colorIndex % palette.length];
  return {
    ...(series.id !== undefined ? { id: series.id } : {}),
    ...(color ? { itemStyle: { color }, lineStyle: { color } } : {}),
  };
}

function getBarLabelPosition(
  type: "column" | "bar",
  position: ReturnType<typeof getChartElementSettings>["labelPosition"],
  value: number,
) {
  if (position === "center") return "inside";
  const positive = value >= 0;
  if (position === "outsideEnd")
    return type === "bar" ? (positive ? "right" : "left") : positive ? "top" : "bottom";
  const end = position === "insideEnd";
  // Positions are relative to each rendered segment, including signed stacks.
  return type === "bar"
    ? positive === end
      ? "insideRight"
      : "insideLeft"
    : positive === end
      ? "insideTop"
      : "insideBottom";
}

function buildChartOption(
  chart: SheetChart,
  data: ChartData,
  dimensions?: ChartDimensions,
  presentation?: ChartPresentationSettings,
  comboSeriesChanges?: readonly ChartComboSeriesChange[],
): EChartsOption {
  const palette =
    presentation?.themeAccent !== undefined
      ? rotateChartPalette(
          dimensions?.theme?.accentColors ?? DEFAULT_WORKBOOK_THEME.accentColors,
          presentation.themeAccent,
        )
      : (presentation?.palette ?? [...colors]);
  const background = presentation?.background ?? "#ffffff";
  if (chart.source !== undefined) {
    if (!["column", "bar", "line", "area", "radar", "combo"].includes(chart.type))
      throw new RangeError("This chart type does not support an ordered series source.");
    if (
      data.diagnostics?.some(
        (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
      )
    )
      throw new RangeError("The chart series source is unavailable or has mismatched lengths.");
    // Removing the last series retains the drawing, but clears its entire interior.
    if (chart.source.series.length === 0)
      return { animation: false, backgroundColor: background, series: [] };
  }
  // The complete source stays editable even when every series is unchecked.
  // Keep the drawing and stored appearance, while clearing its painted interior.
  if (
    (chart.seriesFilter !== undefined &&
      ["column", "bar", "line", "area", "radar", "combo"].includes(chart.type) &&
      data.series.length === 0) ||
    (chart.type === "combo" && (!data.categories.length || !data.series.length))
  )
    return { animation: false, backgroundColor: background, series: [] };
  const layout = createChartElementLayout(chart, data, dimensions);
  const plotBounds = layout
    ? {
        left: layout.plot.left,
        right: layout.plot.right,
        top: layout.plot.top,
        bottom: layout.plot.bottom,
      }
    : undefined;
  const common: EChartsOption = {
    animation: false,
    color: palette,
    backgroundColor: background,
    title: { text: chart.title, left: "center", textStyle: { fontSize: 15, fontWeight: "normal" } },
    tooltip: { trigger: "item", renderMode: "richText", confine: true },
    legend: { show: chart.legend, bottom: 0, type: "scroll" },
    textStyle: { fontFamily: "Arial, sans-serif" },
    ...(layout ? { title: layout.title, legend: layout.legend } : {}),
  };
  if (chart.type === "stock") return stockChartOption(chart, data, common, palette, plotBounds);
  const special = specialtyOption(
    chart,
    data,
    common,
    palette,
    dimensions ?? { width: 480, height: 300 },
  );
  if (special) return special;
  if (chart.type === "pie" || chart.type === "doughnut")
    return pieChartOption(
      chart,
      data,
      common,
      palette,
      dimensions ?? { width: 480, height: 300 },
      plotBounds,
    );
  if (chart.type === "rose")
    return {
      ...common,
      series: [
        {
          type: "pie",
          ...plotBounds,
          roseType: "radius",
          radius: "65%",
          center: ["50%", "50%"],
          label: { show: chart.labels },
          data: data.categories.flatMap((name, index) => {
            const value = data.series[0]?.values[index];
            return value !== null && value !== undefined && value >= 0 ? [{ name, value }] : [];
          }),
        },
      ],
    };
  if (chart.type === "treemap")
    return {
      ...common,
      series: [
        {
          type: "treemap",
          top: chart.title ? 38 : 8,
          bottom: 8,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          ...plotBounds,
          label: { show: chart.labels },
          data: data.categories.flatMap((name, index) => {
            const value = data.series[0]?.values[index];
            return value !== null && value !== undefined && value > 0 ? [{ name, value }] : [];
          }),
        },
      ],
    };
  if (chart.type === "sankey") {
    const links = data.records.flatMap((row) =>
      typeof row[2] === "number" &&
      row[2] > 0 &&
      row[0] != null &&
      row[1] != null &&
      String(row[0]) !== String(row[1])
        ? [{ source: String(row[0]), target: String(row[1]), value: row[2] }]
        : [],
    );
    // Sankey requires an acyclic graph; reject the whole graph instead of omitting edges.
    const nodes = [...new Set(links.flatMap((link) => [link.source, link.target]))];
    const outgoing = new Map<string, string[]>();
    const indegree = new Map(nodes.map((node) => [node, 0]));
    for (const link of links) {
      outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link.target]);
      indegree.set(link.target, indegree.get(link.target)! + 1);
    }
    const queue = nodes.filter((node) => indegree.get(node) === 0);
    let visited = 0;
    for (let i = 0; i < queue.length; i++) {
      visited++;
      for (const target of outgoing.get(queue[i]!) ?? []) {
        const degree = indegree.get(target)! - 1;
        indegree.set(target, degree);
        if (!degree) queue.push(target);
      }
    }
    if (visited !== nodes.length) throw new RangeError("Sankey links must not form a cycle.");
    return {
      ...common,
      series: [
        {
          type: "sankey",
          top: chart.title ? 40 : 12,
          bottom: 18,
          ...plotBounds,
          label: { show: chart.labels },
          data:
            visited === nodes.length
              ? nodes.map((name, index) => ({
                  name,
                  ...(presentation?.palette
                    ? { itemStyle: { color: palette[index % palette.length] } }
                    : {}),
                }))
              : [],
          links: visited === nodes.length ? links : [],
          lineStyle: { color: "source", curveness: 0.5 },
        },
      ],
    };
  }
  if (chart.type === "radar") {
    const maximum = Math.max(
      1,
      ...data.series.flatMap((series) =>
        series.values.filter((value): value is number => value !== null),
      ),
    );
    return {
      ...common,
      radar: {
        radius: "60%",
        ...(layout
          ? {
              center: [
                layout.plot.left + layout.plot.width / 2,
                layout.plot.top + layout.plot.height / 2,
              ],
              radius: Math.min(layout.plot.width, layout.plot.height) * 0.3,
              axisNameGap: 5,
              axisName: {
                width: Math.max(1, Math.min(layout.plot.width, layout.plot.height) * 0.2 - 5),
                overflow: "truncate" as const,
              },
            }
          : {}),
        indicator: data.categories.map((name) => ({ name, max: maximum })),
      },
      series: [
        {
          type: "radar",
          data: data.series.map((series) => ({
            ...seriesAppearance(series, palette),
            name: series.name,
            value: series.values.map((value) => value ?? "-"),
          })),
          label: { show: chart.labels },
        },
      ],
    };
  }
  if (chart.type === "river")
    return {
      ...common,
      singleAxis: { type: "category", data: data.categories, top: 40, bottom: 45, ...plotBounds },
      series: [
        {
          type: "themeRiver",
          label: { show: chart.labels },
          data: data.series.flatMap((series) =>
            series.values.flatMap((value, index) =>
              value === null ? [] : [[index, value, series.name] as [number, number, string]],
            ),
          ),
        },
      ],
    };
  const horizontal = chart.type === "bar";
  const scatter = chart.type === "scatter";
  const labelPosition = chart.elements?.labelPosition;
  const outsideLabels =
    chart.labels &&
    (chart.type === "bar" ||
      chart.type === "column" ||
      (chart.type === "combo" &&
        data.series.some(
          (entry) =>
            getChartComboDataSeriesSettings(chart, entry, comboSeriesChanges).drawType === "column",
        ))) &&
    labelPosition === "outsideEnd";
  const labelClearance = outsideLabels
    ? Math.min(
        horizontal && chart.elements?.labelContent === "seriesAndValue" ? 128 : 36,
        (horizontal
          ? (layout?.plot.width ?? dimensions?.width ?? 480)
          : (layout?.plot.height ?? dimensions?.height ?? 300)) * 0.2,
      )
    : 0;
  // The last-category preset prints each series name beside its last visible bar.
  // Reserve room on the side that actually carries those longer labels.
  const lastBarLabels =
    horizontal && outsideLabels && chart.elements?.labelScope === "lastCategory"
      ? data.series
          .map((series) => series.values.at(-1))
          .filter((value): value is number => typeof value === "number")
      : undefined;
  const leftLabelSpace =
    lastBarLabels && !lastBarLabels.some((value) => value < 0) ? 0 : labelClearance;
  const rightLabelSpace =
    lastBarLabels && !lastBarLabels.some((value) => value >= 0) ? 0 : labelClearance;
  const series: SeriesOption[] =
    chart.type === "bubble"
      ? bubbleSeries(
          chart,
          data,
          palette,
          Math.max(
            1,
            Math.min(
              layout?.plot.width ?? dimensions?.width ?? 480,
              layout?.plot.height ?? dimensions?.height ?? 300,
            ) * 0.16,
          ),
        )
      : scatter
        ? data.series.slice(1).map((series): SeriesOption => {
            const style = presentation?.scatterStyle ?? "marker";
            const coordinates: Array<[number, number | "-"]> = [];
            series.values.forEach((y, index) => {
              const x = data.series[0]?.values[index];
              if (x == null || (style === "marker" && y === null)) return;
              coordinates.push([x, y ?? "-"]);
            });
            const common = {
              ...seriesAppearance(series, palette),
              name: series.name,
              data: coordinates,
              label: { show: chart.labels },
            };
            if (style === "marker") return { ...common, type: "scatter" };
            const markers = style === "lineMarker" || style === "smoothMarker";
            return {
              ...common,
              type: "line",
              smooth: style === "smooth" || style === "smoothMarker",
              // Native line labels are attached to symbols. Zero-size symbols retain labels on line-only plots.
              showSymbol: markers || chart.labels,
              ...(!markers && chart.labels ? { symbolSize: 0 } : {}),
              showAllSymbol: true,
              connectNulls: false,
              symbol: "circle",
            };
          })
        : data.series.map((series) =>
            chart.type === "line" ||
            chart.type === "area" ||
            (chart.type === "combo" &&
              getChartComboDataSeriesSettings(chart, series, comboSeriesChanges).drawType ===
                "line")
              ? {
                  type: "line",
                  ...seriesAppearance(series, palette),
                  name: series.name,
                  data: series.values,
                  showSymbol:
                    chart.type === "combo"
                      ? getChartComboDataSeriesSettings(chart, series, comboSeriesChanges).markers
                      : (presentation?.lineMarkers ?? true),
                  ...(chart.type === "combo"
                    ? {
                        symbol: getChartComboDataSeriesSettings(chart, series, comboSeriesChanges)
                          .markers
                          ? "circle"
                          : "none",
                        smooth: false,
                      }
                    : presentation?.lineMarkers === false
                      ? { symbol: "none" }
                      : {}),
                  connectNulls: false,
                  ...(chart.type === "area"
                    ? {
                        areaStyle:
                          series.colorIndex === undefined
                            ? {}
                            : { color: palette[series.colorIndex % palette.length] },
                      }
                    : {}),
                  ...(chart.stacked ? { stack: "total" } : {}),
                  label: { show: chart.labels },
                }
              : {
                  type: "bar",
                  ...seriesAppearance(series, palette),
                  name: series.name,
                  data:
                    labelPosition !== undefined
                      ? series.values.map((value) =>
                          value === null
                            ? null
                            : {
                                value,
                                label: {
                                  position: getBarLabelPosition(
                                    horizontal ? "bar" : "column",
                                    labelPosition,
                                    value,
                                  ),
                                },
                              },
                        )
                      : series.values,
                  ...(chart.stacked ? { stack: "total" } : {}),
                  label: {
                    show: chart.labels,
                    ...(outsideLabels && horizontal
                      ? { width: Math.max(1, labelClearance - 5), overflow: "truncate" as const }
                      : {}),
                  },
                },
          );
  return {
    ...common,
    grid: plotBounds
      ? {
          ...plotBounds,
          ...(outsideLabels
            ? horizontal
              ? {
                  left: plotBounds.left + leftLabelSpace,
                  right: plotBounds.right + rightLabelSpace,
                }
              : { top: plotBounds.top + labelClearance, bottom: plotBounds.bottom + labelClearance }
            : {}),
          containLabel: true,
        }
      : {
          top: Math.max(chart.title ? 45 : 15, outsideLabels && !horizontal ? labelClearance : 0),
          left: Math.max(48, lastBarLabels ? leftLabelSpace : 0),
          right: Math.max(22, outsideLabels && horizontal ? rightLabelSpace : 0),
          bottom: Math.max(
            chart.legend ? 58 : 35,
            outsideLabels && !horizontal ? labelClearance : 0,
          ),
        },
    xAxis:
      horizontal || isXYChart(chart.type)
        ? { type: "value" }
        : {
            type: "category",
            data: data.categories,
            ...(chart.type === "combo" ? { boundaryGap: true } : {}),
          },
    yAxis: horizontal ? { type: "category", data: data.categories } : { type: "value" },
    series,
  };
}

/** Keep chart calculations numeric; format only their presentation. */
export function createChartOption(
  chart: SheetChart,
  data: ChartData,
  dimensions?: ChartDimensions,
  comboSeriesChanges?: readonly ChartComboSeriesChange[],
): EChartsOption {
  chart = normalizeSheetChart(chart);
  const presentation = getChartRenderPresentation(chart);
  const renderedData = createChartPresentationData(chart, data, presentation);
  const percent = presentation?.percentStacked === true;
  const option = buildChartOption(
    chart,
    renderedData,
    dimensions,
    presentation,
    comboSeriesChanges,
  );
  const formatValue = (value: unknown, format?: CellNumberFormat): string => {
    if (Array.isArray(value)) return value.map((entry) => formatValue(entry, format)).join(" / ");
    return typeof value === "number"
      ? formatCellNumberValue(value, format).text
      : String(value ?? "");
  };
  const plotted = chartPlotSeries(chart, data);
  const cartesianLabels = ["column", "bar", "line", "area", "combo"].includes(chart.type);
  const customLabels =
    cartesianLabels &&
    (chart.elements?.labelContent !== undefined || chart.elements?.labelScope !== undefined);
  const uniformFormat = (entries: ChartData["series"]) => {
    const format = entries[0]?.numberFormat;
    return format &&
      entries.every((entry) => JSON.stringify(entry.numberFormat) === JSON.stringify(format))
      ? format
      : undefined;
  };
  if (Array.isArray(option.series))
    option.series = option.series.map((series, index) => {
      if (chart.type === "pie" || chart.type === "doughnut" || chart.type === "stock")
        return series;
      const format = plotted[index]?.numberFormat;
      if (!format && chart.type !== "radar" && chart.type !== "bubble" && !percent && !customLabels)
        return series;
      const lastCategoryIndex =
        chart.type === "scatter" && "data" in series && Array.isArray(series.data)
          ? data.series[0]?.values.at(-1) != null && plotted[index]?.values.at(-1) != null
            ? series.data.length - 1
            : -1
          : data.categories.length - 1;
      const formatLabel = (params: { value?: unknown; dataIndex?: number }) => {
        if (
          customLabels &&
          chart.elements?.labelScope === "lastCategory" &&
          params.dataIndex !== lastCategoryIndex
        )
          return "";
        if (
          customLabels &&
          chart.elements?.labelScope === "lastSeries" &&
          index !== plotted.length - 1
        )
          return "";
        const numberFormat =
          chart.type === "radar" ? data.series[params.dataIndex ?? 0]?.numberFormat : format;
        const value = percent
          ? plotted[index]?.values[params.dataIndex ?? 0]
          : isXYChart(chart.type) && Array.isArray(params.value)
            ? params.value[1]
            : params.value;
        const text = formatValue(value, numberFormat);
        if (customLabels && (value === null || value === undefined)) return "";
        return customLabels && chart.elements?.labelContent === "seriesAndValue"
          ? `${plotted[index]?.name ?? ""}, ${text}`
          : text;
      };
      return {
        ...series,
        label: { ...("label" in series ? series.label : {}), formatter: formatLabel },
        tooltip: {
          ...series.tooltip,
          valueFormatter: (value: unknown, dataIndex: number) => {
            if (percent) return formatValue(plotted[index]?.values[dataIndex], format);
            if (Array.isArray(value) && chart.type === "bubble") {
              const formats = bubbleFormats(data, index);
              return [
                formatValue(value[0], formats.x),
                formatValue(value[1], format),
                formatValue(value[2], formats.size),
              ].join(" / ");
            }
            if (Array.isArray(value) && chart.type === "scatter")
              return `${formatValue(value[0], data.series[0]?.numberFormat)} / ${formatValue(value[1], format)}`;
            return formatValue(
              Array.isArray(value) && chart.type === "river" ? value[1] : value,
              format,
            );
          },
        },
      } as SeriesOption;
    });
  const valueAxis = (format?: CellNumberFormat) => ({
    type: "value" as const,
    ...(chart.type === "bubble" ? { boundaryGap: ["8%", "8%"] as [string, string] } : {}),
    ...(percent ? chartPercentAxisDomain(renderedData.series) : {}),
    ...(format ? { axisLabel: { formatter: (value: number) => formatValue(value, format) } } : {}),
  });
  if (option.xAxis && !Array.isArray(option.xAxis) && option.xAxis.type === "value")
    option.xAxis = valueAxis(
      percent
        ? { kind: "percent", fractionDigits: 0 }
        : chart.type === "scatter"
          ? data.series[0]?.numberFormat
          : chart.type === "bubble"
            ? bubbleFormats(data, 0).x
            : uniformFormat(plotted),
    );
  if (option.yAxis && !Array.isArray(option.yAxis) && option.yAxis.type === "value")
    option.yAxis = valueAxis(
      percent ? { kind: "percent", fractionDigits: 0 } : uniformFormat(plotted),
    );
  const formatted = applyChartCommonFormat(option, chart, renderedData, comboSeriesChanges);
  // Styled legends share one measured viewport in editor, preview and print.
  // Unstyled legacy export geometry remains unchanged.
  const legendLayout = chart.format?.legend
    ? getChartLegendLayout(chart, renderedData, dimensions ?? { width: 480, height: 300 })
    : undefined;
  if (legendLayout && formatted.legend && !Array.isArray(formatted.legend))
    formatted.legend = {
      ...formatted.legend,
      ...legendLayout.option,
      textStyle: { ...formatted.legend.textStyle, ...legendLayout.option.textStyle },
    };
  const palette =
    presentation?.themeAccent !== undefined
      ? rotateChartPalette(
          dimensions?.theme?.accentColors ?? DEFAULT_WORKBOOK_THEME.accentColors,
          presentation.themeAccent,
        )
      : (presentation?.palette ?? [...colors]);
  return appendChartErrorBarSeries(
    appendChartTrendlineSeries(
      applyChartSeriesRenderOrder(
        applySeriesLegendIdentity(
          applyChartScriptFontFormat(
            reserveChartAxisTitles(formatted, chart, dimensions),
            chart,
            dimensions?.theme,
            dimensions?.resolveFontFamily,
          ),
          chart,
          renderedData,
        ),
        chart,
      ),
      chart,
      renderedData,
      palette,
    ),
    chart,
    renderedData,
  );
}
