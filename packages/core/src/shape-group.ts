import { readPictureDataArray } from "./picture-data-array.js";
import { normalizePictureAngle } from "./picture-frame.js";
import { normalizePictureGroupLocalRect } from "./picture-group.js";
import { normalizeShapeFrame, type ShapeFrame } from "./shape-frame.js";
import {
  normalizeShapeObjectProperties,
  type ShapeObjectProperties,
} from "./shape-object-properties.js";
import {
  getShapeStyleAssetIds,
  normalizeShapeStyle,
  type ShapeDetailedStyle,
} from "./shape-style.js";
import { getShapeTextAssetIds } from "./shape-text.js";
import { normalizeSheetDrawing, type SheetFramedGraphicDrawing } from "./sheet-drawings.js";
import { MAX_SHAPE_GROUP_DEPTH, MAX_SHAPE_GROUP_NODES } from "./shape-group-limits.js";
export { MAX_SHAPE_GROUP_DEPTH, MAX_SHAPE_GROUP_NODES } from "./shape-group-limits.js";

/** Document-owned body effects only; containers do not own fill, line or theme styles. */
export type ShapeGroupEffects = {
  shadow?: ShapeDetailedStyle["shadow"];
};
export type ShapeGroupLocalRect = {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
};
/** Source-free owner-relative dimensions; rotation belongs only to the drawing. */
export type ShapeGroupLocalFrame = {
  kind: "shape-group-local-v1";
  rect: ShapeGroupLocalRect;
};
export type SheetGroupedGraphicDrawing = Omit<SheetFramedGraphicDrawing, "shapeFrame"> & {
  groupFrame: ShapeGroupLocalFrame;
};
export type ShapeGroupedGroup = {
  kind: "shapeGroup";
  id: string;
  name: string;
  groupFrame: ShapeGroupLocalFrame;
  /** Relative to the immediate owner, in clockwise screen coordinates. */
  rotation: number;
  shapeProperties?: ShapeObjectProperties;
  groupEffects?: ShapeGroupEffects;
  /** Bottom-to-top sibling order; this array is the only ownership relation. */
  members: ShapeGroupChild[];
};
export type ShapeGroupChild = SheetGroupedGraphicDrawing | ShapeGroupedGroup;
export type ShapeGroupDrawing = {
  kind: "shapeGroup";
  id: string;
  name: string;
  shapeFrame: ShapeFrame;
  rotation: number;
  shapeProperties?: ShapeObjectProperties;
  groupEffects?: ShapeGroupEffects;
  members: ShapeGroupChild[];
};
export type ShapeGroupNode = ShapeGroupDrawing | ShapeGroupChild;
/** Includes the root ID and every owner ID before the target ID. */
export type ShapeGroupPath = readonly string[];
export type ShapeGroupVisit = {
  node: ShapeGroupNode;
  path: ShapeGroupPath;
  parentPath: ShapeGroupPath | null;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown or conflicting ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError(`${name} must contain own data fields, not accessors.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
/** Reuse the exact shape shadow contract after rejecting every other effect category. */
export function normalizeShapeGroupEffects(value: unknown): ShapeGroupEffects | undefined {
  if (value === undefined) return undefined;
  const style = normalizeShapeStyle(record(value, ["shadow"], "shape group effects"));
  return style?.shadow ? { shadow: style.shadow } : undefined;
}
function nonempty(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty.`);
  return value;
}
function kind(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.getOwnPropertyDescriptor(value, "kind")?.value
    : undefined;
}
/** Placement guards do not evaluate user-supplied fields; normalization owns validation. */
export function isShapeGroupDrawing(value: unknown): value is ShapeGroupDrawing {
  return kind(value) === "shapeGroup" && Object.hasOwn(value as object, "shapeFrame");
}
export function isShapeGroupedGroup(value: unknown): value is ShapeGroupedGroup {
  return kind(value) === "shapeGroup" && Object.hasOwn(value as object, "groupFrame");
}
export function isSheetGroupedGraphicDrawing(value: unknown): value is SheetGroupedGraphicDrawing {
  const tag = kind(value);
  return (tag === "shape" || tag === "textBox") && Object.hasOwn(value as object, "groupFrame");
}
export function isShapeGroupNode(value: unknown): value is ShapeGroupNode {
  return (
    isShapeGroupDrawing(value) || isShapeGroupedGroup(value) || isSheetGroupedGraphicDrawing(value)
  );
}

