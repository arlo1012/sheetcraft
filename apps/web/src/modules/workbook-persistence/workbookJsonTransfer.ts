import { isPictureGroup, traversePictureGroup } from "@sheetcraft/core/picture-group";
import { ImageAssetBatchError, storeImageAssetBatch } from "../image-assets/storeImageAssetBatch";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import {
  assertWorkbookShapeSupport,
  UnsupportedShapeFrameDocumentError,
} from "../sheet-drawings/shape-document-support";
import {
  assertExternalPictureGroupSupport,
  UnsupportedPictureDocumentError,
} from "../sheet-images/picture-document-support";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import type { Workbook } from "@sheetcraft/core/workbook";
import { isShapeGroupDrawing, traverseShapeGroup } from "@sheetcraft/core/shape-group";
import { prepareImageAsset, MAX_IMAGE_BYTES } from "../image-assets/prepareImageAsset";
import { collectWorkbookImageAssetIds } from "../image-assets/useImageAssetUrls";
import type { ImageAsset, ImageAssetStore } from "../image-assets/imageAssetStore";

export type WorkbookFileErrorCode =
  | "invalid-json"
  | "invalid-snapshot"
  | "unsupported-picture-frame"
  | "unsupported-shape-frame"
  | "read-failed"
  | "invalid-images"
  | "missing-image"
  | "image-storage-unavailable"
  | "image-read-failed"
  | "download-failed";

export class WorkbookFileError extends Error {
  readonly code: WorkbookFileErrorCode;
  constructor(code: WorkbookFileErrorCode, options?: ErrorOptions) {
    super(`Workbook file: ${code}`, options);
    this.name = "WorkbookFileError";
    this.code = code;
  }
}

export function parseWorkbookJson(text: string): Workbook {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new WorkbookFileError("invalid-json", { cause: error });
  }
  try {
    const workbook = deserializeWorkbook(value);
    assertWorkbookShapeSupport(workbook);
    assertExternalPictureGroupSupport(workbook);
    return workbook;
  } catch (error) {
    throw new WorkbookFileError(
      error instanceof UnsupportedShapeFrameDocumentError
        ? "unsupported-shape-frame"
        : error instanceof UnsupportedPictureDocumentError
          ? "unsupported-picture-frame"
          : "invalid-snapshot",
      { cause: error },
    );
  }
}

export async function readWorkbookFile(file: Pick<File, "text">): Promise<Workbook> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new WorkbookFileError("read-failed", { cause: error });
  }
  return parseWorkbookJson(text);
}

type PortableImage = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  data: string;
};
type PortableEnvelope = {
  format: "sheetcraft-workbook";
  version: 1;
  snapshot: unknown;
  images: PortableImage[];
};

function toBase64(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
function fromBase64(data: string): Uint8Array {
  // Reject oversized encoded payloads before atob makes a second large allocation.
  if (data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4)
    throw new WorkbookFileError("invalid-images");
  try {
    const raw = atob(data);
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES)
      throw new WorkbookFileError("invalid-images");
    return bytes;
  } catch (error) {
    if (error instanceof WorkbookFileError) throw error;
    throw new WorkbookFileError("invalid-images", { cause: error });
  }
}
function isEnvelope(value: unknown): value is PortableEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { format?: unknown }).format === "sheetcraft-workbook"
  );
}

function rewriteImageReferences(workbook: Workbook, ids: ReadonlyMap<string, string>): void {
  function rewriteStyle(style: Pick<PictureDetailedStyle, "fill" | "line"> | undefined): void {
    const fill = style?.fill;
    if (fill?.kind === "value" && fill.value.kind === "picture")
      fill.value.assetId = ids.get(fill.value.assetId) ?? fill.value.assetId;
    const line = style?.line;
    if (line?.kind === "value" && line.value.paint.kind === "picture")
      line.value.paint.assetId = ids.get(line.value.paint.assetId) ?? line.value.paint.assetId;
  }
  for (const preset of workbook.watermarkPresets ?? []) {
    const image = preset.watermark.image;
    if (image) image.assetId = ids.get(image.assetId) ?? image.assetId;
  }
  for (const sheet of workbook.sheets.values()) {
    if (sheet.pageDecoration?.backgroundAssetId)
      sheet.pageDecoration.backgroundAssetId =
        ids.get(sheet.pageDecoration.backgroundAssetId) ?? sheet.pageDecoration.backgroundAssetId;
    const watermarkImage = sheet.pageDecoration?.watermark?.image;
    if (watermarkImage)
      watermarkImage.assetId = ids.get(watermarkImage.assetId) ?? watermarkImage.assetId;
    // Shape paint owns validated image assets just as cell and floating pictures do.
    for (const root of sheet.drawings ?? []) {
      const leaves = isShapeGroupDrawing(root)
        ? traverseShapeGroup(root).map(({ node }) => node)
        : [root];
      for (const drawing of leaves) {
        if (drawing.kind !== "shape" && drawing.kind !== "textBox") continue;
        rewriteStyle(drawing.shapeStyle);
        rewriteStyle(drawing.shapeText?.style);
        for (const run of drawing.shapeText?.characterRuns ?? []) rewriteStyle(run);
      }
    }
    for (const cell of sheet.cells.values()) {
      if (cell.content?.kind === "image") {
        cell.content.image.assetId =
          ids.get(cell.content.image.assetId) ?? cell.content.image.assetId;
        rewriteStyle(cell.content.image.transform?.appearance?.detailedStyle);
      }
    }
    for (const root of sheet.floatingImages) {
      const leaves = isPictureGroup(root)
        ? traversePictureGroup(root).flatMap(({ node }) =>
            node.kind === "grouped-picture-v1" ? [node] : [],
          )
        : [root];
      for (const image of leaves) {
        image.assetId = ids.get(image.assetId) ?? image.assetId;
        rewriteStyle(image.transform?.appearance?.detailedStyle);
      }
    }
  }
}

