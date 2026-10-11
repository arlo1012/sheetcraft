import { readPictureDataArray } from "./picture-data-array.js";
import { cloneImageTransform } from "./image-transform.js";
import { getDetailedPictureStyleAssetIds } from "./picture-detailed-style.js";
import {
  normalizePictureAngle,
  normalizePictureFrameAnchor,
  normalizePictureSourceFrame,
  type PictureFrameAnchor,
  type PictureSourceFrame,
} from "./picture-frame.js";
import type { PictureObjectAppearance } from "./picture-object.js";

/** Ownership budgets, not producer-format limits. Root depth is zero. */
export const MAX_PICTURE_GROUP_DEPTH = 32;
export const MAX_PICTURE_GROUP_NODES = 10_000;

export type PictureGroupLocalRect = {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
};
export type PictureGroupMemberLayout = {
  rect: PictureGroupLocalRect;
  /** Relative to the immediate owner, in clockwise screen coordinates. */
  angleDeg: number;
};
export type PictureGroupFrame = {
  kind: "group-frame-v1";
  anchor: PictureFrameAnchor;
  angleDeg: number;
};
export type PictureGroupMemberFrame = PictureGroupMemberLayout & {
  kind: "group-member-frame-v1";
  source: PictureSourceFrame;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};
export type PictureGroupLocalFrame = PictureGroupMemberLayout & {
  kind: "group-local-frame-v1";
};
type PictureGroupMetadata = {
  id: string;
  altText: string;
  hidden?: boolean;
  lockAspectRatio?: boolean;
};
export type GroupedPicture = PictureGroupMetadata & {
  kind: "grouped-picture-v1";
  assetId: string;
  frame: PictureGroupMemberFrame;
  transform?: PictureObjectAppearance;
};
export type GroupedGroup = PictureGroupMetadata & {
  kind: "grouped-group-v1";
  frame: PictureGroupLocalFrame;
  /** Bottom-to-top sibling order; this array is the only ownership relation. */
  members: PictureGroupChild[];
};
export type PictureGroupChild = GroupedPicture | GroupedGroup;
export type PictureGroup = PictureGroupMetadata & {
  kind: "picture-group-v1";
  frame: PictureGroupFrame;
  members: PictureGroupChild[];
};
export type PictureGroupNode = PictureGroup | PictureGroupChild;
/** Includes the root ID and every owner ID before the target ID. */
export type PictureGroupPath = readonly string[];
export type PictureGroupVisit = {
  node: PictureGroupNode;
  path: PictureGroupPath;
  parentPath: PictureGroupPath | null;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} must be an ordinary data record.`);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key)))
    throw new TypeError(`Unknown or conflicting ${name} field.`);
  if (
    Object.values(Object.getOwnPropertyDescriptors(value)).some((entry) => entry.get || entry.set)
  )
    throw new TypeError(`${name} must contain data fields, not accessors.`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return value === 0 ? 0 : value;
}
function nonempty(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty.`);
  return value;
}
function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") throw new TypeError(`Invalid ${name}.`);
  return value;
}

export function isPictureGroup(value: unknown): value is PictureGroup {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertyDescriptor(value, "kind")?.value === "picture-group-v1"
  );
}
export function isGroupedPicture(value: unknown): value is GroupedPicture {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertyDescriptor(value, "kind")?.value === "grouped-picture-v1"
  );
}
export function isGroupedGroup(value: unknown): value is GroupedGroup {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertyDescriptor(value, "kind")?.value === "grouped-group-v1"
  );
}

const metadataKeys = ["kind", "id", "altText", "hidden", "lockAspectRatio", "frame"] as const;
function nodeRecord(value: unknown, root: boolean): Record<string, unknown> {
  if (root && isPictureGroup(value))
    return record(value, [...metadataKeys, "members"], "picture group");
  if (!root && isGroupedGroup(value))
    return record(value, [...metadataKeys, "members"], "grouped group");
  if (!root && isGroupedPicture(value))
    return record(value, [...metadataKeys, "assetId", "transform"], "grouped picture");
  throw new TypeError(
    root ? "Expected a root picture group." : "Unknown or conflicting group child kind.",
  );
}

function assertOwnedArray(
  value: unknown,
  name: string,
  maximum = MAX_PICTURE_GROUP_NODES,
): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`Invalid ${name}.`);
  readPictureDataArray<unknown>(value, name, maximum);
}
function mapOwnedArray<T, R>(values: readonly T[], project: (value: T) => R): R[] {
  const result: R[] = [];
  for (let index = 0; index < values.length; index++) result.push(project(values[index]!));
  return result;
}

/**
 * Check the entire ownership graph before cloning any node. Reused node or
 * members-array identities are forbidden; value objects such as crop sources
 * may be reused by callers because normalization detaches them independently.
 */