const groupKeys = [
  "kind",
  "id",
  "name",
  "rotation",
  "shapeProperties",
  "groupEffects",
  "members",
] as const;
const leafKeys = [
  "kind",
  "id",
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
  "shapeConnector",
  "shapeFlipX",
  "shapeFlipY",
  "shapeStyle",
  "shapeText",
  "textDirection",
  "shapeProperties",
  "groupFrame",
] as const;
function nodeRecord(value: unknown, root: boolean): Record<string, unknown> {
  if (root && kind(value) === "shapeGroup")
    return record(value, [...groupKeys, "shapeFrame"], "root shape group");
  if (!root && kind(value) === "shapeGroup")
    return record(value, [...groupKeys, "groupFrame"], "nested shape group");
  if (!root && (kind(value) === "shape" || kind(value) === "textBox"))
    return record(value, leafKeys, "grouped graphic drawing");
  throw new TypeError(root ? "Expected a root shape group." : "Unknown shape group child kind.");
}

/** Validate the entire ownership graph before normalizing any appearance or placement. */
function preflight(values: readonly unknown[], roots: boolean): void {
  const entries = readPictureDataArray(values, "shape group collection", MAX_SHAPE_GROUP_NODES);
  const pending = entries.map((value) => ({ value, depth: 0, root: roots }));
  const seen = new WeakSet<object>();
  const ids = new Set<string>();
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.depth > MAX_SHAPE_GROUP_DEPTH)
      throw new RangeError("Shape group depth budget exceeded.");
    if (entry.value && typeof entry.value === "object") {
      if (seen.has(entry.value)) throw new TypeError("Cyclic or shared shape group ownership.");
      seen.add(entry.value);
    }
    const node = nodeRecord(entry.value, entry.root);
    if (++count > MAX_SHAPE_GROUP_NODES) throw new RangeError("Shape group node budget exceeded.");
    const id = nonempty(node.id, "Shape group node ID");
    if (ids.has(id)) throw new TypeError("Duplicate shape group node IDs.");
    ids.add(id);
    if (node.kind !== "shapeGroup") continue;
    const members = readPictureDataArray(
      node.members as readonly unknown[],
      "shape group members",
      MAX_SHAPE_GROUP_NODES,
    );
    if (members.length === 0)
      throw new TypeError("A durable shape group must own at least one child.");
    const owned = node.members as object;
    if (seen.has(owned)) throw new TypeError("Cyclic or shared shape group ownership.");
    seen.add(owned);
    if (count + pending.length + members.length > MAX_SHAPE_GROUP_NODES)
      throw new RangeError("Shape group node budget exceeded.");
    for (let index = members.length - 1; index >= 0; index--)
      pending.push({ value: members[index], depth: entry.depth + 1, root: false });
  }
}

