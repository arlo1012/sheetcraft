import { describe, expect, test } from "vitest";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  cropFloatingImage,
  flipFloatingImage,
  rotateFloatingImage,
  restoreFloatingImage,
} from "../../floating-image-transform.js";
import { createSheetGeometry } from "../../geometry.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import { createRowVisibilityIndex } from "../../visibility.js";
const layout = createSheetViewportLayout({
  geometry: createSheetGeometry({
    rowCount: 20,
    columnCount: 20,
    rowHeight: 20,
    columnWidth: 80,
  }),
  rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20 }),
  freeze: { rows: 0, columns: 0 },
  viewportSize: { width: 800, height: 400 },
});
const image: FloatingImage = {
  id: "image",
  assetId: "asset",
  altText: "Image",
  anchor: { row: 5, column: 5 },
  offsetX: 0,
  offsetY: 0,
  width: 400,
  height: 200,
};

describe("floating image flips", () => {
  test.each([
    [0, "horizontal", "flipHorizontal", 0.5, 0],
    [90, "horizontal", "flipVertical", 0, 0],
    [180, "horizontal", "flipHorizontal", 0, 0.5],
    [270, "horizontal", "flipVertical", 0.5, 0.5],
    [0, "vertical", "flipVertical", 0, 0.5],
    [90, "vertical", "flipHorizontal", 0.5, 0.5],
    [180, "vertical", "flipVertical", 0.5, 0],
    [270, "vertical", "flipHorizontal", 0, 0],
  ] as const)(
    "flips rotation %i on screen %s and crops the correct original corner",
    (rotation, axis, field, x, y) => {
      const original: FloatingImage = {
        ...image,
        ...(rotation ? { transform: { rotation } } : {}),
      };
      const flipped = flipFloatingImage(original, axis);
      expect(flipped.transform?.[field]).toBe(true);
      expect(flipped).toMatchObject({
        anchor: image.anchor,
        offsetX: 0,
        offsetY: 0,
        width: 400,
        height: 200,
      });
      expect(original.transform?.[field]).toBeUndefined();
      const cropped = cropFloatingImage(flipped, { x: 0, y: 0, width: 0.5, height: 0.5 }, layout)!;
      expect(cropped.transform?.crop).toEqual({ x, y, width: 0.5, height: 0.5 });
      expect(cropped.transform?.[field]).toBe(true);
      expect(flipFloatingImage(flipped, axis)).toEqual(original);
    },
  );
  test("rotation retains source flips and restore clears both directions", () => {
    const both = flipFloatingImage(flipFloatingImage(image, "vertical"), "horizontal");
    const rotated = rotateFloatingImage(both, 1, layout)!;
    expect(rotated.transform).toEqual({ rotation: 90, flipHorizontal: true, flipVertical: true });
    expect(restoreFloatingImage(rotated, layout)!.transform).toBeUndefined();
  });
});
