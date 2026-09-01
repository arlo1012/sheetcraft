import { describe, expect, test } from "vitest";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "@idea10/core/workbook";
import {
  DEFAULT_INITIAL_GRID_EXTENT,
  createGridExtent,
  expandGridExtent,
  expandGridExtentForAddress,
  expandGridExtentForViewport,
} from "../../../../modules/sheet-grid/extent";
import { createSheetGeometry } from "../../../../modules/sheet-grid/geometry";

describe("grid extent", () => {
  test("starts with a bounded spreadsheet surface", () => {
    expect(createGridExtent()).toEqual(DEFAULT_INITIAL_GRID_EXTENT);
  });

  test("grows only the dimension needed to contain an address", () => {
    const current = { rowCount: 100, columnCount: 20 };
    const growth = { rowCount: 50, columnCount: 10 };

    expect(expandGridExtentForAddress(current, { row: 100, column: 3 }, growth)).toEqual({
      rowCount: 150,
      columnCount: 20,
    });
    expect(expandGridExtentForAddress(current, { row: 4, column: 20 }, growth)).toEqual({
      rowCount: 100,
      columnCount: 30,
    });
  });

  test("grows before the viewport reaches an allocated edge", () => {
    expect(
      expandGridExtentForViewport(
        { rowCount: 100, columnCount: 50 },
        { x: 3_520, y: 1_800 },
        { width: 960, height: 600 },
        createSheetGeometry({ rowCount: 100, columnCount: 50 }),
        {
          growth: { rowCount: 25, columnCount: 10 },
          tail: { rowCount: 5, columnCount: 2 },
        },
      ),
    ).toEqual({ rowCount: 125, columnCount: 50 });
  });

  test("uses variable geometry to grow before a variable-sized viewport reaches its edge", () => {
    expect(
      expandGridExtentForViewport(
        { rowCount: 5, columnCount: 6 },
        { x: 480, y: 96 },
        { width: 96, height: 48 },
        createSheetGeometry({
          rowCount: 5,
          columnCount: 6,
          rowHeights: new Map([[4, 48]]),
          columnWidths: new Map([[5, 192]]),
        }),
        {
          growth: { rowCount: 5, columnCount: 5 },
          tail: { rowCount: 1, columnCount: 1 },
        },
      ),
    ).toEqual({ rowCount: 10, columnCount: 11 });
  });

  test("never grows beyond the spreadsheet limits", () => {
    expect(
      expandGridExtent(
        { rowCount: MAX_SHEET_ROWS - 5, columnCount: MAX_SHEET_COLUMNS - 2 },
        { rowCount: MAX_SHEET_ROWS + 100, columnCount: MAX_SHEET_COLUMNS + 100 },
        { rowCount: 1_000, columnCount: 26 },
      ),
    ).toEqual({ rowCount: MAX_SHEET_ROWS, columnCount: MAX_SHEET_COLUMNS });
  });
});
