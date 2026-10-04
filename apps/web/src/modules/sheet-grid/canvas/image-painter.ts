import type { ImageTransform } from "@idea10/core/workbook";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { getImagePresentation } from "../../../shared/images/imagePresentation";

/** Decoded sources belong to the viewport, not to individual cell components. */
export function createCanvasImageCache(onChange: () => void) {
  const images = new Map<string, HTMLImageElement>();
  function source(url: string): HTMLImageElement {
    let image = images.get(url);
    if (!image) {
      image = new Image();
      image.onload = onChange;
      image.onerror = onChange;
      images.set(url, image);
      image.src = url;
    }
    return image;
  }
  function get(url: string): HTMLImageElement | undefined {
    const image = source(url);
    return image.complete && image.naturalWidth > 0 ? image : undefined;
  }
  async function load(url: string): Promise<void> {
    const image = source(url);
    await image.decode();
  }
  function retain(urls: ReadonlySet<string>): void {
    for (const [url, image] of images) {
      if (urls.has(url)) continue;
      image.onload = image.onerror = null;
      images.delete(url);
    }
  }
  return { get, load, retain, dispose: () => retain(new Set()) };
}

export type CanvasImageCache = ReturnType<typeof createCanvasImageCache>;

export function paintCellImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform?: ImageTransform,
): void {
  const geometry = getImagePresentation(transform, image.naturalWidth, image.naturalHeight);
  const scale = Math.min(
    Math.max(0, rect.width - 5) / geometry.width,
    Math.max(0, rect.height - 5) / geometry.height,
  );
  context.save();
  context.translate(
    rect.x + (rect.width - 1 - geometry.width * scale) / 2,
    rect.y + (rect.height - 1 - geometry.height * scale) / 2,
  );
  context.scale(scale, scale);
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
  context.restore();
}
