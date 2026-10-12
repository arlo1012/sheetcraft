import type { ImageTransform } from "@sheetcraft/core/workbook";
import { isFramedCellImage, type CellImage } from "@sheetcraft/core/cell-picture-frame";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import {
  getPicturePaintDensity,
  type PicturePaintResources,
} from "../../../shared/images/picture-detailed-render";
import { getImagePresentation } from "../../../shared/images/imagePresentation";
import { captureCellPictureSourcePresentation } from "../../sheet-images/cell-picture-presentation";
import { planPictureSourcePresentation } from "../../sheet-images/picture-source-presentation";
import { paintFramedPictureContent } from "../../sheet-images/framed-picture-painter";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";

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
  cellImage?: CellImage,
): void {
  if (cellImage && isFramedCellImage(cellImage)) {
    const input = captureCellPictureSourcePresentation(cellImage);
    const viewportDensity = getPicturePaintDensity(context);
    const width = Math.max(0, rect.width - 10),
      height = Math.max(0, rect.height - 10);
    if (!width || !height) return;
    let plan = planPictureSourcePresentation(input, resources?.theme, resources),
      scale = Math.min(width / plan.bounds.width, height / plan.bounds.height);
    // Detailed raster bounds can include density-dependent reconstruction pixels.
    // Replan at the actual viewport density before containment, without decoding
    // or allocating a presentation canvas. The leaf painter owns raster caching.
    for (let iteration = 0; iteration < 4; iteration++) {
      plan = planPictureSourcePresentation(
        input,
        resources?.theme,
        resources,
        4096,
        Math.min(64, viewportDensity * scale),
      );
      // Native Canvas shadows are physical pixels, unaffected by our local scale.
      const padding = plan.padding / viewportDensity;
      const contained = Math.min(
        Math.max(0, width - padding * 2) / plan.bounds.width,
        Math.max(0, height - padding * 2) / plan.bounds.height,
      );
      if (contained <= 0) return;
      if (contained >= scale) break;
      scale = contained;
    }
    const { bounds, presentation, inherited } = plan;
    if (isGroupedPicture(presentation.picture))
      throw new TypeError("Cell picture presentation requires a local framed source.");
    context.save();
    try {
      context.translate(
        rect.x + rect.width / 2 - (bounds.x + bounds.width / 2) * scale,
        rect.y + rect.height / 2 - (bounds.y + bounds.height / 2) * scale,
      );
      context.scale(scale, scale);
      paintFramedPictureContent(
        context,
        image,
        presentation.picture,
        presentation.geometry,
        inherited,
        resources,
      );
    } finally {
      context.restore();
    }
    return;
  }
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
