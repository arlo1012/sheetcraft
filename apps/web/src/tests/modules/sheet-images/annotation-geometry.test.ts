import { describe, expect, test } from "vitest";
import type { ImageTransform } from "@sheetcraft/core/workbook";
import {
  pictureAnnotationPoint,
  pictureSourceAnnotationPoint,
} from "../../../modules/sheet-images/picture-annotation-geometry";

const cases: Array<{
  name: string;
  transform?: ImageTransform;
  expected: { x: number; y: number };
}> = [
  { name: "uncropped image", expected: { x: 0.25, y: 0.75 } },
  { name: "90 degree rotation", transform: { rotation: 90 }, expected: { x: 0.75, y: 0.75 } },
  { name: "180 degree rotation", transform: { rotation: 180 }, expected: { x: 0.75, y: 0.25 } },
  { name: "270 degree rotation", transform: { rotation: 270 }, expected: { x: 0.25, y: 0.25 } },
  { name: "horizontal flip", transform: { flipHorizontal: true }, expected: { x: 0.75, y: 0.75 } },
  { name: "vertical flip", transform: { flipVertical: true }, expected: { x: 0.25, y: 0.25 } },
  {
    name: "both flips",
    transform: { flipHorizontal: true, flipVertical: true },
    expected: { x: 0.75, y: 0.25 },
  },
  {
    name: "flip before rotation",
    transform: { flipHorizontal: true, rotation: 90 },
    expected: { x: 0.25, y: 0.75 },
  },
  {
    name: "crop",
    transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
    expected: { x: 0.225, y: 0.65 },
  },
  {
    name: "crop and rotation",
    transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }, rotation: 90 },
    expected: { x: 0.475, y: 0.65 },
  },
];
describe("picture annotation coordinates", () => {
  test.each(cases)(
    "maps $name back to the original non-square image",
    ({ transform, expected }) => {
      const result = pictureAnnotationPoint({ x: 0.25, y: 0.75 }, transform, 400, 200)!;
      expect(result.x).toBeCloseTo(expected.x);
      expect(result.y).toBeCloseTo(expected.y);
    },
  );
  test("accounts for reflection space and rejects points inside the reflected area", () => {
    const transform: ImageTransform = { appearance: { reflection: true } };
    expect(pictureAnnotationPoint({ x: 0.25, y: 0.6 }, transform, 400, 200)).toEqual({
      x: 0.25,
      y: 0.75,
    });
    expect(pictureAnnotationPoint({ x: 1, y: 0.8 }, transform, 400, 200)).toEqual({ x: 1, y: 1 });
    expect(pictureAnnotationPoint({ x: 0.25, y: 0.9 }, transform, 400, 200)).toBeNull();
  });
  test.each([
    { x: -0.1, y: 0.5 },
    { x: 1.1, y: 0.5 },
    { x: 0.5, y: -0.1 },
    { x: 0.5, y: 1.1 },
  ])("rejects points outside the displayed image", (point) => {
    expect(pictureAnnotationPoint(point, undefined, 400, 200)).toBeNull();
  });
});

describe("original-source annotation coordinates", () => {
  test("clamps the full-raster UVs without applying frame crop, flips or projected paint bounds", () => {
    expect(pictureSourceAnnotationPoint({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 });
    expect(pictureSourceAnnotationPoint({ x: -0.1, y: 1.1 })).toEqual({ x: 0, y: 1 });
    expect(pictureSourceAnnotationPoint({ x: 1.1, y: -0.1 })).toEqual({ x: 1, y: 0 });
  });
  test.each([
    { x: NaN, y: 0.5 },
    { x: 0.5, y: Infinity },
  ])("rejects non-finite points", (point) => {
    expect(pictureSourceAnnotationPoint(point)).toBeNull();
  });
});
