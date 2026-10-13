import { resolveShapeGroup3dSource } from "./shape-group-3d.js";
import type { Choice, PictureRotation3d } from "./picture-detailed-style.js";
import { normalizeShapeStyle } from "./shape-style.js";
import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { resolvePictureLayout } from "./picture-frame.js";
import { normalizeShapeFrameSize } from "./shape-frame.js";
import {
  cloneShapeGroupChild,
  findShapeGroupNode,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  normalizeShapeGroup3d,
  normalizeShapeGroupChild,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupNode,
  type ShapeGroupPath,
} from "./shape-group.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  type ShapeGroupParentLayout,
  type ResolvedShapeGroupNode,
} from "./shape-group-layout.js";
import {
  normalizeShapeObjectProperties,
  type ShapeObjectProperties,
} from "./shape-object-properties.js";

/** Exact-path compare-and-swap. No intrinsic picture/source identity is invented for a shape. */
export type ShapeGroupNodeLease = {
  readonly path: ShapeGroupPath;
  readonly node: ShapeGroupNode;
  /** Canonical owner placement/metadata and immediate sibling-ID order, outermost first. */
  readonly owners: readonly string[];
};
export type ShapeGroupChildMetadataEdit = {
  name?: string;
  /** Explicit {} clears sparse metadata; undefined retains it. */
  shapeProperties?: ShapeObjectProperties;
};
export type ShapeGroupChildWorldEditOptions = {
  metadata?: ShapeGroupChildMetadataEdit;
  /** A leaf can change its appearance; a container must retain its complete owned members. */
  replacement?: ShapeGroupChild;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError(`Unknown or non-data ${name} field.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function readPath(value: ShapeGroupPath): string[] {
  const path = readPictureDataArray(value, "shape group path", MAX_SHAPE_GROUP_DEPTH + 1);
  if (!path.length || path.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Shape group paths require non-empty IDs.");
  return path;
}
function samePath(left: ShapeGroupPath, right: ShapeGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function ownerSnapshot(node: ShapeGroupNode): string {
  if (node.kind !== "shapeGroup")
    throw new TypeError("A shape group path requires exact group owners.");
  const { members, ...owner } = node;
  return JSON.stringify({ ...owner, members: members.map((member) => member.id) });
}
function nodeLease(root: ShapeGroupDrawing, path: ShapeGroupPath): ShapeGroupNodeLease {
  const target = findShapeGroupNode(root, path);
  if (!target) throw new TypeError("Shape group lease target is missing or reparented.");
  const owners: string[] = [];
  for (let length = 1; length < path.length; length++) {
    const owner = findShapeGroupNode(root, path.slice(0, length));
    if (!owner) throw new TypeError("Shape group lease owner is missing or reparented.");
    owners.push(ownerSnapshot(owner.node));
  }
  return {
    path: [...path],
    node:
      path.length === 1
        ? normalizeShapeGroup(root)
        : cloneShapeGroupChild(target.node as ShapeGroupChild),
    owners,
  };
}
function readLease(value: ShapeGroupNodeLease): ShapeGroupNodeLease {
  const fields = record(value, ["path", "node", "owners"], "shape group node lease");
  const path = readPath(fields.path as ShapeGroupPath);
  const owners = readPictureDataArray(
    fields.owners as readonly string[],
    "shape group owner leases",
    MAX_SHAPE_GROUP_DEPTH,
  );
  if (
    owners.length !== path.length - 1 ||
    owners.some((owner) => typeof owner !== "string" || !owner)
  )
    throw new TypeError("Shape group owner leases must match the exact path.");
  return {
    path,
    node:
      path.length === 1
        ? normalizeShapeGroup(fields.node as ShapeGroupDrawing)
        : normalizeShapeGroupChild(fields.node as ShapeGroupChild),
    owners,
  };
}
function sameLease(left: ShapeGroupNodeLease, right: ShapeGroupNodeLease): boolean {
  return (
    samePath(left.path, right.path) &&
    JSON.stringify(left.node) === JSON.stringify(right.node) &&
    left.owners.length === right.owners.length &&
    left.owners.every((owner, index) => owner === right.owners[index])
  );
}
export function leaseShapeGroupNode(
  value: ShapeGroupDrawing,
  pathValue: ShapeGroupPath,
): ShapeGroupNodeLease {
  return nodeLease(normalizeShapeGroup(value), readPath(pathValue));
}
/** Validate all paths before pruning, including stale descendants selected beneath an ancestor. */
export function deduplicateShapeGroupPaths(
  value: ShapeGroupDrawing,
  pathValues: readonly ShapeGroupPath[],
): ShapeGroupPath[] {
  const root = normalizeShapeGroup(value);
  const paths = readPictureDataArray(
    pathValues,
    "shape group selection",
    MAX_SHAPE_GROUP_NODES,
  ).map(readPath);
  const visits = new Map(traverseShapeGroup(root).map((visit) => [visit.node.id, visit]));
  for (const path of paths)
    if (!samePath(visits.get(path.at(-1)!)?.path ?? [], path))
      throw new TypeError("Shape group selection target is missing or reparented.");
  const selected = new Set(paths.map((path) => path.at(-1)!));
  const retained = new Set<string>();
  return paths.filter((path) => {
    const id = path.at(-1)!;
    if (retained.has(id) || path.slice(0, -1).some((owner) => selected.has(owner))) return false;
    retained.add(id);
    return true;
  });
}
function findResolvedNode(
  root: ResolvedShapeGroupNode,
  path: ShapeGroupPath,
): ResolvedShapeGroupNode | undefined {
  if (samePath(root.path, path)) return root;
  if (!("members" in root)) return undefined;
  for (const child of root.members) {
    const found = findResolvedNode(child, path);
    if (found) return found;
  }
  return undefined;
}
function sameWorld(left: ShapeGroupParentLayout, right: ShapeGroupParentLayout): boolean {
  return (
    left.angleDeg === right.angleDeg &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.rect.width === right.rect.width &&
    left.rect.height === right.rect.height
  );
}
function applyMetadata(
  child: ShapeGroupChild,
  value: ShapeGroupChildMetadataEdit | undefined,
): ShapeGroupChild {
  if (value === undefined) return child;
  const fields = record(value, ["name", "shapeProperties"], "shape group child metadata");
  if (fields.name !== undefined && typeof fields.name !== "string")
    throw new TypeError("Shape group child names must be strings.");
  const { shapeProperties: previous, ...appearance } = child;
  const shapeProperties =
    fields.shapeProperties === undefined
      ? previous
      : normalizeShapeObjectProperties(fields.shapeProperties);
  return {
    ...appearance,
    ...(fields.name === undefined ? {} : { name: fields.name as string }),
    ...(shapeProperties ? { shapeProperties } : {}),
  };
}
/** Exact immediate-owner inverse placement; ordinary member edits never contract the group frame. */
export function applyShapeGroupChildWorldEdit(
  value: ShapeGroupDrawing,
  leaseValue: ShapeGroupNodeLease,
  worldValue: ShapeGroupParentLayout,
  metrics: PictureSheetMetrics,
  optionsValue: ShapeGroupChildWorldEditOptions = {},
): ShapeGroupDrawing {
  const resolved = resolveShapeGroup(value, metrics);
  const lease = readLease(leaseValue);
  const target = findResolvedNode(resolved, lease.path);
  if (!target || !sameLease(nodeLease(resolved.node, target.path), lease))
    throw new TypeError("Shape group edit lease is stale, missing or reparented.");
  if (lease.path.length < 2)
    throw new TypeError("An owned-child edit requires an immediate shape group owner.");
  const parent = findResolvedNode(resolved, lease.path.slice(0, -1));
  if (!parent || !("members" in parent))
    throw new TypeError("Shape group edit requires its exact immediate owner.");
  if (!parent.layout || parent.layout.collapsed || !target.layout)
    throw new RangeError("Expand a collapsed group before editing an owned child.");
  const options = record(
    optionsValue,
    ["metadata", "replacement"],
    "shape group child edit options",
  );
  let replacement = target.node as ShapeGroupChild;
  if (options.replacement !== undefined) {
    replacement = normalizeShapeGroupChild(options.replacement as ShapeGroupChild);
    if (replacement.id !== target.node.id || replacement.kind !== target.node.kind)
      throw new TypeError("A shape child replacement must retain its kind and ID.");
    if (
      replacement.kind === "shapeGroup" &&
      target.node.kind === "shapeGroup" &&
      JSON.stringify(replacement.members) !== JSON.stringify(target.node.members)
    )
      throw new TypeError("A shape container replacement must retain its complete owned members.");
  }
  replacement = applyMetadata(
    replacement,
    options.metadata as ShapeGroupChildMetadataEdit | undefined,
  );
  const worldFields = record(
    worldValue,
    ["rect", "angleDeg", "collapsed", "corners", "bounds"],
    "shape child world layout",
  );
  const rect = record(
    worldFields.rect,
    ["x", "y", "width", "height"],
    "shape child world rectangle",
  );
  const world = resolvePictureLayout(
    rect as ShapeGroupParentLayout["rect"],
    worldFields.angleDeg as number,
  );
  const placement = placeShapeGroupChild(parent.layout, world);
  if (placement.status !== "placed")
    throw new RangeError("Expand a collapsed group before editing an owned child.");
  const local = sameWorld(target.layout, world)
    ? { groupFrame: (target.node as ShapeGroupChild).groupFrame, rotation: target.node.rotation }
    : placement;
  const nextChild = normalizeShapeGroupChild({
    ...replacement,
    groupFrame: local.groupFrame,
    rotation: local.rotation,
  });
  const root = resolved.node;
  const owner = findShapeGroupNode(root, parent.path)?.node;
  if (!owner || owner.kind !== "shapeGroup")
    throw new TypeError("Shape group edit requires its exact immediate owner.");
  const index = owner.members.findIndex((child) => child.id === target.node.id);
  if (index < 0) throw new TypeError("Shape group edit target is missing from its owner.");
  owner.members[index] = nextChild;
  const next = resolveShapeGroup(root, metrics);
  if (
    target.layout.rect.width !== world.rect.width ||
    target.layout.rect.height !== world.rect.height
  ) {
    // Worksheet projection can legitimately be subpixel. Explicit resizing owns
    // edit-time size limits for the target and every resized descendant instead.
    function assertEditableSizes(node: ResolvedShapeGroupNode): void {
      if (!node.layout)
        throw new RangeError("Expand a collapsed group before resizing an owned child.");
      normalizeShapeFrameSize({ width: node.layout.rect.width, height: node.layout.rect.height });
      if ("members" in node) for (const child of node.members) assertEditableSizes(child);
    }
    const edited = findResolvedNode(next, target.path);
    if (!edited) throw new TypeError("Shape group resized target is missing.");
    assertEditableSizes(edited);
  }
  return next.node;
}

export type ShapeGroup3dRotationLease = {
  readonly selectedNode: ShapeGroupNodeLease;
  /** Complete canonical camera-authority subtree, not only its immediate member IDs. */
  readonly cameraOwner: ShapeGroupNodeLease;
};
/** Dedicated shared-scope capture; ordinary selected-node leases keep their existing behavior. */
export function leaseShapeGroup3dRotation(
  value: ShapeGroupDrawing,
  pathValue: ShapeGroupPath,
): ShapeGroup3dRotationLease {
  const root = normalizeShapeGroup(value);
  const selectedNode = nodeLease(root, readPath(pathValue));
  const effective = resolveShapeGroup3dSource(root, selectedNode.path);
  const ownerPath =
    effective.source === "group" && effective.rotation3d?.kind === "value"
      ? effective.ownerPath!
      : selectedNode.path;
  return { selectedNode, cameraOwner: nodeLease(root, ownerPath) };
}
function readShapeGroup3dRotationLease(
  value: ShapeGroup3dRotationLease,
): ShapeGroup3dRotationLease {
  const fields = record(value, ["selectedNode", "cameraOwner"], "shape group 3D rotation lease");
  return {
    selectedNode: readLease(fields.selectedNode as ShapeGroupNodeLease),
    cameraOwner: readLease(fields.cameraOwner as ShapeGroupNodeLease),
  };
}

export type ShapeGroup3dRotationEdit = {
  root: ShapeGroupDrawing;
  /** The true shared-scene owner, even when a selected leaf initiated the edit. */
  ownerPath: ShapeGroupPath;
  affectedLeafPaths: ShapeGroupPath[];
};
/** Source-only exact-lease edit. Web admission remains closed until all paint consumers agree. */
export function applyShapeGroup3dRotationEdit(
  value: ShapeGroupDrawing,
  leaseValue: ShapeGroup3dRotationLease,
  rotationValue: Choice<PictureRotation3d>,
): ShapeGroup3dRotationEdit {
  const root = normalizeShapeGroup(value);
  const lease = readShapeGroup3dRotationLease(leaseValue);
  const target = findShapeGroupNode(root, lease.selectedNode.path);
  if (!target || !sameLease(nodeLease(root, target.path), lease.selectedNode))
    throw new TypeError("Shape group 3D edit lease is stale, missing or reparented.");
  const rotation3d = normalizeShapeGroup3d({ rotation3d: rotationValue })!.rotation3d;
  const effective = resolveShapeGroup3dSource(root, target.path);
  const ownerPath =
    effective.source === "group" && effective.rotation3d?.kind === "value"
      ? effective.ownerPath!
      : target.path;
  if (
    !samePath(ownerPath, lease.cameraOwner.path) ||
    !sameLease(nodeLease(root, ownerPath), lease.cameraOwner)
  )
    throw new TypeError(
      "Shape group 3D camera-owner subtree lease is stale, missing or reparented.",
    );
  const owner = findShapeGroupNode(root, ownerPath)!.node;
  if (owner.kind === "shapeGroup") owner.group3d = { rotation3d };
  else owner.shapeStyle = normalizeShapeStyle({ ...owner.shapeStyle, rotation3d });
  return {
    root: normalizeShapeGroup(root),
    ownerPath: [...ownerPath],
    affectedLeafPaths: effective.affectedLeafPaths.map((path) => [...path]),
  };
}
