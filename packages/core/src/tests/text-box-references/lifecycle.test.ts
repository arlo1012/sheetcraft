import { describe, expect, test } from "vitest";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
} from "../../commands/structure.js";
import { createInsertCellsCommand, createDeleteCellsCommand } from "../../commands/cell-shift.js";
import { createMoveCellRangeCommand } from "../../commands/values.js";
import {
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createRenameSheetCommand,
} from "../../commands/sheets.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { normalizeSheetDrawings, type SheetDrawing } from "../../sheet-drawings.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  setCellValue,
  setRowHeight,
  setColumnWidth,
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
  type Sheet,
} from "../../workbook.js";
import type {
  WorkbookCommand,
  RestoreFullSheetStateCommand,
  RestoreCellShiftCommand,
  RestoreSheetAxisSliceCommand,
} from "../../commands/contracts.js";
import { createBatchDeleteSheetAxesCommand } from "../../commands/batch.js";
import { createCalculatedColumnPlanningWorkbook } from "../../table-calculated-columns.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import { createTestWorkbookSession } from "../helpers.js";
import { linkedBox, framedBox, ownedBox, target } from "./fixtures.js";

function fixture(drawings: (sheetId: string) => SheetDrawing[] = (id) => [ownedBox(id)]) {
  const session = createTestWorkbookSession(),
    source = getActiveSheet(session.workbook),
    owner = createSheet("Owner", "owner");
  session.workbook.sheets.set(owner.id, owner);
  source.drawings = normalizeSheetDrawings([{ ...framedBox(source.id), id: "local" }]);
  owner.drawings = normalizeSheetDrawings(drawings(source.id));
  setCellValue(source, { row: 4, column: 2 }, "source");
  setCellValue(source, { row: 8, column: 7 }, "retained");
  setRowHeight(source, 4, 41);
  setColumnWidth(source, 2, 127);
  owner.properties.protected = true;
  owner.protection = { editableRanges: [] };
  return { session, source, owner };
}
function reference(sheet: Sheet, index = 0) {
  return target(sheet.drawings![index]!).textReference!;
}
function roundtrip(session: WorkbookSession, command: WorkbookCommand, check: () => void) {
  const before = serializeWorkbook(session.workbook),
    revision = session.history.revision;
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect(session.history.undoStack).toHaveLength(1);
  expect(session.history.revision).toBe(revision + 1);
  check();
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}
function expectAtomicRejection(session: WorkbookSession, command: WorkbookCommand) {
  const before = serializeWorkbook(session.workbook),
    history = structuredClone(session.history);
  const cells = [...session.workbook.sheets.values()].map((sheet) => ({
    id: sheet.id,
    cells: [...sheet.cells],
    rows: [...sheet.rowHeights],
    columns: [...sheet.columnWidths],
    drawings: structuredClone(sheet.drawings),
  }));
  expect(() => executeWorkbookCommand(session, command)).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history).toEqual(history);
  expect(
    [...session.workbook.sheets.values()].map((sheet) => ({
      id: sheet.id,
      cells: [...sheet.cells],
      rows: [...sheet.rowHeights],
      columns: [...sheet.columnWidths],
      drawings: structuredClone(sheet.drawings),
    })),
  ).toEqual(cells);
}

