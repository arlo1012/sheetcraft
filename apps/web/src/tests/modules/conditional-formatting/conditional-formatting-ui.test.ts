import { describe, expect, test } from "vitest";
import {
  conditionalFormatRangesIntersect,
  formatConditionalFormatRanges,
  parseConditionalFormatRanges,
} from "../../../modules/conditional-formatting/conditional-formatting-ui";

describe("conditional formatting A1 ranges", () => {
  test("parses, normalizes, and formats multi-area references", () => {
    const ranges = parseConditionalFormatRanges("B3:A1, D2; $F$4");
    expect(ranges).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      { start: { row: 1, column: 3 }, end: { row: 1, column: 3 } },
      { start: { row: 3, column: 5 }, end: { row: 3, column: 5 } },
    ]);
    expect(formatConditionalFormatRanges(ranges!)).toBe("A1:B3, D2, F4");
  });

  test("rejects malformed and out-of-sheet references", () => {
    expect(parseConditionalFormatRanges("A0")).toBeNull();
    expect(parseConditionalFormatRanges("A1:B2:C3")).toBeNull();
    expect(parseConditionalFormatRanges("XFE1")).toBeNull();
  });

  test("finds rules intersecting a single selected cell", () => {
    const ruleRanges = parseConditionalFormatRanges("A1:C5")!;
    expect(
      conditionalFormatRangesIntersect(ruleRanges, [
        { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
      ]),
    ).toBe(true);
  });
});
