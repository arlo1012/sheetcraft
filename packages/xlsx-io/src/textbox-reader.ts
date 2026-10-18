import { equalDrawingEncodingRects } from "@sheetcraft/core/picture-frame";
import {
  createPictureSheetMetrics,
  locatePictureAxisPoint,
  projectFreePictureAxisPoint,
  type PictureCellPoint,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { resolveShapeAnchorRect, type ShapeFrameAnchor } from "@sheetcraft/core/shape-frame";
import type { ShapeText } from "@sheetcraft/core/shape-text";
import type {
  ShapeTextCharacterFormat,
  ShapeTextCharacterRun,
} from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeChoice, ShapePaint, ShapeLine } from "@sheetcraft/core/shape-style";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type Workbook } from "@sheetcraft/core/workbook";
import { EMU_PER_PIXEL } from "./drawing-geometry.js";
import type { PictureAnchorKind } from "./picture-reader.js";
import { attr, type XmlNode } from "./pivot-xml.js";
import type { CompatibilityReportBuilder } from "./report.js";
import { readTextBoxColor, type NativeTextBoxTheme } from "./textbox-theme.js";
import {
  rejectNativeTextBox as reject,
  textBoxOnly as only,
  textBoxElement as element,
  textBoxNode as nodeOf,
  textBoxValues as values,
  textBoxNumber as integer,
  textBoxBool as boolean,
} from "./textbox-xml.js";
export { readNativeTextBoxTheme, type NativeTextBoxTheme } from "./textbox-theme.js";
export { rejectNativeTextBox } from "./textbox-xml.js";
export const MAX_XLSX_TEXT_BOXES = 1000;
export type NativeTextBox = {
  objectId: number;
  anchor: ShapeFrameAnchor;
  editAs?: "oneCell" | "absolute";
  transform?: { x: number; y: number; width: number; height: number };
  drawing: Omit<SheetFramedGraphicDrawing, "id" | "shapeFrame">;
  location: string;
  themeMaterializations: string[];
};
const EMU_PER_PT = 12700;
const NONE = { kind: "none" } as const;
const NO_EFFECTS = {
  shadow: NONE,
  reflection: NONE,
  glow: NONE,
  softEdges: NONE,
  format3d: NONE,
  rotation3d: NONE,
};
function enumValue<T extends string>(value: string, allowed: readonly T[], path: string): T {
  if (!allowed.includes(value as T)) reject(path);
  return value as T;
}
function extent(node: XmlNode, path: string) {
  only(node, [], ["cx", "cy"], path);
  return {
    width:
      integer(attr(node, "cx"), 16384 * EMU_PER_PIXEL, `${path}.cx`, EMU_PER_PIXEL) / EMU_PER_PIXEL,
    height:
      integer(attr(node, "cy"), 16384 * EMU_PER_PIXEL, `${path}.cy`, EMU_PER_PIXEL) / EMU_PER_PIXEL,
  };
}
function position(node: XmlNode, path: string) {
  only(node, [], ["x", "y"], path);
  return {
    x: integer(attr(node, "x"), Number.MAX_SAFE_INTEGER, `${path}.x`) / EMU_PER_PIXEL,
    y: integer(attr(node, "y"), Number.MAX_SAFE_INTEGER, `${path}.y`) / EMU_PER_PIXEL,
  };
}
function marker(node: XmlNode, path: string): PictureCellPoint {
  only(node, ["col", "colOff", "row", "rowOff"], [], path);
  return {
    column: {
      index: integer(node.col, MAX_SHEET_COLUMNS - 1, `${path}.col`),
      offset: integer(node.colOff, 1000000 * EMU_PER_PIXEL, `${path}.colOff`) / EMU_PER_PIXEL,
    },
    row: {
      index: integer(node.row, MAX_SHEET_ROWS - 1, `${path}.row`),
      offset: integer(node.rowOff, 1000000 * EMU_PER_PIXEL, `${path}.rowOff`) / EMU_PER_PIXEL,
    },
  };
}
function paint(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  materialized: string[],
): ShapeChoice<ShapePaint> {
  const fill = element(node, "solidFill", path, true),
    noFill = element(node, "noFill", path, true);
  if (Boolean(fill) === Boolean(noFill)) reject(`${path}.fill`);
  if (noFill) {
    only(noFill, [], [], `${path}.noFill`);
    return NONE;
  }
  return {
    kind: "value",
    value: {
      kind: "solid",
      color: {
        kind: "rgb",
        rgb: readTextBoxColor(fill!, `${path}.solidFill`, theme, materialized),
      },
      opacity: 1,
    },
  };
}
function line(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  materialized: string[],
): ShapeChoice<ShapeLine> {
  only(
    node,
    ["solidFill", "noFill", "prstDash", "round", "bevel", "miter"],
    ["w", "cmpd", "cap", "algn"],
    path,
  );
  if (attr(node, "algn", "ctr") !== "ctr") reject(`${path}.algn`);
  const p = paint(node, path, theme, materialized);
  const widthPt = integer(attr(node, "w", "12700"), 24 * EMU_PER_PT, `${path}.w`) / EMU_PER_PT;
  enumValue(attr(node, "cmpd", "sng"), ["sng"], `${path}.cmpd`);
  const cap = enumValue(attr(node, "cap", "flat"), ["flat", "rnd", "sq"], `${path}.cap`);
  const dash = element(node, "prstDash", path, true);
  if (dash) {
    only(dash, [], ["val"], `${path}.prstDash`);
    if (attr(dash, "val") !== "solid") reject(`${path}.prstDash.val`);
  }
  const joins = ["round", "bevel", "miter"].filter((key) => node[key] !== undefined);
  if (joins.length > 1) reject(`${path}.join`);
  const join = (joins[0] ?? "round") as "round" | "bevel" | "miter";
  const joinNode = element(node, join, path, true);
  if (joinNode) only(joinNode, [], join === "miter" ? ["lim"] : [], `${path}.${join}`);
  const miterLimit =
    join === "miter"
      ? integer(attr(joinNode!, "lim", "800000"), 100000000, `${path}.miter.lim`, 1) / 100000
      : 8;
  if (p.kind === "none") return NONE;
  return {
    kind: "value",
    value: {
      paint: p.value,
      widthPt,
      compound: "single",
      dash: "solid",
      cap: cap === "flat" ? "butt" : cap === "rnd" ? "round" : "square",
      join,
      miterLimit,
    },
  };
}
function validateFontDescriptor(node: XmlNode, path: string, materialized: string[]) {
  if (node["@_panose"] !== undefined && !/^[0-9a-f]{20}$/i.test(attr(node, "panose")))
    reject(`${path}.panose`);
  if (node["@_charset"] !== undefined && attr(node, "charset") !== "0") reject(`${path}.charset`);
  if (node["@_panose"] !== undefined || node["@_charset"] !== undefined)
    materialized.push(`${path}.fontDescriptorMaterialization`);
}
function sameFont(left: ShapeTextCharacterFormat, right: ShapeTextCharacterFormat) {
  return (
    ["fontFamily", "fontSize", "bold", "italic", "underline", "strike", "color"] as const
  ).every((key) => left[key] === right[key]);
}
function runFormat(
  node: XmlNode,
  path: string,
  theme: NativeTextBoxTheme | undefined,
  materialized: string[],
): ShapeTextCharacterFormat {
  only(
    node,
    ["latin", "ea", "cs", "solidFill", "ln", "effectLst"],
    ["lang", "altLang", "sz", "b", "i", "u", "strike"],
    path,
  );
  for (const key of ["lang", "altLang"]) {
    const lang = attr(node, key);
    if (lang && !/^(?:x-none|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i.test(lang)) reject(`${path}.${key}`);
  }
  const effect = element(node, "effectLst", path, true);
  if (effect) only(effect, [], [], `${path}.effectLst`);
  const outline = element(node, "ln", path, true);
  if (outline) {
    only(outline, ["noFill"], [], `${path}.ln`);
    only(element(outline, "noFill", path)!, [], [], `${path}.ln.noFill`);
  }
  const result: ShapeTextCharacterFormat = {};
  if (node["@_sz"] !== undefined)
    result.fontSize = integer(attr(node, "sz"), 38400, `${path}.sz`, 75) / 75;
  for (const [wire, core] of [
    ["b", "bold"],
    ["i", "italic"],
  ] as const)
    if (node[`@_${wire}`] !== undefined) result[core] = boolean(node, wire, false, path);
  if (node["@_u"] !== undefined)
    result.underline = enumValue(attr(node, "u"), ["none", "sng"], `${path}.u`) === "sng";
  if (node["@_strike"] !== undefined)
    result.strike =
      enumValue(attr(node, "strike"), ["noStrike", "sngStrike"], `${path}.strike`) === "sngStrike";
  const latin = element(node, "latin", path, true);
  if (latin) {
    only(latin, [], ["typeface", "panose", "charset"], `${path}.latin`);
    validateFontDescriptor(latin, `${path}.latin`, materialized);
    const face = attr(latin, "typeface");
    if (
      !face ||
      face.length > 256 ||
      face.trim() !== face ||
      Array.from(face).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      face.startsWith("+")
    )
      reject(`${path}.latin.typeface`);
    result.fontFamily = face;
  }
  for (const script of ["ea", "cs"]) {
    const font = element(node, script, path, true);
    if (font) {
      only(font, [], ["typeface", "panose", "charset"], `${path}.${script}`);
      validateFontDescriptor(font, `${path}.${script}`, materialized);
      if (latin && ["panose", "charset"].some((key) => attr(font, key) !== attr(latin, key)))
        reject(`${path}.${script}.fontDescriptor`);
      if (!result.fontFamily || attr(font, "typeface") !== result.fontFamily)
        reject(`${path}.${script}.typeface`);
    }
  }
  const fill = element(node, "solidFill", path, true);
  if (fill) result.color = readTextBoxColor(fill, `${path}.solidFill`, theme, materialized);
  return result;
}
function layout(node: XmlNode, path: string): ShapeText["layout"] {
  only(
    node,
    ["noAutofit"],
    [
      "vertOverflow",
      "horzOverflow",
      "wrap",
      "rtlCol",
      "anchor",
      "vert",
      "lIns",
      "rIns",
      "tIns",
      "bIns",
      "rot",
      "anchorCtr",
    ],
    path,
  );
  if (attr(node, "rot", "0") !== "0" || boolean(node, "anchorCtr", false, path))
    reject(`${path}.rotationOrCenter`);
  if (attr(node, "vert", "horz") !== "horz") reject(`${path}.vert`);
  const vertical = enumValue(
    attr(node, "vertOverflow", "overflow"),
    ["clip", "overflow"],
    `${path}.vertOverflow`,
  );
  const horizontal = enumValue(
    attr(node, "horzOverflow", "overflow"),
    ["clip", "overflow"],
    `${path}.horzOverflow`,
  );
  if (vertical !== horizontal) reject(`${path}.overflow`);
  const auto = element(node, "noAutofit", path)!;
  only(auto, [], [], `${path}.noAutofit`);
  const marginsPt = { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 };
  for (const [wire, core] of [
    ["lIns", "leftPt"],
    ["rIns", "rightPt"],
    ["tIns", "topPt"],
    ["bIns", "bottomPt"],
  ] as const)
    if (node[`@_${wire}`] !== undefined)
      marginsPt[core] =
        integer(attr(node, wire), 4096 * EMU_PER_PT, `${path}.${wire}`) / EMU_PER_PT;
  const align = enumValue(attr(node, "anchor", "t"), ["t", "ctr", "b"], `${path}.anchor`);
  return {
    blockAlignment: align === "t" ? "start" : align === "ctr" ? "center" : "end",
    direction: "horizontal",
    lineOrder: boolean(node, "rtlCol", false, path) ? "rtl" : "ltr",
    marginsPt,
    wrap: enumValue(attr(node, "wrap", "square"), ["none", "square"], `${path}.wrap`) === "square",
    overflow: vertical === "overflow",
    autoFit: "none",
    keepFlat: false,
  };
}
function readBody(
  node: XmlNode,
  path: string,
  base: ShapeTextCharacterFormat,
  theme: NativeTextBoxTheme | undefined,
  materialized: string[],
) {
  only(node, ["bodyPr", "lstStyle", "p"], [], path);
  const bodyLayout = layout(element(node, "bodyPr", path)!, `${path}.bodyPr`);
  const list = element(node, "lstStyle", path, true);
  if (list) only(list, [], [], `${path}.lstStyle`);
  const paragraphs = values(node.p);
  if (!paragraphs.length || paragraphs.length > 10000) reject(`${path}.p`);
  let text = "",
    paragraph: ShapeText["paragraph"] | undefined,
    first: ShapeTextCharacterFormat | undefined,
    previousEnd: ShapeTextCharacterFormat | undefined;
  const runs: ShapeTextCharacterRun[] = [];
  const paragraphBreaks: Array<{ run: ShapeTextCharacterRun; path: string }> = [];
  for (const [index, raw] of paragraphs.entries()) {
    const ppath = `${path}.p[${index}]`,
      p = nodeOf(raw, ppath);
    only(p, ["pPr", "r", "endParaRPr"], [], ppath);
    const ppr = element(p, "pPr", ppath, true) ?? {};
    only(ppr, ["defRPr", "lnSpc", "spcBef", "spcAft"], ["algn"], `${ppath}.pPr`);
    for (const key of ["lnSpc", "spcBef", "spcAft"]) {
      const spacing = element(ppr, key, ppath, true);
      if (spacing) {
        const child = key === "lnSpc" ? "spcPct" : "spcPts";
        only(spacing, [child], [], `${ppath}.pPr.${key}`);
        const value = element(spacing, child, ppath)!;
        only(value, [], ["val"], `${ppath}.pPr.${key}.${child}`);
        if (attr(value, "val") !== (key === "lnSpc" ? "100000" : "0"))
          reject(`${ppath}.pPr.${key}.${child}.val`);
      }
    }
    const alignment = enumValue(
      attr(ppr, "algn", "l"),
      ["l", "ctr", "r", "just"],
      `${ppath}.pPr.algn`,
    );
    const next: ShapeText["paragraph"] = {
      alignment:
        alignment === "l"
          ? "left"
          : alignment === "ctr"
            ? "center"
            : alignment === "r"
              ? "right"
              : "justify",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: { kind: "normal" },
    };
    if (paragraph && JSON.stringify(next) !== JSON.stringify(paragraph)) reject(`${ppath}.pPr`);
    paragraph = next;
    const defaults = {
      ...base,
      ...runFormat(
        element(ppr, "defRPr", ppath, true) ?? {},
        `${ppath}.pPr.defRPr`,
        theme,
        materialized,
      ),
    };
    const end = runFormat(
      element(p, "endParaRPr", ppath, true) ?? {},
      `${ppath}.endParaRPr`,
      theme,
      materialized,
    );
    if (!first && defaults.fontSize !== undefined && defaults.fontFamily && defaults.color)
      first = defaults;
    if (index) {
      if (previousEnd?.fontSize === undefined || !previousEnd.fontFamily || !previousEnd.color)
        reject(`${path}.p[${index - 1}].endParaRPr.font`);
      const run = { start: text.length, end: text.length + 1, ...previousEnd };
      runs.push(run);
      paragraphBreaks.push({ run, path: `${path}.p[${index - 1}].endParaRPr` });
      text += "\n";
    }
    const rawRuns = values(p.r);
    if (rawRuns.length > 100000) reject(`${ppath}.r`);
    let previous: ShapeTextCharacterFormat | undefined;
    for (const [rindex, rawRun] of rawRuns.entries()) {
      const rpath = `${ppath}.r[${rindex}]`,
        run = nodeOf(rawRun, rpath);
      only(run, ["rPr", "t"], [], rpath);
      const strings = values(run.t);
      if (strings.length !== 1) reject(`${rpath}.t`);
      let content: string;
      if (typeof strings[0] === "string") content = strings[0];
      else {
        const literal = nodeOf(strings[0], `${rpath}.t`);
        for (const key of Object.keys(literal))
          if (!["#text", "@_space"].includes(key)) reject(`${rpath}.t.${key}`);
        enumValue(attr(literal, "space", "default"), ["default", "preserve"], `${rpath}.t.space`);
        if (literal["#text"] !== undefined && typeof literal["#text"] !== "string")
          reject(`${rpath}.t`);
        content = String(literal["#text"] ?? "");
      }
      const format = {
        ...defaults,
        ...runFormat(element(run, "rPr", rpath, true) ?? {}, `${rpath}.rPr`, theme, materialized),
      };
      if (format.fontSize === undefined || !format.fontFamily || !format.color)
        reject(`${rpath}.font`);
      // A Latin theme font is not a script font resolver. Do not guess for complex scripts.
      if (
        base.fontFamily === format.fontFamily &&
        Array.from(content).some((char) => char.codePointAt(0)! > 0x24f)
      )
        reject(`${rpath}.themeScriptFont`);
      if (!first) first = format;
      previous = format;
      const start = text.length;
      text += content;
      if (text.length > 100000) reject(`${path}.textLimit`);
      if (text.length > start) runs.push({ start, end: text.length, ...format });
    }
    if (!rawRuns.length) {
      const format = { ...defaults, ...end };
      if (format.fontSize === undefined || !format.fontFamily || !format.color)
        reject(`${ppath}.font`);
      first ??= format;
      previous = format;
      if (index === paragraphs.length - 1 && index > 0 && !sameFont(format, first))
        reject(`${ppath}.emptyParagraphFont`);
    }
    previousEnd = { ...defaults, ...end };
    if (index !== paragraphs.length - 1) continue;
    for (const [key, value] of Object.entries(end))
      if (
        previous?.[key as keyof ShapeTextCharacterFormat] !== value &&
        defaults[key as keyof ShapeTextCharacterFormat] !== value
      )
        reject(`${ppath}.endParaRPr.${key}`);
  }
  const font = first!;
  for (const { run, path: breakPath } of paragraphBreaks) {
    if (sameFont(run, font)) continue;
    const before = runs.find((other) => other.start <= run.start - 1 && other.end > run.start - 1);
    const after = runs.find((other) => other.start <= run.end && other.end > run.end);
    if (
      !before ||
      !after ||
      text[run.start - 1] === "\n" ||
      text[run.end] === "\n" ||
      !sameFont(before, run) ||
      !sameFont(after, run)
    )
      reject(`${breakPath}.lineBreakFormat`);
  }
  const different = runs.some((format) => !sameFont(format, font));
  const shapeText: ShapeText = {
    layout: bodyLayout,
    paragraph: paragraph!,
    fontFamily: font.fontFamily!,
    ...(font.underline ? { underline: true } : {}),
    ...(font.strike ? { strike: true } : {}),
    style: {
      fill: {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: font.color! }, opacity: 1 },
      },
      line: NONE,
      ...NO_EFFECTS,
    },
    ...(different ? { characterRuns: runs } : {}),
  };
  return { text, font, shapeText };
}

