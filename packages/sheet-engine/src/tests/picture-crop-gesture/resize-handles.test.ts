import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld, resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { Point } from "../../geometry.js";
import { resizeResolvedPictureCropBy } from "../../picture-crop-gesture.js";
import { expectSourcePreserved, fixture, vector } from "./fixture.js";

const directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;

describe("world crop handle geometry", () => {
  test.each(
    [0, 37, 90, 137, 219, 359.75].flatMap((angle) =>
      directions.map((direction) => ({ angle, direction })),
    ),
  )(
    "$angle $direction retains the opposite edge/corner and flipped source",
    ({ angle, direction }) => {
      const before = fixture(angle, {
        widthRatio: 1.123456789,
        heightRatio: 0.987654321,
        offsetXRatio: -0.333333333,
        offsetYRatio: 0.142857142,
      });
      const snapshot = structuredClone(before);
      const horizontal = direction === "e" || direction === "w";
      const vertical = direction === "n" || direction === "s";
      const west = direction.includes("w");
      const north = direction.includes("n");
      const after = resizeResolvedPictureCropBy(
        before,
        direction,
        vector(vertical ? 127 : west ? -72 : 72, horizontal ? -91 : north ? -24 : 24, angle),
      );
      expect(after.layout.rect.width).toBeCloseTo(vertical ? 360 : 432, 10);
      expect(after.layout.rect.height).toBeCloseTo(horizontal ? 240 : 264, 10);
      const fixedLocalPoints: Point[] = horizontal
        ? [
            { x: west ? 1 : 0, y: 0 },
            { x: west ? 1 : 0, y: 1 },
          ]
        : vertical
          ? [
              { x: 0, y: north ? 1 : 0 },
              { x: 1, y: north ? 1 : 0 },
            ]
          : [{ x: west ? 1 : 0, y: north ? 1 : 0 }];
      for (const point of fixedLocalPoints) {
        const old = pictureFrameLocalToWorld(before.layout.rect, angle, {
          x: before.layout.rect.width * point.x,
          y: before.layout.rect.height * point.y,
        });
        const next = pictureFrameLocalToWorld(after.layout.rect, angle, {
          x: after.layout.rect.width * point.x,
          y: after.layout.rect.height * point.y,
        });
        expect(next.x).toBeCloseTo(old.x, 10);
        expect(next.y).toBeCloseTo(old.y, 10);
      }
      expectSourcePreserved(before, after);
      expect(after.layout).toEqual(resolvePictureLayout(after.layout.rect, angle));
      expect(after.layout.angleDeg).toBe(angle);
      expect(before).toEqual(snapshot);
    },
  );

  test("crop handles permit signed padding and free unequal corner scaling", () => {
    const before = fixture(37);
    const after = resizeResolvedPictureCropBy(before, "nw", vector(-180, -24, 37));
    expect(after.layout.rect.width).toBeCloseTo(540, 10);
    expect(after.layout.rect.height).toBeCloseTo(264, 10);
    expect(after.layout.rect.width / after.layout.rect.height).not.toBeCloseTo(1.5, 4);
    expect(after.source.widthRatio).toBeLessThan(1);
    expect(after.source.heightRatio).toBeLessThan(1);
    expect(after.source.offsetXRatio).toBeGreaterThan(0);
    expect(after.source.offsetYRatio).toBeGreaterThan(0);
    expectSourcePreserved(before, after);
  });

  test("unchanged source axes retain their exact ratios", () => {
    const before = fixture(37, {
      widthRatio: 1.123456789,
      heightRatio: 0.987654321,
      offsetXRatio: -0.333333333,
      offsetYRatio: 0.142857142,
    });
    const horizontal = resizeResolvedPictureCropBy(before, "w", vector(70, 0, 37));
    expect(horizontal.source.heightRatio).toBe(before.source.heightRatio);
    expect(horizontal.source.offsetYRatio).toBe(before.source.offsetYRatio);
    const vertical = resizeResolvedPictureCropBy(before, "n", vector(0, 70, 37));
    expect(vertical.source.widthRatio).toBe(before.source.widthRatio);
    expect(vertical.source.offsetXRatio).toBe(before.source.offsetXRatio);
  });
});
