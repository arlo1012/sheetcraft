import { describe, expect, test } from "vitest";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import {
  resizeFramedPictureTo,
  rotateFramedPictureTo,
  type FramedPictureNumericSizeEdit,
} from "../../picture-frame-numeric.js";
import { collapsedImage, image, metrics } from "./fixture.js";

describe("numeric picture edit validation", () => {
  test.each([0, -1, 0.5, 10001, NaN, Infinity, -Infinity])(
    "rejects size %s without mutating the input",
    (value) => {
      const original = image(),
        before = structuredClone(original);
      expect(() => resizeFramedPictureTo(original, { axis: "width", value }, metrics)).toThrow(
        RangeError,
      );
      expect(original).toEqual(before);
    },
  );

  test.each([
    null,
    [],
    { value: 400 },
    { axis: "both", value: 400 },
    { axis: "width", value: "400" },
    { axis: "width", value: 400, height: 200 },
  ])("rejects an ambiguous or malformed numeric edit %j", (edit) => {
    const original = image(),
      before = structuredClone(original);
    expect(() =>
      resizeFramedPictureTo(original, edit as FramedPictureNumericSizeEdit, metrics),
    ).toThrow();
    expect(original).toEqual(before);
  });

  test.each([
    { axis: "width", value: 1 },
    { axis: "height", value: 10000 },
  ] as const)("rejects locked counterpart outside the budget for $axis=$value", (edit) => {
    const original = image(),
      before = structuredClone(original);
    expect(() => resizeFramedPictureTo(original, edit, metrics)).toThrow(RangeError);
    expect(original).toEqual(before);
  });

  test.each([NaN, Infinity, -Infinity])("rejects nonfinite angle %s", (angle) => {
    const original = image(),
      before = structuredClone(original);
    expect(() => rotateFramedPictureTo(original, angle, metrics)).toThrow(RangeError);
    expect(original).toEqual(before);
  });

  test("rejects a derived source overflow before the object can be committed", () => {
    const original = image("fixed", 37, false);
    original.frame.source.widthRatio = 2e304;
    const before = structuredClone(original);
    expect(() => resizeFramedPictureTo(original, { axis: "width", value: 10000 }, metrics)).toThrow(
      RangeError,
    );
    expect(original).toEqual(before);
  });

  test("collapsed stretching frames return null for both edits without mutation", () => {
    const { original, hiddenMetrics } = collapsedImage(),
      before = structuredClone(original);
    expect(
      resizeFramedPictureTo(original, { axis: "width", value: 432 }, hiddenMetrics),
    ).toBeNull();
    expect(rotateFramedPictureTo(original, 60, hiddenMetrics)).toBeNull();
    expect(original).toEqual(before);
  });

  test("runtime legacy objects are rejected instead of promoted", () => {
    const unsupported = {
      id: "legacy",
      assetId: "asset",
      altText: "Synthetic",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 360,
      height: 240,
    };
    const before = structuredClone(unsupported);
    const original = unsupported as unknown as FramedFloatingImage;
    expect(() => resizeFramedPictureTo(original, { axis: "width", value: 432 }, metrics)).toThrow(
      TypeError,
    );
    expect(() => rotateFramedPictureTo(original, 60, metrics)).toThrow(TypeError);
    expect(unsupported).toEqual(before);
  });

  test("unknown frame kinds fail without mutation", () => {
    const original = image();
    (original.frame as unknown as { kind: string }).kind = "unknown";
    const before = structuredClone(original);
    expect(() => resizeFramedPictureTo(original, { axis: "width", value: 432 }, metrics)).toThrow();
    expect(() => rotateFramedPictureTo(original, 60, metrics)).toThrow();
    expect(original).toEqual(before);
  });
});
