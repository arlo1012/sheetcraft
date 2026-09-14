import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { datePartsToExcelSerial } from "../../formula/date-system.js";
import { createTestWorkbook } from "../helpers.js";
import { getActiveSheet, getCellValue, setCellContent, setCellStyle } from "../../workbook.js";

describe("cell autofill dates", () => {
  test("recognizes custom date formats and clamps month ends", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    const january31 = datePartsToExcelSerial(
      { year: 2024, month: 1, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
      workbook.dateSystem,
    );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: january31 });
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      { numberFormat: { kind: "custom", code: "yyyy-mm-dd" } },
    );
    const plan = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
    );
    expect(plan.defaultMode).toBe("dateDay");
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan, "dateMonth"));
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(
      datePartsToExcelSerial(
        { year: 2024, month: 2, day: 29, hour: 0, minute: 0, second: 0, millisecond: 0 },
        workbook.dateSystem,
      ),
    );
  });

  test("uses month intervals from two date samples", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    const date = (month: number, day: number) =>
      datePartsToExcelSerial(
        { year: 2024, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
        workbook.dateSystem,
      );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: date(1, 31) });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: date(2, 29) });
    for (const row of [1, 2])
      setCellStyle(
        sheet,
        { row, column: 1 },
        { numberFormat: { kind: "date", code: "yyyy-mm-dd" } },
      );
    const plan = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan, "dateMonth"));
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe(date(3, 31));
  });
});
