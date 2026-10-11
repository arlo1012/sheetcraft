import { describe, expect, test } from "vitest";
import { editResolvedPictureCrop, type PictureCropEdit } from "../../picture-crop-edit.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { resizePictureCropFrame, resolvePictureFrame } from "../../picture-frame.js";
import { createSheet } from "../../workbook.js";
import { expectSourcePreserved, fixture } from "./fixture.js";

describe("source-preserving crop fields", () => {
  test.each([0, 37, 90, 180, 270])(
    "angle %s dimensions retain rotated NW and source world corners",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.5,
        heightRatio: 0.5,
        offsetXRatio: 0.3,
        offsetYRatio: -0.4,
      });
      for (const edit of [
        { field: "crop-width", value: 264 },
        { field: "crop-height", value: 144 },
      ] satisfies PictureCropEdit[]) {
        const next = editResolvedPictureCrop(before.layout, before.source, edit);
        expect(next.layout.corners[0].x).toBeCloseTo(before.layout.corners[0].x, 9);
        expect(next.layout.corners[0].y).toBeCloseTo(before.layout.corners[0].y, 9);
        expectSourcePreserved(before, next);
      }
    },
  );
  test.each([0, 37, 90, 180, 270])(
    "angle %s left/top are absolute sheet LT and inverse-rotate compensation",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 0.5,
        heightRatio: 1.4,
        offsetXRatio: -0.4,
        offsetYRatio: 0.3,
      });
      for (const edit of [
        { field: "crop-left", value: -30 },
        { field: "crop-top", value: 420 },
      ] satisfies PictureCropEdit[]) {
        const next = editResolvedPictureCrop(before.layout, before.source, edit);
        expect(next.layout.rect).toEqual({
          ...before.layout.rect,
          ...(edit.field === "crop-left" ? { x: edit.value } : { y: edit.value }),
        });
        const dx = before.layout.rect.x - next.layout.rect.x;
        const dy = before.layout.rect.y - next.layout.rect.y;
        const radians = (angle * Math.PI) / 180;
        expect(next.source.offsetXRatio * 360).toBeCloseTo(
          before.source.offsetXRatio * 360 + Math.cos(radians) * dx + Math.sin(radians) * dy,
          10,
        );
        expect(next.source.offsetYRatio * 240).toBeCloseTo(
          before.source.offsetYRatio * 240 - Math.sin(radians) * dx + Math.cos(radians) * dy,
          10,
        );
        expectSourcePreserved(before, next);
      }
    },
  );
  test("the zero-angle WPS width/height/left/top examples preserve source placement", () => {
    const before = fixture();
    const cases = [
      { edit: { field: "crop-width", value: 264 }, offsetX: 48, offsetY: 0 },
      { edit: { field: "crop-height", value: 144 }, offsetX: 0, offsetY: 48 },
      { edit: { field: "crop-left", value: before.layout.rect.x + 48 }, offsetX: -48, offsetY: 0 },
      { edit: { field: "crop-top", value: before.layout.rect.y + 48 }, offsetX: 0, offsetY: -48 },
    ] satisfies { edit: PictureCropEdit; offsetX: number; offsetY: number }[];
    for (const { edit, offsetX, offsetY } of cases) {
      const next = editResolvedPictureCrop(before.layout, before.source, edit);
      expect(next.source.offsetXRatio * next.layout.rect.width).toBeCloseTo(offsetX, 10);
      expect(next.source.offsetYRatio * next.layout.rect.height).toBeCloseTo(offsetY, 10);
      expectSourcePreserved(before, next);
    }
  });
  test("dimension edits match the existing canonical local crop helper", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const before = fixture(37, {
      widthRatio: 1.2,
      heightRatio: 0.5,
      offsetXRatio: 0.3,
      offsetYRatio: -0.4,
    });
    const width = editResolvedPictureCrop(before.layout, before.source, {
      field: "crop-width",
      value: 264,
    });
    const next = editResolvedPictureCrop(width.layout, width.source, {
      field: "crop-height",
      value: 192,
    });
    const frame = resizePictureCropFrame(
      {
        kind: "object-frame-v1",
        anchor: {
          mode: "fixed",
          x: before.layout.rect.x,
          y: before.layout.rect.y,
          size: { width: 360, height: 240 },
        },
        source: before.source,
        angleDeg: 37,
      },
      { width: 264, height: 192 },
      metrics,
    );
    const { sourceRect: _sourceRect, ...expected } = resolvePictureFrame(frame, metrics);
    expect(next.layout.rect.x).toBeCloseTo(expected.rect.x, 10);
    expect(next.layout.rect.y).toBeCloseTo(expected.rect.y, 10);
    expect(next.layout.rect.width).toBe(expected.rect.width);
    expect(next.layout.rect.height).toBe(expected.rect.height);
    expect(next.source).toEqual(frame.source);
  });
  test("repeated independent crop operations retain the same physical source", () => {
    const before = fixture(37, {
      widthRatio: 1.2,
      heightRatio: 0.5,
      offsetXRatio: -0.3,
      offsetYRatio: 0.4,
    });
    const snapshot = structuredClone(before);
    let next = before;
    for (let index = 0; index < 20; index++)
      for (const edit of [
        { field: "crop-width", value: index % 2 ? 360 : 264 },
        { field: "crop-height", value: index % 2 ? 240 : 144 },
        { field: "crop-left", value: index % 2 ? 176.64 : -100 },
        { field: "crop-top", value: index % 2 ? 80.64 : 320 },
      ] satisfies PictureCropEdit[])
        next = editResolvedPictureCrop(next.layout, next.source, edit);
    expectSourcePreserved(before, next);
    expect(before).toEqual(snapshot);
    expect(Object.keys(next).sort()).toEqual(["layout", "source"]);
  });
});
