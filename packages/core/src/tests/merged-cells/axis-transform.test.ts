import { describe, expect, test } from "vitest";
import { MAX_SHEET_ROWS } from "../../workbook.js";
import {
  transformMergedCellRangesForAxisDelete,
  transformMergedCellRangesForAxisInsert,
} from "../../merged-cells.js";

describe("merged cell axis transforms", () => {
  test("shifts an insertion before a merge and expands an insertion inside it", () => {
    const ranges = [
      { start: { row: 3, column: 2 }, end: { row: 5, column: 4 } },
      { start: { row: 8, column: 0 }, end: { row: 9, column: 1 } },
    ];

    expect(transformMergedCellRangesForAxisInsert(ranges, "row", 3, 2)).toEqual([
      { start: { row: 5, column: 2 }, end: { row: 7, column: 4 } },
      { start: { row: 10, column: 0 }, end: { row: 11, column: 1 } },
    ]);
    expect(transformMergedCellRangesForAxisInsert(ranges, "row", 4, 2)).toEqual([
      { start: { row: 3, column: 2 }, end: { row: 7, column: 4 } },
      { start: { row: 10, column: 0 }, end: { row: 11, column: 1 } },
    ]);
    expect(transformMergedCellRangesForAxisInsert(ranges, "row", 6, 2)).toEqual([
      { start: { row: 3, column: 2 }, end: { row: 5, column: 4 } },
      { start: { row: 10, column: 0 }, end: { row: 11, column: 1 } },
    ]);
  });

  test("shrinks intersecting deletes, shifts later ranges, and removes single-cell remnants", () => {
    expect(
      transformMergedCellRangesForAxisDelete(
        [
          { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } },
          { start: { row: 8, column: 0 }, end: { row: 9, column: 1 } },
          { start: { row: 3, column: 6 }, end: { row: 3, column: 7 } },
        ],
        "row",
        3,
        2,
      ),
    ).toEqual([
      { start: { row: 2, column: 2 }, end: { row: 2, column: 4 } },
      { start: { row: 6, column: 0 }, end: { row: 7, column: 1 } },
    ]);
  });

  test("transforms columns and drops the tail portion that overflows an insertion", () => {
    expect(
      transformMergedCellRangesForAxisInsert(
        [
          { start: { row: 1, column: 2 }, end: { row: 2, column: 4 } },
          {
            start: { row: MAX_SHEET_ROWS - 2, column: 0 },
            end: { row: MAX_SHEET_ROWS - 1, column: 0 },
          },
        ],
        "column",
        3,
        1,
      ),
    ).toEqual([
      { start: { row: 1, column: 2 }, end: { row: 2, column: 5 } },
      {
        start: { row: MAX_SHEET_ROWS - 2, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      },
    ]);
    expect(
      transformMergedCellRangesForAxisInsert(
        [
          {
            start: { row: MAX_SHEET_ROWS - 2, column: 0 },
            end: { row: MAX_SHEET_ROWS - 1, column: 0 },
          },
        ],
        "row",
        MAX_SHEET_ROWS - 2,
      ),
    ).toEqual([]);
    expect(
      transformMergedCellRangesForAxisInsert(
        [
          {
            start: { row: MAX_SHEET_ROWS - 2, column: 0 },
            end: { row: MAX_SHEET_ROWS - 1, column: 0 },
          },
        ],
        "row",
        MAX_SHEET_ROWS - 2,
        2,
      ),
    ).toEqual([]);
  });

  test("rejects axis changes that exceed the sheet bounds", () => {
    const ranges = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
    expect(() => transformMergedCellRangesForAxisInsert(ranges, "row", -1)).toThrow(RangeError);
    expect(() => transformMergedCellRangesForAxisDelete(ranges, "column", 0, 0)).toThrow(
      RangeError,
    );
  });
});
