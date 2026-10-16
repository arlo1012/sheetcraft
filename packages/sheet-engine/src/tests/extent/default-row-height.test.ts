import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { getSheetContentExtent } from "../../extent.js";

describe("content extent with a sheet-owned row baseline", () => {
  test("locates legacy physical picture edges using 20-pixel rows without materialization", () => {
    const sheet = createSheet("Imported", "s");
    sheet.floatingImages = [
      {
        id: "image",
        assetId: "asset",
        altText: "",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 100,
        width: 20,
        height: 20,
      },
    ];
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 5, columnCount: 1 });
    sheet.defaultRowHeight = 20;
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 6, columnCount: 1 });
    sheet.rowHeights.set(1, 24);
    sheet.hiddenRows = new Set([2]);
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 7, columnCount: 1 });
    expect(sheet.rowHeights).toEqual(new Map([[1, 24]]));
  });

  test("a sparse blank default20 sheet has no allocated content beyond its first cell", () => {
    const sheet = createSheet("Imported", "s");
    sheet.defaultRowHeight = 20;
    expect(getSheetContentExtent(sheet)).toEqual({ rowCount: 1, columnCount: 1 });
    expect(sheet.rowHeights.size).toBe(0);
  });
});
