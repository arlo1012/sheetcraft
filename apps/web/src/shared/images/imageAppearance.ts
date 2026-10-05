import { paintImageAnnotations } from "./imageAnnotations";
import type { ImageAppearance, ImageTransform } from "@idea10/core/workbook";
import { getImagePresentation } from "./imagePresentation";

type Rect = { x: number; y: number; width: number; height: number };
const transparentSources = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

export function imageAppearanceFilter(appearance?: ImageAppearance): string {
  if (!appearance) return "none";
  const filters: string[] = [];
  for (const [key, css, initial] of [
    ["brightness", "brightness", 1],
    ["contrast", "contrast", 1],
    ["saturation", "saturate", 1],
    ["grayscale", "grayscale", 0],
    ["sepia", "sepia", 0],
  ] as const) {
    if (appearance[key] !== undefined && appearance[key] !== initial)
      filters.push(`${css}(${appearance[key]})`);
  }
  return filters.join(" ") || "none";
}

/** Cache transparent-color variants by decoded source; releasing the source releases its variants. */
export function imageAppearanceSource(
  image: HTMLImageElement,
  appearance?: ImageAppearance,
): HTMLImageElement | HTMLCanvasElement {
  if (!appearance?.transparentColor) return image;
  const key = `${appearance.transparentColor}:${appearance.transparentTolerance ?? 0}`;
  let variants = transparentSources.get(image);
  const existing = variants?.get(key);
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 4096 / image.naturalWidth, 4096 / image.naturalHeight);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image processing is unavailable.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const color = appearance.transparentColor;
  const channels = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  const tolerance = appearance.transparentTolerance ?? 0;
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (
      channels.every(
        (channel, offset) => Math.abs(pixels.data[index + offset]! - channel) <= tolerance,
      )
    )
      pixels.data[index + 3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  if (!variants) {
    variants = new Map();
    transparentSources.set(image, variants);
  }
  // A color picker can create many transient values; retain only the most recent variants.
  if (variants.size >= 4) variants.delete(variants.keys().next().value!);
  variants.set(key, canvas);
  return canvas;
}

/** One rendering path for worksheet, print, and exported picture pixels. */
export function paintImagePresentation(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  transform?: ImageTransform,
): void {
  const appearance = transform?.appearance;
  if (appearance?.reflection) rect = { ...rect, height: rect.height / 1.25 };
  const source = imageAppearanceSource(image, appearance);
  const sourceWidth = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  const geometry = getImagePresentation(transform, sourceWidth, sourceHeight);
  if (geometry.width <= 0 || geometry.height <= 0) return;
  const draw = () => {
    context.save();
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
      source,
      geometry.cropX,
      geometry.cropY,
      geometry.cropWidth,
      geometry.cropHeight,
      0,
      0,
      geometry.cropWidth,
      geometry.cropHeight,
    );
    if (transform?.annotations?.length) {
      context.beginPath();
      context.rect(0, 0, geometry.cropWidth, geometry.cropHeight);
      context.clip();
      context.translate(-geometry.cropX, -geometry.cropY);
      paintImageAnnotations(context, transform.annotations, sourceWidth, sourceHeight);
    }
    context.restore();
  };
  context.save();
  context.globalAlpha *= appearance?.opacity ?? 1;
  context.filter = imageAppearanceFilter(appearance);
  if (appearance?.shadow) {
    context.shadowColor = "rgb(0 0 0 / 35%)";
    context.shadowBlur = appearance.shadow === "soft" ? 8 : 1;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
  }
  draw();
  context.shadowColor = "transparent";
  if (appearance?.reflection) {
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y + rect.height, rect.width, rect.height * 0.25);
    context.clip();
    context.globalAlpha *= 0.22;
    context.translate(0, 2 * (rect.y + rect.height));
    context.scale(1, -1);
    draw();
    context.restore();
  }
  if (appearance?.border) {
    const width = Math.min(appearance.border.width, rect.width, rect.height);
    context.filter = "none";
    context.lineWidth = width;
    context.strokeStyle = appearance.border.color;
    context.strokeRect(
      rect.x + width / 2,
      rect.y + width / 2,
      rect.width - width,
      rect.height - width,
    );
  }
  context.restore();
}

export function createPictureCanvas(
  image: HTMLImageElement,
  transform?: ImageTransform,
  maxSide = 4096,
): HTMLCanvasElement {
  const geometry = getImagePresentation(transform, image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maxSide / geometry.width, maxSide / geometry.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(geometry.width * scale));
  canvas.height = Math.max(1, Math.round(geometry.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image rendering is unavailable.");
  paintImagePresentation(
    context,
    image,
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    transform,
  );
  return canvas;
}
