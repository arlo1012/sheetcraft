import { describe, expect, test, vi } from "vitest";
import { getSelectionSummary } from "../../../../modules/workbook/selection-summary";
import {
  MAX_SHEET_ROWS,
  createSheet,
  setCellStyle,
  setCellValue,
} from "../../../../modules/workbook/workbook";

describe("selection summary", () => {
  test("summarizes populated and numeric cells inside a reversed range", () => {
    const sheet = createSheet();
    setCellValue(sheet, { row: 0, column: 0 }, 10);
    setCellValue(sheet, { row: 0, column: 1 }, 20);
    setCellValue(sheet, { row: 0, column: 2 }, "note");
    setCellValue(sheet, { row: 1, column: 0 }, 99);

    expect(
      getSelectionSummary(sheet, {
        start: { row: 0, column: 2 },
        end: { row: 0, column: 0 },
      }),
    ).toEqual({ average: 15, count: 3, numericCount: 2, selectedCellCount: 3, sum: 30 });
  });

  test("ignores style-only cells and avoids scanning empty whole-axis ranges", () => {
    const sheet = createSheet();
    setCellStyle(sheet, { row: 4, column: 0 }, { bold: true });
    setCellValue(sheet, { row: MAX_SHEET_ROWS - 1, column: 0 }, -0);
    setCellValue(sheet, { row: 3, column: 1 }, 24);

    expect(
      getSelectionSummary(sheet, {
        start: { row: 0, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      }),
    ).toEqual({
      average: 0,
      count: 1,
      numericCount: 1,
      selectedCellCount: MAX_SHEET_ROWS,
      sum: 0,
    });
  });

  test("reads a small selection directly instead of scanning a large sparse sheet", () => {
    const sheet = createSheet();
    setCellValue(sheet, { row: 0, column: 0 }, 7);
    for (let row = 1; row <= 5_000; row += 1) {
      setCellValue(sheet, { row, column: 10 }, row);
    }
    const iteratorSpy = vi.spyOn(sheet.cells, Symbol.iterator);

    expect(
      getSelectionSummary(sheet, {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      }),
    ).toEqual({ average: 7, count: 1, numericCount: 1, selectedCellCount: 1, sum: 7 });
    expect(iteratorSpy).not.toHaveBeenCalled();
  });
});
