import {
  areFloatingImageCollectionsEqual,
  cloneFloatingImage,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import {
  pictureFrameContainsPoint,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
  type PictureGroupNodeLease,
} from "@sheetcraft/core/picture-group-edit";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupNode,
} from "@sheetcraft/core/picture-group-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getPictureGroupViewportFragments,
  projectPictureGroupLayoutIntoPane,
  rotatePictureGroupBy,
} from "@sheetcraft/sheet-engine/picture-group-geometry";
import {
  movePictureLayoutBy,
  resizePictureLayoutBy,
  rotatePictureLayoutBy,
} from "@sheetcraft/sheet-engine/picture-layout-edit";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getPictureViewportFragments,
  type PictureViewportFragment,
} from "./picture-viewport-fragments";
import type { PictureSelectionFrameFragment } from "./picture-selection-frame";
import { hitPictureViewportPoint } from "./picture-hit-testing";
import {
  movePictureRootSelectionBy,
  resizePictureRootSelectionBy,
} from "./picture-root-selection-planning";

export type PictureGroupSelection = {
  rootIds: readonly string[];
  path: PictureGroupPath | null;
};
export type PictureGroupInteractionContext = {
  roots: readonly FloatingImage[];
  owner?: object;
  revision: number;
  layout: SheetViewportLayout;
  frameContext: PictureFrameLayoutContext;
  scale: number;
  readOnly: boolean;
};
export type PictureGroupInteractionSnapshot = {
  context: PictureGroupInteractionContext;
  /** Detached complete forest; previews never drop unrelated or hidden roots. */
  roots: FloatingImage[];
  path: PictureGroupPath;
  rootIds: string[];
  lease: PictureGroupNodeLease;
  world: ResolvedPictureLayout;
  lockAspectRatio: boolean;
};
export type PictureGroupInteractionMode = "move" | "rotate" | FloatingImageResizeDirection;

export function samePictureGroupPath(
  left: PictureGroupPath | null | undefined,
  right: PictureGroupPath | null | undefined,
): boolean {
  return left == null || right == null
    ? left == null && right == null
    : left.length === right.length && left.every((id, index) => id === right[index]);
}
export function samePictureGroupSelection(
  left: PictureGroupSelection,
  right: PictureGroupSelection,
): boolean {
  return (
    left.rootIds.length === right.rootIds.length &&
    left.rootIds.every((id, index) => id === right.rootIds[index]) &&
    samePictureGroupPath(left.path, right.path)
  );
}

export type PictureGroupSurfaceHit =
  | PictureViewportFragment
  | {
      kind: "group-frame";
      rootId: string;
      path: PictureGroupPath;
      paneId: PictureSelectionFrameFragment["paneId"];
      geometry: ResolvedPictureLayout;
      clippedBounds: PictureSelectionFrameFragment["clippedBounds"];
    };

/** All roots participate in hit ordering; a group behind a standalone cannot steal its hit. */
export function hitPictureRootAt(
  roots: readonly FloatingImage[],
  point: Point,
  layout: SheetViewportLayout,
  frameContext: PictureFrameLayoutContext,
  selectedFrameRootIds: readonly string[] = [],
): PictureGroupSurfaceHit | null {
  const visibleHit = hitPictureViewportPoint(roots, point, layout, frameContext);
  if (visibleHit) return visibleHit;
  // Container gap fallback is allowed only when no real source-bearing root hit exists.
  for (let index = roots.length - 1; index >= 0; index--) {
    const root = roots[index]!;
    if (!isPictureGroup(root) || !selectedFrameRootIds.includes(root.id)) continue;
    for (const fragment of getPictureGroupViewportFragments(root, frameContext)) {
      const clip = layout.panes[fragment.paneId].clip;
      if (
        point.x >= clip.x &&
        point.x < clip.x + clip.width &&
        point.y >= clip.y &&
        point.y < clip.y + clip.height &&
        pictureFrameContainsPoint(fragment.geometry, point)
      )
        return { ...fragment, kind: "group-frame", rootId: root.id };
    }
  }
  return null;
}

