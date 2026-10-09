import { MAIN_NS, xml } from "../pivot-xml.js";
import { builtinNumberFormat } from "../number-format.js";
import type { NativeCell, NativeStyle } from "./model.js";

const DEFAULT_FONT =
  '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>';
const DEFAULT_BORDER = "<border><left/><right/><top/><bottom/><diagonal/></border>";
const DEFAULT_XF = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields =>
  value && typeof value === "object" ? (value as Fields) : {};
const attribute = (name: string, value: unknown): string => ` ${name}="${xml(value)}"`;

export function colorXml(value: unknown, tag = "color"): string {
  const color = fields(value);
  const attrs =
    typeof color.argb === "string"
      ? attribute("rgb", color.argb)
      : typeof color.theme === "number"
        ? attribute("theme", color.theme)
        : typeof color.indexed === "number"
          ? attribute("indexed", color.indexed)
          : color.auto
            ? ' auto="1"'
            : "";
  if (!attrs) return "";
  return `<${tag}${attrs}${typeof color.tint === "number" ? attribute("tint", color.tint) : ""}/>`;
}

function fontXml(value: unknown): string {
  const font = fields(value);
  let body = "";
  for (const [key, tag] of [
    ["bold", "b"],
    ["italic", "i"],
    ["strike", "strike"],
    ["outline", "outline"],
    ["shadow", "shadow"],
  ]) {
    if (font[key!] === true) body += `<${tag}/>`;
    else if (font[key!] === false) body += `<${tag} val="0"/>`;
  }
  if (font.underline === true || font.underline === "single") body += "<u/>";
  else if (typeof font.underline === "string") body += `<u val="${xml(font.underline)}"/>`;
  for (const [key, tag] of [
    ["size", "sz"],
    ["vertAlign", "vertAlign"],
  ])
    if (font[key!] !== undefined) body += `<${tag} val="${xml(font[key!])}"/>`;
  body += colorXml(font.color);
  for (const [key, tag] of [
    ["name", "name"],
    ["family", "family"],
    ["charset", "charset"],
    ["scheme", "scheme"],
  ])
    if (font[key!] !== undefined) body += `<${tag} val="${xml(font[key!])}"/>`;
  return `<font>${body}</font>`;
}

function fillXml(value: unknown): string {
  const fill = fields(value);
  if (fill.type === "gradient") {
    const center = fields(fill.center);
    const attributes =
      fill.gradient === "path"
        ? ` type="path"${["left", "right", "top", "bottom"]
            .filter((key) => center[key] !== undefined)
            .map((key) => attribute(key, center[key]))
            .join("")}`
        : ` degree="${xml(fill.degree ?? 0)}"`;
    const stops = Array.isArray(fill.stops) ? fill.stops : [];
    return `<fill><gradientFill${attributes}>${stops
      .map((value) => {
        const stop = fields(value);
        return `<stop position="${xml(stop.position)}">${colorXml(stop.color)}</stop>`;
      })
      .join("")}</gradientFill></fill>`;
  }
  const colors = colorXml(fill.fgColor, "fgColor") + colorXml(fill.bgColor, "bgColor");
  return `<fill><patternFill patternType="${xml(fill.pattern ?? "none")}"${colors ? `>${colors}</patternFill>` : "/>"}</fill>`;
}

function borderXml(value: unknown): string {
  const border = fields(value);
  const diagonal = fields(border.diagonal);
  let attrs = diagonal.up ? ' diagonalUp="1"' : "";
  if (diagonal.down) attrs += ' diagonalDown="1"';
  if (border.outline === false) attrs += ' outline="0"';
  const body = ["left", "right", "top", "bottom", "diagonal"]
    .map((side) => {
      const edge = fields(border[side]);
      const style = edge.style ? attribute("style", edge.style) : "";
      const color = colorXml(edge.color);
      return `<${side}${style}${color ? `>${color}</${side}>` : "/>"}`;
    })
    .join("");
  return `<border${attrs}>${body}</border>`;
}

