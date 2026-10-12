import { resolveSheetShapeConnections } from "./shape-connector-layout.js";
import { materializeShapeConnectorTargets } from "./shape-connector-materialize.js";
import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  resolvePictureLayout,
} from "./picture-frame.js";
import {
  anchorShapeFrameRect,
  MAX_SHAPE_FRAME_SIZE,
  MIN_SHAPE_FRAME_SIZE,
  type ResolvedShapeFrame,
} from "./shape-frame.js";
import {
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupPath,
} from "./shape-group.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  unionShapeGroupLayoutRects,
  type ResolvedShapeGroup,
  type ResolvedShapeGroupChild,
} from "./shape-group-layout.js";
import {
  assertShapeDrawingForestLayouts,
  inheritShapeGroupOwnerProperties,
  normalizeShapeDrawingForest,
  releaseShapeGroupChild,
} from "./shape-group-planning.js";
import type { ShapeObjectProperties } from "./shape-object-properties.js";
import type { SheetDrawing } from "./sheet-drawings.js";

type PlannedChild = { node: ShapeGroupChild; layout: ResolvedShapeFrame; changed: boolean };
type PlannedOwner = { members: PlannedChild[]; layout: ResolvedShapeFrame; changed: boolean };

function readPath(value: ShapeGroupPath): string[] {
  const path = readPictureDataArray(value, "shape deletion path", MAX_SHAPE_GROUP_DEPTH + 1);
  if (!path.length || path.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Shape deletion paths require non-empty IDs.");
  return path;
}
function samePath(left: ShapeGroupPath, right: ShapeGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function inheritOwner(child: PlannedChild, owner: ShapeObjectProperties | undefined): PlannedChild {
  const { shapeProperties: _properties, ...node } = child.node;
  const shapeProperties = inheritShapeGroupOwnerProperties(child.node.shapeProperties, owner);
  return {
    ...child,
    node: { ...node, ...(shapeProperties ? { shapeProperties } : {}) },
    changed: true,
  };
}
function placeChild(child: PlannedChild, parent: ResolvedShapeFrame): ShapeGroupChild {
  const placement = placeShapeGroupChild(parent, child.layout);
  if (placement.status !== "placed")
    throw new RangeError("Expand a collapsed group before deleting an owned child.");
  return { ...child.node, groupFrame: placement.groupFrame, rotation: placement.rotation };
}
/** Contract in the owner's orthogonal axes; relative rotations do not enlarge layout boxes. */
function contractOwner(
  owner: ResolvedShapeFrame,
  children: readonly PlannedChild[],
): ResolvedShapeFrame {
  const union = unionShapeGroupLayoutRects(
    children.map(({ layout }) => {
      const center = pictureFrameWorldToLocal(owner.rect, owner.angleDeg, {
        x: layout.rect.x + layout.rect.width / 2,
        y: layout.rect.y + layout.rect.height / 2,
      });
      return {
        x: center.x - layout.rect.width / 2,
        y: center.y - layout.rect.height / 2,
        width: layout.rect.width,
        height: layout.rect.height,
      };
    }),
  );
  const center = pictureFrameLocalToWorld(owner.rect, owner.angleDeg, {
    x: union.x + union.width / 2,
    y: union.y + union.height / 2,
  });
  return resolvePictureLayout(
    {
      x: center.x - union.width / 2,
      y: center.y - union.height / 2,
      width: union.width,
      height: union.height,
    },
    owner.angleDeg,
  );
}

/**
 * Pure exact-path Delete plan. Only affected owners contract/dissolve. Surviving leaves
 * and subgroups retain world layout, identity, appearance and effective root lock/print.
 * Whole collapsed roots may be removed; descendant edits under collapse are refused.
 */
export function planDeleteShapeGroupNodes(
  values: readonly SheetDrawing[],
  selectedPaths: readonly ShapeGroupPath[],
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  let roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const pathsById = new Map<string, ShapeGroupPath>();
  for (const root of roots)
    if (isShapeGroupDrawing(root))
      for (const { node, path } of traverseShapeGroup(root)) pathsById.set(node.id, path);
    else pathsById.set(root.id, [root.id]);
  const paths = readPictureDataArray(
    selectedPaths,
    "shape deletion selection",
    MAX_SHAPE_GROUP_NODES,
  ).map(readPath);
  for (const path of paths)
    if (!samePath(pathsById.get(path.at(-1)!) ?? [], path))
      throw new TypeError("Shape deletion target is missing or reparented.");
  const selectedIds = new Set(paths.map((path) => path.at(-1)!));
  const deletedIds = new Set(
    paths
      .filter((path) => !path.slice(0, -1).some((owner) => selectedIds.has(owner)))
      .map((path) => path.at(-1)!),
  );
  const editedRoots = new Set(paths.filter((path) => path.length > 1).map((path) => path[0]!));

  const removalClosure = new Set(
    [...pathsById].filter(([, path]) => path.some((id) => deletedIds.has(id))).map(([id]) => id),
  );
  const survivingConnections = roots
    .flatMap<SheetDrawing | ShapeGroupChild>((root) =>
      isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node) : [root],
    )
    .filter((node) => node.kind === "shape" && node.shapeConnector && !removalClosure.has(node.id));
  const affected = survivingConnections.some(
    (node) =>
      node.kind === "shape" &&
      [node.shapeConnector!.begin, node.shapeConnector!.end].some(
        (end) => end.kind === "site" && removalClosure.has(end.targetId),
      ),
  );
  const detachedTips: { id: string; end: "begin" | "end"; x: number; y: number; scale: number }[] =
    [];
  if (affected) {
    roots = materializeShapeConnectorTargets(roots, [...removalClosure], metrics, {
      connectorIds: survivingConnections.map((node) => node.id),
    });
    const captured = resolveSheetShapeConnections(roots, metrics);
    for (const node of survivingConnections) {
      if (node.kind !== "shape") continue;
      const connection = captured.getConnector(node.id)!;
      for (const end of ["begin", "end"] as const) {
        const original = node.shapeConnector![end];
        if (original.kind !== "site" || !removalClosure.has(original.targetId)) continue;
        const tip = connection[end];
        if (tip.status !== "ready" || tip.kind !== "free" || !connection.carrierLayout)
          throw new RangeError(
            `Connector ${node.id} ${end} could not be captured before target deletion.`,
          );
        const rect = connection.carrierLayout.rect;
        detachedTips.push({
          id: node.id,
          end,
          x: tip.position.x,
          y: tip.position.y,
          scale: Math.max(
            1,
            Math.abs(tip.position.x),
            Math.abs(tip.position.y),
            Math.abs(rect.x),
            Math.abs(rect.y),
            rect.width,
            rect.height,
          ),
        });
      }
    }
  }

  // Resolve the detached source, not the old nodes whose attached endpoints were removed.
  const groups = new Map<string, ResolvedShapeGroup>();
  for (const root of roots)
    if (isShapeGroupDrawing(root)) groups.set(root.id, resolveShapeGroup(root, metrics));

  function planOwner(
    resolved: ResolvedShapeGroup | Extract<ResolvedShapeGroupChild, { members: unknown }>,
  ): PlannedOwner {
    const members: PlannedChild[] = [];
    let changed = false;
    for (const child of resolved.members) {
      const next = planChild(child);
      if (!next) changed = true;
      else {
        members.push(next);
        changed ||= next.changed;
      }
    }
    if (!resolved.layout || resolved.layout.collapsed)
      throw new RangeError("Expand a collapsed group before deleting an owned child.");
    return {
      members,
      changed,
      layout:
        changed && members.length > 1 ? contractOwner(resolved.layout, members) : resolved.layout,
    };
  }
  function planChild(resolved: ResolvedShapeGroupChild): PlannedChild | null {
    if (deletedIds.has(resolved.node.id)) return null;
    if (!resolved.layout)
      throw new RangeError("Expand a collapsed group before deleting an owned child.");
    if (!("members" in resolved))
      return { node: resolved.node, layout: resolved.layout, changed: false };
    const owner = planOwner(resolved);
    if (!owner.changed) return { node: resolved.node, layout: resolved.layout, changed: false };
    if (!owner.members.length) return null;
    if (owner.members.length === 1)
      return inheritOwner(owner.members[0]!, resolved.node.shapeProperties);
    return {
      node: {
        ...resolved.node,
        members: owner.members.map((child) => placeChild(child, owner.layout)),
      },
      layout: owner.layout,
      changed: true,
    };
  }

  const next: SheetDrawing[] = [];
  for (const root of roots) {
    if (deletedIds.has(root.id)) continue;
    const resolved = groups.get(root.id);
    if (!resolved || !editedRoots.has(root.id)) {
      next.push(root);
      continue;
    }
    const owner = planOwner(resolved);
    if (!owner.members.length) continue;
    if (owner.members.length === 1) {
      const survivor = inheritOwner(owner.members[0]!, resolved.node.shapeProperties);
      next.push(
        releaseShapeGroupChild(
          survivor.node,
          survivor.layout,
          metrics,
          resolved.node.shapeProperties,
        ),
      );
      continue;
    }
    const original = resolved.node.shapeFrame.anchor;
    const { width, height } = owner.layout.rect;
    const mode =
      original.mode !== "move-and-size" &&
      (width < MIN_SHAPE_FRAME_SIZE ||
        height < MIN_SHAPE_FRAME_SIZE ||
        width > MAX_SHAPE_FRAME_SIZE ||
        height > MAX_SHAPE_FRAME_SIZE)
        ? "move-and-size"
        : original.mode;
    next.push({
      ...resolved.node,
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: anchorShapeFrameRect(mode, owner.layout.rect, metrics, original),
      },
      members: owner.members.map((child) => placeChild(child, owner.layout)),
    });
  }
  const result = normalizeShapeDrawingForest(next);
  assertShapeDrawingForestLayouts(result, metrics);
  if (survivingConnections.length) {
    const final = resolveSheetShapeConnections(result, metrics);
    for (const captured of detachedTips) {
      const tip = final.getConnector(captured.id)?.[captured.end];
      const tolerance = Number.EPSILON * 64 * captured.scale;
      if (
        !tip ||
        tip.status !== "ready" ||
        tip.kind !== "free" ||
        Math.abs(tip.position.x - captured.x) > tolerance ||
        Math.abs(tip.position.y - captured.y) > tolerance
      )
        throw new RangeError(
          `Connector ${captured.id} ${captured.end} could not preserve its endpoint after owner deletion.`,
        );
    }
  }
  return result;
}
