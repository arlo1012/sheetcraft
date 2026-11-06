import { expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import { isCellAddressInBounds, type CellAddress, type Sheet } from "@sheetcraft/core/workbook";

export type PictureBatchArrangement = "vertical" | "horizontal" | "cascade";
export type PictureBatchInsertion = { order: number[]; arrangement: PictureBatchArrangement };

export function getPictureBatchCellAddresses(
  sheet: Sheet,
  start: CellAddress,
  count: number,
  arrangement: PictureBatchArrangement,
): CellAddress[] {
  const addresses: CellAddress[] = [];
  let address = { ...start };
  for (let index = 0; index < count; index += 1) {
    if (!isCellAddressInBounds(address))
      throw new RangeError("Image placement exceeds sheet bounds.");
    const range = expandSelectionToMergedCellRanges(
      { start: address, end: address },
      sheet.mergedCells,
    );
    addresses.push({ ...range.start });
    address =
      arrangement === "horizontal"
        ? { row: start.row, column: range.end.column + 1 }
        : { row: range.end.row + 1, column: start.column };
  }
  return addresses;
}

export function getPictureBatchFloatingOffsets(
  sizes: readonly { width: number; height: number }[],
  arrangement: PictureBatchArrangement,
): { offsetX: number; offsetY: number }[] {
  let position = 0;
  return sizes.map((size, index) => {
    if (arrangement === "cascade") return { offsetX: index * 24, offsetY: index * 24 };
    const offset =
      arrangement === "horizontal"
        ? { offsetX: position, offsetY: 0 }
        : { offsetX: 0, offsetY: position };
    position += (arrangement === "horizontal" ? size.width : size.height) + 12;
    return offset;
  });
}