describe("TextBox source lifecycle and atomic lossless history", () => {
  test.each(["row", "column"] as const)(
    "%s insert/delete maps protected hidden external owners and self owners once",
    (axis) => {
      for (const operation of ["insert", "delete"] as const) {
        const { session, source, owner } = fixture();
        const beforeOwner = structuredClone(owner.drawings);
        const index = axis === "row" ? 3 : 1;
        roundtrip(
          session,
          operation === "insert"
            ? createInsertSheetAxisCommand(source.id, axis, index, 1)
            : createDeleteSheetAxisCommand(source.id, axis, index, 1),
          () => {
            const cell = { row: 4, column: 2 };
            cell[axis] += operation === "insert" ? 1 : -1;
            expect(reference(source).cell).toEqual(cell);
            expect(reference(owner).cell).toEqual(cell);
            const afterOwner = structuredClone(owner.drawings!);
            target(afterOwner[0]!).textReference = target(beforeOwner![0]!).textReference;
            expect(afterOwner).toEqual(beforeOwner);
          },
        );
      }
    },
  );

  test("deleted single cells become permanent tombstones and undo restores exact source", () => {
    const { session, source, owner } = fixture();
    roundtrip(session, createDeleteSheetAxisCommand(source.id, "row", 4, 1), () => {
      expect(reference(source).cell).toBeNull();
      expect(reference(owner).cell).toBeNull();
      expect(reference(owner).sheetId).toBe(source.id);
    });
    const broken = structuredClone(reference(owner));
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 0, 1)),
    ).toBe(true);
    expect(reference(owner)).toEqual(broken);
  });

  test.each(["right", "down", "left", "up"] as const)(
    "partial cell shift %s maps matching cells without moving fixed owners",
    (direction) => {
      const { session, source, owner } = fixture();
      const range = { start: { row: 3, column: 1 }, end: { row: 3, column: 1 } };
      if (direction === "right" || direction === "left") range.start.row = range.end.row = 4;
      else range.start.column = range.end.column = 2;
      const expected = { row: 4, column: 2 };
      if (direction === "right") expected.column++;
      else if (direction === "left") expected.column--;
      else if (direction === "down") expected.row++;
      else expected.row--;
      roundtrip(
        session,
        direction === "right" || direction === "down"
          ? createInsertCellsCommand(source.id, range, direction)
          : createDeleteCellsCommand(source.id, range, direction),
        () => {
          expect(reference(source).cell).toEqual(expected);
          expect(reference(owner).cell).toEqual(expected);
        },
      );
    },
  );

  test("cell deletion tombstones while unrelated-sheet and prebroken references survive exactly", () => {
    const { session, source, owner } = fixture((id) => [
      ownedBox(id),
      { ...linkedBox("missing"), id: "other" },
      { ...linkedBox(id, null), id: "broken" },
    ]);
    roundtrip(
      session,
      createDeleteCellsCommand(
        source.id,
        { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
        "left",
      ),
      () => {
        expect(reference(source).cell).toBeNull();
        expect(reference(owner).cell).toBeNull();
        expect(reference(owner, 1)).toEqual({ sheetId: "missing", cell: { row: 4, column: 2 } });
        expect(reference(owner, 2)).toEqual({ sheetId: source.id, cell: null });
      },
    );
  });

  test.each(["row", "column"] as const)(
    "whole %s reordering maps targets and full-state reciprocal undo",
    (axis) => {
      const { session, source, owner } = fixture();
      const index = axis === "row" ? 4 : 2,
        toIndex = axis === "row" ? 7 : 5;
      roundtrip(session, createMoveSheetAxisCommand(source.id, axis, index, 1, toIndex), () => {
        const expected = { row: 4, column: 2 };
        expected[axis] = toIndex;
        expect(reference(source).cell).toEqual(expected);
        expect(reference(owner).cell).toEqual(expected);
      });
    },
  );

  test("cut/move follows source cells across overlaps, without offsetting the TextBox owner's frame", () => {
    const { session, source, owner } = fixture();
    const frame = structuredClone(target(source.drawings![0]!));
    roundtrip(
      session,
      createMoveCellRangeCommand(
        source.id,
        { start: { row: 4, column: 2 }, end: { row: 5, column: 3 } },
        { row: 5, column: 3 },
      ),
      () => {
        expect(reference(source).cell).toEqual({ row: 5, column: 3 });
        expect(reference(owner).cell).toEqual({ row: 5, column: 3 });
        const actual = structuredClone(target(source.drawings![0]!));
        actual.textReference = frame.textReference;
        expect(actual).toEqual(frame);
      },
    );
  });

  test("an otherwise empty source still produces one history record for changed external references", () => {
    const { session, source, owner } = fixture();
    source.cells.clear();
    source.rowHeights.clear();
    source.columnWidths.clear();
    source.drawings = [];
    roundtrip(
      session,
      createMoveCellRangeCommand(
        source.id,
        { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
        { row: 8, column: 5 },
      ),
      () => {
        expect(reference(owner).cell).toEqual({ row: 8, column: 5 });
      },
    );
  });

  test("owner movement and clipboard clone preserve absolute source links with detached objects", () => {
    const { session, source, owner } = fixture();
    owner.properties.protected = false;
    const before = structuredClone(reference(owner));
    roundtrip(session, createInsertSheetAxisCommand(owner.id, "row", 0, 2), () => {
      expect(reference(owner)).toEqual(before);
      expect(reference(source).cell).toEqual({ row: 4, column: 2 });
    });
    let id = 0;
    const cloned = cloneShapeRootsForClipboard(owner.drawings!, {
      createId: () => `clone-${++id}`,
    });
    expect(target(cloned[0]!).textReference).toEqual(before);
    expect(target(cloned[0]!).textReference).not.toBe(reference(owner));
    expect(target(cloned[0]!).textReference!.cell).not.toBe(reference(owner).cell);
  });

  test("sheet duplicate remaps only self targets, including owned and null links; delete/rename preserve source IDs", () => {
    const { session, source, owner } = fixture();
    source.drawings = normalizeSheetDrawings([
      ownedBox(source.id),
      { ...linkedBox("another"), id: "another" },
      { ...linkedBox(source.id, null), id: "broken" },
    ]);
    const duplicate = createDuplicateSheetCommand(session.workbook, source.id, {
      id: "copy",
      name: "Copy",
    });
    const copied = duplicate.sheet.drawings!;
    expect(target(copied[0]!).textReference!.sheetId).toBe("copy");
    expect(target(copied[1]!).textReference!.sheetId).toBe("another");
    expect(target(copied[2]!).textReference).toEqual({ sheetId: "copy", cell: null });
    expect(target(copied[0]!).textReference).not.toBe(reference(source));
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, createRenameSheetCommand(source.id, "Renamed"))).toBe(
      true,
    );
    expect(reference(owner).sheetId).toBe(source.id);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    session.history.undoStack = [];
    session.history.redoStack = [];
    roundtrip(session, createDeleteSheetCommand(session.workbook, source.id), () => {
      expect(session.workbook.sheets.has(source.id)).toBe(false);
      expect(reference(owner)).toEqual({ sheetId: source.id, cell: { row: 4, column: 2 } });
    });
  });

  test("tail insertion tombstones bounded source addresses and undo recovers exact cell", () => {
    for (const axis of ["row", "column"] as const) {
      const { session, source, owner } = fixture();
      const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
      reference(source).cell![axis] = maximum - 1;
      reference(owner).cell![axis] = maximum - 1;
      roundtrip(session, createInsertSheetAxisCommand(source.id, axis, maximum - 1, 1), () => {
        expect(reference(source).cell).toBeNull();
        expect(reference(owner).cell).toBeNull();
      });
    }
  });

  test("explicit owner bind/unlink remains blocked by normal object protection", () => {
    const { session, source, owner } = fixture();
    const changed = normalizeSheetDrawings(owner.drawings);
    target(changed[0]!).textReference!.cell = { row: 7, column: 8 };
    expectAtomicRejection(session, createSetSheetDrawingsCommand(owner.id, changed));
    const removed = normalizeSheetDrawings(owner.drawings);
    delete target(removed[0]!).textReference;
    target(removed[0]!).text = "unlinked";
    expectAtomicRejection(session, createSetSheetDrawingsCommand(owner.id, removed));
    expect(reference(owner).sheetId).toBe(source.id);
  });

  test("external restore candidates cannot smuggle owner edits, retargeting, unrelated links or accessors", () => {
    const { session, source, owner } = fixture((id) => [
      ownedBox(id),
      { ...linkedBox("another"), id: "other" },
    ]);
    for (const mutate of [
      (values: SheetDrawing[]) => {
        target(values[0]!).fontSize++;
      },
      (values: SheetDrawing[]) => {
        target(values[0]!).textReference!.sheetId = "another";
      },
      (values: SheetDrawing[]) => {
        target(values[1]!).textReference!.cell = null;
      },
      (values: SheetDrawing[]) => {
        delete target(values[0]!).textReference;
      },
    ]) {
      const values = normalizeSheetDrawings(owner.drawings);
      mutate(values);
      expect(() =>
        prepareExternalDrawingCollections(session.workbook, source.id, [
          { sheetId: owner.id, drawings: values },
        ]),
      ).toThrow();
    }
    const valid = prepareExternalDrawingCollections(session.workbook, source.id, [
      { sheetId: owner.id, drawings: normalizeSheetDrawings(owner.drawings) },
    ]);
    expect(valid.next).toEqual([]);
    let hits = 0;
    const accessor = Object.defineProperty({ sheetId: owner.id }, "drawings", {
      get() {
        hits++;
        throw Error("read");
      },
    });
    expect(() =>
      prepareExternalDrawingCollections(session.workbook, source.id, [
        accessor as { sheetId: string; drawings: SheetDrawing[] },
      ]),
    ).toThrow();
    expect(hits).toBe(0);
  });

  test("malicious inverses fail before cells/dimensions/owners/history mutate in all restore forms", () => {
    for (const kind of ["axis", "shift", "move"] as const) {
      const { session, source } = fixture();
      const forward =
        kind === "axis"
          ? createInsertSheetAxisCommand(source.id, "row", 3, 1)
          : kind === "shift"
            ? createInsertCellsCommand(
                source.id,
                { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
                "down",
              )
            : createMoveCellRangeCommand(
                source.id,
                { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
                { row: 7, column: 3 },
              );
      expect(executeWorkbookCommand(session, forward)).toBe(true);
      const inverse = structuredClone(session.history.undoStack[0]!.command) as
        | RestoreSheetAxisSliceCommand
        | RestoreCellShiftCommand
        | RestoreFullSheetStateCommand;
      const external =
        "slice" in inverse
          ? inverse.slice.externalDrawingCollections!
          : inverse.externalDrawingCollections!;
      target(external[0]!.drawings[0]!).fontSize++;
      expectAtomicRejection(session, inverse);
      session.history.undoStack[0]!.command = inverse;
      const before = serializeWorkbook(session.workbook),
        history = structuredClone(session.history);
      expect(() => undoWorkbookCommand(session)).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history).toEqual(history);
    }
  });

  test("new inverse collection fields reject top-level accessors, inheritance and null/undefined without reads", () => {
    for (const kind of ["axis", "shift", "move"] as const) {
      const { session, source } = fixture();
      const forward =
        kind === "axis"
          ? createInsertSheetAxisCommand(source.id, "row", 3, 1)
          : kind === "shift"
            ? createInsertCellsCommand(
                source.id,
                { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
                "down",
              )
            : createMoveCellRangeCommand(
                source.id,
                { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
                { row: 7, column: 3 },
              );
      expect(executeWorkbookCommand(session, forward)).toBe(true);
      const original = session.history.undoStack[0]!.command as
        | RestoreSheetAxisSliceCommand
        | RestoreCellShiftCommand
        | RestoreFullSheetStateCommand;
      for (const invalid of [undefined, null]) {
        const inverse = structuredClone(original),
          owner = "slice" in inverse ? inverse.slice : inverse;
        Object.defineProperty(owner, "externalDrawingCollections", {
          value: invalid,
          enumerable: true,
        });
        expectAtomicRejection(session, inverse);
      }
      let hits = 0;
      const inverse = structuredClone(original),
        owner = "slice" in inverse ? inverse.slice : inverse;
      Object.defineProperty(owner, "externalDrawingCollections", {
        get() {
          hits++;
          throw Error("read");
        },
        enumerable: true,
      });
      expectAtomicRejection(session, inverse);
      const inherited = structuredClone(original),
        inheritedOwner = "slice" in inherited ? inherited.slice : inherited;
      delete inheritedOwner.externalDrawingCollections;
      Object.setPrototypeOf(
        inheritedOwner,
        Object.defineProperty({}, "externalDrawingCollections", {
          get() {
            hits++;
            throw Error("read");
          },
        }),
      );
      expectAtomicRejection(session, inherited);
      expect(hits).toBe(0);
    }
  });

  test("external axis and cell-shift inverses cannot restore tombstones to unrelated source cells", () => {
    for (const kind of ["axis", "shift"] as const) {
      const { session, source } = fixture();
      const forward =
        kind === "axis"
          ? createDeleteSheetAxisCommand(source.id, "row", 4, 1)
          : createDeleteCellsCommand(
              source.id,
              { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
              "up",
            );
      expect(executeWorkbookCommand(session, forward)).toBe(true);
      const inverse = structuredClone(session.history.undoStack[0]!.command) as
        | RestoreSheetAxisSliceCommand
        | RestoreCellShiftCommand;
      const external =
        "slice" in inverse
          ? inverse.slice.externalDrawingCollections!
          : inverse.externalDrawingCollections!;
      target(external[0]!.drawings[0]!).textReference!.cell = { row: 99, column: 99 };
      expectAtomicRejection(session, inverse);
    }
  });

  test("full-state movement metadata bounds and association reject arbitrary external reference restoration", () => {
    for (const kind of ["axis", "range"] as const) {
      const { session, source } = fixture();
      const forward =
        kind === "axis"
          ? createMoveSheetAxisCommand(source.id, "row", 4, 1, 7)
          : createMoveCellRangeCommand(
              source.id,
              { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } },
              { row: 7, column: 3 },
            );
      expect(executeWorkbookCommand(session, forward)).toBe(true);
      const original = session.history.undoStack[0]!.command as RestoreFullSheetStateCommand;
      expect(original.textReferenceTransform!.direction).toBe("restore");
      const arbitrary = structuredClone(original);
      target(arbitrary.externalDrawingCollections![0]!.drawings[0]!).textReference!.cell = {
        row: 99,
        column: 99,
      };
      expectAtomicRejection(session, arbitrary);
      const legacy = structuredClone(original);
      delete legacy.textReferenceTransform;
      expectAtomicRejection(session, legacy);
      for (const invalid of [
        { ...original.textReferenceTransform!, sheetId: "another" },
        { ...original.textReferenceTransform!, direction: "unknown" },
        { ...original.textReferenceTransform!, extra: 1 },
        {
          ...original.textReferenceTransform!,
          operation: { type: "moveSheetAxis", axis: "row", index: 0, count: Infinity, toIndex: 1 },
        },
        {
          ...original.textReferenceTransform!,
          operation: {
            type: "moveCellRange",
            source: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
            destination: { row: MAX_SHEET_ROWS - 1, column: 0 },
          },
        },
        undefined,
      ])
        expectAtomicRejection(session, {
          ...structuredClone(original),
          textReferenceTransform: invalid,
        } as RestoreFullSheetStateCommand);
      let hits = 0;
      const accessor = Object.defineProperty(
        structuredClone(original.textReferenceTransform!),
        "operation",
        {
          get() {
            hits++;
            throw Error("read");
          },
        },
      );
      expectAtomicRejection(session, {
        ...structuredClone(original),
        textReferenceTransform: accessor,
      });
      expect(hits).toBe(0);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(
        (session.history.redoStack[0]!.command as RestoreFullSheetStateCommand)
          .textReferenceTransform!.direction,
      ).toBe("reapply");
      expect(redoWorkbookCommand(session)).toBe(true);
    }
  });

  test("referenced batch deletes preflight a deeply isolated workbook before any live assignment", () => {
    const { session, source, owner } = fixture();
    const before = serializeWorkbook(session.workbook);
    const planning = createCalculatedColumnPlanningWorkbook(session.workbook);
    const copy = planning.sheets.get(owner.id)!;
    expect(copy.drawings).not.toBe(owner.drawings);
    expect(target(copy.drawings![0]!).textReference).not.toBe(reference(owner));
    reference(copy).cell!.row = 99;
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    const sourceDrawings = source.drawings,
      ownerDrawings = owner.drawings;
    let liveAssignments = 0;
    for (const sheet of [source, owner]) {
      let current = sheet.drawings;
      Object.defineProperty(sheet, "drawings", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value: SheetDrawing[] | undefined) {
          liveAssignments++;
          current = value;
        },
      });
    }
    const batch = createBatchDeleteSheetAxesCommand([
      createDeleteSheetAxisCommand(source.id, "row", 3, 1),
      createDeleteSheetAxisCommand(source.id, "row", MAX_SHEET_ROWS, 1),
    ]);
    expectAtomicRejection(session, batch);
    expect(liveAssignments).toBe(0);
    expect(source.drawings).toBe(sourceDrawings);
    expect(owner.drawings).toBe(ownerDrawings);
  });

  test("referenced disjoint batch deletion stays one lossless history entry", () => {
    const { session, source, owner } = fixture();
    roundtrip(
      session,
      createBatchDeleteSheetAxesCommand([
        createDeleteSheetAxisCommand(source.id, "row", 7, 1),
        createDeleteSheetAxisCommand(source.id, "row", 3, 1),
      ]),
      () => {
        expect(reference(source).cell).toEqual({ row: 3, column: 2 });
        expect(reference(owner).cell).toEqual({ row: 3, column: 2 });
      },
    );
  });

  test("overflow and final-forest failure preserve every own/external field and history", () => {
    const { session, source } = fixture();
    setCellValue(source, { row: MAX_SHEET_ROWS - 1, column: 2 }, "boundary");
    expectAtomicRejection(
      session,
      createInsertCellsCommand(
        source.id,
        { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
        "down",
      ),
    );
    const { session: broken, source: targetSheet } = fixture();
    const current = target(targetSheet.drawings![0]!);
    if (!("shapeFrame" in current)) throw Error("Expected framed box");
    current.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
      end: { row: { index: 650, offset: 0 }, column: { index: 3, offset: 0 } },
    };
    expectAtomicRejection(broken, createInsertSheetAxisCommand(targetSheet.id, "row", 3, 40));
  });
});
