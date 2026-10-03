import type { CellStyleDefinition } from "@idea10/core/cell-styles";
import { createClearCellStylePatch } from "@idea10/core/style";
import { strFromU8 } from "fflate/browser";
import { toExcelNumberFormat } from "./number-format.js";
import { readXlsxDxfStyle, xlsxDxfXml } from "./conditional-formatting.js";

type Xf = Readonly<{ attributes: string; body: string }>;

function decodeXml(value: string): string {
  return value.replace(
    /&(?:amp|apos|gt|lt|quot);/gi,
    (entity) => ({ "&amp;": "&", "&apos;": "'", "&gt;": ">", "&quot;": '"' })[entity] ?? entity,
  );
}

function encodeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match ? decodeXml(match[2] ?? "") : undefined;
}

function collection(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}\\b[^><]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml)?.[1];
}

function replaceCollection(xml: string, name: string, entryName: string, content: string): string {
  const count = (content.match(new RegExp(`<${entryName}\\b`, "gi")) ?? []).length;
  const replacement = `<${name} count="${count}">${content}</${name}>`;
  const pattern = new RegExp(`<${name}\\b[^><]*(?:/>|>[\\s\\S]*?<\\/${name}>)`, "i");
  if (pattern.test(xml)) return xml.replace(pattern, replacement);
  if (name === "numFmts") return xml.replace(/<fonts\b/i, `${replacement}<fonts`);
  return xml.replace(/<\/styleSheet>/i, `${replacement}</styleSheet>`);
}

