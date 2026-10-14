import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import {
  placePictureGroupChild,
  resolvePictureGroupChildLayout,
  unionPictureGroupLayoutRects,
} from "./picture-group-layout.js";
import {
  MAX_SHAPE_FRAME_SIZE,
  resolveShapeFrame,
  type ResolvedShapeFrame,
  type ShapeFrameRect,
} from "./shape-frame.js";
import {
  normalizeShapeGroup,
  normalizeShapeGroupLocalFrame,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupLocalFrame,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
  type SheetGroupedEquationDrawing,
} from "./shape-group.js";

export type ShapeGroupParentLayout = Pick<ResolvedShapeFrame, "rect" | "angleDeg">;
export type ShapeGroupChildLayout = {
  groupFrame: ShapeGroupLocalFrame;
  rotation: number;
};
export type ShapeGroupPlacement =
  | ({ status: "placed" } & ShapeGroupChildLayout)
  | { status: "collapsed-parent" };
type ResolvedGroupNode<T> = {
  /** Detached canonical node. World geometry is never persisted in the node. */
  node: T;
  path: ShapeGroupPath;
  /** False while the root or an ancestor's worksheet geometry is collapsed. */
  visible: boolean;
};
export type ResolvedSheetGroupedGraphicDrawing = ResolvedGroupNode<SheetGroupedGraphicDrawing> & {
  layout: ResolvedShapeFrame | null;
};
export type ResolvedSheetGroupedEquationDrawing = ResolvedGroupNode<SheetGroupedEquationDrawing> & {
  layout: ResolvedShapeFrame | null;
};
export type ResolvedShapeGroupedGroup = ResolvedGroupNode<ShapeGroupedGroup> & {
  layout: ResolvedShapeFrame | null;
  members: ResolvedShapeGroupChild[];
};
export type ResolvedShapeGroupChild =
  | ResolvedSheetGroupedGraphicDrawing
  | ResolvedSheetGroupedEquationDrawing
  | ResolvedShapeGroupedGroup;
export type ResolvedShapeGroup = ResolvedGroupNode<ShapeGroupDrawing> & {
  layout: ResolvedShapeFrame;
  members: ResolvedShapeGroupChild[];
};
export type ResolvedShapeGroupNode = ResolvedShapeGroup | ResolvedShapeGroupChild;

/** Scale orthogonal local dimensions first, then compose the relative drawing rotation. */
export function resolveShapeGroupChildLayout(
  parent: ShapeGroupParentLayout,
  value: ShapeGroupChildLayout,
): ResolvedShapeFrame | null {
  const groupFrame = normalizeShapeGroupLocalFrame(value.groupFrame);
  const layout = resolvePictureGroupChildLayout(parent, {
    rect: groupFrame.rect,
    angleDeg: value.rotation,
  });
  if (
    layout &&
    (layout.rect.width > MAX_SHAPE_FRAME_SIZE || layout.rect.height > MAX_SHAPE_FRAME_SIZE)
  )
    throw new RangeError(`Resolved owned shape spans must be 0–${MAX_SHAPE_FRAME_SIZE} pixels.`);
  return layout;
}
/** Source-free inverse placement never divides a collapsed owner. */
export function placeShapeGroupChild(
  parent: ShapeGroupParentLayout,
  world: ShapeGroupParentLayout,
): ShapeGroupPlacement {
  const result = placePictureGroupChild(parent, world);
  if (result.status === "collapsed-parent") return result;
  return {
    status: "placed",
    groupFrame: { kind: "shape-group-local-v1", rect: result.frame.rect },
    rotation: result.frame.angleDeg,
  };
}
function resolveChild(
  node: ShapeGroupChild,
  parent: ResolvedShapeFrame | null,
  parentPath: ShapeGroupPath,
  ancestorVisible: boolean,
): ResolvedShapeGroupChild {
  const path = [...parentPath, node.id];
  const layout = parent ? resolveShapeGroupChildLayout(parent, node) : null;
  const visible = ancestorVisible && layout !== null;
  if (node.kind === "equation") return { node, path, visible, layout };
  if (node.kind !== "shapeGroup") return { node, path, visible, layout };
  return {
    node,
    path,
    visible,
    layout,
    members: node.members.map((child) => resolveChild(child, layout, path, visible)),
  };
}
/** Normalize all descendants before projection, including children of collapsed owners. */
export function resolveShapeGroup(
  value: ShapeGroupDrawing,
  metrics: PictureSheetMetrics,
): ResolvedShapeGroup {
  const node = normalizeShapeGroup(value);
  const layout = resolveShapeFrame(node.shapeFrame, metrics, node.rotation);
  const path = [node.id];
  const visible = !layout.collapsed;
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
/** Unrotated layout union excludes glyph/paint effects, visual bounds and handle padding. */
export function unionShapeGroupLayoutRects(values: readonly ShapeFrameRect[]): ShapeFrameRect {
  return unionPictureGroupLayoutRects(values);
}
