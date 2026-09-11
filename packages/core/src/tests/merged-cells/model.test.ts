import { describe, expect, test } from "vitest";
import {
  doMergedCellRangesIntersect,
  doesMergedCellRangeContainRange,
  getMergedCellAnchor,
  getMergedCellRangeAtAddress,
  isCellAddressInMergedCellRange,
  isSingleCellRange,
  normalizeMergedCellRange,
  validateMergedCellRanges,
} from "../../merged-cells.js";

describe("merged cell ranges", () => {
  test("normalizes ranges and checks containment without mutating their input", () => {
    const range = { start: { row: 4, column: 5 }, end: { row: 2, column: 3 } };

    expect(normalizeMergedCellRange(range)).toEqual({
      start: { row: 2, column: 3 },
      end: { row: 4, column: 5 },
    });
    expect(range).toEqual({ start: { row: 4, column: 5 }, end: { row: 2, column: 3 } });
    expect(isCellAddressInMergedCellRange({ row: 3, column: 4 }, range)).toBe(true);
    expect(isCellAddressInMergedCellRange({ row: 5, column: 4 }, range)).toBe(false);
    expect(
      doesMergedCellRangeContainRange(range, {
        start: { row: 3, column: 4 },
        end: { row: 2, column: 3 },
      }),
    ).toBe(true);
  });

  test("recognizes touching, contained, and disjoint ranges", () => {
    const range = { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } };

    expect(
      doMergedCellRangesIntersect(range, {
        start: { row: 4, column: 4 },
        end: { row: 5, column: 5 },
      }),
    ).toBe(true);
    expect(
      doMergedCellRangesIntersect(range, {
        start: { row: 5, column: 2 },
        end: { row: 6, column: 4 },
      }),
    ).toBe(false);
    expect(isSingleCellRange({ start: { row: 2, column: 2 }, end: { row: 2, column: 2 } })).toBe(
      true,
    );
    expect(isSingleCellRange(range)).toBe(false);
  });

  test("validates a canonical, non-overlapping list and rejects invalid entries", () => {
    expect(
      validateMergedCellRanges([
        { start: { row: 5, column: 0 }, end: { row: 6, column: 1 } },
        { start: { row: 1, column: 4 }, end: { row: 1, column: 5 } },
      ]),
    ).toEqual([
      { start: { row: 1, column: 4 }, end: { row: 1, column: 5 } },
      { start: { row: 5, column: 0 }, end: { row: 6, column: 1 } },
    ]);
    expect(() =>
      validateMergedCellRanges([{ start: { row: 2, column: 2 }, end: { row: 2, column: 2 } }]),
    ).toThrow(RangeError);
    expect(() =>
      validateMergedCellRanges([
        { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
        { start: { row: 2, column: 2 }, end: { row: 3, column: 3 } },
      ]),
    ).toThrow("must not overlap");
  });

  test("rejects a crossing overlap even when neither range starts inside the other", () => {
    expect(() =>
      validateMergedCellRanges([
        { start: { row: 0, column: 2 }, end: { row: 4, column: 3 } },
        { start: { row: 2, column: 0 }, end: { row: 3, column: 5 } },
      ]),
    ).toThrow("must not overlap");
  });

  test("validates a large disjoint row merge plan without quadratic pair scans", () => {
    const ranges = Array.from({ length: 50_000 }, (_, index) => ({
      start: { row: index * 2, column: 0 },
      end: { row: index * 2, column: 1 },
    }));

    const validated = validateMergedCellRanges(ranges);

    expect(validated).toHaveLength(50_000);
    expect(validated[0]).toEqual(ranges[0]);
    expect(validated.at(-1)).toEqual(ranges.at(-1));
  });

  test("finds the enclosing merge and its top-left anchor", () => {
    const ranges = [{ start: { row: 2, column: 3 }, end: { row: 4, column: 5 } }];

    expect(getMergedCellRangeAtAddress(ranges, { row: 3, column: 4 })).toEqual(ranges[0]);
    expect(getMergedCellAnchor(ranges, { row: 4, column: 5 })).toEqual({ row: 2, column: 3 });
    expect(getMergedCellRangeAtAddress(ranges, { row: 1, column: 3 })).toBeUndefined();
    expect(getMergedCellAnchor(ranges, { row: 1, column: 3 })).toBeUndefined();
  });
});
