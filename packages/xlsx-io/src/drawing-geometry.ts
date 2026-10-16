import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getDefaultColumnWidth,
  getDefaultRowHeight,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { attr, child, type XmlNode } from "./pivot-xml.js";

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
      sheet.hiddenRows?.has(index)
        ? 0
        : (sheet.rowHeights.get(index) ?? getDefaultRowHeight(sheet)),
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

/** Project supported producer anchors; physical WPS frame placement is approximate. */
export function readNativeChartGeometry(
  sheet: Sheet,
  kind: "oneCellAnchor" | "twoCellAnchor",
  anchor: XmlNode,
  frame: XmlNode,
  wpsChartProperties = false,
) {
  const integer = (value: unknown, maximum: number): number => {
    if (typeof value !== "string" || !/^\d+$/.test(value))
      throw new Error("Invalid chart geometry.");
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result > maximum)
      throw new Error("Invalid chart geometry.");
    return result;
  };
  const marker = (node: XmlNode) => ({
    column: integer(node.col, MAX_SHEET_COLUMNS - 1),
    row: integer(node.row, MAX_SHEET_ROWS - 1),
    offsetX: integer(node.colOff, 1000000 * EMU_PER_PIXEL) / EMU_PER_PIXEL,
    offsetY: integer(node.rowOff, 1000000 * EMU_PER_PIXEL) / EMU_PER_PIXEL,
  });
  const from = marker(child(anchor, "from"));
  const transform = child(frame, "xfrm");
  const frameExtent = child(transform, "ext");
  const extent = kind === "oneCellAnchor" ? child(anchor, "ext") : frameExtent;
  const width = integer(attr(extent, "cx"), 16384 * EMU_PER_PIXEL) / EMU_PER_PIXEL;
  const height = integer(attr(extent, "cy"), 16384 * EMU_PER_PIXEL) / EMU_PER_PIXEL;
  if (width < 1 || height < 1) throw new Error("Invalid chart geometry.");
  let start = from;
  const off = child(transform, "off");
  const absoluteFrame =
    kind === "twoCellAnchor" ||
    (wpsChartProperties && (attr(off, "x") !== "0" || attr(off, "y") !== "0"));
  if (kind === "twoCellAnchor") {
    const to = marker(child(anchor, "to"));
    if (to.row < from.row || to.column < from.column) throw new Error("Reversed chart anchor.");
  } else if (
    (!absoluteFrame && (attr(off, "x") !== "0" || attr(off, "y") !== "0")) ||
    attr(frameExtent, "cx") !== attr(extent, "cx") ||
    attr(frameExtent, "cy") !== attr(extent, "cy")
  ) {
    throw new Error("Unsupported one-cell frame transform.");
  }
  if (absoluteFrame) {
    // WPS's markers and its physical frame disagree under Core's width
    // and default-row baseline. Preserve frame physical dimensions/origin and
    // disclose approximation rather than asserting exact marker round-trip.
    // A saved one-cell absolute frame is admitted only with the strictly
    // validated WPS chart-properties leaf observed in the real saved variant.
    start = {
      row: 0,
      column: 0,
      offsetX: integer(attr(off, "x"), 1000000 * EMU_PER_PIXEL) / EMU_PER_PIXEL,
      offsetY: integer(attr(off, "y"), 1000000 * EMU_PER_PIXEL) / EMU_PER_PIXEL,
    };
  }
  const normalized = nativeDrawingAnchor(
    sheet,
    start.row,
    start.column,
    start.offsetX,
    start.offsetY,
    width,
    height,
  );
  return {
    anchor: { row: normalized.tl.nativeRow, column: normalized.tl.nativeCol },
    offsetX: normalized.tl.nativeColOff / EMU_PER_PIXEL,
    offsetY: normalized.tl.nativeRowOff / EMU_PER_PIXEL,
    width,
    height,
    approximated: absoluteFrame,
  };
}
