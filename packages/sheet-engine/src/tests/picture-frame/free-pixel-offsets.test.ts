import { describe, expect, test } from "vitest";
import { createSheet, setColumnWidth, setSheetDimensionHidden } from "@sheetcraft/core/workbook";
import {
  anchorPictureFrameRect,
  resolvePictureFrame,
  type PictureFrameAnchor,
} from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import {
  createPictureViewMetrics,
  flipFramedPicture,
  framedPictureContainsViewportPoint,
  getFramedPictureViewportFragments,
  moveFramedPictureBy,
  resizeFramedPictureBy,
  rotateFramedPictureBy,
} from "../../picture-frame-layout.js";
import { resizeResolvedPictureCropBy } from "../../picture-crop-gesture.js";

function fixture(hidden = false) {
  const sheet = createSheet("Free markers", "free-markers");
  setColumnWidth(sheet, 0, 100);
  setSheetDimensionHidden(sheet, "column", 0, hidden);
  const geometry = createSheetGeometry({
    rowCount: 20,
    columnCount: 20,
    columnWidths: sheet.columnWidths,
    hiddenColumns: sheet.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  return {
    metrics: createPictureViewMetrics(sheet, geometry, rows),
    layout: createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 400, height: 300 },
    }),
  };
}
function image(mode: "move-only" | "move-and-size" = "move-only"): FramedFloatingImage {
  const start = { column: { index: 0, offset: 110.25 }, row: { index: 0, offset: 5 } };
  const anchor: PictureFrameAnchor =
    mode === "move-only"
      ? { mode, offsetMode: "free-pixels", origin: start, size: { width: 80, height: 40 } }
      : {
          mode,
          offsetMode: "free-pixels",
          start,
          end: { column: { index: 1, offset: 20 }, row: { index: 2, offset: 5 } },
        };
  return {
    id: "native-marker",
    assetId: "asset",
    altText: "Free pixel marker",
    frame: {
      kind: "object-frame-v1",
      anchor,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  };
}

describe("free-pixel picture consumers", () => {
  test("viewport fragments and hit testing use the same overflow geometry as Core", () => {
    const context = fixture();
    const original = image();
    const resolved = resolvePictureFrame(original.frame, context.metrics);
    expect(resolved.rect).toEqual({ x: 110.25, y: 5, width: 80, height: 40 });
    const fragments = getFramedPictureViewportFragments(original, context);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.geometry).toEqual(resolved);
    expect(framedPictureContainsViewportPoint(original, { x: 111, y: 6 }, context)).toBe(true);
    expect(framedPictureContainsViewportPoint(original, { x: 105, y: 6 }, context)).toBe(false);
  });

  test.each(["move-only", "move-and-size"] as const)(
    "%s no-op movement, resize and crop preserve raw markers and policy",
    (mode) => {
      const context = fixture();
      const original = image(mode);
      expect(moveFramedPictureBy(original, { x: 0, y: 0 }, context.metrics)).toEqual(original);
      expect(resizeFramedPictureBy(original, "se", { x: 0, y: 0 }, context.metrics)).toEqual(
        original,
      );
      const { sourceRect: _sourceRect, ...layout } = resolvePictureFrame(
        original.frame,
        context.metrics,
      );
      const crop = { layout, source: original.frame.source };
      const unchanged = resizeResolvedPictureCropBy(crop, "se", { x: 0, y: 0 });
      expect(unchanged).toBe(crop);
      expect(
        anchorPictureFrameRect(mode, unchanged.layout.rect, context.metrics, original.frame.anchor),
      ).toEqual(original.frame.anchor);
    },
  );

  test("active east resize preserves unchanged raw coordinates and keeps free semantics", () => {
    const context = fixture();
    const original = image("move-and-size");
    const resized = resizeFramedPictureBy(original, "e", { x: 10, y: 0 }, context.metrics)!;
    expect(resized.frame.anchor).toEqual({
      ...original.frame.anchor,
      end: { column: { index: 1, offset: 30 }, row: { index: 2, offset: 5 } },
    });
    expect(resolvePictureFrame(resized.frame, context.metrics).rect.width).toBe(19.75);
    expect(original.frame.anchor).toEqual(image("move-and-size").frame.anchor);
  });

  test("rotation and flips leave raw marker bindings and policy intact", () => {
    const context = fixture();
    const original = image("move-and-size");
    const rotated = rotateFramedPictureBy(original, 37, context.metrics);
    expect(rotated.frame.anchor).toEqual(original.frame.anchor);
    for (const axis of ["horizontal", "vertical"] as const) {
      const flipped = flipFramedPicture(rotated, axis, context.metrics);
      expect(flipped.frame.anchor).toEqual(original.frame.anchor);
      expect(flipFramedPicture(flipped, axis, context.metrics)).toEqual(rotated);
    }
  });

  test("hidden origin cells keep free offsets and a reversed span collapses recoverably", () => {
    const visible = fixture();
    const hidden = fixture(true);
    const original = image("move-and-size");
    const before = structuredClone(original);
    expect(resolvePictureFrame(image().frame, hidden.metrics).rect.x).toBe(110.25);
    const collapsed = resolvePictureFrame(original.frame, hidden.metrics);
    expect(collapsed.rect).toEqual({ x: 110.25, y: 5, width: 0, height: 48 });
    expect(collapsed.collapsed).toBe(true);
    expect(collapsed.sourceRect).toBeNull();
    expect(getFramedPictureViewportFragments(original, hidden)).toEqual([]);
    expect(framedPictureContainsViewportPoint(original, { x: 111, y: 6 }, hidden)).toBe(false);
    expect(resizeFramedPictureBy(original, "e", { x: 10, y: 0 }, hidden.metrics)).toBeNull();
    expect(moveFramedPictureBy(original, { x: 10, y: 0 }, hidden.metrics)).toBeNull();
    expect(original).toEqual(before);
    expect(resolvePictureFrame(original.frame, visible.metrics).rect.width).toBe(9.75);
    expect(getFramedPictureViewportFragments(original, visible)).toHaveLength(1);
  });

  test("UI anchors without the new policy retain bounded offsets and hidden-cell clamping", () => {
    const original = image();
    if (original.frame.anchor.mode !== "move-only") throw new Error("Expected moving anchor.");
    delete original.frame.anchor.offsetMode;
    expect(resolvePictureFrame(original.frame, fixture().metrics).rect.x).toBe(100);
    expect(resolvePictureFrame(original.frame, fixture(true).metrics).rect.x).toBe(0);
    const generated = anchorPictureFrameRect(
      "move-only",
      { x: 110.25, y: 5, width: 80, height: 40 },
      fixture().metrics,
    );
    expect(generated).not.toHaveProperty("offsetMode");
  });
});
