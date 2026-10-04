import { describe, expect, test } from "vitest";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import {
  getPageBreakPatch,
  canChangePageBreak,
} from "../../../modules/page-layout/page-toolbar-actions";

describe("page toolbar manual breaks", () => {
  test("inserts above and left of a cell without disturbing existing breaks", () => {
    const setup = cloneSheetPageSetup({
      ...DEFAULT_SHEET_PAGE_SETUP,
      rowBreaks: [5, 20],
      columnBreaks: [4],
    });
    const patch = getPageBreakPatch(setup, { row: 10, column: 3 }, "cells", "insert");
    expect(patch).toEqual({ rowBreaks: [5, 10, 20], columnBreaks: [3, 4] });
    expect(setup.rowBreaks).toEqual([5, 20]);
    expect(
      canChangePageBreak({ ...setup, ...patch }, { row: 10, column: 3 }, "cells", "insert"),
    ).toBe(false);
  });
  test("axis selections change only the selected axis and reject the first boundary", () => {
    expect(
      getPageBreakPatch(DEFAULT_SHEET_PAGE_SETUP, { row: 3, column: 2 }, "rows", "insert"),
    ).toEqual({ rowBreaks: [3] });
    expect(
      getPageBreakPatch(DEFAULT_SHEET_PAGE_SETUP, { row: 3, column: 2 }, "columns", "insert"),
    ).toEqual({ columnBreaks: [2] });
    expect(
      canChangePageBreak(DEFAULT_SHEET_PAGE_SETUP, { row: 0, column: 0 }, "cells", "insert"),
    ).toBe(false);
    expect(
      canChangePageBreak(DEFAULT_SHEET_PAGE_SETUP, { row: 8, column: 4 }, "all", "insert"),
    ).toBe(false);
  });
  test("removes only matching manual boundaries; reset preserves other print settings", () => {
    const setup = cloneSheetPageSetup({
      ...DEFAULT_SHEET_PAGE_SETUP,
      rowBreaks: [4, 12],
      columnBreaks: [3, 9],
    });
    expect(getPageBreakPatch(setup, { row: 4, column: 3 }, "cells", "remove")).toEqual({
      rowBreaks: [12],
      columnBreaks: [9],
    });
    expect(getPageBreakPatch(setup, { row: 4, column: 3 }, "rows", "remove")).toEqual({
      rowBreaks: [12],
    });
    expect(getPageBreakPatch(setup, { row: 0, column: 0 }, "all", "reset")).toEqual({
      rowBreaks: [],
      columnBreaks: [],
    });
    expect(
      canChangePageBreak(DEFAULT_SHEET_PAGE_SETUP, { row: 4, column: 3 }, "cells", "remove"),
    ).toBe(false);
  });
});
