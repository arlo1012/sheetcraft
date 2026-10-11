import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  moveResolvedPictureCropSourceBy,
  resizeResolvedPictureCropBy,
} from "../../picture-crop-gesture.js";
import { expectSourcePreserved, fixture, vector } from "./fixture.js";

const directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;

describe("crop gesture size budgets and exact no-ops", () => {
  test.each(directions)(
    "%s clamps edited crop axes at 1 and 10000 without moving source",
    (direction) => {
      const before = fixture(37);
      const horizontal = direction === "e" || direction === "w";
      const vertical = direction === "n" || direction === "s";
      const west = direction.includes("w");
      const north = direction.includes("n");
      const larger = resizeResolvedPictureCropBy(
        before,
        direction,
        vector(vertical ? 0 : west ? -20000 : 20000, horizontal ? 0 : north ? -20000 : 20000, 37),
      );
      expect(larger.layout.rect.width).toBe(vertical ? 360 : 10000);
      expect(larger.layout.rect.height).toBe(horizontal ? 240 : 10000);
      expectSourcePreserved(before, larger);
      const smaller = resizeResolvedPictureCropBy(
        before,
        direction,
        vector(vertical ? 0 : west ? 20000 : -20000, horizontal ? 0 : north ? 20000 : -20000, 37),
      );
      expect(smaller.layout.rect.width).toBe(vertical ? 360 : 1);
      expect(smaller.layout.rect.height).toBe(horizontal ? 240 : 1);
      expectSourcePreserved(before, smaller);
    },
  );

  test.each([0, 37, 90, 137, 219, 359.75])(
    "angle %s retains original state and references on zero delta",
    (angle) => {
      const before = fixture(angle, {
        widthRatio: 1.123456789,
        heightRatio: 0.987654321,
        offsetXRatio: -0.333333333,
        offsetYRatio: 0.142857142,
      });
      const snapshot = structuredClone(before);
      for (const direction of directions) {
        const after = resizeResolvedPictureCropBy(before, direction, { x: 0, y: -0 });
        expect(after).toBe(before);
        expect(after.layout).toBe(before.layout);
        expect(after.source).toBe(before.source);
      }
      expect(moveResolvedPictureCropSourceBy(before, { x: -0, y: 0 })).toBe(before);
      expect(before).toEqual(snapshot);
    },
  );

  test.each(directions)(
    "%s retains exact state when the gesture clamps to the existing bound",
    (direction) => {
      for (const size of [1, 10000]) {
        const before = fixture(37);
        before.layout = resolvePictureLayout({ x: 144, y: 144, width: size, height: size }, 37);
        const horizontal = direction === "e" || direction === "w";
        const vertical = direction === "n" || direction === "s";
        const outward = size === 10000 ? 100 : -100;
        const after = resizeResolvedPictureCropBy(
          before,
          direction,
          vector(
            vertical ? 0 : direction.includes("w") ? -outward : outward,
            horizontal ? 0 : direction.includes("n") ? -outward : outward,
            37,
          ),
        );
        expect(after).toBe(before);
        expect(after.layout).toBe(before.layout);
        expect(after.source).toBe(before.source);
      }
    },
  );

  test("durable over-budget layouts can stay unchanged or progressively shrink, never grow", () => {
    const before = fixture(37);
    before.layout = resolvePictureLayout({ x: 144, y: 144, width: 15000, height: 12000 }, 37);
    expect(resizeResolvedPictureCropBy(before, "se", vector(100, 200, 37))).toBe(before);
    const after = resizeResolvedPictureCropBy(before, "se", vector(-100, -200, 37));
    expect(after.layout.rect.width).toBeCloseTo(14900, 10);
    expect(after.layout.rect.height).toBeCloseTo(11800, 10);
    expectSourcePreserved(before, after);
    const narrowed = resizeResolvedPictureCropBy(after, "w", vector(5000, 0, 37));
    expect(narrowed.layout.rect.width).toBeCloseTo(9900, 10);
    expect(narrowed.layout.rect.height).toBe(after.layout.rect.height);
    expectSourcePreserved(before, narrowed);
  });

  test("ignoring a side's perpendicular delta and unrepresentably tiny body movement preserves state", () => {
    const before = fixture();
    expect(resizeResolvedPictureCropBy(before, "e", { x: 0, y: 10 })).toBe(before);
    expect(resizeResolvedPictureCropBy(before, "n", { x: 10, y: 0 })).toBe(before);
    const offset = fixture(0, { ...before.source, offsetXRatio: 1, offsetYRatio: 1 });
    expect(moveResolvedPictureCropSourceBy(offset, { x: Number.EPSILON, y: Number.EPSILON })).toBe(
      offset,
    );
    const rounded = fixture(0, {
      ...before.source,
      offsetXRatio: Math.sin(8),
      offsetYRatio: Math.sin(8),
    });
    // Multiplying this ratio by 360 and dividing again changes its last bit.
    // An absorbed movement must not introduce that drift on either local axis.
    expect(moveResolvedPictureCropSourceBy(rounded, { x: Number.EPSILON, y: Number.EPSILON })).toBe(
      rounded,
    );
  });

  test("existing source extents are not restricted to the crop budget", () => {
    const before = fixture(37, {
      widthRatio: 100000 / 360,
      heightRatio: 0.5 / 240,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    const after = resizeResolvedPictureCropBy(before, "se", vector(-100, 200, 37));
    expectSourcePreserved(before, after);
    expect(after.layout.rect.width * after.source.widthRatio).toBeCloseTo(100000, 9);
    expect(after.layout.rect.height * after.source.heightRatio).toBeCloseTo(0.5, 9);
  });
});