/** Called only after namespace-aware drawing validation. Every consumed node has a closed grammar. */
export function inspectNativeTextBox(
  kind: PictureAnchorKind,
  node: XmlNode,
  location: string,
  theme?: NativeTextBoxTheme,
): NativeTextBox {
  only(
    node,
    kind === "absoluteAnchor"
      ? ["pos", "ext", "sp", "clientData"]
      : ["from", kind === "oneCellAnchor" ? "ext" : "to", "sp", "clientData"],
    kind === "twoCellAnchor" ? ["editAs"] : [],
    location,
  );
  const editAs = enumValue(
    attr(node, "editAs", "twoCell"),
    ["twoCell", "oneCell", "absolute"],
    `${location}.editAs`,
  );
  const client = element(node, "clientData", location)!;
  only(client, [], ["fLocksWithSheet", "fPrintsWithSheet"], `${location}.clientData`);
  const locked = boolean(client, "fLocksWithSheet", true, location),
    printObject = boolean(client, "fPrintsWithSheet", true, location);
  const sp = element(node, "sp", location)!;
  only(sp, ["nvSpPr", "spPr", "style", "txBody"], [], `${location}.sp`);
  const nv = element(sp, "nvSpPr", location)!;
  only(nv, ["cNvPr", "cNvSpPr"], [], `${location}.nvSpPr`);
  const props = element(nv, "cNvPr", location)!;
  only(props, [], ["id", "name", "descr", "title", "hidden"], `${location}.cNvPr`);
  const objectId = integer(attr(props, "id"), Number.MAX_SAFE_INTEGER, `${location}.cNvPr.id`, 1);
  const nonvisual = element(nv, "cNvSpPr", location)!;
  only(nonvisual, ["spLocks"], ["txBox"], `${location}.cNvSpPr`);
  if (!boolean(nonvisual, "txBox", false, `${location}.cNvSpPr`))
    reject(`${location}.cNvSpPr.txBox`);
  const locks = element(nonvisual, "spLocks", location, true) ?? {};
  only(locks, [], ["noChangeAspect"], `${location}.spLocks`);
  const lockAspectRatio = boolean(locks, "noChangeAspect", false, `${location}.spLocks`);
  const body = element(sp, "spPr", location)!;
  only(
    body,
    ["xfrm", "prstGeom", "solidFill", "noFill", "ln", "effectLst"],
    [],
    `${location}.spPr`,
  );
  const effects = element(body, "effectLst", location, true);
  if (effects) only(effects, [], [], `${location}.spPr.effectLst`);
  const geometry = element(body, "prstGeom", location)!;
  only(geometry, ["avLst"], ["prst"], `${location}.prstGeom`);
  if (attr(geometry, "prst") !== "rect") reject(`${location}.prstGeom.prst`);
  only(element(geometry, "avLst", location)!, [], [], `${location}.prstGeom.avLst`);
  const xfrm = element(body, "xfrm", location, true);
  let transform: NativeTextBox["transform"];
  if (xfrm) {
    only(xfrm, ["off", "ext"], ["rot", "flipH", "flipV"], `${location}.xfrm`);
    if (
      attr(xfrm, "rot", "0") !== "0" ||
      boolean(xfrm, "flipH", false, location) ||
      boolean(xfrm, "flipV", false, location)
    )
      reject(`${location}.xfrm.transform`);
    transform = {
      ...position(element(xfrm, "off", location)!, `${location}.xfrm.off`),
      ...extent(element(xfrm, "ext", location)!, `${location}.xfrm.ext`),
    };
  }
  const materialized: string[] = [];
  const fill = paint(body, `${location}.spPr`, theme, materialized);
  const stroke = line(element(body, "ln", location)!, `${location}.spPr.ln`, theme, materialized);
  let base: ShapeTextCharacterFormat = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
  };
  const style = element(sp, "style", location, true);
  if (style) {
    only(style, ["lnRef", "fillRef", "effectRef", "fontRef"], [], `${location}.style`);
    for (const key of ["lnRef", "fillRef", "effectRef"]) {
      const ref = element(style, key, location)!;
      only(ref, ["scrgbClr"], ["idx"], `${location}.style.${key}`);
      if (attr(ref, "idx") !== "0") reject(`${location}.style.${key}.idx`);
      const black = element(ref, "scrgbClr", location)!;
      only(black, [], ["r", "g", "b"], `${location}.style.${key}.scrgbClr`);
      if (["r", "g", "b"].some((key) => attr(black, key) !== "0"))
        reject(`${location}.style.${key}.scrgbClr`);
    }
    const font = element(style, "fontRef", location)!;
    only(font, ["srgbClr", "schemeClr"], ["idx"], `${location}.style.fontRef`);
    const type = enumValue(attr(font, "idx"), ["major", "minor"], `${location}.style.fontRef.idx`);
    const face = theme?.fonts[type] ?? reject(`${location}.style.fontRef.themeFont`);
    const { "@_idx": _idx, ...color } = font;
    base = {
      ...base,
      fontFamily: face,
      color: readTextBoxColor(color, `${location}.style.fontRef`, theme, materialized),
    };
    materialized.push(`${location}.style.fontRef.themeMaterialization`);
  }
  const text = readBody(
    element(sp, "txBody", location)!,
    `${location}.txBody`,
    base,
    theme,
    materialized,
  );
  const anchor: ShapeFrameAnchor =
    kind === "absoluteAnchor"
      ? {
          mode: "fixed",
          ...position(element(node, "pos", location)!, `${location}.pos`),
          size: extent(element(node, "ext", location)!, `${location}.ext`),
        }
      : kind === "oneCellAnchor"
        ? {
            mode: "move-only",
            origin: marker(element(node, "from", location)!, `${location}.from`),
            size: extent(element(node, "ext", location)!, `${location}.ext`),
          }
        : {
            mode: "move-and-size",
            start: marker(element(node, "from", location)!, `${location}.from`),
            end: marker(element(node, "to", location)!, `${location}.to`),
          };
  const fillRgb =
    fill.kind === "value" && fill.value.kind === "solid" && fill.value.color.kind === "rgb"
      ? fill.value.color.rgb
      : "transparent";
  const lineRgb =
    stroke.kind === "value" &&
    stroke.value.paint.kind === "solid" &&
    stroke.value.paint.color.kind === "rgb"
      ? stroke.value.paint.color.rgb
      : "transparent";
  return {
    objectId,
    anchor,
    ...(kind === "twoCellAnchor" && editAs !== "twoCell" ? { editAs } : {}),
    transform,
    location,
    themeMaterializations: [...new Set(materialized)],
    drawing: {
      kind: "textBox",
      name: attr(props, "name"),
      text: text.text,
      shape: "rectangle",
      fill: fillRgb,
      stroke: lineRgb,
      strokeWidth: stroke.kind === "value" ? (stroke.value.widthPt * 4) / 3 : 0,
      color: text.font.color!,
      fontSize: text.font.fontSize!,
      bold: text.font.bold ?? false,
      italic: text.font.italic ?? false,
      rotation: 0,
      ...(boolean(props, "hidden", false, location) ? { hidden: true } : {}),
      shapeProperties: {
        ...(lockAspectRatio ? { lockAspectRatio: true } : {}),
        ...(!locked ? { locked: false } : {}),
        ...(!printObject ? { printObject: false } : {}),
        ...(attr(props, "title") ? { altTitle: attr(props, "title") } : {}),
        ...(attr(props, "descr") ? { altDescription: attr(props, "descr") } : {}),
      },
      shapeStyle: { fill, line: stroke, ...NO_EFFECTS },
      shapeText: text.shapeText,
    },
  };
}

