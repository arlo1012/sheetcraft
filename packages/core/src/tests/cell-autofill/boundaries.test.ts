import { describe, expect, test } from "vitest";
import { captureCellFill, CellFillError } from "../../cell-autofill.js";
import { createTestWorkbook } from "../helpers.js";
import { getActiveSheet } from "../../workbook.js";

describe("cell autofill boundaries", () => {
  test("rejects invalid and hidden target ranges before materializing cells", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    expect(() =>
      captureCellFill(
        workbook,
        sheet.id,
        { start: { row: -1, column: 0 }, end: { row: 0, column: 0 } },
        { start: { row: -1, column: 0 }, end: { row: 1, column: 0 } },
      ),
    ).toThrow(CellFillError);
    sheet.hiddenRows = new Set([2]);
    expect(() =>
      captureCellFill(
        workbook,
        sheet.id,
        { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
        { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
      ),
    ).toThrow(expect.objectContaining({ reason: "hiddenAxis" }));
  });
});
