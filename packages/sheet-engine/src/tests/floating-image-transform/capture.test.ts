import { describe, expect, test } from "vitest";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { captureFloatingImageGroup } from "../../floating-image-group.js";
import { createSheetGeometry } from "../../geometry.js";
import { createRowVisibilityIndex } from "../../visibility.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";

function fixture(hiddenRows: number[] = [], hiddenColumns: number[] = []) {
  const rowHeights = new Map([
    [0, 30],
    [1, 50],
    [2, 20],
  ]);
  const columnWidths = new Map([
    [0, 40],
    [1, 90],
    [2, 60],
  ]);
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 20,
      columnCount: 20,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights,
      columnWidths,
      hiddenRows,
      hiddenColumns,
    }),
    rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20, rowHeights, hiddenRows }),
    viewportSize: { width: 800, height: 400 },
  });
  const images: FloatingImage[] = [0, 3].map((index) => ({
    id: `image-${index}`,
    assetId: "asset",
    altText: "Synthetic",
    groupId: "group",
    anchor: { row: index, column: index },
    offsetX: 5,
    offsetY: 7,
    width: 100,
    height: 50,
    transform: { crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }, rotation: 90 },
  }));
  return { layout, images };
}
describe("picture group clipboard capture", () => {
  test.each([
    { hidden: false, gap: [190, 100] },
    { hidden: true, gap: [100, 50] },
  ])("preserves nonuniform source sheet gaps with hidden intervals=$hidden", ({ hidden, gap }) => {
    const f = fixture(hidden ? [1] : [], hidden ? [1] : []);
    const before = structuredClone(f.images);
    const captured = captureFloatingImageGroup(f.images, f.layout)!;
    expect(captured.map((image) => [image.offsetX, image.offsetY])).toEqual([[0, 0], gap]);
    expect(captured.map((image) => image.anchor)).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 0 },
    ]);
    expect(captured.map((image) => image.id)).toEqual(before.map((image) => image.id));
    captured[0]!.transform!.crop!.x = 0.9;
    expect(f.images).toEqual(before);
  });
  test.each([0, 3])("rejects all members when selected anchor %s has no layout position", (row) => {
    const f = fixture([row]);
    expect(captureFloatingImageGroup(f.images, f.layout)).toBeNull();
  });
  test("rejects duplicate ids, empty and oversized selections", () => {
    const f = fixture();
    expect(captureFloatingImageGroup([], f.layout)).toBeNull();
    expect(captureFloatingImageGroup([f.images[0]!, f.images[0]!], f.layout)).toBeNull();
    expect(
      captureFloatingImageGroup(
        Array.from({ length: 101 }, (_, index) => ({ ...f.images[0]!, id: `item-${index}` })),
        f.layout,
      ),
    ).toBeNull();
  });
});
