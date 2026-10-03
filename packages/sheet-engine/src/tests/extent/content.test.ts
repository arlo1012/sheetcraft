import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  createSheet,
  setCellStyle,
  setColumnWidth,
  setRowHeight,
} from "@idea10/core/workbook";
import { getSheetContentExtent } from "../../extent.js";

function createTestSheet() {
  return createSheet("Sheet1", "sheet-1");
}

describe("sheet content extent", () => {
  test("retains far styled blank cells and dimension metadata until each is removed", () => {
    const sheet = createTestSheet();
    setCellStyle(sheet, { row: 120, column: 4 }, { fillColor: "#123456" });
    setRowHeight(sheet, 145, 40);
    setColumnWidth(sheet, 39, 144);

    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 146, columnCount: 40 });

    setCellStyle(sheet, { row: 120, column: 4 }, null);
    setRowHeight(sheet, 145, DEFAULT_ROW_HEIGHT);
    setColumnWidth(sheet, 39, DEFAULT_COLUMN_WIDTH);
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 1, columnCount: 1 });
  });

  test("keeps freeze, merged, and filter metadata in the reclaim floor", () => {
    const sheet = createTestSheet();
    sheet.freezePanes = { rows: 8, columns: 3 };
    sheet.mergedCells = [{ start: { row: 14, column: 9 }, end: { row: 17, column: 12 } }];
    sheet.filter = {
      range: { start: { row: 20, column: 2 }, end: { row: 33, column: 18 } },
      columns: [],
    };

    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 34, columnCount: 19 });
  });

  test("keeps an empty structured table's full range reachable", () => {
    const sheet = createTestSheet();
    sheet.tables = [
      {
        id: "table-1",
        name: "Table1",
        range: { start: { row: 20, column: 2 }, end: { row: 33, column: 18 } },
        columns: [],
        style: { id: "TableStyleMedium2", name: "Medium 2", category: "medium", elements: {} },
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: null,
      },
    ];

    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 34, columnCount: 19 });
  });

  test("includes a floating image's transformed occupied range and releases it on removal", () => {
    const sheet = createTestSheet();
    sheet.floatingImages.push({
      id: "image-1",
      assetId: "asset-1",
      altText: "Chart",
      anchor: { row: 10, column: 10 },
      offsetX: 384,
      offsetY: 72,
      width: 96,
      height: 24,
    });

    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 14, columnCount: 15 });

    sheet.floatingImages = [];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 1, columnCount: 1 });
  });
});
