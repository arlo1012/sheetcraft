import {
  DEFAULT_ROW_HEIGHT,
  getDefaultColumnWidth,
  type Sheet,
  type SheetDimensionAxis,
} from "./workbook.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";

/** Stored logical location. An inset survives hiding and cell-size changes. */
export type PictureAxisPoint = { index: number; offset: number };
export type PictureCellPoint = { column: PictureAxisPoint; row: PictureAxisPoint };

/** An immutable, sparse axis metric snapshot; it never expands a whole worksheet. */
export type PictureAxisMetrics = {
  readonly count: number;
  nominalSize: (index: number) => number;
  visibleSize: (index: number) => number;
  nominalPrefix: (index: number) => number;
  visiblePrefix: (index: number) => number;
};
export type PictureSheetMetrics = { columns: PictureAxisMetrics; rows: PictureAxisMetrics };
function assertIndex(index: number, count: number, terminal = false): void {
  if (!Number.isInteger(index) || index < 0 || index > count || (!terminal && index === count))
    throw new RangeError("Picture axis index is outside the worksheet.");
}
function lowerBound(values: readonly number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}
export function createPictureAxisMetrics(
  sheet: Sheet,
  axis: SheetDimensionAxis,
): PictureAxisMetrics {
  if (axis !== "row" && axis !== "column") throw new TypeError("Invalid picture axis.");
  const count = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  const defaultSize = axis === "row" ? DEFAULT_ROW_HEIGHT : getDefaultColumnWidth(sheet);
  if (!Number.isFinite(defaultSize) || defaultSize <= 0)
    throw new RangeError("Invalid picture default axis size.");
  const dimensions = new Map(axis === "row" ? sheet.rowHeights : sheet.columnWidths);
  const hidden = new Set(axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns);
  const indexes = [...new Set([...dimensions.keys(), ...hidden])].sort((a, b) => a - b);
  const nominalAdjustments = [0];
  const visibleAdjustments = [0];
  for (const index of indexes) {
    assertIndex(index, count);
    const size = dimensions.get(index) ?? defaultSize;
    if (!Number.isFinite(size) || size <= 0) throw new RangeError("Invalid picture axis size.");
    nominalAdjustments.push(nominalAdjustments.at(-1)! + size - defaultSize);
    visibleAdjustments.push(
      visibleAdjustments.at(-1)! + (hidden.has(index) ? 0 : size) - defaultSize,
    );
  }
  if (
    !Number.isFinite(defaultSize * count + nominalAdjustments.at(-1)!) ||
    !Number.isFinite(defaultSize * count + visibleAdjustments.at(-1)!)
  )
    throw new RangeError("Picture axis coordinates exceed finite bounds.");
  function prefix(index: number, adjustments: readonly number[]): number {
    assertIndex(index, count, true);
    return defaultSize * index + adjustments[lowerBound(indexes, index)]!;
  }
  return {
    count,
    nominalSize: (index) => {
      assertIndex(index, count);
      return dimensions.get(index) ?? defaultSize;
    },
    visibleSize: (index) => {
      assertIndex(index, count);
      return hidden.has(index) ? 0 : (dimensions.get(index) ?? defaultSize);
    },
    nominalPrefix: (index) => prefix(index, nominalAdjustments),
    visiblePrefix: (index) => prefix(index, visibleAdjustments),
  };
}
export function createPictureSheetMetrics(sheet: Sheet): PictureSheetMetrics {
  return {
    columns: createPictureAxisMetrics(sheet, "column"),
    rows: createPictureAxisMetrics(sheet, "row"),
  };
}
export function normalizePictureAxisPoint(
  point: PictureAxisPoint,
  count: number,
): PictureAxisPoint {
  if (!Number.isSafeInteger(count) || count <= 0)
    throw new RangeError("Invalid picture axis count.");
  if (!point || typeof point !== "object" || Array.isArray(point))
    throw new TypeError("Invalid picture axis point.");
  const prototype = Object.getPrototypeOf(point);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Picture axis points must be ordinary data records.");
  for (const key of Reflect.ownKeys(point)) {
    if (key !== "index" && key !== "offset")
      throw new TypeError("Unknown picture axis point field.");
    if (!("value" in Object.getOwnPropertyDescriptor(point, key)!))
      throw new TypeError("Picture axis points must contain data fields, not accessors.");
  }
  const index = Object.getOwnPropertyDescriptor(point, "index")?.value as number;
  const offset = Object.getOwnPropertyDescriptor(point, "offset")?.value as number;
  assertIndex(index, count, true);
  if (!Number.isFinite(offset) || (offset < 0 && index !== 0))
    throw new RangeError(
      "Picture inset must be finite; only the leading sheet boundary permits negative coordinates.",
    );
  return { index, offset: offset === 0 ? 0 : offset };
}
/** New logical endpoints clamp only their display inset, never the stored point. */
export function projectPictureAxisPoint(
  point: PictureAxisPoint,
  metrics: PictureAxisMetrics,
): number {
  const p = normalizePictureAxisPoint(point, metrics.count);
  const origin = metrics.visiblePrefix(p.index);
  if (p.offset < 0 || p.index === metrics.count) return origin + p.offset;
  return origin + Math.min(p.offset, metrics.visibleSize(p.index));
}
/** Legacy offsets are free pixel offsets, not bounded endpoint insets. */
export function projectLegacyPictureAxisOrigin(
  index: number,
  offset: number,
  metrics: PictureAxisMetrics,
): number {
  assertIndex(index, metrics.count);
  if (!Number.isFinite(offset) || offset < 0)
    throw new RangeError("Invalid legacy picture offset.");
  return metrics.visiblePrefix(index) + (metrics.visibleSize(index) === 0 ? 0 : offset);
}
/**
 * Inverts a visible coordinate with right-boundary affinity. A preferred logical
 * point is retained if it still resolves exactly, including a hidden zero-size cell.
 */
export function locatePictureAxisPoint(
  position: number,
  metrics: PictureAxisMetrics,
  preferred?: PictureAxisPoint,
): PictureAxisPoint {
  if (!Number.isFinite(position)) throw new RangeError("Picture coordinate must be finite.");
  if (preferred && projectPictureAxisPoint(preferred, metrics) === position)
    return normalizePictureAxisPoint(preferred, metrics.count);
  if (position < 0) return { index: 0, offset: position };
  const extent = metrics.visiblePrefix(metrics.count);
  if (position >= extent) return { index: metrics.count, offset: position - extent };
  let low = 0;
  let high = metrics.count;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (metrics.visiblePrefix(middle) <= position) low = middle;
    else high = middle - 1;
  }
  return { index: low, offset: position - metrics.visiblePrefix(low) };
}
export function comparePictureAxisPoints(left: PictureAxisPoint, right: PictureAxisPoint): number {
  return left.index - right.index || left.offset - right.offset;
}
