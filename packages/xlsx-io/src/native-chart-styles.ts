import type { ChartFormatSettings, ChartTextFormat } from "@sheetcraft/core/chart-format";
import {
  DEFAULT_CHART_PALETTE,
  resolveChartSeriesColors,
} from "@sheetcraft/core/chart-presentation";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { single } from "./chart-package-parts.js";
import { attr, nodes, type XmlNode } from "./pivot-xml.js";
import { xml } from "./pivot-xml.js";
import { isNativeChartFontFamily, nativeChartRgb } from "./native-chart-style-capabilities.js";
import type { CompatibilityReportBuilder } from "./report.js";

export function nativeChartSeriesColors(
  chart: SheetChart,
  names: readonly string[],
): Array<string | undefined> {
  return resolveChartSeriesColors(
    names.map((name) => ({ name })),
    chart.presentation?.palette ?? DEFAULT_CHART_PALETTE,
  );
}
/** Web text is in CSS px; DrawingML sz is hundredths of a point (96px = 72pt). */
export function nativeChartTextProperties(format: ChartTextFormat): string {
  const attributes = `${format.fontSize === undefined ? "" : ` sz="${Math.round(format.fontSize * 75)}"`}${format.bold === undefined ? "" : ` b="${Number(format.bold)}"`}`;
  const color =
    format.color === undefined
      ? ""
      : `<a:solidFill><a:srgbClr val="${nativeChartRgb(format.color)!}"/></a:solidFill>`;
  const font =
    format.fontFamily === undefined
      ? ""
      : ["latin", "ea", "cs"]
          .map((script) => `<a:${script} typeface="${xml(format.fontFamily!)}"/>`)
          .join("");
  return `<a:defRPr${attributes}>${color}${font}</a:defRPr>`;
}
export function nativeChartTextBody(format?: ChartTextFormat): string {
  return format && Object.keys(format).length
    ? `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${nativeChartTextProperties(format)}</a:pPr><a:endParaRPr/></a:p></c:txPr>`
    : "";
}

