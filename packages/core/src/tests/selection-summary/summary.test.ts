import { describe, expect, test, vi } from "vitest";
import { createTestSheet, createTestWorkbook } from "../helpers.js";
import { getSelectionSummary } from "../../selection-summary.js";
import {
  MAX_SHEET_ROWS,
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setCellValue,
} from "../../workbook.js";

describe("selection summary", () => {
  test("summarizes populated and numeric cells inside a reversed range", () => {
    const sheet = createTestSheet();
    setCellValue(sheet, { row: 0, column: 0 }, 10);
    setCellValue(sheet, { row: 0, column: 1 }, 20);
    setCellValue(sheet, { row: 0, column: 2 }, "note");
    setCellValue(sheet, { row: 1, column: 0 }, 99);

    expect(
      getSelectionSummary(sheet, {
        start: { row: 0, column: 2 },
        end: { row: 0, column: 0 },
      }),
    ).toEqual({
      average: 15,
      count: 3,
      maximum: 20,
      minimum: 10,
      numericCount: 2,
      selectedCellCount: 3,
      sum: 30,
    });
  });

  test("ignores style-only cells and avoids scanning empty whole-axis ranges", () => {
    const sheet = createTestSheet();
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
      maximum: 0,
      minimum: 0,
      numericCount: 1,
      selectedCellCount: MAX_SHEET_ROWS,
      sum: 0,
    });
  });

  test("looks up a small selection without scanning unrelated sparse cells", () => {
    const sheet = createTestSheet();
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
    ).toEqual({
      average: 7,
      count: 1,
      maximum: 7,
      minimum: 7,
      numericCount: 1,
      selectedCellCount: 1,
      sum: 7,
    });
    expect(iteratorSpy).not.toHaveBeenCalled();
  });

  test("evaluates formulas only when they are selected", () => {
    const sheet = createTestSheet();
    setCellValue(sheet, { row: 0, column: 0 }, 12);
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=A1*2" },
      },
    );
    for (let row = 1; row <= 5_000; row += 1) {
      setCellValue(sheet, { row, column: 10 }, row);
    }
    const keysSpy = vi.spyOn(sheet.cells, "keys");

    expect(
      getSelectionSummary(sheet, {
        start: { row: 0, column: 1 },
        end: { row: 0, column: 1 },
      }),
    ).toMatchObject({
      average: 24,
      count: 1,
      maximum: 24,
      minimum: 24,
      numericCount: 1,
      selectedCellCount: 1,
      sum: 24,
    });
    expect(keysSpy).toHaveBeenCalledOnce();
  });

  test("summarizes cross-sheet formula results with an injected evaluator", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const inputs = createSheet("Inputs", "inputs");
    workbook.sheets.set(inputs.id, inputs);
    setCellValue(inputs, { row: 0, column: 0 }, 21);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1 * 2" },
      },
    );

    expect(
      getSelectionSummary(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        createWorkbookEvaluator(workbook, sheet.id),
      ),
    ).toMatchObject({ count: 1, numericCount: 1, sum: 42, average: 42 });
  });
});
