import { describe, expect, test } from "vitest";
import { areCellAddressesEqual, moveCellAddress } from "../../../../modules/sheet-grid/selection";

describe("sheet selection", () => {
  test("moves and clamps an active cell within the grid", () => {
    const bounds = { rowCount: 10, columnCount: 5 };

    expect(moveCellAddress({ row: 2, column: 2 }, { rows: 1 }, bounds)).toEqual({
      row: 3,
      column: 2,
    });
    expect(moveCellAddress({ row: 0, column: 0 }, { rows: -1, columns: -1 }, bounds)).toEqual({
      row: 0,
      column: 0,
    });
    expect(moveCellAddress({ row: 9, column: 4 }, { rows: 1, columns: 1 }, bounds)).toEqual({
      row: 9,
      column: 4,
    });
  });

  test("compares addresses by row and column", () => {
    expect(areCellAddressesEqual({ row: 1, column: 3 }, { row: 1, column: 3 })).toBe(true);
    expect(areCellAddressesEqual({ row: 1, column: 3 }, { row: 2, column: 3 })).toBe(false);
  });
});
