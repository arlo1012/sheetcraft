import type { ImageTransform } from "@sheetcraft/core/workbook";
import {
  getImagePresentation,
  type ImagePresentation as SheetImagePresentation,
} from "../../../shared/images/imagePresentation";

export type { SheetImagePresentation };

export const getSheetImagePresentation = getImagePresentation;

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** Reads a local asset URL as inline source data for an SVG viewer document. */
export async function readImageSourceAsDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not read image preview source.");
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/** Creates an SVG viewer document without rasterizing or replacing the original image asset. */
export function createSheetImagePresentationSvg(
  source: string,
  transform: ImageTransform | undefined,
  naturalWidth: number,
  naturalHeight: number,
): string {
  const presentation = getSheetImagePresentation(transform, naturalWidth, naturalHeight);
  const rotationAttribute = presentation.rotationTransform
    ? ` transform="${presentation.rotationTransform}"`
    : "";
  const flipAttribute = presentation.flipTransform
    ? ` transform="${presentation.flipTransform}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${presentation.width}" height="${presentation.height}" viewBox="${presentation.viewBox}"><defs><clipPath id="crop"><rect width="${presentation.cropWidth}" height="${presentation.cropHeight}"/></clipPath></defs><g${rotationAttribute}><g${flipAttribute}><g clip-path="url(#crop)"><image href="${escapeAttribute(source)}" x="${-presentation.cropX}" y="${-presentation.cropY}" width="${naturalWidth}" height="${naturalHeight}" preserveAspectRatio="none"/></g></g></g></svg>`;
}

export function createSheetImagePresentationBlobUrl(
  source: string,
  transform: ImageTransform | undefined,
  naturalWidth: number,
  naturalHeight: number,
): string {
  return URL.createObjectURL(
    new Blob([createSheetImagePresentationSvg(source, transform, naturalWidth, naturalHeight)], {
      type: "image/svg+xml",
    }),
  );
}
