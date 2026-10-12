import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { resolvePictureLayout } from "./picture-frame.js";
import { anchorShapeFrameRect, resolveShapeFrame, type ResolvedShapeFrame } from "./shape-frame.js";
import {
  cloneShapeGroupChild,
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "./shape-group.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  resolveShapeGroupChildLayout,
  unionShapeGroupLayoutRects,
} from "./shape-group-layout.js";
import {
  getShapeObjectProperties,
  normalizeShapeObjectProperties,
  type ShapeObjectProperties,
} from "./shape-object-properties.js";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "./sheet-drawings.js";

export type ShapeGroupEligibleRoot =
  | ShapeGroupDrawing
  | SheetFramedGraphicDrawing
  | (SheetGraphicDrawing & { kind: "shape" | "textBox" });

function dataRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      throw new TypeError(`${name} must contain own data fields, not accessors or symbols.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function ids(value: readonly string[]): string[] {
  const result = readPictureDataArray(value, "shape grouping targets", MAX_SHAPE_GROUP_NODES);
  if (result.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Shape grouping targets require non-empty IDs.");
  return result;
}
export function isShapeGroupEligibleRoot(value: SheetDrawing): value is ShapeGroupEligibleRoot {
  return value.kind === "shapeGroup" || value.kind === "shape" || value.kind === "textBox";
}
/** Complete source-checked forest, including ordinary drawing IDs and unselected owned trees. */
export function normalizeShapeDrawingForest(values: readonly SheetDrawing[]): SheetDrawing[] {
  const source = readPictureDataArray(values, "shape drawing forest", MAX_SHAPE_GROUP_NODES);
  for (const value of source) {
    const root = dataRecord(value, "shape drawing root");
    if (root.anchor !== undefined) dataRecord(root.anchor, "legacy drawing anchor");
  }
  const roots = normalizeSheetDrawings(source);
  let count = 0;
  for (const root of roots) {
    count += isShapeGroupDrawing(root) ? traverseShapeGroup(root).length : 1;
    if (count > MAX_SHAPE_GROUP_NODES)
      throw new RangeError("Shape drawing forest node budget exceeded.");
  }
  return roots;
}
/** Geometry only; resolving a legacy leaf never promotes its persisted representation. */
export function resolveShapeRootLayout(
  value: ShapeGroupEligibleRoot,
  metrics: PictureSheetMetrics,
): ResolvedShapeFrame {
  if (isShapeGroupDrawing(value)) return resolveShapeGroup(value, metrics).layout;
  if (isFramedShapeDrawing(value))
    return resolveShapeFrame(value.shapeFrame, metrics, value.rotation);
  return resolvePictureLayout(
    {
      x: metrics.columns.visiblePrefix(value.anchor.column) + value.offsetX,
      y: metrics.rows.visiblePrefix(value.anchor.row) + value.offsetY,
      width: value.width,
      height: value.height,
    },
    value.rotation,
  );
}
/** Checks all eligible roots and descendants, even when an operation leaves them untouched. */
export function assertShapeDrawingForestLayouts(
  values: readonly SheetDrawing[],
  metrics: PictureSheetMetrics,
): void {
  for (const value of values)
    if (isShapeGroupEligibleRoot(value)) resolveShapeRootLayout(value, metrics);
}

function toMember(
  value: ShapeGroupEligibleRoot,
  parent: ResolvedShapeFrame,
  metrics: PictureSheetMetrics,
): ShapeGroupChild {
  const placement = placeShapeGroupChild(parent, resolveShapeRootLayout(value, metrics));
  if (placement.status !== "placed") throw new RangeError("Cannot group into a collapsed owner.");
  if (isShapeGroupDrawing(value)) {
    const { shapeFrame: _frame, ...group } = value;
    return {
      ...group,
      groupFrame: placement.groupFrame,
      rotation: placement.rotation,
      members: value.members.map(cloneShapeGroupChild),
    };
  }
  if (isFramedShapeDrawing(value)) {
    const { shapeFrame: _frame, ...appearance } = value;
    return { ...appearance, groupFrame: placement.groupFrame, rotation: placement.rotation };
  }
  const {
    anchor: _anchor,
    offsetX: _offsetX,
    offsetY: _offsetY,
    width: _width,
    height: _height,
    ...appearance
  } = value;
  return { ...appearance, groupFrame: placement.groupFrame, rotation: placement.rotation };
}

/**
 * Explicit promotion boundary. Noncontiguous selected roots retain their stack order
 * inside a new zero-rotation owner inserted at the highest selected root's slot.
 */
export function groupShapeRoots(
  values: readonly SheetDrawing[],
  selectedIds: readonly string[],
  identity: { id: string; name: string },
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const targets = ids(selectedIds);
  if (targets.length < 2) throw new RangeError("Grouping requires at least two shape roots.");
  const selected = new Set(targets);
  if (selected.size !== targets.length) throw new TypeError("Duplicate shape grouping targets.");
  const members = roots.filter((root) => selected.has(root.id));
  if (members.length !== selected.size || members.some((root) => !isShapeGroupEligibleRoot(root)))
    throw new TypeError("Shape grouping targets must be current eligible roots.");
  const identityFields = dataRecord(identity, "shape group identity");
  if (Reflect.ownKeys(identityFields).some((key) => key !== "id" && key !== "name"))
    throw new TypeError("Unknown shape group identity field.");
  if (
    typeof identityFields.id !== "string" ||
    !identityFields.id.trim() ||
    typeof identityFields.name !== "string"
  )
    throw new TypeError("A shape group identity requires a non-empty ID and a name.");
  for (const root of roots)
    for (const node of isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node }) => node)
      : [root])
      if (node.id === identityFields.id)
        throw new TypeError("Shape group identity collides with a drawing node.");
  const eligible = members as ShapeGroupEligibleRoot[];
  const rect = unionShapeGroupLayoutRects(
    eligible.map((root) => resolveShapeRootLayout(root, metrics).rect),
  );
  const parent = resolvePictureLayout(rect, 0);
  const group = normalizeShapeGroup({
    kind: "shapeGroup",
    id: identityFields.id,
    name: identityFields.name,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: anchorShapeFrameRect("move-and-size", rect, metrics),
    },
    rotation: 0,
    members: eligible.map((root) => toMember(root, parent, metrics)),
  });
  let last = -1;
  roots.forEach((root, index) => {
    if (selected.has(root.id)) last = index;
  });
  const result = normalizeShapeDrawingForest(
    roots.flatMap((root, index): SheetDrawing[] =>
      index === last ? [group] : selected.has(root.id) ? [] : [root],
    ),
  );
  assertShapeDrawingForestLayouts(result, metrics);
  return result;
}

/** Root lock/print policy follows the released owner; aspect and alternate text remain child-owned. */
export function inheritShapeGroupOwnerProperties(
  child: ShapeObjectProperties | undefined,
  owner: ShapeObjectProperties | undefined,
): ShapeObjectProperties | undefined {
  const behavior = getShapeObjectProperties(owner);
  return normalizeShapeObjectProperties({
    ...child,
    locked: behavior.locked,
    printObject: behavior.printObject,
  });
}
/** One child becomes a worksheet root at its current world layout, without flattening descendants. */
export function releaseShapeGroupChild(
  member: ShapeGroupChild,
  world: ResolvedShapeFrame,
  metrics: PictureSheetMetrics,
  ownerProperties?: ShapeObjectProperties,
): SheetDrawing {
  if (world.collapsed) throw new RangeError("Expand a collapsed group before releasing its child.");
  const { groupFrame: _frame, shapeProperties: _properties, ...appearance } = member;
  const shapeProperties = inheritShapeGroupOwnerProperties(member.shapeProperties, ownerProperties);
  const shapeFrame = {
    kind: "shape-frame-v1" as const,
    anchor: anchorShapeFrameRect("move-and-size", world.rect, metrics),
  };
  return normalizeSheetDrawing({
    ...appearance,
    shapeFrame,
    rotation: world.angleDeg,
    ...(shapeProperties ? { shapeProperties } : {}),
  } as ShapeGroupDrawing | SheetFramedGraphicDrawing);
}
/** One level only, at the existing stack slot; root behavior and every child's world layout survive. */
export function ungroupShapeRoot(
  values: readonly SheetDrawing[],
  groupId: string,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const group = roots.find((root) => root.id === groupId);
  if (!group || !isShapeGroupDrawing(group))
    throw new TypeError("Ungroup target must be a current root shape group.");
  const parent = resolveShapeGroup(group, metrics).layout;
  if (parent.collapsed) throw new RangeError("Expand a collapsed group before ungrouping.");
  const released = group.members.map((member) => {
    const world = resolveShapeGroupChildLayout(parent, member);
    if (!world) throw new RangeError("Expand a collapsed group before ungrouping.");
    return releaseShapeGroupChild(member, world, metrics, group.shapeProperties);
  });
  const result = normalizeShapeDrawingForest(
    roots.flatMap((root) => (root.id === groupId ? released : [root])),
  );
  assertShapeDrawingForestLayouts(result, metrics);
  return result;
}
