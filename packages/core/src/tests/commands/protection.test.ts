import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { canEditCell, canEditRange } from "../../protection.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellValue } from "../../workbook.js";
import {
  createSetCellContentCommand,
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  createApplyCellStyleCommand,
  createSetSheetProtectionCommand,
  createSetWorkbookStructureProtectionCommand,
  createAddSheetCommand,
  createDeleteSheetCommand,
  createMoveSheetCommand,
  createRenameSheetCommand,
  createSetSheetPropertiesCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createResizeSheetDimensionCommand,
} from "../../commands/index.js";
const a1 = { row: 0, column: 0 },
  b1 = { row: 0, column: 1 },
  c1 = { row: 0, column: 2 };
const range = (start = a1, end = start) => ({ start, end });
function fixture() {
  const session = createTestWorkbookSession();
  const workbook = session.workbook,
    sheet = getActiveSheet(workbook);
  const run = (command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command);
  return { session, workbook, sheet, run };
}
describe("workbook and sheet protection", () => {
  test("allows unlocked cells and edit exceptions, rejects a mixed batch atomically", () => {
    const f = fixture();
    f.run(createApplyCellStyleCommand(f.sheet.id, range(a1), { unlocked: true }));
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, {
        editableRanges: [{ name: "Input", range: range(c1) }],
      }),
    );
    expect(canEditCell(f.sheet, a1)).toBe(true);
    expect(canEditCell(f.sheet, b1)).toBe(false);
    expect(canEditCell(f.sheet, c1)).toBe(true);
    f.run(createSetCellContentCommand(f.sheet.id, a1, { kind: "literal", value: 1 }));
    f.run(createSetCellContentCommand(f.sheet.id, c1, { kind: "literal", value: 3 }));
    const revision = f.session.history.revision;
    expect(() =>
      f.run(
        createBatchSetCellContentsCommand(
          [a1, b1].map((address) => ({
            sheetId: f.sheet.id,
            address,
            content: { kind: "literal", value: 99 },
          })),
        ),
      ),
    ).toThrow();
    expect(getCellValue(f.sheet, a1)).toBe(1);
    expect(f.session.history.revision).toBe(revision);
    expect(() => f.run(createClearCellRangeCommand(f.sheet.id, range(a1, c1)))).toThrow();
    f.run(createClearCellRangeCommand(f.sheet.id, range(a1)));
    expect(getCellValue(f.sheet, a1)).toBeNull();
    undoWorkbookCommand(f.session);
    expect(getCellValue(f.sheet, a1)).toBe(1);
    redoWorkbookCommand(f.session);
    expect(getCellValue(f.sheet, a1)).toBeNull();
  });
  test("format permission never permits changing lock state", () => {
    const f = fixture();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], formatCells: true }),
    );
    f.run(createApplyCellStyleCommand(f.sheet.id, range(a1), { bold: true }));
    expect(f.sheet.cells.get("0:0")?.style?.bold).toBe(true);
    expect(() =>
      f.run(createApplyCellStyleCommand(f.sheet.id, range(a1), { unlocked: true })),
    ).toThrow();
    undoWorkbookCommand(f.session);
    expect(f.sheet.cells.get("0:0")?.style?.bold).toBeUndefined();
  });
  test("structure protection blocks every sheet structure command and supports undo", () => {
    const f = fixture();
    f.run(createAddSheetCommand(f.workbook, { id: "second" }));
    f.run(createSetWorkbookStructureProtectionCommand(true));
    for (const command of [
      createAddSheetCommand(f.workbook, { id: "third" }),
      createDeleteSheetCommand(f.workbook, f.sheet.id),
      createMoveSheetCommand(f.workbook, f.sheet.id, 1),
      createRenameSheetCommand(f.sheet.id, "Renamed"),
      createSetSheetPropertiesCommand(f.workbook, f.sheet.id, { hidden: true }),
    ])
      expect(() => f.run(command)).toThrow();
    f.run(createSetCellContentCommand(f.sheet.id, a1, { kind: "literal", value: 5 }));
    undoWorkbookCommand(f.session);
    undoWorkbookCommand(f.session);
    expect(f.workbook.structureProtected).toBe(false);
    redoWorkbookCommand(f.session);
    expect(f.workbook.structureProtected).toBe(true);
  });
  test("protected autofill retains destination lock and format and rejects a locked target atomically", () => {
    const f = fixture();
    f.run(createSetCellContentCommand(f.sheet.id, a1, { kind: "literal", value: 7 }));
    f.run(createApplyCellStyleCommand(f.sheet.id, range(b1), { unlocked: true, italic: true }));
    f.run(createSetSheetProtectionCommand(f.sheet.id, true));
    const plan = captureCellFill(f.workbook, f.sheet.id, range(a1), range(a1, b1));
    f.run(createCellFillCommand(f.workbook, plan, "copy"));
    expect(getCellValue(f.sheet, b1)).toBe(7);
    expect(f.sheet.cells.get("0:1")?.style).toEqual({ unlocked: true, italic: true });
    undoWorkbookCommand(f.session);
    expect(getCellValue(f.sheet, b1)).toBeNull();
    const mixed = captureCellFill(f.workbook, f.sheet.id, range(a1), range(a1, c1));
    expect(() => f.run(createCellFillCommand(f.workbook, mixed, "copy"))).toThrow();
    expect(getCellValue(f.sheet, b1)).toBeNull();
  });
  test("dimension permissions allow row formatting and undo while rejecting column formatting", () => {
    const f = fixture();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], formatRows: true }),
    );
    f.run(createResizeSheetDimensionCommand(f.sheet.id, "row", 0, 48));
    expect(f.sheet.rowHeights.get(0)).toBe(48);
    expect(() => f.run(createResizeSheetDimensionCommand(f.sheet.id, "column", 0, 120))).toThrow();
    undoWorkbookCommand(f.session);
    expect(f.sheet.rowHeights.get(0)).toBeUndefined();
    redoWorkbookCommand(f.session);
    expect(f.sheet.rowHeights.get(0)).toBe(48);
  });
  test("snapshot roundtrip preserves protection and validates ranges", () => {
    const f = fixture();
    f.run(createApplyCellStyleCommand(f.sheet.id, range(a1), { unlocked: true }));
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, {
        editableRanges: [{ name: "Input", range: range(c1) }],
        formatRows: true,
      }),
    );
    f.run(createSetWorkbookStructureProtectionCommand(true));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(43);
    const loaded = deserializeWorkbook(snapshot);
    expect(loaded.structureProtected).toBe(true);
    const sheet = getActiveSheet(loaded);
    expect(sheet.protection).toEqual(f.sheet.protection);
    expect(canEditCell(sheet, a1)).toBe(true);
    expect(canEditCell(sheet, b1)).toBe(false);
    expect(() =>
      createSetSheetProtectionCommand(sheet.id, true, {
        editableRanges: [{ name: "Bad", range: range({ row: -1, column: 0 }) }],
      }),
    ).toThrow();
    expect(() => deserializeWorkbook({ ...snapshot, version: 21 })).toThrow();
  });
  test("edit ranges move with row insert/delete/move and restore on undo", () => {
    const f = fixture();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, false, {
        editableRanges: [
          { name: "Input", range: range({ row: 2, column: 0 }, { row: 3, column: 1 }) },
        ],
      }),
    );
    const original = JSON.stringify(f.sheet.protection);
    f.run(createInsertSheetAxisCommand(f.sheet.id, "row", 1, 2));
    expect(f.sheet.protection?.editableRanges[0]?.range.start.row).toBe(4);
    undoWorkbookCommand(f.session);
    expect(JSON.stringify(f.sheet.protection)).toBe(original);
    f.run(createDeleteSheetAxisCommand(f.sheet.id, "row", 2, 2));
    expect(f.sheet.protection?.editableRanges).toEqual([]);
    undoWorkbookCommand(f.session);
    f.run(createMoveSheetAxisCommand(f.sheet.id, "row", 2, 2, 6));
    expect(f.sheet.protection?.editableRanges[0]?.range.start.row).not.toBe(2);
    undoWorkbookCommand(f.session);
    expect(JSON.stringify(f.sheet.protection)).toBe(original);
  });
  test("range permission combines overlapping exceptions with sparse unlocked cells", () => {
    const f = fixture();
    f.run(createApplyCellStyleCommand(f.sheet.id, range(c1), { unlocked: true }));
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, {
        editableRanges: [
          { name: "Left", range: range(a1, b1) },
          { name: "Overlap", range: range(b1) },
        ],
      }),
    );
    expect(canEditRange(f.sheet, range(a1, c1))).toBe(true);
    expect(canEditRange(f.sheet, range(a1, { row: 1, column: 2 }))).toBe(false);
  });
});
