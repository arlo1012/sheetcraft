import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import {
  cloneWorkbookTheme,
  DEFAULT_WORKBOOK_THEME,
  normalizeWorkbookTheme,
  type WorkbookTheme,
} from "@idea10/core/workbook-theme";

const themeEntry = "xl/theme/theme1.xml";
const accentTags = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;
function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}
function decodeXml(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]!,
  );
}
function color(xml: string, tag: string): string | undefined {
  const match = new RegExp(
    `<[\\w-]+:${tag}[^>]*>\\s*<[\\w-]+:srgbClr\\s+val="([0-9a-f]{6})"`,
    "i",
  ).exec(xml);
  return match?.[1] ? `#${match[1].toLowerCase()}` : undefined;
}
export function readXlsxWorkbookTheme(value: Uint8Array | undefined): WorkbookTheme {
  if (!value) return cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
  const xml = strFromU8(value);
  const accentColors = accentTags.map((tag) => color(xml, tag));
  const headingFont = /<[\w-]+:majorFont>[\s\S]*?<[\w-]+:latin\s+typeface="([^"]*)"/i.exec(
    xml,
  )?.[1];
  const bodyFont = /<[\w-]+:minorFont>[\s\S]*?<[\w-]+:latin\s+typeface="([^"]*)"/i.exec(xml)?.[1];
  const name = decodeXml(/<[\w-]+:clrScheme\s+name="([^"]*)"/i.exec(xml)?.[1] || "Office");
  try {
    return normalizeWorkbookTheme({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "office",
      name,
      accentColors: accentColors.every(Boolean)
        ? (accentColors as WorkbookTheme["accentColors"])
        : DEFAULT_WORKBOOK_THEME.accentColors,
      headingFont: headingFont ? decodeXml(headingFont) : DEFAULT_WORKBOOK_THEME.headingFont,
      bodyFont: bodyFont ? decodeXml(bodyFont) : DEFAULT_WORKBOOK_THEME.bodyFont,
    });
  } catch {
    return cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
  }
}
export function writeXlsxWorkbookTheme(entries: Zippable, theme: WorkbookTheme): void {
  const colors = theme.accentColors.map((color) => color.slice(1).toUpperCase());
  const source = entries[themeEntry];
  if (!(source instanceof Uint8Array)) return;
  let xml = strFromU8(source);
  const clrScheme = `<a:clrScheme name="${escapeXml(theme.name)}"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>${accentTags.map((tag, index) => `<a:${tag}><a:srgbClr val="${colors[index]}"/></a:${tag}>`).join("")}<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>`;
  xml = xml.replace(/<a:clrScheme\b[^>]*>[\s\S]*?<\/a:clrScheme>/i, clrScheme);
  xml = xml.replace(/(<a:theme\b[^>]*\bname=")[^"]*(")/i, `$1${escapeXml(theme.name)}$2`);
  xml = xml.replace(
    /(<a:majorFont>[\s\S]*?<a:latin\s+typeface=")[^"]*(")/i,
    `$1${escapeXml(theme.headingFont)}$2`,
  );
  xml = xml.replace(
    /(<a:minorFont>[\s\S]*?<a:latin\s+typeface=")[^"]*(")/i,
    `$1${escapeXml(theme.bodyFont)}$2`,
  );
  entries[themeEntry] = strToU8(xml);
}
