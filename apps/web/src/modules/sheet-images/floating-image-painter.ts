import { requireLegacyPictures } from "./picture-document-support";
import { createCanvasImageCache } from "../sheet-grid/canvas/image-painter";
import type { FloatingImage, LegacyFloatingImage, ImageTransform } from "@sheetcraft/core/workbook";
import type { ResolvedPictureFrame } from "@sheetcraft/core/picture-frame";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { paintImagePresentation } from "../../shared/images/imageAppearance";
import { hasVisibleDrawingThemeEffects, type DrawingThemeEffects } from "./drawing-theme-effects";
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
): void {
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
  },
): void {
  const effects = options.effects ?? options.state.effects;
  assertPicturePaintSupport(options.state.images, effects, options.frameContext?.metrics);
  const fragments = getPictureViewportFragments(
    options.state.images,
    options.layout,
    options.frameContext,
  );
  const visibleUrls = new Set<string>();
  // Retain the complete visible collection even when a later cache/draw fails.
  for (const fragment of fragments) {
    const url = options.assetUrls.get(fragment.image.assetId);
    if (url) visibleUrls.add(url);
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
          paintFramedPictureContent(context, image, fragment.image, fragment.geometry, effects);
        else if (image && fragment.kind === "group-leaf")
          paintGroupedPictureContent(context, image, fragment.image, fragment.geometry, effects);
        else if (image && fragment.kind === "legacy")
          paintImage(
            context,
            image,
            fragment.rect,
            fragment.image.transform,
            hasVisibleDrawingThemeEffects(effects) ? effects : undefined,
          );
        else {
          const loading = Boolean(options.loadingAssetIds?.has(fragment.image.assetId));
          const label = loading ? options.loadingLabel : options.unavailableLabel;
          if (fragment.kind === "framed" || fragment.kind === "group-leaf")
            paintFramedPlaceholder(context, fragment.geometry, label, loading, options.palette);
          else paintPlaceholder(context, fragment.rect, label, loading, options.palette);
        }
      } finally {
        context.restore();
      }
    }
  } finally {
    options.cache.retain(visibleUrls);
  }
}
