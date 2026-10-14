import type { EChartsOption, SeriesOption } from "echarts";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { normalizeChartDataCache, type ChartData } from "@sheetcraft/core/sheet-charts";
import { normalizeChartFormat } from "@sheetcraft/core/chart-format";
import { init, type EChartsType } from "./chart-runtime";
import { createChartOption } from "./chart-option";
import { createWordCloudLayout } from "./chart-wordcloud-layout";
import {
  getChartPresentationBackground,
  getChartRenderPresentation,
} from "./chart-presentation-render";

// Registration is additive. Screen ChartContent continues to request SVG explicitly.
use([CanvasRenderer]);

export const CHART_PRINT_MAX_SURFACE_PIXELS = 8 * 1024 * 1024;
export const CHART_PRINT_MAX_SURFACE_EDGE = 16384;
export const CHART_PRINT_MAX_DENSITY = 8;

export type ChartPrintPresentationOptions = {
  /** Original application document, whose fonts the caller has already warmed. */
  document: Document;
  width: number;
  height: number;
  density: number;
  /** Optional caller-owned, already-loaded immutable native font aliases. */
  resolveFontFamily?: (original: string) => string;
};

export type ChartPrintPresentation = {
  /** Detached, owned pixels; the native engine has already been disposed. */
  canvas: HTMLCanvasElement;
  dispose(): void;
};

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function rasterSize(options: ChartPrintPresentationOptions) {
  const { width, height, density } = options;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(density) ||
    width <= 0 ||
    height <= 0 ||
    width > CHART_PRINT_MAX_SURFACE_EDGE ||
    height > CHART_PRINT_MAX_SURFACE_EDGE ||
    density <= 0 ||
    density > CHART_PRINT_MAX_DENSITY
  )
    throw new RangeError("Invalid chart print dimensions or density.");
  const rasterWidth = Math.ceil(width * density);
  const rasterHeight = Math.ceil(height * density);
  if (
    Math.floor(width * density) < 1 ||
    Math.floor(height * density) < 1 ||
    rasterWidth > CHART_PRINT_MAX_SURFACE_EDGE ||
    rasterHeight > CHART_PRINT_MAX_SURFACE_EDGE ||
    rasterWidth * rasterHeight > CHART_PRINT_MAX_SURFACE_PIXELS
  )
    throw new RangeError("Chart print canvas exceeds its allocation budget.");
  return { width: rasterWidth, height: rasterHeight };
}

function validateDrawing(drawing: SheetChartDrawing, data: ChartData) {
  getChartRenderPresentation(drawing.chart);
  if (
    !Number.isFinite(drawing.width) ||
    !Number.isFinite(drawing.height) ||
    drawing.width <= 0 ||
    drawing.height <= 0
  )
    throw new RangeError("Invalid chart drawing dimensions.");
  if (
    ![
      "column",
      "bar",
      "line",
      "area",
      "pie",
      "doughnut",
      "scatter",
      "radar",
      "treemap",
      "sankey",
      "river",
      "wordCloud",
    ].includes(drawing.chart.type)
  )
    throw new RangeError("Unsupported chart print type.");
  if (
    data.diagnostics?.some(
      (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
    )
  )
    throw new RangeError("Chart print source is unavailable or has mismatched lengths.");
  // Validate finite values, bounded text and the Core point budget. Keep the
  // caller's detached data: normalization intentionally omits derived series IDs.
  normalizeChartDataCache(data);
  const format = Object.getOwnPropertyDescriptor(drawing.chart, "format");
  if (format) {
    if (!("value" in format)) throw new TypeError("Chart format requires an own data field.");
    normalizeChartFormat(format.value);
  }
}

function canvas2D(document: Document, width: number, height: number) {
  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Native chart printing requires a 2D canvas context.");
    return { canvas, context };
  } catch (error) {
    releaseCanvas(canvas);
    throw error;
  }
}

