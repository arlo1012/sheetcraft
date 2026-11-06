// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
} from "@sheetcraft/core/workbook";
import {
  getPictureBatchCellAddresses,
  getPictureBatchFloatingOffsets,
} from "../../../modules/sheet-images/picture-batch-layout";

function sheet() {
  return getActiveSheet(createWorkbook({ id: "batch-layout", sheetId: "sheet" }));
}

describe("batch picture cell layout", () => {
  test("places vertical images after each merged region without repeating covered cells", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 3, column: 3 } },
      { start: { row: 4, column: 2 }, end: { row: 5, column: 2 } },
    ];
    expect(getPictureBatchCellAddresses(source, { row: 1, column: 2 }, 3, "vertical")).toEqual([
      { row: 1, column: 2 },
      { row: 4, column: 2 },
      { row: 6, column: 2 },
    ]);
  });

  test("places horizontal images after the full width of each merged region", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 2, column: 4 } },
      { start: { row: 1, column: 5 }, end: { row: 1, column: 6 } },
    ];
    expect(getPictureBatchCellAddresses(source, { row: 1, column: 2 }, 3, "horizontal")).toEqual([
      { row: 1, column: 2 },
      { row: 1, column: 5 },
      { row: 1, column: 7 },
    ]);
  });

  test("uses a merged region's anchor when the selected start is inside it", () => {
    const source = sheet();
    source.mergedCells = [{ start: { row: 1, column: 2 }, end: { row: 3, column: 4 } }];
    expect(getPictureBatchCellAddresses(source, { row: 2, column: 3 }, 2, "horizontal")).toEqual([
      { row: 1, column: 2 },
      { row: 2, column: 5 },
    ]);
  });

  test.each(["vertical", "horizontal"] as const)(
    "allows one picture at the last cell for %s placement",
    (arrangement) => {
      const last = { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 };
      expect(getPictureBatchCellAddresses(sheet(), last, 1, arrangement)).toEqual([last]);
    },
  );

  test.each([
    ["vertical", { row: MAX_SHEET_ROWS - 1, column: 0 }],
    ["horizontal", { row: 0, column: MAX_SHEET_COLUMNS - 1 }],
  ] as const)("rejects %s placement beyond the sheet boundary", (arrangement, start) => {
    expect(() => getPictureBatchCellAddresses(sheet(), start, 2, arrangement)).toThrow(RangeError);
  });

  test("counts merged extents when determining whether another vertical image can fit", () => {
    const source = sheet();
    source.mergedCells = [
      {
        start: { row: MAX_SHEET_ROWS - 2, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      },
    ];
    expect(() =>
      getPictureBatchCellAddresses(source, { row: MAX_SHEET_ROWS - 2, column: 0 }, 2, "vertical"),
    ).toThrow(RangeError);
  });
});

describe("batch floating picture layout", () => {
  const sizes = [
    { width: 120, height: 80 },
    { width: 200, height: 50 },
    { width: 50, height: 100 },
  ];
  test("separates vertical pictures by twelve pixels using each picture's actual height", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "vertical")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 0, offsetY: 92 },
      { offsetX: 0, offsetY: 154 },
    ]);
  });
  test("separates horizontal pictures by twelve pixels using each picture's actual width", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "horizontal")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 132, offsetY: 0 },
      { offsetX: 344, offsetY: 0 },
    ]);
  });
  test("cascades successive pictures by twenty-four pixels on both axes", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "cascade")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 24, offsetY: 24 },
      { offsetX: 48, offsetY: 48 },
    ]);
  });
  test("does not create offsets for an empty batch", () => {
    expect(getPictureBatchFloatingOffsets([], "vertical")).toEqual([]);
  });
});
