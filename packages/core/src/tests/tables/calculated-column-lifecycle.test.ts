import { describe, expect, test } from "vitest";
import { calculatedColumnFixture } from "./calculated-column-fixture.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { createSheet, getCellContent } from "../../workbook.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import {
  createRenameSheetCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
} from "../../commands/sheets.js";
import {
  createUpdateTableCommand,
  createResizeTableCommand,
  createCreateTableCommand,
  createRemoveTableCommand,
} from "../../tables.js";
import { createInsertCellsCommand } from "../../commands/cell-shift.js";
import { fixture as pivotFixture } from "../pivot-tables/fixture.js";

describe("calculated-column identity and reference lifecycle", () => {
  test("compound header and totals rejection leaves the entire workbook and history intact", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { headerRow: false }),
    );
    executeWorkbookCommand(session, formula(0, "=B3"));
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(
        session,
        createUpdateTableCommand(sheet.id, "sales", {
          headerRow: true,
          totalRow: true,
        }),
      ),
    ).toThrow(/calculated.column|formula family/i);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });

  test("compound header and totals update uses current geometry and has one exact inverse", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { headerRow: false }),
    );
    executeWorkbookCommand(session, formula(0, "=B1*2"));
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", {
        headerRow: true,
        totalRow: true,
      }),
    );
    expect(sheet.tables![0]!).toMatchObject({
      headerRow: true,
      totalRow: true,
      range: {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 2 },
      },
    });
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
    expect(session.history.revision).toBe(revision + 1);
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("manual template creation and row inheritance retain pivot style libraries through history", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    workbook.pivotTableStyles = [
      {
        id: "custom-pivot",
        name: "Custom",
        category: "custom",
        elements: {
          wholeTable: { style: { bold: true } },
        },
      },
    ];
    workbook.defaultPivotTableStyleId = "custom-pivot";
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, formula(1));
    const first = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(first);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 4, column: 1 },
        { kind: "literal", value: 5 },
        { inputIntent: "manual" },
      ),
    );
    const grown = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(first);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(grown);
  });

  test("nested shifts and shadow commits preserve defined names in both directions", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    workbook.definedNames.set("name", {
      id: "name",
      name: "NamedCell",
      reference: {
        sheetId: sheet.id,
        start: { row: 9, column: 1 },
        end: { row: 9, column: 1 },
      },
    });
    for (const changes of [
      { headerRow: false },
      {
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
        totalRow: true,
      },
    ]) {
      const before = serializeWorkbook(workbook);
      executeWorkbookCommand(session, createUpdateTableCommand(sheet.id, "sales", changes));
      expect(workbook.definedNames.get("name")!.reference.start.row).toBe(
        changes.headerRow === false ? 8 : 10,
      );
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
      undoWorkbookCommand(session);
    }
  });

  test("nested totals insertion cannot move only part of a downstream PivotTable report", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    sheet.pivotTables = [
      {
        ...pivotFixture().table,
        name: "SyntheticPivot",
        sourceSheetId: sheet.id,
        source: { start: { row: 0, column: 5 }, end: { row: 3, column: 8 } },
        anchor: { row: 9, column: 1 },
        outputRange: { start: { row: 9, column: 1 }, end: { row: 12, column: 4 } },
      },
    ];
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(
        session,
        createUpdateTableCommand(sheet.id, "sales", { totalRow: true }),
      ),
    ).toThrow(/PivotTable report/);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });
  test("sheet rename updates template and materialized references, preserves strings/exceptions and exact history", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, '=Sheet1!B2*2&"Sheet1!B2"'));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 2, column: 2 },
        { kind: "literal", value: 99 },
        { inputIntent: "manual" },
      ),
    );
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createRenameSheetCommand(sheet.id, "New Data"));
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe(
      "='New Data'!B2*2&\"Sheet1!B2\"",
    );
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 99 });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test.each([false, true])(
    "delete a referenced sheet, including self=%s, restores the pre-delete template and cells exactly",
    (self) => {
      const { workbook, sheet, session, formula } = calculatedColumnFixture();
      workbook.sheets.set("other", createSheet("Other", "other"));
      executeWorkbookCommand(session, formula(1, self ? "=Sheet1!B2*2" : "=Other!$B$1"));
      const before = serializeWorkbook(workbook);
      executeWorkbookCommand(
        session,
        createDeleteSheetCommand(workbook, self ? sheet.id : "other"),
      );
      if (!self) expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=#REF!");
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
    },
  );

  test("table and column rename update explicit and local template bindings before future growth", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, "=Sales[@Qty]+[@Qty]"));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { name: "Orders" }),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Orders[@Qty]+[@Qty]");
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 1 },
        { kind: "literal", value: "Count" },
        { inputIntent: "manual" },
      ),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Orders[@Count]+[@Count]");
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 4, column: 1 },
        { kind: "literal", value: 5 },
        { inputIntent: "manual" },
      ),
    );
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=Orders[@Count]+[@Count]" },
    });
  });

  test("sheet copy gives tables independent identity and retargets explicit table formula bindings", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, "=Sales[@Qty]*2"));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createDuplicateSheetCommand(workbook, sheet.id, { id: "copy", name: "Copy" }),
    );
    const copy = workbook.sheets.get("copy")!;
    expect(copy.tables![0]!.id).not.toBe("sales");
    expect(copy.tables![0]!.name).toBe("Sales2");
    expect(copy.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Sales2[@Qty]*2");
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Sales[@Qty]*2");
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("header toggle uses the actual local shift while external qualified references stay fixed", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    workbook.sheets.set("other", createSheet("Other", "other"));
    executeWorkbookCommand(session, formula(1, "=B2+Sheet1!B2+Other!B2"));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { headerRow: false }),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B1+Sheet1!B1+Other!B2");
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { headerRow: true }),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2+Sheet1!B2+Other!B2");
  });

  test("totals growth retains the source rewritten by its nested cell shift before filling new rows", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, "=B5*2"));
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { totalRow: true }),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B6*2");
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createResizeTableCommand(sheet.id, "sales", {
        start: { row: 0, column: 0 },
        end: { row: 6, column: 2 },
      }),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B8*2");
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B11*2" },
    });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("combined range, totals and name changes are planned and committed as one reversible operation", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, "=Sales[@Qty]*2"));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", {
        range: { start: { row: 0, column: 0 }, end: { row: 5, column: 2 } },
        totalRow: true,
        name: "Orders",
      }),
    );
    expect(sheet.tables![0]!.range.end.row).toBe(6);
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Orders[@Qty]*2");
    expect(getCellContent(sheet, { row: 5, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=Orders[@Qty]*2" },
    });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("converting a referenced table fixes its regions in surviving templates and retains member exceptions", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    const prototype = sheet.tables![0]!;
    executeWorkbookCommand(
      session,
      createCreateTableCommand(sheet.id, {
        ...prototype,
        id: "other-table",
        name: "OtherTable",
        range: { start: { row: 0, column: 4 }, end: { row: 3, column: 6 } },
        columns: prototype.columns.map((column) => ({ id: column.id, name: column.name })),
        filter: null,
      }),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 6 },
        { kind: "formula", formula: { source: "=SUM(Sales[Qty])" } },
        { inputIntent: "manual" },
      ),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 2, column: 6 }, { kind: "literal", value: 99 }),
    );
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createRemoveTableCommand(sheet.id, "sales"));
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=SUM($B$2:$B$4)");
    expect(getCellContent(sheet, { row: 2, column: 6 })).toEqual({ kind: "literal", value: 99 });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("cell shifts through calculated table data atomically refuse the unsupported membership change", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(
        session,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 2, column: 2 }, end: { row: 2, column: 2 } },
          "down",
        ),
      ),
    ).toThrow(/table or whole-axis/);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });
});
