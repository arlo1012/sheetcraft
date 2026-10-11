import { describe, expect, test } from "vitest";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  normalizePictureFrameAnchor,
  resolvePictureAnchorRect,
  resolvePictureFrame,
  resolvePictureLayout,
  resolvePictureSourceLayout,
  type PictureFrame,
} from "../../picture-frame.js";
import {
  transformPictureAnchorAxis,
  transformPictureFrameAxis,
} from "../../picture-frame-axis-edit.js";

function picture(): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: {
      mode: "move-and-size",
      start: { column: { index: 2, offset: 2 }, row: { index: 4, offset: 2 } },
      end: { column: { index: 6, offset: 2 }, row: { index: 14, offset: 2 } },
    },
    angleDeg: 37,
    source: { widthRatio: 1.2, heightRatio: 0.5, offsetXRatio: 0.3, offsetYRatio: -0.4 },
  };
}

describe("source-free picture container primitives", () => {
  test("the shared anchor, layout and leaf evaluation preserve the standalone result", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const original = picture();
    const before = structuredClone(original);
    const rect = resolvePictureAnchorRect(original.anchor, metrics);
    const { sourceRect, ...layout } = resolvePictureFrame(original, metrics);
    expect(resolvePictureLayout(rect, original.angleDeg)).toEqual(layout);
    expect(resolvePictureSourceLayout(rect, original.angleDeg, original.source)).toEqual({
      ...layout,
      sourceRect,
    });
    expect(original).toEqual(before);
    const copy = normalizePictureFrameAnchor(original.anchor);
    if (copy.mode !== "move-and-size") throw Error("Expected stretching anchor");
    copy.start.column.offset = 40;
    expect(original).toEqual(before);
  });
  test("an anchor edit has the same affinity and deletion policy without a fictitious source", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const original = picture();
    const edit = { axis: "row", operation: "delete", index: 4, count: 1 } as const;
    expect(transformPictureAnchorAxis(original.anchor, edit, metrics)).toEqual(
      transformPictureFrameAxis(original, edit, metrics)!.anchor,
    );
    expect(transformPictureAnchorAxis(original.anchor, { ...edit, count: 12 }, metrics)).toBeNull();
  });
  test("hidden root extents remain collapsed geometry without a source or division", () => {
    const sheet = createSheet("Synthetic", "s");
    for (let index = 4; index <= 14; index++) setSheetDimensionHidden(sheet, "row", index, true);
    const metrics = createPictureSheetMetrics(sheet);
    const original = picture();
    const rect = resolvePictureAnchorRect(original.anchor, metrics);
    const layout = resolvePictureLayout(rect, original.angleDeg);
    expect(layout.collapsed).toBe(true);
    expect(layout.rect.height).toBe(0);
    expect(
      resolvePictureSourceLayout(rect, original.angleDeg, original.source).sourceRect,
    ).toBeNull();
    expect(original.anchor.mode).toBe("move-and-size");
  });
  test("unrepresentable container and leaf geometry fails before returning a partial result", () => {
    expect(() => resolvePictureLayout({ x: 1e300, y: 0, width: 1, height: 20 }, 0)).toThrow();
    expect(() =>
      resolvePictureSourceLayout({ x: 0, y: 0, width: 1e300, height: 20 }, 0, {
        widthRatio: 1e100,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      }),
    ).toThrow();
  });
});
