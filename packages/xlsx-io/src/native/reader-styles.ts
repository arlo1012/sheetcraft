import { attr, child, flag, type XmlNode } from "../pivot-xml.js";
import { builtinNumberFormat } from "../number-format.js";
import { tint } from "../xlsx-colors.js";
import type { NativeStyle } from "./model.js";
import { elements as nodes, readXml } from "./reader-xml.js";

const OTHER_BUILTIN_FORMATS: Record<number, string> = {
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  12: "# ?/?",
  13: "# ??/??",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  27: "[$-404]e/m/d",
  28: '[$-404]e"年"m"月"d"日"',
  29: '[$-404]e"年"m"月"d"日"',
  30: "m/d/yy",
  31: 'yyyy"年"m"月"d"日"',
  32: 'h"时"mm"分"',
  33: 'h"时"mm"分"ss"秒"',
  34: 'yyyy"年"m"月"',
  35: 'm"月"d"日"',
  36: "[$-404]e/m/d",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
  42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
  44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  50: "[$-404]e/m/d",
  51: '[$-404]e"年"m"月"d"日"',
  52: 'yyyy"年"m"月"',
  53: 'm"月"d"日"',
  54: '[$-404]e"年"m"月"d"日"',
  55: 'yyyy"年"m"月"',
  56: 'm"月"d"日"',
  57: "[$-404]e/m/d",
  58: '[$-404]e"年"m"月"d"日"',
};
const INDEXED_COLORS = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
];
function numeric(node: XmlNode, name: string): number | undefined {
  const value = attr(node, name);
  const result = value === "" ? NaN : Number(value);
  return Number.isFinite(result) ? result : undefined;
}
function styleIndex(node: XmlNode, name: string, length: number): number {
  const value = attr(node, name, "0");
  const index = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    (length ? index >= length : index !== 0)
  )
    throw new Error("Invalid XLSX style reference.");
  return index;
}
const DEFAULT_THEME = [
  "FFFFFF",
  "000000",
  "EEECE1",
  "1F497D",
  "4F81BD",
  "C0504D",
  "9BBB59",
  "8064A2",
  "4BACC6",
  "F79646",
  "0000FF",
  "800080",
];
type Palette = { theme: Array<string | undefined>; indexed: Array<string | undefined> };
export function colorPalette(theme: Uint8Array | undefined, styles?: XmlNode): Palette {
  const scheme = theme
    ? child(child(child(readXml(theme), "theme"), "themeElements"), "clrScheme")
    : undefined;
  const colors = scheme
    ? [
        "lt1",
        "dk1",
        "lt2",
        "dk2",
        "accent1",
        "accent2",
        "accent3",
        "accent4",
        "accent5",
        "accent6",
        "hlink",
        "folHlink",
      ].map((key) => {
        const color = child(scheme, key);
        const value =
          color.srgbClr !== undefined
            ? attr(child(color, "srgbClr"), "val")
            : attr(child(color, "sysClr"), "lastClr");
        return /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined;
      })
    : DEFAULT_THEME;
  const indexed = styles
    ? nodes(child(child(styles, "colors"), "indexedColors").rgbColor).map((node) => {
        const value = attr(node, "rgb");
        return /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
          ? value.slice(-6).toUpperCase()
          : undefined;
      })
    : [];
  return { theme: colors, indexed: indexed.length ? indexed : INDEXED_COLORS };
}
export function readColor(
  node: XmlNode,
  palette: Palette = colorPalette(undefined),
): Record<string, unknown> | undefined {
  const rgb = attr(node, "rgb");
  const theme = numeric(node, "theme");
  const indexed = numeric(node, "indexed");
  const direct = /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rgb) ? rgb.slice(-6) : undefined;
  const resolved =
    direct ??
    (theme === undefined ? undefined : palette.theme[theme]) ??
    (indexed === undefined ? undefined : palette.indexed[indexed]);
  if (resolved)
    return {
      argb: `${direct && rgb.length === 8 ? rgb.slice(0, 2) : "FF"}${tint(resolved, numeric(node, "tint"))}`.toUpperCase(),
    };
  const result: Record<string, unknown> = {};
  for (const key of ["theme", "indexed", "tint"]) {
    const value = numeric(node, key);
    if (value !== undefined) result[key] = value;
  }
  if (node["@_auto"] !== undefined) result.auto = flag(node, "auto");
  return Object.keys(result).length ? result : undefined;
}
function font(node: XmlNode, palette: Palette): NativeStyle {
  const result: NativeStyle = {};
  for (const [tag, key] of [
    ["name", "name"],
    ["rFont", "name"],
    ["vertAlign", "vertAlign"],
    ["scheme", "scheme"],
  ])
    if (node[tag!] !== undefined) result[key!] = attr(child(node, tag!), "val");
  for (const [tag, key] of [
    ["sz", "size"],
    ["family", "family"],
    ["charset", "charset"],
  ]) {
    const value = numeric(child(node, tag!), "val");
    if (value !== undefined) result[key!] = value;
  }
  for (const [tag, key] of [
    ["b", "bold"],
    ["i", "italic"],
    ["strike", "strike"],
    ["outline", "outline"],
    ["shadow", "shadow"],
    ["condense", "condense"],
    ["extend", "extend"],
  ])
    if (node[tag!] !== undefined) result[key!] = flag(child(node, tag!), "val", true);
  if (node.u !== undefined) {
    const value = attr(child(node, "u"), "val", "single");
    result.underline = value === "single" ? true : value === "none" ? false : value;
  }
  const color = readColor(child(node, "color"), palette);
  if (color) result.color = color;
  return result;
}
function fill(node: XmlNode, palette: Palette): NativeStyle {
  if (node.patternFill !== undefined) {
    const source = child(node, "patternFill");
    const result: NativeStyle = { type: "pattern", pattern: attr(source, "patternType", "none") };
    for (const key of ["fgColor", "bgColor"]) {
      const color = readColor(child(source, key), palette);
      if (color) result[key] = color;
    }
    return result;
  }
  if (node.gradientFill !== undefined) {
    const source = child(node, "gradientFill");
    const path = attr(source, "type") === "path";
    const result: NativeStyle = {
      type: "gradient",
      gradient: path ? "path" : "angle",
      stops: nodes(source.stop).map((stop) => ({
        position: numeric(stop, "position") ?? 0,
        color: readColor(child(stop, "color"), palette) ?? {},
      })),
    };
    if (!path) result.degree = numeric(source, "degree") ?? 0;
    else
      result.center = Object.fromEntries(
        ["left", "right", "top", "bottom"].map((key) => [key, numeric(source, key) ?? 0]),
      );
    return result;
  }
  return {};
}
function border(node: XmlNode, palette: Palette): NativeStyle {
  const result: NativeStyle = {};
  for (const key of [
    "left",
    "right",
    "top",
    "bottom",
    "diagonal",
    "vertical",
    "horizontal",
    "start",
    "end",
  ]) {
    if (node[key] === undefined) continue;
    const source = child(node, key);
    const side: NativeStyle = {};
    if (attr(source, "style")) side.style = attr(source, "style");
    const color = readColor(child(source, "color"), palette);
    if (color) side.color = color;
    if (key === "diagonal") {
      if (flag(node, "diagonalUp")) side.up = true;
      if (flag(node, "diagonalDown")) side.down = true;
    }
    // Empty edge elements are the OOXML default, not an unsupported border.
    if (Object.keys(side).length) result[key] = side;
  }
  return result;
}
function alignment(node: XmlNode): NativeStyle {
  const result: NativeStyle = {};
  for (const key of ["horizontal", "vertical"]) {
    const value = attr(node, key);
    if (value) result[key] = key === "vertical" && value === "center" ? "middle" : value;
  }
  for (const key of ["wrapText", "shrinkToFit", "justifyLastLine"])
    if (node[`@_${key}`] !== undefined) result[key] = flag(node, key);
  for (const key of ["indent", "relativeIndent"])
    if (numeric(node, key) !== undefined) result[key] = numeric(node, key);
  const rotation = numeric(node, "textRotation");
  if (rotation !== undefined)
    result.textRotation = rotation === 255 ? "vertical" : rotation > 90 ? 90 - rotation : rotation;
  const direction = numeric(node, "readingOrder");
  if (direction !== undefined) result.readingOrder = ["context", "ltr", "rtl"][direction];
  return result;
}

