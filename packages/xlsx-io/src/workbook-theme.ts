import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isNativeChartFontFamily } from "./native-chart-style-capabilities.js";
import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import {
  cloneWorkbookTheme,
  DEFAULT_WORKBOOK_THEME,
  normalizeWorkbookTheme,
  type WorkbookTheme,
  type WorkbookThemeEffects,
} from "@sheetcraft/core/workbook-theme";

type ChartFontPresence = { version: 1; headingComplexScript: boolean; bodyComplexScript: boolean };
/** Private extension metadata can express model absence, never invent a source font. */
function chartFontPresence(
  raw: Record<string, unknown>,
): ChartFontPresence | "invalid" | undefined {
  const found: { node: Record<string, unknown>; namespace: string; path: string; uri?: unknown }[] =
    [];
  function walk(
    parent: Record<string, unknown>,
    bindings = new Map<string, string>(),
    path: string[] = [],
    uri?: unknown,
  ) {
    for (const [name, value] of Object.entries(parent)) {
      if (name.startsWith("@_") || name.startsWith("?") || name === "#text") continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (!item || typeof item !== "object") continue;
        const node = item as Record<string, unknown>,
          scoped = new Map(bindings);
        for (const [key, value] of Object.entries(node)) {
          if (key === "@_xmlns") scoped.set("", String(value));
          else if (key.startsWith("@_xmlns:")) scoped.set(key.slice(8), String(value));
        }
        const local = name.split(":").at(-1)!;
        const namespace = scoped.get(name.includes(":") ? name.split(":")[0]! : "") ?? "";
        const nextPath = [...path, `${namespace}|${local}`];
        if (local === "themeCatalog")
          found.push({ node, namespace, path: nextPath.join("/"), uri });
        walk(node, scoped, nextPath, local === "ext" ? node["@_uri"] : uri);
      }
    }
  }
  walk(raw);
  if (!found.length) return;
  if (found.length !== 1) return "invalid";
  const entry = found[0]!;
  try {
    if (typeof entry.node["@_data"] !== "string") return "invalid";
    const catalog = JSON.parse(decodeURIComponent(entry.node["@_data"]));
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return "invalid";
    if (!Object.hasOwn(catalog, "chartFontSlots")) return;
    const art = "http://schemas.openxmlformats.org/drawingml/2006/main";
    if (
      entry.path !==
        [
          `${art}|theme`,
          `${art}|extLst`,
          `${art}|ext`,
          "urn:sheetcraft:theme-catalog|themeCatalog",
        ].join("/") ||
      entry.uri !== catalogUri ||
      Object.keys(entry.node).some(
        (key) =>
          key !== "@_data" &&
          !key.startsWith("@_xmlns") &&
          !(key === "#text" && !String(entry.node[key]).trim()),
      )
    )
      return "invalid";
    const value = catalog.chartFontSlots;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      value.version !== 1 ||
      typeof value.headingComplexScript !== "boolean" ||
      typeof value.bodyComplexScript !== "boolean"
    )
      return "invalid";
    return value as ChartFontPresence;
  } catch {
    return "invalid";
  }
}

/** Source evidence only: never populate this from normalized/default workbook fonts. */
export type NativeChartFontTheme = Partial<
  Record<"major" | "minor", Partial<Record<"latin" | "eastAsia" | "complexScript", string>>>
