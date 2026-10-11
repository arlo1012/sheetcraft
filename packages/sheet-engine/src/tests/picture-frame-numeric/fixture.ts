import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorPictureFrameRect, type PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";

export const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
export const anchorModes: PictureFrameAnchor["mode"][] = ["fixed", "move-only", "move-and-size"];

export function image(
  mode: PictureFrameAnchor["mode"] = "fixed",
  angleDeg = 37,
  lockAspectRatio = true,
): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic cropped picture",
    groupId: "group",
    hidden: false,
    lockAspectRatio,
    transform: {
      appearance: { opacity: 0.8, border: { color: "#AABBCC", width: 2 }, shadow: "soft" },
      annotations: [
        {
          kind: "arrow",
          color: "#CCAA00",
          width: 0.03,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.7, y: 0.8 },
          ],
        },
      ],
    },
    frame: {
      kind: "object-frame-v1",
      anchor: anchorPictureFrameRect(mode, { x: 160, y: 140, width: 360, height: 240 }, metrics),
      source: { widthRatio: 1.8, heightRatio: 1.3, offsetXRatio: 0.3, offsetYRatio: -0.2 },
      angleDeg,
      flipHorizontal: true,
      flipVertical: true,
    },
  };
}

export function collapsedImage(): {
  original: FramedFloatingImage;
  hiddenMetrics: typeof metrics;
} {
  const sheet = createSheet("Collapsed", "collapsed");
  sheet.hiddenColumns.add(0);
  sheet.hiddenRows.add(0);
  const original = image("move-and-size");
  original.frame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
    end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
  };
  return { original, hiddenMetrics: createPictureSheetMetrics(sheet) };
}
