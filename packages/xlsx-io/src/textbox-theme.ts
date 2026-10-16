import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8 } from "fflate/browser";
import { attr, type XmlNode } from "./pivot-xml.js";
import {
  rejectNativeTextBox as reject,
  textBoxElement as element,
  textBoxNode as nodeOf,
  textBoxOnly as only,
  textBoxValues as values,
  textBoxNumber as integer,
} from "./textbox-xml.js";

export type NativeTextBoxTheme = {
  colors: Readonly<Record<string, string>>;
  fonts: Readonly<Partial<Record<"major" | "minor", string>>>;
};
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
/** Resolve only consumed theme fields; never substitute a built-in Office theme. */
export function readNativeTextBoxTheme(
  bytes: Uint8Array | undefined,
  location = "xl/theme/theme1.xml",
): NativeTextBoxTheme {
  if (!bytes) return { colors: {}, fonts: {} };
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) reject(location);
  const raw = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
  }).parse(xml) as XmlNode;
  function selected(parent: XmlNode, local: string, inherited: Map<string, string>, path: string) {
    const matches = Object.entries(parent).filter(
      ([key]) => !key.startsWith("@_") && key.split(":").at(-1) === local,
    );
    if (matches.length !== 1 || values(matches[0]![1]).length !== 1) return reject(path);
    const [key, value] = matches[0]!;
    const node = nodeOf(value, path),
      bindings = new Map(inherited);
    for (const [key, value] of Object.entries(node)) {
      if (key === "@_xmlns") bindings.set("", String(value));
      else if (key.startsWith("@_xmlns:")) bindings.set(key.slice(8), String(value));
    }
    if (bindings.get(key.includes(":") ? key.split(":")[0]! : "") !== ART_NS) reject(path);
    return { node, bindings };
  }
  function localize(node: XmlNode, inherited: Map<string, string>, path: string): XmlNode {
    const result: XmlNode = {},
      bindings = new Map(inherited);
    for (const [key, value] of Object.entries(node)) {
      if (key === "@_xmlns") bindings.set("", String(value));
      else if (key.startsWith("@_xmlns:")) bindings.set(key.slice(8), String(value));
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@_xmlns")) continue;
      if (key.startsWith("@_") || key === "#text") {
        result[key] = value;
        continue;
      }
      const local = key.split(":").at(-1)!;
      if (Object.hasOwn(result, local)) reject(`${path}.${local}`);
      const entries = values(value).map((value) => {
        const node = nodeOf(value, `${path}.${local}`),
          scoped = new Map(bindings);
        for (const [name, binding] of Object.entries(node)) {
          if (name === "@_xmlns") scoped.set("", String(binding));
          else if (name.startsWith("@_xmlns:")) scoped.set(name.slice(8), String(binding));
        }
        if (scoped.get(key.includes(":") ? key.split(":")[0]! : "") !== ART_NS)
          reject(`${path}.${local}`);
        return localize(node, scoped, `${path}.${local}`);
      });
      result[local] = entries.length === 1 ? entries[0] : entries;
    }
    return result;
  }
  const root = selected(raw, "theme", new Map(), location);
  const contents = selected(root.node, "themeElements", root.bindings, `${location}.themeElements`);
  const colorPart = selected(
    contents.node,
    "clrScheme",
    contents.bindings,
    `${location}.clrScheme`,
  );
  const fontPart = selected(
    contents.node,
    "fontScheme",
    contents.bindings,
    `${location}.fontScheme`,
  );
  const colors: Record<string, string> = {};
  const colorRoot = localize(colorPart.node, colorPart.bindings, `${location}.clrScheme`);
  const slots = [
    "dk1",
    "lt1",
    "dk2",
    "lt2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ];
  only(colorRoot, slots, ["name"], `${location}.clrScheme`);
  for (const slot of slots) {
    const node = element(colorRoot, slot, location, true);
    if (!node) continue;
    only(node, ["srgbClr", "sysClr"], [], `${location}.${slot}`);
    const rgb = element(node, "srgbClr", location, true),
      system = element(node, "sysClr", location, true);
    if (Boolean(rgb) === Boolean(system)) reject(`${location}.${slot}`);
    const color = rgb ?? system!;
    only(color, [], rgb ? ["val"] : ["val", "lastClr"], `${location}.${slot}`);
    const value = attr(color, rgb ? "val" : "lastClr");
    if (!/^[0-9a-f]{6}$/i.test(value)) reject(`${location}.${slot}`);
    colors[slot] = `#${value.toLowerCase()}`;
  }
  const fonts: Partial<Record<"major" | "minor", string>> = {};
  const fontRoot = localize(fontPart.node, fontPart.bindings, `${location}.fontScheme`);
  only(fontRoot, ["majorFont", "minorFont"], ["name"], `${location}.fontScheme`);
  for (const kind of ["major", "minor"] as const) {
    const node = element(fontRoot, `${kind}Font`, location, true);
    if (!node) continue;
    // Script-specific entries are not consumed as Latin fallback. Non-Latin inherited text is rejected below.
    only(node, ["latin", "ea", "cs", "font"], [], `${location}.${kind}Font`);
    const latin = element(node, "latin", location, true);
    if (latin) {
      only(
        latin,
        [],
        ["typeface", "panose", "pitchFamily", "charset"],
        `${location}.${kind}Font.latin`,
      );
      const face = attr(latin, "typeface");
      if (
        !face ||
        face.length > 256 ||
        Array.from(face).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        reject(`${location}.${kind}Font.latin.typeface`);
      fonts[kind] = face;
    }
  }
  return { colors, fonts };
}

/** DrawingML shade blends in linear light, then materializes the resulting sRGB.
 * https://github.com/apache/poi/blob/trunk/poi/src/main/java/org/apache/poi/sl/draw/DrawPaint.java
 */
export function materializeTextBoxShade(rgb: string, shade: number): string {
  const channel = (hex: string) => {
    const srgb = Number.parseInt(hex, 16) / 255;
    const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    const shaded = (linear * shade) / 100000;
    const result = shaded <= 0.0031308 ? shaded * 12.92 : 1.055 * shaded ** (1 / 2.4) - 0.055;
    return Math.round(result * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(rgb.slice(1, 3))}${channel(rgb.slice(3, 5))}${channel(rgb.slice(5, 7))}`;
}
export function readTextBoxColor(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  materialized: string[],
): string {
  only(node, ["srgbClr", "schemeClr"], [], path);
  const rgb = element(node, "srgbClr", path, true),
    scheme = element(node, "schemeClr", path, true);
  if (Boolean(rgb) === Boolean(scheme)) reject(path);
  const source = rgb ?? scheme!;
  only(source, ["shade"], ["val"], path);
  let color: string;
  if (rgb) {
    if (!/^[0-9a-f]{6}$/i.test(attr(rgb, "val"))) reject(`${path}.srgbClr.val`);
    color = `#${attr(rgb, "val").toLowerCase()}`;
  } else {
    color = theme?.colors[attr(scheme!, "val")] ?? reject(`${path}.schemeClr.val`);
    materialized.push(`${path}.themeMaterialization`);
  }
  const shade = element(source, "shade", path, true);
  if (shade) {
    only(shade, [], ["val"], `${path}.shade`);
    color = materializeTextBoxShade(
      color,
      integer(attr(shade, "val"), 100000, `${path}.shade.val`),
    );
  }
  return color;
}