>;
export function readNativeChartFontTheme(
  bytes: Uint8Array | undefined,
  invalidPresence?: () => void,
): NativeChartFontTheme {
  return readChartFontTheme(bytes, invalidPresence, false);
}
function readChartFontTheme(
  bytes: Uint8Array | undefined,
  invalidPresence: (() => void) | undefined,
  ignorePresence: boolean,
): NativeChartFontTheme {
  if (!bytes) return {};
  try {
    const xml = strFromU8(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return {};
    const raw = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: false,
    }).parse(xml);
    const roots = Object.keys(raw).filter((key) => !key.startsWith("?"));
    if (roots.length !== 1 || roots[0]!.split(":").at(-1) !== "theme") return {};
    function selected(
      parent: Record<string, unknown>,
      local: string,
      inherited: Map<string, string>,
    ): { node: Record<string, unknown>; bindings: Map<string, string> } {
      const matches = Object.entries(parent).filter(
        ([key]) => !key.startsWith("@_") && key.split(":").at(-1) === local,
      );
      if (matches.length !== 1) throw new Error("Ambiguous theme font");
      const [key, value] = matches[0]!;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid theme font");
      const node = value as Record<string, unknown>,
        bindings = new Map(inherited);
      for (const [key, value] of Object.entries(node)) {
        if (key === "@_xmlns") bindings.set("", String(value));
        else if (key.startsWith("@_xmlns:")) bindings.set(key.slice(8), String(value));
      }
      if (
        bindings.get(key.includes(":") ? key.split(":")[0]! : "") !==
        "http://schemas.openxmlformats.org/drawingml/2006/main"
      )
        throw new Error("Invalid font namespace");
      return { node, bindings };
    }
    const root = selected(raw, "theme", new Map());
    const elements = selected(root.node, "themeElements", root.bindings);
    const scheme = selected(elements.node, "fontScheme", elements.bindings);
    if (
      Object.keys(scheme.node).some(
        (key) =>
          key !== "@_name" &&
          !key.startsWith("@_xmlns") &&
          !["majorFont", "minorFont"].includes(key.split(":").at(-1)!) &&
          !(key === "#text" && !String(scheme.node[key]).trim()),
      )
    )
      return {};
    const presence = ignorePresence ? undefined : chartFontPresence(raw);
    if (presence === "invalid") {
      invalidPresence?.();
      return {};
    }
    const output: NativeChartFontTheme = {};
    for (const role of ["major", "minor"] as const) {
      try {
        const group = selected(scheme.node, `${role}Font`, scheme.bindings);
        if (
          Object.keys(group.node).some(
            (key) =>
              !key.startsWith("@_xmlns") &&
              !["latin", "ea", "cs"].includes(key.split(":").at(-1)!) &&
              !(key === "#text" && !String(group.node[key]).trim()),
          )
        )
          continue;
        const slots: NonNullable<NativeChartFontTheme["major"]> = {};
        for (const [element, slot] of [
          ["latin", "latin"],
          ["ea", "eastAsia"],
          ["cs", "complexScript"],
        ] as const) {
          const present = Object.keys(group.node).some(
            (key) => !key.startsWith("@_") && key.split(":").at(-1) === element,
          );
          if (!present && element === "cs") continue;
          const font = selected(group.node, element, group.bindings).node;
          if (
            Object.keys(font).some(
              (key) =>
                key !== "@_typeface" &&
                !key.startsWith("@_xmlns") &&
                !(key === "#text" && !String(font[key]).trim()),
            )
          )
            throw new Error("Unsupported font descriptor");
          const face = font["@_typeface"];
          if (!isNativeChartFontFamily(face) && !(slot === "complexScript" && face === ""))
            throw new Error("Unrepresented font");
          slots[slot] = face as string;
        }
        output[role] = slots;
      } catch {
        /* Unproven role remains absent, never repaired. */
      }
    }
    if (presence) {
      for (const [role, field] of [
        ["major", "headingComplexScript"],
        ["minor", "bodyComplexScript"],
      ] as const) {
        const slots = output[role];
        // False is valid only for an exact empty DrawingML placeholder. A
        // nonempty font or missing/unsupported slot cannot be hidden by metadata.
        if (
          !slots ||
          slots.complexScript === undefined ||
          (!presence[field] && slots.complexScript !== "")
        ) {
          invalidPresence?.();
          return {};
        }
        if (!presence[field]) delete slots.complexScript;
      }
    }
    return output;
  } catch {
    return {};
  }
}

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
  const encoded = new RegExp(`<sheetcraft:themeCatalog\\b[^>]*\\bdata="([^"]*)"`, "i").exec(
    xml,
  )?.[1];
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
function writeThemeCatalog(
  xml: string,
  theme: Required<WorkbookTheme>,
  scriptState: boolean,
): string {
  const data = escapeXml(
    encodeURIComponent(
      JSON.stringify({
        customColors: theme.customColors,
        customFonts: theme.customFonts,
        ...(scriptState
          ? {
              chartFontSlots: {
                version: 1,
                headingComplexScript: theme.fonts.headingComplexScript !== undefined,
                bodyComplexScript: theme.fonts.bodyComplexScript !== undefined,
              },
            }
          : {}),
      }),
    ),
  );
  const extension = `<a:ext uri="${catalogUri}"><sheetcraft:themeCatalog xmlns:sheetcraft="urn:sheetcraft:theme-catalog" data="${data}"/></a:ext>`;
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
export function readXlsxWorkbookTheme(
  value: Uint8Array | undefined,
  invalidPresence?: () => void,
): WorkbookTheme {
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
    let invalid = false;
    let scriptFonts = readNativeChartFontTheme(value, () => {
      invalid = true;
      invalidPresence?.();
    });
    // Invalid private hints never hide actual nonempty/empty source slots. They
    // cannot prove chart bindings, but the workbook still retains the raw fonts.
    if (invalid) scriptFonts = readChartFontTheme(value, undefined, true);
    const headingEastAsia = font(xml, "majorFont", "ea");
    const bodyEastAsia = font(xml, "minorFont", "ea");
    if (headingEastAsia || bodyEastAsia)
      theme.fonts = {
        name: decodeXml(/<[\w-]+:fontScheme\s+name="([^"]*)"/i.exec(xml)?.[1] || name),
        headingEastAsia: headingEastAsia ?? DEFAULT_WORKBOOK_THEME.fonts.headingEastAsia,
        bodyEastAsia: bodyEastAsia ?? DEFAULT_WORKBOOK_THEME.fonts.bodyEastAsia,
        ...(scriptFonts.major?.complexScript !== undefined
          ? { headingComplexScript: scriptFonts.major.complexScript }
          : {}),
        ...(scriptFonts.minor?.complexScript !== undefined
          ? { bodyComplexScript: scriptFonts.minor.complexScript }
          : {}),
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
export function writeXlsxWorkbookTheme(
  entries: Zippable,
  theme: WorkbookTheme,
  exactScriptFonts = false,
): void {
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
  if (
    exactScriptFonts ||
    extended.fonts.headingComplexScript !== undefined ||
    extended.fonts.bodyComplexScript !== undefined
  ) {
    // Write only model-owned slots. A template's supplemental mappings would silently
    // change empty-CS and script bindings after reload and cannot be replayed here.
    const fonts = extended.fonts;
    const group = (role: "major" | "minor", latin: string, ea: string, cs: string | undefined) =>
      `<a:${role}Font><a:latin typeface="${escapeXml(latin)}"/><a:ea typeface="${escapeXml(ea)}"/><a:cs typeface="${escapeXml(cs ?? "")}"/></a:${role}Font>`;
    const fontScheme = `<a:fontScheme name="${escapeXml(fonts.name)}">${group("major", extended.headingFont, fonts.headingEastAsia, fonts.headingComplexScript)}${group("minor", extended.bodyFont, fonts.bodyEastAsia, fonts.bodyComplexScript)}</a:fontScheme>`;
    xml = xml.replace(/<a:fontScheme\b[^>]*>[\s\S]*?<\/a:fontScheme>/i, () => fontScheme);
  } else {
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
  }
  const nextFormatScheme = formatScheme(extended);
  if (nextFormatScheme)
    xml = xml.replace(/<a:fmtScheme\b[^>]*>[\s\S]*?<\/a:fmtScheme>/i, () => nextFormatScheme);
  xml = writeThemeCatalog(
    xml,
    extended,
    exactScriptFonts ||
      extended.fonts.headingComplexScript !== undefined ||
      extended.fonts.bodyComplexScript !== undefined,
  );
  entries[themeEntry] = strToU8(xml);
}
