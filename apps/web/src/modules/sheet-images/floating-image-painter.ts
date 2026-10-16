import { requireLegacyPictures } from "./picture-document-support";
import { createCanvasImageCache } from "../sheet-grid/canvas/image-painter";
import type { FloatingImage, LegacyFloatingImage, ImageTransform } from "@sheetcraft/core/workbook";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup, isGroupedPicture } from "@sheetcraft/core/picture-group";
import { resolvePictureFrame, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupChild,
} from "@sheetcraft/core/picture-group-layout";
import { createPicturePaintResources } from "../../shared/images/picture-paint-resources";
import {
  getPicturePaintDensity,
  PicturePaintUnavailableError,
  type PicturePaintResources,
} from "../../shared/images/picture-detailed-render";
import { getPictureDetailedWorldBounds } from "../../shared/images/picture-detailed-bounds";
import { resolvePictureDetailedPaintStyle } from "../../shared/images/picture-detailed-paint-style";
import type { ResolvedPictureFrame } from "@sheetcraft/core/picture-frame";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { paintImagePresentation } from "../../shared/images/imageAppearance";
import {
  hasVisibleDrawingThemeEffects,
  resolvePictureThemeEffects,
  type DrawingThemeEffects,
} from "./drawing-theme-effects";
import { paintFramedPictureContent, paintGroupedPictureContent } from "./framed-picture-painter";
import { getPictureViewportFragments } from "./picture-viewport-fragments";
import {
  applyDrawingThemeShadow,
  assertPicturePaintSupport,
  paintDrawingThemeOutline,
} from "./picture-paint-effects";

export type FloatingImagePaintState = Readonly<{
  images: readonly FloatingImage[];
  revision: number;
  effects?: DrawingThemeEffects;
}>;

export type FloatingImageCanvasCache = ReturnType<typeof createFloatingImageCanvasCache>;

/** Shares decoded image sources across the whole Sheet surface. */
export function createFloatingImageCanvasCache(onChange: () => void) {
  return createCanvasImageCache(onChange);
}

function clip(context: CanvasRenderingContext2D, rect: Rect): void {
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
}

function paintImageContent(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform: ImageTransform | undefined,
): void {
  paintImagePresentation(context, image, rect, transform);
}

function paintImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform: ImageTransform | undefined,
  effects: DrawingThemeEffects | undefined,
  resources?: PicturePaintResources,
): void {
  const detailed = resolvePictureDetailedPaintStyle(transform?.appearance, effects);
  if (detailed) {
    paintImagePresentation(context, image, rect, transform, {
      resources,
      inherited: effects,
      finishFrontPainter: detailed.remainingTheme
        ? (surface, frame) => paintDrawingThemeOutline(surface, frame, detailed.remainingTheme!)
        : undefined,
    });
    return;
  }
  effects = resolvePictureThemeEffects(transform?.appearance, effects);
  context.save();
  try {
    applyDrawingThemeShadow(context, effects);
    paintImageContent(context, image, rect, transform);
  } finally {
    context.restore();
  }

  if (effects?.reflection) {
    context.save();
    try {
      context.globalAlpha = 0.22;
      context.translate(0, 2 * (rect.y + rect.height));
      context.scale(1, -1);
      paintImageContent(context, image, rect, transform);
    } finally {
      context.restore();
    }
  }
  if (effects) paintDrawingThemeOutline(context, rect, effects);
}

function paintPlaceholder(
  context: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  loading: boolean,
  palette: FloatingImagePaintPalette,
): void {
  context.save();
  try {
    context.fillStyle = palette.placeholderBackground;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (loading) {
      context.strokeStyle = palette.placeholderStripe;
      context.lineWidth = 6;
      for (let x = rect.x - rect.height; x < rect.x + rect.width; x += 14) {
        context.beginPath();
        context.moveTo(x, rect.y + rect.height);
        context.lineTo(x + rect.height, rect.y);
        context.stroke();
      }
    }
    context.strokeStyle = palette.placeholderBorder;
    context.setLineDash(loading ? [] : [4, 3]);
    context.strokeRect(
      rect.x + 0.5,
      rect.y + 0.5,
      Math.max(0, rect.width - 1),
      Math.max(0, rect.height - 1),
    );
    context.setLineDash([]);
    context.fillStyle = palette.placeholderText;
    context.font = "12px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      text,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.max(0, rect.width - 8),
    );
  } finally {
    context.restore();
  }
}

function paintFramedPlaceholder(
  context: CanvasRenderingContext2D,
  geometry: ResolvedPictureFrame,
  text: string,
  loading: boolean,
  palette: FloatingImagePaintPalette,
): void {
  const { rect } = geometry;
  context.save();
  try {
    context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    context.rotate((geometry.angleDeg * Math.PI) / 180);
    context.translate(-rect.width / 2, -rect.height / 2);
    paintPlaceholder(
      context,
      { x: 0, y: 0, width: rect.width, height: rect.height },
      text,
      loading,
      palette,
    );
  } finally {
    context.restore();
  }
}

export type FloatingImagePaintPalette = Readonly<{
  placeholderBackground: string;
  placeholderStripe: string;
  placeholderBorder: string;
  placeholderText: string;
}>;

export function getFloatingImageViewportFragmentsForPaint(
  images: readonly FloatingImage[],
  layout: SheetViewportLayout,
): Array<FloatingImageViewportFragment & { image: LegacyFloatingImage }> {
  return requireLegacyPictures(images)
    .filter((image) => !image.hidden)
    .flatMap((image) =>
      getFloatingImageViewportFragments(image, layout).map((fragment) => ({ ...fragment, image })),
    );
}

