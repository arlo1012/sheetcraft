import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { anchorPictureFrameRect, resolvePictureLayout } from "../../picture-frame.js";
import { createSheet } from "../../workbook.js";
import {
  placePictureGroupChild,
  unionPictureGroupLayoutRects,
  type ResolvedGroupedPicture,
  type ResolvedPictureGroup,
} from "../../picture-group-layout.js";
import type { GroupedPicture, PictureGroup } from "../../picture-group.js";

export const source = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
export function leaf(id = "leaf"): GroupedPicture {
  return {
    kind: "grouped-picture-v1",
    id,
    assetId: `asset-${id}`,
    altText: id,
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
      angleDeg: 0,
      source: { ...source },
    },
  };
}
export function group(id = "group"): PictureGroup {
  return {
    kind: "picture-group-v1",
    id,
    altText: id,
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 100, size: { width: 200, height: 100 } },
      angleDeg: 0,
    },
    members: [leaf(`${id}-a`), leaf(`${id}-b`)],
    lockAspectRatio: false,
  };
}
export function metrics() {
  return createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
}
export function measuredGroup(): PictureGroup {
  const a = resolvePictureLayout({ x: 100, y: 100, width: 216, height: 144 }, 37);
  const b = resolvePictureLayout({ x: 400, y: 180, width: 216, height: 144 }, 0);
  const union = unionPictureGroupLayoutRects([a.rect, b.rect]);
  const parent = resolvePictureLayout(union, 0);
  const members = [a, b].map((world, index) => {
    const placed = placePictureGroupChild(parent, world);
    if (placed.status !== "placed") throw new Error("Expected measurable fixture.");
    const picture = leaf(index === 0 ? "a" : "b");
    return { ...picture, frame: { ...picture.frame, ...placed.frame } };
  });
  return {
    ...group(),
    frame: {
      kind: "group-frame-v1",
      anchor: anchorPictureFrameRect("move-and-size", union, metrics()),
      angleDeg: 0,
    },
    members,
  };
}
export function resolvedLeaf(value: ResolvedPictureGroup, index: number): ResolvedGroupedPicture {
  const node = value.members[index]!;
  if ("members" in node) throw new Error("Expected a leaf.");
  return node;
}
