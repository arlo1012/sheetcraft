import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
  type PictureLine,
  type PictureShadow,
  type PictureColor,
} from "@sheetcraft/core/picture-detailed-style";
import { attr, type XmlNode } from "./pivot-xml.js";
import type { NativeTextBoxTheme } from "./textbox-theme.js";
import { XlsxCompatibilityError } from "./types.js";

const EMU = 12700;
const PERCENT = 100000;
const anchors = {
  tl: "top-left",
  t: "top",
  tr: "top-right",
  l: "left",
  ctr: "center",
  r: "right",
  bl: "bottom-left",
  b: "bottom",
  br: "bottom-right",
} as const;
export type NativePictureStyle = Pick<PictureDetailedStyle, "line" | "shadow">;
function reject(path: string): never {
  throw new XlsxCompatibilityError("The XLSX picture style cannot be preserved.", {
    issues: [{ code: "drawing-or-media", severity: "block", count: 1, locations: [path] }],
  });
}
function only(
  node: XmlNode,
  children: readonly string[],
  attributes: readonly string[],
  path: string,
) {
  for (const [key, value] of Object.entries(node)) {
    if (key === "@_xmlns" || key.startsWith("@_xmlns:")) continue;
    if (key === "#text") {
      if (String(value).trim()) reject(path);
    } else if (key.startsWith("@_")) {
      if (!attributes.includes(key.slice(2))) reject(`${path}.${key.slice(2)}`);
    } else if (!children.includes(key)) reject(`${path}.${key}`);
  }
}
function element(node: XmlNode, key: string, path: string): XmlNode | undefined {
  const value = node[key];
  if (value === undefined) return;
  if (value === "") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(`${path}.${key}`);
  return value as XmlNode;
}
function integer(text: string, max: number, path: string): number {
  if (!/^\d+$/.test(text)) reject(path);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > max) reject(path);
  return value;
}
function color(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  warnings: string[],
) {
  only(node, ["srgbClr", "schemeClr", "prstClr"], [], path);
  const kinds = ["srgbClr", "schemeClr", "prstClr"].filter((key) => node[key] !== undefined);
  if (kinds.length !== 1) reject(`${path}.color`);
  const kind = kinds[0]!,
    source = element(node, kind, path)!;
  only(source, ["alpha"], ["val"], `${path}.${kind}`);
  const value = attr(source, "val");
  let rgb: string;
  if (kind === "srgbClr") {
    if (!/^[0-9a-f]{6}$/i.test(value)) reject(`${path}.${kind}.val`);
    rgb = `#${value.toLowerCase()}`;
  } else if (kind === "prstClr") {
    if (value !== "black") reject(`${path}.${kind}.val`);
    rgb = "#000000";
  } else {
    rgb = theme?.colors[value] ?? reject(`${path}.${kind}.val`);
    warnings.push(`${path}.themeMaterialization`);
  }
  const alpha = element(source, "alpha", path);
  if (alpha) only(alpha, [], ["val"], `${path}.alpha`);
  const opacity = alpha ? integer(attr(alpha, "val"), PERCENT, `${path}.alpha.val`) / PERCENT : 1;
  return { color: { kind: "rgb", rgb } as const, opacity };
}
function line(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  warnings: string[],
): NonNullable<NativePictureStyle["line"]> {
  only(
    node,
    ["solidFill", "noFill", "prstDash", "round", "bevel", "miter"],
    ["w", "cap", "cmpd", "algn"],
    path,
  );
  if (attr(node, "cmpd", "sng") !== "sng" || attr(node, "algn", "ctr") !== "ctr") reject(path);
  const cap = attr(node, "cap", "flat");
  if (!["flat", "rnd", "sq"].includes(cap)) reject(`${path}.cap`);
  const dash = element(node, "prstDash", path);
  if (dash) {
    only(dash, [], ["val"], `${path}.prstDash`);
    if (attr(dash, "val") !== "solid") reject(`${path}.prstDash`);
  }
  const joins = ["round", "bevel", "miter"].filter((key) => node[key] !== undefined);
  if (joins.length > 1) reject(`${path}.join`);
  const join = (joins[0] ?? "round") as PictureLine["join"];
  const joinNode = element(node, join, path);
  if (joinNode) only(joinNode, [], join === "miter" ? ["lim"] : [], `${path}.${join}`);
  const miterLimit =
    join === "miter"
      ? integer(attr(joinNode!, "lim", "800000"), 100000000, `${path}.miter.lim`) / PERCENT
      : 8;
  if (miterLimit < 1) reject(`${path}.miter.lim`);
  const fill = element(node, "solidFill", path),
    none = element(node, "noFill", path);
  if (Boolean(fill) === Boolean(none)) reject(`${path}.fill`);
  const widthPt =
    node["@_w"] === undefined ? undefined : integer(attr(node, "w"), 24 * EMU, `${path}.w`) / EMU;
  if (none) {
    only(none, [], [], `${path}.noFill`);
    if (
      Object.keys(node).some((key) =>
        ["@_w", "@_cap", "@_cmpd", "@_algn", "prstDash", "round", "bevel", "miter"].includes(key),
      )
    )
      warnings.push(`${path}.noFillMetadataMaterialization`);
    return { kind: "none" };
  }
  // MS-OI29500 2.1.1212(e): missing/zero width with visible fill is a
  // device-dependent hairline, not Core zero width. This slice has no hairline
  // model and must not replace it with a fixed 0.75pt screen approximation.
  if (widthPt === undefined || widthPt === 0) reject(`${path}.w`);
  return {
    kind: "value",
    value: {
      paint: { kind: "solid", ...color(fill!, `${path}.solidFill`, theme, warnings) },
      widthPt,
      compound: "single",
      dash: "solid",
      cap: cap === "flat" ? "butt" : cap === "rnd" ? "round" : "square",
      join,
      miterLimit,
    },
  };
}
function shadow(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  warnings: string[],
): PictureShadow {
  only(
    node,
    ["srgbClr", "schemeClr", "prstClr"],
    ["blurRad", "dist", "dir", "sx", "sy", "kx", "ky", "algn", "rotWithShape"],
    path,
  );
  for (const key of ["sx", "sy"])
    if (attr(node, key, "100000") !== "100000") reject(`${path}.${key}`);
  for (const key of ["kx", "ky"]) if (attr(node, key, "0") !== "0") reject(`${path}.${key}`);
  const rotate = attr(node, "rotWithShape", "1");
  if (!["0", "1", "true", "false"].includes(rotate)) reject(`${path}.rotWithShape`);
  const alignment = attr(node, "algn", "b");
  if (!Object.hasOwn(anchors, alignment)) reject(`${path}.algn`);
  const colors = Object.fromEntries(Object.entries(node).filter(([key]) => !key.startsWith("@_")));
  const result: PictureShadow = {
    kind: "outer",
    ...color(colors, path, theme, warnings),
    scale: 1,
    blurPt: integer(attr(node, "blurRad", "0"), 4096 * EMU, `${path}.blurRad`) / EMU,
    distancePt: integer(attr(node, "dist", "0"), 4096 * EMU, `${path}.dist`) / EMU,
    angleDeg: integer(attr(node, "dir", "0"), 21599999, `${path}.dir`) / 60000,
    anchor: anchors[alignment as keyof typeof anchors],
  };
  // Core has no rotation-follow flag. Only identity geometry is admitted; retain
  // current appearance, explicitly diagnose loss of future rotation semantics.
  warnings.push(`${path}.rotWithShapeMaterialization`);
  return result;
}
export function readNativePictureStyle(
  shape: XmlNode,
  path: string,
  theme?: NativeTextBoxTheme,
): { style?: NativePictureStyle; warnings: string[] } {
  const style: NativePictureStyle = {},
    warnings: string[] = [];
  const stroke = element(shape, "ln", path),
    effects = element(shape, "effectLst", path);
  if (stroke) style.line = line(stroke, `${path}.ln`, theme, warnings);
  if (effects) {
    only(effects, ["outerShdw"], [], `${path}.effectLst`);
    const outer = element(effects, "outerShdw", `${path}.effectLst`);
    style.shadow = outer
      ? { kind: "value", value: shadow(outer, `${path}.effectLst.outerShdw`, theme, warnings) }
      : { kind: "none" };
  }
  return { ...(Object.keys(style).length ? { style } : {}), warnings };
}
/** Require exact fixed-point representation, apart from floating-point roundoff. */
function fixed(value: number, unit: number, max: number, normalizationMagnitude = 0): number {
  const scaled = value * unit,
    integer = Math.round(scaled);
  if (
    !Number.isSafeInteger(integer) ||
    integer < 0 ||
    integer > max ||
    Math.abs(scaled - integer) >
      8 * Number.EPSILON * Math.max(1, Math.abs(scaled), normalizationMagnitude * unit)
  )
    throw new RangeError("Picture style exceeds native fixed-point precision.");
  return integer;
}
function rgb(color: PictureColor): string {
  if (color.kind !== "rgb" || !/^#[a-f0-9]{6}$/i.test(color.rgb))
    throw new RangeError("Native picture style requires materialized RGB.");
  return color.rgb.slice(1).toUpperCase();
}
function paint(color: PictureColor, opacity: number): string {
  return `<a:srgbClr val="${rgb(color)}"><a:alpha val="${fixed(opacity, PERCENT, PERCENT)}"/></a:srgbClr>`;
}
/** The same serializer proves export admission before any media is registered. */
export function writeNativePictureStyle(input: NativePictureStyle | undefined): string {
  if (!input) return "";
  if (Object.keys(input).some((key) => !["line", "shadow"].includes(key)))
    throw new RangeError("Unsupported native picture style category.");
  const style = normalizeDetailedPictureStyle(input);
  let xml = "";
  if (style?.line?.kind === "none") xml += "<a:ln><a:noFill/></a:ln>";
  else if (style?.line?.kind === "value") {
    const line = style.line.value;
    if (
      line.widthPt <= 0 ||
      line.paint.kind !== "solid" ||
      line.compound !== "single" ||
      line.dash !== "solid"
    )
      throw new RangeError("Unsupported native picture line.");
    if (line.join !== "miter" && line.miterLimit !== 8)
      throw new RangeError("Native round/bevel lines cannot preserve a dormant miter limit.");
    // Guard the encoded integer too: floating-point tolerance near zero must
    // never turn a tiny positive Core line into an Office device hairline.
    const widthEmu = fixed(line.widthPt, EMU, 24 * EMU);
    if (widthEmu < 1) throw new RangeError("Native picture lines require positive EMU width.");
    const cap = { butt: "flat", round: "rnd", square: "sq" }[line.cap];
    xml += `<a:ln w="${widthEmu}" cap="${cap}" cmpd="sng" algn="ctr"><a:solidFill>${paint(line.paint.color, line.paint.opacity)}</a:solidFill><a:prstDash val="solid"/><a:${line.join}${line.join === "miter" ? ` lim="${fixed(line.miterLimit, PERCENT, 100000000)}"` : ""}/></a:ln>`;
  }
  if (style?.shadow?.kind === "none") xml += "<a:effectLst/>";
  else if (style?.shadow?.kind === "value") {
    const s = style.shadow.value;
    if (s.kind !== "outer" || s.scale !== 1)
      throw new RangeError("Unsupported native picture shadow.");
    const alignment = Object.entries(anchors).find(([, value]) => value === s.anchor)![0];
    xml += `<a:effectLst><a:outerShdw blurRad="${fixed(s.blurPt, EMU, 4096 * EMU)}" dist="${fixed(s.distancePt, EMU, 4096 * EMU)}" dir="${fixed(s.angleDeg, 60000, 21599999, 360)}" sx="100000" sy="100000" kx="0" ky="0" algn="${alignment}" rotWithShape="1">${paint(s.color, s.opacity)}</a:outerShdw></a:effectLst>`;
  }
  return xml;
}

/** Lazy theme access for pictures; malformed trees are still rejected by the reader. */
export function pictureUsesTheme(node: XmlNode): boolean {
  return Object.entries(node).some(
    ([key, value]) =>
      key === "schemeClr" ||
      (value !== null &&
        typeof value === "object" &&
        (Array.isArray(value)
          ? value.some(
              (item) => item && typeof item === "object" && pictureUsesTheme(item as XmlNode),
            )
          : pictureUsesTheme(value as XmlNode))),
  );
}
