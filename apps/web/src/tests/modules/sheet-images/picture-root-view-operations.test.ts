// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createSheet,
  MAX_FLOATING_IMAGE_SIZE,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  movePictureViewBy,
  resizePictureViewBy,
  rotatePictureViewBy,
  flipPictureView,
  getPictureViewRect,
} from "../../../modules/sheet-images/picture-view-operations";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

function view() {
  const sheet = createSheet("Synthetic", "s");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 13, y: 7 },
    viewportSize: { width: 500, height: 400 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}

describe("explicit picture root view dispatch", () => {
  test("owned container movement and rotation preserve genuine subtree assets", () => {
    const context = view(),
      original = pictureGroup(),
      before = structuredClone(original);
    const moved = movePictureViewBy(original, { x: 20, y: 10 }, context.layout, context)!;
    expect(getPictureViewRect(moved, context.layout, context)).toEqual({
      x: 60,
      y: 20,
      width: 120,
      height: 80,
    });
    expect(moved.members).toEqual(original.members);
    expect(moved).not.toHaveProperty("assetId");
    const rotated = rotatePictureViewBy(original, 1, context.layout, context)!;
    expect(resolvePictureGroup(rotated, context.metrics).layout.angleDeg).toBe(127);
    expect(rotated.members).toEqual(original.members);
    const flipped = flipPictureView(original, "horizontal", context.layout, context);
    expect(flipped.members[0]!.kind).toBe("grouped-picture-v1");
    expect(original).toEqual(before);
  });

  test("group side resize is single-axis and unlocked corners preserve distinct group defaults", () => {
    const context = view(),
      original = pictureGroup();
    original.frame.angleDeg = 0;
    original.lockAspectRatio = true;
    const side = resizePictureViewBy(
      original,
      "e",
      { x: 60, y: 99 },
      context.layout,
      24,
      MAX_FLOATING_IMAGE_SIZE,
      context,
    )!;
    expect(resolvePictureGroup(side, context.metrics).layout.rect).toEqual({
      x: 40,
      y: 10,
      width: 180,
      height: 80,
    });
    delete original.lockAspectRatio;
    const corner = resizePictureViewBy(
      original,
      "se",
      { x: 60, y: 20 },
      context.layout,
      24,
      MAX_FLOATING_IMAGE_SIZE,
      context,
    )!;
    expect(resolvePictureGroup(corner, context.metrics).layout.rect).toEqual({
      x: 40,
      y: 10,
      width: 180,
      height: 100,
    });
  });

  test("legacy and standalone frame retain their own return variants and geometry", () => {
    const context = view();
    const legacy: LegacyFloatingImage = {
      id: "old",
      assetId: "a",
      altText: "Synthetic",
      anchor: { row: 0, column: 0 },
      offsetX: 40,
      offsetY: 10,
      width: 120,
      height: 80,
    };
    const legacyMoved = movePictureViewBy(legacy, { x: 20, y: 10 }, context.layout)!;
    expect(legacyMoved).not.toHaveProperty("frame");
    const frame = framedPicture();
    const moved = movePictureViewBy(frame, { x: 20, y: 10 }, context.layout, context)!;
    expect("frame" in moved && resolvePictureFrame(moved.frame, context.metrics).rect.x).toBe(214);
  });

  test("missing or stale viewport context rejects groups before mutation", () => {
    const context = view(),
      original = pictureGroup(),
      before = structuredClone(original);
    expect(() => movePictureViewBy(original, { x: 1, y: 1 }, context.layout)).toThrow(/geometry/);
    expect(() => getPictureViewRect(original, context.layout, view())).toThrow(/geometry/);
    expect(original).toEqual(before);
  });
});
