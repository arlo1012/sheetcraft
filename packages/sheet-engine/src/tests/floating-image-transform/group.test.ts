import { describe, expect, test } from "vitest";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
} from "@idea10/core/workbook";
import {
  rotateFloatingImages,
  flipFloatingImages,
  resizeFloatingImagesBy,
} from "../../floating-image-group.js";
import { restoreFloatingImage } from "../../floating-image-transform.js";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "../../floating-image-layout.js";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";

function fixture(hiddenRows: number[] = []) {
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 1000,
      columnCount: 1000,
      rowHeight: 20,
      columnWidth: 80,
      hiddenRows,
    }),
    rows: createRowVisibilityIndex({ rowCount: 1000, defaultRowHeight: 20, hiddenRows }),
    viewportSize: { width: 800, height: 400 },
  });
  const base: FloatingImage = {
    id: "a",
    assetId: "asset",
    altText: "Picture",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 50,
  };
  const images = [
    reanchorFloatingImageAtSheetRect(base, { x: 100, y: 100, width: 100, height: 50 }, layout)!,
    reanchorFloatingImageAtSheetRect(
      { ...base, id: "b" },
      { x: 300, y: 150, width: 100, height: 50 },
      layout,
    )!,
  ];
  return {
    layout,
    images,
    rects: (values: FloatingImage[]) =>
      values.map((image) => getFloatingImageSheetRect(image, layout)),
  };
}
describe("floating image group transforms", () => {
  test.each([
    {
      turns: 1 as const,
      rotation: 90,
      rects: [
        { x: 250, y: 0, width: 50, height: 100 },
        { x: 200, y: 200, width: 50, height: 100 },
      ],
    },
    {
      turns: -1 as const,
      rotation: 270,
      rects: [
        { x: 200, y: 200, width: 50, height: 100 },
        { x: 250, y: 0, width: 50, height: 100 },
      ],
    },
    {
      turns: 2 as const,
      rotation: 180,
      rects: [
        { x: 300, y: 150, width: 100, height: 50 },
        { x: 100, y: 100, width: 100, height: 50 },
      ],
    },
  ])(
    "rotates a complete group by $rotation degrees around its shared center",
    ({ turns, rotation, rects }) => {
      const f = fixture();
      const before = structuredClone(f.images);
      const next = rotateFloatingImages(f.images, turns, f.layout)!;
      expect(f.rects(next)).toEqual(rects);
      expect(next.map((image) => image.transform?.rotation)).toEqual([rotation, rotation]);
      expect(f.images).toEqual(before);
    },
  );
  test.each(["horizontal", "vertical"] as const)(
    "mirrors positions and picture transforms %s",
    (axis) => {
      const f = fixture();
      const before = structuredClone(f.images);
      const next = flipFloatingImages(f.images, axis, f.layout)!;
      expect(f.rects(next)).toEqual(
        axis === "horizontal"
          ? [
              { x: 300, y: 100, width: 100, height: 50 },
              { x: 100, y: 150, width: 100, height: 50 },
            ]
          : [
              { x: 100, y: 150, width: 100, height: 50 },
              { x: 300, y: 100, width: 100, height: 50 },
            ],
      );
      expect(
        next.every((image) =>
          axis === "horizontal" ? image.transform?.flipHorizontal : image.transform?.flipVertical,
        ),
      ).toBe(true);
      expect(f.images).toEqual(before);
    },
  );
  test("resizes group members and their spacing proportionally", () => {
    const f = fixture();
    const before = structuredClone(f.images);
    const next = resizeFloatingImagesBy(f.images, "se", { x: 300, y: 100 }, f.layout)!;
    expect(f.rects(next)).toEqual([
      { x: 100, y: 100, width: 200, height: 100 },
      { x: 500, y: 200, width: 200, height: 100 },
    ]);
    expect(f.images).toEqual(before);
  });
  test.each([-1e9, 1e9])("bounds every member's size during extreme resize %s", (amount) => {
    const f = fixture();
    const next = resizeFloatingImagesBy(f.images, "se", { x: amount, y: amount }, f.layout)!;
    expect(next).not.toBeNull();
    for (const image of next) {
      expect(image.width).toBeGreaterThanOrEqual(MIN_FLOATING_IMAGE_SIZE);
      expect(image.height).toBeGreaterThanOrEqual(MIN_FLOATING_IMAGE_SIZE);
      expect(image.width).toBeLessThanOrEqual(MAX_FLOATING_IMAGE_SIZE);
      expect(image.height).toBeLessThanOrEqual(MAX_FLOATING_IMAGE_SIZE);
      expect(image.width / image.height).toBeCloseTo(2);
    }
  });
  test("returns null for an unplaceable member without partially changing the collection", () => {
    const f = fixture([7]);
    f.images[1]!.anchor = { row: 7, column: 3 };
    const before = structuredClone(f.images);
    expect(rotateFloatingImages(f.images, 1, f.layout)).toBeNull();
    expect(flipFloatingImages(f.images, "horizontal", f.layout)).toBeNull();
    expect(resizeFloatingImagesBy(f.images, "se", { x: 30, y: 10 }, f.layout)).toBeNull();
    expect(f.images).toEqual(before);
    expect(rotateFloatingImages([], 1, f.layout)).toBeNull();
  });
  test("restores picture geometry while retaining appearance and annotations", () => {
    const f = fixture();
    const image: FloatingImage = {
      ...f.images[0]!,
      transform: {
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
        rotation: 90,
        flipHorizontal: true,
        appearance: { opacity: 0.7, shadow: "soft" },
        annotations: [{ kind: "pen", points: [{ x: 0.2, y: 0.3 }], color: "#FF0000", width: 0.01 }],
      },
    };
    const before = structuredClone(image);
    const restored = restoreFloatingImage(image, f.layout, { width: 400, height: 200 })!;
    expect([restored.width, restored.height]).toEqual([400, 200]);
    expect(restored.transform).toEqual({
      appearance: image.transform!.appearance,
      annotations: image.transform!.annotations,
    });
    restored.transform!.annotations![0]!.points[0]!.x = 0.5;
    expect(image).toEqual(before);
  });
});