/** Paints free-floating images into the surface canvas, clipping each frozen pane. */
export function paintFloatingImages(
  context: CanvasRenderingContext2D,
  options: {
    state: FloatingImagePaintState;
    layout: SheetViewportLayout;
    frameContext?: PictureFrameLayoutContext;
    assetUrls: ReadonlyMap<string, string>;
    loadingAssetIds?: ReadonlySet<string>;
    cache: FloatingImageCanvasCache;
    palette: FloatingImagePaintPalette;
    loadingLabel: string;
    unavailableLabel: string;
    effects?: DrawingThemeEffects;
    theme?: WorkbookTheme;
  },
): void {
  const effects = options.effects ?? options.state.effects;
  assertPicturePaintSupport(options.state.images, effects, options.frameContext?.metrics);
  if (
    !options.frameContext &&
    options.state.images.some(
      (picture) => isFramedPictureObject(picture) || isPictureGroup(picture),
    )
  )
    throw new TypeError("Framed picture viewport fragments require a frame context.");
  const resources = createPicturePaintResources(options.theme, options.assetUrls, options.cache);
  // Asset reads and browser decoding are separate loading stages. A terminal
  // decoder error must not be masked by another resource still being read.
  const isAssetPending = (id: string): boolean => {
    const url = options.assetUrls.get(id);
    const state = url ? options.cache.state?.(url) : undefined;
    if (state === "error" || state === "ready") return false;
    if (state === "loading") return true;
    return options.loadingAssetIds?.has(id) === true;
  };
  const density = getPicturePaintDensity(context);
  const bounds = (
    picture:
      | LegacyFloatingImage
      | import("@sheetcraft/core/picture-object").FramedFloatingImage
      | import("@sheetcraft/core/picture-group").GroupedPicture,
    geometry: ResolvedPictureFrame,
  ) => {
    if (
      !Object.hasOwn(picture, "frame") &&
      picture.transform?.appearance?.reflection &&
      picture.transform.appearance.detailedStyle?.reflection === undefined
    )
      geometry = resolvePictureSourceLayout(
        { ...geometry.rect, height: geometry.rect.height / 1.25 },
        0,
        { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      );
    return getPictureDetailedWorldBounds(
      geometry,
      picture.transform?.appearance,
      effects,
      resources,
      density,
      isGroupedPicture(picture) || isFramedPictureObject(picture)
        ? picture.frame.cropShape
        : undefined,
    );
  };
  // Validate every source-bearing leaf, including hidden descendants, before the first cache request.
  const preflightOwned = (children: readonly ResolvedPictureGroupChild[]): void => {
    for (const child of children) {
      if ("members" in child) preflightOwned(child.members);
      else if (child.layout && !child.layout.collapsed) bounds(child.node, child.layout);
    }
  };
  for (const picture of options.state.images) {
    if (isPictureGroup(picture))
      preflightOwned(resolvePictureGroup(picture, options.frameContext!.metrics).members);
    else if (isFramedPictureObject(picture))
      bounds(picture, resolvePictureFrame(picture.frame, options.frameContext!.metrics));
    else
      bounds(
        picture,
        resolvePictureSourceLayout(
          { x: 0, y: 0, width: picture.width, height: picture.height },
          0,
          { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        ),
      );
  }
  const fragments = getPictureViewportFragments(
    options.state.images,
    options.layout,
    options.frameContext,
    bounds,
  );
  const visibleUrls = new Set<string>();
  // Retain the complete visible collection even when a later cache/draw fails.
  for (const fragment of fragments) {
    const url = options.assetUrls.get(fragment.image.assetId);
    if (url) visibleUrls.add(url);
    for (const id of getDetailedPictureStyleAssetIds(
      fragment.image.transform?.appearance?.detailedStyle,
    )) {
      const auxiliaryUrl = options.assetUrls.get(id);
      if (auxiliaryUrl) visibleUrls.add(auxiliaryUrl);
    }
  }
  try {
    for (const fragment of fragments) {
      context.save();
      try {
        const pane = options.layout.panes[fragment.paneId];
        // Effects may extend beyond the image bounds but must not cross frozen panes.
        clip(context, pane.clip);
        const url = options.assetUrls.get(fragment.image.assetId);
        const image = url ? options.cache.get(url) : undefined;
        if (image && fragment.kind === "framed")
          paintFramedPictureContent(
            context,
            image,
            fragment.image,
            fragment.geometry,
            effects,
            resources,
          );
        else if (image && fragment.kind === "group-leaf")
          paintGroupedPictureContent(
            context,
            image,
            fragment.image,
            fragment.geometry,
            effects,
            resources,
          );
        else if (image && fragment.kind === "legacy")
          paintImage(
            context,
            image,
            fragment.rect,
            fragment.image.transform,
            hasVisibleDrawingThemeEffects(effects) ? effects : undefined,
            resources,
          );
        else {
          const loading = isAssetPending(fragment.image.assetId);
          const label = loading ? options.loadingLabel : options.unavailableLabel;
          if (fragment.kind === "framed" || fragment.kind === "group-leaf")
            paintFramedPlaceholder(context, fragment.geometry, label, loading, options.palette);
          else paintPlaceholder(context, fragment.rect, label, loading, options.palette);
        }
      } catch (error) {
        if (!(error instanceof PicturePaintUnavailableError)) throw error;
        const loading =
          error.missingAssetIds.length > 0 && error.missingAssetIds.every(isAssetPending);
        const label = loading ? options.loadingLabel : options.unavailableLabel;
        if (fragment.kind === "framed" || fragment.kind === "group-leaf")
          paintFramedPlaceholder(context, fragment.geometry, label, loading, options.palette);
        else paintPlaceholder(context, fragment.rect, label, loading, options.palette);
      } finally {
        context.restore();
      }
    }
  } finally {
    options.cache.retain(visibleUrls);
  }
}
