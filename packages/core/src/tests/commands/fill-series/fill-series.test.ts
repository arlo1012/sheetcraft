import { describe, expect, test } from "vitest";
import { applyWorkbookCommand } from "../../../commands/apply.js";
import { createFillSeriesCommand, type FillSeriesOptions } from "../../../commands/fill-series.js";
import { DataFillError } from "../../../commands/fill-common.js";
import { datePartsToExcelSerial } from "../../../formula/date-system.js";
import {
  getActiveSheet,
  getCellContent,
  getCellValue,
  setCellContent,
  setCellStyle,
} from "../../../workbook.js";
import { createTestWorkbook } from "../../helpers.js";

const base: FillSeriesOptions = {
  axis: "columns",
  type: "linear",
  step: 2,
  dateUnit: "day",
  trend: false,
};

function fill(
  workbook: ReturnType<typeof createTestWorkbook>,
  range: { start: { row: number; column: number }; end: { row: number; column: number } },
  options: Partial<FillSeriesOptions> = {},
) {
  const sheet = getActiveSheet(workbook);
  return applyWorkbookCommand(
    workbook,
    createFillSeriesCommand(workbook, sheet.id, range, { ...base, ...options }),
  );
}

describe("fill series command", () => {
  test("fills independent vertical and horizontal lanes while preserving target styles", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 10 });
    setCellStyle(sheet, { row: 2, column: 1 }, { fillColor: "#ff0000" });
    fill(workbook, { start: { row: 1, column: 1 }, end: { row: 3, column: 2 } });
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(3);
    expect(getCellValue(sheet, { row: 3, column: 2 })).toBe(14);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(3);
    expect(sheet.cells.get("2:1")?.style?.fillColor).toBe("#ff0000");

    setCellContent(sheet, { row: 5, column: 1 }, { kind: "literal", value: 4 });
    fill(
      workbook,
      { start: { row: 5, column: 1 }, end: { row: 5, column: 3 } },
      { axis: "rows", step: 3 },
    );
    expect(getCellValue(sheet, { row: 5, column: 3 })).toBe(10);
  });

  test("stops a one-cell linear or growth series and returns one undo command", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
    const inverse = fill(
      workbook,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      { stop: 5 },
    );
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe(5);
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBeNull();
    expect(inverse).not.toBeNull();
    applyWorkbookCommand(workbook, inverse!);
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBeNull();

    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 2 });
    fill(
      workbook,
      { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
      { type: "growth", step: 2, stop: 8 },
    );
    expect(getCellValue(sheet, { row: 3, column: 2 })).toBe(8);
    expect(() =>
      fill(
        workbook,
        { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
        { step: -2, stop: 5 },
      ),
    ).toThrow(DataFillError);
    expect(() =>
      fill(
        workbook,
        { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
        { step: 0, stop: 1 },
      ),
    ).toThrow(DataFillError);
  });

  test("fits linear and growth trends from formula results", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "formula", formula: { source: "=1" } });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: 3 });
    fill(workbook, { start: { row: 1, column: 1 }, end: { row: 4, column: 1 } }, { trend: true });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe(1);
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe(5);

    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: 4 });
    fill(
      workbook,
      { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
      { type: "growth", trend: true },
    );
    expect(getCellValue(sheet, { row: 3, column: 2 })).toBeCloseTo(8);
  });

  test("fills dates by weekday and month end in the 1904 system", () => {
    const workbook = createTestWorkbook();
    workbook.dateSystem = "1904";
    const sheet = getActiveSheet(workbook);
    const date = (year: number, month: number, day: number) =>
      datePartsToExcelSerial(
        { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1904",
      );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: date(1904, 1, 5) }); // Monday
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      { numberFormat: { kind: "date", code: "yyyy-mm-dd" } },
    );
    fill(
      workbook,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      { type: "date", dateUnit: "weekday", step: 1 },
    );
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(date(1904, 1, 6));
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: date(2024, 1, 31) });
    setCellStyle(
      sheet,
      { row: 1, column: 2 },
      { numberFormat: { kind: "date", code: "yyyy-mm-dd" } },
    );
    fill(
      workbook,
      { start: { row: 1, column: 2 }, end: { row: 2, column: 2 } },
      { type: "date", dateUnit: "month", step: 1 },
    );
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe(date(2024, 2, 29));
    setCellContent(sheet, { row: 1, column: 3 }, { kind: "literal", value: date(2024, 1, 1) });
    fill(
      workbook,
      { start: { row: 1, column: 3 }, end: { row: 2, column: 3 } },
      { type: "date", dateUnit: "day", step: 1 },
    );
    expect(sheet.cells.get("2:3")?.style?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
  });

  test("reuses autofill patterns and formula translation once per lane", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 3 });
    fill(
      workbook,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 4 } },
      { axis: "rows", type: "auto" },
    );
    expect([1, 2, 3, 4].map((column) => getCellValue(sheet, { row: 1, column }))).toEqual([
      1, 3, 5, 7,
    ]);
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "formula", formula: { source: "=A1" } });
    fill(workbook, { start: { row: 3, column: 1 }, end: { row: 4, column: 1 } }, { type: "auto" });
    expect(getCellContent(sheet, { row: 4, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A2" },
    });
    expect(() =>
      fill(
        workbook,
        { start: { row: 6, column: 1 }, end: { row: 6, column: 1 } },
        { type: "auto" },
      ),
    ).toThrow(DataFillError);
  });

  test("handles descending, fractional growth, and sparse trend positions", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 9 });
    fill(
      workbook,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      { step: -2, stop: 3 },
    );
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBe(3);
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 8 });
    fill(
      workbook,
      { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
      { type: "growth", step: 0.5, stop: 1 },
    );
    expect(getCellValue(sheet, { row: 4, column: 2 })).toBe(1);
    setCellContent(sheet, { row: 1, column: 3 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 3, column: 3 }, { kind: "literal", value: 5 });
    fill(
      workbook,
      { start: { row: 1, column: 3 }, end: { row: 4, column: 3 } },
      { trend: true, stop: 7 },
    );
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe(3);
    expect(getCellValue(sheet, { row: 4, column: 3 })).toBe(7);
  });
});
