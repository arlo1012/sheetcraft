import { describe, expect, test } from "vitest";
import { createTestSheet } from "../helpers.js";
import { findCellByText } from "../../search.js";
import { setCellValue } from "../../workbook.js";

describe("sparse sheet search", () => {
  test("finds values in row order and wraps in either direction", () => {
    const sheet = createTestSheet();
    setCellValue(sheet, { row: 9, column: 1 }, "Needle last");
    setCellValue(sheet, { row: 1, column: 4 }, "needle first");
    setCellValue(sheet, { row: 3, column: 0 }, "other");

    expect(findCellByText(sheet, "NEEDLE", { row: 0, column: 0 })).toEqual({
      row: 1,
      column: 4,
    });
    expect(findCellByText(sheet, "needle", { row: 1, column: 4 })).toEqual({
      row: 9,
      column: 1,
    });
    expect(findCellByText(sheet, "needle", { row: 9, column: 1 })).toEqual({
      row: 1,
      column: 4,
    });
    expect(findCellByText(sheet, "needle", { row: 1, column: 4 }, "backward")).toEqual({
      row: 9,
      column: 1,
    });
  });

  test("matches formatted booleans and numbers without materializing empty cells", () => {
    const sheet = createTestSheet();
    setCellValue(sheet, { row: 800_000, column: 10_000 }, true);
    setCellValue(sheet, { row: 2, column: 2 }, 1200);

    expect(findCellByText(sheet, "true", { row: 0, column: 0 })).toEqual({
      row: 800_000,
      column: 10_000,
    });
    expect(findCellByText(sheet, "200", { row: 0, column: 0 })).toEqual({
      row: 2,
      column: 2,
    });
    expect(findCellByText(sheet, "missing", { row: 0, column: 0 })).toBeNull();
    expect(findCellByText(sheet, "   ", { row: 0, column: 0 })).toBeNull();
  });
});
