import { describe, expect, test } from "vitest";
import { NativeWorkbook } from "../../native/workbook.js";

describe("native workbook interchange adapter", () => {
  test.each(["A1:B2:C3", "A1:B2:", "A1", "A1:", ":B2"])(
    "rejects malformed merge %s before creating cells",
    (reference) => {
      const sheet = new NativeWorkbook().addWorksheet("Data");
      expect(() => sheet.mergeCells(reference)).toThrow(/merged range/);
      expect(sheet.model.merges).toEqual([]);
      expect(sheet.model.rows).toEqual([]);
    },
  );

  test("retains a valid merge and its anchor value", () => {
    const sheet = new NativeWorkbook().addWorksheet("Data");
    sheet.getCell("A1").value = "anchor";
    sheet.mergeCells("a1:b2");
    expect(sheet.model.merges).toEqual(["A1:B2"]);
    expect(sheet.getCell("A1").value).toBe("anchor");
    expect(sheet.getCell("B2").value).toBeNull();
  });
});
