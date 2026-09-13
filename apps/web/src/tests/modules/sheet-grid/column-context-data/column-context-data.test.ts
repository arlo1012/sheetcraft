import { describe, expect, test } from "vitest";
import { createFormulaError } from "@idea10/core/formula";
import {
  createSheet,
  createSheetEvaluator,
  MAX_SHEET_COLUMNS,
  setCellContent,
  setCellStyle,
  setCellValue,
} from "@idea10/core/workbook";
import {
  getColumnChoices,
  getColumnStatistics,
} from "../../../../modules/sheet-grid/column-context-data";

describe("column context data", () => {
  test("does not materialize statistics for every column in a whole-sheet range", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 0 }, "only value");

    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 0, column: MAX_SHEET_COLUMNS - 1 } },
        createSheetEvaluator(sheet),
      ),
    ).toHaveLength(1);
  });

  test("summarizes sparse visible cells, retaining date numbers but excluding errors", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 0 }, 12);
    setCellValue(sheet, { row: 1, column: 0 }, 24);
    setCellValue(sheet, { row: 2, column: 0 }, "note");
    setCellValue(sheet, { row: 3, column: 0 }, 45_000);
    setCellStyle(
      sheet,
      { row: 3, column: 0 },
      { numberFormat: { kind: "date", code: "yyyy-mm-dd" } },
    );
    setCellContent(
      sheet,
      { row: 4, column: 0 },
      { kind: "error", error: createFormulaError("DIV0") },
    );
    setCellContent(sheet, { row: 5, column: 0 }, { kind: "formula", formula: { source: "=A1*2" } });
    sheet.hiddenRows?.add(1);

    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 5, column: 0 } },
        createSheetEvaluator(sheet),
      ),
    ).toEqual([
      expect.objectContaining({
        column: 0,
        selectedCellCount: 5,
        nonEmptyCount: 4,
        numericCount: 3,
        dateCount: 1,
        errorCount: 1,
        sum: 45_036,
        average: 15_012,
        minimum: 12,
        maximum: 45_000,
      }),
    ]);
  });

  test("omits rows hidden by active filter criteria without walking empty rows", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 0 }, "Header");
    setCellValue(sheet, { row: 1, column: 0 }, 10);
    setCellValue(sheet, { row: 2, column: 0 }, 20);
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "number", value: 10 }] }],
    };

    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
        createSheetEvaluator(sheet),
      )[0],
    ).toMatchObject({
      selectedCellCount: 2,
      nonEmptyCount: 2,
      numericCount: 1,
      sum: 10,
      distribution: [
        { value: "10", count: 1 },
        { value: "Header", count: 1 },
      ],
    });
  });

  test("returns nearby distinct literal text choices only", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 1 }, "North");
    setCellValue(sheet, { row: 2, column: 1 }, "South");
    setCellValue(sheet, { row: 5, column: 1 }, "North");
    setCellValue(sheet, { row: 6, column: 1 }, 99);
    setCellContent(sheet, { row: 7, column: 1 }, { kind: "formula", formula: { source: "=1+1" } });
    setCellContent(
      sheet,
      { row: 8, column: 1 },
      { kind: "image", image: { assetId: "asset", altText: "image" } },
    );
    sheet.hiddenRows?.add(2);

    expect(getColumnChoices(sheet, { row: 4, column: 1 }, createSheetEvaluator(sheet))).toEqual([
      { value: "North", count: 2, nearestRow: 5 },
    ]);
  });
});
