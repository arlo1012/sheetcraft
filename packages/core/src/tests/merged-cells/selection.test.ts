import { describe, expect, test } from "vitest";
import { expandSelectionToMergedCellRanges } from "../../merged-cells.js";

describe("merged cell selection closure", () => {
  test("expands a selection that begins inside a merged range", () => {
    expect(
      expandSelectionToMergedCellRanges(
        { start: { row: 3, column: 4 }, end: { row: 3, column: 4 } },
        [{ start: { row: 2, column: 3 }, end: { row: 4, column: 5 } }],
      ),
    ).toEqual({ start: { row: 2, column: 3 }, end: { row: 4, column: 5 } });
  });

  test("closes over every merged range reached by an expansion", () => {
    expect(
      expandSelectionToMergedCellRanges(
        { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
        [
          { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
          { start: { row: 2, column: 2 }, end: { row: 3, column: 3 } },
        ],
      ),
    ).toEqual({ start: { row: 1, column: 1 }, end: { row: 3, column: 3 } });
  });

  test("leaves a selection unchanged when it does not intersect a merge", () => {
    expect(
      expandSelectionToMergedCellRanges(
        { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
        [{ start: { row: 2, column: 2 }, end: { row: 3, column: 3 } }],
      ),
    ).toEqual({ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } });
  });
});
