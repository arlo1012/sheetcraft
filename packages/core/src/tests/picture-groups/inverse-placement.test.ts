import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "../../picture-frame.js";
import {
  placePictureGroupChild,
  resolvePictureGroupChildLayout,
} from "../../picture-group-layout.js";

describe("inverse orthogonal member placement", () => {
  test.each([0, 37, 90, 180, 323])(
    "round-trips world corners through a parent rotated %s degrees",
    (angleDeg) => {
      const parent = resolvePictureLayout({ x: 120, y: -30, width: 700, height: 230 }, angleDeg);
      const original = resolvePictureLayout({ x: -150, y: 400, width: 216, height: 144 }, 74);
      const placed = placePictureGroupChild(parent, original);
      if (placed.status !== "placed") throw new Error("Expected placement.");
      const restored = resolvePictureGroupChildLayout(parent, placed.frame)!;
      expect(restored.angleDeg).toBe(74);
      expect(restored.rect.width).toBeCloseTo(original.rect.width, 10);
      expect(restored.rect.height).toBeCloseTo(original.rect.height, 10);
      for (let index = 0; index < original.corners.length; index++) {
        expect(restored.corners[index]!.x).toBeCloseTo(original.corners[index]!.x, 9);
        expect(restored.corners[index]!.y).toBeCloseTo(original.corners[index]!.y, 9);
      }
    },
  );
  test("reparenting between differently rotated/anisotropic parents preserves orthogonal world geometry", () => {
    const first = resolvePictureLayout({ x: 100, y: 100, width: 516, height: 224 }, 37);
    const second = resolvePictureLayout({ x: -200, y: 500, width: 800, height: 400 }, 323);
    const world = resolvePictureGroupChildLayout(first, {
      rect: { xRatio: 0.2, yRatio: -0.5, widthRatio: 0.3, heightRatio: 0.7 },
      angleDeg: 37,
    })!;
    const placed = placePictureGroupChild(second, world);
    if (placed.status !== "placed") throw new Error("Expected placement.");
    expect(placed.frame.angleDeg).toBe(111);
    const restored = resolvePictureGroupChildLayout(second, placed.frame)!;
    for (let index = 0; index < world.corners.length; index++) {
      expect(restored.corners[index]!.x).toBeCloseTo(world.corners[index]!.x, 9);
      expect(restored.corners[index]!.y).toBeCloseTo(world.corners[index]!.y, 9);
    }
  });
  test("repeated inverse/forward placement does not visibly drift", () => {
    const parent = resolvePictureLayout({ x: 100, y: 100, width: 516, height: 224 }, 37);
    const original = resolvePictureLayout({ x: 400, y: 180, width: 216, height: 144 }, 74);
    let world = original;
    for (let count = 0; count < 100; count++) {
      const placed = placePictureGroupChild(parent, world);
      if (placed.status !== "placed") throw new Error("Expected placement.");
      world = resolvePictureGroupChildLayout(parent, placed.frame)!;
    }
    expect(world.rect.x).toBeCloseTo(original.rect.x, 8);
    expect(world.rect.y).toBeCloseTo(original.rect.y, 8);
    expect(world.rect.width).toBeCloseTo(original.rect.width, 8);
    expect(world.rect.height).toBeCloseTo(original.rect.height, 8);
  });
  test("collapsed owner is an explicit outcome and leaves child geometry untouched", () => {
    const world = resolvePictureLayout({ x: 100, y: 100, width: 216, height: 144 }, 37);
    const before = structuredClone(world);
    const parent = resolvePictureLayout({ x: 0, y: 0, width: 0, height: 100 }, 37);
    expect(placePictureGroupChild(parent, world)).toEqual({ status: "collapsed-parent" });
    expect(world).toEqual(before);
    expect(
      resolvePictureGroupChildLayout(parent, {
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
        angleDeg: 0,
      }),
    ).toBeNull();
  });
});
