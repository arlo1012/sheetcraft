import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteSheetAxisCommand,
  createRenameSheetCommand,
} from "../../commands/index.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("workbook formula reference rewrites", () => {
  test("does not rewrite reference-shaped string literals during rename or axis deletion", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 1, column: 0 }, { kind: "literal", value: 7 });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, {
      kind: "formula",
      formula: { source: '="Data!A2"' },
    });
    setCellContent(sheet, { row: 1, column: 0 }, {
      kind: "formula",
      formula: { source: "=Data!A2+1" },
    });

    applyWorkbookCommand(workbook, createRenameSheetCommand(data.id, "Actuals"));
    expect(sheet.cells.get("0:0")?.content).toMatchObject({ formula: { source: '="Data!A2"' } });
    expect(sheet.cells.get("1:0")?.content).toMatchObject({ formula: { source: "=Actuals!A2+1" } });

    applyWorkbookCommand(workbook, createDeleteSheetAxisCommand(data.id, "row", 0));
    expect(sheet.cells.get("0:0")?.content).toMatchObject({ formula: { source: '="Data!A2"' } });
    expect(sheet.cells.get("1:0")?.content).toMatchObject({ formula: { source: "=Actuals!A1+1" } });
  });

  test("rewrites and evaluates unquoted Unicode and quoted apostrophe sheet references", () => {
    const workbook = createTestWorkbook();
    const unicode = createSheet("数据", "unicode");
    const apostrophe = createSheet("O'Brien", "apostrophe");
    insertSheet(workbook, unicode);
    insertSheet(workbook, apostrophe);
    setCellContent(unicode, { row: 0, column: 0 }, { kind: "literal", value: 3 });
    setCellContent(apostrophe, { row: 0, column: 0 }, { kind: "literal", value: 4 });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, {
      kind: "formula",
      formula: { source: "=数据!A1" },
    });
    setCellContent(sheet, { row: 1, column: 0 }, {
      kind: "formula",
      formula: { source: "='O''Brien'!A1" },
    });

    expect(createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 0 })).toBe(3);
    applyWorkbookCommand(workbook, createRenameSheetCommand(unicode.id, "汇总"));
    applyWorkbookCommand(workbook, createRenameSheetCommand(apostrophe.id, "Bob's"));
    expect(sheet.cells.get("0:0")?.content).toMatchObject({ formula: { source: "=汇总!A1" } });
    expect(sheet.cells.get("1:0")?.content).toMatchObject({ formula: { source: "='Bob''s'!A1" } });
    expect(createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 1, column: 0 })).toBe(4);
  });
});
