import { describe, expect, test } from "vitest";
import {
  createCreateTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
  type SheetTable,
} from "../../workbook.js";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";

function fixture(totalRow = true) {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  [
    ["Amount", "Units"],
    [10, 2],
    [25, 3],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  setCellContent(sheet, { row: 5, column: 0 }, { kind: "literal", value: "Following content" });
  const table: SheetTable = {
    id: "sales",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    columns: [
      { id: "amount", name: "Amount" },
      { id: "units", name: "Units" },
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
  const session = createWorkbookSession({ workbook, idFactory: () => "id" });
  executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
  if (totalRow)
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
  return { workbook, sheet, table, session };
}
function cells(f: ReturnType<typeof fixture>) {
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 2 }, (_, column) => getCellContent(f.sheet, { row, column })),
  );
}
const rangeEnding = (row: number) => ({ start: { row: 0, column: 0 }, end: { row, column: 1 } });

describe("table settings range resize", () => {
  test("horizontal resize regenerates added column totals, clears excluded totals and restores them through undo", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    const expanded = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { range: expanded, totalRow: true }),
    );
    expect(f.sheet.tables![0]!.range).toEqual(expanded);
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toMatchObject({
      formula: { source: "=SUBTOTAL(109,C2:C3)" },
    });
    const afterExpansion = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { range: rangeEnding(3), totalRow: true }),
    );
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toBeNull();
    expect(getCellContent(f.sheet, { row: 3, column: 1 })).toMatchObject({
      formula: { source: "=SUBTOTAL(109,B2:B3)" },
    });
    const afterShrink = serializeWorkbook(f.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(afterExpansion);
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toMatchObject({ kind: "formula" });
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(afterShrink);
  });
  test.each([2, 5])(
    "settings resize to end row %i relocates totals like the dedicated command and fully restores history",
    (end) => {
      const updated = fixture();
      const dedicated = fixture();
      const before = serializeWorkbook(updated.workbook);
      executeWorkbookCommand(
        updated.session,
        createUpdateTableCommand(updated.sheet.id, updated.table.id, {
          range: rangeEnding(end),
          totalRow: true,
        }),
      );
      executeWorkbookCommand(
        dedicated.session,
        createResizeTableCommand(dedicated.sheet.id, dedicated.table.id, rangeEnding(end)),
      );
      expect(updated.sheet.tables![0]!.range).toEqual(rangeEnding(end));
      expect(updated.sheet.tables![0]!.totalRow).toBe(true);
      for (const [column, label] of [
        [0, "A"],
        [1, "B"],
      ] as const) {
        expect(getCellContent(updated.sheet, { row: end, column })).toMatchObject({
          kind: "formula",
          formula: { source: `=SUBTOTAL(109,${label}2:${label}${end})` },
        });
        expect(getCellContent(updated.sheet, { row: 3, column })).toBeNull();
      }
      expect(cells(updated)).toEqual(cells(dedicated));
      const after = serializeWorkbook(updated.workbook);
      undoWorkbookCommand(updated.session);
      expect(serializeWorkbook(updated.workbook)).toEqual(before);
      expect(getCellContent(updated.sheet, { row: 2, column: 0 })).toMatchObject({ value: 25 });
      redoWorkbookCommand(updated.session);
      expect(serializeWorkbook(updated.workbook)).toEqual(after);
    },
  );

  test.each([true, false])(
    "range update with totalRow=%s applies the toggle exactly once after resizing",
    (totalRow) => {
      const updated = fixture(!totalRow);
      const dedicated = fixture(!totalRow);
      const requestedEnd = totalRow ? 4 : 5;
      const expectedEnd = requestedEnd + (totalRow ? 1 : -1);
      const before = serializeWorkbook(updated.workbook);
      executeWorkbookCommand(
        updated.session,
        createUpdateTableCommand(updated.sheet.id, updated.table.id, {
          range: rangeEnding(requestedEnd),
          totalRow,
        }),
      );
      executeWorkbookCommand(
        dedicated.session,
        createResizeTableCommand(dedicated.sheet.id, dedicated.table.id, rangeEnding(requestedEnd)),
      );
      executeWorkbookCommand(
        dedicated.session,
        createUpdateTableCommand(dedicated.sheet.id, dedicated.table.id, { totalRow }),
      );
      expect(updated.sheet.tables![0]!.range).toEqual(rangeEnding(expectedEnd));
      expect(updated.sheet.tables![0]!.totalRow).toBe(totalRow);
      expect(cells(updated)).toEqual(cells(dedicated));
      if (totalRow)
        expect(getCellContent(updated.sheet, { row: expectedEnd, column: 0 })).toMatchObject({
          formula: { source: `=SUBTOTAL(109,A2:A${expectedEnd})` },
        });
      else
        expect(
          cells(updated)
            .flat()
            .filter((content) => content?.kind === "formula"),
        ).toEqual([]);
      const after = serializeWorkbook(updated.workbook);
      undoWorkbookCommand(updated.session);
      expect(serializeWorkbook(updated.workbook)).toEqual(before);
      redoWorkbookCommand(updated.session);
      expect(serializeWorkbook(updated.workbook)).toEqual(after);
    },
  );
});
