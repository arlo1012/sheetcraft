import { describe, expect, test } from "vitest";
import { createFormulaError } from "@idea10/core/formula";
import {
  createSheet,
  createSheetEvaluator,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
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

  test("includes hidden cells, retaining date numbers but excluding numeric errors", () => {
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
        selectedCellCount: 6,
        nonEmptyCount: 5,
        numericCount: 4,
        dateCount: 1,
        errorCount: 1,
        sum: 45_060,
        average: 11_265,
        minimum: 12,
        maximum: 45_000,
      }),
    ]);
  });

  test("includes rows hidden by active filter criteria without walking empty rows", () => {
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
      selectedCellCount: 3,
      nonEmptyCount: 3,
      numericCount: 2,
      sum: 30,
      distribution: [
        { value: "10", count: 1 },
        { value: "20", count: 1 },
        { value: "Header", count: 1 },
      ],
    });
  });

  test("counts actual whole-column content instead of grid capacity or styled blanks", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 2, column: 1 }, "title1");
    [45, 9, 8, 7, 6, 5, 4, 3, 2, 1].forEach((value, index) =>
      setCellValue(sheet, { row: 3 + index, column: 1 }, value),
    );
    setCellStyle(sheet, { row: MAX_SHEET_ROWS - 1, column: 1 }, { bold: true });
    setCellContent(sheet, { row: 20, column: 1 }, { kind: "formula", formula: { source: '=""' } });
    const result = getColumnStatistics(
      sheet,
      { start: { row: 0, column: 1 }, end: { row: MAX_SHEET_ROWS - 1, column: 1 } },
      createSheetEvaluator(sheet),
    )[0]!;
    expect(result).toMatchObject({
      selectedCellCount: 11,
      nonEmptyCount: 11,
      numericCount: 10,
      sum: 90,
      average: 9,
      distinctCount: 11,
      uniqueCount: 11,
    });
    expect(result.distribution.map((item) => item.value)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("empty columns have zero count and no numeric extrema", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: MAX_SHEET_ROWS - 1, column: 0 } },
        createSheetEvaluator(sheet),
      )[0],
    ).toMatchObject({
      selectedCellCount: 0,
      nonEmptyCount: 0,
      numericCount: 0,
      average: null,
      minimum: null,
      maximum: null,
      distribution: [],
    });
  });

  test("includes hidden content but excludes gaps and cells outside the selected range", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 0 }, 100);
    setCellValue(sheet, { row: 2, column: 0 }, 0);
    setCellValue(sheet, { row: 5, column: 0 }, false);
    setCellValue(sheet, { row: 8, column: 0 }, 10);
    setCellValue(sheet, { row: 9, column: 0 }, 20);
    sheet.hiddenRows?.add(8);
    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 1, column: 0 }, end: { row: 8, column: 0 } },
        createSheetEvaluator(sheet),
      )[0],
    ).toMatchObject({ selectedCellCount: 3, nonEmptyCount: 3, numericCount: 2, sum: 10 });
  });

  test("computes distinct and singleton counts before limiting the distribution", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    for (let row = 0; row < 30; row++) setCellValue(sheet, { row, column: 0 }, row);
    setCellValue(sheet, { row: 30, column: 0 }, 5);
    const result = getColumnStatistics(
      sheet,
      { start: { row: 0, column: 0 }, end: { row: 30, column: 0 } },
      createSheetEvaluator(sheet),
    )[0]!;
    expect(result).toMatchObject({
      selectedCellCount: 31,
      distinctCount: 30,
      uniqueCount: 29,
      distributionTruncated: true,
    });
    expect(result.distribution).toHaveLength(5);
    expect(result.distribution[0]).toEqual({ value: "5", count: 2 });
  });

  test("matches the 27-row reference and computes least frequent values independently", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 0 }, "Header");
    const numbers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 3, 4, 5, 6, 7];
    numbers.forEach((value, index) =>
      setCellValue(sheet, { row: index === 14 ? 26 : index + 1, column: 0 }, value),
    );
    sheet.hiddenRows?.add(2);
    const result = getColumnStatistics(
      sheet,
      { start: { row: 0, column: 0 }, end: { row: MAX_SHEET_ROWS - 1, column: 0 } },
      createSheetEvaluator(sheet),
    )[0]!;
    expect(result).toMatchObject({
      totalRowCount: 27,
      emptyCount: 11,
      distinctCount: 11,
      numericCount: 15,
      sum: 90,
      average: 6,
      median: 6,
      minimum: 2,
      maximum: 11,
    });
    expect(result.distribution).toEqual(
      [3, 4, 5, 6, 7].map((value) => ({ value: String(value), count: 2 })),
    );
    expect(result.leastDistribution.every((item) => item.count === 1)).toBe(true);
    expect(result.distribution[0]!.count / result.nonEmptyCount).toBe(0.125);
  });
  test("computes even medians and retains explicitly selected blank rows", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 3, column: 0 }, 2);
    setCellValue(sheet, { row: 5, column: 0 }, 10);
    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 1, column: 0 }, end: { row: 8, column: 0 } },
        createSheetEvaluator(sheet),
      )[0],
    ).toMatchObject({ totalRowCount: 8, emptyCount: 6, median: 6 });
    expect(
      getColumnStatistics(
        sheet,
        { start: { row: 0, column: 0 }, end: { row: MAX_SHEET_ROWS - 1, column: 0 } },
        createSheetEvaluator(sheet),
      )[0],
    ).toMatchObject({ totalRowCount: 3, emptyCount: 1, median: 6 });
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