export async function readWorkbookBundleFile(
  file: Pick<File, "text">,
  assetStore: ImageAssetStore,
): Promise<Workbook> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new WorkbookFileError("read-failed", { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new WorkbookFileError("invalid-json", { cause: error });
  }
  if (!isEnvelope(value)) {
    const workbook = parseWorkbookJson(text);
    if (collectWorkbookImageAssetIds(workbook).size) throw new WorkbookFileError("missing-image");
    return workbook;
  }
  if (value.version !== 1 || !Array.isArray(value.images))
    throw new WorkbookFileError("invalid-images");
  let workbook: Workbook;
  try {
    workbook = deserializeWorkbook(value.snapshot);
  } catch (error) {
    throw new WorkbookFileError("invalid-snapshot", { cause: error });
  }
  try {
    assertWorkbookShapeSupport(workbook);
    assertExternalPictureGroupSupport(workbook);
  } catch (error) {
    throw new WorkbookFileError(
      error instanceof UnsupportedShapeFrameDocumentError
        ? "unsupported-shape-frame"
        : error instanceof UnsupportedPictureDocumentError
          ? "unsupported-picture-frame"
          : "invalid-snapshot",
      { cause: error },
    );
  }
  const referencedIds = collectWorkbookImageAssetIds(workbook);
  const provided = new Map<string, PortableImage>();
  for (const image of value.images) {
    if (
      !image ||
      typeof image.id !== "string" ||
      !image.id ||
      typeof image.mimeType !== "string" ||
      !Number.isSafeInteger(image.width) ||
      image.width < 1 ||
      !Number.isSafeInteger(image.height) ||
      image.height < 1 ||
      typeof image.data !== "string" ||
      provided.has(image.id)
    )
      throw new WorkbookFileError("invalid-images");
    provided.set(image.id, image);
  }
  if ([...referencedIds].some((id) => !provided.has(id)))
    throw new WorkbookFileError("missing-image");
  let assets: Array<{ sourceId: string; asset: ImageAsset }>;
  try {
    assets = [];
    // Bound peak decoder memory while retaining the original encoded bytes.
    for (const image of provided.values()) {
      assets.push({
        sourceId: image.id,
        // Envelope MIME and dimensions are descriptive only. The bytes determine the asset.
        asset: await prepareImageAsset(new Blob([fromBase64(image.data).buffer as ArrayBuffer])),
      });
    }
  } catch (error) {
    if (error instanceof WorkbookFileError) throw error;
    throw new WorkbookFileError("invalid-images", { cause: error });
  }
  const replacements = new Map(assets.map(({ sourceId, asset }) => [sourceId, asset.id]));
  rewriteImageReferences(workbook, replacements);
  assertWorkbookShapeSupport(workbook);
  assertExternalPictureGroupSupport(workbook);
  const importedIds = new Set(assets.map(({ asset }) => asset.id));
  if ([...collectWorkbookImageAssetIds(workbook)].some((id) => !importedIds.has(id)))
    throw new WorkbookFileError("missing-image");
  try {
    await storeImageAssetBatch(
      assets.map(({ asset }) => asset),
      assetStore,
    );
  } catch (error) {
    throw new WorkbookFileError(
      error instanceof ImageAssetBatchError && error.code === "invalid"
        ? "invalid-images"
        : "image-storage-unavailable",
      { cause: error },
    );
  }
  return workbook;
}

function downloadJsonBlob(blob: Blob): void {
  let url: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(blob);
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sheetcraft-workbook.json";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
  } catch (error) {
    throw new WorkbookFileError("download-failed", { cause: error });
  } finally {
    anchor?.remove();
    if (url !== undefined) {
      const downloadUrl = url;
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    }
  }
}

export function downloadWorkbookJson(workbook: Workbook): void {
  assertWorkbookShapeSupport(workbook);
  assertExternalPictureGroupSupport(workbook);
  const blob = new Blob([JSON.stringify(serializeWorkbook(workbook), null, 2)], {
    type: "application/json",
  });
  downloadJsonBlob(blob);
}

export async function downloadWorkbookBundle(
  workbook: Workbook,
  assetStore: ImageAssetStore,
): Promise<void> {
  assertWorkbookShapeSupport(workbook);
  assertExternalPictureGroupSupport(workbook);
  // Snapshot first so async asset reads cannot combine a later document with earlier image IDs.
  const snapshot = serializeWorkbook(workbook);
  const ids = collectWorkbookImageAssetIds(deserializeWorkbook(snapshot));
  if (ids.size === 0) return downloadWorkbookJson(workbook);
  const images: PortableImage[] = [];
  for (const id of ids) {
    let asset: ImageAsset | undefined;
    try {
      asset = await assetStore.get(id);
    } catch (error) {
      throw new WorkbookFileError("image-storage-unavailable", { cause: error });
    }
    if (!asset) throw new WorkbookFileError("missing-image");
    let data: string;
    try {
      data = toBase64(new Uint8Array(await asset.blob.arrayBuffer()));
    } catch (error) {
      throw new WorkbookFileError("image-read-failed", { cause: error });
    }
    images.push({
      id,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      data,
    });
  }
  const blob = new Blob(
    [JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images }, null, 2)],
    { type: "application/json" },
  );
  downloadJsonBlob(blob);
}