export function resolveOwnedPictureNode(
  roots: readonly FloatingImage[],
  path: PictureGroupPath,
  context: PictureFrameLayoutContext,
): ResolvedPictureGroupNode | null {
  const root = roots.find((entry) => entry.id === path[0]);
  if (!isPictureGroup(root)) return null;
  function find(node: ResolvedPictureGroupNode): ResolvedPictureGroupNode | null {
    if (samePictureGroupPath(node.path, path)) return node;
    if ("members" in node)
      for (const child of node.members) {
        const found = find(child);
        if (found) return found;
      }
    return null;
  }
  return find(resolvePictureGroup(root, context.metrics));
}

/** Strip source geometry at the projection seam: a container is never a synthetic picture. */
export function getOwnedPictureSelectionFragments(
  roots: readonly FloatingImage[],
  path: PictureGroupPath,
  context: PictureFrameLayoutContext,
): PictureSelectionFrameFragment[] {
  const root = roots.find((entry) => entry.id === path[0]);
  if (!isPictureGroup(root)) return [];
  if (path.length === 1)
    return getPictureGroupViewportFragments(root, context).map(
      ({ paneId, geometry, clippedBounds }) => ({ paneId, geometry, clippedBounds }),
    );
  const target = resolveOwnedPictureNode(roots, path, context);
  if (!target?.visible || !target.layout || target.layout.collapsed) return [];
  return (["topLeft", "top", "left", "body"] as const).flatMap((paneId) => {
    const geometry = projectPictureGroupLayoutIntoPane(target.layout!, paneId, context.layout);
    const clip = context.layout.panes[paneId].clip;
    const x = Math.max(geometry.bounds.x, clip.x),
      y = Math.max(geometry.bounds.y, clip.y);
    const right = Math.min(geometry.bounds.x + geometry.bounds.width, clip.x + clip.width);
    const bottom = Math.min(geometry.bounds.y + geometry.bounds.height, clip.y + clip.height);
    return right > x && bottom > y
      ? [{ paneId, geometry, clippedBounds: { x, y, width: right - x, height: bottom - y } }]
      : [];
  });
}

export function capturePictureGroupInteraction(
  context: PictureGroupInteractionContext,
  path: PictureGroupPath,
  rootIds: readonly string[],
): PictureGroupInteractionSnapshot {
  if (context.readOnly || context.frameContext.layout !== context.layout)
    throw new TypeError("The picture group is not editable in this worksheet context.");
  if (!Number.isFinite(context.scale) || context.scale <= 0)
    throw new RangeError("A picture gesture requires a positive surface scale.");
  if (!rootIds.length || new Set(rootIds).size !== rootIds.length || !rootIds.includes(path[0]!))
    throw new TypeError("Picture selection requires exact, unique root IDs.");
  // Projection validates the entire forest, including hidden ownership and source geometry.
  getPictureViewportFragments(context.roots, context.layout, context.frameContext);
  if (rootIds.some((id) => !context.roots.some((root) => root.id === id)))
    throw new TypeError("A selected picture root is missing.");
  if (path.length > 1 && rootIds.length !== 1)
    throw new TypeError("An owned child requires one selected root.");
  const root = context.roots.find((entry) => entry.id === path[0]);
  if (!isPictureGroup(root))
    throw new TypeError("A picture group gesture requires its real owner.");
  const target = resolveOwnedPictureNode(context.roots, path, context.frameContext);
  if (!target?.visible || !target.layout || target.layout.collapsed)
    throw new TypeError("The exact picture group target is missing, hidden, or collapsed.");
  // Deliberately retain only the source-free resolved sheet layout.
  const layout: ResolvedPictureLayout = {
    rect: { ...target.layout.rect },
    angleDeg: target.layout.angleDeg,
    collapsed: target.layout.collapsed,
    corners: target.layout.corners.map((point) => ({
      ...point,
    })) as ResolvedPictureLayout["corners"],
    bounds: { ...target.layout.bounds },
  };
  return {
    context: { ...context },
    roots: context.roots.map(cloneFloatingImage),
    path: [...path],
    rootIds: [...rootIds],
    lease: leasePictureGroupNode(root, path),
    world: layout,
    lockAspectRatio: target.node.lockAspectRatio ?? target.node.kind === "grouped-picture-v1",
  };
}

