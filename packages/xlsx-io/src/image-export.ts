import type { CellImage } from "@idea10/core/formula";
import {
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getDefaultColumnWidth,
  normalizeImageTransform,
  type FloatingImage,
  type Sheet,
} from "@idea10/core/workbook";
import type { XlsxEncodeOptions, XlsxImageAsset } from "./types.js";

const EMU_PER_PIXEL = 9525;

type XlsxImageCellPosition = {
  nativeCol: number;
  nativeColOff: number;
  nativeRow: number;
  nativeRowOff: number;
};

export type XlsxImageAnchor = {
  tl: XlsxImageCellPosition;
  ext: { width: number; height: number };
};

export type XlsxImageWorksheet = {
  addImage: (imageId: number, range: XlsxImageAnchor) => void;
};

export type XlsxImageWorkbook = {
  addImage: (image: { buffer: Uint8Array; extension: "png" | "jpeg" | "gif" }) => number;
};

function imageAssetKey(assetId: string, transform: XlsxImageAsset["transform"]): string {
  return JSON.stringify([assetId, normalizeImageTransform(transform) ?? null]);
}

function imageAssetsByKey(
  options: XlsxEncodeOptions | undefined,
): ReadonlyMap<string, XlsxImageAsset> {
  const assets = new Map<string, XlsxImageAsset>();
  for (const asset of options?.images ?? []) {
    const key = imageAssetKey(asset.assetId, asset.transform);
    if (!assets.has(key)) assets.set(key, asset);
  }
  return assets;
}

function imageAnchor(
  sheet: Sheet,
  row: number,
  column: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): XlsxImageAnchor {
  const startColumn = advanceAxis(
    column,
    offsetX,
    0,
    (index) =>
      sheet.hiddenColumns?.has(index)
        ? 0
        : (sheet.columnWidths.get(index) ?? getDefaultColumnWidth(sheet)),
    MAX_SHEET_COLUMNS,
  );
  const startRow = advanceAxis(
    row,
    offsetY,
    0,
    (index) =>
      sheet.hiddenRows?.has(index) ? 0 : (sheet.rowHeights.get(index) ?? DEFAULT_ROW_HEIGHT),
    MAX_SHEET_ROWS,
  );
  // Store physical size, not a second grid-dependent endpoint. The finalizer
  // removes ExcelJS 4.4's invalid editAs attribute from this oneCellAnchor.
  return {
    tl: {
      nativeCol: startColumn.index,
      nativeColOff: Math.round(startColumn.offset * EMU_PER_PIXEL),
      nativeRow: startRow.index,
      nativeRowOff: Math.round(startRow.offset * EMU_PER_PIXEL),
    },
    ext: { width, height },
  };
}

function advanceAxis(
  index: number,
  offset: number,
  length: number,
  sizeAt: (index: number) => number,
  limit: number,
): { index: number; offset: number } {
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(length) || length < 0)
    throw new Error("Invalid XLSX image anchor.");
  let nextIndex = index;
  let nextOffset = offset + length;
  while (nextOffset >= sizeAt(nextIndex)) {
    const size = sizeAt(nextIndex);
    nextOffset -= size;
    nextIndex += 1;
    if (nextIndex >= limit) throw new RangeError("The XLSX image exceeds sheet bounds.");
  }
  return { index: nextIndex, offset: nextOffset };
}

export function createXlsxImageExporter(
  target: XlsxImageWorkbook,
  options: XlsxEncodeOptions | undefined,
) {
  const assets = imageAssetsByKey(options);
  const excelImageIds = new Map<string, number>();

  function requireAsset(
    assetId: string,
    transform: XlsxImageAsset["transform"],
    issueLocation: string,
  ): XlsxImageAsset {
    const asset = assets.get(imageAssetKey(assetId, transform));
    if (!asset) throw new Error(`Missing XLSX image resource for ${issueLocation}.`);
    return asset;
  }

  function addAsset(asset: XlsxImageAsset): number {
    const key = imageAssetKey(asset.assetId, asset.transform);
    const existing = excelImageIds.get(key);
    if (existing !== undefined) return existing;
    if (
      !Number.isFinite(asset.width) ||
      asset.width <= 0 ||
      !Number.isFinite(asset.height) ||
      asset.height <= 0
    )
      throw new Error(`Invalid XLSX image dimensions for asset ${asset.assetId}.`);
    const imageId = target.addImage({ buffer: asset.bytes, extension: asset.extension });
    excelImageIds.set(key, imageId);
    return imageId;
  }

  return {
    registerSheetBackground(assetId: string, issueLocation: string): string {
      const asset = requireAsset(assetId, undefined, issueLocation);
      return `xl/media/image${addAsset(asset) + 1}.${asset.extension}`;
    },
    registerCellImage(
      image: CellImage,
      issueLocation: string,
    ): { mediaFilename: string; altText: string } {
      const asset = requireAsset(image.assetId, image.transform, issueLocation);
      return {
        mediaFilename: `xl/media/image${addAsset(asset) + 1}.${asset.extension}`,
        altText: image.altText,
      };
    },

    addFloatingImage(
      output: XlsxImageWorksheet,
      sheet: Sheet,
      image: FloatingImage,
      issueLocation: string,
    ): void {
      const asset = requireAsset(image.assetId, image.transform, issueLocation);
      output.addImage(
        addAsset(asset),
        imageAnchor(
          sheet,
          image.anchor.row,
          image.anchor.column,
          image.offsetX,
          image.offsetY,
          image.width,
          image.height,
        ),
      );
    },
  };
}
