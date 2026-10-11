import { describe, expect, test } from "vitest";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { resizeFramedPictureTo } from "../../picture-frame-numeric.js";
import { anchorModes, image, metrics } from "./fixture.js";

describe("numeric local picture size", () => {
  for (const mode of anchorModes)
    for (const angle of [0, 37])
      for (const axis of ["width", "height"] as const)
        for (const locked of [false, true]) {
          test(`${mode}, ${angle} degrees, ${axis}, lock ${locked} fixes the local north-west`, () => {
            const original = image(mode, angle, locked),
              before = structuredClone(original);
            const old = resolvePictureFrame(original.frame, metrics);
            const value = axis === "width" ? 432 : 288;
            const next = resizeFramedPictureTo(original, { axis, value }, metrics)!;
            const actual = resolvePictureFrame(next.frame, metrics);
            expect(actual.rect.width).toBeCloseTo(axis === "width" || locked ? 432 : 360, 10);
            expect(actual.rect.height).toBeCloseTo(axis === "height" || locked ? 288 : 240, 10);
            expect(actual.corners[0].x).toBeCloseTo(old.corners[0].x, 10);
            expect(actual.corners[0].y).toBeCloseTo(old.corners[0].y, 10);
            if (angle === 0) {
              expect(actual.corners[0]).toEqual(old.corners[0]);
              expect(actual.rect.x).toBe(old.rect.x);
              expect(actual.rect.y).toBe(old.rect.y);
            }
            if (!locked && axis === "height") {
              expect(actual.corners[1].x).toBeCloseTo(old.corners[1].x, 10);
              expect(actual.corners[1].y).toBeCloseTo(old.corners[1].y, 10);
            }
            expect(next.frame.anchor.mode).toBe(mode);
            expect(next.frame.source).toEqual(before.frame.source);
            expect(next.frame.angleDeg).toBe(angle);
            expect(next.frame.flipHorizontal).toBe(true);
            expect(next.frame.flipVertical).toBe(true);
            const { frame: _oldFrame, ...oldMetadata } = before;
            const { frame: _nextFrame, ...nextMetadata } = next;
            expect(nextMetadata).toEqual(oldMetadata);
            expect(original).toEqual(before);
          });
        }

  test("matches both observed WPS numeric size edits at 37 degrees", () => {
    const original = image();
    original.frame.source = {
      widthRatio: 1,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    };
    const grown = resizeFramedPictureTo(original, { axis: "width", value: 432 }, metrics)!;
    const grownRect = resolvePictureFrame(grown.frame, metrics).rect;
    const inches = (value: number) => Number((value / 96).toFixed(2));
    expect(Object.values(grownRect).map(inches)).toEqual([1.44, 1.63, 4.5, 3]);
    grown.lockAspectRatio = false;
    const reduced = resizeFramedPictureTo(grown, { axis: "height", value: 240 }, metrics)!;
    const reducedGeometry = resolvePictureFrame(reduced.frame, metrics);
    expect(Object.values(reducedGeometry.rect).map(inches)).toEqual([1.59, 1.68, 4.5, 2.5]);
    const old = resolvePictureFrame(original.frame, metrics);
    expect(reducedGeometry.corners[0].x).toBeCloseTo(old.corners[0].x, 10);
    expect(reducedGeometry.corners[0].y).toBeCloseTo(old.corners[0].y, 10);
  });

  test("an absent aspect flag defaults to locking the current crop-frame ratio", () => {
    const original = image();
    delete original.lockAspectRatio;
    const next = resizeFramedPictureTo(original, { axis: "height", value: 480 }, metrics)!;
    const actual = resolvePictureFrame(next.frame, metrics);
    expect(actual.rect.width).toBeCloseTo(720, 10);
    expect(actual.rect.height).toBeCloseTo(480, 10);
    expect(actual.sourceRect!.width / actual.sourceRect!.height).toBeCloseTo(
      (720 * 1.8) / (480 * 1.3),
      10,
    );
    expect(next.lockAspectRatio).toBeUndefined();
  });

  test.each([1, 10000])("accepts an exact unlocked numeric boundary of %i", (value) => {
    const original = image("fixed", 37, false);
    const next = resizeFramedPictureTo(original, { axis: "width", value }, metrics)!;
    const actual = resolvePictureFrame(next.frame, metrics).rect;
    expect(actual.width).toBeCloseTo(value, 10);
    expect(actual.height).toBeCloseTo(240, 10);
  });

  test.each(["width", "height"] as const)(
    "a locked %s edit reaches the minimum despite reciprocal rounding",
    (axis) => {
      const original = image("fixed", 37);
      original.frame.anchor = { mode: "fixed", x: 160, y: 140, size: { width: 49, height: 49 } };
      const next = resizeFramedPictureTo(original, { axis, value: 1 }, metrics)!;
      const actual = resolvePictureFrame(next.frame, metrics).rect;
      expect(actual.width).toBe(1);
      expect(actual.height).toBe(1);
    },
  );

  test.each(anchorModes)("a no-op preserves exact %s anchor data", (mode) => {
    const original = image(mode);
    const next = resizeFramedPictureTo(original, { axis: "width", value: 360 }, metrics)!;
    expect(next).toEqual(original);
    expect(next).not.toBe(original);
    expect(next.frame).not.toBe(original.frame);
    expect(next.frame.anchor).not.toBe(original.frame.anchor);
  });
});
