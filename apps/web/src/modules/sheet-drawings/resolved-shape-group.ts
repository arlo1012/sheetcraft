import { assertNoUnresolvedShapeConnectors } from "./shape-document-support";
import {
  cloneShapeGroupChild,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import {
  applyShapeGroupChildWorldEdit,
  leaseShapeGroupNode,
  type ShapeGroupNodeLease,
} from "@sheetcraft/core/shape-group-edit";
import {
  locatePictureAxisPoint,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  shapeFrameLocalToWorld,
  type ResolvedShapeFrame,
  type ShapeFrameRect,
} from "@sheetcraft/core/shape-frame";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";

/** Exact public ownership is separate from each disposable, world-space view. */
export type ResolvedShapeGroupLeaf = {
  readonly sourceRoot: ShapeGroupDrawing;
  readonly sourceNode: SheetGroupedGraphicDrawing;
  readonly metrics: PictureSheetMetrics;
  readonly path: ShapeGroupPath;
  readonly parentPath: ShapeGroupPath;
  readonly parentLayout: ResolvedShapeFrame | null;
  readonly layout: ResolvedShapeFrame | null;
  readonly collapsed: boolean;
  /** Lazily cached against the original canonical snapshot, never the live root. */
  readonly lease: ShapeGroupNodeLease;
  /** Null only when a collapsed ancestor has no child world placement. */
  readonly view: SheetGraphicDrawing | null;
};

/** Containers expose geometry for outlines, never synthetic leaf appearance. */
export type ResolvedShapeGroupOwner = {
  readonly sourceRoot: ShapeGroupDrawing;
  readonly sourceNode: ShapeGroupDrawing | ShapeGroupedGroup;
  readonly path: ShapeGroupPath;
  readonly parentPath: ShapeGroupPath | null;
  readonly parentLayout: ResolvedShapeFrame | null;
  readonly layout: ResolvedShapeFrame | null;
  readonly collapsed: boolean;
};

export type ResolvedShapeGroupProjection = {
  readonly sourceRoot: ShapeGroupDrawing;
  readonly metrics: PictureSheetMetrics;
  readonly layout: ResolvedShapeFrame;
  /** Worksheet-level behavior belongs to the root, not private descendants. */
  readonly locked: boolean;
  readonly printObject: boolean;
  /** Bottom-to-top depth-first order, including unplaced collapsed leaves. */
  readonly leaves: readonly ResolvedShapeGroupLeaf[];
  readonly owners: readonly ResolvedShapeGroupOwner[];
};

const appearanceFields = [
  "id",
  "kind",
  "name",
  "hidden",
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

function readDataRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("A shape group view edit must be an ordinary data record.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("A shape group view edit must be an ordinary data record.");
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !fields.includes(key))
      throw new TypeError("Unsupported shape group view field.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError("Shape group view fields cannot be accessors.");
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function pickAppearance(value: object): Record<string, unknown> {
  const appearance: Record<string, unknown> = {};
  for (const key of appearanceFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor) appearance[key] = descriptor.value as unknown;
  }
  return appearance;
}

function worldView(
  node: SheetGroupedGraphicDrawing,
  layout: ResolvedShapeFrame,
  metrics: PictureSheetMetrics,
): SheetGraphicDrawing {
  const column = locatePictureAxisPoint(layout.rect.x, metrics.columns);
  const row = locatePictureAxisPoint(layout.rect.y, metrics.rows);
  // Clone appearance independently of the private lease snapshot. Do not run
  // legacy normalization here: signed, terminal and subpixel placement is valid.
  return {
    ...pickAppearance(cloneShapeGroupChild(node)),
    rotation: layout.angleDeg,
    anchor: { column: column.index, row: row.index },
    offsetX: layout.rect.x - metrics.columns.visiblePrefix(column.index),
    offsetY: layout.rect.y - metrics.rows.visiblePrefix(row.index),
    width: layout.rect.width,
    height: layout.rect.height,
  } as SheetGraphicDrawing;
}

/** Validate the entire owned tree before exposing any on- or off-screen leaf. */
export function resolveShapeGroupProjection(
  sourceRoot: ShapeGroupDrawing,
  metrics: PictureSheetMetrics,
): ResolvedShapeGroupProjection {
  assertNoUnresolvedShapeConnectors("shape-group-projection", [sourceRoot]);
  // Capture the public root first; Core layouts contain detached canonical nodes.
  const resolved = resolveShapeGroup(sourceRoot, metrics);
  const sources = new Map(
    traverseShapeGroup(sourceRoot).map((visit) => [JSON.stringify(visit.path), visit.node]),
  );
  const leaves: ResolvedShapeGroupLeaf[] = [];
  const owners: ResolvedShapeGroupOwner[] = [];
  function visit(
    entry: ResolvedShapeGroupNode,
    parentPath: ShapeGroupPath | null,
    parentLayout: ResolvedShapeFrame | null,
  ): void {
    const sourceNode = sources.get(JSON.stringify(entry.path));
    if (!sourceNode || sourceNode.kind !== entry.node.kind)
      throw new TypeError("A resolved shape group requires its exact source path.");
    const path = [...entry.path];
    const layout = entry.layout;
    const collapsed = !entry.visible || !layout || layout.collapsed;
    if (sourceNode.kind === "shapeGroup") {
      if (!("members" in entry))
        throw new TypeError("A resolved shape group owner requires its complete child tree.");
      owners.push({ sourceRoot, sourceNode, path, parentPath, parentLayout, layout, collapsed });
      for (const child of entry.members) visit(child, path, layout);
      return;
    }
    if (!parentPath || entry.node.kind === "shapeGroup")
      throw new TypeError("A resolved shape leaf requires its immediate owner.");
    const leasePath = [...entry.path];
    let lease: ShapeGroupNodeLease | undefined;
    leaves.push({
      sourceRoot,
      sourceNode,
      metrics,
      path,
      parentPath,
      parentLayout,
      layout,
      collapsed,
      // Reading or painting all leaves must not normalize the whole tree per
      // leaf. The private canonical snapshot is never exposed through views.
      get lease() {
        return (lease ??= leaseShapeGroupNode(resolved.node, leasePath));
      },
      view: layout ? worldView(entry.node, layout, metrics) : null,
    });
  }
  visit(resolved, null, null);
  const { locked, printObject } = getShapeObjectProperties(resolved.node.shapeProperties);
  return { sourceRoot, metrics, layout: resolved.layout, locked, printObject, leaves, owners };
}

/** Free pixel offsets are transient origins, including leading/terminal space. */
function readViewRect(
  fields: Record<string, unknown>,
  metrics: PictureSheetMetrics,
): ShapeFrameRect {
  const anchor = readDataRecord(fields.anchor, ["column", "row"]);
  const column = anchor.column as number;
  const row = anchor.row as number;
  if (
    !Number.isInteger(column) ||
    column < 0 ||
    column > metrics.columns.count ||
    !Number.isInteger(row) ||
    row < 0 ||
    row > metrics.rows.count ||
    typeof fields.offsetX !== "number" ||
    !Number.isFinite(fields.offsetX) ||
    typeof fields.offsetY !== "number" ||
    !Number.isFinite(fields.offsetY)
  )
    throw new RangeError("Invalid shape group view origin.");
  const rect = {
    x: metrics.columns.visiblePrefix(column) + fields.offsetX,
    y: metrics.rows.visiblePrefix(row) + fields.offsetY,
    width: fields.width as number,
    height: fields.height as number,
  };
  shapeFrameLocalToWorld(rect, fields.rotation as number, { x: 0, y: 0 });
  return rect;
}

/** Inverse the exact immediate owner; never promote a leaf view to a root frame. */
export function updateResolvedShapeGroupLeaf(
  leaf: ResolvedShapeGroupLeaf,
  nextView: SheetGraphicDrawing,
  metrics: PictureSheetMetrics,
): ShapeGroupDrawing {
  if ("shapeConnector" in leaf.sourceNode)
    throw new TypeError(
      "A connector requires its endpoint edit plan, never a generic view inverse.",
    );
  if (metrics !== leaf.metrics)
    throw new TypeError("A shape group view edit must use its original metrics snapshot.");
  const fields = readDataRecord(nextView, viewFields);
  if (fields.id !== leaf.sourceNode.id || fields.kind !== leaf.sourceNode.kind)
    throw new TypeError("A shape group view edit must retain its source identity and kind.");
  const rect = readViewRect(fields, metrics);
  if (leaf.collapsed || !leaf.layout || !leaf.parentLayout)
    throw new RangeError("Expand a collapsed group before editing an owned leaf.");
  const source = leaf.sourceNode;
  const replacement = {
    ...pickAppearance(fields),
    // The view angle is world-relative. Core alone computes the persisted angle.
    rotation: source.rotation,
    groupFrame: source.groupFrame,
    ...(source.shapeProperties ? { shapeProperties: source.shapeProperties } : {}),
  } as SheetGroupedGraphicDrawing;
  return applyShapeGroupChildWorldEdit(
    leaf.sourceRoot,
    leaf.lease,
    { rect, angleDeg: fields.rotation as number },
    metrics,
    { replacement },
  );
}
