import { describe, expect, test } from "vitest";
import { pictureFrameLocalToWorld, resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resizePictureLayoutBy,
  movePictureLayoutBy,
  rotatePictureLayoutBy,
} from "../../picture-layout-edit.js";

const directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;
function value(angleDeg: number) {
  return { rect: { x: 180, y: 140, width: 360, height: 240 }, angleDeg };
}
function vector(x: number, y: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * x - Math.sin(rad) * y, y: Math.sin(rad) * x + Math.cos(rad) * y };
}
describe("source-free owned-member world edits", () => {
  test.each([0, 37, 90].flatMap((angle) => directions.map((direction) => ({ angle, direction }))))(
    "$angle $direction keeps the actual opposite local edge/vertex fixed",
    ({ angle, direction }) => {
      const original = value(angle),
        before = structuredClone(original);
      const west = direction.includes("w"),
        north = direction.includes("n"),
        sideX = direction === "e" || direction === "w",
        sideY = direction === "n" || direction === "s";
      const next = resizePictureLayoutBy(
        original,
        direction,
        vector(sideY ? 0 : west ? -72 : 72, sideX ? 0 : north ? -24 : 24, angle),
      )!;
      expect(next.rect.width).toBeCloseTo(sideY ? 360 : 432, 10);
      expect(next.rect.height).toBeCloseTo(sideX ? 240 : 264, 10);
      const fixed = (rect: typeof next.rect) =>
        pictureFrameLocalToWorld(rect, angle, {
          x: sideY ? rect.width / 2 : west ? rect.width : 0,
          y: sideX ? rect.height / 2 : north ? rect.height : 0,
        });
      expect(fixed(next.rect).x).toBeCloseTo(fixed(original.rect).x, 10);
      expect(fixed(next.rect).y).toBeCloseTo(fixed(original.rect).y, 10);
      expect(original).toEqual(before);
      expect(next).not.toHaveProperty("sourceRect");
    },
  );
  test("side ignores corner ratio; corner lock preserves existing ratio and budgets", () => {
    const original = value(0);
    expect(
      resizePictureLayoutBy(original, "e", { x: 72, y: 24 }, { preserveCornerRatio: true })!.rect,
    ).toEqual({ x: 180, y: 140, width: 432, height: 240 });
    const corner = resizePictureLayoutBy(
      original,
      "se",
      { x: 72, y: 24 },
      { preserveCornerRatio: true },
    )!;
    expect(corner.rect.width / corner.rect.height).toBeCloseTo(1.5, 12);
    expect(corner.rect.width).toBe(432);
    expect(corner.rect.height).toBe(288);
    const bounded = resizePictureLayoutBy(
      original,
      "nw",
      { x: 10000, y: 10000 },
      { minSize: 24, preserveCornerRatio: true },
    )!;
    expect(bounded.rect.width).toBe(36);
    expect(bounded.rect.height).toBe(24);
  });
  test("movement and rotation preserve the unrelated world geometry", () => {
    const original = value(37);
    const moved = movePictureLayoutBy(original, { x: -40, y: 20 })!;
    expect(moved.rect).toEqual({ ...original.rect, x: 140, y: 160 });
    expect(moved.angleDeg).toBe(37);
    const rotated = rotatePictureLayoutBy(original, 23)!;
    expect(rotated.rect).toEqual(original.rect);
    expect(rotated.angleDeg).toBe(60);
  });
  test("collapsed and illegal input refuse without invented source or tiny clamped child", () => {
    const collapsed = { rect: { x: 0, y: 0, width: 0, height: 240 }, angleDeg: 0 };
    expect(movePictureLayoutBy(collapsed, { x: 1, y: 1 })).toBeNull();
    expect(resizePictureLayoutBy(collapsed, "se", { x: 1, y: 1 })).toBeNull();
    expect(rotatePictureLayoutBy(collapsed, 1)).toBeNull();
    expect(() => movePictureLayoutBy(value(0), { x: Infinity, y: 1 })).toThrow();
    expect(() =>
      resizePictureLayoutBy(value(0), "e", { x: 1, y: 1 }, { maxSize: Infinity }),
    ).toThrow();
    expect(() => rotatePictureLayoutBy(value(0), NaN)).toThrow();
    const small = { rect: { x: 0, y: 0, width: 0.5, height: 0.25 }, angleDeg: 0 };
    expect(resizePictureLayoutBy(small, "e", { x: 0, y: 3 }, { minSize: 24 })).toEqual(
      resolvePictureLayout(small.rect, 0),
    );
  });
});
