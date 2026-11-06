// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import {
  createCameraRangeLayout,
  fitCameraSize,
} from "../../../modules/camera/camera-range-layout";

describe("camera source layout", () => {
  test.each([
    { hidden: false, width: 260, height: 92 },
    { hidden: true, width: 140, height: 52 },
  ])("uses custom row and column sizes with hidden axes=$hidden", ({ hidden, width, height }) => {
    const sheet = getActiveSheet(createWorkbook({ id: "camera-layout", sheetId: "sheet" }));
    sheet.defaultColumnWidth = 90;
    sheet.defaultRowHeight = 22;
    sheet.columnWidths.set(1, 50);
    sheet.columnWidths.set(2, 120);
    sheet.rowHeights.set(1, 30);
    sheet.rowHeights.set(2, 40);
    if (hidden) {
      sheet.hiddenColumns = new Set([2]);
      sheet.hiddenRows = new Set([2]);
    }

    const layout = createCameraRangeLayout(sheet, {
      start: { row: 1, column: 1 },
      end: { row: 3, column: 3 },
    });

    expect(layout).toMatchObject({ x: 90, y: 22, width, height });
    expect([...sheet.columnWidths]).toEqual([
      [1, 50],
      [2, 120],
    ]);
    expect([...sheet.rowHeights]).toEqual([
      [1, 30],
      [2, 40],
    ]);
  });

  test("excludes hidden axes before the source from its origin without shrinking the visible source", () => {
    const sheet = getActiveSheet(createWorkbook({ id: "camera-offset", sheetId: "sheet" }));
    sheet.defaultColumnWidth = 80;
    sheet.defaultRowHeight = 20;
    sheet.hiddenColumns = new Set([0]);
    sheet.hiddenRows = new Set([0]);

    expect(
      createCameraRangeLayout(sheet, {
        start: { row: 1, column: 1 },
        end: { row: 2, column: 2 },
      }),
    ).toMatchObject({ x: 0, y: 0, width: 160, height: 40 });
  });

  test.each([
    [300, 150, 300, 150],
    [1600, 900, 800, 450],
    [1000, 1500, 400, 600],
    [1600, 1200, 800, 600],
  ])(
    "fits a %s × %s source within 800 × 600 without changing its proportions",
    (width, height, expectedWidth, expectedHeight) => {
      const fitted = fitCameraSize(width, height);
      expect(fitted.width).toBeCloseTo(expectedWidth);
      expect(fitted.height).toBeCloseTo(expectedHeight);
      expect(fitted.width / fitted.height).toBeCloseTo(width / height);
    },
  );

  test("gives an entirely hidden source a usable minimum drawing size", () => {
    expect(fitCameraSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
