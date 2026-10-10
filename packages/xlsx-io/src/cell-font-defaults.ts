import { attr, child, nodes, type XmlNode } from "./pivot-xml.js";
import { elements, readXml } from "./native/reader-xml.js";
import { createNativeNormalFont } from "./native/default-font.js";

function singleValue(node: XmlNode, key: string, attribute: string, value: unknown): boolean {
  const elements = nodes(node[key]);
  return (
    elements.length === 1 &&
    Object.keys(elements[0]!).length === 1 &&
    attr(elements[0]!, attribute) === String(value)
  );
}

/**
 * Recover this producer's implicit-color projection, not arbitrary equal-looking
 * foreign colors. appName is only a structural hint, never an authenticity test.
 * Explicit Core colors omit the numeric family field and remain distinct.
 * The released black Normal base is recognized only with the same canonical
 * producer shape. Its sparse explicit black fonts must retain their color.
 */
export function readProjectedDefaultFontColors(entries: Record<string, Uint8Array>): Set<number> {
  const result = new Set<number>();
  if (!entries["xl/workbook.xml"] || !entries["xl/styles.xml"]) return result;
  const workbook = child(readXml(entries["xl/workbook.xml"]), "workbook");
  if (attr(child(workbook, "fileVersion"), "appName") !== "Sheetcraft") return result;
  const root = child(readXml(entries["xl/styles.xml"]), "styleSheet");
  const fonts = elements(child(root, "fonts").font);
  const normal = fonts[0];
  const base = createNativeNormalFont();
  const argb = attr(child(normal ?? {}, "color"), "rgb");
  const currentArgb = (base.color as { argb: string }).argb;
  if (
    !normal ||
    (argb !== currentArgb && argb !== "FF000000") ||
    Object.keys(normal).sort().join(",") !== "color,family,name,sz" ||
    !singleValue(normal, "sz", "val", base.size) ||
    !singleValue(normal, "name", "val", base.name) ||
    !singleValue(normal, "family", "val", base.family) ||
    !singleValue(normal, "color", "rgb", argb)
  )
    return result;
  const parent = elements(child(root, "cellStyleXfs").xf)[0];
  const normalStyle = nodes(child(root, "cellStyles").cellStyle)[0];
  if (
    !parent ||
    Object.keys(parent).sort().join(",") !== "@_borderId,@_fillId,@_fontId,@_numFmtId" ||
    ["numFmtId", "fontId", "fillId", "borderId"].some((key) => attr(parent, key) !== "0") ||
    !normalStyle ||
    Object.keys(normalStyle).sort().join(",") !== "@_builtinId,@_name,@_xfId" ||
    attr(normalStyle, "name") !== "Normal" ||
    attr(normalStyle, "xfId") !== "0" ||
    attr(normalStyle, "builtinId") !== "0"
  )
    return result;
  for (const [index, xf] of elements(child(root, "cellXfs").xf).entries()) {
    if (attr(xf, "xfId") !== "0") continue;
    const fontId = attr(xf, "fontId");
    if (!/^(0|[1-9]\d*)$/.test(fontId)) continue;
    const font = fonts[Number(fontId)];
    if (
      font &&
      singleValue(font, "family", "val", base.family) &&
      singleValue(font, "color", "rgb", argb)
    )
      result.add(index);
  }
  return result;
}