function preflight(values: readonly unknown[], roots: boolean): void {
  assertOwnedArray(values, "picture group collection");
  if (values.length > MAX_PICTURE_GROUP_NODES)
    throw new RangeError("Picture group node budget exceeded.");
  const pending = mapOwnedArray(values, (value) => ({ value, depth: 0, root: roots }));
  const seen = new WeakSet<object>();
  const ids = new Set<string>();
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.depth > MAX_PICTURE_GROUP_DEPTH)
      throw new RangeError("Picture group depth budget exceeded.");
    const node = nodeRecord(entry.value, entry.root);
    if (seen.has(node)) throw new TypeError("Cyclic or shared picture group ownership.");
    seen.add(node);
    if (++count > MAX_PICTURE_GROUP_NODES)
      throw new RangeError("Picture group node budget exceeded.");
    const id = nonempty(node.id, "Picture group node ID");
    if (ids.has(id)) throw new TypeError("Duplicate picture group node IDs.");
    ids.add(id);
    if (node.kind === "grouped-picture-v1") continue;
    const members = node.members;
    assertOwnedArray(members, "picture group members");
    if (members.length === 0)
      throw new TypeError("A durable picture group must own at least one child.");
    if (seen.has(members)) throw new TypeError("Cyclic or shared picture group ownership.");
    seen.add(members);
    if (count + pending.length + members.length > MAX_PICTURE_GROUP_NODES)
      throw new RangeError("Picture group node budget exceeded.");
    for (let index = 0; index < members.length; index++)
      pending.push({ value: members[index], depth: entry.depth + 1, root: false });
  }
}

export function normalizePictureGroupLocalRect(
  value: PictureGroupLocalRect,
): PictureGroupLocalRect {
  const v = record(
    value,
    ["xRatio", "yRatio", "widthRatio", "heightRatio"],
    "picture group local rectangle",
  );
  const rect = {
    xRatio: finite(v.xRatio, "Local x ratio"),
    yRatio: finite(v.yRatio, "Local y ratio"),
    widthRatio: finite(v.widthRatio, "Local width ratio"),
    heightRatio: finite(v.heightRatio, "Local height ratio"),
  };
  if (rect.widthRatio <= 0 || rect.heightRatio <= 0)
    throw new RangeError("Picture group local dimensions must be positive.");
  return rect;
}
export function normalizePictureGroupFrame(value: PictureGroupFrame): PictureGroupFrame {
  const v = record(value, ["kind", "anchor", "angleDeg"], "picture group frame");
  if (v.kind !== "group-frame-v1") throw new TypeError("Unknown picture group frame kind.");
  return {
    kind: "group-frame-v1",
    anchor: normalizePictureFrameAnchor(v.anchor as PictureFrameAnchor),
    angleDeg: normalizePictureAngle(v.angleDeg as number),
  };
}
export function normalizePictureGroupLocalFrame(
  value: PictureGroupLocalFrame,
): PictureGroupLocalFrame {
  const v = record(value, ["kind", "rect", "angleDeg"], "picture group local frame");
  if (v.kind !== "group-local-frame-v1")
    throw new TypeError("Unknown picture group local frame kind.");
  return {
    kind: "group-local-frame-v1",
    rect: normalizePictureGroupLocalRect(v.rect as PictureGroupLocalRect),
    angleDeg: normalizePictureAngle(v.angleDeg as number),
  };
}
export function normalizePictureGroupMemberFrame(
  value: PictureGroupMemberFrame,
): PictureGroupMemberFrame {
  const v = record(
    value,
    ["kind", "rect", "angleDeg", "source", "flipHorizontal", "flipVertical"],
    "picture group member frame",
  );
  if (v.kind !== "group-member-frame-v1")
    throw new TypeError("Unknown picture group member frame kind.");
  const flipHorizontal = optionalBoolean(v.flipHorizontal, "picture horizontal flip");
  const flipVertical = optionalBoolean(v.flipVertical, "picture vertical flip");
  return {
    kind: "group-member-frame-v1",
    rect: normalizePictureGroupLocalRect(v.rect as PictureGroupLocalRect),
    angleDeg: normalizePictureAngle(v.angleDeg as number),
    source: normalizePictureSourceFrame(v.source as PictureSourceFrame),
    ...(flipHorizontal === undefined ? {} : { flipHorizontal }),
    ...(flipVertical === undefined ? {} : { flipVertical }),
  };
}
function metadata(v: Record<string, unknown>): PictureGroupMetadata {
  if (typeof v.altText !== "string")
    throw new TypeError("Picture group alt text must be a string.");
  const hidden = optionalBoolean(v.hidden, "picture group visibility");
  const lockAspectRatio = optionalBoolean(v.lockAspectRatio, "picture group aspect ratio lock");
  return {
    id: nonempty(v.id, "Picture group node ID"),
    altText: v.altText,
    ...(hidden === undefined ? {} : { hidden }),
    ...(lockAspectRatio === undefined ? {} : { lockAspectRatio }),
  };
}
/** Fixed-shape preflight: existing image validators still own all values and ranges. */
function dataFields(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} must be an ordinary data record.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      throw new TypeError(`${name} must contain ordinary data fields, not accessors or symbols.`);
  }
  return value as Record<string, unknown>;
}
function preflightOwnedTransform(value: unknown): void {
  const transform = record(value, ["appearance", "annotations"], "grouped picture transform");
  if (transform.appearance !== undefined) {
    const appearance = dataFields(transform.appearance, "grouped picture appearance");
    if (appearance.border !== undefined) dataFields(appearance.border, "grouped picture border");
  }
  if (transform.annotations !== undefined) {
    assertOwnedArray(transform.annotations, "grouped picture annotations", 100);
    for (let index = 0; index < transform.annotations.length; index++) {
      const annotation = dataFields(transform.annotations[index], "grouped picture annotation");
      assertOwnedArray(annotation.points, "grouped picture annotation points", 1024);
      for (let point = 0; point < annotation.points.length; point++)
        dataFields(annotation.points[point], "grouped picture annotation point");
    }
  }
}
function normalizeChildUnchecked(value: PictureGroupChild): PictureGroupChild {
  const v = nodeRecord(value, false);
  const common = metadata(v);
  if (v.kind === "grouped-group-v1") {
    return {
      kind: "grouped-group-v1",
      ...common,
      frame: normalizePictureGroupLocalFrame(v.frame as PictureGroupLocalFrame),
      members: mapOwnedArray(v.members as PictureGroupChild[], normalizeChildUnchecked),
    };
  }
  if (v.transform !== undefined) preflightOwnedTransform(v.transform);
  const transform = cloneImageTransform(v.transform as PictureObjectAppearance | undefined);
  return {
    kind: "grouped-picture-v1",
    ...common,
    assetId: nonempty(v.assetId, "Picture asset ID"),
    frame: normalizePictureGroupMemberFrame(v.frame as PictureGroupMemberFrame),
    ...(transform ? { transform: transform as PictureObjectAppearance } : {}),
  };
}
function normalizeGroupUnchecked(value: PictureGroup): PictureGroup {
  const v = nodeRecord(value, true);
  return {
    kind: "picture-group-v1",
    ...metadata(v),
    frame: normalizePictureGroupFrame(v.frame as PictureGroupFrame),
    members: mapOwnedArray(v.members as PictureGroupChild[], normalizeChildUnchecked),
  };
}
export function normalizePictureGroup(value: PictureGroup): PictureGroup {
  preflight([value], true);
  return normalizeGroupUnchecked(value);
}
export function normalizePictureGroupChild(value: PictureGroupChild): PictureGroupChild {
  preflight([value], false);
  return normalizeChildUnchecked(value);
}
export function normalizePictureGroupCollection(values: readonly PictureGroup[]): PictureGroup[] {
  preflight(values, true);
  return mapOwnedArray(values, normalizeGroupUnchecked);
}
export function clonePictureGroup(value: PictureGroup): PictureGroup {
  return normalizePictureGroup(value);
}
export function clonePictureGroupChild<T extends PictureGroupChild>(value: T): T {
  return normalizePictureGroupChild(value) as T;
}
export function arePictureGroupsEqual(left: PictureGroup, right: PictureGroup): boolean {
  return (
    JSON.stringify(normalizePictureGroup(left)) === JSON.stringify(normalizePictureGroup(right))
  );
}
export function arePictureGroupChildrenEqual(
  left: PictureGroupChild,
  right: PictureGroupChild,
): boolean {
  return (
    JSON.stringify(normalizePictureGroupChild(left)) ===
    JSON.stringify(normalizePictureGroupChild(right))
  );
}

