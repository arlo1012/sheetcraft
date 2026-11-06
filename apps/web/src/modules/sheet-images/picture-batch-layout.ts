import { expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import { isCellAddressInBounds, type CellAddress, type Sheet } from "@sheetcraft/core/workbook";

export type PictureBatchArrangement = "vertical" | "horizontal" | "cascade";
export type PictureBatchInsertion = {
  order: number[];
  arrangement: PictureBatchArrangement;
  wrapAfter?: number;
};

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