function alignmentXml(value: unknown): string {
  const alignment = fields(value);
  let attrs = "";
  if (alignment.horizontal && alignment.horizontal !== "general")
    attrs += attribute("horizontal", alignment.horizontal);
  if (alignment.vertical && alignment.vertical !== "bottom")
    attrs += attribute("vertical", alignment.vertical === "middle" ? "center" : alignment.vertical);
  for (const key of ["wrapText", "shrinkToFit", "justifyLastLine"])
    if (alignment[key]) attrs += attribute(key, 1);
  for (const key of ["indent", "relativeIndent"])
    if (alignment[key]) attrs += attribute(key, alignment[key]);
  if (alignment.textRotation === "vertical") attrs += ' textRotation="255"';
  else if (typeof alignment.textRotation === "number" && alignment.textRotation !== 0)
    attrs += attribute(
      "textRotation",
      alignment.textRotation < 0 ? 90 - alignment.textRotation : alignment.textRotation,
    );
  const order =
    alignment.readingOrder === "ltr"
      ? 1
      : alignment.readingOrder === "rtl"
        ? 2
        : alignment.readingOrder;
  if (order === 1 || order === 2) attrs += attribute("readingOrder", order);
  return attrs ? `<alignment${attrs}/>` : "";
}

function protectionXml(value: unknown): string {
  const protection = fields(value);
  const attrs = ["locked", "hidden"]
    .filter((key) => typeof protection[key] === "boolean")
    .map((key) => attribute(key, protection[key] ? 1 : 0))
    .join("");
  return attrs ? `<protection${attrs}/>` : "";
}

/** Intern the XML of each component, so equivalent sparse styles share indexes. */
class StyleTable {
  readonly entries: string[];
  private readonly ids = new Map<string, number>();
  constructor(entries: string[]) {
    this.entries = [];
    for (const entry of entries) this.add(entry);
  }
  add(entry: string): number {
    const existing = this.ids.get(entry);
    if (existing !== undefined) return existing;
    const id = this.entries.length;
    this.entries.push(entry);
    this.ids.set(entry, id);
    return id;
  }
  xml(tag: string): string {
    return `<${tag} count="${this.entries.length}">${this.entries.join("")}</${tag}>`;
  }
}

export class NativeStyleWriter {
  private readonly fonts = new StyleTable([DEFAULT_FONT]);
  private readonly fills = new StyleTable([
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ]);
  private readonly borders = new StyleTable([DEFAULT_BORDER]);
  private readonly formats = new Map<string, number>();
  private readonly customFormats: string[] = [];
  private readonly xfs = new StyleTable([DEFAULT_XF]);

  constructor() {
    for (let id = 0; id < 164; id++) {
      const code = builtinNumberFormat(id);
      if (code !== undefined) this.formats.set(code, id);
    }
  }

  private formatId(code: string | undefined): number {
    if (!code || code.toLowerCase() === "general") return 0;
    const existing = this.formats.get(code);
    if (existing !== undefined) return existing;
    const id = 164 + this.customFormats.length;
    this.formats.set(code, id);
    this.customFormats.push(`<numFmt numFmtId="${id}" formatCode="${xml(code)}"/>`);
    return id;
  }

  cellStyle(cell: NativeCell): number {
    const style: NativeStyle = cell.style;
    const fontId = style.font ? this.fonts.add(fontXml(style.font)) : 0;
    const fillId = style.fill ? this.fills.add(fillXml(style.fill)) : 0;
    const borderId = style.border ? this.borders.add(borderXml(style.border)) : 0;
    const format =
      cell.numFmt ??
      (typeof style.numFmt === "string" ? style.numFmt : undefined) ??
      (cell.value instanceof Date ? "mm-dd-yy" : undefined);
    const numFmtId = this.formatId(format);
    const alignment = alignmentXml(style.alignment);
    const protection = protectionXml(style.protection);
    let attrs = ` numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`;
    if (numFmtId) attrs += ' applyNumberFormat="1"';
    if (fontId) attrs += ' applyFont="1"';
    if (fillId) attrs += ' applyFill="1"';
    if (borderId) attrs += ' applyBorder="1"';
    if (alignment) attrs += ' applyAlignment="1"';
    if (protection) attrs += ' applyProtection="1"';
    return this.xfs.add(
      `<xf${attrs}${alignment || protection ? `>${alignment}${protection}</xf>` : "/>"}`,
    );
  }

  xml(): string {
    const formats = `<numFmts count="${this.customFormats.length}">${this.customFormats.join("")}</numFmts>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN_NS}">${formats}${this.fonts.xml("fonts")}${this.fills.xml("fills")}${this.borders.xml("borders")}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>${this.xfs.xml("cellXfs")}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  }
}
