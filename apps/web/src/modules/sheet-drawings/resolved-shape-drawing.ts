import { assertNoUnresolvedShapeConnectors } from "./shape-document-support";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetLegacyDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  reanchorShapeFrame,
  resolveShapeFrame,
  shapeFrameLocalToWorld,
  type ShapeFrameRect,
} from "@sheetcraft/core/shape-frame";
import {
  locatePictureAxisPoint,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";

/** The source is the exact public owner; a canonical shape's view is disposable. */
export type ResolvedShapeDrawing = {
  source: SheetDrawing;
  readonly metrics: PictureSheetMetrics;
  view: SheetLegacyDrawing;
  rect: ShapeFrameRect;
  collapsed: boolean;
};

const appearanceFields = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "shapeGeometry",
  "shapePath",
  "shapeLineEnds",
  "shapeFlipX",
  "shapeFlipY",
  "shapeStyle",
  "shapeText",
  "textDirection",
] as const;
const viewFields: readonly string[] = [
  ...appearanceFields,
  "anchor",
  "offsetX",
  "offsetY",
  "width",
  "height",
];

function assertDataRecord(value: unknown, fields: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("A shape edit must be an ordinary data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("A shape edit must be an ordinary data record.");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !fields.includes(key))
      throw new TypeError("Unsupported shape view field.");
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Shape view fields cannot be accessors.");
  }
}

/** Transient offsets are free pixels, including leading and terminal virtual space. */
function getViewRect(view: SheetLegacyDrawing, metrics: PictureSheetMetrics): ShapeFrameRect {
  assertDataRecord(view.anchor, ["column", "row"]);
  if (
    !Number.isInteger(view.anchor.column) ||
    view.anchor.column < 0 ||
    view.anchor.column > metrics.columns.count ||
    !Number.isInteger(view.anchor.row) ||
    view.anchor.row < 0 ||
    view.anchor.row > metrics.rows.count ||
    typeof view.offsetX !== "number" ||
    !Number.isFinite(view.offsetX) ||
    typeof view.offsetY !== "number" ||
    !Number.isFinite(view.offsetY)
  )
    throw new RangeError("Invalid shape view origin.");
  const rect = {
    x: metrics.columns.visiblePrefix(view.anchor.column) + view.offsetX,
    y: metrics.rows.visiblePrefix(view.anchor.row) + view.offsetY,
    width: view.width,
    height: view.height,
  };
  // Core's rect validation permits collapsed/subpixel display spans. Do not run
  // legacy drawing normalization on a canonical view or clamp its dimensions.
  shapeFrameLocalToWorld(rect, 0, { x: 0, y: 0 });
  return rect;
}

export function resolveShapeDrawing(
  source: SheetDrawing,
  metrics: PictureSheetMetrics,
): ResolvedShapeDrawing {
  assertNoUnresolvedShapeConnectors("shape-projection", [source]);
  if (source.kind === "shapeGroup")
    throw new TypeError("A shape group requires its owned-tree projection, not a leaf view.");
  if (!isFramedShapeDrawing(source)) {
    const rect = getViewRect(source, metrics);
    return {
      source,
      metrics,
      view: source,
      rect,
      collapsed: rect.width === 0 || rect.height === 0,
    };
  }
  const normalized = normalizeSheetDrawing(source);
  const { shapeFrame, shapeProperties: _properties, ...appearance } = normalized;
  const { rect, collapsed } = resolveShapeFrame(shapeFrame, metrics, normalized.rotation);
  const anchor = shapeFrame.anchor;
  const origin =
    anchor.mode === "fixed"
      ? {
          column: locatePictureAxisPoint(rect.x, metrics.columns),
          row: locatePictureAxisPoint(rect.y, metrics.rows),
        }
      : anchor.mode === "move-only"
        ? anchor.origin
        : anchor.start;
  const view: SheetLegacyDrawing = {
    ...appearance,
    anchor: { column: origin.column.index, row: origin.row.index },
    offsetX: rect.x - metrics.columns.visiblePrefix(origin.column.index),
    offsetY: rect.y - metrics.rows.visiblePrefix(origin.row.index),
    width: rect.width,
    height: rect.height,
  };
  return { source, metrics, view, rect, collapsed };
}

/** Inverse projection never promotes a render view into persisted placement. */
export function updateResolvedShapeDrawing(
  resolved: ResolvedShapeDrawing,
  nextView: SheetLegacyDrawing,
  metrics: PictureSheetMetrics,
): SheetDrawing {
  if (metrics !== resolved.metrics)
    throw new TypeError("A shape view edit must use its original metrics snapshot.");
  const source = resolved.source;
  const framed = isFramedShapeDrawing(source);
  assertDataRecord(
    nextView,
    framed
      ? viewFields
      : [
          ...viewFields,
          ...(source.kind === "chart" ? ["chart"] : []),
          ...(source.kind === "camera" ? ["camera"] : []),
          ...(source.kind === "attachment" ? ["attachment"] : []),
          ...(source.kind === "control" ? ["control"] : []),
        ],
  );
  if (nextView.id !== source.id || nextView.kind !== source.kind)
    throw new TypeError("A shape view edit must retain its source identity and kind.");
  if (!isFramedShapeDrawing(source)) {
    normalizeSheetDrawing(nextView);
    return nextView;
  }
  const rect = getViewRect(nextView, metrics);
  const placementChanged =
    rect.x !== resolved.rect.x ||
    rect.y !== resolved.rect.y ||
    rect.width !== resolved.rect.width ||
    rect.height !== resolved.rect.height;
  const appearance = {} as Omit<SheetFramedGraphicDrawing, "shapeFrame" | "shapeProperties">;
  for (const key of appearanceFields) {
    const field = Object.getOwnPropertyDescriptor(nextView, key);
    if (field)
      Object.defineProperty(appearance, key, {
        value: field.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return normalizeSheetDrawing({
    ...appearance,
    id: source.id,
    kind: source.kind,
    shapeFrame: placementChanged
      ? reanchorShapeFrame(source.shapeFrame, rect, metrics)
      : source.shapeFrame,
    ...(source.shapeProperties ? { shapeProperties: source.shapeProperties } : {}),
  });
}