/** Identity and complete structural equality are both required, including unrelated roots. */
export function isPictureGroupInteractionCurrent(
  snapshot: PictureGroupInteractionSnapshot,
  current: PictureGroupInteractionContext,
): boolean {
  const captured = snapshot.context;
  if (
    current.readOnly ||
    captured.owner !== current.owner ||
    captured.revision !== current.revision ||
    captured.roots !== current.roots ||
    captured.layout !== current.layout ||
    captured.frameContext !== current.frameContext ||
    captured.scale !== current.scale ||
    current.frameContext.layout !== current.layout
  )
    return false;
  try {
    return (
      areFloatingImageCollectionsEqual(snapshot.roots, current.roots) &&
      resolveOwnedPictureNode(current.roots, snapshot.path, current.frameContext)?.visible === true
    );
  } catch {
    return false;
  }
}

/** Every participant is planned from one stable snapshot; any failure rejects the whole result. */
export function planPictureGroupInteraction(
  snapshot: PictureGroupInteractionSnapshot,
  mode: PictureGroupInteractionMode,
  delta: Point,
  angleDelta = 0,
): FloatingImage[] {
  const { context, path, roots, rootIds } = snapshot;
  if (mode === "rotate" && rootIds.length > 1)
    throw new TypeError("Multi-root arbitrary rotation is not supported.");
  if (path.length > 1) {
    const root = roots.find((entry) => entry.id === path[0]);
    if (!isPictureGroup(root)) throw new TypeError("The picture group owner is missing.");
    const world =
      mode === "move"
        ? movePictureLayoutBy(snapshot.world, delta)
        : mode === "rotate"
          ? rotatePictureLayoutBy(snapshot.world, angleDelta)
          : resizePictureLayoutBy(snapshot.world, mode, delta, {
              minSize: 24,
              maxSize: MAX_FLOATING_IMAGE_SIZE,
              preserveCornerRatio: snapshot.lockAspectRatio,
            });
    if (!world) throw new TypeError("The owned picture target is collapsed.");
    const next = applyPictureGroupChildWorldEdit(
      root,
      snapshot.lease,
      world,
      context.frameContext.metrics,
    );
    return roots.map((entry) => (entry.id === root.id ? next : entry));
  }
  const selected = roots.filter((root) => rootIds.includes(root.id));
  const next =
    mode === "move"
      ? movePictureRootSelectionBy(selected, delta, context.layout, context.frameContext)
      : mode === "rotate"
        ? selected.map((root) =>
            isPictureGroup(root)
              ? rotatePictureGroupBy(root, angleDelta, context.frameContext.metrics)
              : null,
          )
        : resizePictureRootSelectionBy(
            selected,
            path[0]!,
            mode,
            delta,
            context.layout,
            context.frameContext,
            24,
          );
  if (!next || next.some((root) => root === null))
    throw new TypeError("A selected picture root cannot resolve this transform.");
  const changed = new Map(next.map((root) => [root!.id, root!]));
  return roots.map((root) => changed.get(root.id) ?? root);
}

/** Signed pointer angle about the real frame center; arbitrary angles stay arbitrary. */
export function pictureRotationPointerDelta(center: Point, start: Point, end: Point): number {
  const from = Math.atan2(start.y - center.y, start.x - center.x);
  const to = Math.atan2(end.y - center.y, end.x - center.x);
  const degrees = ((to - from) * 180) / Math.PI;
  return ((degrees + 540) % 360) - 180;
}
