import { describe, expect, test } from "vitest";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { rotateFramedPictureTo } from "../../picture-frame-numeric.js";
import { anchorModes, image, metrics } from "./fixture.js";

describe("numeric absolute picture rotation", () => {
  for (const mode of anchorModes)
    for (const angle of [0, 37]) {
      test(`${mode} rotates ${angle} to 60 degrees around the unchanged center`, () => {
        const original = image(mode, angle),
          before = structuredClone(original);
        const old = resolvePictureFrame(original.frame, metrics);
        const next = rotateFramedPictureTo(original, 60, metrics)!;
        const actual = resolvePictureFrame(next.frame, metrics);
        expect(next.frame.angleDeg).toBe(60);
        expect(next.frame.anchor).toEqual(original.frame.anchor);
        expect(actual.rect).toEqual(old.rect);
        const center = (corners: typeof old.corners) => ({
          x: (corners[0].x + corners[2].x) / 2,
          y: (corners[0].y + corners[2].y) / 2,
        });
        expect(center(actual.corners).x).toBeCloseTo(center(old.corners).x, 10);
        expect(center(actual.corners).y).toBeCloseTo(center(old.corners).y, 10);
        expect(actual.corners[0]).not.toEqual(old.corners[0]);
        expect({ ...next.frame, angleDeg: angle }).toEqual(original.frame);
        expect({ ...next, frame: original.frame }).toEqual(original);
        expect(original).toEqual(before);
      });
    }

  test.each([
    { target: -37, expected: 323 },
    { target: 420, expected: 60 },
    { target: -720, expected: 0 },
    { target: 1e20, expected: 280 },
    { target: -1e20, expected: 80 },
  ])("normalizes absolute angle $target to $expected", ({ target, expected }) => {
    expect(rotateFramedPictureTo(image(), target, metrics)!.frame.angleDeg).toBe(expected);
  });

  test.each(anchorModes)("equivalent rotations preserve exact %s anchor data", (mode) => {
    const original = image(mode);
    const next = rotateFramedPictureTo(original, 397, metrics)!;
    expect(next).toEqual(original);
    expect(next).not.toBe(original);
    expect(next.frame).not.toBe(original.frame);
  });
});
