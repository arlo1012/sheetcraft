import type { ImageTransform } from "@sheetcraft/core/workbook";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import type { PicturePaintResources } from "../../../shared/images/picture-detailed-render";
import { getImagePresentation } from "../../../shared/images/imagePresentation";

/** Decoded sources belong to the viewport, not to individual cell components. */
export function createCanvasImageCache(onChange: () => void): CanvasImageCache {
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
  const peek = (url: string): HTMLImageElement | undefined => {
    const image = images.get(url);
    return image?.complete && image.naturalWidth > 0 ? image : undefined;
  };
  const state = (url: string): "loading" | "ready" | "error" | undefined => {
    const image = images.get(url);
    if (!image) return;
    return !image.complete ? "loading" : image.naturalWidth > 0 ? "ready" : "error";
  };
  return { get, peek, state, load, retain, dispose: () => retain(new Set()) };
}

export type CanvasImageCache = {
  get: (url: string) => HTMLImageElement | undefined;
  peek?: (url: string) => HTMLImageElement | undefined;
  state?: (url: string) => "loading" | "ready" | "error" | undefined;
  load: (url: string) => Promise<void>;
  retain: (urls: ReadonlySet<string>) => void;
  dispose: () => void;
};

export function paintCellImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform?: ImageTransform,
  resources?: PicturePaintResources,
): void {
  const geometry = getImagePresentation(transform, image.naturalWidth, image.naturalHeight);
  const scale = Math.min(
    Math.max(0, rect.width - 5) / geometry.width,
    Math.max(0, rect.height - 5) / geometry.height,
  );
  paintImagePresentation(
    context,
    image,
    {
      x: rect.x + (rect.width - 1 - geometry.width * scale) / 2,
      y: rect.y + (rect.height - 1 - geometry.height * scale) / 2,
      width: geometry.width * scale,
      height: geometry.height * scale,
    },
    transform,
    { resources },
  );
}
