import { readNativePictureStyle, type NativePictureStyle } from "./picture-native-style.js";
import type { NativeTextBoxTheme } from "./textbox-theme.js";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { normalizePictureObject, type FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { resolvePictureAnchorRect, type PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type Workbook } from "@sheetcraft/core/workbook";
import { EMU_PER_PIXEL } from "./drawing-geometry.js";
import {
  decodeNativePictureGeometry,
  isIdentityNativePictureGeometry,
  parseNativeCropPercentage,
  parseNativeRotation,
  type NativePictureGeometry,
} from "./picture-frame-geometry.js";
import { attr, type XmlNode } from "./pivot-xml.js";
import type { CompatibilityReportBuilder } from "./report.js";
import { XlsxCompatibilityError, type XlsxImportedImage } from "./types.js";

export const MAX_XLSX_IMAGE_ASSETS = 256;
export const MAX_XLSX_PICTURE_OBJECTS = 1_000;
export const MAX_XLSX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_XLSX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024;
export type PictureAnchorKind = "oneCellAnchor" | "twoCellAnchor" | "absoluteAnchor";
export type NativePicture = {
  sheetIndex: number;
  assetId: string;
  objectId: number;
  name: string;
  altText: string;
  lockAspectRatio: boolean;
  anchor: PictureFrameAnchor;
  geometry: NativePictureGeometry;
  editAs?: "oneCell" | "absolute";
  transform?: { x: number; y: number; width: number; height: number };
  location: string;
  style?: NativePictureStyle;
  styleWarnings?: string[];
};
export type NativePictureBackground = { sheetIndex: number; assetId: string };

export function rejectNativePicture(location: string, limit = false): never {
  throw new XlsxCompatibilityError("The XLSX picture cannot be preserved.", {
    issues: [
      {
        code: limit ? "archive-limit" : "drawing-or-media",
        severity: "block",
        count: 1,
        locations: [location],
      },
    ],
  });
}
const values = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function element(
  node: XmlNode,
  name: string,
  location: string,
  optional = false,
): XmlNode | undefined {
  const items = values(node[name]);
  if (!items.length && optional) return undefined;
  if (items.length !== 1 || (items[0] !== "" && (!items[0] || typeof items[0] !== "object")))
    return rejectNativePicture(location);
  return items[0] === "" ? {} : (items[0] as XmlNode);
}
function only(
  node: XmlNode,
  children: readonly string[],
  attributes: readonly string[],
  location: string,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === "@_xmlns" || key.startsWith("@_xmlns:")) continue;
    if (key === "#text") {
      if (String(value).trim()) rejectNativePicture(location);
    } else if (key.startsWith("@_")) {
      if (!attributes.includes(key.slice(2))) rejectNativePicture(`${location}.${key.slice(2)}`);
    } else if (!children.includes(key)) rejectNativePicture(`${location}.${key}`);
  }
}
function integer(value: unknown, maximum: number, location: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return rejectNativePicture(location);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) return rejectNativePicture(location);
  return number;
}
function boolean(node: XmlNode, key: string, fallback: boolean, location: string): boolean {
  const value = attr(node, key, fallback ? "1" : "0");
  if (!["0", "1", "true", "false"].includes(value))
    return rejectNativePicture(`${location}.${key}`);
  return value === "1" || value === "true";
}
function percentage(node: XmlNode, key: string, location: string): number {
  try {
    return parseNativeCropPercentage(attr(node, key, "0"));
  } catch {
    return rejectNativePicture(`${location}.${key}`);
  }
}
function rotation(node: XmlNode, location: string): number {
  try {
    return parseNativeRotation(attr(node, "rot", "0"));
  } catch {
    return rejectNativePicture(`${location}.rot`);
  }
}
function extent(node: XmlNode, location: string) {
  only(node, [], ["cx", "cy"], location);
  const width = integer(attr(node, "cx"), 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL;
  const height = integer(attr(node, "cy"), 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL;
  if (width < 1 || height < 1) rejectNativePicture(location);
  return { width, height };
}
function position(node: XmlNode, location: string) {
  only(node, [], ["x", "y"], location);
  return {
    x: integer(attr(node, "x"), 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL,
    y: integer(attr(node, "y"), 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL,
  };
}
function marker(node: XmlNode, location: string) {
  only(node, ["col", "colOff", "row", "rowOff"], [], location);
  return {
    column: {
      index: integer(node.col, MAX_SHEET_COLUMNS - 1, location),
      offset: integer(node.colOff, 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL,
    },
    row: {
      index: integer(node.row, MAX_SHEET_ROWS - 1, location),
      offset: integer(node.rowOff, 1_000_000 * EMU_PER_PIXEL, location) / EMU_PER_PIXEL,
    },
  };
}

/** Full allowlist for editable rectangular raster pictures; unknown children never inherit admission. */
export function inspectNativePicture(
  kind: PictureAnchorKind,
  node: XmlNode,
  location: string,
  theme?: NativeTextBoxTheme,
): Omit<NativePicture, "assetId" | "sheetIndex"> & { relationshipId: string } {
  only(
    node,
    kind === "absoluteAnchor"
      ? ["pos", "ext", "pic", "clientData"]
      : ["from", kind === "oneCellAnchor" ? "ext" : "to", "pic", "clientData"],
    kind === "twoCellAnchor" ? ["editAs"] : [],
    location,
  );
  const editAs = attr(node, "editAs", "twoCell");
  if (kind === "twoCellAnchor" && !["twoCell", "oneCell", "absolute"].includes(editAs))
    rejectNativePicture(location);
  const client = element(node, "clientData", location)!;
  only(client, [], ["fLocksWithSheet", "fPrintsWithSheet"], location);
  if (
    !boolean(client, "fLocksWithSheet", true, location) ||
    !boolean(client, "fPrintsWithSheet", true, location)
  )
    rejectNativePicture(`${location}.clientData`);
  const pic = element(node, "pic", location)!;
  only(pic, ["nvPicPr", "blipFill", "spPr"], [], location);
  const nonvisual = element(pic, "nvPicPr", location)!;
  only(nonvisual, ["cNvPr", "cNvPicPr"], [], location);
  const properties = element(nonvisual, "cNvPr", location)!;
  only(properties, [], ["id", "name", "descr", "title", "hidden"], location);
  const objectId = integer(attr(properties, "id"), Number.MAX_SAFE_INTEGER, location);
  if (!objectId || attr(properties, "title") || boolean(properties, "hidden", false, location))
    rejectNativePicture(location);
  const pictureProperties = element(nonvisual, "cNvPicPr", location)!;
  only(pictureProperties, ["picLocks"], [], location);
  const locks = element(pictureProperties, "picLocks", location, true) ?? {};
  only(locks, [], ["noChangeAspect"], location);
  const fill = element(pic, "blipFill", location)!;
  only(fill, ["blip", "srcRect", "stretch"], ["dpi", "rotWithShape"], location);
  if (attr(fill, "dpi", "0") !== "0" || !boolean(fill, "rotWithShape", true, location))
    rejectNativePicture(location);
  const blip = element(fill, "blip", location)!;
  only(blip, [], ["embed", "cstate"], location);
  if (
    attr(blip, "cstate") &&
    !["none", "print", "screen", "email", "hqprint"].includes(attr(blip, "cstate"))
  )
    rejectNativePicture(location);
  const relationshipId = attr(blip, "embed");
  if (!relationshipId) rejectNativePicture(location);
  const stretch = element(fill, "stretch", location)!;
  only(stretch, ["fillRect"], [], location);
  const sourceRectangle = element(fill, "srcRect", `${location}.srcRect`, true) ?? {};
  only(sourceRectangle, [], ["l", "t", "r", "b"], `${location}.srcRect`);
  const fillRectangle = element(stretch, "fillRect", `${location}.fillRect`)!;
  only(fillRectangle, [], ["l", "t", "r", "b"], `${location}.fillRect`);
  if (
    ["l", "t", "r", "b"].some((key) => percentage(fillRectangle, key, `${location}.fillRect`) !== 0)
  )
    rejectNativePicture(`${location}.fillRect`);
  const nativeGeometry: NativePictureGeometry = {
    crop: {
      left: percentage(sourceRectangle, "l", `${location}.srcRect`),
      top: percentage(sourceRectangle, "t", `${location}.srcRect`),
      right: percentage(sourceRectangle, "r", `${location}.srcRect`),
      bottom: percentage(sourceRectangle, "b", `${location}.srcRect`),
    },
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
  };
  const shape = element(pic, "spPr", location)!;
  only(shape, ["xfrm", "prstGeom", "ln", "effectLst"], [], location);
  const styling = readNativePictureStyle(shape, `${location}.spPr`, theme);
  const geometry = element(shape, "prstGeom", location)!;
  only(geometry, ["avLst"], ["prst"], location);
  if (attr(geometry, "prst") !== "rect") rejectNativePicture(`${location}.geometry`);
  only(element(geometry, "avLst", location)!, [], [], location);
  const xfrm = element(shape, "xfrm", location, true);
  let transform: NativePicture["transform"];
  if (xfrm) {
    only(xfrm, ["off", "ext"], ["rot", "flipH", "flipV"], location);
    nativeGeometry.rotation = rotation(xfrm, `${location}.xfrm`);
    nativeGeometry.flipHorizontal = boolean(xfrm, "flipH", false, `${location}.xfrm`);
    nativeGeometry.flipVertical = boolean(xfrm, "flipV", false, `${location}.xfrm`);
    transform = {
      ...position(element(xfrm, "off", location)!, location),
      ...extent(element(xfrm, "ext", location)!, location),
    };
  }
  try {
    decodeNativePictureGeometry(nativeGeometry);
    if (styling.style && !isIdentityNativePictureGeometry(nativeGeometry))
      rejectNativePicture(`${location}.styledGeometry`);
  } catch {
    rejectNativePicture(`${location}.srcRect`);
  }
  const anchor: PictureFrameAnchor =
    kind === "absoluteAnchor"
      ? {
          mode: "fixed",
          ...position(element(node, "pos", location)!, location),
          size: extent(element(node, "ext", location)!, location),
        }
      : kind === "oneCellAnchor"
        ? {
            mode: "move-only",
            origin: marker(element(node, "from", location)!, location),
            size: extent(element(node, "ext", location)!, location),
          }
        : {
            mode: "move-and-size",
            start: marker(element(node, "from", location)!, location),
            end: marker(element(node, "to", location)!, location),
          };
  return {
    ...(styling.style ? { style: styling.style } : {}),
    ...(styling.warnings.length ? { styleWarnings: styling.warnings } : {}),
    objectId,
    name: attr(properties, "name"),
    altText: attr(properties, "descr"),
    lockAspectRatio: boolean(locks, "noChangeAspect", false, location),
    anchor,
    geometry: nativeGeometry,
    ...(kind === "twoCellAnchor" && editAs !== "twoCell"
      ? { editAs: editAs as "oneCell" | "absolute" }
      : {}),
    ...(transform ? { transform } : {}),
    relationshipId,
    location,
  };
}

/** Validate encoded identity and size before sending bytes to any runtime decoder. */
export function inspectXlsxRasterMedia(
  bytes: Uint8Array,
  mime: string,
  location: string,
): XlsxImportedImage["extension"] {
  if (!bytes.length || bytes.length > MAX_XLSX_IMAGE_BYTES) rejectNativePicture(location, true);
  const png =
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) &&
    String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR";
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const gif =
    bytes.length >= 13 &&
    ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.subarray(0, 6)));
  if (mime === "image/png" && png) return "png";
  if (mime === "image/jpeg" && jpeg) return "jpeg";
  if (mime === "image/gif" && gif) return "gif";
  return rejectNativePicture(location);
}

export function readXlsxPictures(
  workbook: Workbook,
  pictures: readonly NativePicture[],
  backgrounds: readonly NativePictureBackground[],
  report: CompatibilityReportBuilder,
): void {
  const sheets = [...workbook.sheets.values()];
  for (const source of pictures) {
    const sheet = sheets[source.sheetIndex];
    if (!sheet) rejectNativePicture(source.location);
    const metrics = createPictureSheetMetrics(sheet);
    // OOXML cell markers carry free EMU offsets from their original cells.
    // Core stores these in pixels explicitly; UI-created bounded insets keep
    // their existing policy and are not silently normalized on native import.
    let anchor: PictureFrameAnchor =
      source.anchor.mode === "fixed"
        ? source.anchor
        : { ...source.anchor, offsetMode: "free-pixels" };
    try {
      const markerRect = resolvePictureAnchorRect(anchor, metrics);
      const transform = source.transform;
      // Product import policy, not a universal OOXML precedence claim:
      // ordinary relative anchors use the parsed worksheet grid. For WPS's
      // twoCell/editAs=oneCell, preserve from binding but use a complete xfrm's
      // physical extent: changing column widths must not resize this object.
      // editAs=absolute retains the complete physical xfrm; a genuine
      // absoluteAnchor already provides physical pos/ext. Redundant conflicts
      // remain diagnosed below, not represented as lossless grid conversion.
      if (source.editAs && anchor.mode === "move-and-size")
        anchor =
          source.editAs === "absolute"
            ? {
                mode: "fixed",
                x: transform ? transform.x : markerRect.x,
                y: transform ? transform.y : markerRect.y,
                size: {
                  width: transform ? transform.width : markerRect.width,
                  height: transform ? transform.height : markerRect.height,
                },
              }
            : {
                mode: "move-only",
                offsetMode: "free-pixels",
                origin: anchor.start,
                size: {
                  width: transform ? transform.width : markerRect.width,
                  height: transform ? transform.height : markerRect.height,
                },
              };
      const rect = resolvePictureAnchorRect(anchor, metrics);
      // Initial native geometry must be positive. Persisted V86 frames may
      // later collapse through grid edits without losing their logical points.
      if (rect.width < 1 || rect.height < 1) rejectNativePicture(`${source.location}.anchor`);
      const picture: FramedFloatingImage = {
        id: `xlsx-picture-${source.sheetIndex + 1}-${source.objectId}`,
        assetId: source.assetId,
        altText: source.altText,
        // Native local styles replace inherited Core theme effects.
        transform: {
          appearance: {
            suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
            ...(source.style ? { detailedStyle: source.style } : {}),
          },
        },
        ...(!source.lockAspectRatio ? { lockAspectRatio: false } : {}),
        frame: {
          kind: "object-frame-v1",
          anchor,
          ...decodeNativePictureGeometry(source.geometry),
        },
      };
      sheet.floatingImages.push(normalizePictureObject(picture));
      for (const location of source.styleWarnings ?? [])
        report.add("style-omitted", "warning", location);
      const differs = (other: typeof rect) =>
        (["x", "y", "width", "height"] as const).some((key) => {
          const roundoff = Number.EPSILON * Math.max(1, Math.abs(other[key]), Math.abs(rect[key]));
          return Math.abs(other[key] - rect[key]) > 1 / EMU_PER_PIXEL + roundoff;
        });
      const outsideCell = (point: {
        column: { index: number; offset: number };
        row: { index: number; offset: number };
      }) =>
        point.column.offset > metrics.columns.visibleSize(point.column.index) ||
        point.row.offset > metrics.rows.visibleSize(point.row.index);
      const rawAnchor = source.anchor;
      const freeOffsetApproximation =
        rawAnchor.mode === "move-only"
          ? outsideCell(rawAnchor.origin)
          : rawAnchor.mode === "move-and-size" &&
            (outsideCell(rawAnchor.start) || outsideCell(rawAnchor.end));
      if (
        differs(markerRect) ||
        (transform && differs(transform)) ||
        freeOffsetApproximation ||
        (source.editAs === "absolute" && !transform)
      )
        report.add(
          "picture-geometry-approximated",
          "warning",
          `${sheet.name}.floatingImages[${JSON.stringify(picture.id)}].anchor`,
        );
      if (source.name && source.name !== `Picture ${source.objectId}`)
        report.add(
          "feature-omitted",
          "warning",
          `${sheet.name}.floatingImages[${JSON.stringify(picture.id)}].name`,
        );
    } catch (error) {
      if (error instanceof XlsxCompatibilityError) throw error;
      rejectNativePicture(source.location);
    }
  }
  for (const background of backgrounds) {
    const sheet = sheets[background.sheetIndex];
    if (!sheet) rejectNativePicture("worksheet.background");
    sheet.pageDecoration = { ...sheet.pageDecoration, backgroundAssetId: background.assetId };
  }
}
