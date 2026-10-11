import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { formatFormulaAddress } from "@sheetcraft/core/formula";
import { requireLegacyPicture } from "../sheet-images/picture-document-support";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { XlsxWorkerFailure } from "./workbookXlsxWorker";
import { deserializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import {
  getWorkbookSheets,
  normalizeImageTransform,
  type ImageTransform,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { ImageAsset, ImageAssetStore } from "../image-assets/imageAssetStore";
import { paintImagePresentation } from "../../shared/images/imageAppearance";
import { getImagePresentation } from "../../shared/images/imagePresentation";
import type { XlsxWorkerImage } from "./xlsxWorkerProtocol";

const MAX_RENDER_SIDE = 4096;
const MAX_RENDER_PIXELS = 16 * 1024 * 1024;

type ImageReference = Readonly<{ assetId: string; transform?: ImageTransform }>;
type EncodedImage = "png" | "jpeg" | "gif";

function abortError(): Error {
  const error = new Error("XLSX image preparation was cancelled.");
  error.name = "AbortError";
  return error;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  assertNotAborted(signal);
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (cause) => {
        cleanup();
        reject(cause);
      },
    );
  });
}

function imageKey(assetId: string, transform: ImageTransform | undefined): string {
  return JSON.stringify([assetId, normalizeImageTransform(transform) ?? null]);
}

function extensionFor(mimeType: string): EncodedImage | undefined {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/gif") return "gif";
  return undefined;
}

export function assertXlsxPictureGeometrySupport(workbook: Workbook): void {
  const assertAppearance = (transform: ImageTransform | undefined, ownerLocation: string): void => {
    if (
      !transform?.appearance ||
      (!Object.hasOwn(transform.appearance, "suppressThemeEffects") &&
        !Object.hasOwn(transform.appearance, "detailedStyle"))
    )
      return;
    const field = Object.hasOwn(transform.appearance, "detailedStyle")
      ? "detailedStyle"
      : "suppressThemeEffects";
    const location = `${ownerLocation}.transform.appearance.${field}`;
    throw new XlsxWorkerFailure(
      `Picture ${field === "detailedStyle" ? "detailed styling" : "theme-effect suppression"} is not yet supported by XLSX export at ${location}.`,
      {
        issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [location] }],
      },
    );
  };
  for (const sheet of getWorkbookSheets(workbook)) {
    for (const image of sheet.floatingImages) {
      if (isFramedPictureObject(image) || isPictureGroup(image)) {
        const location = `${sheet.name}.floatingImages[${JSON.stringify(image.id)}].frame`;
        throw new XlsxWorkerFailure(
          `Frame-aware pictures and owned groups are not yet supported by XLSX export at ${location}.`,
          {
            issues: [
              { code: "feature-omitted", severity: "block", count: 1, locations: [location] },
            ],
          },
        );
      }
      assertAppearance(
        image.transform,
        `${sheet.name}.floatingImages[${JSON.stringify(image.id)}]`,
      );
    }
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "image") continue;
      const [row, column] = key.split(":").map(Number);
      if (row === undefined || column === undefined) continue;
      assertAppearance(
        cell.content.image.transform,
        `${sheet.name}!${formatFormulaAddress({ row, column })}`,
      );
    }
  }
}

function collectImageReferences(snapshot: WorkbookSnapshot): readonly ImageReference[] {
  const workbook = deserializeWorkbook(snapshot);
  assertXlsxPictureGeometrySupport(workbook);
  const references: ImageReference[] = [];
  for (const sheet of getWorkbookSheets(workbook)) {
    if (sheet.pageDecoration?.backgroundAssetId)
      references.push({ assetId: sheet.pageDecoration.backgroundAssetId });
    for (const cell of sheet.cells.values()) {
      if (cell.content?.kind !== "image") continue;
      references.push({
        assetId: cell.content.image.assetId,
        transform: normalizeImageTransform(cell.content.image.transform),
      });
    }
    for (const root of sheet.floatingImages) {
      const image = requireLegacyPicture(root);
      references.push({
        assetId: image.assetId,
        transform: normalizeImageTransform(image.transform),
      });
    }
  }
  return references;
}

function renderSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    MAX_RENDER_SIDE / width,
    MAX_RENDER_SIDE / height,
    Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

async function loadImage(blob: Blob, signal: AbortSignal | undefined): Promise<HTMLImageElement> {
  assertNotAborted(signal);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        image.onload = null;
        image.onerror = null;
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onAbort = () =>
        finish(() => {
          image.src = "";
          reject(abortError());
        });
      image.onload = () => finish(() => resolve(image));
      image.onerror = () => finish(() => reject(new Error("Could not decode XLSX image asset.")));
      signal?.addEventListener("abort", onAbort, { once: true });
      image.src = url;
      if (signal?.aborted) onAbort();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, signal: AbortSignal | undefined): Promise<Blob> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      try {
        assertNotAborted(signal);
        if (!blob) throw new Error("Could not rasterize XLSX image asset.");
        resolve(blob);
      } catch (cause) {
        reject(cause);
      }
    }, "image/png");
  });
}

async function rasterize(
  asset: ImageAsset,
  transform: ImageTransform | undefined,
  signal: AbortSignal | undefined,
): Promise<Pick<XlsxWorkerImage, "bytes" | "extension" | "width" | "height">> {
  const image = await loadImage(asset.blob, signal);
  assertNotAborted(signal);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (sourceWidth < 1 || sourceHeight < 1)
    throw new Error("XLSX image asset has invalid dimensions.");
  const normalized = normalizeImageTransform(transform);
  const presentation = getImagePresentation(normalized, sourceWidth, sourceHeight);
  const output = renderSize(presentation.width, presentation.height);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable for XLSX image export.");
    paintImagePresentation(
      context,
      image,
      { x: 0, y: 0, width: output.width, height: output.height },
      normalized,
    );
    const blob = await abortable(canvasBlob(canvas, signal), signal);
    return {
      bytes: await abortable(blob.arrayBuffer(), signal),
      extension: "png",
      width: output.width,
      height: output.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function prepareVariant(
  asset: ImageAsset,
  transform: ImageTransform | undefined,
  signal: AbortSignal | undefined,
): Promise<Pick<XlsxWorkerImage, "bytes" | "extension" | "width" | "height">> {
  const extension = extensionFor(asset.mimeType);
  if (extension && !transform) {
    assertNotAborted(signal);
    return {
      bytes: await abortable(asset.blob.arrayBuffer(), signal),
      extension,
      width: asset.width,
      height: asset.height,
    };
  }
  return rasterize(asset, transform, signal);
}

/** Prepares the immutable snapshot's image variants for transfer to the XLSX worker. */
export async function prepareXlsxImages(
  snapshot: WorkbookSnapshot,
  assetStore: ImageAssetStore | undefined,
  signal?: AbortSignal,
): Promise<readonly XlsxWorkerImage[]> {
  assertNotAborted(signal);
  const references = collectImageReferences(snapshot);
  if (references.length === 0) return [];
  if (!assetStore) throw new Error("XLSX export cannot read image assets.");
  const variants = new Map<string, ImageReference>();
  for (const reference of references) {
    const key = imageKey(reference.assetId, reference.transform);
    if (!variants.has(key)) variants.set(key, reference);
  }
  const assets = new Map<string, ImageAsset>();
  const result: XlsxWorkerImage[] = [];
  for (const reference of variants.values()) {
    assertNotAborted(signal);
    let asset = assets.get(reference.assetId);
    if (!asset) {
      asset = await abortable(assetStore.get(reference.assetId), signal);
      if (!asset) throw new Error(`XLSX export is missing image asset ${reference.assetId}.`);
      assets.set(reference.assetId, asset);
    }
    const prepared = await prepareVariant(asset, reference.transform, signal);
    result.push({
      assetId: reference.assetId,
      ...(reference.transform ? { transform: reference.transform } : {}),
      ...prepared,
    });
  }
  return result;
}