export function normalizeShapeGroupLocalRect(value: ShapeGroupLocalRect): ShapeGroupLocalRect {
  return normalizePictureGroupLocalRect(value);
}
export function normalizeShapeGroupLocalFrame(value: ShapeGroupLocalFrame): ShapeGroupLocalFrame {
  const source = record(value, ["kind", "rect"], "shape group local frame");
  if (source.kind !== "shape-group-local-v1")
    throw new TypeError("Unknown shape group local frame kind.");
  return {
    kind: "shape-group-local-v1",
    rect: normalizeShapeGroupLocalRect(source.rect as ShapeGroupLocalRect),
  };
}
function metadata(source: Record<string, unknown>) {
  if (typeof source.name !== "string") throw new TypeError("Shape group name must be a string.");
  const shapeProperties = normalizeShapeObjectProperties(source.shapeProperties);
  const groupEffects = normalizeShapeGroupEffects(source.groupEffects);
  return {
    id: nonempty(source.id, "Shape group node ID"),
    name: source.name,
    rotation: normalizePictureAngle(source.rotation as number),
    ...(shapeProperties ? { shapeProperties } : {}),
    ...(groupEffects ? { groupEffects } : {}),
  };
}
function normalizeChildUnchecked(value: ShapeGroupChild): ShapeGroupChild {
  const source = nodeRecord(value, false);
  const groupFrame = normalizeShapeGroupLocalFrame(source.groupFrame as ShapeGroupLocalFrame);
  if (source.kind === "shapeGroup")
    return {
      kind: "shapeGroup",
      ...metadata(source),
      groupFrame,
      members: (source.members as ShapeGroupChild[]).map(normalizeChildUnchecked),
    };
  const shapeProperties = normalizeShapeObjectProperties(source.shapeProperties);
  // Existing graphic validators retain their geometry, text, font and paint contracts.
  // This temporary view is never persisted and never creates a picture/source model.
  const appearance = { ...source };
  delete appearance.groupFrame;
  delete appearance.shapeProperties;
  const normalized = normalizeSheetDrawing({
    ...appearance,
    rotation: normalizePictureAngle(source.rotation as number),
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 0, y: 0, size: { width: 1, height: 1 } },
    },
  } as SheetFramedGraphicDrawing) as SheetFramedGraphicDrawing;
  const { shapeFrame: _frame, ...graphic } = normalized;
  return {
    ...graphic,
    kind: source.kind as "shape" | "textBox",
    groupFrame,
    ...(shapeProperties ? { shapeProperties } : {}),
  };
}
function normalizeGroupUnchecked(value: ShapeGroupDrawing): ShapeGroupDrawing {
  const source = nodeRecord(value, true);
  return {
    kind: "shapeGroup",
    ...metadata(source),
    shapeFrame: normalizeShapeFrame(source.shapeFrame as ShapeFrame),
    members: (source.members as ShapeGroupChild[]).map(normalizeChildUnchecked),
  };
}
export function normalizeShapeGroup(value: ShapeGroupDrawing): ShapeGroupDrawing {
  preflight([value], true);
  return normalizeGroupUnchecked(value);
}
export function normalizeShapeGroupChild(value: ShapeGroupChild): ShapeGroupChild {
  preflight([value], false);
  return normalizeChildUnchecked(value);
}
/** Collection preflight checks shared ownership and IDs across every owned tree. */
export function normalizeShapeGroupCollection(
  values: readonly ShapeGroupDrawing[],
): ShapeGroupDrawing[] {
  preflight(values, true);
  const result: ShapeGroupDrawing[] = [];
  for (let index = 0; index < values.length; index++)
    result.push(normalizeGroupUnchecked(values[index]!));
  return result;
}
export function cloneShapeGroup(value: ShapeGroupDrawing): ShapeGroupDrawing {
  return normalizeShapeGroup(value);
}
export function cloneShapeGroupChild<T extends ShapeGroupChild>(value: T): T {
  return normalizeShapeGroupChild(value) as T;
}
export function areShapeGroupsEqual(left: ShapeGroupDrawing, right: ShapeGroupDrawing): boolean {
  return JSON.stringify(normalizeShapeGroup(left)) === JSON.stringify(normalizeShapeGroup(right));
}
export function areShapeGroupChildrenEqual(left: ShapeGroupChild, right: ShapeGroupChild): boolean {
  return (
    JSON.stringify(normalizeShapeGroupChild(left)) ===
    JSON.stringify(normalizeShapeGroupChild(right))
  );
}

/** Ownership-checked preorder, preserving source node identities and sibling order. */
export function traverseShapeGroup(value: ShapeGroupDrawing): ShapeGroupVisit[] {
  preflight([value], true);
  const visits: ShapeGroupVisit[] = [];
  const pending: ShapeGroupVisit[] = [{ node: value, path: [value.id], parentPath: null }];
  while (pending.length) {
    const visit = pending.pop()!;
    visits.push(visit);
    if (visit.node.kind !== "shapeGroup") continue;
    for (let index = visit.node.members.length - 1; index >= 0; index--) {
      const child = visit.node.members[index]!;
      pending.push({ node: child, path: [...visit.path, child.id], parentPath: visit.path });
    }
  }
  return visits;
}
export function findShapeGroupNode(
  value: ShapeGroupDrawing,
  path: ShapeGroupPath,
): ShapeGroupVisit | undefined {
  const target = readPictureDataArray(path, "shape group path", MAX_SHAPE_GROUP_DEPTH + 1);
  for (const id of target) nonempty(id, "Shape group path ID");
  return traverseShapeGroup(value).find(
    (visit) =>
      visit.path.length === target.length && visit.path.every((id, index) => id === target[index]),
  );
}
/** Includes every owner and descendant ID, for worksheet-wide uniqueness checks. */
export function collectShapeGroupNodeIds(value: ShapeGroupDrawing): Set<string> {
  return new Set(traverseShapeGroup(value).map(({ node }) => node.id));
}
/** Both body and glyph image fills remain owned even when a descendant cannot paint. */
export function collectShapeGroupAssetIds(value: ShapeGroupDrawing): Set<string> {
  const ids = new Set<string>();
  for (const { node } of traverseShapeGroup(value)) {
    if (node.kind === "shapeGroup") continue;
    for (const id of getShapeStyleAssetIds(node.shapeStyle)) ids.add(id);
    for (const id of getShapeTextAssetIds(node.shapeText)) ids.add(id);
  }
  return ids;
}
