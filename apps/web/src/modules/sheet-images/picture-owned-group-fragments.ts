import {
  pictureFrameContainsPoint,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import type {
  GroupedPicture,
  PictureGroup,
  PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupChild,
} from "@sheetcraft/core/picture-group-layout";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { Point, Rect } from "@sheetcraft/sheet-engine/geometry";
import {
  projectPictureFrameIntoPane,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";

/** Source-bearing owned leaves only; root selection uses the engine's source-free fragments. */
export type OwnedPictureGroupViewportFragment = {
  kind: "group-leaf";
  rootId: string;
  /** Root ID, every owner ID, then the actual leaf ID. */
  path: PictureGroupPath;
  image: GroupedPicture;
  paneId: FrozenPaneId;
  geometry: ResolvedPictureFrame;
  clippedBounds: Rect;
};

function intersection(bounds: Rect, clip: Rect): Rect | null {
  const x = Math.max(bounds.x, clip.x),
    y = Math.max(bounds.y, clip.y);
  const right = Math.min(bounds.x + bounds.width, clip.x + clip.width),
    bottom = Math.min(bounds.y + bounds.height, clip.y + clip.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * A detached, fully validated ownership tree is resolved before projection.
 * Preorder preserves each owner's bottom-to-top sibling order. Visible leaf
 * polygons are clipped only to their pane: an owner frame is not a crop mask.
 * This prepared adapter does not enable workbook promotion or live rendering.
 */
export function getOwnedPictureGroupViewportFragments(
  group: PictureGroup,
  context: PictureFrameLayoutContext,
  paintBounds?: (picture: GroupedPicture, geometry: ResolvedPictureFrame) => Rect | undefined,
): OwnedPictureGroupViewportFragment[] {
  const resolved = resolvePictureGroup(group, context.metrics);
  const fragments: OwnedPictureGroupViewportFragment[] = [];
  const visit = (children: readonly ResolvedPictureGroupChild[]): void => {
    for (const child of children) {
      if ("members" in child) {
        visit(child.members);
        continue;
      }
      if (!child.visible || !child.layout || child.layout.collapsed) continue;
      for (const paneId of ["topLeft", "top", "left", "body"] as const) {
        const geometry = projectPictureFrameIntoPane(child.layout, paneId, context.layout);
        const clippedBounds = intersection(
          paintBounds?.(child.node, geometry) ?? geometry.bounds,
          context.layout.panes[paneId].clip,
        );
        if (clippedBounds)
          fragments.push({
            kind: "group-leaf",
            rootId: resolved.node.id,
            path: child.path,
            image: child.node,
            paneId,
            geometry,
            clippedBounds,
          });
      }
    }
  };
  visit(resolved.members);
  return fragments;
}

/**
 * Back-to-front exact leaf-polygon hit, respecting ancestor visibility and the
 * half-open pane clip. This deliberately does not hit a source-free root frame.
 */
export function hitOwnedPictureGroupViewportPoint(
  group: PictureGroup,
  point: Point,
  context: PictureFrameLayoutContext,
): OwnedPictureGroupViewportFragment | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Owned picture hit coordinates must be finite.");
  const fragments = getOwnedPictureGroupViewportFragments(group, context);
  for (let index = fragments.length - 1; index >= 0; index--) {
    const fragment = fragments[index]!;
    const clip = context.layout.panes[fragment.paneId].clip;
    if (
      point.x >= clip.x &&
      point.x < clip.x + clip.width &&
      point.y >= clip.y &&
      point.y < clip.y + clip.height &&
      pictureFrameContainsPoint(fragment.geometry, point)
    )
      return fragment;
  }
  return null;
}
