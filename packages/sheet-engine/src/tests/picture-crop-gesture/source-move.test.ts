import { describe, expect, test } from "vitest";
import { moveResolvedPictureCropSourceBy } from "../../picture-crop-gesture.js";
import { fixture, sourcePoint } from "./fixture.js";

describe("source body movement under a fixed crop", () => {
  test.each([0, 37, 90, 137, 219, 359.75])(
    "angle %s translates every flipped source world corner by the given delta",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.25,
        heightRatio: 0.75,
        offsetXRatio: -0.42,
        offsetYRatio: 0.17,
      });
      const snapshot = structuredClone(before);
      const delta = { x: -60, y: 30 };
      const after = moveResolvedPictureCropSourceBy(before, delta);
      for (const flipHorizontal of [false, true])
        for (const flipVertical of [false, true])
          for (const [u, v] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ] as const) {
            const old = sourcePoint(before, u, v, flipHorizontal, flipVertical);
            const next = sourcePoint(after, u, v, flipHorizontal, flipVertical);
            expect(next.x).toBeCloseTo(old.x + delta.x, 9);
            expect(next.y).toBeCloseTo(old.y + delta.y, 9);
          }
      expect(after.layout).toBe(before.layout);
      expect(after.source.widthRatio).toBe(before.source.widthRatio);
      expect(after.source.heightRatio).toBe(before.source.heightRatio);
      expect(before).toEqual(snapshot);
    },
  );

  test("source movement may leave the crop entirely without changing source size", () => {
    const before = fixture(37);
    const after = moveResolvedPictureCropSourceBy(before, { x: -1000000, y: 1000000 });
    expect(Math.abs(after.source.offsetXRatio)).toBeGreaterThan(1);
    expect(Math.abs(after.source.offsetYRatio)).toBeGreaterThan(1);
    expect(after.layout).toBe(before.layout);
    expect(after.source.widthRatio).toBe(1);
    expect(after.source.heightRatio).toBe(1);
  });
});