function printOption(
  option: EChartsOption,
  resolveFontFamily: ((original: string) => string) | undefined,
): EChartsOption {
  // Match installed ECharts 6.1 globalDefault for options without textStyle.
  const originalFamily =
    option.textStyle?.fontFamily ??
    (typeof navigator !== "undefined" && navigator.platform.startsWith("Win")
      ? "Microsoft YaHei"
      : "sans-serif");
  const family = resolveFontFamily?.(originalFamily) ?? originalFamily;
  const withFamily = <T extends { fontFamily?: string }>(style: T | undefined) => ({
    ...style,
    fontFamily:
      resolveFontFamily?.(style?.fontFamily ?? originalFamily) ??
      style?.fontFamily ??
      originalFamily,
  });
  const xAxis = (entry: Exclude<EChartsOption["xAxis"], undefined | unknown[]>) => ({
    ...entry,
    axisLabel: withFamily(entry.axisLabel),
    nameTextStyle: withFamily(entry.nameTextStyle),
  });
  const yAxis = (entry: Exclude<EChartsOption["yAxis"], undefined | unknown[]>) => ({
    ...entry,
    axisLabel: withFamily(entry.axisLabel),
    nameTextStyle: withFamily(entry.nameTextStyle),
  });
  const legend = (entry: Exclude<EChartsOption["legend"], undefined | unknown[]>) => ({
    ...entry,
    textStyle: withFamily(entry.textStyle),
  });
  const noninteractive = { animation: false, silent: true, zlevel: 0 };
  const nativeSeries = (entry: SeriesOption): SeriesOption => {
    // Keep each real engine label option narrow, including its type-specific
    // fields. Only bar/scatter models can opt into progressive paint here.
    switch (entry.type) {
      case "bar":
        return { ...entry, ...noninteractive, progressive: 0, label: withFamily(entry.label) };
      case "scatter":
        return { ...entry, ...noninteractive, progressive: 0, label: withFamily(entry.label) };
      case "line":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      case "pie":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      case "radar":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      case "treemap":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      case "sankey":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      case "themeRiver":
        return { ...entry, ...noninteractive, label: withFamily(entry.label) };
      default:
        throw new RangeError("Unsupported native chart print series.");
    }
  };
  const series = (
    Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  ).map(nativeSeries);
  return {
    ...option,
    animation: false,
    tooltip: { show: false },
    textStyle: { ...option.textStyle, fontFamily: family },
    ...(option.title && !Array.isArray(option.title)
      ? { title: { ...option.title, textStyle: withFamily(option.title.textStyle) } }
      : {}),
    ...(option.xAxis
      ? { xAxis: Array.isArray(option.xAxis) ? option.xAxis.map(xAxis) : xAxis(option.xAxis) }
      : {}),
    ...(option.yAxis
      ? { yAxis: Array.isArray(option.yAxis) ? option.yAxis.map(yAxis) : yAxis(option.yAxis) }
      : {}),
    ...(option.legend
      ? { legend: Array.isArray(option.legend) ? option.legend.map(legend) : legend(option.legend) }
      : {}),
    ...(option.radar && !Array.isArray(option.radar)
      ? { radar: { ...option.radar, axisName: withFamily(option.radar.axisName) } }
      : {}),
    ...(option.singleAxis && !Array.isArray(option.singleAxis)
      ? {
          singleAxis: {
            ...option.singleAxis,
            axisLabel: withFamily(option.singleAxis.axisLabel),
            nameTextStyle: withFamily(option.singleAxis.nameTextStyle),
          },
        }
      : {}),
    series,
  };
}

