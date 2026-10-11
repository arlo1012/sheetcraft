import { describe, expect, test } from "vitest";
import {
  createSetCellContentCommand,
  createBatchSetCellContentsCommand,
} from "../../commands/values.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import {
  createCreateTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import {
  createWorkbook,
  createSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { createSetSheetProtectionCommand } from "../../commands/protection.js";
import { createApplyTableCalculatedColumnCommand } from "../../table-calculated-columns.js";
import { prepareFillTarget } from "../../commands/fill-common.js";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";

function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const sheet = workbook.sheets.get("sheet")!;
  for (const [column, value] of ["Item", "Qty", "Result"].entries())
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
  for (let row = 1; row <= 3; row++)
    setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row + 1 });
  applyWorkbookCommand(
    workbook,
    createCreateTableCommand(sheet.id, {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      columns: ["Item", "Qty", "Result"].map((name, index) => ({ id: `col-${index}`, name })),
      style: createBuiltinTableStyles("#4f81bd")[1]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  const session = createWorkbookSession({ workbook, idFactory: () => "id" });
  const formula = (row: number, source = `=B${row + 1}*2`) =>
    createSetCellContentCommand(
      sheet.id,
      { row, column: 2 },
      { kind: "formula", formula: { source } },
      { inputIntent: "manual" },
    );
  const sources = () => [1, 2, 3].map((row) => getCellContent(sheet, { row, column: 2 }));
  return { workbook, sheet, session, formula, sources };
}

describe("table calculated columns", () => {
  test("a manual first formula in a truly empty column fills all rows in one undoable transaction", () => {
    const { workbook, sheet, session, formula, sources } = fixture();
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(session, formula(2));
    expect(sources()).toEqual(
      [2, 3, 4].map((row) => ({ kind: "formula", formula: { source: `=B${row}*2` } })),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test.each([99, "", "existing"])("a mixed column preserves an existing literal %j", (value) => {
    const { sheet, session, formula, sources } = fixture();
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value });
    executeWorkbookCommand(session, formula(1));
    expect(sources()).toEqual([
      { kind: "formula", formula: { source: "=B2*2" } },
      { kind: "literal", value },
      null,
    ]);
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
  });

  test("single-cell and rectangular clipboard/programmatic writes never establish or fill a template", () => {
    const { sheet, session, sources } = fixture();
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 2 },
        { kind: "formula", formula: { source: "=B2*2" } },
      ),
    );
    expect(sources().slice(1)).toEqual([null, null]);
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBeUndefined();
    executeWorkbookCommand(
      session,
      createBatchSetCellContentsCommand([
        {
          sheetId: sheet.id,
          address: { row: 2, column: 2 },
          content: { kind: "formula", formula: { source: "=B3*2" } },
        },
      ]),
    );
    expect(sources()[2]).toBeNull();
  });

  test("manual exceptions keep the template and versioned snapshots preserve both", () => {
    const { workbook, sheet, session, formula } = fixture();
    executeWorkbookCommand(session, formula(1));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 2, column: 2 },
        { kind: "literal", value: 100 },
        { inputIntent: "manual" },
      ),
    );
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(45);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 44 })).toThrow(/version 45/);
  });

  test("explicit column application is the only way to overwrite mixed values and is atomic through history", () => {
    const { workbook, sheet, session, formula, sources } = fixture();
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: 99 });
    executeWorkbookCommand(session, formula(1));
    const before = serializeWorkbook(workbook);
    const command = createApplyTableCalculatedColumnCommand(
      sheet.id,
      "sales",
      "col-2",
      { row: 1, column: 2 },
      "=B2*3",
    );
    executeWorkbookCommand(session, structuredClone(command));
    expect(sources()).toEqual(
      [2, 3, 4].map((row) => ({ kind: "formula", formula: { source: `=B${row}*3` } })),
    );
    const after = serializeWorkbook(workbook);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(after);
  });

  test("cleared and differently formulated cells are exceptions, even when the whole column is empty again", () => {
    const { sheet, session, formula, sources } = fixture();
    executeWorkbookCommand(session, formula(1));
    executeWorkbookCommand(session, formula(2, "=100"));
    expect(sources()[0]).toEqual({ kind: "formula", formula: { source: "=B2*2" } });
    for (let row = 1; row <= 3; row++)
      executeWorkbookCommand(
        session,
        createSetCellContentCommand(sheet.id, { row, column: 2 }, null, { inputIntent: "manual" }),
      );
    executeWorkbookCommand(session, formula(2, "=7"));
    expect(sources()).toEqual([null, { kind: "formula", formula: { source: "=7" } }, null]);
    expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
  });

  test("relative qualified references rebase while absolute references and qualifiers are retained", () => {
    const { workbook, session, formula, sources } = fixture();
    workbook.sheets.set("other", createSheet("Other Data", "other"));
    executeWorkbookCommand(session, formula(2, "=B3+'Other Data'!C3+$B$1+SUM('Other Data'!D3:E3)"));
    expect(sources()).toEqual(
      [2, 3, 4].map((row) => ({
        kind: "formula",
        formula: { source: `=B${row}+'Other Data'!C${row}+$B$1+SUM('Other Data'!D${row}:E${row})` },
      })),
    );
  });

  test("table-wide application includes hidden members without changing ordinary fill's hidden-cell guard", () => {
    const { workbook, sheet, session, formula, sources } = fixture();
    sheet.hiddenRows = new Set([2]);
    executeWorkbookCommand(session, formula(1));
    expect(sources().every((content) => content?.kind === "formula")).toBe(true);
    expect(() =>
      prepareFillTarget(workbook, sheet.id, {
        start: { row: 1, column: 2 },
        end: { row: 3, column: 2 },
      }),
    ).toThrow(/hidden/);
    expect([...sheet.hiddenRows]).toEqual([2]);
  });

  test.each(["validation", "duplicate", "protected", "spill", "array"] as const)(
    "%s at a generated target rejects the entire operation without a history entry",
    (kind) => {
      const { workbook, sheet, session, formula } = fixture();
      if (kind === "validation")
        sheet.dataValidations = [
          {
            id: "limit",
            range: { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
            type: "whole",
            operator: "lessThanOrEqual",
            formula1: "7",
            allowBlank: false,
          },
        ];
      if (kind === "duplicate")
        sheet.duplicateRules = [
          {
            id: "unique",
            kind: "reject",
            range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
          },
        ];
      if (kind === "protected") {
        setCellStyle(sheet, { row: 1, column: 2 }, { unlocked: true });
        applyWorkbookCommand(workbook, createSetSheetProtectionCommand(sheet.id, true));
      }
      if (kind === "spill")
        setCellContent(
          sheet,
          { row: 3, column: 1 },
          { kind: "formula", formula: { source: "=SEQUENCE(1,2)" } },
        );
      const before = serializeWorkbook(workbook);
      const revision = session.history.revision;
      expect(() =>
        executeWorkbookCommand(
          session,
          formula(1, kind === "array" ? "=SEQUENCE(2)" : kind === "duplicate" ? "=1" : "=B2*2"),
        ),
      ).toThrow();
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(session.history.revision).toBe(revision);
    },
  );

  test("manual input below a table inherits formulas only in empty new members and is one undoable growth", () => {
    const { workbook, sheet, session, formula } = fixture();
    executeWorkbookCommand(session, formula(1));
    const before = serializeWorkbook(workbook);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(
        sheet.id,
        { row: 4, column: 1 },
        { kind: "literal", value: 5 },
        { inputIntent: "manual" },
      ),
    );
    expect(sheet.tables![0]!.range.end.row).toBe(4);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B5*2" },
    });
    undoWorkbookCommand(session);
    expect(serializeWorkbook(workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(sheet.tables![0]!.range.end.row).toBe(4);
  });

  test("single-cell paste below may keep existing table expansion but changes only the pasted target", () => {
    const { sheet, session, formula } = fixture();
    executeWorkbookCommand(session, formula(1));
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 4, column: 1 }, { kind: "literal", value: 5 }),
    );
    expect(sheet.tables![0]!.range.end.row).toBe(4);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toBeNull();
  });

  test.each([false, true])(
    "explicit resize with totals=%s retains column identity, template and occupied new cells",
    (totalRow) => {
      const { workbook, sheet, session, formula } = fixture();
      executeWorkbookCommand(session, formula(1));
      if (totalRow)
        executeWorkbookCommand(
          session,
          createUpdateTableCommand(sheet.id, "sales", { totalRow: true }),
        );
      const last = sheet.tables![0]!.range.end.row;
      if (!totalRow)
        setCellContent(sheet, { row: last + 1, column: 2 }, { kind: "literal", value: 99 });
      const before = serializeWorkbook(workbook);
      const ids = sheet.tables![0]!.columns.map((column) => column.id);
      executeWorkbookCommand(
        session,
        createResizeTableCommand(sheet.id, "sales", {
          start: { row: 0, column: 0 },
          end: { row: last + 2, column: 2 },
        }),
      );
      expect(sheet.tables![0]!.columns.map((column) => column.id)).toEqual(ids);
      expect(sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
      expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual(
        totalRow
          ? { kind: "formula", formula: { source: "=B5*2" } }
          : { kind: "literal", value: 99 },
      );
      expect(getCellContent(sheet, { row: 5, column: 2 })).toEqual({
        kind: "formula",
        formula: { source: "=B6*2" },
      });
      const after = serializeWorkbook(workbook);
      undoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(before);
      redoWorkbookCommand(session);
      expect(serializeWorkbook(workbook)).toEqual(after);
    },
  );

  test("a rejected totals-row growth simulation never mutates original cells or metadata", () => {
    const { workbook, sheet, session, formula } = fixture();
    executeWorkbookCommand(session, formula(1));
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, "sales", { totalRow: true }),
    );
    sheet.dataValidations = [
      {
        id: "limit",
        range: { start: { row: 4, column: 2 }, end: { row: 5, column: 2 } },
        type: "whole",
        operator: "lessThan",
        formula1: "0",
        allowBlank: false,
      },
    ];
    const before = serializeWorkbook(workbook);
    const revision = session.history.revision;
    expect(() =>
      executeWorkbookCommand(
        session,
        createResizeTableCommand(sheet.id, "sales", {
          start: { row: 0, column: 0 },
          end: { row: 6, column: 2 },
        }),
      ),
    ).toThrow();
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(session.history.revision).toBe(revision);
  });
});
