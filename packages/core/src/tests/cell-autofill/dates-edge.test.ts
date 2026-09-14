import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { datePartsToExcelSerial, excelSerialToDateParts } from "../../formula/date-system.js";
import { getActiveSheet, getCellValue, setCellContent, setCellStyle } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

function serial(
  system: "1900" | "1904",
  year: number,
  month: number,
  day: number,
  hour = 0,
): number {
  return datePartsToExcelSerial(
    { year, month, day, hour, minute: 0, second: 0, millisecond: 0 },
    system,
  );
}

function setDate(
  workbook: ReturnType<typeof createTestWorkbook>,
  row: number,
  value: number,
): void {
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row, column: 1 }, { kind: "literal", value });
  setCellStyle(sheet, { row, column: 1 }, { numberFormat: { kind: "date", code: "yyyy-mm-dd" } });
}

function fill(
  workbook: ReturnType<typeof createTestWorkbook>,
  sourceStart: number,
  sourceEnd: number,
  resultStart: number,
  resultEnd: number,
  mode: "dateDay" | "dateWeekday" | "dateMonth" | "dateYear",
): void {
  const sheet = getActiveSheet(workbook);
  const plan = captureCellFill(
    workbook,
    sheet.id,
    {
      start: { row: sourceStart, column: 1 },
      end: { row: sourceEnd, column: 1 },
    },
    {
      start: { row: resultStart, column: 1 },
      end: { row: resultEnd, column: 1 },
    },
  );
  expect(
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan, mode)),
  ).not.toBeNull();
}

describe("cell autofill date edges", () => {
  test("keeps the 1900 virtual leap day in a day series", () => {
    const workbook = createTestWorkbook();
    setDate(workbook, 1, 59);

    fill(workbook, 1, 1, 1, 3, "dateDay");

    const sheet = getActiveSheet(workbook);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(60);
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe(61);
    expect(excelSerialToDateParts(60, "1900")).toMatchObject({
      year: 1900,
      month: 2,
      day: 29,
    });
  });

  test("uses the 1904 epoch and preserves fractional time through date filling", () => {
    const workbook = createTestWorkbook();
    workbook.dateSystem = "1904";
    const source = serial("1904", 1904, 1, 1, 12);
    setDate(workbook, 1, source);

    fill(workbook, 1, 1, 1, 2, "dateDay");

    const filled = getCellValue(getActiveSheet(workbook), {
      row: 2,
      column: 1,
    });
    expect(filled).toBe(1.5);
    expect(excelSerialToDateParts(filled as number, "1904")).toMatchObject({
      year: 1904,
      month: 1,
      day: 2,
      hour: 12,
    });
  });

  test("fills weekdays backward across a weekend", () => {
    const workbook = createTestWorkbook();
    setDate(workbook, 1, serial("1900", 2024, 1, 8)); // Monday

    fill(workbook, 1, 1, 0, 1, "dateWeekday");

    expect(getCellValue(getActiveSheet(workbook), { row: 0, column: 1 })).toBe(
      serial("1900", 2024, 1, 5),
    );
  });

  test("counts from weekend seeds as working-day moves in both directions", () => {
    const cases = [
      { day: 6, forward: [8, 12, 15], backward: [5, 1, 29] }, // Saturday
      { day: 7, forward: [8, 12, 15], backward: [5, 1, 29] }, // Sunday
    ] as const;
    const increments = [1, 5, 6] as const;
    for (const sample of cases) {
      for (const [index, increment] of increments.entries()) {
        const forward = createTestWorkbook();
        setDate(forward, 1, serial("1900", 2024, 1, sample.day));
        fill(forward, 1, 1, 1, 1 + increment, "dateWeekday");
        expect(
          getCellValue(getActiveSheet(forward), {
            row: 1 + increment,
            column: 1,
          }),
        ).toBe(serial("1900", 2024, 1, sample.forward[index]!));

        const backward = createTestWorkbook();
        setDate(backward, 7, serial("1900", 2024, 1, sample.day));
        fill(backward, 7, 7, 7 - increment, 7, "dateWeekday");
        const month = increment === 6 ? 12 : 1;
        const day = sample.backward[index]!;
        expect(
          getCellValue(getActiveSheet(backward), {
            row: 7 - increment,
            column: 1,
          }),
        ).toBe(serial("1900", increment === 6 ? 2023 : 2024, month, day));
      }
    }
  });

  test("treats Friday to Monday as one weekday interval", () => {
    const workbook = createTestWorkbook();
    setDate(workbook, 1, serial("1900", 2024, 1, 5)); // Friday
    setDate(workbook, 2, serial("1900", 2024, 1, 8)); // Monday

    fill(workbook, 1, 2, 1, 3, "dateWeekday");

    expect(getCellValue(getActiveSheet(workbook), { row: 3, column: 1 })).toBe(
      serial("1900", 2024, 1, 9),
    );
  });

  test("clamps leap day when filling by year", () => {
    const workbook = createTestWorkbook();
    setDate(workbook, 1, serial("1900", 2024, 2, 29));

    fill(workbook, 1, 1, 1, 2, "dateYear");

    expect(getCellValue(getActiveSheet(workbook), { row: 2, column: 1 })).toBe(
      serial("1900", 2025, 2, 28),
    );
  });
});
