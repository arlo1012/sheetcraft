import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "./sheet-limits.js";
import {
  clonePictureFrame,
  normalizePictureFrame,
  resolvePictureFrame,
  type PictureFrame,
} from "./picture-frame.js";
import {
  comparePictureAxisPoints,
  locatePictureAxisPoint,
  type PictureAxisPoint,
  type PictureAxisMetrics,
  type PictureSheetMetrics,
} from "./picture-axis-metrics.js";

export type PictureFrameAxisEdit = {
  axis: "row" | "column";
  operation: "insert" | "delete";
  index: number;
  count: number;
};

/**
 * Plans a structural change without mutating the picture or worksheet.
 * Deletion consumes only a complete logical stretch, never a move-only picture.
 * MAX truncation and virtual leading/trailing rails are explicit product policy;
 * they are not inferred desktop-producer behavior.
 */
export function transformPictureFrameAxis(
  original: PictureFrame,
  edit: PictureFrameAxisEdit,
  nextMetrics: PictureSheetMetrics,
): PictureFrame | null {
  if (
    !edit ||
    (edit.axis !== "row" && edit.axis !== "column") ||
    (edit.operation !== "insert" && edit.operation !== "delete")
  )
    throw new TypeError("Invalid picture axis edit.");
  const maximum = edit.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (
    !Number.isSafeInteger(edit.index) ||
    !Number.isSafeInteger(edit.count) ||
    edit.index < 0 ||
    edit.count <= 0 ||
    edit.index + edit.count > maximum
  )
    throw new RangeError("Picture axis edit is outside the worksheet.");
  const metrics = edit.axis === "row" ? nextMetrics.rows : nextMetrics.columns;
  if (metrics.count !== maximum)
    throw new RangeError("Picture axis metrics must cover the worksheet.");
  const frame = clonePictureFrame(original);
  if (frame.anchor.mode === "fixed") {
    resolvePictureFrame(frame, nextMetrics);
    return frame;
  }
  const field = edit.axis === "row" ? "row" : "column";
  function mapPoint(point: PictureAxisPoint, endBoundary: boolean): PictureAxisPoint {
    // Negative leading coordinates are a virtual rail, not row/column-zero content.
    if (point.index === 0 && point.offset < 0) return { ...point };
    if (edit.operation === "insert") {
      // A terminal tail is outside the set of real cells truncated by insertion.
      if (point.index === maximum) return { ...point };
      if (
        point.index < edit.index ||
        (endBoundary && point.index === edit.index && point.offset === 0)
      )
        return { ...point };
      const index = point.index + edit.count;
      return index >= maximum ? { index: maximum, offset: 0 } : { index, offset: point.offset };
    }
    if (point.index === maximum) return mapTail(point, maximum - edit.count, metrics);
    if (point.index < edit.index) return { ...point };
    if (point.index >= edit.index + edit.count)
      return { index: point.index - edit.count, offset: point.offset };
    return { index: edit.index, offset: 0 };
  }
  if (frame.anchor.mode === "move-only") {
    frame.anchor.origin[field] = mapPoint(frame.anchor.origin[field], false);
  } else {
    const start = mapPoint(frame.anchor.start[field], false);
    const end = mapPoint(frame.anchor.end[field], true);
    if (comparePictureAxisPoints(start, end) >= 0) return null;
    frame.anchor.start[field] = start;
    frame.anchor.end[field] = end;
  }
  const result = normalizePictureFrame(frame);
  resolvePictureFrame(result, nextMetrics);
  return result;
}

function mapTail(
  point: PictureAxisPoint,
  boundary: number,
  metrics: PictureAxisMetrics,
): PictureAxisPoint {
  const coordinate = metrics.visiblePrefix(boundary) + point.offset;
  if (!Number.isFinite(coordinate))
    throw new RangeError("Picture tail exceeds finite coordinates.");
  return locatePictureAxisPoint(coordinate, metrics, { index: boundary, offset: 0 });
}
