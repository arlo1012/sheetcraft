import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import type { CellStyle } from "@idea10/core/style";
import {
  resolveThemeFont,
  type ThemeColorReference,
  type ThemeColorSlot,
  type WorkbookTheme,
} from "@idea10/core/workbook-theme";
import type { Sheet } from "@idea10/core/workbook";

type Xf = { attributes: string; body: string };

const SLOT_INDEX: Record<ThemeColorSlot, number> = {
  light1: 0,
  dark1: 1,
  light2: 2,
  dark2: 3,
  accent1: 4,
  accent2: 5,
  accent3: 6,
  accent4: 7,
  accent5: 8,
  accent6: 9,
  hyperlink: 10,
  followedHyperlink: 11,
};

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes)?.[2];
}
function collection(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}\\b[^><]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml)?.[1];
}
function entries(xml: string | undefined, name: string): string[] {
  if (!xml) return [];
  return [
    ...xml.matchAll(
      new RegExp(`<${name}\\b[^>]*\\/>|<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"),
    ),
  ].map((match) => match[0]);
}
function xfs(xml: string | undefined): Xf[] {
  if (!xml) return [];
  return [...xml.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/gi)].map((match) => ({
    attributes: match[1] ?? "",
    body: match[2] ?? "",
  }));
}
function replaceCollection(xml: string, name: string, entryName: string, content: string): string {
  const count = (content.match(new RegExp(`<${entryName}\\b`, "gi")) ?? []).length;
  return xml.replace(
    new RegExp(`<${name}\\b[^><]*(?:/>|>[\\s\\S]*?<\\/${name}>)`, "i"),
    () => `<${name} count="${count}">${content}</${name}>`,
  );
}
function cellReference(row: number, column: number): string {
  let number = column + 1;
  let result = "";
  while (number > 0) {
    result = String.fromCharCode(65 + ((number - 1) % 26)) + result;
    number = Math.floor((number - 1) / 26);
  }
  return `${result}${row + 1}`;
}
function colorXml(reference: ThemeColorReference): string {
  const tint =
    reference.tint === undefined || reference.tint === 0 ? "" : ` tint="${reference.tint}"`;
  return `<color theme="${SLOT_INDEX[reference.slot]}"${tint}/>`;
}
function fillColorXml(reference: ThemeColorReference): string {
  const tint =
    reference.tint === undefined || reference.tint === 0 ? "" : ` tint="${reference.tint}"`;
  return `<fgColor theme="${SLOT_INDEX[reference.slot]}"${tint}/>`;
}
function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}
function patchFont(xml: string, style: CellStyle, theme: WorkbookTheme | undefined): string {
  const selfClosing = /<font\b([^>]*)\/>/i.exec(xml);
  let result = selfClosing ? `<font${selfClosing[1] ?? ""}></font>` : xml;
  if (style.textColorTheme)
    result = /<color\b[^>]*\/?\s*>/i.test(result)
      ? result.replace(/<color\b[^>]*\/?\s*>/i, () => colorXml(style.textColorTheme!))
      : result.replace(/<\/font>/i, (closing) => `${colorXml(style.textColorTheme!)}${closing}`);
  if (style.fontTheme)
    result = /<scheme\b[^>]*\/?\s*>/i.test(result)
      ? result.replace(/<scheme\b[^>]*\/?\s*>/i, () => `<scheme val="${style.fontTheme}"/>`)
      : result.replace(/<\/font>/i, (closing) => `<scheme val="${style.fontTheme}"/>${closing}`);
  if (style.fontTheme && theme) {
    const name = `<name val="${escapeXml(resolveThemeFont(theme, style.fontTheme))}"/>`;
    result = /<name\b[^>]*\/?\s*>/i.test(result)
      ? result.replace(/<name\b[^>]*\/?\s*>/i, () => name)
      : result.replace(/<\/font>/i, (closing) => `${name}${closing}`);
  }
  return result;
}
function patchFill(xml: string, reference: ThemeColorReference): string {
  const pattern = /<patternFill\b[^>]*>([\s\S]*?)<\/patternFill>/i.exec(xml);
  if (!pattern) return xml;
  const body = pattern[1] ?? "";
  const next = /<fgColor\b[^>]*\/?\s*>/i.test(body)
    ? body.replace(/<fgColor\b[^>]*\/?\s*>/i, fillColorXml(reference))
    : `${fillColorXml(reference)}${body}`;
  return xml.replace(pattern[0], () => pattern[0].replace(body, () => next));
}

/** Recover semantic theme references which ExcelJS otherwise materializes to RGB. */
export function readXlsxThemeStyleBindings(
  stylesXml: Uint8Array | undefined,
): Map<number, Partial<CellStyle>> {
  const result = new Map<number, Partial<CellStyle>>();
  if (!stylesXml) return result;
  const xml = strFromU8(stylesXml);
  const fonts = entries(collection(xml, "fonts"), "font");
  const fills = entries(collection(xml, "fills"), "fill");
  for (const [index, xf] of xfs(collection(xml, "cellXfs")).entries()) {
    const style: Partial<CellStyle> = {};
    const font = fonts[Number(attribute(xf.attributes, "fontId"))];
    const fill = fills[Number(attribute(xf.attributes, "fillId"))];
    const ref = (attrs: string | undefined): ThemeColorReference | undefined => {
      if (!attrs) return undefined;
      const theme = Number(attribute(attrs, "theme"));
      if (!Number.isInteger(theme) || theme < 0 || theme > 11) return undefined;
      const slot = Object.entries(SLOT_INDEX).find(([, value]) => value === theme)?.[0] as
        | ThemeColorSlot
        | undefined;
      const tint = Number(attribute(attrs, "tint"));
      return slot ? { slot, ...(Number.isFinite(tint) && tint !== 0 ? { tint } : {}) } : undefined;
    };
    const fontColor = /<color\b([^>]*)\/?\s*>/i.exec(font ?? "")?.[1];
    const scheme = /<scheme\b([^>]*)\/?\s*>/i.exec(font ?? "")?.[1];
    const fillColor = /<fgColor\b([^>]*)\/?\s*>/i.exec(fill ?? "")?.[1];
    const textColorTheme = ref(fontColor);
    const fillColorTheme = ref(fillColor);
    const fontTheme = attribute(scheme ?? "", "val");
    if (textColorTheme) style.textColorTheme = textColorTheme;
    if (fillColorTheme) style.fillColorTheme = fillColorTheme;
    if (fontTheme === "major" || fontTheme === "minor") style.fontTheme = fontTheme;
    if (Object.keys(style).length) result.set(index, style);
  }
  return result;
}

/** Add Core's semantic theme bindings to the generated style table and cells. */
export function writeXlsxThemeStyleBindings(
  entriesArchive: Zippable,
  sheets: readonly Sheet[],
  theme?: WorkbookTheme,
): void {
  const stylesEntry = entriesArchive["xl/styles.xml"];
  if (!(stylesEntry instanceof Uint8Array)) return;
  let stylesXml = strFromU8(stylesEntry);
  const fonts = entries(collection(stylesXml, "fonts"), "font");
  const fills = entries(collection(stylesXml, "fills"), "fill");
  const cellXfs = xfs(collection(stylesXml, "cellXfs"));
  const generated = new Map<string, number>();
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const part = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const worksheetEntry = entriesArchive[part];
    if (!(worksheetEntry instanceof Uint8Array)) continue;
    let worksheetXml = strFromU8(worksheetEntry);
    const stylesByReference = new Map<string, CellStyle>();
    for (const [key, cell] of sheet.cells) {
      const style = cell.style;
      if (!style || (!style.textColorTheme && !style.fillColorTheme && !style.fontTheme)) continue;
      const [rowPart, columnPart] = key.split(":");
      const row = Number(rowPart);
      const column = Number(columnPart);
      if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) continue;
      stylesByReference.set(cellReference(row, column), style);
    }
    if (stylesByReference.size === 0) continue;
    worksheetXml = worksheetXml.replace(/<c\b([^>]*)>/gi, (opening, attributes) => {
      const style = stylesByReference.get(attribute(attributes, "r")?.toUpperCase() ?? "");
      if (!style) return opening;
      const sourceIndex = Number(attribute(attributes, "s") ?? "0");
      const source = cellXfs[sourceIndex] ?? cellXfs[0];
      if (!source) return opening;
      const signature = `${sourceIndex}\u0000${style.textColorTheme ? JSON.stringify(style.textColorTheme) : ""}\u0000${style.fillColorTheme ? JSON.stringify(style.fillColorTheme) : ""}\u0000${style.fontTheme ?? ""}`;
      let nextIndex = generated.get(signature);
      if (nextIndex === undefined) {
        const fontId = Number(attribute(source.attributes, "fontId"));
        const fillId = Number(attribute(source.attributes, "fillId"));
        const nextFontId =
          style.textColorTheme || style.fontTheme
            ? fonts.push(patchFont(fonts[fontId] ?? "<font/>", style, theme)) - 1
            : fontId;
        const nextFillId = style.fillColorTheme
          ? fills.push(
              patchFill(
                fills[fillId] ?? '<fill><patternFill patternType="solid"/></fill>',
                style.fillColorTheme,
              ),
            ) - 1
          : fillId;
        nextIndex = cellXfs.length;
        generated.set(signature, nextIndex);
        cellXfs.push({
          attributes: source.attributes
            .replace(/\s+fontId\s*=\s*(["'])[^"']*\1/i, ` fontId="${nextFontId}"`)
            .replace(/\s+fillId\s*=\s*(["'])[^"']*\1/i, ` fillId="${nextFillId}"`),
          body: source.body,
        });
      }
      return opening.replace(/\s+s\s*=\s*(["'])[^"']*\1/i, "").replace(/>$/, ` s="${nextIndex}">`);
    });
    entriesArchive[part] = strToU8(worksheetXml);
  }
  stylesXml = replaceCollection(stylesXml, "fonts", "font", fonts.join(""));
  stylesXml = replaceCollection(stylesXml, "fills", "fill", fills.join(""));
  stylesXml = replaceCollection(
    stylesXml,
    "cellXfs",
    "xf",
    cellXfs.map((xf) => `<xf${xf.attributes}>${xf.body}</xf>`).join(""),
  );
  entriesArchive["xl/styles.xml"] = strToU8(stylesXml);
}