/** Ownership-checked preorder, preserving source node identities and sibling order. */
export function traversePictureGroup(value: PictureGroup): PictureGroupVisit[] {
  preflight([value], true);
  const visits: PictureGroupVisit[] = [];
  const pending: PictureGroupVisit[] = [{ node: value, path: [value.id], parentPath: null }];
  while (pending.length) {
    const visit = pending.pop()!;
    visits.push(visit);
    if (visit.node.kind === "grouped-picture-v1") continue;
    for (let index = visit.node.members.length - 1; index >= 0; index--) {
      const child = visit.node.members[index]!;
      pending.push({ node: child, path: [...visit.path, child.id], parentPath: visit.path });
    }
  }
  return visits;
}
export function findPictureGroupNode(
  value: PictureGroup,
  path: PictureGroupPath,
): PictureGroupVisit | undefined {
  return traversePictureGroup(value).find(
    (visit) =>
      visit.path.length === path.length && visit.path.every((id, index) => id === path[index]),
  );
}
/** Hidden descendants retain their assets; containers never contribute a fake asset. */
export function collectPictureGroupAssetIds(value: PictureGroup): Set<string> {
  const ids = new Set<string>();
  for (const { node } of traversePictureGroup(value))
    if (node.kind === "grouped-picture-v1") {
      ids.add(node.assetId);
      for (const id of getDetailedPictureStyleAssetIds(node.transform?.appearance?.detailedStyle))
        ids.add(id);
    }
  return ids;
}
