import { describe, expect, test } from "vitest";
import { createWorkbookEvaluator, getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("worksheet subtotal and aggregate visibility", () => {
  test("uses evaluated filter columns outside the summed range", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    for (let row = 1; row <= 3; row++) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: row * 10 });
      setCellContent(
        sheet,
        { row, column: 1 },
        { kind: "formula", formula: { source: `=A${row + 1}>10` } },
      );
    }
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      columns: [{ column: 1, allowedValues: [{ kind: "boolean", value: true }] }],
    };
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,A2:A4)" } },
    );
    setCellContent(
      sheet,
      { row: 1, column: 3 },
      { kind: "formula", formula: { source: "=AGGREGATE(9,0,A2:A4)" } },
    );
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 3 })).toBe(50);
    expect(evaluator.getComputedValue({ row: 1, column: 3 })).toBe(50);
  });

  test("excludes hidden and nested reference values before scheduling dependencies", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 10 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=D1" } });
    sheet.rowHeights.set(1, 0);
    setCellContent(
      sheet,
      { row: 2, column: 0 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,A1)" } },
    );
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=SUBTOTAL(109,A1:A3)" } },
    );
    setCellContent(
      sheet,
      { row: 1, column: 3 },
      { kind: "formula", formula: { source: "=SUBTOTAL(109,A2)" } },
    );
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 3 })).toBe(10);
    expect(evaluator.getComputedValue({ row: 1, column: 3 })).toBe(0);
  });

  test("honors aggregate options for errors and includes nested results when requested", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 10 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
    setCellContent(
      sheet,
      { row: 2, column: 0 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,A1)" } },
    );
    setCellContent(
      sheet,
      { row: 0, column: 3 },
      { kind: "formula", formula: { source: "=AGGREGATE(9,6,A1:A3)" } },
    );
    expect(
      createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 3 }),
    ).toBe(20);
  });
});