function paintWordCloud(
  drawing: SheetChartDrawing,
  data: ChartData,
  options: ChartPrintPresentationOptions,
  context: CanvasRenderingContext2D,
) {
  const layout = createWordCloudLayout(drawing.chart, data, options);
  const originalInheritedFamily =
    options.document.defaultView?.getComputedStyle(
      options.document.body ?? options.document.documentElement,
    ).fontFamily || "sans-serif";
  const inheritedFamily =
    options.resolveFontFamily?.(originalInheritedFamily) ?? originalInheritedFamily;
  const format = drawing.chart.format
    ? normalizeChartFormat(drawing.chart.format).title
    : undefined;
  context.save();
  try {
    context.scale(options.density, options.density);
    context.fillStyle = getChartPresentationBackground(drawing.chart);
    context.fillRect(0, 0, options.width, options.height);
    context.textAlign = "center";
    if (layout.title.show) {
      context.textBaseline = "alphabetic";
      const titleFamily = format?.fontFamily
        ? (options.resolveFontFamily?.(format.fontFamily) ?? format.fontFamily)
        : inheritedFamily;
      context.font = `${format?.italic ? "italic" : "normal"} ${format?.bold ? "bold" : "normal"} ${format?.fontSize ?? 15}px ${titleFamily}`;
      context.fillStyle = format?.color ?? "#000000";
      context.fillText(drawing.chart.title, options.width / 2, 22);
    }
    context.textBaseline = "middle";
    for (const word of layout.words) {
      context.font = `normal normal ${word.size}px ${inheritedFamily}`;
      context.fillStyle = word.color;
      context.fillText(word.text, word.x, word.y);
    }
  } finally {
    context.restore();
  }
}

/** Synchronous native chart paint. Font readiness and source capture belong to the caller. */
export function renderChartPrintPresentation(
  drawing: SheetChartDrawing,
  data: ChartData,
  options: ChartPrintPresentationOptions,
): ChartPrintPresentation {
  validateDrawing(drawing, data);
  const size = rasterSize(options);
  if (typeof globalThis.document === "undefined" || options.document !== globalThis.document)
    throw new Error("Chart print fonts must belong to the original application document.");
  // Axis bounds, tick counts and graph validity are checked before native init.
  const option =
    drawing.chart.type === "wordCloud"
      ? undefined
      : printOption(createChartOption(drawing.chart, data, options), options.resolveFontFamily);
  const output = canvas2D(options.document, size.width, size.height);
  let engineCanvas: HTMLCanvasElement | undefined;
  let instance: EChartsType | undefined;
  let complete = false;
  let failure: { cause: unknown } | undefined;
  try {
    if (drawing.chart.type === "wordCloud") {
      paintWordCloud(drawing, data, options, output.context);
    } else {
      const engine = canvas2D(options.document, size.width, size.height);
      engineCanvas = engine.canvas;
      instance = init(engineCanvas, undefined, {
        renderer: "canvas",
        width: options.width,
        height: options.height,
        devicePixelRatio: options.density,
      });
      if (instance.getZr().painter.getType() !== "canvas")
        throw new Error("Native chart print canvas renderer is unavailable.");
      instance.setOption(option!, { notMerge: true, lazyUpdate: false });
      instance.getZr().flush();
      // The native single-canvas root is the completed flush target. In ZRender
      // 6.1 renderToCanvas creates a redundant full-size surface even for this
      // case; copy the supplied root directly to keep transient ownership bounded.
      const rendered = engineCanvas;
      if (
        rendered.width !== Math.floor(options.width * options.density) ||
        rendered.height !== Math.floor(options.height * options.density) ||
        !rendered.getContext("2d")
      )
        throw new Error(
          `Native chart print did not produce the expected bounded canvas (${rendered.width}×${rendered.height}).`,
        );
      output.context.fillStyle = getChartPresentationBackground(drawing.chart);
      output.context.fillRect(0, 0, size.width, size.height);
      // Copy without rescaling: preserve native coordinates for fractional sizes,
      // with only the final sub-pixel edge rounded up on the owned destination.
      output.context.drawImage(rendered, 0, 0);
    }
    complete = true;
  } catch (cause) {
    failure = { cause };
  }
  try {
    instance?.dispose();
  } catch (cause) {
    failure ??= { cause };
    complete = false;
  } finally {
    if (engineCanvas) releaseCanvas(engineCanvas);
    if (!complete) releaseCanvas(output.canvas);
  }
  if (failure) throw failure.cause;
  let disposed = false;
  return {
    canvas: output.canvas,
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseCanvas(output.canvas);
    },
  };
}
