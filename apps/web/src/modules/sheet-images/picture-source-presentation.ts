import {
  clonePictureObject,
  isFramedPictureObject,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  clonePictureGroupChild,
  isGroupedPicture,
  type GroupedPicture,
} from "@sheetcraft/core/picture-group";
import {
  pictureFrameLocalToWorld,
  resolvePictureSourceLayout,
  type ResolvedPictureFrame,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import { assertImagePixelBudget } from "../image-assets/imageAssetValidation";
import { getPictureDetailedWorldBounds } from "../../shared/images/picture-detailed-bounds";
import type { PicturePaintResources } from "../../shared/images/picture-detailed-render";
import { getDrawingThemeEffects, resolvePictureThemeEffects } from "./drawing-theme-effects";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { paintFramedPictureContent, paintGroupedPictureContent } from "./framed-picture-painter";
import { assertSourceBearingPicturePaintSupport } from "./picture-paint-effects";

export type PictureSourcePresentation = {
  picture: FramedFloatingImage | GroupedPicture;
  geometry: ResolvedPictureFrame;
};

/** Retain the real source and its resolved local geometry, never a fake legacy crop. */
export function capturePictureSourcePresentation(
  picture: FramedFloatingImage | GroupedPicture,
  geometry: ResolvedPictureFrame,
): PictureSourcePresentation {
  const copy = isGroupedPicture(picture)
    ? clonePictureGroupChild(picture)
    : clonePictureObject(picture);
  if (!isGroupedPicture(copy) && !isFramedPictureObject(copy))
    throw new TypeError("Picture presentation requires a real source-bearing frame.");
  if (geometry.collapsed || geometry.rect.width <= 0 || geometry.rect.height <= 0)
    throw new RangeError("Expand the picture before previewing it.");
  return {
    picture: copy,
    geometry: resolvePictureSourceLayout(
      { ...geometry.rect },
      geometry.angleDeg,
      copy.frame.source,
    ),
  };
}

function fallbackBounds(
  presentation: PictureSourcePresentation,
  reflected: boolean,
): PictureFrameRect {
  const { rect, angleDeg } = presentation.geometry;
  const points = [
    { x: 0, y: 0 },
    { x: rect.width, y: 0 },
    { x: rect.width, y: rect.height * (reflected ? 2 : 1) },
    { x: 0, y: rect.height * (reflected ? 2 : 1) },
  ].map((point) => pictureFrameLocalToWorld(rect, angleDeg, point));
  const x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}

/** A bounded, consumer-owned canvas drawn by the exact worksheet leaf painter. */
export function createPictureSourcePresentationCanvas(
  decoded: HTMLImageElement,
  input: PictureSourcePresentation,
  theme?: WorkbookTheme,
  resources?: PicturePaintResources,
  maxSide = 4096,
): HTMLCanvasElement {
  if (!Number.isInteger(maxSide) || maxSide < 96 || maxSide > 4096)
    throw new RangeError("Invalid picture presentation limit.");
  assertImagePixelBudget(decoded.naturalWidth, decoded.naturalHeight);
  const presentation = capturePictureSourcePresentation(input.picture, input.geometry),
    { picture, geometry } = presentation,
    inherited = getDrawingThemeEffects(theme);
  assertSourceBearingPicturePaintSupport(picture, inherited);
  const effects = resolvePictureThemeEffects(picture.transform?.appearance, inherited);
  const typed = !!picture.transform?.appearance?.detailedStyle;
  const fallback = fallbackBounds(presentation, !typed && effects?.reflection === true);
  // Native canvas shadows are screen-space pixels, unlike typed effect bounds.
  const shadow = picture.transform?.appearance?.shadow ?? effects?.shadow;
  const padding = !typed && shadow && shadow !== "none" ? (shadow === "soft" ? 28 : 7) : 0;
  const pixelLimit = 4 * 1024 * 1024;
  const fit = (bounds: PictureFrameRect): number => {
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      throw new RangeError("Picture presentation bounds are unavailable.");
    return Math.min(
      1,
      (maxSide - 2 * padding) / bounds.width,
      (maxSide - 2 * padding) / bounds.height,
      (Math.sqrt(pixelLimit) - 2 * padding) / Math.max(bounds.width, bounds.height),
    );
  };
  let density = fit(fallback),
    bounds = fallback;
  for (let iteration = 0; iteration < 3; iteration++) {
    bounds =
      getPictureDetailedWorldBounds(
        geometry,
        picture.transform?.appearance,
        inherited,
        resources,
        density,
      ) ?? fallback;
    density = Math.min(density, fit(bounds));
  }
  bounds =
    getPictureDetailedWorldBounds(
      geometry,
      picture.transform?.appearance,
      inherited,
      resources,
      density,
    ) ?? fallback;
  const width = Math.max(1, Math.ceil(bounds.width * density + 2 * padding)),
    height = Math.max(1, Math.ceil(bounds.height * density + 2 * padding));
  if (width > maxSide || height > maxSide || width > Math.floor(pixelLimit / height))
    throw new RangeError("Picture presentation exceeds its raster budget.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Picture presentation is unavailable.");
    context.setTransform(
      density,
      0,
      0,
      density,
      padding - bounds.x * density,
      padding - bounds.y * density,
    );
    if (isGroupedPicture(picture))
      paintGroupedPictureContent(context, decoded, picture, geometry, inherited, resources);
    else paintFramedPictureContent(context, decoded, picture, geometry, inherited, resources);
    return canvas;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
}
