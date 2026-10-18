import type {
  ChartFormatSettings,
  ChartTextFormat,
  ChartSurfaceFormat,
} from "@sheetcraft/core/chart-format";
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
export function nativeChartTextProperties(format: ChartTextFormat, legend = false): string {
  const attributes = `${format.fontSize === undefined ? "" : ` sz="${Math.round(format.fontSize * 75)}"`}${format.bold === undefined ? "" : ` b="${Number(format.bold)}"`}${!legend || format.italic === undefined ? "" : ` i="${Number(format.italic)}"`}`;
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
export function nativeChartTextBody(format?: ChartTextFormat, legend = false): string {
  return format && Object.keys(format).length
    ? `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${nativeChartTextProperties(format, legend)}</a:pPr><a:endParaRPr/></a:p></c:txPr>`
    : "";
}

/** Only the legend's explicitly admitted solid paint; widths are CSS px to exact EMU. */
export function nativeChartLegendSurface(surface?: ChartSurfaceFormat): string {
  if (!surface || !Object.keys(surface).length) return "";
  const paint = (value: string | undefined) =>
    value === undefined
      ? ""
      : value === "transparent"
        ? "<a:noFill/>"
        : `<a:solidFill><a:srgbClr val="${nativeChartRgb(value)!}"/></a:solidFill>`;
  // Same effective defaults as Web legend rendering. Materialize only a requested border;
  // this does not mutate sparse Core settings or add a border for fill-only formatting.
  const stroke = surface.stroke ?? (surface.strokeWidth ? "#d1d5db" : "transparent");
  const width = surface.strokeWidth ?? (surface.stroke ? 1 : 0);
  const line =
    surface.stroke === undefined && surface.strokeWidth === undefined
      ? ""
      : `<a:ln w="${Math.round(width * 9525)}">${paint(stroke)}</a:ln>`;
  return `<c:spPr>${paint(surface.fill)}${line}</c:spPr>`;
}

type TextLeaf = "fontFamily" | "fontSize" | "bold" | "color";
const leaves: readonly TextLeaf[] = ["fontFamily", "fontSize", "bold", "color"];
type TextChoices = Partial<Record<TextLeaf, string | number | boolean | null>> & {
  colorMaterialized?: boolean;
};
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
/** Narrow WPS text profile: untransformed tx1 with the default text mapping.
 * Chart-level clrMapOvr and themeOverride relationships are rejected by the package reader.
 * Other scheme slots/transforms are deliberately unresolved, including alpha/luminance.
 */
function textColor(node: XmlNode, themeColor?: string): string | undefined {
  const rgb = rgbFill(node);
  if (rgb) return rgb;
  if (
    !themeColor ||
    ["noFill", "gradFill", "pattFill", "grpFill"].some((key) => node[key] !== undefined)
  )
    return;
  const fill = optional(node, "solidFill");
  const only = (node: XmlNode, key: string) =>
    Object.keys(node).every(
      (name) =>
        name.startsWith("@_xmlns") ||
        name === key ||
        (name === "#text" && !String(node[name]).trim()),
    );
  if (!fill || !only(fill, "schemeClr")) return;
  const scheme = optional(fill, "schemeClr");
  return scheme && only(scheme, "@_val") && attr(scheme, "val") === "tx1" ? themeColor : undefined;
}
function properties(node?: XmlNode, themeColor?: string): TextChoices {
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
  ) {
    out.color = textColor(node, themeColor) ?? null;
    out.colorMaterialized = typeof out.color === "string" && !rgbFill(node);
  }
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
function bodyDefaults(body?: XmlNode, themeColor?: string): TextChoices {
  if (!body) return {};
  const paragraphs = nodes(body.p);
  if (paragraphs.length !== 1) return Object.fromEntries(leaves.map((key) => [key, null]));
  const paragraph = paragraphs[0]!;
  return properties(optional(optional(paragraph, "pPr") ?? {}, "defRPr"), themeColor);
}
function uniformText(
  body: XmlNode | undefined,
  base: TextChoices,
  path: string,
  warn: (path: string) => void,
  themeColor?: string,
): ChartTextFormat | undefined {
  const choices: TextChoices[] = [];
  if (body) {
    for (const paragraph of nodes(body.p)) {
      const defaults = {
        ...base,
        ...properties(optional(optional(paragraph, "pPr") ?? {}, "defRPr"), themeColor),
      };
      const runs = nodes(paragraph.r);
      if (runs.length)
        for (const run of runs)
          choices.push({ ...defaults, ...properties(optional(run, "rPr"), themeColor) });
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
    if (leaf === "color" && typeof value === "string") {
      out.color = value;
      // Core stores explicit RGB, not a live theme reference. Disclose that loss.
      if (choices.some((choice) => choice.colorMaterialized))
        warn(`${path}.color.themeMaterialization`);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Legend-only reader: unsupported paint/text never disappears without a location. */
function readLegendStyle(
  legend: XmlNode,
  rootDefaults: TextChoices,
  warn: (path: string) => void,
  themeColor?: string,
): NonNullable<ChartFormatSettings["legend"]> | undefined {
  const get = (node: XmlNode, key: string): XmlNode | undefined => {
    if (node[key] === undefined) return;
    if (typeof node[key] === "string" && !node[key].trim()) return {};
    return single(node, key);
  };
  const result: NonNullable<ChartFormatSettings["legend"]> = {};
  const check = (node: XmlNode, allowed: readonly string[], path: string): boolean => {
    let valid = true;
    for (const key of Object.keys(node)) {
      if (key.startsWith("@_xmlns")) continue;
      if (key === "#text" && !String(node[key]).trim()) continue;
      if (!allowed.includes(key)) {
        warn(`${path}.${key.replace(/^@_/, "")}`);
        valid = false;
      }
    }
    return valid;
  };
  const paint = (node: XmlNode, path: string): string | undefined => {
    const keys = ["noFill", "solidFill", "gradFill", "pattFill", "grpFill"].filter(
      (key) => node[key] !== undefined,
    );
    if (!keys.length) return;
    if (keys.length !== 1) {
      warn(path);
      return;
    }
    if (keys[0] === "noFill") {
      const empty = get(node, "noFill")!;
      if (check(empty, [], path)) return "transparent";
      return;
    }
    const value = rgbFill(node);
    if (!value) {
      warn(path);
      return;
    }
    const fill = single(node, "solidFill"),
      rgb = single(fill, "srgbClr");
    if (check(fill, ["srgbClr"], path) && check(rgb, ["@_val"], path)) return value;
  };
  const shape = get(legend, "spPr");
  if (shape) {
    const surface: ChartSurfaceFormat = {};
    check(shape, ["solidFill", "noFill", "ln"], "format.legend.surface");
    const fill = paint(shape, "format.legend.surface.fill");
    if (fill !== undefined) surface.fill = fill;
    const line = get(shape, "ln");
    if (line) {
      check(line, ["@_w", "solidFill", "noFill"], "format.legend.surface.stroke");
      const stroke = paint(line, "format.legend.surface.stroke");
      if (stroke !== undefined) surface.stroke = stroke;
      if (line["@_w"] !== undefined) {
        const width = Number(attr(line, "w"));
        if (
          /^\d+$/.test(attr(line, "w")) &&
          Number.isSafeInteger(width) &&
          width > 0 &&
          width <= 304800
        )
          surface.strokeWidth = width / 9525;
        else warn("format.legend.surface.strokeWidth");
      }
    }
    if (Object.keys(surface).length) result.surface = surface;
  }
  const body = get(legend, "txPr");
  if (body) {
    const path = "format.legend.text";
    check(body, ["bodyPr", "lstStyle", "p"], path);
    for (const key of ["bodyPr", "lstStyle"]) {
      const node = get(body, key);
      if (
        node &&
        Object.keys(node).some(
          (key) => !key.startsWith("@_xmlns") && !(key === "#text" && !String(node[key]).trim()),
        )
      )
        warn(`${path}.${key}`);
    }
    const paragraphs = nodes(body.p);
    if (paragraphs.length !== 1) warn(path);
    const paragraph = paragraphs.length === 1 ? paragraphs[0] : undefined;
    if (paragraph) {
      check(paragraph, ["pPr", "endParaRPr"], path);
      const pPr = get(paragraph, "pPr");
      if (pPr) check(pPr, ["defRPr"], path);
      const end = get(paragraph, "endParaRPr");
      if (end) check(end, ["@_lang"], path);
      const props = pPr && get(pPr, "defRPr");
      if (props) {
        check(
          props,
          ["@_sz", "@_b", "@_i", "@_lang", "solidFill", "latin", "ea", "cs", "sym"],
          path,
        );
        for (const script of ["latin", "ea", "cs", "sym"]) {
          const font = get(props, script);
          if (font) check(font, ["@_typeface"], `${path}.fontFamily`);
        }
      }
      // Rich runs/fields are not a single legend-wide text format.
      if (paragraph.r === undefined && paragraph.fld === undefined && paragraph.br === undefined) {
        const text = uniformText(body, rootDefaults, path, warn, themeColor) ?? {};
        const symbol = props && get(props, "sym");
        if (symbol && attr(symbol, "typeface") !== text.fontFamily) {
          delete text.fontFamily;
          warn(`${path}.fontFamily`);
        }
        if (props?.["@_i"] !== undefined) {
          const italic = attr(props, "i");
          if (["0", "1", "false", "true"].includes(italic))
            text.italic = ["1", "true"].includes(italic);
          else warn(`${path}.italic`);
        }
        if (props && props.solidFill !== undefined) {
          const color = rgbFill(props)
            ? paint(props, `${path}.color`)
            : textColor(props, themeColor);
          if (color !== undefined && color !== "transparent") text.color = color;
          else delete text.color;
        }
        if (Object.keys(text).length) result.text = text;
      }
    }
  }
  return Object.keys(result).length ? result : undefined;
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
  themeColor?: string,
): void {
  const warned = new Set<string>();
  const warn = (path: string) => warned.add(path);
  if (nodes(family.ser).length > 16) {
    report.add("style-omitted", "warning", `${chartPart}.format`);
    report.add("style-omitted", "warning", `${chartPart}.presentation.palette`);
    return;
  }
  const format: ChartFormatSettings = {};
  const rootDefaults = bodyDefaults(optional(chartSpace, "txPr"), themeColor);
  if (native.title !== undefined && chart.title) {
    const title = single(native, "title");
    const defaults = { ...rootDefaults, ...bodyDefaults(optional(title, "txPr"), themeColor) };
    const tx = optional(title, "tx");
    const text = uniformText(
      tx && optional(tx, "rich"),
      defaults,
      "format.title",
      warn,
      themeColor,
    );
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
    const text = uniformText(body, rootDefaults, `format.${field}.text`, warn, themeColor);
    if (text) format[field] = { text };
  }
  if (native.legend !== undefined) {
    const legend = readLegendStyle(single(native, "legend"), rootDefaults, warn, themeColor);
    if (legend) format.legend = legend;
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