function entryXml(content: string, name: string): string[] {
  return [
    ...content.matchAll(
      new RegExp(`<${name}\\b[^>]*\\/>|<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"),
    ),
  ].map((entry) => entry[0]);
}

function xfs(content: string | undefined): Xf[] {
  if (!content) return [];
  return [...content.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/gi)].map((entry) => ({
    attributes: entry[1] ?? "",
    body: entry[2] ?? "",
  }));
}

function builtinNumberFormat(id: number): string | undefined {
  return new Map<number, string>([
    [0, "General"],
    [1, "0"],
    [2, "0.00"],
    [3, "#,##0"],
    [4, "#,##0.00"],
    [9, "0%"],
    [10, "0.00%"],
    [11, "0.00E+00"],
    [14, "mm-dd-yy"],
    [22, "m/d/yy h:mm"],
    [49, "@"],
  ]).get(id);
}

function alignmentPatch(body: string): Record<string, unknown> {
  const attrs = /<alignment\b([^>]*)\/?\s*>/i.exec(body)?.[1];
  if (!attrs) return {};
  const horizontal = attribute(attrs, "horizontal");
  const vertical = attribute(attrs, "vertical");
  const textRotation = attribute(attrs, "textRotation");
  const readingOrder = attribute(attrs, "readingOrder");
  const result: Record<string, unknown> = {};
  if (
    ["left", "center", "right", "fill", "justify", "centerContinuous", "distributed"].includes(
      horizontal ?? "",
    )
  )
    result.horizontalAlign = horizontal;
  if (["top", "center", "bottom", "justify", "distributed"].includes(vertical ?? ""))
    result.verticalAlign = vertical === "center" ? "middle" : vertical;
  if (/^(1|true)$/i.test(attribute(attrs, "wrapText") ?? "")) result.wrapText = true;
  if (/^(1|true)$/i.test(attribute(attrs, "shrinkToFit") ?? "")) result.shrinkToFit = true;
  const indent = Number(attribute(attrs, "indent"));
  if (Number.isInteger(indent) && indent > 0 && indent <= 250) result.indent = indent;
  if (textRotation === "255") result.textRotation = "vertical";
  else if (Number.isInteger(Number(textRotation)) && Number(textRotation) !== 0) {
    const value = Number(textRotation);
    result.textRotation = value > 90 ? 90 - value : value;
  }
  if (readingOrder === "0") result.textDirection = "context";
  else if (readingOrder === "1") result.textDirection = "ltr";
  else if (readingOrder === "2") result.textDirection = "rtl";
  return result;
}

function styleFromXf(
  xf: Xf | undefined,
  fonts: readonly string[],
  fills: readonly string[],
  borders: readonly string[],
  numberFormats: ReadonlyMap<number, string>,
): CellStyleDefinition["style"] {
  if (!xf) return {};
  const component = (name: "fontId" | "fillId" | "borderId", entries: readonly string[]) => {
    const index = Number(attribute(xf.attributes, name));
    return Number.isInteger(index) && index >= 0 ? entries[index] : undefined;
  };
  const id = Number(attribute(xf.attributes, "numFmtId"));
  const numberFormat = numberFormats.get(id) ?? builtinNumberFormat(id);
  const dxf = `<dxf>${numberFormat ? `<numFmt numFmtId="${id}" formatCode="${encodeXml(numberFormat)}"/>` : ""}${component("fontId", fonts) ?? ""}${component("fillId", fills) ?? ""}${component("borderId", borders) ?? ""}</dxf>`;
  const parsed = readXlsxDxfStyle(dxf).style;
  // A named XLSX style replaces the base format. Core must receive the same
  // materialized reset semantics when it applies the style to a formatted cell.
  return {
    ...createClearCellStylePatch(),
    ...parsed,
    ...alignmentPatch(xf.body),
  } as CellStyleDefinition["style"];
}

/** Read named cell styles directly because ExcelJS only exposes materialized cell XFs. */
export function readXlsxCellStyles(stylesXml: Uint8Array | undefined): CellStyleDefinition[] {
  if (!stylesXml) return [];
  const xml = strFromU8(stylesXml);
  const fonts = entryXml(collection(xml, "fonts") ?? "", "font");
  const fills = entryXml(collection(xml, "fills") ?? "", "fill");
  const borders = entryXml(collection(xml, "borders") ?? "", "border");
  const numberFormats = new Map<number, string>();
  for (const entry of entryXml(collection(xml, "numFmts") ?? "", "numFmt")) {
    const attrs = /<numFmt\b([^>]*)\/?\s*>/i.exec(entry)?.[1] ?? "";
    const id = Number(attribute(attrs, "numFmtId"));
    const code = attribute(attrs, "formatCode");
    if (Number.isInteger(id) && code) numberFormats.set(id, code);
  }
  const base = xfs(collection(xml, "cellStyleXfs"));
  const styles = collection(xml, "cellStyles") ?? "";
  const result: CellStyleDefinition[] = [];
  for (const entry of styles.matchAll(/<cellStyle\s+([^>]*)\/?\s*>/gi)) {
    const attrs = entry[1] ?? "";
    const name = attribute(attrs, "name");
    const index = Number(attribute(attrs, "xfId"));
    if (
      !name ||
      name.toLowerCase() === "normal" ||
      !Number.isInteger(index) ||
      index < 0 ||
      !base[index]
    )
      continue;
    const builtinId = Number(attribute(attrs, "builtinId"));
    // Core stores only user-defined styles. The gallery supplies the WPS/Excel
    // builtins, including Normal, from its stable product catalog.
    if (Number.isInteger(builtinId) && builtinId >= 0) continue;
    result.push({
      id: `xlsx-cell-style-${name}`,
      name,
      category: "custom",
      style: styleFromXf(base[index], fonts, fills, borders, numberFormats),
    });
  }
  return result;
}

function dxfChild(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}\\b[^><]*(?:/>|>[\\s\\S]*?<\\/${name}>)`, "i").exec(xml)?.[0];
}

function appendUnique(entries: string[], value: string | undefined): number {
  if (!value) return 0;
  const existing = entries.indexOf(value);
  if (existing >= 0) return existing;
  entries.push(value);
  return entries.length - 1;
}

function namedAlignment(style: CellStyleDefinition["style"]): string {
  const attrs = [
    style.horizontalAlign && style.horizontalAlign !== "general"
      ? `horizontal="${style.horizontalAlign}"`
      : "",
    style.verticalAlign
      ? `vertical="${style.verticalAlign === "middle" ? "center" : style.verticalAlign}"`
      : "",
    style.wrapText ? 'wrapText="1"' : "",
    style.indent ? `indent="${style.indent}"` : "",
    style.shrinkToFit ? 'shrinkToFit="1"' : "",
    style.textRotation === "vertical"
      ? 'textRotation="255"'
      : typeof style.textRotation === "number" && style.textRotation
        ? `textRotation="${style.textRotation < 0 ? 90 - style.textRotation : style.textRotation}"`
        : "",
    style.textDirection === "ltr"
      ? 'readingOrder="1"'
      : style.textDirection === "rtl"
        ? 'readingOrder="2"'
        : style.textDirection === "context"
          ? 'readingOrder="0"'
          : "",
  ].filter(Boolean);
  return attrs.length ? `<alignment ${attrs.join(" ")}/>` : "";
}

function serializeCellStyles(xml: string, styles: readonly CellStyleDefinition[]): string {
  if (!styles.length) return xml;
  const fonts = entryXml(collection(xml, "fonts") ?? "", "font");
  const fills = entryXml(collection(xml, "fills") ?? "", "fill");
  const borders = entryXml(collection(xml, "borders") ?? "", "border");
  const numberFormats = entryXml(collection(xml, "numFmts") ?? "", "numFmt");
  const styleXfs = entryXml(collection(xml, "cellStyleXfs") ?? "", "xf");
  const cellStyles = entryXml(collection(xml, "cellStyles") ?? "", "cellStyle");
  const styleNames = new Set(
    cellStyles
      .map((entry) =>
        attribute(/<cellStyle\b([^>]*)/i.exec(entry)?.[1] ?? "", "name")?.toLowerCase(),
      )
      .filter(Boolean),
  );
  const numberFormatIds = numberFormats
    .map((entry) => Number(attribute(/<numFmt\b([^>]*)/i.exec(entry)?.[1] ?? "", "numFmtId")))
    .filter(Number.isInteger);
  let nextNumberFormatId = Math.max(163, ...numberFormatIds) + 1;
  for (const definition of styles) {
    if (!definition.name || styleNames.has(definition.name.toLowerCase())) continue;
    const dxf = xlsxDxfXml(definition.style);
    const fontId = appendUnique(fonts, dxfChild(dxf, "font"));
    const fillId = appendUnique(fills, dxfChild(dxf, "fill"));
    const borderId = appendUnique(borders, dxfChild(dxf, "border"));
    const numberFormat = definition.style.numberFormat;
    let numFmtId = 0;
    if (numberFormat && typeof numberFormat === "object") {
      const code = toExcelNumberFormat(numberFormat);
      const existing = numberFormats.findIndex(
        (entry) => attribute(/<numFmt\b([^>]*)/i.exec(entry)?.[1] ?? "", "formatCode") === code,
      );
      if (existing >= 0)
        numFmtId = Number(
          attribute(/<numFmt\b([^>]*)/i.exec(numberFormats[existing]!)?.[1] ?? "", "numFmtId"),
        );
      else {
        numFmtId = nextNumberFormatId++;
        numberFormats.push(`<numFmt numFmtId="${numFmtId}" formatCode="${encodeXml(code)}"/>`);
      }
    }
    const xfId = styleXfs.length;
    styleXfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}"${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""}>${namedAlignment(definition.style)}</xf>`,
    );
    cellStyles.push(
      `<cellStyle name="${encodeXml(definition.name)}" xfId="${xfId}"${definition.builtinId === undefined ? "" : ` builtinId="${definition.builtinId}"`}/>`,
    );
  }
  let result = xml;
  result = replaceCollection(result, "numFmts", "numFmt", numberFormats.join(""));
  result = replaceCollection(result, "fonts", "font", fonts.join(""));
  result = replaceCollection(result, "fills", "fill", fills.join(""));
  result = replaceCollection(result, "borders", "border", borders.join(""));
  result = replaceCollection(result, "cellStyleXfs", "xf", styleXfs.join(""));
  return replaceCollection(result, "cellStyles", "cellStyle", cellStyles.join(""));
}

export function writeXlsxCellStyles(
  stylesXml: string,
  styles: readonly CellStyleDefinition[] | undefined,
): string {
  return styles?.length ? serializeCellStyles(stylesXml, styles) : stylesXml;
}
