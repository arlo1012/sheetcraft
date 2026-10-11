import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet } from "../../workbook.js";
import {
  pictureFrameFromLegacy,
  resolvePictureFrame,
  type ResolvedPictureLayout,
} from "../../picture-frame.js";
import {
  isPictureGroup,
  type GroupedGroup,
  type GroupedPicture,
  type PictureGroup,
} from "../../picture-group.js";
import { resolvePictureGroup, type ResolvedPictureGroupNode } from "../../picture-group-layout.js";
import {
  isFramedPictureObject,
  type FramedFloatingImage,
  type PictureObject,
} from "../../picture-object.js";

export function leaf(id: string, xRatio = 0, yRatio = 0): GroupedPicture {
  return {
    kind: "grouped-picture-v1",
    id,
    assetId: "shared-asset",
    altText: `Alt ${id}`,
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio, yRatio, widthRatio: 0.2, heightRatio: 0.2 },
      angleDeg: 0,
      source: { widthRatio: 1.3, heightRatio: 0.8, offsetXRatio: -0.15, offsetYRatio: 0.2 },
    },
  };
}
export function picture(id: string): FramedFloatingImage {
  return {
    id,
    assetId: "shared-asset",
    altText: id,
    groupId: "legacy-flat-id",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 10, y: 20, size: { width: 100, height: 50 } },
      angleDeg: 27,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}
export function group(members: GroupedPicture[] = [leaf("a"), leaf("b", 0.7, 0.6)]): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "root",
    altText: "Root group",
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 100, size: { width: 400, height: 200 } },
      angleDeg: 0,
    },
    members,
  };
}
export function nested(): PictureGroup {
  const inner: GroupedGroup = {
    kind: "grouped-group-v1",
    id: "inner",
    altText: "Inner group",
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 0.8, heightRatio: 0.5 },
      angleDeg: 0,
    },
    members: [leaf("a"), leaf("b", 0.7, 0.6)],
  };
  return { ...group(), members: [inner, leaf("c", 0.65, 0.7)] };
}
export function fixture(root = nested()) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = [picture("under"), root, picture("above")];
  return { session, sheet, root, metrics: createPictureSheetMetrics(sheet) };
}
export function layouts(
  values: readonly PictureObject[],
  metrics: ReturnType<typeof createPictureSheetMetrics>,
) {
  const result = new Map<string, ResolvedPictureLayout>();
  function collect(node: ResolvedPictureGroupNode): void {
    if (node.layout) result.set(node.node.id, node.layout);
    if ("members" in node) for (const child of node.members) collect(child);
  }
  for (const root of values) {
    if (isPictureGroup(root)) collect(resolvePictureGroup(root, metrics));
    else
      result.set(
        root.id,
        resolvePictureFrame(
          isFramedPictureObject(root) ? root.frame : pictureFrameFromLegacy(root, metrics),
          metrics,
        ),
      );
  }
  return result;
}
