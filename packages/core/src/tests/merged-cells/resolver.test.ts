import { describe, expect, test } from "vitest";
import { MergedCellRangeResolver } from "../../merged-cells.js";

describe("MergedCellRangeResolver", () => {
  test("returns canonical cloned ranges and anchors without scanning unrelated row intervals", () => {
    const ranges = Array.from({ length: 2_000 }, (_, index) => ({
      start: { row: index * 3, column: index % 8 },
      end: { row: index * 3 + 1, column: (index % 8) + 1 },
    }));
    const resolver = new MergedCellRangeResolver(ranges);

    expect(resolver.getRangeAtAddress({ row: 3_001, column: 1 })).toEqual({
      start: { row: 3_000, column: 0 },
      end: { row: 3_001, column: 1 },
    });
    expect(resolver.getAnchor({ row: 3_001, column: 1 })).toEqual({ row: 3_000, column: 0 });
    expect(resolver.getRangeAtAddress({ row: 3_002, column: 1 })).toBeUndefined();
  });

  test("finds a late same-row merge through the row-segment column index", () => {
    const resolver = new MergedCellRangeResolver(
      Array.from({ length: 2_000 }, (_, index) => ({
        start: { row: 20, column: index * 2 },
        end: { row: 20, column: index * 2 + 1 },
      })),
    );

    expect(resolver.getAnchor({ row: 20, column: 3_999 })).toEqual({ row: 20, column: 3_998 });
  });

  test("rejects overlapping ranges during construction", () => {
    expect(
      () =>
        new MergedCellRangeResolver([
          { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
          { start: { row: 2, column: 2 }, end: { row: 3, column: 3 } },
        ]),
    ).toThrow("must not overlap");
  });
});
