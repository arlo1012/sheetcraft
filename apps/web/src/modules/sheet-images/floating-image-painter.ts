import { createCanvasImageCache } from "../sheet-grid/canvas/image-painter";
import type { FloatingImage, ImageTransform } from "@idea10/core/workbook";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { getImagePresentation } from "../../shared/images/imagePresentation";
import { hasVisibleDrawingThemeEffects, type DrawingThemeEffects } from "./drawing-theme-effects";

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
  const geometry = getImagePresentation(transform, image.naturalWidth, image.naturalHeight);
  if (geometry.width <= 0 || geometry.height <= 0) return;
  context.translate(rect.x, rect.y);
  context.scale(rect.width / geometry.width, rect.height / geometry.height);
  const rotation = transform?.rotation ?? 0;
  if (rotation === 90) context.translate(geometry.cropHeight, 0);
  else if (rotation === 180) context.translate(geometry.cropWidth, geometry.cropHeight);
  else if (rotation === 270) context.translate(0, geometry.cropWidth);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(
    transform?.flipHorizontal ? geometry.cropWidth : 0,
    transform?.flipVertical ? geometry.cropHeight : 0,
  );
  context.scale(transform?.flipHorizontal ? -1 : 1, transform?.flipVertical ? -1 : 1);
  context.drawImage(
    image,
    geometry.cropX,
    geometry.cropY,
    geometry.cropWidth,
    geometry.cropHeight,
    0,
    0,
    geometry.cropWidth,
    geometry.cropHeight,
  );
}

function paintThemeOutline(
  context: CanvasRenderingContext2D,
  rect: Rect,
  effects: DrawingThemeEffects,
): void {
  const outlineWidth = Math.max(0, effects.outlineWidth);
  if (outlineWidth > 0) {
    context.save();
    context.lineWidth = outlineWidth;
    context.strokeStyle = "rgb(54 78 110 / 72%)";
    const inset = outlineWidth / 2;
    context.strokeRect(
      rect.x + inset,
      rect.y + inset,
      Math.max(0, rect.width - outlineWidth),
      Math.max(0, rect.height - outlineWidth),
    );
    context.restore();
  }
  if (effects.bevel) {
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = "rgb(255 255 255 / 76%)";
    context.beginPath();
    context.moveTo(rect.x + 0.5, rect.y + rect.height - 0.5);
    context.lineTo(rect.x + 0.5, rect.y + 0.5);
    context.lineTo(rect.x + rect.width - 0.5, rect.y + 0.5);
    context.stroke();
    context.strokeStyle = "rgb(0 0 0 / 40%)";
    context.beginPath();
    context.moveTo(rect.x + rect.width - 0.5, rect.y + 0.5);
    context.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height - 0.5);
    context.lineTo(rect.x + 0.5, rect.y + rect.height - 0.5);
    context.stroke();
    context.restore();
  }
}

function paintImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform: ImageTransform | undefined,
  effects: DrawingThemeEffects | undefined,
): void {
  context.save();
  if (effects?.shadow === "soft") {
    context.shadowColor = "rgb(0 0 0 / 28%)";
    context.shadowBlur = 8;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 3;
  } else if (effects?.shadow === "hard") {
    context.shadowColor = "rgb(0 0 0 / 42%)";
    context.shadowBlur = 1;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
  }
  paintImageContent(context, image, rect, transform);
  context.restore();

  if (effects?.reflection) {
    context.save();
    context.globalAlpha = 0.22;
    context.translate(0, 2 * (rect.y + rect.height));
    context.scale(1, -1);
    paintImageContent(context, image, rect, transform);
    context.restore();
  }
  if (effects) paintThemeOutline(context, rect, effects);
}

function paintPlaceholder(
  context: CanvasRenderingContext2D,
  rect: Rect,
  text: string,
  loading: boolean,
  palette: FloatingImagePaintPalette,
): void {
  context.save();
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
  context.restore();
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
): Array<FloatingImageViewportFragment & { image: FloatingImage }> {
  return images.flatMap((image) =>
    getFloatingImageViewportFragments(image, layout).map((fragment) => ({ ...fragment, image })),
  );
}

/** Paints free-floating images into the surface canvas, clipping each frozen pane. */
export function paintFloatingImages(
  context: CanvasRenderingContext2D,
  options: {
    state: FloatingImagePaintState;
    layout: SheetViewportLayout;
    assetUrls: ReadonlyMap<string, string>;
    loadingAssetIds?: ReadonlySet<string>;
    cache: FloatingImageCanvasCache;
    palette: FloatingImagePaintPalette;
    loadingLabel: string;
    unavailableLabel: string;
    effects?: DrawingThemeEffects;
  },
): void {
  const visibleUrls = new Set<string>();
  for (const fragment of getFloatingImageViewportFragmentsForPaint(
    options.state.images,
    options.layout,
  )) {
    context.save();
    const pane = options.layout.panes[fragment.paneId];
    // Effects may extend beyond the image bounds but must not cross frozen panes.
    clip(context, pane.clip);
    const url = options.assetUrls.get(fragment.image.assetId);
    if (url) visibleUrls.add(url);
    const image = url ? options.cache.get(url) : undefined;
    if (image)
      paintImage(
        context,
        image,
        fragment.rect,
        fragment.image.transform,
        hasVisibleDrawingThemeEffects(options.effects ?? options.state.effects)
          ? (options.effects ?? options.state.effects)
          : undefined,
      );
    else {
      paintPlaceholder(
        context,
        fragment.rect,
        options.loadingAssetIds?.has(fragment.image.assetId)
          ? options.loadingLabel
          : options.unavailableLabel,
        Boolean(options.loadingAssetIds?.has(fragment.image.assetId)),
        options.palette,
      );
    }
    context.restore();
  }
  options.cache.retain(visibleUrls);
}
