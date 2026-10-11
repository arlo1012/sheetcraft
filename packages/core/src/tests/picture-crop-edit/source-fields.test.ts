import { describe, expect, test } from "vitest";
import { editResolvedPictureCrop } from "../../picture-crop-edit.js";
import { fixture, sourcePoint } from "./fixture.js";

describe("independent source dimensions and visual center offsets", () => {
  test.each([0, 37, 90, 180, 270])(
    "angle %s source width is a centered horizontal stretch",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.25,
        heightRatio: 0.75,
        offsetXRatio: 0.2,
        offsetYRatio: -0.3,
      });
      const next = editResolvedPictureCrop(before.layout, before.source, {
        field: "source-width",
        value: 456,
      });
      expect(next.layout).toEqual(before.layout);
      expect(next.source).toEqual({ ...before.source, widthRatio: 456 / 360 });
      expect(sourcePoint(next, 0.5, 0.5)).toEqual(sourcePoint(before, 0.5, 0.5));
    },
  );
  test.each([0, 37, 90, 180, 270])(
    "angle %s source height is a centered vertical stretch",
    (angle) => {
      const before = fixture(angle);
      const next = editResolvedPictureCrop(before.layout, before.source, {
        field: "source-height",
        value: 336,
      });
      expect(next.layout).toEqual(before.layout);
      expect(next.source).toEqual({ ...before.source, heightRatio: 336 / 240 });
      expect(sourcePoint(next, 0.5, 0.5)).toEqual(sourcePoint(before, 0.5, 0.5));
    },
  );
  test.each([0, 37, 90, 180, 270])(
    "angle %s offsets move the source in rotated local axes",
    (angle) => {
      const before = fixture(angle);
      const horizontal = editResolvedPictureCrop(before.layout, before.source, {
        field: "source-offset-x",
        value: 48,
      });
      const vertical = editResolvedPictureCrop(before.layout, before.source, {
        field: "source-offset-y",
        value: -48,
      });
      expect(horizontal.layout).toEqual(before.layout);
      expect(vertical.layout).toEqual(before.layout);
      expect(horizontal.source).toEqual({ ...before.source, offsetXRatio: 48 / 360 });
      expect(vertical.source).toEqual({ ...before.source, offsetYRatio: -48 / 240 });
      const radians = (angle * Math.PI) / 180;
      const center = sourcePoint(before, 0.5, 0.5);
      expect(sourcePoint(horizontal, 0.5, 0.5).x).toBeCloseTo(
        center.x + Math.cos(radians) * 48,
        10,
      );
      expect(sourcePoint(horizontal, 0.5, 0.5).y).toBeCloseTo(
        center.y + Math.sin(radians) * 48,
        10,
      );
      expect(sourcePoint(vertical, 0.5, 0.5).x).toBeCloseTo(center.x + Math.sin(radians) * 48, 10);
      expect(sourcePoint(vertical, 0.5, 0.5).y).toBeCloseTo(center.y - Math.cos(radians) * 48, 10);
    },
  );
  test("signed padding does not require source coverage of the crop", () => {
    const before = fixture(37, {
      widthRatio: 0.5,
      heightRatio: 0.25,
      offsetXRatio: -0.5,
      offsetYRatio: 0.5,
    });
    const next = editResolvedPictureCrop(before.layout, before.source, {
      field: "source-offset-x",
      value: -1000,
    });
    expect(next.source).toEqual({ ...before.source, offsetXRatio: -1000 / 360 });
    expect(next.layout).toEqual(before.layout);
  });
});
