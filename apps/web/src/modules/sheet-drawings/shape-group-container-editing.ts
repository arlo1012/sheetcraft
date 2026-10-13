import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  findShapeGroupNode,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import {
  applyShapeGroupChildWorldEdit,
  leaseShapeGroupNode,
} from "@sheetcraft/core/shape-group-edit";
import {
  resolveShapeGroup,
  placeShapeGroupChild,
  type ResolvedShapeGroupNode,
  type ShapeGroupParentLayout,
} from "@sheetcraft/core/shape-group-layout";
import { releaseShapeGroupChild } from "@sheetcraft/core/shape-group-planning";
import { materializeShapeGroup3dReleaseChildren } from "@sheetcraft/core/shape-group-3d";

function resolvedNode(
  root: ResolvedShapeGroupNode,
  path: ShapeGroupPath,
): ResolvedShapeGroupNode | undefined {
  if (root.path.length === path.length && root.path.every((id, i) => id === path[i])) return root;
  if ("members" in root)
    for (const child of root.members) {
      const found = resolvedNode(child, path);
      if (found) return found;
    }
}

/** Containers keep a real immediate owner; a world edit never invents leaf appearance. */
export function updateOwnedShapeContainer(
  root: ShapeGroupDrawing,
  path: ShapeGroupPath,
  world: ShapeGroupParentLayout,
  metrics: PictureSheetMetrics,
): ShapeGroupDrawing {
  if (path.length < 2) throw new TypeError("A nested container edit requires an owned path.");
  const node = findShapeGroupNode(root, path)?.node;
  if (!node || node.kind !== "shapeGroup")
    throw new TypeError("Nested shape container is missing.");
  return applyShapeGroupChildWorldEdit(root, leaseShapeGroupNode(root, path), world, metrics);
}

/** Release one nested level into its immediate owner, at its existing stack slot. */
export function ungroupOwnedShapeContainer(
  root: ShapeGroupDrawing,
  path: ShapeGroupPath,
  metrics: PictureSheetMetrics,
): ShapeGroupDrawing {
  if (path.length < 2) throw new TypeError("An owned Ungroup requires a nested container path.");
  const resolved = resolveShapeGroup(root, metrics),
    target = resolvedNode(resolved, path),
    parent = resolvedNode(resolved, path.slice(0, -1));
  if (
    !target ||
    !("members" in target) ||
    !parent ||
    !("members" in parent) ||
    !parent.layout ||
    parent.layout.collapsed ||
    !target.layout ||
    target.layout.collapsed
  )
    throw new RangeError("Expand the actual nested container before ungrouping.");
  const releaseSources = materializeShapeGroup3dReleaseChildren(
    root,
    path,
    target.members.map((child) => child.node),
  );
  const promoted = target.members.map((child, childIndex) => {
    if (!child.layout) throw new RangeError("An unplaced nested member cannot be ungrouped.");
    const released = releaseShapeGroupChild(
      releaseSources[childIndex]!,
      child.layout,
      metrics,
      root.shapeProperties,
      target.node.hidden,
    );
    if (released.kind !== "shapeGroup" && !isFramedShapeDrawing(released))
      throw new TypeError("Invalid released shape member.");
    const { shapeFrame: _frame, ...appearance } = released;
    const placement = placeShapeGroupChild(parent.layout!, child.layout);
    if (placement.status !== "placed")
      throw new RangeError("Nested owner has no invertible placement.");
    return normalizeShapeGroupChild({
      ...appearance,
      groupFrame: placement.groupFrame,
      rotation: placement.rotation,
    });
  });
  const next = normalizeShapeGroup(root),
    owner = findShapeGroupNode(next, path.slice(0, -1))?.node;
  if (!owner || owner.kind !== "shapeGroup") throw new TypeError("Nested owner changed.");
  const index = owner.members.findIndex((child) => child.id === target.node.id);
  if (index < 0) throw new TypeError("Nested container changed.");
  owner.members.splice(index, 1, ...promoted);
  const result = normalizeShapeGroup(next);
  resolveShapeGroup(result, metrics);
  return result;
}
