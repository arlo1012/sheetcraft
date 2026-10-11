import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import {
  normalizePictureAngle,
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  resolvePictureAnchorRect,
  resolvePictureLayout,
  resolvePictureSourceLayout,
  type PictureFrameRect,
  type ResolvedPictureFrame,
  type ResolvedPictureLayout,
} from "./picture-frame.js";
import {
  normalizePictureGroup,
  normalizePictureGroupLocalRect,
  type GroupedGroup,
  type GroupedPicture,
  type PictureGroup,
  type PictureGroupChild,
  type PictureGroupMemberLayout,
  type PictureGroupPath,
} from "./picture-group.js";

export type PictureGroupPlacement =
  | { status: "placed"; frame: PictureGroupMemberLayout }
  | { status: "collapsed-parent" };
type ResolvedGroupNode<T> = {
  /** Detached canonical node. Resolved world geometry is never persisted in it. */
  node: T;
  path: PictureGroupPath;
  /** Includes ancestor visibility and root collapse. */
  visible: boolean;
};
export type ResolvedGroupedPicture = ResolvedGroupNode<GroupedPicture> & {
  /** Null while an ancestor's worksheet frame is collapsed. */
  layout: ResolvedPictureFrame | null;
};
export type ResolvedGroupedGroup = ResolvedGroupNode<GroupedGroup> & {
  layout: ResolvedPictureLayout | null;
  members: ResolvedPictureGroupChild[];
};
export type ResolvedPictureGroupChild = ResolvedGroupedPicture | ResolvedGroupedGroup;
export type ResolvedPictureGroup = ResolvedGroupNode<PictureGroup> & {
  layout: ResolvedPictureLayout;
  members: ResolvedPictureGroupChild[];
};
export type ResolvedPictureGroupNode = ResolvedPictureGroup | ResolvedPictureGroupChild;
export type PictureGroupParentLayout = Pick<ResolvedPictureLayout, "rect" | "angleDeg">;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value === 0 ? 0 : value;
}
function positiveProduct(left: number, right: number, name: string): number {
  const value = finite(left * right, name);
  if (value <= 0) throw new RangeError(`${name} underflow.`);
  return value;
}
function positiveQuotient(left: number, right: number, name: string): number {
  const value = finite(left / right, name);
  if (value <= 0) throw new RangeError(`${name} underflow.`);
  return value;
}

/**
 * Scale the child's unrotated layout before composing its relative rotation.
 * This preserves orthogonal corners during nonuniform parent resizing.
 */
export function resolvePictureGroupChildLayout(
  parentValue: PictureGroupParentLayout,
  value: PictureGroupMemberLayout,
): ResolvedPictureLayout | null {
  const parent = resolvePictureLayout(parentValue.rect, parentValue.angleDeg);
  const local = normalizePictureGroupLocalRect(value.rect);
  const relativeAngle = normalizePictureAngle(value.angleDeg);
  if (parent.collapsed) return null;
  const width = positiveProduct(local.widthRatio, parent.rect.width, "Group child width");
  const height = positiveProduct(local.heightRatio, parent.rect.height, "Group child height");
  const center = pictureFrameLocalToWorld(parent.rect, parent.angleDeg, {
    x: finite(local.xRatio * parent.rect.width + width / 2, "Group child local center x"),
    y: finite(local.yRatio * parent.rect.height + height / 2, "Group child local center y"),
  });
  return resolvePictureLayout(
    {
      x: finite(center.x - width / 2, "Group child x"),
      y: finite(center.y - height / 2, "Group child y"),
      width,
      height,
    },
    normalizePictureAngle(parent.angleDeg + relativeAngle),
  );
}

/** Inverse placement for grouping/reparenting/member edits; never divides a collapsed owner. */
export function placePictureGroupChild(
  parentValue: PictureGroupParentLayout,
  worldValue: PictureGroupParentLayout,
): PictureGroupPlacement {
  const parent = resolvePictureLayout(parentValue.rect, parentValue.angleDeg);
  if (parent.collapsed) return { status: "collapsed-parent" };
  const world = resolvePictureLayout(worldValue.rect, worldValue.angleDeg);
  if (world.collapsed) throw new RangeError("A group child requires positive world dimensions.");
  const center = pictureFrameWorldToLocal(parent.rect, parent.angleDeg, {
    x: finite(world.rect.x + world.rect.width / 2, "Group child center x"),
    y: finite(world.rect.y + world.rect.height / 2, "Group child center y"),
  });
  const rect = normalizePictureGroupLocalRect({
    xRatio: finite((center.x - world.rect.width / 2) / parent.rect.width, "Group child x ratio"),
    yRatio: finite((center.y - world.rect.height / 2) / parent.rect.height, "Group child y ratio"),
    widthRatio: positiveQuotient(world.rect.width, parent.rect.width, "Group child width ratio"),
    heightRatio: positiveQuotient(
      world.rect.height,
      parent.rect.height,
      "Group child height ratio",
    ),
  });
  const layout = { rect, angleDeg: normalizePictureAngle(world.angleDeg - parent.angleDeg) };
  // Check the complete forward projection before returning an editable placement.
  resolvePictureGroupChildLayout(parent, layout);
  return { status: "placed", frame: layout };
}

function resolveChild(
  node: PictureGroupChild,
  parent: ResolvedPictureLayout | null,
  parentPath: PictureGroupPath,
  ancestorVisible: boolean,
): ResolvedPictureGroupChild {
  const path = [...parentPath, node.id];
  const layout = parent ? resolvePictureGroupChildLayout(parent, node.frame) : null;
  const visible = ancestorVisible && !node.hidden && layout !== null;
  if (node.kind === "grouped-picture-v1") {
    return {
      node,
      path,
      visible,
      layout: layout
        ? resolvePictureSourceLayout(layout.rect, layout.angleDeg, node.frame.source)
        : null,
    };
  }
  return {
    node,
    path,
    visible,
    layout,
    members: node.members.map((child) => resolveChild(child, layout, path, visible)),
  };
}

/** Throws for the whole tree on invalid derived geometry, including hidden descendants. */
export function resolvePictureGroup(
  value: PictureGroup,
  metrics: PictureSheetMetrics,
): ResolvedPictureGroup {
  const node = normalizePictureGroup(value);
  const layout = resolvePictureLayout(
    resolvePictureAnchorRect(node.frame.anchor, metrics),
    node.frame.angleDeg,
  );
  const path = [node.id];
  const visible = !node.hidden && !layout.collapsed;
  return {
    node,
    path,
    visible,
    layout,
    members: node.members.map((child) =>
      resolveChild(child, layout.collapsed ? null : layout, path, visible),
    ),
  };
}

/** Layout union deliberately excludes rotated visual/source bounds and handle padding. */
export function unionPictureGroupLayoutRects(
  values: readonly PictureFrameRect[],
): PictureFrameRect {
  if (values.length === 0) throw new RangeError("Cannot create a group frame from no layouts.");
  const rects = values.map((value) => {
    const layout = resolvePictureLayout(value, 0);
    if (layout.collapsed)
      throw new RangeError("Cannot create a group frame from a collapsed layout.");
    return layout.rect;
  });
  let x = rects[0]!.x;
  let y = rects[0]!.y;
  let right = x + rects[0]!.width;
  let bottom = y + rects[0]!.height;
  for (const rect of rects.slice(1)) {
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return resolvePictureLayout(
    {
      x,
      y,
      width: finite(right - x, "Group union width"),
      height: finite(bottom - y, "Group union height"),
    },
    0,
  ).rect;
}
