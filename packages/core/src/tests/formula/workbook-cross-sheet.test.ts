import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createRenameSheetCommand,
  createUpsertDefinedNameCommand,
} from "../../commands/index.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("workbook formula evaluation", () => {
  test("resolves cross-sheet ranges, exponent and percentage syntax", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data Set", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 3 });
    setCellContent(data, { row: 1, column: 0 }, { kind: "literal", value: 4 });
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, {
      kind: "formula",
      formula: { source: "=SUM('Data Set'!A1:A2)^2+'Data Set'!A1%" },
    });

    expect(createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({ row: 0, column: 0 })).toBe(49.03);
  });

  test("detects cycles across sheet boundaries", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, { kind: "formula", formula: { source: "=Data!A1" } });
    setCellContent(data, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=Sheet1!A1" } });
    expect(createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({ row: 0, column: 0 })).toMatchObject({ code: "CYCLE" });
  });

  test("evaluates a deep cross-sheet direct-reference chain without recursion", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 0; row < 15_000; row += 1) {
      const source = row === 0 ? "=IF(TRUE,Data!A1,0)" : `=IF(TRUE,Sheet1!A${row},0)`;
      setCellContent(data, { row: row + 1, column: 0 }, { kind: "formula", formula: { source } });
      setCellContent(getActiveSheet(workbook), { row, column: 0 }, { kind: "formula", formula: { source: `=IF(TRUE,Data!A${row + 2},0)` } });
    }
    expect(createWorkbookEvaluator(workbook, data.id).getComputedValue({ row: 15_000, column: 0 })).toBe(1);
  });

  test("schedules a deep cross-sheet lazy chain with expression and name dependencies", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, { name: "Anchor", reference: "=Data!A1" }),
    );
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(data, { row: 0, column: 1 }, { kind: "literal", value: true });
    const main = getActiveSheet(workbook);
    for (let row = 0; row < 15_000; row += 1) {
      setCellContent(data, { row: row + 1, column: 0 }, {
        kind: "formula",
        formula: { source: row === 0 ? "=SUM(Anchor)" : `=SUM(Sheet1!A${row})` },
      });
      setCellContent(main, { row, column: 0 }, {
        kind: "formula",
        formula: { source: `=IF(Data!B1,Data!A${row + 2},0)` },
      });
    }
    expect(createWorkbookEvaluator(workbook, data.id).getComputedValue({ row: 15_000, column: 0 })).toBe(1);
  });

  test("persists names and gives a local name precedence over a workbook name", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(data, { row: 0, column: 0 }, { kind: "literal", value: 5 });
    setCellContent(data, { row: 1, column: 0 }, { kind: "literal", value: 7 });
    applyWorkbookCommand(workbook, createUpsertDefinedNameCommand(workbook, { name: "Sales", reference: "=Data!A1:A2" }));
    applyWorkbookCommand(workbook, createUpsertDefinedNameCommand(workbook, { name: "Sales", scopeSheetId: workbook.activeSheetId, reference: "=Data!A1" }));
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, { kind: "formula", formula: { source: "=SUM(Sales)" } });

    expect(createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({ row: 0, column: 0 })).toBe(5);
    expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(workbook)))).toEqual(serializeWorkbook(workbook));
    setCellContent(getActiveSheet(workbook), { row: 0, column: 1 }, { kind: "formula", formula: { source: "=Data!A1" } });
    const inverse = applyWorkbookCommand(workbook, createInsertSheetAxisCommand(data.id, "row", 0));
    expect(createWorkbookEvaluator(workbook, workbook.activeSheetId).getComputedValue({ row: 0, column: 0 })).toBe(5);
    expect(getActiveSheet(workbook).cells.get("0:1")?.content).toMatchObject({ formula: { source: "=Data!A2" } });
    if (!inverse || !("type" in inverse)) throw new Error("Expected axis inverse.");
    applyWorkbookCommand(workbook, inverse);
    expect(getActiveSheet(workbook).cells.get("0:1")?.content).toMatchObject({ formula: { source: "=Data!A1" } });
  });

  test("rewrites qualified references for rename and delete, while the delete inverse restores them", () => {
    const workbook = createTestWorkbook();
    const data = createSheet("Data", "data");
    insertSheet(workbook, data);
    setCellContent(getActiveSheet(workbook), { row: 0, column: 0 }, { kind: "formula", formula: { source: "=Data!A1" } });
    applyWorkbookCommand(workbook, createRenameSheetCommand(data.id, "Revenue"));
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({ formula: { source: "=Revenue!A1" } });
    const inverse = applyWorkbookCommand(workbook, createDeleteSheetCommand(workbook, data.id));
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({ formula: { source: "=#REF!" } });
    if (!inverse || !("type" in inverse)) throw new Error("Expected delete inverse.");
    applyWorkbookCommand(workbook, inverse);
    expect(getActiveSheet(workbook).cells.get("0:0")?.content).toMatchObject({ formula: { source: "=Revenue!A1" } });
  });
});
