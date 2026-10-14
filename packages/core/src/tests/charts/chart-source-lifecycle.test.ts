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
  createMoveSheetCommand,
} from "../../commands/sheets.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import {
  createSetSheetDrawingsCommand,
  createReplaceSheetDrawingCollectionsCommand,
} from "../../commands/drawings.js";
import type {
  AddSheetCommand,
  RestoreCellShiftCommand,
  RestoreFullSheetStateCommand,
  RestoreSheetAxisSliceCommand,
  WorkbookCommand,
} from "../../commands/contracts.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import { createSheet, getActiveSheet, setCellValue, type Sheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { sourceDrawing, vectorRange } from "./chart-source-fixture.js";

function fixture() {
  const session = createTestWorkbookSession(),
    source = getActiveSheet(session.workbook),
    owner = createSheet("Owner", "owner");
  session.workbook.sheets.set(owner.id, owner);
  const visible = createSheet("Visible", "visible");
  session.workbook.sheets.set(visible.id, visible);
  source.drawings = normalizeSheetDrawings([sourceDrawing(source.id)]);
  owner.drawings = normalizeSheetDrawings([sourceDrawing(source.id)]);
  owner.properties.hidden = true;
  owner.properties.protected = true;
  owner.protection = { editableRanges: [] };
  setCellValue(source, { row: 1, column: 1 }, 10);
  setCellValue(source, { row: 2, column: 1 }, 20);
  setCellValue(source, { row: 3, column: 1 }, 30);
  return { session, source, owner };
}
function chart(sheet: Sheet) {
  const drawing = sheet.drawings![0]!;
  if (drawing.kind !== "chart") throw Error("Expected chart");
  return drawing.chart;
}
function values(sheet: Sheet) {
  const values = chart(sheet).source!.series[0]!.values;
  if (values.kind !== "range") throw Error("Expected range");
  return values;
}
function roundtrip(session: WorkbookSession, command: WorkbookCommand, check: () => void) {
  const before = serializeWorkbook(session.workbook);
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect(session.history.undoStack).toHaveLength(1);
  check();
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}
function rejected(session: WorkbookSession, command: WorkbookCommand) {
  const before = serializeWorkbook(session.workbook),
    history = structuredClone(session.history);
  expect(() => executeWorkbookCommand(session, command)).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(session.history).toEqual(history);
}
describe("chart source cross-sheet structural lifecycle and guarded atomic history", () => {
  test.each(["row", "column"] as const)(
    "%s insertion/deletion updates self and protected hidden external owners exactly once",
    (axis) => {
      for (const operation of ["insert", "delete"] as const) {
        const f = fixture(),
          index = axis === "row" ? 2 : 1;
        roundtrip(
          f.session,
          operation === "insert"
            ? createInsertSheetAxisCommand(f.source.id, axis, index, 1)
            : createDeleteSheetAxisCommand(f.source.id, axis, index, 1),
          () => {
            expect(chart(f.owner).source).toEqual(chart(f.source).source);
            expect(
              chart(f.owner).source!.series.map(({ id, colorIndex }) => ({ id, colorIndex })),
            ).toEqual([
              { id: "apple", colorIndex: 4 },
              { id: "pear", colorIndex: 8 },
            ]);
            expect(chart(f.owner).elements).toEqual({
              legendPosition: "left",
              legendOverlay: false,
            });
            if (axis === "row")
              expect(values(f.owner).range).toEqual(
                vectorRange(1, 1, operation === "insert" ? 4 : 2),
              );
            else if (operation === "delete") expect(values(f.owner).range).toBeNull();
            else expect(values(f.owner).range).toEqual(vectorRange(2));
          },
        );
      }
    },
  );
  test("whole-range cell/axis moves preserve absolute sources; split movement tombstones and restores", () => {
    for (const operation of ["axis", "cells"] as const) {
      const f = fixture();
      roundtrip(
        f.session,
        operation === "axis"
          ? createMoveSheetAxisCommand(f.source.id, "row", 0, 4, 8)
          : createMoveCellRangeCommand(
              f.source.id,
              { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
              { row: 8, column: 4 },
            ),
        () => {
          expect(values(f.owner).range).toEqual(vectorRange(operation === "axis" ? 1 : 5, 9, 11));
          expect(chart(f.source).source).toEqual(chart(f.owner).source);
        },
      );
      const g = fixture();
      roundtrip(g.session, createMoveSheetAxisCommand(g.source.id, "row", 2, 1, 8), () => {
        expect(values(g.owner).range).toBeNull();
        expect(values(g.source).range).toBeNull();
      });
    }
  });
  test("cell shifts use range expansion/shrink; partial stripe tombstones without modifying colors", () => {
    for (const insert of [true, false]) {
      const f = fixture(),
        selected = { start: { row: 2, column: 0 }, end: { row: 2, column: 2 } };
      roundtrip(
        f.session,
        insert
          ? createInsertCellsCommand(f.source.id, selected, "down")
          : createDeleteCellsCommand(f.source.id, selected, "up"),
        () => {
          expect(values(f.owner).range).toEqual(vectorRange(1, 1, insert ? 4 : 2));
          expect(chart(f.source).source).toEqual(chart(f.owner).source);
        },
      );
    }
    const f = fixture();
    roundtrip(
      f.session,
      createInsertCellsCommand(
        f.source.id,
        { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
        "right",
      ),
      () => {
        expect(values(f.owner).range).toBeNull();
      },
    );
  });
  test("sheet duplication remaps only self dependencies; deletion tombstones allchart refs with atomic undo and reordering retains IDs", () => {
    const f = fixture();
    chart(f.source).source!.series[1]!.name = {
      kind: "cell",
      sheetId: f.owner.id,
      cell: { row: 1, column: 1 },
    };
    const duplicate = createDuplicateSheetCommand(f.session.workbook, f.source.id, {
        id: "copy",
        name: "Copy",
      }),
      copy = duplicate.sheet.drawings![0]! as SheetChartDrawing;
    expect(copy.chart.source!.categories).toMatchObject({ sheetId: "copy" });
    expect(copy.chart.source!.series[0]!.name).toMatchObject({ sheetId: "copy" });
    expect(copy.chart.source!.series[1]!.name).toMatchObject({ sheetId: f.owner.id });
    roundtrip(f.session, createDeleteSheetCommand(f.session.workbook, f.source.id), () => {
      expect(values(f.owner).range).toBeNull();
      expect(chart(f.owner).source!.categories).toEqual({
        kind: "range",
        sheetId: f.source.id,
        range: null,
      });
      expect(chart(f.owner).source!.series[0]!.name).toEqual({
        kind: "cell",
        sheetId: f.source.id,
        cell: null,
      });
    });
    const g = fixture();
    roundtrip(g.session, createMoveSheetCommand(g.session.workbook, g.source.id, 1), () => {
      expect(values(g.owner).sheetId).toBe(g.source.id);
    });
  });
  test("cross-sheet drawing copy/move retains absolute IDs and fully isolated source vectors", () => {
    const f = fixture();
    f.owner.properties.protected = false;
    const copied = normalizeSheetDrawings(f.source.drawings);
    copied[0]!.id = "copied";
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.owner.id, copied)),
    ).toBe(true);
    expect(chart(f.owner).source).toEqual(chart(f.source).source);
    expect(chart(f.owner).source).not.toBe(chart(f.source).source);
    f.session.history.undoStack = [];
    f.session.history.redoStack = [];
    const sourceState = normalizeSheetDrawings(f.source.drawings),
      ownerState = normalizeSheetDrawings(f.owner.drawings),
      moved = normalizeSheetDrawings(sourceState);
    moved[0]!.id = "moved";
    roundtrip(
      f.session,
      createReplaceSheetDrawingCollectionsCommand([
        { sheetId: f.source.id, expectedDrawings: sourceState, drawings: [] },
        { sheetId: f.owner.id, expectedDrawings: ownerState, drawings: moved },
      ]),
      () => {
        expect(values(f.owner).sheetId).toBe(f.source.id);
        expect(f.source.drawings).toEqual([]);
      },
    );
  });
  test("reference-only maintenance rejects malicious appearance/name/identity/color/literal changes on protected owners", () => {
    const f = fixture();
    for (const mutate of [
      (drawing: SheetChartDrawing) => {
        drawing.chart.title = "changed";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.colorIndex = 9;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.id = "changed";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.source!.series[0]!.name = { kind: "literal", text: "changed" };
      },
      (drawing: SheetChartDrawing) => {
        drawing.width += 10;
      },
    ]) {
      const drawings = normalizeSheetDrawings(f.owner.drawings),
        input = drawings[0]!;
      if (input.kind !== "chart") throw Error("Expected chart");
      mutate(input);
      expect(() =>
        prepareExternalDrawingCollections(f.session.workbook, f.source.id, [
          { sheetId: f.owner.id, drawings },
        ]),
      ).toThrow();
    }
    const changed = sourceDrawing(f.source.id);
    changed.chart.title = "changed";
    rejected(f.session, createSetSheetDrawingsCommand(f.owner.id, [changed]));
  });
  test("malicious structural inverse candidate rejects atomically before restoring any own/external data", () => {
    for (const kind of ["axis", "shift", "move", "sheet"] as const) {
      const f = fixture();
      const command =
        kind === "axis"
          ? createInsertSheetAxisCommand(f.source.id, "row", 2, 1)
          : kind === "shift"
            ? createInsertCellsCommand(
                f.source.id,
                { start: { row: 2, column: 0 }, end: { row: 2, column: 2 } },
                "down",
              )
            : kind === "move"
              ? createMoveSheetAxisCommand(f.source.id, "row", 0, 4, 8)
              : createDeleteSheetCommand(f.session.workbook, f.source.id);
      expect(executeWorkbookCommand(f.session, command)).toBe(true);
      const inverse = structuredClone(f.session.history.undoStack[0]!.command) as
        | RestoreSheetAxisSliceCommand
        | RestoreCellShiftCommand
        | RestoreFullSheetStateCommand
        | AddSheetCommand;
      const collections =
        "slice" in inverse
          ? inverse.slice.externalDrawingCollections
          : inverse.externalDrawingCollections;
      if (!collections) throw Error(`Missing external collections for ${kind}:${inverse.type}`);
      const drawing = collections[0]!.drawings[0]!;
      if (drawing.kind !== "chart") throw Error("Expected chart");
      drawing.chart.source!.series[0]!.colorIndex = 99;
      rejected(f.session, inverse);
    }
  });
});
