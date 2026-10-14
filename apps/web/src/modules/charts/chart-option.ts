import type { EChartsOption, SeriesOption } from "echarts";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import {
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import type { ChartPresentationSettings } from "@sheetcraft/core/chart-presentation";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { getChartElementCapabilities, getChartElementSettings } from "./chart-elements";
import { applyChartCommonFormat, getChartComboDataSeriesSettings } from "./chart-format-render";
import {
  chartPercentAxisDomain,
  createChartPresentationData,
  getChartRenderPresentation,
} from "./chart-presentation-render";
const colors = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#db2777"];
type ChartDimensions = { width: number; height: number };

/** Explicit sources keep each series' original palette slot when reordered. */
function seriesAppearance(series: ChartData["series"][number], palette: readonly string[]) {
  const color =
    series.colorIndex === undefined ? undefined : palette[series.colorIndex % palette.length];
  return {
    ...(series.id !== undefined ? { id: series.id } : {}),
    ...(color ? { itemStyle: { color }, lineStyle: { color } } : {}),
  };
}

function createElementLayout(chart: SheetChart, data: ChartData, dimensions?: ChartDimensions) {
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
  return { title, legend, plot };
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
  const palette = presentation?.palette ?? colors;
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
  const layout = createElementLayout(chart, data, dimensions);
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
  if (chart.type === "combo" && common.legend && !Array.isArray(common.legend)) {
    const seen = new Set<string>();
    // Native LineSeries always draws a marker in its legend. Explicit plain-line
    // icons inherit the engine's actual series paint instead of remapping a palette.
    common.legend.data = data.series.flatMap((series) => {
      if (seen.has(series.name)) return [];
      seen.add(series.name);
      const settings = getChartComboDataSeriesSettings(chart, series, comboSeriesChanges);
      const saved =
        series.id === undefined
          ? undefined
          : chart.format?.series?.find((entry) => entry.id === series.id);
      return [
        {
          name: series.name,
          ...(settings.drawType === "line" && !settings.markers
            ? {
                icon: "line",
                itemStyle: { borderColor: "auto", borderWidth: saved?.strokeWidth ?? 2 },
              }
            : {}),
        },
      ];
    });
  }
  if (chart.type === "pie" || chart.type === "doughnut")
    return {
      ...common,
      series: [
        {
          type: "pie",
          ...plotBounds,
          radius: chart.type === "doughnut" ? ["35%", "65%"] : "65%",
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
        36,
        (horizontal
          ? (layout?.plot.width ?? dimensions?.width ?? 480)
          : (layout?.plot.height ?? dimensions?.height ?? 300)) * 0.2,
      )
    : 0;
  const series: SeriesOption[] = scatter
    ? data.series.slice(1).map((series) => ({
        type: "scatter",
        name: series.name,
        data: series.values.flatMap((value, index) => {
          const x = data.series[0]?.values[index];
          return x !== null && x !== undefined && value !== null ? [[x, value]] : [];
        }),
        label: { show: chart.labels },
      }))
    : data.series.map((series) =>
        chart.type === "line" ||
        chart.type === "area" ||
        (chart.type === "combo" &&
          getChartComboDataSeriesSettings(chart, series, comboSeriesChanges).drawType === "line")
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
              ? { left: plotBounds.left + labelClearance, right: plotBounds.right + labelClearance }
              : { top: plotBounds.top + labelClearance, bottom: plotBounds.bottom + labelClearance }
            : {}),
          containLabel: true,
        }
      : {
          top: Math.max(chart.title ? 45 : 15, outsideLabels && !horizontal ? labelClearance : 0),
          left: 48,
          right: Math.max(22, outsideLabels && horizontal ? labelClearance : 0),
          bottom: Math.max(
            chart.legend ? 58 : 35,
            outsideLabels && !horizontal ? labelClearance : 0,
          ),
        },
    xAxis:
      horizontal || scatter
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
  const plotted = chart.type === "scatter" ? data.series.slice(1) : data.series;
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
      const format = plotted[index]?.numberFormat;
      if (!format && chart.type !== "radar" && !percent && !customLabels) return series;
      const formatLabel = (params: { value?: unknown; dataIndex?: number }) => {
        if (
          customLabels &&
          chart.elements?.labelScope === "lastCategory" &&
          params.dataIndex !== data.categories.length - 1
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
          : chart.type === "scatter" && Array.isArray(params.value)
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
    ...(percent ? chartPercentAxisDomain(renderedData.series) : {}),
    ...(format ? { axisLabel: { formatter: (value: number) => formatValue(value, format) } } : {}),
  });
  if (option.xAxis && !Array.isArray(option.xAxis) && option.xAxis.type === "value")
    option.xAxis = valueAxis(
      percent
        ? { kind: "percent", fractionDigits: 0 }
        : chart.type === "scatter"
          ? data.series[0]?.numberFormat
          : uniformFormat(plotted),
    );
  if (option.yAxis && !Array.isArray(option.yAxis) && option.yAxis.type === "value")
    option.yAxis = valueAxis(
      percent ? { kind: "percent", fractionDigits: 0 } : uniformFormat(plotted),
    );
  return applyChartCommonFormat(option, chart, renderedData, comboSeriesChanges);
}
