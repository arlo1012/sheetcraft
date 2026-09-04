import { describe, expect, test } from "vitest";
import { isFormulaError } from "../../formula/types.js";
import { createTestWorkbook } from "../helpers.js";
import {
  createSheetEvaluator,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
  setCellContent,
} from "../../workbook.js";

describe("sheet formula evaluation", () => {
  test("keeps raw formula source while calculating direct and indirect dependencies", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 4 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1+2" } });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=B1*3" } });

    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B1*3" },
    });
    expect(getCellComputedValue(sheet, { row: 0, column: 2 })).toBe(18);
  });

  test("detects direct and indirect cycles and memoizes a batch evaluator", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=A1" } });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=C1" } });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A2" } });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=B1" } });
    const evaluator = createSheetEvaluator(sheet);

    const direct = evaluator.getComputedValue({ row: 0, column: 0 });
    const indirect = evaluator.getComputedValue({ row: 0, column: 2 });
    expect(isFormulaError(direct) && direct.code).toBe("CYCLE");
    expect(isFormulaError(indirect) && indirect.code).toBe("CYCLE");
    expect(evaluator.getComputedValue({ row: 0, column: 2 })).toBe(indirect);
  });

  test("sums a large sparse range without enumerating missing cells", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 900_000, column: 10 }, { kind: "literal", value: 5 });
    setCellContent(
      sheet,
      { row: 0, column: 11 },
      { kind: "formula", formula: { source: "=SUM(A1:K900001)" } },
    );

    expect(getCellComputedValue(sheet, { row: 0, column: 11 })).toBe(7);
  });

  test("returns parse errors and propagates dependency errors", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=SUM(" } });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1+1" } });

    const result = getCellComputedValue(sheet, { row: 0, column: 1 });
    expect(isFormulaError(result) && result.code).toBe("PARSE");
  });

  test("evaluates a 15k dependency chain without using the JavaScript call stack", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 1; row < 15_000; row += 1) {
      setCellContent(
        sheet,
        { row, column: 0 },
        { kind: "formula", formula: { source: `=A${row}` } },
      );
    }
    expect(getCellComputedValue(sheet, { row: 14_999, column: 0 })).toBe(1);
  });

  test("evaluates many narrow ranges against a row-dense sparse index", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    for (let column = 0; column < 6_000; column += 1) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value: 1 });
    }
    for (let column = 0; column < 6_000; column += 1) {
      // Each narrow range targets one column; a whole-row scan per formula would be quadratic.
      setCellContent(
        sheet,
        { row: 1, column },
        { kind: "formula", formula: { source: "=SUM(A1:A1)" } },
      );
    }
    const evaluator = createSheetEvaluator(sheet);
    for (let column = 0; column < 6_000; column += 1) {
      expect(evaluator.getComputedValue({ row: 1, column })).toBe(1);
    }
  });
});
