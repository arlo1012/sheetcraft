import type { CellImage } from "@idea10/core/formula";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  normalizeImageTransform,
  type CellAddress,
  type FloatingImage,
  type Sheet,
} from "@idea10/core/workbook";
import type { XlsxEncodeOptions, XlsxImageAsset } from "./types.js";

const EMU_PER_PIXEL = 9525;
const CELL_IMAGE_INSET = 2;

type XlsxImageCellPosition = {
  nativeCol: number;
  nativeColOff: number;
  nativeRow: number;
  nativeRowOff: number;
};

export type XlsxImageAnchor = {
  tl: XlsxImageCellPosition;
  br: XlsxImageCellPosition;
  editAs: "oneCell";
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
    (index) => sheet.columnWidths.get(index) ?? DEFAULT_COLUMN_WIDTH,
    MAX_SHEET_COLUMNS,
  );
  const startRow = advanceAxis(
    row,
    offsetY,
    0,
    (index) => sheet.rowHeights.get(index) ?? DEFAULT_ROW_HEIGHT,
    MAX_SHEET_ROWS,
  );
  const endColumn = advanceAxis(
    startColumn.index,
    startColumn.offset,
    width,
    (index) => sheet.columnWidths.get(index) ?? DEFAULT_COLUMN_WIDTH,
    MAX_SHEET_COLUMNS,
  );
  const endRow = advanceAxis(
    startRow.index,
    startRow.offset,
    height,
    (index) => sheet.rowHeights.get(index) ?? DEFAULT_ROW_HEIGHT,
    MAX_SHEET_ROWS,
  );
  // tl/br produces a standard twoCellAnchor; editAs keeps pictures moving without resizing.
  return {
    tl: {
      nativeCol: startColumn.index,
      nativeColOff: Math.round(startColumn.offset * EMU_PER_PIXEL),
      nativeRow: startRow.index,
      nativeRowOff: Math.round(startRow.offset * EMU_PER_PIXEL),
    },
    br: {
      nativeCol: endColumn.index,
      nativeColOff: Math.round(endColumn.offset * EMU_PER_PIXEL),
      nativeRow: endRow.index,
      nativeRowOff: Math.round(endRow.offset * EMU_PER_PIXEL),
    },
    editAs: "oneCell",
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
    nextOffset -= sizeAt(nextIndex);
    nextIndex += 1;
    if (nextIndex >= limit) throw new RangeError("The XLSX image exceeds sheet bounds.");
  }
  return { index: nextIndex, offset: nextOffset };
}

function containingMerge(sheet: Sheet, address: CellAddress) {
  return sheet.mergedCells.find(
    (range) =>
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.column >= range.start.column &&
      address.column <= range.end.column,
  );
}

function dimensionSize(
  sizes: ReadonlyMap<number, number>,
  start: number,
  end: number,
  defaultSize: number,
): number {
  let total = 0;
  for (let index = start; index <= end; index += 1) total += sizes.get(index) ?? defaultSize;
  return total;
}

function containedImageSize(
  asset: XlsxImageAsset,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  const availableWidth = Math.max(1, boxWidth - CELL_IMAGE_INSET * 2);
  const availableHeight = Math.max(1, boxHeight - CELL_IMAGE_INSET * 2);
  const scale = Math.min(availableWidth / asset.width, availableHeight / asset.height);
  const width = asset.width * scale;
  const height = asset.height * scale;
  return {
    width,
    height,
    offsetX: CELL_IMAGE_INSET + (availableWidth - width) / 2,
    offsetY: CELL_IMAGE_INSET + (availableHeight - height) / 2,
  };
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
    addCellImage(
      output: XlsxImageWorksheet,
      sheet: Sheet,
      address: CellAddress,
      image: CellImage,
      issueLocation: string,
    ): void {
      const asset = requireAsset(image.assetId, image.transform, issueLocation);
      const merge = containingMerge(sheet, address);
      const start = merge?.start ?? address;
      const end = merge?.end ?? start;
      const boxWidth = dimensionSize(
        sheet.columnWidths,
        start.column,
        end.column,
        DEFAULT_COLUMN_WIDTH,
      );
      const boxHeight = dimensionSize(sheet.rowHeights, start.row, end.row, DEFAULT_ROW_HEIGHT);
      const size = containedImageSize(asset, boxWidth, boxHeight);
      output.addImage(
        addAsset(asset),
        imageAnchor(
          sheet,
          start.row,
          start.column,
          size.offsetX,
          size.offsetY,
          size.width,
          size.height,
        ),
      );
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