type TextLeaf = "fontFamily" | "fontSize" | "bold" | "color";
const leaves: readonly TextLeaf[] = ["fontFamily", "fontSize", "bold", "color"];
type TextChoices = Partial<Record<TextLeaf, string | number | boolean | null>>;
function optional(parent: XmlNode, key: string): XmlNode | undefined {
  return parent[key] === undefined ? undefined : single(parent, key);
}
function rgbFill(parent: XmlNode): string | undefined {
  if (["noFill", "gradFill", "pattFill", "grpFill"].some((key) => parent[key] !== undefined))
    return;
  const fill = optional(parent, "solidFill");
  if (
    !fill ||
    Object.keys(fill).some(
      (key) => !key.startsWith("@_xmlns") && key !== "srgbClr" && key !== "#text",
    )
  )
    return;
  const rgb = optional(fill, "srgbClr");
  if (
    !rgb ||
    Object.keys(rgb).some((key) => !key.startsWith("@_xmlns") && key !== "@_val" && key !== "#text")
  )
    return;
  const value = attr(rgb, "val");
  return /^[\da-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : undefined;
}
function properties(node?: XmlNode): TextChoices {
  if (!node) return {};
  const out: TextChoices = {};
  if (node["@_sz"] !== undefined) {
    const n = Number(attr(node, "sz"));
    out.fontSize =
      /^\d+$/.test(attr(node, "sz")) && Number.isSafeInteger(n) && n >= 100 && n <= 19200
        ? n / 75
        : null;
  }
  if (node["@_b"] !== undefined) {
    const value = attr(node, "b");
    out.bold = ["0", "1", "false", "true"].includes(value)
      ? value === "1" || value === "true"
      : null;
  }
  if (
    ["solidFill", "noFill", "gradFill", "pattFill", "grpFill"].some(
      (key) => node[key] !== undefined,
    )
  )
    out.color = rgbFill(node) ?? null;
  const fonts = ["latin", "ea", "cs"].map((key) => optional(node, key));
  if (fonts.some(Boolean)) {
    const names = fonts.map((font) => font && attr(font, "typeface"));
    // One Core font cannot encode different Latin/East Asian/complex-script choices.
    out.fontFamily =
      names.every((name) => name === names[0]) && isNativeChartFontFamily(names[0])
        ? names[0]
        : null;
  }
  return out;
}
function bodyDefaults(body?: XmlNode): TextChoices {
  if (!body) return {};
  const paragraphs = nodes(body.p);
  if (paragraphs.length !== 1) return Object.fromEntries(leaves.map((key) => [key, null]));
  const paragraph = paragraphs[0]!;
  return properties(optional(optional(paragraph, "pPr") ?? {}, "defRPr"));
}
function uniformText(
  body: XmlNode | undefined,
  base: TextChoices,
  path: string,
  warn: (path: string) => void,
): ChartTextFormat | undefined {
  const choices: TextChoices[] = [];
  if (body) {
    for (const paragraph of nodes(body.p)) {
      const defaults = {
        ...base,
        ...properties(optional(optional(paragraph, "pPr") ?? {}, "defRPr")),
      };
      const runs = nodes(paragraph.r);
      if (runs.length)
        for (const run of runs) choices.push({ ...defaults, ...properties(optional(run, "rPr")) });
      else choices.push(defaults);
    }
  }
  if (!choices.length) choices.push(base);
  const out: ChartTextFormat = {};
  for (const leaf of leaves) {
    const values = choices.map((choice) => choice[leaf]);
    if (values.some((value) => value === null) || values.some((value) => value !== values[0])) {
      warn(`${path}.${leaf}`);
      continue;
    }
    const value = values[0];
    if (value === undefined) {
      if (leaf === "fontFamily") warn(`${path}.${leaf}`);
      continue;
    }
    if (leaf === "fontFamily" && typeof value === "string") out.fontFamily = value;
    if (leaf === "fontSize" && typeof value === "number") out.fontSize = value;
    if (leaf === "bold" && typeof value === "boolean") out.bold = value;
    if (leaf === "color" && typeof value === "string") out.color = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Restore only independently representable leaves; report unresolved fonts/colors precisely. */
export function readNativeChartStyles(
  chartSpace: XmlNode,
  native: XmlNode,
  plot: XmlNode,
  family: XmlNode,
  chart: SheetChart,
  chartPart: string,
  report: CompatibilityReportBuilder,
): void {
  const warned = new Set<string>();
  const warn = (path: string) => warned.add(path);
  if (nodes(family.ser).length > 16) {
    report.add("style-omitted", "warning", `${chartPart}.format`);
    report.add("style-omitted", "warning", `${chartPart}.presentation.palette`);
    return;
  }
  const format: ChartFormatSettings = {};
  const rootDefaults = bodyDefaults(optional(chartSpace, "txPr"));
  if (native.title !== undefined && chart.title) {
    const title = single(native, "title");
    const defaults = { ...rootDefaults, ...bodyDefaults(optional(title, "txPr")) };
    const tx = optional(title, "tx");
    const text = uniformText(tx && optional(tx, "rich"), defaults, "format.title", warn);
    if (
      text &&
      !(
        Object.keys(text).length === 3 &&
        text.fontFamily === "Arial" &&
        text.fontSize === 15 &&
        text.bold === false
      )
    )
      format.title = text;
  }
  for (const [axisName, field] of [
    ["catAx", "categoryAxis"],
    ["valAx", "valueAxis"],
  ] as const) {
    const axis = single(plot, axisName);
    const body = optional(axis, "txPr");
    const text = uniformText(body, rootDefaults, `format.${field}.text`, warn);
    if (text) format[field] = { text };
  }
  if (Object.keys(format).length) chart.format = format;
  const series = nodes(family.ser);
  try {
    if (series.length > 16) throw new Error("Palette budget.");
    const palette: string[] = [];
    const sourceNames: string[] = [],
      actualColors: string[] = [];
    const names = new Map<string, string>();
    for (const item of series) {
      const shape = single(item, "spPr");
      const color = rgbFill(chart.type === "line" ? single(shape, "ln") : shape);
      if (!color) throw new Error("Unresolved native series color.");
      // Name caches were proved by recoverSource before this function is called.
      const cache = single(single(single(item, "tx"), "strRef"), "strCache");
      const name = String(single(cache, "pt").v ?? "");
      sourceNames.push(name);
      actualColors.push(color);
      if (name && names.has(name)) {
        if (names.get(name) !== color)
          throw new Error("Same-name colors need unavailable series identities.");
      } else {
        palette.push(color);
        if (name) names.set(name, color);
      }
      if (chart.type === "line") {
        const marker = optional(item, "marker");
        const markerShape = marker && optional(marker, "spPr");
        if (
          markerShape &&
          (rgbFill(markerShape) !== color ||
            (markerShape.ln !== undefined && rgbFill(single(markerShape, "ln")) !== color))
        )
          throw new Error("Independent marker paint.");
      }
    }
    const defaultColors = resolveChartSeriesColors(
      sourceNames.map((name) => ({ name })),
      DEFAULT_CHART_PALETTE,
    );
    if (palette.length && actualColors.some((color, index) => color !== defaultColors[index]))
      chart.presentation = { palette };
  } catch {
    warn("presentation.palette");
  }
  for (const path of warned) report.add("style-omitted", "warning", `${chartPart}.${path}`);
}
