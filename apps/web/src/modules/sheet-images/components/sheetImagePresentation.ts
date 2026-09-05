import { normalizeImageTransform, type ImageTransform } from "@idea10/core/workbook";

export type SheetImagePresentation = {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  width: number;
  height: number;
  viewBox: string;
  rotationTransform?: string;
};

export function getSheetImagePresentation(
  transform: ImageTransform | undefined,
  naturalWidth: number,
  naturalHeight: number,
): SheetImagePresentation {
  const normalized = normalizeImageTransform(transform);
  const crop = normalized?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const rotation = normalized?.rotation ?? 0;
  const cropWidth = naturalWidth * crop.width;
  const cropHeight = naturalHeight * crop.height;
  const rotated = rotation === 90 || rotation === 270;
  const rotationTransform =
    rotation === 90
      ? `translate(${cropHeight} 0) rotate(90)`
      : rotation === 180
        ? `translate(${cropWidth} ${cropHeight}) rotate(180)`
        : rotation === 270
          ? `translate(0 ${cropWidth}) rotate(270)`
          : undefined;
  return {
    cropX: naturalWidth * crop.x,
    cropY: naturalHeight * crop.y,
    cropWidth,
    cropHeight,
    width: rotated ? cropHeight : cropWidth,
    height: rotated ? cropWidth : cropHeight,
    viewBox: rotated ? `0 0 ${cropHeight} ${cropWidth}` : `0 0 ${cropWidth} ${cropHeight}`,
    rotationTransform,
  };
}

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
  const transformAttribute = presentation.rotationTransform
    ? ` transform="${presentation.rotationTransform}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${presentation.width}" height="${presentation.height}" viewBox="${presentation.viewBox}"><defs><clipPath id="crop"><rect width="${presentation.cropWidth}" height="${presentation.cropHeight}"/></clipPath></defs><g${transformAttribute}><g clip-path="url(#crop)"><image href="${escapeAttribute(source)}" x="${-presentation.cropX}" y="${-presentation.cropY}" width="${naturalWidth}" height="${naturalHeight}" preserveAspectRatio="none"/></g></g></svg>`;
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
