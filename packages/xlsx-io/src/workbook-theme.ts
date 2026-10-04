import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import {
  cloneWorkbookTheme,
  DEFAULT_WORKBOOK_THEME,
  normalizeWorkbookTheme,
  type WorkbookTheme,
  type WorkbookThemeEffects,
} from "@idea10/core/workbook-theme";

const themeEntry = "xl/theme/theme1.xml";
const catalogUri = "{A2D8FC83-5106-4D1E-9D45-8D6B870A6F4D}";
const accentTags = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;
const colorTags = ["dk1", "lt1", "dk2", "lt2", ...accentTags, "hlink", "folHlink"] as const;

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
function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes)?.[2];
}
function readThemeCatalog(xml: string): Pick<WorkbookTheme, "customColors" | "customFonts"> {
  const encoded = new RegExp(`<idea10:themeCatalog\\b[^>]*\\bdata="([^"]*)"`, "i").exec(xml)?.[1];
  if (!encoded) return {};
  try {
    const catalog = JSON.parse(decodeURIComponent(decodeXml(encoded))) as Record<string, unknown>;
    return {
      ...(Array.isArray(catalog.customColors) ? { customColors: catalog.customColors } : {}),
      ...(Array.isArray(catalog.customFonts) ? { customFonts: catalog.customFonts } : {}),
    } as Pick<WorkbookTheme, "customColors" | "customFonts">;
  } catch {
    return {};
  }
}
function writeThemeCatalog(xml: string, theme: Required<WorkbookTheme>): string {
  const data = escapeXml(
    encodeURIComponent(
      JSON.stringify({ customColors: theme.customColors, customFonts: theme.customFonts }),
    ),
  );
  const extension = `<a:ext uri="${catalogUri}"><idea10:themeCatalog xmlns:idea10="urn:idea10:theme-catalog" data="${data}"/></a:ext>`;
  const existing = new RegExp(
    `<a:ext\\b[^>]*\\buri="${catalogUri}"[^>]*>[\\s\\S]*?<\\/a:ext>`,
    "i",
  );
  if (existing.test(xml)) return xml.replace(existing, () => extension);
  if (/<a:extLst\b[^>]*>/i.test(xml))
    return xml.replace(/<\/a:extLst>/i, (closing) => `${extension}${closing}`);
  return xml.replace(/<\/a:theme>/i, (closing) => `<a:extLst>${extension}</a:extLst>${closing}`);
}
/** A DrawingML color is either fixed RGB or a system color with a fallback. */
function schemeColor(xml: string, tag: string): string | undefined {
  const body = new RegExp(`<[\\w-]+:${tag}\\b[^>]*>([\\s\\S]*?)<\\/[\\w-]+:${tag}>`, "i").exec(
    xml,
  )?.[1];
  const color = body && /<[\w-]+:(?:srgbClr|sysClr)\b([^>]*)\/?\s*>/i.exec(body);
  const value = color && (attribute(color[1] ?? "", "lastClr") ?? attribute(color[1] ?? "", "val"));
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : undefined;
}
function font(
  xml: string,
  family: "majorFont" | "minorFont",
  script: "latin" | "ea",
): string | undefined {
  const body = new RegExp(
    `<[\\w-]+:${family}\\b[^>]*>([\\s\\S]*?)<\\/[\\w-]+:${family}>`,
    "i",
  ).exec(xml)?.[1];
  const attrs = body && new RegExp(`<[^>]+:${script}\\b([^>]*)\\/?\\s*>`, "i").exec(body)?.[1];
  const typeface = attrs && attribute(attrs, "typeface");
  if (typeface) return decodeXml(typeface);
  if (script !== "ea") return undefined;
  for (const match of body?.matchAll(/<[^>]+:font\b([^>]*)\/?\s*>/gi) ?? []) {
    const fontAttributes = match[1] ?? "";
    if (attribute(fontAttributes, "script") !== "Hans") continue;
    const hansTypeface = attribute(fontAttributes, "typeface");
    if (hansTypeface) return decodeXml(hansTypeface);
  }
  return undefined;
}
function effects(xml: string): WorkbookThemeEffects | undefined {
  const match = /<a:fmtScheme\b([^>]*)>([\s\S]*?)<\/a:fmtScheme>/i.exec(xml);
  if (!match) return undefined;
  const body = match[2] ?? "";
  const name = decodeXml(attribute(match[1] ?? "", "name") ?? "Office");
  const line = /<a:ln\b([^>]*)/i.exec(body)?.[1] ?? "";
  const width = Number(attribute(line, "w"));
  const shadow = /<a:(?:outer|inner)Shdw\b([^>]*)/i.exec(body);
  return {
    id:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "office",
    name,
    shadow: shadow ? (Number(attribute(shadow[1] ?? "", "blurRad")) > 0 ? "soft" : "hard") : "none",
    reflection: /<a:reflection\b/i.test(body),
    bevel: /<a:bevel(?:T|B)\b/i.test(body),
    outlineWidth: Number.isFinite(width) && width > 0 ? Math.round((width / 12700) * 100) / 100 : 0,
    gradient: /<a:gradFill\b/i.test(body),
  };
}
export function readXlsxWorkbookTheme(value: Uint8Array | undefined): WorkbookTheme {
  if (!value) return cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
  const xml = strFromU8(value);
  const colors = colorTags.map((tag) => schemeColor(xml, tag));
  const colorSchemeName = decodeXml(
    /<[\w-]+:clrScheme\s+name="([^"]*)"/i.exec(xml)?.[1] || "Office",
  );
  const name = decodeXml(/<[\w-]+:theme\b[^>]*\bname="([^"]*)"/i.exec(xml)?.[1] || colorSchemeName);
  try {
    const theme: WorkbookTheme = {
      id:
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "office",
      name,
      accentColors: colors.slice(4, 10).every(Boolean)
        ? (colors.slice(4, 10) as WorkbookTheme["accentColors"])
        : DEFAULT_WORKBOOK_THEME.accentColors,
      headingFont: font(xml, "majorFont", "latin") ?? DEFAULT_WORKBOOK_THEME.headingFont,
      bodyFont: font(xml, "minorFont", "latin") ?? DEFAULT_WORKBOOK_THEME.bodyFont,
    };
    if (colors.every(Boolean))
      theme.colors = {
        name: colorSchemeName,
        dark1: colors[0]!,
        light1: colors[1]!,
        dark2: colors[2]!,
        light2: colors[3]!,
        hyperlink: colors[10]!,
        followedHyperlink: colors[11]!,
      };
    const headingEastAsia = font(xml, "majorFont", "ea");
    const bodyEastAsia = font(xml, "minorFont", "ea");
    if (headingEastAsia || bodyEastAsia)
      theme.fonts = {
        name: decodeXml(/<[\w-]+:fontScheme\s+name="([^"]*)"/i.exec(xml)?.[1] || name),
        headingEastAsia: headingEastAsia ?? DEFAULT_WORKBOOK_THEME.fonts.headingEastAsia,
        bodyEastAsia: bodyEastAsia ?? DEFAULT_WORKBOOK_THEME.fonts.bodyEastAsia,
      };
    const formatEffects = effects(xml);
    if (formatEffects) theme.effects = formatEffects;
    Object.assign(theme, readThemeCatalog(xml));
    return normalizeWorkbookTheme(theme);
  } catch {
    return cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
  }
}
function colorXml(tag: string, color: string, system?: string): string {
  const value = color.slice(1).toUpperCase();
  return system
    ? `<a:${tag}><a:sysClr val="${system}" lastClr="${value}"/></a:${tag}>`
    : `<a:${tag}><a:srgbClr val="${value}"/></a:${tag}>`;
}
function formatScheme(theme: Required<WorkbookTheme>): string {
  const effect = theme.effects;
  if (!effect) return "";
  const width = Math.max(0, Math.round(effect.outlineWidth * 12700));
  const shadow =
    effect.shadow === "none"
      ? ""
      : `<a:outerShdw blurRad="${effect.shadow === "soft" ? "63500" : "0"}" dist="38100" dir="5400000"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw>`;
  const reflection = effect.reflection
    ? '<a:reflection blurRad="0" stA="50000" endA="300" endPos="55500" dir="5400000" dist="0"/>'
    : "";
  const bevel = effect.bevel ? '<a:bevelT w="63500" h="63500"/>' : "";
  const gradient = effect.gradient
    ? '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>'
    : '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return `<a:fmtScheme name="${escapeXml(effect.name)}"><a:fillStyleLst>${gradient}<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="${width}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="${width}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="${width}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst>${shadow}${reflection}</a:effectLst><a:sp3d>${bevel}</a:sp3d></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>`;
}
export function writeXlsxWorkbookTheme(entries: Zippable, theme: WorkbookTheme): void {
  const source = entries[themeEntry];
  if (!(source instanceof Uint8Array)) return;
  const extended = normalizeWorkbookTheme(theme);
  const colors = extended.colors;
  const clrScheme = `<a:clrScheme name="${escapeXml(colors?.name || theme.name)}">${colorXml("dk1", colors?.dark1 ?? "#000000", "windowText")}${colorXml("lt1", colors?.light1 ?? "#ffffff", "window")}${colorXml("dk2", colors?.dark2 ?? "#1f1f1f")}${colorXml("lt2", colors?.light2 ?? "#eeeeee")}${accentTags.map((tag, index) => colorXml(tag, theme.accentColors[index]!)).join("")}${colorXml("hlink", colors?.hyperlink ?? "#0563c1")}${colorXml("folHlink", colors?.followedHyperlink ?? "#954f72")}</a:clrScheme>`;
  let xml = strFromU8(source)
    .replace(/<a:clrScheme\b[^>]*>[\s\S]*?<\/a:clrScheme>/i, () => clrScheme)
    .replace(
      /(<a:theme\b[^>]*\bname=")[^"]*(")/i,
      (_, before, after) => `${before}${escapeXml(theme.name)}${after}`,
    )
    .replace(
      /(<a:majorFont>[\s\S]*?<a:latin\s+typeface=")[^"]*(")/i,
      (_, before, after) => `${before}${escapeXml(theme.headingFont)}${after}`,
    )
    .replace(
      /(<a:minorFont>[\s\S]*?<a:latin\s+typeface=")[^"]*(")/i,
      (_, before, after) => `${before}${escapeXml(theme.bodyFont)}${after}`,
    );
  if (extended.fonts)
    xml = xml
      .replace(
        /(<a:fontScheme\b[^>]*\bname=")[^"]*(")/i,
        (_, before, after) => `${before}${escapeXml(extended.fonts.name)}${after}`,
      )
      .replace(
        /(<a:majorFont>[\s\S]*?<a:ea\s+typeface=")[^"]*(")/i,
        (_, before, after) => `${before}${escapeXml(extended.fonts.headingEastAsia)}${after}`,
      )
      .replace(
        /(<a:minorFont>[\s\S]*?<a:ea\s+typeface=")[^"]*(")/i,
        (_, before, after) => `${before}${escapeXml(extended.fonts.bodyEastAsia)}${after}`,
      );
  const nextFormatScheme = formatScheme(extended);
  if (nextFormatScheme)
    xml = xml.replace(/<a:fmtScheme\b[^>]*>[\s\S]*?<\/a:fmtScheme>/i, () => nextFormatScheme);
  xml = writeThemeCatalog(xml, extended);
  entries[themeEntry] = strToU8(xml);
}
