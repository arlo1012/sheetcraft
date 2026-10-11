import { describe, expect, test } from "vitest";
import {
  editResolvedPictureCrop,
  resetResolvedPictureCrop,
  type PictureCropEdit,
} from "../../picture-crop-edit.js";
import { resolvePictureLayout } from "../../picture-frame.js";
import { fixture } from "./fixture.js";

describe("current-source Crop Reset", () => {
  test.each([0, 37, 90, 180, 270])(
    "angle %s resets crop to the unrotated source rectangle",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.5,
        heightRatio: 0.5,
        offsetXRatio: 0.3,
        offsetYRatio: -0.4,
      });
      const snapshot = structuredClone(before);
      const next = resetResolvedPictureCrop(before.layout, before.source);
      expect(next.layout.rect.width).toBe(540);
      expect(next.layout.rect.height).toBe(120);
      expect(next.source).toEqual({
        widthRatio: 1,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
      expect(next.layout.rect.x).toBeCloseTo(before.layout.rect.x + (360 - 540) / 2 + 360 * 0.3);
      expect(next.layout.rect.y).toBeCloseTo(before.layout.rect.y + (240 - 120) / 2 - 240 * 0.4);
      expect(next.layout.angleDeg).toBe(before.layout.angleDeg);
      expect(before).toEqual(snapshot);
      const repeat = resetResolvedPictureCrop(next.layout, next.source);
      expect(repeat.layout).toBe(next.layout);
      expect(repeat.source).toBe(next.source);
    },
  );
  test("37-degree measured reset uses source layout offsets without rotating them", () => {
    const layout = resolvePictureLayout({ x: 120, y: 120, width: 192, height: 144 }, 37);
    const source = {
      widthRatio: 360 / 192,
      heightRatio: 240 / 144,
      offsetXRatio: 72 / 192,
      offsetYRatio: 38.4 / 144,
    };
    const next = resetResolvedPictureCrop(layout, source);
    expect(next.layout.rect.x).toBe(108);
    expect(next.layout.rect.y).toBeCloseTo(110.4);
    expect(next.layout.rect.width).toBe(360);
    expect(next.layout.rect.height).toBe(240);
    expect(next.layout.angleDeg).toBe(37);
    expect(next.source).toEqual({
      widthRatio: 1,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
  });
  test("padding reset contracts to current source instead of inventing an original asset size", () => {
    const before = fixture(37, {
      widthRatio: 0.5,
      heightRatio: 0.25,
      offsetXRatio: -0.5,
      offsetYRatio: 0.5,
    });
    const next = resetResolvedPictureCrop(before.layout, before.source);
    expect(next.layout.rect.width).toBe(180);
    expect(next.layout.rect.height).toBe(60);
    expect(next.layout.rect.x).toBeCloseTo(before.layout.rect.x + (360 - 180) / 2 - 360 * 0.5);
    expect(next.layout.rect.y).toBeCloseTo(before.layout.rect.y + (240 - 60) / 2 + 240 * 0.5);
    expect(next.layout.angleDeg).toBe(before.layout.angleDeg);
    expect(Object.keys(next).sort()).toEqual(["layout", "source"]);
  });
});

describe("exact no-op and pure results", () => {
  test.each([0, 37, 90, 180, 270])(
    "angle %s all eight unchanged values preserve original references and ratios",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.123456789,
        heightRatio: 0.987654321,
        offsetXRatio: -0.333333333,
        offsetYRatio: 0.142857142,
      });
      const edits: PictureCropEdit[] = [
        { field: "source-width", value: before.layout.rect.width * before.source.widthRatio },
        { field: "source-height", value: before.layout.rect.height * before.source.heightRatio },
        { field: "source-offset-x", value: before.layout.rect.width * before.source.offsetXRatio },
        { field: "source-offset-y", value: before.layout.rect.height * before.source.offsetYRatio },
        { field: "crop-width", value: before.layout.rect.width },
        { field: "crop-height", value: before.layout.rect.height },
        { field: "crop-left", value: before.layout.rect.x },
        { field: "crop-top", value: before.layout.rect.y },
      ];
      const snapshot = structuredClone(before);
      for (let index = 0; index < 10; index++)
        for (const edit of edits) {
          const next = editResolvedPictureCrop(before.layout, before.source, edit);
          expect(next.layout).toBe(before.layout);
          expect(next.source).toBe(before.source);
        }
      expect(before).toEqual(snapshot);
    },
  );
  test("normalized edited layouts recompute derived fields rather than using stale bounds", () => {
    const before = fixture(37);
    const stale = {
      ...before.layout,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      collapsed: true,
    };
    const next = editResolvedPictureCrop(stale, before.source, {
      field: "source-width",
      value: 400,
    });
    expect(next.layout).toEqual(before.layout);
  });
});
