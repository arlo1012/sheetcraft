import { describe, expect, test } from "vitest";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import {
  createApplyTableStyleToRangeCommand,
  createCreateTableCommand,
  createResizeTableCommand,
  createSetWorkbookTableStylesCommand,
  createSetWorkbookPivotTableStylesCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  hasHighlightedFirstColumn,
  resolveTableCellStyle,
} from "../../table-styles.js";
import { createSheet, createWorkbook, getCellContent, getCellStyle } from "../../workbook.js";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../history.js";
import { createRemoveTableCommand } from "../../tables.js";
import { createInsertSheetAxisCommand } from "../../commands/structure.js";
import { createMergeCellsCommand } from "../../commands/metadata.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createRestoreCellStylesCommand } from "../../commands/formatting.js";

function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const sheet = workbook.sheets.get("sheet")!;
  const table = {
    id: "table-1",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    columns: [
      { id: "a", name: "Amount" },
      { id: "b", name: "Region" },
    ],
    style: createBuiltinTableStyles("#4f81bd")[1]!,
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  return { workbook, sheet, table };
}

describe("tables", () => {
  test("style restore cannot rename header text outside the table transaction", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    const before = serializeWorkbook(workbook),
      undoCount = session.history.undoStack.length;
    expect(() =>
      executeWorkbookCommand(
        session,
        createRestoreCellStylesCommand(sheet.id, [
          {
            address: { row: 0, column: 0 },
            style: { fontSize: 20 },
            content: { kind: "literal", value: "Renamed" },
          },
        ]),
      ),
    ).toThrow();
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(undoCount);
  });

  test("applies and replaces range-only table styling across multi-row headers", () => {
    const { workbook, sheet, table } = fixture();
    const first = {
      ...table.style,
      elements: {
        wholeTable: { style: { fillColor: "#ddeeff" } },
        headerRow: { style: { fillColor: "#112233", textColor: "#ffffff", bold: true } },
        firstRowStripe: { style: { fillColor: "#aabbcc" } },
      },
    };
    const second = {
      ...first,
      elements: {
        wholeTable: { style: { fillColor: "#ffeecc" } },
        headerRow: { style: { fillColor: "#334455", textColor: "#ffffff", bold: true } },
        firstRowStripe: { style: { fillColor: "#ccddaa" }, stripeSize: 2 },
      },
    };
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "Header" },
      ),
    );
    applyWorkbookCommand(workbook, {
      type: "applyCellStyle",
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      patch: { numberFormat: { kind: "percent", fractionDigits: 1 } },
    });
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(
      session,
      createApplyTableStyleToRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
        first,
        2,
      ),
    );
    expect(sheet.tables).toEqual([]);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Header" });
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.fillColor).toBe("#112233");
    expect(getCellStyle(sheet, { row: 2, column: 0 })?.fillColor).toBe("#aabbcc");
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.numberFormat).toMatchObject({
      kind: "percent",
    });
    executeWorkbookCommand(
      session,
      createApplyTableStyleToRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
        second,
        2,
      ),
    );
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.fillColor).toBe("#334455");
    expect(getCellStyle(sheet, { row: 2, column: 0 })?.fillColor).toBe("#ccddaa");
    expect(getCellStyle(sheet, { row: 4, column: 0 })?.fillColor).toBe("#ffeecc");
    undoWorkbookCommand(session);
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.fillColor).toBe("#112233");
    redoWorkbookCommand(session);
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.fillColor).toBe("#334455");
  });

  test("applies a highlighted first column to a style-only range and restores it through history", () => {
    const { workbook, sheet, table } = fixture();
    const style = {
      ...table.style,
      elements: {
        wholeTable: { style: { fillColor: "#f2f2f2" } },
        headerRow: { style: { fillColor: "#4f81bd", textColor: "#ffffff", bold: true } },
        firstColumn: { style: { fillColor: "#1f4e78", textColor: "#ffffff", bold: true } },
      },
    };
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });

    executeWorkbookCommand(
      session,
      createApplyTableStyleToRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        style,
      ),
    );
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toMatchObject({
      fillColor: "#1f4e78",
      textColor: "#ffffff",
      bold: true,
    });
    expect(getCellStyle(sheet, { row: 1, column: 1 })?.fillColor).toBe("#f2f2f2");

    undoWorkbookCommand(session);
    expect(getCellStyle(sheet, { row: 1, column: 0 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toBeUndefined();
    redoWorkbookCommand(session);
    expect(getCellStyle(sheet, { row: 1, column: 0 })?.fillColor).toBe("#1f4e78");
  });

  test("recognizes the highlighted quick presets and leaves their first column optional", () => {
    const { table } = fixture();
    const quick = createThemedTableStyles("#4f81bd");
    const highlighted = quick.filter(hasHighlightedFirstColumn);
    expect(highlighted.map((style) => style.id)).toEqual([
      "table-wps-medium-3",
      "table-wps-medium-4",
    ]);

    for (const style of highlighted) {
      const highlightedTable = { ...table, style, firstColumn: true };
      const disabledTable = { ...highlightedTable, firstColumn: false };
      const expected = style.elements.firstColumn!.style;
      expect(resolveTableCellStyle(highlightedTable, { row: 1, column: 0 })).toMatchObject(
        expected,
      );
      expect(resolveTableCellStyle(disabledTable, { row: 1, column: 0 })?.fillColor).not.toBe(
        expected.fillColor,
      );
    }
  });

  test("stores independent pivot table styles through reversible library commands", () => {
    const { workbook } = fixture();
    const style = {
      id: "pivot-custom",
      name: "Pivot Custom",
      category: "custom" as const,
      elements: {
        wholeTable: { style: { bold: true } },
        firstSubtotalRow: { style: { fillColor: "#ddeeff" } },
      },
    };
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createSetWorkbookPivotTableStylesCommand([style], style.id));
    expect(workbook.pivotTableStyles).toEqual([style]);
    expect(workbook.defaultPivotTableStyleId).toBe(style.id);
    undoWorkbookCommand(session);
    expect(workbook.pivotTableStyles).toEqual([]);
  });

  test("provides Excel-inspired More and themed WPS quick table-style catalogues", () => {
    const more = createBuiltinTableStyles("#9bbb59");
    expect(more).toHaveLength(60);
    expect(more.filter((style) => style.category === "light")).toHaveLength(21);
    expect(more.filter((style) => style.category === "medium")).toHaveLength(28);
    expect(more.filter((style) => style.category === "dark")).toHaveLength(11);
    expect(more.map((style) => style.id)).toEqual([
      ...Array.from({ length: 21 }, (_, index) => `table-light-${index + 1}`),
      ...Array.from({ length: 28 }, (_, index) => `table-medium-${index + 1}`),
      ...Array.from({ length: 11 }, (_, index) => `table-dark-${index + 1}`),
    ]);
    expect(more[1]?.accentColor).toBe("#9bbb59");
    expect(new Set(more.slice(0, 7).map((style) => style.accentColor))).toEqual(
      new Set(["#000000", "#9bbb59", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"]),
    );

    const quick = createThemedTableStyles("#9bbb59");
    expect(quick).toHaveLength(32);
    expect(quick.filter((style) => style.category === "light")).toHaveLength(8);
    expect(quick.filter((style) => style.category === "medium")).toHaveLength(16);
    expect(quick.filter((style) => style.category === "dark")).toHaveLength(8);
    expect(quick.every((style) => style.accentColor === "#9bbb59")).toBe(true);
    const previewSignatures = quick.map((style) => {
      const table = {
        ...fixture().table,
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 4 } },
        style,
        totalRow: true,
        bandedRows: true,
        bandedColumns: false,
        firstColumn: false,
        lastColumn: false,
      };
      return JSON.stringify(
        Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, column) => resolveTableCellStyle(table, { row, column })),
        ),
      );
    });
    expect(new Set(previewSignatures).size).toBe(32);
  });

  test("creates headers and resolves the declarative style layer", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({
      kind: "literal",
      value: "Amount",
    });
    expect(resolveTableCellStyle(sheet.tables![0]!, { row: 0, column: 0 })?.textColor).toBe(
      "#4f81bd",
    );
  });

  test("keeps element border precedence and resolves inner borders for each selected element", () => {
    const { table } = fixture();
    const styled = {
      ...table,
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      totalRow: true,
      firstColumn: true,
      lastColumn: true,
      style: {
        ...table.style,
        elements: {
          wholeTable: { style: { borderBottom: { style: "thin" as const, color: "#0000ff" } } },
          headerRow: {
            style: { borderBottom: { style: "medium" as const, color: "#ff0000" } },
            innerVertical: { style: "thin" as const, color: "#00aa00" },
          },
          totalRow: {
            style: {},
            innerVertical: { style: "thin" as const, color: "#00cccc" },
          },
          firstColumn: {
            style: {},
            innerHorizontal: { style: "thin" as const, color: "#aa00aa" },
          },
          lastColumn: {
            style: {},
            innerHorizontal: { style: "thin" as const, color: "#ff8800" },
          },
        },
      },
    };

    expect(resolveTableCellStyle(styled, { row: 0, column: 0 })?.borderBottom).toEqual({
      style: "medium",
      color: "#ff0000",
    });
    expect(resolveTableCellStyle(styled, { row: 0, column: 1 })?.borderLeft).toEqual({
      style: "thin",
      color: "#00aa00",
    });
    expect(resolveTableCellStyle(styled, { row: 1, column: 0 })?.borderTop).toEqual({
      style: "thin",
      color: "#aa00aa",
    });
    expect(resolveTableCellStyle(styled, { row: 1, column: 1 })?.borderTop).toEqual({
      style: "thin",
      color: "#ff8800",
    });
    expect(resolveTableCellStyle(styled, { row: 3, column: 1 })?.borderLeft).toEqual({
      style: "thin",
      color: "#00cccc",
    });
  });

  test("allows a later table element to clear a whole-table inner border", () => {
    const { table } = fixture();
    const styled = {
      ...table,
      style: {
        ...table.style,
        elements: {
          wholeTable: {
            style: {},
            innerVertical: { style: "thin" as const, color: "#0000ff" },
          },
          headerRow: { style: {}, innerVertical: null },
        },
      },
    };
    expect(resolveTableCellStyle(styled, { row: 1, column: 1 })?.borderLeft).toEqual({
      style: "thin",
      color: "#0000ff",
    });
    expect(resolveTableCellStyle(styled, { row: 0, column: 1 })?.borderLeft).toBeUndefined();
  });

  test("table creation retains mapped existing header fonts", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        {
          kind: "literal",
          value: " Amount ",
          fontRuns: [{ start: 1, end: 7, fontFamily: "Symbol" }],
        },
      ),
    );
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Amount",
      fontRuns: [{ start: 0, end: 6, fontFamily: "Symbol" }],
    });
  });

  test("preserves font runs through header trimming, suffixes and font-only edits", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    const address = { row: 0, column: 1 };
    const fontRuns = [{ start: 1, end: 7, fontFamily: "Symbol" }];
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: " Amount ",
        fontRuns,
      }),
    );
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: "Amount2",
      fontRuns: [{ start: 0, end: 6, fontFamily: "Symbol" }],
    });
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "Amount2",
        fontRuns: [{ start: 0, end: 6, fontFamily: "Arial" }],
      }),
    );
    expect(getCellContent(sheet, address)).toMatchObject({
      fontRuns: [{ start: 0, end: 6, fontFamily: "Arial" }],
    });
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toMatchObject({
      fontRuns: [{ start: 0, end: 6, fontFamily: "Symbol" }],
    });
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "Region" });
    redoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: "Amount2",
      fontRuns: [{ start: 0, end: 6, fontFamily: "Symbol" }],
    });
  });

  test("normalizes visible header captions uniquely and restores them through undo", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 1 },
        { kind: "literal", value: " amount " },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 1 })).toMatchObject({ value: "amount2" });
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual(["Amount", "amount2"]);
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toMatchObject({ value: "Region" });
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual(["Amount", "Region"]);

    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: 2026 },
      ),
    );
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "2026" });
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual(["2026", "Region"]);

    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sheet.id, table.id, { headerRow: false }),
    );
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "Data" },
      ),
    );
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual(["2026", "Region"]);
  });

  test("uses matching captions when right-adjacent input adds a table column", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 2 },
        { kind: "literal", value: " amount " },
      ),
    );
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual([
      "Amount",
      "Region",
      "amount2",
    ]);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toMatchObject({ value: "amount2" });

    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(sheet.id, { row: 1, column: 3 }, { kind: "literal", value: 8 }),
    );
    expect(sheet.tables?.[0]?.columns.map((column) => column.name)).toEqual([
      "Amount",
      "Region",
      "amount2",
      "Column4",
    ]);
    expect(getCellContent(sheet, { row: 0, column: 3 })).toMatchObject({ value: "Column4" });
    expect(getCellContent(sheet, { row: 1, column: 3 })).toMatchObject({ value: 8 });
  });

  test("keeps adjacent merged-cell input outside a table when it cannot expand", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(
      workbook,
      createMergeCellsCommand(sheet.id, {
        start: { row: 3, column: 0 },
        end: { row: 3, column: 1 },
      }),
    );

    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(sheet.id, { row: 3, column: 0 }, { kind: "literal", value: 99 }),
    );
    expect(sheet.tables?.[0]?.range.end.row).toBe(2);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toMatchObject({ value: 99 });
  });

  test("accepts an unchanged range while toggling headers with totals and filters", () => {
    const { workbook, sheet, table } = fixture();
    const filtered = {
      ...table,
      filter: { range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }, columns: [] },
    };
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, filtered));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 10 }),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    const range = sheet.tables![0]!.range;
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { headerRow: false, range }),
    );
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: false,
      totalRow: true,
      range: { end: { row: 2, column: 1 } },
      // The shifted filter covers data only; the last table row is totals.
      filter: { range: { end: { row: 1, column: 1 } } },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: 10 });
    expect(() => deserializeWorkbook(serializeWorkbook(workbook))).not.toThrow();
    undoWorkbookCommand(session);
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: true,
      totalRow: true,
      range: { end: { row: 3, column: 1 } },
      filter: { range: { end: { row: 2, column: 1 } } },
    });
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, {
        headerRow: false,
        range: sheet.tables![0]!.range,
      }),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, {
        headerRow: true,
        range: sheet.tables![0]!.range,
      }),
    );
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: true,
      totalRow: true,
      range: { end: { row: 3, column: 1 } },
    });
  });

  test("hides and restores headers with totals and cross-sheet A1 references", () => {
    const { workbook, sheet, table } = fixture();
    const formulas = createSheet("Formulas", "formulas");
    workbook.sheets.set(formulas.id, formulas);
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 10 }),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        formulas.id,
        { row: 0, column: 0 },
        {
          kind: "formula",
          formula: { source: "=Sheet1!A2" },
        },
      ),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { headerRow: false }),
    );
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: false,
      totalRow: true,
      range: { end: { row: 2 } },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: 10 });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toMatchObject({ kind: "formula" });
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=Sheet1!A1" },
    });

    undoWorkbookCommand(session);
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: true,
      totalRow: true,
      range: { end: { row: 3 } },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Amount" });
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=Sheet1!A2" },
    });

    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { headerRow: false }),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { headerRow: true }),
    );
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: true,
      totalRow: true,
      range: { end: { row: 3 } },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Amount" });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toMatchObject({ value: 10 });
  });

  test("accepts Table1 and Chinese table names, preserving numeric and formula headers", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: 2026 },
      ),
    );
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 1 },
        { kind: "formula", formula: { source: "=100+20" } },
      ),
    );
    const generated = { ...table, id: "table-1", name: "Table1", columns: [] };
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, generated));
    expect(sheet.tables![0]!.columns.map((column) => column.name)).toEqual(["2026", "120"]);
    applyWorkbookCommand(workbook, createRemoveTableCommand(sheet.id, generated.id));
    applyWorkbookCommand(
      workbook,
      createCreateTableCommand(sheet.id, { ...generated, id: "table-2", name: "金额表" }),
    );
    expect(sheet.tables![0]!.name).toBe("金额表");
  });

  test("rejects a table crossing merged cells without changing the sheet", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(
      workbook,
      createMergeCellsCommand(sheet.id, {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
      }),
    );
    expect(() => applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table))).toThrow(
      /merged/i,
    );
    expect(sheet.tables).toEqual([]);
    expect(sheet.mergedCells).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
    ]);
  });

  test("adds and removes a total row in one undoable command", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    expect(sheet.tables![0]!.range.end.row).toBe(3);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toMatchObject({ kind: "formula" });
    undoWorkbookCommand(session);
    expect(sheet.tables![0]!.totalRow).toBe(false);
    expect(sheet.tables![0]!.range.end.row).toBe(2);
  });

  test("validates an update before inserting a total row", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    expect(() =>
      applyWorkbookCommand(
        workbook,
        createUpdateTableCommand(sheet.id, table.id, { name: "A1", totalRow: true }),
      ),
    ).toThrow();
    expect(sheet.tables![0]!.totalRow).toBe(false);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toBeNull();
  });

  test("resizes a total table by moving totals below the added body row", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    applyWorkbookCommand(
      workbook,
      createResizeTableCommand(sheet.id, table.id, {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 1 },
      }),
    );
    expect(sheet.tables![0]!.range.end.row).toBe(4);
    expect(getCellContent(sheet, { row: 4, column: 0 })).toMatchObject({ kind: "formula" });
  });

  test("shrinks a total table by relocating totals and restores the data through history", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 2, column: 0 }, { kind: "literal", value: 25 }),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    executeWorkbookCommand(
      session,
      createResizeTableCommand(sheet.id, table.id, {
        start: { row: 0, column: 0 },
        end: { row: 2, column: 1 },
      }),
    );

    expect(sheet.tables?.[0]?.range.end.row).toBe(2);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toMatchObject({
      formula: { source: "=SUBTOTAL(109,A2:A2)" },
    });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toBeNull();

    undoWorkbookCommand(session);
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toMatchObject({ value: 25 });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toMatchObject({ kind: "formula" });

    redoWorkbookCommand(session);
    expect(sheet.tables?.[0]?.range.end.row).toBe(2);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toMatchObject({ kind: "formula" });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toBeNull();
  });

  test("rejects a total-row insertion that would overlap another table without shifting cells", () => {
    const { workbook, sheet, table } = fixture();
    const following = {
      ...table,
      id: "table-2",
      name: "Following",
      range: { start: { row: 3, column: 0 }, end: { row: 4, column: 1 } },
    };
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, following));

    expect(() =>
      applyWorkbookCommand(
        workbook,
        createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
      ),
    ).toThrow(/overlap/i);
    expect(sheet.tables?.map((entry) => entry.range)).toEqual([table.range, following.range]);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toMatchObject({ value: "Amount" });
  });

  test("validates a total-table resize before shifting cells for an overlapping table", () => {
    const { workbook, sheet, table } = fixture();
    const following = {
      ...table,
      id: "table-2",
      name: "Following",
      range: { start: { row: 4, column: 0 }, end: { row: 5, column: 1 } },
    };
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, following));

    expect(() =>
      applyWorkbookCommand(
        workbook,
        createResizeTableCommand(sheet.id, table.id, {
          start: { row: 0, column: 0 },
          end: { row: 4, column: 1 },
        }),
      ),
    ).toThrow(/overlap/i);
    expect(sheet.tables?.map((item) => item.range)).toEqual([
      { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      following.range,
    ]);
    expect(getCellContent(sheet, { row: 4, column: 0 })).toMatchObject({ value: "Amount" });
  });

  test("restores a total-table resize and leaves cross-sheet A1 formulas intact", () => {
    const { workbook, sheet, table } = fixture();
    const formulas = createSheet("Formulas", "formulas");
    workbook.sheets.set(formulas.id, formulas);
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        formulas.id,
        { row: 0, column: 0 },
        {
          kind: "formula",
          formula: { source: "=Sheet1!A5" },
        },
      ),
    );
    executeWorkbookCommand(
      session,
      createResizeTableCommand(sheet.id, table.id, {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 1 },
      }),
    );
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=Sheet1!A6" },
    });

    undoWorkbookCommand(session);
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=Sheet1!A5" },
    });
  });

  test("does not permit overlapping tables", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    expect(() =>
      applyWorkbookCommand(
        workbook,
        createCreateTableCommand(sheet.id, { ...table, id: "table-2", name: "Other" }),
      ),
    ).toThrow(/overlap/i);
  });

  test("keeps table identity while structural rows and columns move its range", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(workbook, createInsertSheetAxisCommand(sheet.id, "row", 0, 1));
    applyWorkbookCommand(workbook, createInsertSheetAxisCommand(sheet.id, "column", 0, 1));
    expect(sheet.tables![0]).toMatchObject({
      id: table.id,
      name: "Sales",
      range: { start: { row: 1, column: 1 }, end: { row: 3, column: 2 } },
    });
  });

  test("keeps table columns aligned when a column is inserted or deleted inside the table", () => {
    const { workbook, sheet, table } = fixture();
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
    applyWorkbookCommand(workbook, createInsertSheetAxisCommand(sheet.id, "column", 1, 1));
    expect(sheet.tables![0]!.columns).toHaveLength(3);
    expect(sheet.tables![0]!.columns.map((column) => column.name)).toEqual([
      "Amount",
      "Column3",
      "Region",
    ]);
    applyWorkbookCommand(workbook, {
      type: "deleteSheetAxis",
      sheetId: sheet.id,
      axis: "column",
      index: 1,
      count: 1,
    });
    expect(sheet.tables![0]!.columns.map((column) => column.name)).toEqual(["Amount", "Region"]);
  });

  test("creates a header for headerless data through an insert shift without overwriting following cells", () => {
    const { workbook, sheet, table } = fixture();
    for (let row = 0; row < 4; row += 1)
      applyWorkbookCommand(
        workbook,
        createSetCellContentCommand(
          sheet.id,
          { row, column: 0 },
          { kind: "literal", value: row + 1 },
        ),
      );
    const singleColumn = {
      ...table,
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [{ id: "a", name: "Column1" }],
      headerRow: false,
    };
    applyWorkbookCommand(
      workbook,
      createCreateTableCommand(sheet.id, singleColumn, { hasHeaders: false }),
    );
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Column1" });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toMatchObject({ value: 1 });
    expect(getCellContent(sheet, { row: 4, column: 0 })).toMatchObject({ value: 4 });
  });

  test("persists a headerless table with one remaining data row", () => {
    const { workbook, sheet, table } = fixture();
    const singleDataRow = {
      ...table,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
    };
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, singleDataRow));
    applyWorkbookCommand(
      workbook,
      createUpdateTableCommand(sheet.id, singleDataRow.id, { headerRow: false }),
    );

    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: false,
      range: { start: { row: 0 }, end: { row: 0 } },
    });
    expect(
      deserializeWorkbook(serializeWorkbook(workbook)).sheets.get(sheet.id)?.tables?.[0],
    ).toMatchObject({ headerRow: false, range: { start: { row: 0 }, end: { row: 0 } } });
  });

  test("propagates a library style edit to existing tables and restores it through history", () => {
    const { workbook, sheet, table } = fixture();
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    const edited = {
      ...table.style,
      accentColor: "#cc0000",
      elements: {
        ...table.style.elements,
        headerRow: { style: { fillColor: "#cc0000", textColor: "#ffffff" } },
      },
    };
    executeWorkbookCommand(session, createSetWorkbookTableStylesCommand([edited], edited.id));
    expect(sheet.tables![0]!.style.accentColor).toBe("#cc0000");
    undoWorkbookCommand(session);
    expect(sheet.tables![0]!.style.accentColor).toBe(table.style.accentColor);
  });

  test("undoes and redoes a cross-sheet table rename atomically", () => {
    const { workbook, sheet, table } = fixture();
    const formulas = createSheet("Formulas", "formulas");
    workbook.sheets.set(formulas.id, formulas);
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        formulas.id,
        { row: 0, column: 0 },
        { kind: "formula", formula: { source: "=SUM(Sales[Amount])" } },
      ),
    );
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { name: "Revenue" }),
    );
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Revenue[Amount])" },
    });
    undoWorkbookCommand(session);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sales[Amount])" },
    });
    redoWorkbookCommand(session);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Revenue[Amount])" },
    });
  });

  test("undoes header rename and convert-to-range formula rewrites across sheets", () => {
    const { workbook, sheet, table } = fixture();
    const formulas = createSheet("Formulas", "formulas");
    workbook.sheets.set(formulas.id, formulas);
    const session = createWorkbookSession({ workbook, idFactory: () => "id" });
    executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        formulas.id,
        { row: 0, column: 0 },
        { kind: "formula", formula: { source: "=SUM(Sales[Amount])" } },
      ),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        { kind: "literal", value: "Net" },
      ),
    );
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sales[Net])" },
    });
    undoWorkbookCommand(session);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sales[Amount])" },
    });
    executeWorkbookCommand(session, createRemoveTableCommand(sheet.id, table.id));
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sheet1!A2:A3)" },
    });
    undoWorkbookCommand(session);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sales[Amount])" },
    });
    redoWorkbookCommand(session);
    expect(getCellContent(formulas, { row: 0, column: 0 })).toMatchObject({
      formula: { source: "=SUM(Sheet1!A2:A3)" },
    });
  });
});
