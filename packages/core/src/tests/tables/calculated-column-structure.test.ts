import { describe, expect, test } from "vitest";
import { calculatedColumnFixture } from "./calculated-column-fixture.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { createSheet, getCellContent, setCellContent } from "../../workbook.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import { createResizeTableCommand } from "../../tables.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
} from "../../commands/structure.js";

describe("calculated-column structural references and history", () => {
  test("qualified absolute spill references follow their anchor in scalar formulas and templates", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    const other = createSheet("Other", "other");
    workbook.sheets.set(other.id, other);
    setCellContent(
      other,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    executeWorkbookCommand(session, formula(1, "=SUM(Other!$B$1#)"));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createInsertSheetAxisCommand(other.id, "row", 0));
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=SUM(Other!$B$2#)");
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(Other!$B$2#)" },
    });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });
  test.each([1, 2])(
    "insert data row at %s inherits the canonical formula and exactly reverses",
    (index) => {
      const { workbook, sheet, session, formula } = calculatedColumnFixture();
      executeWorkbookCommand(session, formula(1, "=B2+Sheet1!B2+$B$1"));
      const before = serializeWorkbook(workbook);
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", index));
      expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2+Sheet1!B2+$B$1");
      expect(getCellContent(sheet, { row: index, column: 2 })).toEqual({
        kind: "formula",
        formula: { source: `=B${index + 1}+Sheet1!B${index + 1}+$B$1` },
      });
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
    },
  );

  test.each([1, 2])(
    "delete data row %s reanchors before rewriting relative and truly deleted absolute references",
    (index) => {
      const { workbook, sheet, session, formula } = calculatedColumnFixture();
      executeWorkbookCommand(session, formula(1, "=B2+Sheet1!B2+$B$2"));
      const before = serializeWorkbook(workbook);
      executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "row", index));
      expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe(
        index === 1 ? "=B2+Sheet1!B2+#REF!" : "=B2+Sheet1!B2+$B$2",
      );
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
    },
  );

  test("column insertion and deletion retain calculated-column ID and correctly rewrite its reference", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "column", 1));
    expect(sheet.tables![0]!.columns[3]).toMatchObject({
      id: "col-2",
      calculatedColumnFormula: "=C2*2",
    });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 2));
    expect(sheet.tables![0]!.columns[2]).toMatchObject({
      id: "col-2",
      calculatedColumnFormula: "=#REF!*2",
    });
  });

  test.each(["row", "column"] as const)(
    "internal %s reorder follows identity and keeps self-qualified cells and template aligned",
    (axis) => {
      const { workbook, sheet, session, formula } = calculatedColumnFixture();
      executeWorkbookCommand(session, formula(1, "=B2+Sheet1!B2"));
      executeWorkbookCommand(
        session,
        createResizeTableCommand(sheet.id, "sales", {
          start: { row: 0, column: 0 },
          end: { row: axis === "row" ? 5 : 3, column: axis === "column" ? 4 : 2 },
        }),
      );
      const before = serializeWorkbook(workbook);
      executeWorkbookCommand(
        session,
        createMoveSheetAxisCommand(
          sheet.id,
          axis,
          axis === "row" ? 1 : 2,
          1,
          axis === "row" ? 3 : 1,
        ),
      );
      const calculated = axis === "row" ? 2 : 1;
      expect(sheet.tables![0]!.columns[calculated]).toMatchObject({
        id: "col-2",
        calculatedColumnFormula: axis === "row" ? "=B2+Sheet1!B2" : "=C2+Sheet1!C2",
      });
      expect(getCellContent(sheet, { row: 1, column: calculated })).toEqual({
        kind: "formula",
        formula: { source: axis === "row" ? "=B2+Sheet1!B2" : "=C2+Sheet1!C2" },
      });
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
    },
  );

  test.each(["relative", "move"] as const)(
    "unsupported external %s family transforms reject without changing cells/history",
    (kind) => {
      const { workbook, session, formula } = calculatedColumnFixture();
      workbook.sheets.set("other", createSheet("Other", "other"));
      executeWorkbookCommand(
        session,
        formula(1, kind === "relative" ? "=Other!B2" : "=Other!$B$1"),
      );
      const before = serializeWorkbook(workbook);
      const revision = session.history.revision;
      const command =
        kind === "relative"
          ? createInsertSheetAxisCommand("other", "row", 2)
          : createMoveSheetAxisCommand("other", "column", 1, 1, 3);
      expect(() => executeWorkbookCommand(session, command)).toThrow(/calculated column/i);
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
    },
  );

  test("absolute external source-only rewrite is recorded and restored even with every member overridden", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    workbook.sheets.set("other", createSheet("Other", "other"));
    executeWorkbookCommand(session, formula(1, "=Other!$B$1"));
    for (let row = 1; row <= 3; row++)
      setCellContent(sheet, { row, column: 2 }, { kind: "literal", value: 99 });
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    executeWorkbookCommand(session, createInsertSheetAxisCommand("other", "row", 0));
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Other!$B$2");
    expect(session.history.revision).toBe(revision + 1);
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("external column insertion rewrites templates and existing members without refilling exceptions", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    workbook.sheets.set("other", createSheet("Other", "other"));
    executeWorkbookCommand(session, formula(1, "=Other!B2"));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 2, column: 2 }, { kind: "literal", value: 99 }),
    );
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, createInsertSheetAxisCommand("other", "column", 1));
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=Other!C2");
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=Other!C2" },
    });
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 99 });
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("inserted calculated members violating validation reject before any coordinate or reference mutation", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    executeWorkbookCommand(session, formula(1, "=IF(B2=0,100,B2*2)"));
    sheet.dataValidations = [
      {
        id: "limit",
        range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
        type: "whole",
        operator: "lessThan",
        formula1: "99",
        allowBlank: false,
      },
    ];
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 2)),
    ).toThrow();
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });

  test("a non-affine own-row reorder with external relative references is explicitly rejected", () => {
    const { workbook, sheet, session, formula } = calculatedColumnFixture();
    workbook.sheets.set("other", createSheet("Other", "other"));
    executeWorkbookCommand(session, formula(1, "=Other!B2"));
    executeWorkbookCommand(
      session,
      createResizeTableCommand(sheet.id, "sales", {
        start: { row: 0, column: 0 },
        end: { row: 5, column: 2 },
      }),
    );
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "row", 1, 1, 3)),
    ).toThrow(/formula family/);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });
});
