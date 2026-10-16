import { ImageAssetBatchError, storeImageAssetBatch } from "../image-assets/storeImageAssetBatch";
import type { Workbook } from "@sheetcraft/core/workbook";
import type { ImageAsset, ImageAssetStore } from "../image-assets/imageAssetStore";
import { inspectEncodedImageHeader } from "../image-assets/inspectEncodedImageHeader";
import { MAX_IMAGE_BYTES, prepareImageAsset } from "../image-assets/prepareImageAsset";
import { collectWorkbookImageAssetIds } from "../image-assets/useImageAssetUrls";
import { requireStandalonePicture } from "../sheet-images/picture-document-support";
import { XlsxWorkerAbortError } from "./workbookXlsxWorker";
import type { XlsxWorkerImportedImage } from "./xlsxWorkerProtocol";

export class XlsxImportImageError extends Error {
  constructor(
    readonly code: "invalid" | "storage",
    options?: ErrorOptions,
  ) {
    super(`XLSX imported images: ${code}`, options);
    this.name = "XlsxImportImageError";
  }
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new XlsxWorkerAbortError();
}

/** Decode every source before confirmation; this never writes to image storage. */
export async function prepareImportedXlsxImages(
  workbook: Workbook,
  images: readonly XlsxWorkerImportedImage[] = [],
  signal?: AbortSignal,
): Promise<readonly ImageAsset[]> {
  try {
    assertActive(signal);
    const referenced = collectWorkbookImageAssetIds(workbook);
    const provided = new Set<string>();
    for (const image of images) {
      if (
        !image ||
        typeof image.assetId !== "string" ||
        !image.assetId ||
        provided.has(image.assetId) ||
        !referenced.has(image.assetId) ||
        !(image.bytes instanceof ArrayBuffer) ||
        image.bytes.byteLength < 1 ||
        image.bytes.byteLength > MAX_IMAGE_BYTES ||
        !["png", "jpeg", "gif"].includes(image.extension)
      )
        throw new XlsxImportImageError("invalid");
      provided.add(image.assetId);
    }
    if (referenced.size !== provided.size) throw new XlsxImportImageError("invalid");
    const replacements = new Map<string, string>();
    const assets: ImageAsset[] = [];
    // Sequential decoding bounds peak pixel memory even when an archive has many pictures.
    for (const image of images) {
      assertActive(signal);
      const mimeType = `image/${image.extension}`;
      if (inspectEncodedImageHeader(new Uint8Array(image.bytes)).mimeType !== mimeType)
        throw new XlsxImportImageError("invalid");
      const asset = await prepareImageAsset(new Blob([image.bytes], { type: mimeType }), signal);
      assertActive(signal);
      if (asset.mimeType !== mimeType) throw new XlsxImportImageError("invalid");
      replacements.set(image.assetId, asset.id);
      assets.push(asset);
    }
    for (const sheet of workbook.sheets.values()) {
      if (sheet.pageDecoration?.backgroundAssetId)
        sheet.pageDecoration.backgroundAssetId = replacements.get(
          sheet.pageDecoration.backgroundAssetId,
        )!;
      for (const root of sheet.floatingImages) {
        const image = requireStandalonePicture(root);
        image.assetId = replacements.get(image.assetId)!;
      }
    }
    const resolved = new Set(assets.map((asset) => asset.id));
    if ([...collectWorkbookImageAssetIds(workbook)].some((id) => !resolved.has(id)))
      throw new XlsxImportImageError("invalid");
    return assets;
  } catch (cause) {
    assertActive(signal);
    if (cause instanceof XlsxImportImageError) throw cause;
    throw new XlsxImportImageError("invalid", { cause });
  }
}

/** Existing content-addressed assets are never overwritten; new assets commit as one batch. */
export async function storeImportedXlsxImages(
  assets: readonly ImageAsset[],
  store?: ImageAssetStore,
  signal?: AbortSignal,
): Promise<void> {
  try {
    assertActive(signal);
    await storeImageAssetBatch(assets, store, signal);
    assertActive(signal);
  } catch (cause) {
    assertActive(signal);
    if (cause instanceof XlsxImportImageError) throw cause;
    throw new XlsxImportImageError(cause instanceof ImageAssetBatchError ? cause.code : "storage", {
      cause,
    });
  }
}
