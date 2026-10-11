import { describe, expect, test } from "vitest";
import {
  moveResolvedPictureCropSourceBy,
  resizeResolvedPictureCropBy,
} from "../../picture-crop-gesture.js";
import { expectSourcePreserved, fixture, vector } from "./fixture.js";

describe("37 degree WPS crop observations in 96px/inch coordinates", () => {
  test("right midpoint crops one inch with fixed source and opposite edge", () => {
    const before = fixture(37);
    const after = resizeResolvedPictureCropBy(before, "e", vector(-96, 0, 37));
    const { rect } = after.layout;
    expect(rect.width / 96).toBeCloseTo(2.75, 10);
    expect(rect.height / 96).toBeCloseTo(2.5, 10);
    expect(rect.x / 96).toBeCloseTo(1.6, 2);
    expect(rect.y / 96).toBeCloseTo(1.2, 2);
    expect((rect.width * after.source.widthRatio) / 96).toBeCloseTo(3.75, 10);
    expect((rect.height * after.source.heightRatio) / 96).toBeCloseTo(2.5, 10);
    expect((rect.width * after.source.offsetXRatio) / 96).toBeCloseTo(0.5, 10);
    expect(after.source.offsetYRatio).toBe(0);
    expectSourcePreserved(before, after);
  });

  test("southeast corner freely reaches the observed unequal crop spans", () => {
    const before = fixture(37);
    const after = resizeResolvedPictureCropBy(before, "se", vector(-0.98 * 96, -0.6 * 96, 37));
    const { rect } = after.layout;
    expect(rect.width / 96).toBeCloseTo(2.77, 10);
    expect(rect.height / 96).toBeCloseTo(1.9, 10);
    expect(rect.x / 96).toBeCloseTo(1.78, 2);
    expect(rect.y / 96).toBeCloseTo(1.27, 2);
    expectSourcePreserved(before, after);
  });

  test("body screen drag 60,30 changes only source offsets by inverse rotation", () => {
    const before = fixture(37);
    const after = moveResolvedPictureCropSourceBy(before, { x: 60, y: 30 });
    const angle = (37 * Math.PI) / 180;
    expect(after.layout).toBe(before.layout);
    expect(after.source.widthRatio).toBe(before.source.widthRatio);
    expect(after.source.heightRatio).toBe(before.source.heightRatio);
    expect(after.source.offsetXRatio * 360).toBeCloseTo(
      Math.cos(angle) * 60 + Math.sin(angle) * 30,
      10,
    );
    expect(after.source.offsetYRatio * 240).toBeCloseTo(
      -Math.sin(angle) * 60 + Math.cos(angle) * 30,
      10,
    );
  });
});
