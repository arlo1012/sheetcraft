import { describe, expect, test } from "vitest";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { createBatchSetCellContentsCommand } from "../../commands/values.js";
import { createSetSheetFilterCriteriaCommand } from "../../commands/filter.js";
import { createWorkbookCalculationSession } from "../../formula/calculation-session.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import {
  createCreateTableCommand,
  createRemoveTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getCellContent,
} from "../../workbook.js";

function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sales", sheetName: "Sales" });
  const sales = workbook.sheets.get("sales")!;
  applyWorkbookCommand(
    workbook,
    createBatchSetCellContentsCommand([
      {
        sheetId: sales.id,
        address: { row: 1, column: 0 },
        content: { kind: "literal", value: 10 },
      },
      {
        sheetId: sales.id,
        address: { row: 2, column: 0 },
        content: { kind: "literal", value: 20 },
      },
    ]),
  );
  const table = {
    id: "sales-table",
    name: "SalesTable",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    columns: [
      { id: "amount", name: "Amount" },
      { id: "category", name: "Category" },
    ],
    style: createBuiltinTableStyles()[0]!,
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  applyWorkbookCommand(workbook, createCreateTableCommand(sales.id, table));
  return { workbook, sales, table };
}

function formula(source: string) {
  return { kind: "formula" as const, formula: { source } };
}

describe("structured table formula references", () => {
  test("calculates a named table column and a current-row reference", () => {
    const { workbook, sales } = fixture();
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 2 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
        { sheetId: sales.id, address: { row: 1, column: 1 }, content: formula("=[@Amount]") },
      ]),
    );
    const evaluator = createWorkbookEvaluator(workbook, sales.id);
    expect(evaluator.getComputedValue({ row: 0, column: 2 })).toBe(30);
    expect(evaluator.getComputedValue({ row: 1, column: 1 })).toBe(10);
  });

  test("resolves a table by name from another sheet", () => {
    const { workbook } = fixture();
    const summary = createSheet("Summary", "summary");
    workbook.sheets.set(summary.id, summary);
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: summary.id,
          address: { row: 0, column: 0 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
      ]),
    );
    expect(
      createWorkbookEvaluator(workbook, summary.id).getComputedValue({ row: 0, column: 0 }),
    ).toBe(30);
  });

  test("keeps headers and totals as distinct structured-reference scopes", () => {
    const { workbook, sales, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sales.id, table.id, { totalRow: true }),
    );
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 2 },
          content: formula("=SalesTable[[#Headers],[Amount]]"),
        },
        {
          sheetId: sales.id,
          address: { row: 1, column: 2 },
          content: formula("=SalesTable[[#Totals],[Amount]]"),
        },
      ]),
    );
    const evaluator = createWorkbookEvaluator(workbook, sales.id);
    expect(evaluator.getComputedValue({ row: 0, column: 2 })).toBe("Amount");
    expect(evaluator.getComputedValue({ row: 1, column: 2 })).toBe(30);
  });

  test("excludes table-filtered rows from a table total", () => {
    const { workbook, sales, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sales.id, table.id, { totalRow: true }),
    );
    applyWorkbookCommand(
      workbook,
      createSetSheetFilterCriteriaCommand(
        sales.id,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        [{ column: 0, allowedValues: [{ kind: "number", value: 10 }] }],
      ),
    );
    expect(sales.tables![0]!.filter).not.toBeNull();
    expect(
      createWorkbookEvaluator(workbook, sales.id).getComputedValue({ row: 3, column: 0 }),
    ).toBe(10);
  });

  test("recalculates an expanded table column through one calculation session", () => {
    const { workbook, sales, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          // A one-cell write immediately beside a table expands it into a new
          // column. Keep this dependency outside that auto-expansion boundary.
          address: { row: 0, column: 3 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
      ]),
    );
    const calculation = createWorkbookCalculationSession(workbook);
    expect(calculation.getEvaluator(sales.id).getComputedValue({ row: 0, column: 3 })).toBe(30);

    calculation.prepareMutation();
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 3, column: 0 },
          content: { kind: "literal", value: 30 },
        },
      ]),
    );
    applyWorkbookCommand(
      workbook,
      createResizeTableCommand(sales.id, table.id, {
        start: { row: 0, column: 0 },
        end: { row: 3, column: 1 },
      }),
    );
    calculation.invalidate();
    expect(calculation.getEvaluator(sales.id).getComputedValue({ row: 0, column: 3 })).toBe(60);
  });

  test("rewrites formulas for table and column renames", () => {
    const { workbook, sales, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 3 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
      ]),
    );
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sales.id, table.id, { name: "Revenue" }),
    );
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "Net Amount" },
        },
      ]),
    );
    expect(getCellContent(sales, { row: 0, column: 3 })).toEqual(
      formula("=SUM(Revenue[Net Amount])"),
    );
    expect(
      createWorkbookEvaluator(workbook, sales.id).getComputedValue({ row: 0, column: 3 }),
    ).toBe(30);
  });

  test("converts named, cross-sheet, and current-row references to A1 before removing a table", () => {
    const { workbook, sales, table } = fixture();
    const summary = createSheet("Summary", "summary");
    workbook.sheets.set(summary.id, summary);
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 2 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
        { sheetId: sales.id, address: { row: 1, column: 1 }, content: formula("=[@Amount]") },
        {
          sheetId: summary.id,
          address: { row: 0, column: 0 },
          content: formula("=SUM(SalesTable[Amount])"),
        },
      ]),
    );
    applyWorkbookCommand(workbook, createRemoveTableCommand(sales.id, table.id));

    expect(getCellContent(sales, { row: 0, column: 2 })).toEqual(formula("=SUM(A2:A3)"));
    expect(getCellContent(sales, { row: 1, column: 1 })).toEqual(formula("=A2"));
    expect(getCellContent(summary, { row: 0, column: 0 })).toEqual(formula("=SUM(Sales!A2:A3)"));
    expect(
      createWorkbookEvaluator(workbook, summary.id).getComputedValue({ row: 0, column: 0 }),
    ).toBe(30);
  });

  test("keeps structured references to other tables when converting one table to a range", () => {
    const { workbook, sales, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 1, column: 3 },
          content: { kind: "literal", value: 4 },
        },
        {
          sheetId: sales.id,
          address: { row: 2, column: 3 },
          content: { kind: "literal", value: 5 },
        },
      ]),
    );
    const other = {
      ...table,
      id: "other-table",
      name: "OtherTable",
      range: { start: { row: 0, column: 3 }, end: { row: 2, column: 4 } },
      columns: [
        { id: "other-amount", name: "Amount" },
        { id: "other-category", name: "Category" },
      ],
    };
    applyWorkbookCommand(workbook, createCreateTableCommand(sales.id, other));
    applyWorkbookCommand(
      workbook,
      createBatchSetCellContentsCommand([
        {
          sheetId: sales.id,
          address: { row: 0, column: 6 },
          content: formula("=SUM(OtherTable[Amount])"),
        },
      ]),
    );
    applyWorkbookCommand(workbook, createRemoveTableCommand(sales.id, table.id));

    expect(getCellContent(sales, { row: 0, column: 6 })).toEqual(
      formula("=SUM(OtherTable[Amount])"),
    );
    expect(
      createWorkbookEvaluator(workbook, sales.id).getComputedValue({ row: 0, column: 6 }),
    ).toBe(9);
  });
});
