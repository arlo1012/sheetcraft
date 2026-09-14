import { describe, expect, test } from "vitest";
import {
  createApplyCellBordersCommand,
  createSetCellContentCommand,
} from "../../commands/index.js";
import {
  executeReplaceableWorkbookCommand,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../history.js";
import { createSheetSparseState, getActiveSheet, getCellValue } from "../../workbook.js";
import { createTestWorkbook, createTestWorkbookSession } from "../helpers.js";

describe("replaceable workbook commands", () => {
  test("keeps an initially unchanged fill replaceable without creating history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 1, column: 1 };

    const unchanged = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, address, null),
    );
    expect(unchanged).toMatchObject({ changed: false, accepted: true });
    expect(unchanged.token).toBeDefined();
    expect(session.history.undoStack).toHaveLength(0);

    const applied = executeReplaceableWorkbookCommand(
      session,
      unchanged.token,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "filled",
      }),
    );
    expect(applied).toMatchObject({ changed: true, accepted: true });
    expect(getCellValue(sheet, address)).toBe("filled");
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, address)).toBeNull();
  });

  test("returns to the original state without leaving an undo entry, then can replace again", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 1, column: 1 };
    const first = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "copy",
      }),
    );
    const original = executeReplaceableWorkbookCommand(
      session,
      first.token,
      createSetCellContentCommand(sheet.id, address, null),
    );

    expect(original).toMatchObject({ changed: true, accepted: true });
    expect(getCellValue(sheet, address)).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
    expect(undoWorkbookCommand(session)).toBe(false);

    const second = executeReplaceableWorkbookCommand(
      session,
      original.token,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "series",
      }),
    );
    expect(second).toMatchObject({ changed: true, accepted: true });
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, address)).toBeNull();
  });

  test("restores the previous replacement atomically when the next command throws", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 1, column: 1 };
    const first = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "copy",
      }),
    );
    const before = createSheetSparseState(sheet);

    expect(() =>
      executeReplaceableWorkbookCommand(session, first.token, {
        type: "unknownCommand",
      } as never),
    ).toThrow("Unknown workbook command.");
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, address)).toBeNull();
  });

  test("replaces formula and border changes while preserving exact neighboring state for undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 2, column: 2 }, end: { row: 2, column: 2 } };
    const neighbor = { row: 2, column: 3 };
    const before = createSheetSparseState(sheet);
    const formula = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, range.start, {
        kind: "formula",
        formula: { source: "=A1+$B$1" },
      }),
    );
    const bordered = executeReplaceableWorkbookCommand(
      session,
      formula.token,
      createApplyCellBordersCommand(sheet.id, range, {
        preset: "outer",
        border: { style: "double", color: "#113355" },
      }),
    );

    expect(bordered).toMatchObject({ changed: true, accepted: true });
    expect(createSheetSparseState(sheet)).not.toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(getCellValue(sheet, neighbor)).toBeNull();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("rejects stale tokens after regular commands, undo, and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 1, column: 1 };
    const first = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, address, {
        kind: "literal",
        value: "copy",
      }),
    );
    expect(
      executeWorkbookCommand(
        session,
        createSetCellContentCommand(
          sheet.id,
          { row: 2, column: 1 },
          { kind: "literal", value: "edit" },
        ),
      ),
    ).toBe(true);
    expect(
      executeReplaceableWorkbookCommand(
        session,
        first.token,
        createSetCellContentCommand(sheet.id, address, {
          kind: "literal",
          value: "series",
        }),
      ),
    ).toEqual({ changed: false, accepted: false });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(
      executeReplaceableWorkbookCommand(
        session,
        first.token,
        createSetCellContentCommand(sheet.id, address, {
          kind: "literal",
          value: "series",
        }),
      ),
    ).toEqual({ changed: false, accepted: false });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(
      executeReplaceableWorkbookCommand(
        session,
        first.token,
        createSetCellContentCommand(sheet.id, address, {
          kind: "literal",
          value: "series",
        }),
      ),
    ).toEqual({ changed: false, accepted: false });
  });

  test("invalidates a token when a workbook is replaced, even when its id is reused", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const token = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        {
          kind: "literal",
          value: "copy",
        },
      ),
    ).token;

    // Test helpers start their id factories at the same value, deliberately
    // exercising replacement with a distinct workbook that has the same id.
    session.workbook = createTestWorkbook();
    const replacementSheet = getActiveSheet(session.workbook);
    expect(
      executeReplaceableWorkbookCommand(
        session,
        token,
        createSetCellContentCommand(
          replacementSheet.id,
          { row: 1, column: 1 },
          {
            kind: "literal",
            value: "series",
          },
        ),
      ),
    ).toEqual({ changed: false, accepted: false });
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("scopes tokens to their history so a newly loaded history cannot accept an old token", () => {
    const first = createTestWorkbookSession();
    const firstSheet = getActiveSheet(first.workbook);
    const token = executeReplaceableWorkbookCommand(
      first,
      undefined,
      createSetCellContentCommand(
        firstSheet.id,
        { row: 1, column: 1 },
        {
          kind: "literal",
          value: "copy",
        },
      ),
    ).token;
    const second = createTestWorkbookSession();
    const secondSheet = getActiveSheet(second.workbook);
    executeReplaceableWorkbookCommand(
      second,
      undefined,
      createSetCellContentCommand(
        secondSheet.id,
        { row: 1, column: 1 },
        {
          kind: "literal",
          value: "copy",
        },
      ),
    );

    expect(
      executeReplaceableWorkbookCommand(
        second,
        token,
        createSetCellContentCommand(
          secondSheet.id,
          { row: 1, column: 1 },
          {
            kind: "literal",
            value: "series",
          },
        ),
      ),
    ).toEqual({ changed: false, accepted: false });
  });

  test("keeps redo after an unchanged fill until a fill mode actually changes cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const undoable = { row: 1, column: 1 };
    const target = { row: 2, column: 1 };
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, undoable, {
        kind: "literal",
        value: "edit",
      }),
    );
    undoWorkbookCommand(session);
    expect(session.history.redoStack).toHaveLength(1);

    const unchanged = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, target, null),
    );
    expect(unchanged.changed).toBe(false);
    expect(session.history.redoStack).toHaveLength(1);
    const stillOriginal = executeReplaceableWorkbookCommand(
      session,
      unchanged.token,
      createSetCellContentCommand(sheet.id, target, null),
    );
    expect(stillOriginal.changed).toBe(false);
    expect(session.history.redoStack).toHaveLength(1);

    executeReplaceableWorkbookCommand(
      session,
      stillOriginal.token,
      createSetCellContentCommand(sheet.id, target, {
        kind: "literal",
        value: "filled",
      }),
    );
    expect(session.history.redoStack).toHaveLength(0);
  });

  test("allows a new unchanged fill session after an earlier fill is still newest", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        {
          kind: "literal",
          value: "first",
        },
      ),
    );
    const second = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(sheet.id, { row: 2, column: 1 }, null),
    );
    expect(second).toMatchObject({ changed: false, accepted: true });

    const applied = executeReplaceableWorkbookCommand(
      session,
      second.token,
      createSetCellContentCommand(
        sheet.id,
        { row: 2, column: 1 },
        {
          kind: "literal",
          value: "second",
        },
      ),
    );
    expect(applied).toMatchObject({ changed: true, accepted: true });
    expect(session.history.undoStack).toHaveLength(2);
  });

  test("does not issue an unusable token when history capacity is zero", () => {
    const session = createTestWorkbookSession();
    session.history.maxEntries = 0;
    const sheet = getActiveSheet(session.workbook);
    const result = executeReplaceableWorkbookCommand(
      session,
      undefined,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        { kind: "literal", value: "filled" },
      ),
    );

    expect(result).toEqual({ changed: true, accepted: true });
    expect(session.history.undoStack).toHaveLength(0);
    expect(undoWorkbookCommand(session)).toBe(false);
  });
});