export function readXlsxTextBoxes(
  workbook: Workbook,
  sources: readonly (NativeTextBox & { sheetIndex: number; drawingOrder?: number })[],
  report: CompatibilityReportBuilder,
  onDrawing?: (
    source: NativeTextBox & { sheetIndex: number; drawingOrder?: number },
    drawing: SheetDrawing,
  ) => void,
): void {
  if (sources.length > MAX_XLSX_TEXT_BOXES) reject("textBoxes.limit");
  const sheets = [...workbook.sheets.values()];
  // Stage all objects so a later incompatibility cannot partially mutate a workbook.
  const pending: Array<{
    sheetIndex: number;
    drawing: SheetFramedGraphicDrawing;
    source: NativeTextBox & { sheetIndex: number; drawingOrder?: number };
    approximated: boolean;
  }> = [];
  for (const source of sources) {
    const sheet = sheets[source.sheetIndex];
    if (!sheet) reject(`${source.location}.sheet`);
    const metrics = createPictureSheetMetrics(sheet);
    const point = (p: PictureCellPoint): PictureCellPoint => ({
      column: locatePictureAxisPoint(
        projectFreePictureAxisPoint(p.column, metrics.columns),
        metrics.columns,
        p.column,
      ),
      row: locatePictureAxisPoint(
        projectFreePictureAxisPoint(p.row, metrics.rows),
        metrics.rows,
        p.row,
      ),
    });
    let anchor: ShapeFrameAnchor =
      source.anchor.mode === "fixed"
        ? source.anchor
        : source.anchor.mode === "move-only"
          ? { ...source.anchor, origin: point(source.anchor.origin) }
          : { ...source.anchor, start: point(source.anchor.start), end: point(source.anchor.end) };
    try {
      const markerRect = resolveShapeAnchorRect(anchor, metrics);
      // Match the existing native-picture import policy, not a universal OOXML
      // precedence claim: fixed twoCell/editAs=absolute retains complete xfrm;
      // relative/move-only anchors retain worksheet marker geometry.
      const transform = source.transform;
      if (source.editAs && anchor.mode === "move-and-size")
        anchor =
          source.editAs === "absolute"
            ? {
                mode: "fixed",
                x: transform?.x ?? markerRect.x,
                y: transform?.y ?? markerRect.y,
                size: {
                  width: transform?.width ?? markerRect.width,
                  height: transform?.height ?? markerRect.height,
                },
              }
            : {
                mode: "move-only",
                origin: anchor.start,
                size: { width: markerRect.width, height: markerRect.height },
              };
      if (
        source.editAs === "absolute" &&
        source.anchor.mode === "move-and-size" &&
        anchor.mode === "fixed" &&
        transform &&
        equalDrawingEncodingRects(markerRect, transform)
      )
        anchor.exportEncoding = {
          kind: "two-cell-absolute-v1",
          start: source.anchor.start,
          end: source.anchor.end,
          referenceRect: { ...transform },
        };
      const rect = resolveShapeAnchorRect(anchor, metrics);
      if (rect.width < 1 || rect.height < 1) reject(`${source.location}.anchor`);
      let id = `xlsx-textbox-${source.sheetIndex + 1}-${source.objectId}`;
      while (
        sheet.drawings?.some((drawing) => drawing.id === id) ||
        pending.some((p) => p.sheetIndex === source.sheetIndex && p.drawing.id === id)
      )
        id += "_2";
      const drawing = normalizeSheetDrawing({
        ...source.drawing,
        id,
        shapeFrame: { kind: "shape-frame-v1", anchor },
      });
      const differs = (other: typeof rect) =>
        (["x", "y", "width", "height"] as const).some(
          (key) => Math.abs(rect[key] - other[key]) > 1 / EMU_PER_PIXEL + 1e-8,
        );
      const approximated =
        differs(markerRect) ||
        (!!transform && differs(transform)) ||
        (source.editAs === "absolute" && !transform);
      pending.push({ sheetIndex: source.sheetIndex, drawing, source, approximated });
    } catch (error) {
      if (error instanceof Error && error.name === "XlsxCompatibilityError") throw error;
      reject(`${source.location}.anchorOrModel`);
    }
  }
  for (const { sheetIndex, drawing, source, approximated } of pending) {
    (sheets[sheetIndex]!.drawings ??= []).push(drawing);
    onDrawing?.(source, drawing);
    for (const location of source.themeMaterializations)
      report.add("style-omitted", "warning", location);
    if (approximated)
      report.add("dimension-approximated", "warning", `${source.location}.anchorTransform`);
  }
}
