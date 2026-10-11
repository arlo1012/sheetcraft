import { describe, expect, test } from "vitest";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "../../floating-image-layout.js";
import { resizeFloatingImageSelectionBy } from "../../floating-image-selection.js";
import { createLayout } from "./fixture.js";
function fixture() {
  const layout = createLayout();
  const base: FloatingImage = {
    id: "first",
    assetId: "a",
    altText: "Synthetic",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 240,
    height: 144,
    lockAspectRatio: true,
  };
  const images = [
    reanchorFloatingImageAtSheetRect(base, { x: 100, y: 100, width: 240, height: 144 }, layout)!,
    reanchorFloatingImageAtSheetRect(
      { ...base, id: "second" },
      { x: 400, y: 260, width: 160, height: 96 },
      layout,
    )!,
  ];
  return {
    layout,
    images,
    rects: (next: FloatingImage[]) => next.map((image) => getFloatingImageSheetRect(image, layout)),
  };
}
describe("temporary picture selection resize", () => {
  test.each([
    ["e", 0, 10],
    ["w", 0, -10],
    ["n", 10, 0],
    ["s", -10, 0],
  ] as const)(
    "%s ignores orthogonal-only movement without inflating a small image or normalizing its anchor",
    (direction, x, y) => {
      const f = fixture();
      f.images[0]!.width = 10;
      f.images[0]!.height = 5;
      f.images[0]!.offsetX = 400;
      const before = structuredClone(f.images);
      expect(
        resizeFloatingImageSelectionBy(f.images, "first", direction, { x, y }, f.layout),
      ).toEqual(before);
      expect(f.images).toEqual(before);
    },
  );
  test("a side uses each member's independent fixed origin and a common width multiplier", () => {
    const f = fixture(),
      before = structuredClone(f.images);
    const next = resizeFloatingImageSelectionBy(
      f.images,
      "first",
      "e",
      { x: 48, y: 50 },
      f.layout,
    )!;
    expect(f.rects(next)).toEqual([
      { x: 100, y: 100, width: 288, height: 144 },
      { x: 400, y: 260, width: 192, height: 96 },
    ]);
    expect(f.images).toEqual(before);
  });
  test.each(["n", "s", "w", "e", "nw", "ne", "sw", "se"] as const)(
    "%s fixes every member's own opposite edge/corner",
    (direction) => {
      const f = fixture();
      const west = direction.includes("w"),
        north = direction.includes("n");
      const next = resizeFloatingImageSelectionBy(
        f.images,
        "first",
        direction,
        { x: west ? -48 : 48, y: north ? -24 : 24 },
        f.layout,
      )!;
      const old = f.rects(f.images),
        rects = f.rects(next);
      for (let i = 0; i < rects.length; i++) {
        expect(rects[i]!.x + (west ? rects[i]!.width : 0)).toBeCloseTo(
          old[i]!.x + (west ? old[i]!.width : 0),
        );
        expect(rects[i]!.y + (north ? rects[i]!.height : 0)).toBeCloseTo(
          old[i]!.y + (north ? old[i]!.height : 0),
        );
      }
      expect(next[0]!.width / f.images[0]!.width).toBeCloseTo(next[1]!.width / f.images[1]!.width);
      expect(next[0]!.height / f.images[0]!.height).toBeCloseTo(
        next[1]!.height / f.images[1]!.height,
      );
    },
  );
  test("unlocked corner shares independent width and height multipliers without spacing changes", () => {
    const f = fixture();
    f.images[0]!.lockAspectRatio = false;
    const next = resizeFloatingImageSelectionBy(
      f.images,
      "first",
      "se",
      { x: 48, y: 72 },
      f.layout,
    )!;
    expect(f.rects(next)).toEqual([
      { x: 100, y: 100, width: 288, height: 216 },
      { x: 400, y: 260, width: 192, height: 144 },
    ]);
    expect(next.map((image) => image.lockAspectRatio)).toEqual([false, true]);
  });
  test("a maximum in any member bounds the common multiplier atomically", () => {
    const f = fixture();
    f.images[1]!.width = 9000;
    const next = resizeFloatingImageSelectionBy(
      f.images,
      "first",
      "e",
      { x: 240, y: 0 },
      f.layout,
    )!;
    expect(next[1]!.width).toBe(10000);
    expect(next[0]!.width).toBeCloseTo((240 * 10000) / 9000);
    expect(next[0]!.height).toBe(144);
  });
  test("left and top expansion respect every member's origin without moving its opposite point", () => {
    const f = fixture();
    f.images[1] = reanchorFloatingImageAtSheetRect(
      f.images[1]!,
      { x: 4, y: 2, width: 160, height: 96 },
      f.layout,
    )!;
    const old = f.rects(f.images),
      next = resizeFloatingImageSelectionBy(
        f.images,
        "first",
        "nw",
        { x: -1000, y: -1000 },
        f.layout,
      )!;
    for (const [i, rect] of f.rects(next).entries()) {
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeCloseTo(old[i]!.x + old[i]!.width);
      expect(rect!.y + rect!.height).toBeCloseTo(old[i]!.y + old[i]!.height);
    }
  });
  test("rejects missing/duplicate members and nonfinite input without mutation", () => {
    const f = fixture(),
      before = structuredClone(f.images);
    expect(
      resizeFloatingImageSelectionBy(f.images, "absent", "e", { x: 10, y: 0 }, f.layout),
    ).toBeNull();
    expect(
      resizeFloatingImageSelectionBy(
        [f.images[0]!, f.images[0]!],
        "first",
        "e",
        { x: 10, y: 0 },
        f.layout,
      ),
    ).toBeNull();
    expect(() =>
      resizeFloatingImageSelectionBy(f.images, "first", "e", { x: NaN, y: 0 }, f.layout),
    ).toThrow();
    expect(f.images).toEqual(before);
  });
});