/** Resolve shared style-table references into the codec's small presentation model. */
export function readStyles(bytes: Uint8Array | undefined, theme?: Uint8Array): NativeStyle[] {
  if (!bytes) return [{}];
  const parsedXml = readXml(bytes);
  if (parsedXml.styleSheet === undefined) throw new Error("Missing XLSX styles root.");
  const root = child(parsedXml, "styleSheet");
  const palette = colorPalette(theme, root);
  const fonts = nodes(child(root, "fonts").font).map((node) => font(node, palette));
  const fills = nodes(child(root, "fills").fill).map((node) => fill(node, palette));
  const borders = nodes(child(root, "borders").border).map((node) => border(node, palette));
  const formats = new Map<number, string>(
    nodes(child(root, "numFmts").numFmt).map((node) => [
      Number(attr(node, "numFmtId")),
      attr(node, "formatCode"),
    ]),
  );
  const bases = nodes(child(root, "cellStyleXfs").xf);
  const styles = nodes(child(root, "cellXfs").xf).map((source) => {
    const base = bases[styleIndex(source, "xfId", bases.length)] ?? {};
    const xf = { ...base, ...source };
    const result: NativeStyle = {};
    for (const [key, collection] of [
      ["font", fonts],
      ["fill", fills],
      ["border", borders],
    ] as const) {
      const index = styleIndex(xf, `${key}Id`, collection.length);
      const value = collection[index];
      if (value && Object.keys(value).length) result[key] = value;
    }
    const id = Number(attr(xf, "numFmtId", "0"));
    const code = formats.get(id) ?? builtinNumberFormat(id) ?? OTHER_BUILTIN_FORMATS[id];
    // General is implicit, as in the existing codec contract.
    if (id !== 0 && code !== undefined) result.numFmt = code;
    if (xf.alignment !== undefined) result.alignment = alignment(child(xf, "alignment"));
    if (xf.protection !== undefined)
      result.protection = {
        locked: flag(child(xf, "protection"), "locked", true),
        hidden: flag(child(xf, "protection"), "hidden"),
      };
    return result;
  });
  return styles.length ? styles : [{}];
}
