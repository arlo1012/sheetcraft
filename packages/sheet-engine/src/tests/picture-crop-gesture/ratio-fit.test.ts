import { describe, expect, test } from "vitest";
import { resolvePictureLayout, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { fitResolvedPictureCropToRatio } from "../../picture-crop-gesture.js";
import { fixture, sourcePoint } from "./fixture.js";

describe("source-centered aspect-ratio crop fitting", () => {
  test("37 degree WPS 16:9 resets offsets around the unrotated source center", () => {
    const before = fixture(37, {
      widthRatio: 3.75 / 2,
      heightRatio: 2.5 / 1.5,
      offsetXRatio: 0.5 / 2,
      offsetYRatio: 0.3 / 1.5,
    });
    before.layout = resolvePictureLayout({ x: 144, y: 144, width: 192, height: 144 }, 37);
    const snapshot = structuredClone(before);
    const after = fitResolvedPictureCropToRatio(before, 16 / 9);
    const { rect } = after.layout;
    expect(rect.width / 96).toBeCloseTo(3.75, 10);
    expect(rect.height / 96).toBeCloseTo(2.109375, 10);
    expect(rect.x / 96).toBeCloseTo(1.125, 10);
    expect(rect.y / 96).toBeCloseTo(1.4953125, 10);
    expect((rect.width * after.source.widthRatio) / 96).toBeCloseTo(3.75, 10);
    expect((rect.height * after.source.heightRatio) / 96).toBeCloseTo(2.5, 10);
    expect(after.source.offsetXRatio).toBe(0);
    expect(after.source.offsetYRatio).toBe(0);
    expect(after.layout.angleDeg).toBe(37);
    const oldCenter = sourcePoint(before, 0.5, 0.5);
    const nextCenter = sourcePoint(after, 0.5, 0.5);
    expect(nextCenter.x).not.toBeCloseTo(oldCenter.x, 4);
    expect(nextCenter.y).not.toBeCloseTo(oldCenter.y, 4);
    expect(before).toEqual(snapshot);
    expect(fitResolvedPictureCropToRatio(after, 16 / 9)).toBe(after);
  });

  test.each([1, 4 / 3, 3 / 4, 2, 9 / 16])(
    "product ratio %s uses the source's maximal inscribed dimensions at any angle",
    (aspect) => {
      const before = fixture(137, {
        widthRatio: 1.2,
        heightRatio: 1.4,
        offsetXRatio: -0.3,
        offsetYRatio: 0.2,
      });
      const oldSource = resolvePictureSourceLayout(
        before.layout.rect,
        137,
        before.source,
      ).sourceRect!;
      const after = fitResolvedPictureCropToRatio(before, aspect);
      const nextSource = resolvePictureSourceLayout(
        after.layout.rect,
        137,
        after.source,
      ).sourceRect!;
      expect(after.layout.rect.width / after.layout.rect.height).toBeCloseTo(aspect, 10);
      expect(after.layout.rect.width).toBeLessThanOrEqual(oldSource.width);
      expect(after.layout.rect.height).toBeLessThanOrEqual(oldSource.height + 1e-10);
      expect(nextSource.width).toBeCloseTo(oldSource.width, 10);
      expect(nextSource.height).toBeCloseTo(oldSource.height, 10);
      expect(nextSource.x + nextSource.width / 2).toBeCloseTo(
        oldSource.x + oldSource.width / 2,
        10,
      );
      expect(nextSource.y + nextSource.height / 2).toBeCloseTo(
        oldSource.y + oldSource.height / 2,
        10,
      );
      expect(after.source.offsetXRatio).toBe(0);
      expect(after.source.offsetYRatio).toBe(0);
      expect(after.layout.angleDeg).toBe(137);
      expect(fitResolvedPictureCropToRatio(after, aspect)).toBe(after);
    },
  );

  test("an already centered matching source/crop keeps original state and references", () => {
    const before = fixture(37);
    expect(fitResolvedPictureCropToRatio(before, 1.5)).toBe(before);
  });

  test("invalid ratios, undersized/oversized fits and unrepresentable placement refuse", () => {
    const before = fixture(37);
    const snapshot = structuredClone(before);
    for (const aspect of [0, -1, NaN, Infinity, Number.MIN_VALUE, Number.MAX_VALUE, "1.5", null])
      expect(() => fitResolvedPictureCropToRatio(before, aspect as number)).toThrow();
    const tiny = fixture(37, { ...before.source, widthRatio: 0.5 / 360 });
    expect(() => fitResolvedPictureCropToRatio(tiny, 1)).toThrow(/dimensions/);
    const large = fixture(37, {
      ...before.source,
      widthRatio: 10001 / 360,
      heightRatio: 10001 / 240,
    });
    expect(() => fitResolvedPictureCropToRatio(large, 1)).toThrow(/dimensions/);
    const collapsed = {
      ...before,
      layout: resolvePictureLayout({ ...before.layout.rect, width: 0 }, 37),
    };
    expect(() => fitResolvedPictureCropToRatio(collapsed, 1)).toThrow(/collapsed/);
    const distant = fixture(90, { ...before.source, heightRatio: 1 / 240 });
    distant.layout = resolvePictureLayout({ x: 1e18, y: 0, width: 1000, height: 240 }, 90);
    expect(() => fitResolvedPictureCropToRatio(distant, 1)).toThrow(/world coordinates/);
    expect(before).toEqual(snapshot);
  });
});
