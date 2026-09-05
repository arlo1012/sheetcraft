import { describe, expect, test } from "vitest";
import { getFloatingImageSheetRect, resizeFloatingImageBy } from "../../floating-image-layout.js";
import { createLayout } from "./fixture.js";

describe("floating image resizing", () => {
  test.each([
    ["e", { x: 25, y: 0 }, { x: 100, y: 30, width: 125, height: 50 }],
    ["w", { x: 25, y: 0 }, { x: 125, y: 30, width: 75, height: 50 }],
    ["s", { x: 0, y: 20 }, { x: 100, y: 30, width: 100, height: 70 }],
    ["n", { x: 0, y: 20 }, { x: 100, y: 50, width: 100, height: 30 }],
  ] as const)(
    "resizes the %s edge while keeping its opposite edge fixed",
    (direction, delta, expected) => {
      const layout = createLayout();
      const resized = resizeFloatingImageBy(
        { anchor: { row: 1, column: 1 }, offsetX: 20, offsetY: 10, width: 100, height: 50 },
        direction,
        delta,
        layout,
      );
      expect(resized).not.toBeNull();
      expect(getFloatingImageSheetRect(resized!, layout)).toEqual(expected);
    },
  );

  test.each([
    ["se", { x: 10, y: 20 }, { x: 100, y: 30, width: 140, height: 70 }],
    ["sw", { x: -40, y: 10 }, { x: 60, y: 30, width: 140, height: 70 }],
    ["ne", { x: 10, y: -20 }, { x: 100, y: 10, width: 140, height: 70 }],
    ["nw", { x: -40, y: -20 }, { x: 60, y: 10, width: 140, height: 70 }],
  ] as const)(
    "resizes the %s corner at the original aspect ratio",
    (direction, delta, expected) => {
      const layout = createLayout();
      const resized = resizeFloatingImageBy(
        { anchor: { row: 1, column: 1 }, offsetX: 20, offsetY: 10, width: 100, height: 50 },
        direction,
        delta,
        layout,
      );
      expect(resized).not.toBeNull();
      expect(getFloatingImageSheetRect(resized!, layout)).toEqual(expected);
    },
  );

  test("constrains a left resize to the sheet origin without moving the right edge", () => {
    const layout = createLayout();
    const resized = resizeFloatingImageBy(
      { anchor: { row: 0, column: 0 }, offsetX: 4, offsetY: 0, width: 10, height: 20 },
      "w",
      { x: -20, y: 0 },
      layout,
      { minSize: 24 },
    );
    expect(resized).not.toBeNull();
    expect(getFloatingImageSheetRect(resized!, layout)).toEqual({
      x: 0,
      y: 0,
      width: 14,
      height: 20,
    });
  });

  test("applies configured minimum and maximum sizes without inflating an unchanged small image", () => {
    const layout = createLayout();
    const image = {
      anchor: { row: 1, column: 1 },
      offsetX: 20,
      offsetY: 10,
      width: 100,
      height: 50,
    };
    const shrunk = resizeFloatingImageBy(image, "e", { x: -99, y: 0 }, layout, {
      minSize: 60,
      maxSize: 110,
    });
    const enlarged = resizeFloatingImageBy(image, "e", { x: 999, y: 0 }, layout, {
      minSize: 60,
      maxSize: 110,
    });
    const smallImage = {
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 8,
      height: 5,
    };

    expect(getFloatingImageSheetRect(shrunk!, layout)?.width).toBe(60);
    expect(getFloatingImageSheetRect(enlarged!, layout)?.width).toBe(110);
    expect(resizeFloatingImageBy(smallImage, "se", { x: 0, y: 0 }, layout, { minSize: 24 })).toBe(
      smallImage,
    );
  });
});
