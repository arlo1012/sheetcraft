import {
  DEFAULT_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getDefaultColumnWidth,
  type Sheet,
} from "@sheetcraft/core/workbook";

export const EMU_PER_PIXEL = 9525;
export type NativeDrawingAnchor = {
  tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
  ext: { width: number; height: number };
};

function advanceAxis(
  index: number,
  offset: number,
  sizeAt: (index: number) => number,
  limit: number,
): { index: number; offset: number } {
  if (!Number.isFinite(offset) || offset < 0) throw new Error("Invalid XLSX drawing anchor.");
  let nextIndex = index;
  let nextOffset = offset;
  while (nextOffset >= sizeAt(nextIndex)) {
    nextOffset -= sizeAt(nextIndex);
    nextIndex += 1;
    if (nextIndex >= limit) throw new RangeError("The XLSX drawing exceeds sheet bounds.");
  }
  return { index: nextIndex, offset: nextOffset };
}

/** Shared physical one-cell placement for prepared pictures and native charts. */
export function nativeDrawingAnchor(
  sheet: Sheet,
  row: number,
  column: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): NativeDrawingAnchor {
  const startColumn = advanceAxis(
    column,
    offsetX,
    (index) =>
      sheet.hiddenColumns?.has(index)
        ? 0
        : (sheet.columnWidths.get(index) ?? getDefaultColumnWidth(sheet)),
    MAX_SHEET_COLUMNS,
  );
  const startRow = advanceAxis(
    row,
    offsetY,
    (index) =>
      sheet.hiddenRows?.has(index) ? 0 : (sheet.rowHeights.get(index) ?? DEFAULT_ROW_HEIGHT),
    MAX_SHEET_ROWS,
  );
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
