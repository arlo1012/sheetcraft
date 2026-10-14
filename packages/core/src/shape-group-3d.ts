import { readPictureDataArray } from "./picture-data-array.js";
import { MAX_SHAPE_GROUP_NODES } from "./shape-group-limits.js";
import type { Choice, PictureRotation3d } from "./picture-detailed-style.js";
import {
  findShapeGroupNode,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "./shape-group.js";
import { normalizeShapeStyle } from "./shape-style.js";

export type ResolvedShapeGroup3dSource = {
  /** Detached source values only. Editable carrier styles never receive this descriptor. */
  rotation3d?: Choice<PictureRotation3d>;
  ownerPath: ShapeGroupPath | null;
  source: "group" | "leaf" | "absent";
  inherited: boolean;
  /** Exact genuine leaves affected by an edit to this camera authority. */
  affectedLeafPaths: ShapeGroupPath[];
};
function below(path: ShapeGroupPath, owner: ShapeGroupPath): boolean {
  return path.length >= owner.length && owner.every((id, index) => path[index] === id);
}
/** Exactly one body camera. Own leaf sources remain dormant beneath an active group camera. */
export function resolveShapeGroup3dSource(
  value: ShapeGroupDrawing,
  path: ShapeGroupPath,
): ResolvedShapeGroup3dSource {
  const root = normalizeShapeGroup(value);
  const target = findShapeGroupNode(root, path);
  if (!target) throw new TypeError("Shape group 3D target is missing or reparented.");
  const visits = traverseShapeGroup(root);
  const camera = visits.find(
    ({ node, path: owner }) =>
      node.kind === "shapeGroup" &&
      node.group3d?.rotation3d.kind === "value" &&
      below(target.path, owner),
  );
  if (camera && camera.node.kind === "shapeGroup")
    return {
      rotation3d: camera.node.group3d!.rotation3d,
      ownerPath: camera.path,
      source: "group",
      inherited: target.path.length !== camera.path.length,
      affectedLeafPaths: visits
        .filter(({ node, path: leaf }) => node.kind !== "shapeGroup" && below(leaf, camera.path))
        .map(({ path: leaf }) => leaf),
    };
  if (target.node.kind === "shapeGroup")
    return {
      ...(target.node.group3d ? { rotation3d: target.node.group3d.rotation3d } : {}),
      ownerPath: target.node.group3d ? target.path : null,
      source: target.node.group3d ? "group" : "absent",
      inherited: false,
      affectedLeafPaths: visits
        .filter(({ node, path: leaf }) => node.kind !== "shapeGroup" && below(leaf, target.path))
        .map(({ path: leaf }) => leaf),
    };
  if (target.node.kind === "equation")
    return { ownerPath: null, source: "absent", inherited: false, affectedLeafPaths: [] };
  return {
    ...(target.node.shapeStyle?.rotation3d
      ? { rotation3d: target.node.shapeStyle.rotation3d }
      : {}),
    ownerPath: target.node.shapeStyle?.rotation3d ? target.path : null,
    source: target.node.shapeStyle?.rotation3d ? "leaf" : "absent",
    inherited: false,
    affectedLeafPaths: [target.path],
  };
}

/**
 * One release boundary shared by Ungroup and singleton dissolution. A removed active
 * owner gives its camera VALUES to the surviving child: a genuine subgroup becomes
 * the new shared owner, or a genuine leaf becomes its own camera. Centers are derived
 * later from each new owner; no frames, body format or flat-text flags are projected.
 * This nested ownership rule is product behavior, not measured WPS nesting parity.
 * A still-active ancestor remains authority, so dissolving a dormant owner copies nothing.
 */
export function materializeShapeGroup3dReleaseChildren(
  value: ShapeGroupDrawing,
  releasedOwnerPath: ShapeGroupPath,
  survivingChildren: readonly ShapeGroupChild[],
): ShapeGroupChild[] {
  const root = normalizeShapeGroup(value);
  const owner = findShapeGroupNode(root, releasedOwnerPath);
  if (!owner || owner.node.kind !== "shapeGroup")
    throw new TypeError("Shape group 3D release requires an exact current owner path.");
  const visits = traverseShapeGroup(root);
  const originals = new Map(visits.map((visit) => [visit.node.id, visit]));
  const rotation3d = owner.node.group3d?.rotation3d;
  // Nested active scenes are rejected by normalization; a dormant owner has no
  // values to transfer, including when an active camera survives above it.
  const materialize = rotation3d?.kind === "value";
  const releasedIds = new Set<string>();
  return readPictureDataArray(
    survivingChildren,
    "shape group 3D release children",
    MAX_SHAPE_GROUP_NODES,
  ).map((survivingChild) => {
    const child = normalizeShapeGroupChild(survivingChild);
    const original = originals.get(child.id);
    if (
      !original ||
      original.node.kind !== child.kind ||
      original.path.length <= owner.path.length ||
      !below(original.path, owner.path)
    )
      throw new TypeError("Shape group 3D release child is missing or reparented.");
    // Deletion may promote a deeper survivor or prune a surviving subgroup. It
    // may not smuggle a new identity or another branch into this release boundary.
    const pending = [child];
    while (pending.length) {
      const node = pending.pop()!;
      const source = originals.get(node.id);
      if (!source || source.node.kind !== node.kind || !below(source.path, original.path))
        throw new TypeError("Shape group 3D release must retain existing subtree identities.");
      if (releasedIds.has(node.id))
        throw new TypeError("Shape group 3D release cannot duplicate subtree identities.");
      releasedIds.add(node.id);
      if (node.kind === "shapeGroup") pending.push(...node.members);
    }
    if (!materialize) return child;
    if (child.kind === "equation") throw new TypeError("Equation 3D release is unsupported.");
    return normalizeShapeGroupChild(
      child.kind === "shapeGroup"
        ? { ...child, group3d: { rotation3d: rotation3d! } }
        : { ...child, shapeStyle: normalizeShapeStyle({ ...child.shapeStyle, rotation3d }) },
    );
  });
}
/** Singular promotion uses the same exact-source release boundary as batch Ungroup. */
export function materializeShapeGroup3dRelease(
  value: ShapeGroupDrawing,
  releasedOwnerPath: ShapeGroupPath,
  survivingChild: ShapeGroupChild,
): ShapeGroupChild {
  return materializeShapeGroup3dReleaseChildren(value, releasedOwnerPath, [survivingChild])[0]!;
}
