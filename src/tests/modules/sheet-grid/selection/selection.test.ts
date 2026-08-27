import { describe, expect, test } from "vitest";
import {
  areCellAddressesEqual,
  createAxisSelection,
  createCellSelection,
  extendAxisSelection,
  getSelectionRange,
  isCellSelected,
  isCellInRange,
  isSingleCellSelection,
  moveActiveCellWithinSelection,
  moveCellAddress,
  moveCellSelection,
} from "../../../../modules/sheet-grid/selection";

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

  test("normalizes reverse range endpoints and tests membership", () => {
    const selection = {
      active: { row: 4, column: 5 },
      anchor: { row: 4, column: 5 },
      focus: { row: 1, column: 2 },
      mode: "cells" as const,
    };

    expect(getSelectionRange(selection)).toEqual({
      start: { row: 1, column: 2 },
      end: { row: 4, column: 5 },
    });
    expect(isCellInRange({ row: 3, column: 4 }, getSelectionRange(selection))).toBe(true);
    expect(isCellInRange({ row: 0, column: 4 }, getSelectionRange(selection))).toBe(false);
  });

  test("extends from the focus and resets to a moved single cell", () => {
    const initial = createCellSelection({ row: 2, column: 2 });
    const extended = moveCellSelection(
      initial,
      { rows: 2, columns: 1 },
      { rowCount: 10, columnCount: 5 },
      true,
    );

    expect(extended).toEqual({
      active: { row: 2, column: 2 },
      anchor: { row: 2, column: 2 },
      focus: { row: 4, column: 3 },
      mode: "cells",
    });
    expect(isSingleCellSelection(extended)).toBe(false);
    expect(
      moveCellSelection(extended, { columns: 1 }, { rowCount: 10, columnCount: 5 }, false),
    ).toEqual(createCellSelection({ row: 2, column: 3 }));
  });

  test("models whole axes without expanding their render range to sheet limits", () => {
    const rows = extendAxisSelection(createAxisSelection("rows", { row: 2, column: 0 }), "rows", {
      row: 4,
      column: 0,
    });
    const columns = createAxisSelection("columns", { row: 0, column: 3 });

    expect(getSelectionRange(rows, { rowCount: 10, columnCount: 5 })).toEqual({
      start: { row: 2, column: 0 },
      end: { row: 4, column: 4 },
    });
    expect(isCellSelected({ row: 3, column: 99 }, rows)).toBe(true);
    expect(isCellSelected({ row: 1, column: 0 }, rows)).toBe(false);
    expect(isCellSelected({ row: 999, column: 3 }, columns)).toBe(true);
  });

  test("cycles the active cell through a retained range", () => {
    const selection = {
      active: { row: 0, column: 0 },
      anchor: { row: 0, column: 0 },
      focus: { row: 1, column: 1 },
      mode: "cells" as const,
    };

    const tabbed = moveActiveCellWithinSelection(selection, "forward-row");
    expect(tabbed.active).toEqual({ row: 0, column: 1 });
    expect(moveActiveCellWithinSelection(tabbed, "forward-column").active).toEqual({
      row: 1,
      column: 1,
    });
    expect(getSelectionRange(tabbed)).toEqual(getSelectionRange(selection));
  });
});
