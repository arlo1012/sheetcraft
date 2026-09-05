import { describe, expect, test } from "vitest";
import { normalizeFloatingImageForSheet, type FloatingImage } from "@idea10/core/workbook";
import { getFloatingImageSheetRect } from "../../floating-image-layout.js";
import {
  cropFloatingImage,
  restoreFloatingImage,
  rotateFloatingImage,
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

describe("floating image transforms", () => {
  test("crops repeatedly in original-image coordinates after rotation", () => {
    const rotated = rotateFloatingImage(image, 1, layout)!;
    const cropped = cropFloatingImage(
      rotated,
      { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
      layout,
    )!;
    const again = cropFloatingImage(cropped, { x: 0.5, y: 0, width: 0.5, height: 1 }, layout)!;
    expect(cropped.transform).toEqual({
      crop: { x: 0.2, y: 0.4, width: 0.4, height: 0.5 },
      rotation: 90,
    });
    expect(again.transform).toEqual({
      crop: { x: 0.2, y: 0.4, width: 0.4, height: 0.25 },
      rotation: 90,
    });
  });

  test.each([-1, 1, 2] as const)("rotates %i quarter turns around its center", (turns) => {
    const result = rotateFloatingImage(image, turns, layout)!;
    const rect = getFloatingImageSheetRect(result, layout)!;
    expect(rect.x + rect.width / 2).toBe(600);
    expect(rect.y + rect.height / 2).toBe(200);
    if (Math.abs(turns) === 1) expect([rect.width, rect.height]).toEqual([200, 400]);
  });

  test("restores original dimensions and clears transform while retaining center", () => {
    const transformed = cropFloatingImage(
      rotateFloatingImage(image, 1, layout)!,
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      layout,
    )!;
    const restored = restoreFloatingImage(transformed, layout)!;
    expect(restored.transform).toBeUndefined();
    expect(getFloatingImageSheetRect(restored, layout)).toEqual({
      x: 400,
      y: 100,
      width: 400,
      height: 200,
    });
  });

  test("uses supplied intrinsic dimensions for a plain resized image", () => {
    const resized = { ...image, width: 448, height: 209 };
    const restored = restoreFloatingImage(resized, layout, {
      width: 145,
      height: 44,
    })!;
    expect(restored.transform).toBeUndefined();
    expect(getFloatingImageSheetRect(restored, layout)).toEqual({
      x: 551.5,
      y: 182.5,
      width: 145,
      height: 44,
    });
  });

  test("returns null for hidden anchors and keeps restored sizes within core limits", () => {
    const hiddenLayout = createSheetViewportLayout({
      geometry: createSheetGeometry({
        rowCount: 8,
        columnCount: 8,
        rowHeight: 20,
        columnWidth: 80,
      }),
      rows: createRowVisibilityIndex({
        rowCount: 8,
        defaultRowHeight: 20,
        hiddenIntervals: [{ start: 5, end: 5 }],
      }),
      freeze: { rows: 0, columns: 0 },
      viewportSize: { width: 240, height: 80 },
    });
    expect(rotateFloatingImage(image, 1, hiddenLayout)).toBeNull();
    expect(() =>
      normalizeFloatingImageForSheet(
        restoreFloatingImage(image, layout, { width: 1e12, height: 1e-12 })!,
      ),
    ).not.toThrow();
  });
});
