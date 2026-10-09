import {
  CELL_STYLE_INCLUDES,
  normalizeCellStyleIncludes,
  type CellStyleDefinition,
  type CellStyleInclude,
} from "@sheetcraft/core/cell-styles";
import type { CellStyle } from "@sheetcraft/core/style";
import type { CellNamedStyleBinding, Sheet } from "@sheetcraft/core/workbook";
import { createClearCellStylePatch } from "@sheetcraft/core/style";
import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import { toExcelNumberFormat, builtinNumberFormat } from "./number-format.js";
import { readXlsxDxfStyle, xlsxDxfXml } from "./conditional-formatting.js";
import { materializeXlsxStyleColors } from "./xlsx-colors.js";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";

type Xf = Readonly<{ attributes: string; body: string }>;

const INCLUDE_STYLE_KEYS: Record<CellStyleInclude, Array<keyof CellStyle>> = {
  number: ["numberFormat"],
  alignment: [
    "horizontalAlign",
    "verticalAlign",
    "indent",
    "shrinkToFit",
    "textDirection",
    "textRotation",
    "wrapText",
  ],
  font: [
    "fontFamily",
    "fontSize",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "fontScript",
    "textColor",
    "fontTheme",
    "textColorTheme",
  ],
  border: [
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderDiagonalUp",
    "borderDiagonalDown",
  ],
  fill: ["fillColor", "fillColorTheme", "fillPattern", "fillPatternColor", "fillGradient"],
};

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
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
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
export function readXlsxCellStyles(
  stylesXml: Uint8Array | undefined,
  themeXml?: Uint8Array,
): CellStyleDefinition[] {
  if (!stylesXml) return [];
  const xml = materializeXlsxStyleColors(
    strFromU8(stylesXml),
    themeXml ? strFromU8(themeXml) : undefined,
  );
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

/**
 * Excel keeps the named-style reference on cellXfs (`xfId`) while ExcelJS only
 * exposes its materialized result. Recover that provenance for Core so edits to
 * a named style continue to update imported cells.
 */
export function readXlsxNamedCellStyleBindings(
  stylesXml: Uint8Array | undefined,
): Map<number, CellNamedStyleBinding> {
  const result = new Map<number, CellNamedStyleBinding>();
  if (!stylesXml) return result;
  const xml = strFromU8(stylesXml);
  const base = xfs(collection(xml, "cellStyleXfs"));
  const named = new Map<number, { styleId: string; includes: CellStyleInclude[] }>();
  for (const entry of (collection(xml, "cellStyles") ?? "").matchAll(
    /<cellStyle\s+([^>]*)\/?\s*>/gi,
  )) {
    const attrs = entry[1] ?? "";
    const name = attribute(attrs, "name");
    const xfId = Number(attribute(attrs, "xfId"));
    const builtinId = Number(attribute(attrs, "builtinId"));
    if (
      !name ||
      name.toLowerCase() === "normal" ||
      !Number.isInteger(xfId) ||
      xfId < 0 ||
      !base[xfId] ||
      (Number.isInteger(builtinId) && builtinId >= 0)
    )
      continue;
    const includes = CELL_STYLE_INCLUDES.filter((include) => {
      const flag =
        include === "number"
          ? "applyNumberFormat"
          : include === "alignment"
            ? "applyAlignment"
            : include === "font"
              ? "applyFont"
              : include === "border"
                ? "applyBorder"
                : "applyFill";
      return /^(1|true)$/i.test(attribute(base[xfId]!.attributes, flag) ?? "");
    });
    named.set(xfId, {
      styleId: `xlsx-cell-style-${name}`,
      // XLSX often omits apply flags on cellStyleXfs. Its style components still
      // define the group, so fall back to all groups for that interoperable form.
      includes: includes.length ? includes : [...CELL_STYLE_INCLUDES],
    });
  }
  for (const [index, xf] of xfs(collection(xml, "cellXfs")).entries()) {
    const xfId = Number(attribute(xf.attributes, "xfId"));
    const binding = named.get(xfId);
    if (!binding) continue;
    const overrides: Array<keyof CellStyle> = [];
    for (const include of CELL_STYLE_INCLUDES) {
      const flag =
        include === "number"
          ? "applyNumberFormat"
          : include === "alignment"
            ? "applyAlignment"
            : include === "font"
              ? "applyFont"
              : include === "border"
                ? "applyBorder"
                : "applyFill";
      if (/^(1|true)$/i.test(attribute(xf.attributes, flag) ?? ""))
        overrides.push(...INCLUDE_STYLE_KEYS[include]);
    }
    result.set(index, {
      ...binding,
      ...(overrides.length ? { overrides } : {}),
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
    const includes = normalizeCellStyleIncludes(definition.includes);
    styleXfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}"${includes.includes("number") ? ' applyNumberFormat="1"' : ""}${includes.includes("font") ? ' applyFont="1"' : ""}${includes.includes("fill") ? ' applyFill="1"' : ""}${includes.includes("border") ? ' applyBorder="1"' : ""}${includes.includes("alignment") ? ' applyAlignment="1"' : ""}>${namedAlignment(definition.style)}</xf>`,
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

function applyXfAttributes(
  attributes: string,
  xfId: number,
  overrides: readonly (keyof CellStyle)[],
): string {
  const groups: Record<CellStyleInclude, boolean> = {
    number: INCLUDE_STYLE_KEYS.number.some((key) => overrides.includes(key)),
    alignment: INCLUDE_STYLE_KEYS.alignment.some((key) => overrides.includes(key)),
    font: INCLUDE_STYLE_KEYS.font.some((key) => overrides.includes(key)),
    border: INCLUDE_STYLE_KEYS.border.some((key) => overrides.includes(key)),
    fill: INCLUDE_STYLE_KEYS.fill.some((key) => overrides.includes(key)),
  };
  const without = attributes
    .replace(/\s+xfId\s*=\s*(["'])[^"']*\1/gi, "")
    .replace(/\s+apply(?:NumberFormat|Alignment|Font|Border|Fill)\s*=\s*(["'])[^"']*\1/gi, "");
  return `${without} xfId="${xfId}"${groups.number ? ' applyNumberFormat="1"' : ""}${groups.alignment ? ' applyAlignment="1"' : ""}${groups.font ? ' applyFont="1"' : ""}${groups.border ? ' applyBorder="1"' : ""}${groups.fill ? ' applyFill="1"' : ""}`;
}

function cellReference(row: number, column: number): string {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return `${result}${row + 1}`;
}

/** Writes cellXf `xfId` provenance for Core cells bound to a named style. */
export function writeXlsxNamedCellStyleBindings(
  entries: Zippable,
  sheets: readonly Sheet[],
  definitions: readonly CellStyleDefinition[] | undefined,
): void {
  const stylesEntry = entries["xl/styles.xml"];
  if (!(stylesEntry instanceof Uint8Array)) return;
  let stylesXml = strFromU8(stylesEntry);
  const nameToXfId = new Map<string, number>();
  for (const entry of (collection(stylesXml, "cellStyles") ?? "").matchAll(
    /<cellStyle\s+([^>]*)\/?\s*>/gi,
  )) {
    const attrs = entry[1] ?? "";
    const name = attribute(attrs, "name");
    const xfId = Number(attribute(attrs, "xfId"));
    if (name && Number.isInteger(xfId) && xfId >= 0)
      nameToXfId.set(`xlsx-cell-style-${name}`, xfId);
  }
  if (!nameToXfId.size) return;
  const definitionNames = new Map(
    definitions?.map((definition) => [definition.id, definition.name]),
  );
  const cellXfs = xfs(collection(stylesXml, "cellXfs"));
  const worksheetParts = readXlsxWorksheetPartTargets(entries as Record<string, Uint8Array>);
  const generated = new Map<string, number>();
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const part = worksheetParts[sheetIndex];
    const entry = part ? entries[part] : undefined;
    if (!(entry instanceof Uint8Array)) continue;
    let worksheetXml = strFromU8(entry);
    for (const [key, cell] of sheet.cells) {
      const binding = cell.namedStyle;
      if (!binding) continue;
      const baseXfId =
        nameToXfId.get(binding.styleId) ??
        nameToXfId.get(`xlsx-cell-style-${definitionNames.get(binding.styleId) ?? ""}`);
      if (baseXfId === undefined) continue;
      const [row, column] = key.split(":").map(Number);
      if (row === undefined || column === undefined) continue;
      const reference = cellReference(row, column);
      const match = [...worksheetXml.matchAll(/<c\b([^>]*)>/gi)].find(
        (candidate) => attribute(candidate[1] ?? "", "r")?.toUpperCase() === reference,
      );
      if (!match) continue;
      const attributes = match[1] ?? "";
      const sourceIndex = Number(attribute(attributes, "s") ?? "0");
      const source = cellXfs[sourceIndex] ?? cellXfs[0];
      if (!source) continue;
      const signature = `${source.attributes}\u0000${source.body}\u0000${baseXfId}\u0000${(binding.overrides ?? []).join(",")}`;
      let styleIndex = generated.get(signature);
      if (styleIndex === undefined) {
        styleIndex = cellXfs.length;
        generated.set(signature, styleIndex);
        cellXfs.push({
          attributes: applyXfAttributes(source.attributes, baseXfId, binding.overrides ?? []),
          body: source.body,
        });
      }
      const updated = attributes.replace(/\s+s\s*=\s*(["'])[^"']*\1/i, "");
      worksheetXml = worksheetXml.replace(match[0], `<c${updated} s="${styleIndex}">`);
    }
    entries[part!] = strToU8(worksheetXml);
  }
  const serialized = cellXfs.map((xf) => `<xf${xf.attributes}>${xf.body}</xf>`).join("");
  stylesXml = replaceCollection(stylesXml, "cellXfs", "xf", serialized);
  entries["xl/styles.xml"] = strToU8(stylesXml);
}
