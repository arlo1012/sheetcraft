import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorPictureFrameRect, type PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import type { PictureGroup, GroupedPicture } from "@sheetcraft/core/picture-group";

export const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
export const anchorModes: PictureFrameAnchor["mode"][] = ["fixed", "move-only", "move-and-size"];
export const directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;
export function rotateVector(x: number, y: number, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(angle) * x - Math.sin(angle) * y,
    y: Math.sin(angle) * x + Math.cos(angle) * y,
  };
}
export function group(mode: PictureFrameAnchor["mode"] = "fixed", angleDeg = 37): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "root",
    altText: "Synthetic group",
    hidden: false,
    frame: {
      kind: "group-frame-v1",
      anchor: anchorPictureFrameRect(mode, { x: 100, y: 100, width: 516, height: 224 }, metrics),
      angleDeg,
    },
    members: [
      {
        kind: "grouped-picture-v1",
        id: "a",
        assetId: "asset-a",
        altText: "Rotated cropped member",
        lockAspectRatio: true,
        frame: {
          kind: "group-member-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 216 / 516, heightRatio: 144 / 224 },
          angleDeg: 37,
          source: { widthRatio: 1.8, heightRatio: 1.3, offsetXRatio: 0.3, offsetYRatio: -0.2 },
          flipHorizontal: true,
          flipVertical: false,
        },
        transform: {
          appearance: { opacity: 0.8 },
          annotations: [
            { kind: "pen", color: "#FF0000", width: 0.02, points: [{ x: 0.1, y: 0.2 }] },
          ],
        },
      },
      {
        kind: "grouped-picture-v1",
        id: "b",
        assetId: "asset-b",
        altText: "Second member",
        hidden: true,
        frame: {
          kind: "group-member-frame-v1",
          rect: {
            xRatio: 300 / 516,
            yRatio: 80 / 224,
            widthRatio: 216 / 516,
            heightRatio: 144 / 224,
          },
          angleDeg: 0,
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        },
      },
    ],
  };
}
export function firstLeaf(value: PictureGroup): GroupedPicture {
  return value.members[0] as GroupedPicture;
}
