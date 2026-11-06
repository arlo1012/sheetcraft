import { doMergedCellRangesIntersect, expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import type { CellRange } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { MIN_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import { isCellAddressInBounds, type CellAddress, type Sheet } from "@sheetcraft/core/workbook";
import type { PictureNameMatchSource } from "./picture-name-matching";

export type PictureBatchArrangement = "vertical" | "horizontal" | "cascade";
export type PictureBatchInsertion = {
  order: number[];
  arrangement: PictureBatchArrangement;
  wrapAfter?: number;
  namePlacement?: "before" | "after";
  rowHeight?: number;
  nameMatch?: PictureNameMatchSource;
};

/** Each picture and its caption reserve separate merged-cell regions. */
export function getPictureBatchCellLayout(
  sheet: Sheet,
  start: CellAddress,
  count: number,
  arrangement: PictureBatchArrangement,
  wrapAfter?: number,
  namePlacement?: "before" | "after",
): { pictures: CellAddress[]; names: CellAddress[] } {
  if (!namePlacement)
    return {
      pictures: getPictureBatchCellAddresses(sheet, start, count, arrangement, wrapAfter),
      names: [],
    };
  validateWrapAfter(wrapAfter);
  const pictures: CellAddress[] = [],
    names: CellAddress[] = [],
    reserved: CellRange[] = [];
  const horizontal = arrangement === "horizontal";
  let cursor = { ...start },
    nextBand = horizontal ? start.row : start.column;
  function reserve(address: CellAddress): CellRange {
    if (!isCellAddressInBounds(address))
      throw new RangeError("Picture caption exceeds sheet bounds.");
    const range = expandSelectionToMergedCellRanges(
      { start: address, end: address },
      sheet.mergedCells,
    );
    if (reserved.some((previous) => doMergedCellRangesIntersect(previous, range)))
      throw new RangeError("Picture and caption regions must not overlap.");
    reserved.push(range);
    return range;
  }
  for (let index = 0; index < count; index++) {
    const first = reserve(cursor);
    const second = reserve(
      horizontal
        ? { row: first.end.row + 1, column: first.start.column }
        : { row: first.start.row, column: first.end.column + 1 },
    );
    pictures.push({ ...(namePlacement === "before" ? second.start : first.start) });
    names.push({ ...(namePlacement === "before" ? first.start : second.start) });
    nextBand = Math.max(nextBand, (horizontal ? second.end.row : second.end.column) + 1);
    const wrap = arrangement !== "cascade" && wrapAfter && (index + 1) % wrapAfter === 0;
    cursor = horizontal
      ? wrap
        ? { row: nextBand, column: start.column }
        : { row: cursor.row, column: Math.max(first.end.column, second.end.column) + 1 }
      : wrap
        ? { row: start.row, column: nextBand }
        : { row: Math.max(first.end.row, second.end.row) + 1, column: cursor.column };
  }
  return { pictures, names };
}

export function getPictureBatchCellFrames(
  sheet: Sheet,
  addresses: readonly CellAddress[],
  sizes: readonly { width: number; height: number }[],
  rowHeight?: number,
): Array<{ anchor: CellAddress; offsetX: number; offsetY: number; width: number; height: number }> {
  const rowHeights = new Map(sheet.rowHeights);
  if (rowHeight !== undefined)
    for (const address of addresses) rowHeights.set(address.row, rowHeight);
  const metrics = createPictureSheetMetrics({ ...sheet, rowHeights });
  return addresses.map((address, index) => {
    const range = expandSelectionToMergedCellRanges(
      { start: address, end: address },
      sheet.mergedCells,
    );
    const width =
      metrics.columns.visiblePrefix(range.end.column + 1) -
      metrics.columns.visiblePrefix(range.start.column);
    const height =
      metrics.rows.visiblePrefix(range.end.row + 1) - metrics.rows.visiblePrefix(range.start.row);
    const source = sizes[index]!;
    const scale = Math.min((width - 4) / source.width, (height - 4) / source.height);
    const frame = { width: source.width * scale, height: source.height * scale };
    if (frame.width < MIN_FLOATING_IMAGE_SIZE || frame.height < MIN_FLOATING_IMAGE_SIZE)
      throw new RangeError("The destination cell is too small for this picture.");
    return {
      anchor: { ...address },
      offsetX: (width - frame.width) / 2,
      offsetY: (height - frame.height) / 2,
      ...frame,
    };
  });
}

function validateWrapAfter(value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 100))
    throw new RangeError("Picture band size must be an integer between 1 and 100.");
}

export function getPictureBatchCellAddresses(
  sheet: Sheet,
  start: CellAddress,
  count: number,
  arrangement: PictureBatchArrangement,
  wrapAfter?: number,
): CellAddress[] {
  validateWrapAfter(wrapAfter);
  const addresses: CellAddress[] = [];
  let address = { ...start };
  let nextBand = arrangement === "horizontal" ? start.row : start.column;
  for (let index = 0; index < count; index += 1) {
    if (!isCellAddressInBounds(address))
      throw new RangeError("Image placement exceeds sheet bounds.");
    const range = expandSelectionToMergedCellRanges(
      { start: address, end: address },
      sheet.mergedCells,
    );
    addresses.push({ ...range.start });
    nextBand = Math.max(
      nextBand,
      (arrangement === "horizontal" ? range.end.row : range.end.column) + 1,
    );
    const wrap = arrangement !== "cascade" && wrapAfter && (index + 1) % wrapAfter === 0;
    if (arrangement === "horizontal")
      address = wrap
        ? { row: nextBand, column: start.column }
        : { row: address.row, column: range.end.column + 1 };
    else
      address = wrap
        ? { row: start.row, column: nextBand }
        : { row: range.end.row + 1, column: address.column };
  }
  return addresses;
}

export function getPictureBatchFloatingOffsets(
  sizes: readonly { width: number; height: number }[],
  arrangement: PictureBatchArrangement,
  wrapAfter?: number,
): { offsetX: number; offsetY: number }[] {
  validateWrapAfter(wrapAfter);
  let position = 0,
    bandPosition = 0,
    bandSize = 0;
  return sizes.map((size, index) => {
    if (arrangement === "cascade") return { offsetX: index * 24, offsetY: index * 24 };
    if (wrapAfter && index > 0 && index % wrapAfter === 0) {
      position = 0;
      bandPosition += bandSize + 12;
      bandSize = 0;
    }
    const offset =
      arrangement === "horizontal"
        ? { offsetX: position, offsetY: bandPosition }
        : { offsetX: bandPosition, offsetY: position };
    position += (arrangement === "horizontal" ? size.width : size.height) + 12;
    bandSize = Math.max(bandSize, arrangement === "horizontal" ? size.height : size.width);
    return offset;
  });
}
