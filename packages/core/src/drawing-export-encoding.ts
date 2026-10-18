import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import {
  normalizePictureAxisPoint,
  projectFreePictureAxisPoint,
  type PictureCellPoint,
  type PictureSheetMetrics,
} from "./picture-axis-metrics.js";

type Rect = { x: number; y: number; width: number; height: number };
/** An encoding hint only: never a second source of layout geometry. */
export type FixedDrawingExportEncoding = {
  kind: "two-cell-absolute-v1";
  start: PictureCellPoint;
  end: PictureCellPoint;
  referenceRect: Rect;
};
const EMU = 9525;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError("Invalid drawing export encoding record.");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError("Drawing export encoding requires known own data fields.");
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function coordinate(value: unknown, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum ||
    !Number.isSafeInteger(Math.round(value * EMU)) ||
    Math.round(value * EMU) / EMU !== value
  )
    throw new RangeError("Drawing export coordinates must be exact bounded EMUs.");
  return value;
}
/** Equality in the serialized coordinate system, never a pixel tolerance. */
export function equalDrawingEncodingRects(a: Rect, b: Rect): boolean {
  return (["x", "y", "width", "height"] as const).every(
    (key) =>
      Number.isFinite(a[key]) &&
      Number.isFinite(b[key]) &&
      Math.round(a[key] * EMU) === Math.round(b[key] * EMU),
  );
}
export function normalizeFixedDrawingExportEncoding(value: unknown): FixedDrawingExportEncoding {
  const v = record(value, ["kind", "start", "end", "referenceRect"]);
  if (v.kind !== "two-cell-absolute-v1") throw new TypeError("Unknown drawing export encoding.");
  const point = (value: unknown): PictureCellPoint => {
    const p = record(value, ["column", "row"]);
    const column = normalizePictureAxisPoint(
      p.column as PictureCellPoint["column"],
      MAX_SHEET_COLUMNS,
    );
    const row = normalizePictureAxisPoint(p.row as PictureCellPoint["row"], MAX_SHEET_ROWS);
    if (column.index >= MAX_SHEET_COLUMNS || row.index >= MAX_SHEET_ROWS)
      throw new RangeError("Drawing export markers must be inside the worksheet.");
    coordinate(column.offset, 1_000_000);
    coordinate(row.offset, 1_000_000);
    return { column, row };
  };
  const start = point(v.start),
    end = point(v.end);
  for (const axis of ["column", "row"] as const)
    if (
      end[axis].index < start[axis].index ||
      (end[axis].index === start[axis].index && end[axis].offset <= start[axis].offset)
    )
      throw new RangeError("Drawing export markers require positive spans.");
  const r = record(v.referenceRect, ["x", "y", "width", "height"]);
  const referenceRect = {
    x: coordinate(r.x, 1_000_000),
    y: coordinate(r.y, 1_000_000),
    width: coordinate(r.width, 16384),
    height: coordinate(r.height, 16384),
  };
  if (referenceRect.width < 1 || referenceRect.height < 1)
    throw new RangeError("Drawing export reference size must be positive.");
  return { kind: "two-cell-absolute-v1", start, end, referenceRect };
}
export function retainFixedDrawingExportEncoding(
  value: unknown,
  rect: Rect,
): FixedDrawingExportEncoding | undefined {
  const encoding = normalizeFixedDrawingExportEncoding(value);
  return equalDrawingEncodingRects(encoding.referenceRect, rect) ? encoding : undefined;
}
export function canReuseFixedDrawingExportEncoding(
  encoding: FixedDrawingExportEncoding | undefined,
  rect: Rect,
  metrics: PictureSheetMetrics,
): encoding is FixedDrawingExportEncoding {
  if (!encoding || !equalDrawingEncodingRects(encoding.referenceRect, rect)) return false;
  const x = projectFreePictureAxisPoint(encoding.start.column, metrics.columns);
  const y = projectFreePictureAxisPoint(encoding.start.row, metrics.rows);
  return equalDrawingEncodingRects(rect, {
    x,
    y,
    width: projectFreePictureAxisPoint(encoding.end.column, metrics.columns) - x,
    height: projectFreePictureAxisPoint(encoding.end.row, metrics.rows) - y,
  });
}
