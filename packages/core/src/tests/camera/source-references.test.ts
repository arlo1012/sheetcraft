// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { normalizeSheetDrawing, type SheetCameraDrawing } from "../../sheet-drawings.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createInsertCellsCommand,
  createDeleteCellsCommand,
  createMoveCellRangeCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  deserializeSheet,
  serializeSheet,
} from "../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Sheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(id: string, sheetId?: string): SheetCameraDrawing {
  return {
    id,
    kind: "camera",
    name: id,
    anchor: { row: 10, column: 10 },
    offsetX: 0,
    offsetY: 0,
    width: 400,
    height: 240,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    camera: {
      range: { start: { row: 2, column: 2 }, end: { row: 4, column: 4 } },
      gridLines: true,
      ...(sheetId === undefined ? {} : { sheetId }),
    },
  };
}

function camera(sheet: Pick<Sheet, "drawings">, id: string) {
  return sheet.drawings!.find((item) => item.id === id) as SheetCameraDrawing;
}

function fixture() {
  const session = createTestWorkbookSession();
  const source = getActiveSheet(session.workbook);
  source.name = "Source";
  const owner = createSheet("Owner", "owner"),
    other = createSheet("Other", "other");
  insertSheet(session.workbook, owner);
  insertSheet(session.workbook, other);
  source.drawings = [
    drawing("source-legacy"),
    drawing("source-self", source.id),
    drawing("source-external", other.id),
  ];
  owner.drawings = [
    drawing("owner-legacy"),
    drawing("owner-self", owner.id),
    drawing("owner-external", source.id),
    drawing("owner-other", other.id),
  ];
  setCellContent(source, { row: 2, column: 2 }, { kind: "literal", value: 10 });
  return { session, source, owner, other };
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

describe("camera source-sheet references", () => {
  test("preserves and clones an explicit source ID while leaving legacy local references implicit", () => {
    const original = drawing("camera", "source");
    const cloned = normalizeSheetDrawing(original) as SheetCameraDrawing;
    expect(cloned.camera.sheetId).toBe("source");
    expect(cloned.camera).not.toBe(original.camera);
    cloned.camera.range!.start.row = 3;
    expect(original.camera.range!.start.row).toBe(2);
    const legacy = normalizeSheetDrawing(drawing("legacy")) as SheetCameraDrawing;
    expect(Object.hasOwn(legacy.camera, "sheetId")).toBe(false);
  });

  test.each(["", "   ", null, 42])("rejects invalid camera source sheet ID %j", (sheetId) => {
    const original = drawing("camera");
    expect(() =>
      normalizeSheetDrawing({
        ...original,
        camera: { ...original.camera, sheetId },
      } as unknown as SheetCameraDrawing),
    ).toThrow();
  });

  test("uses snapshot 95 only for explicit camera source IDs and retains them in standalone sheets", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [drawing("legacy")];
    const legacy = serializeWorkbook(session.workbook);
    expect(legacy.version).toBeLessThan(95);
    expect(serializeWorkbook(deserializeWorkbook(legacy))).toEqual(legacy);

    sheet.drawings = [drawing("explicit", sheet.id)];
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(95);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 94 })).toThrow(/version 95/);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(camera(deserializeSheet(standalone), "explicit").camera.sheetId).toBe(sheet.id);
  });

  test.each(["row", "column"] as const)(
    "updates only cameras sourced from the inserted %s sheet, including a protected hidden owner",
    (axis) => {
      const f = fixture();
      f.owner.properties.hidden = true;
      f.owner.properties.protected = true;
      f.owner.protection = { editableRanges: [] };
      roundtrip(f.session, createInsertSheetAxisCommand(f.source.id, axis, 1, 2), () => {
        for (const item of [
          camera(f.source, "source-legacy"),
          camera(f.source, "source-self"),
          camera(f.owner, "owner-external"),
        ]) {
          expect(item.camera.range!.start[axis]).toBe(4);
          expect(item.camera.range!.end[axis]).toBe(6);
        }
        expect(camera(f.source, "source-external").camera.range).toEqual(
          drawing("original").camera.range,
        );
        for (const id of ["owner-legacy", "owner-self", "owner-other"])
          expect(camera(f.owner, id).camera.range).toEqual(drawing("original").camera.range);
        expect(camera(f.owner, "owner-external").anchor).toEqual({ row: 10, column: 10 });
      });
    },
  );

  test.each(["row", "column"] as const)(
    "keeps external source coordinates fixed when inserting %s on the camera owner",
    (axis) => {
      const f = fixture();
      roundtrip(f.session, createInsertSheetAxisCommand(f.owner.id, axis, 1, 2), () => {
        for (const id of ["owner-legacy", "owner-self"])
          expect(camera(f.owner, id).camera.range!.start[axis]).toBe(4);
        for (const id of ["owner-external", "owner-other"]) {
          expect(camera(f.owner, id).camera.range).toEqual(drawing("original").camera.range);
          expect(camera(f.owner, id).anchor[axis]).toBe(12);
        }
        expect(camera(f.source, "source-self").camera.range).toEqual(
          drawing("original").camera.range,
        );
      });
    },
  );

  test.each(["row", "column"] as const)(
    "invalidates a fully deleted source %s range and restores all owners in the same history entry",
    (axis) => {
      const f = fixture();
      roundtrip(f.session, createDeleteSheetAxisCommand(f.source.id, axis, 2, 3), () => {
        expect(camera(f.source, "source-self").camera.range).toBeNull();
        expect(camera(f.source, "source-legacy").camera.range).toBeNull();
        expect(camera(f.owner, "owner-external").camera).toEqual({
          sheetId: f.source.id,
          range: null,
          gridLines: true,
        });
        expect(camera(f.source, "source-external").camera.range).toEqual(
          drawing("original").camera.range,
        );
      });
    },
  );

  test.each(["row", "column"] as const)(
    "moves a complete source %s range across owners",
    (axis) => {
      const f = fixture();
      roundtrip(f.session, createMoveSheetAxisCommand(f.source.id, axis, 2, 3, 0), () => {
        expect(camera(f.source, "source-self").camera.range!.start[axis]).toBe(0);
        expect(camera(f.source, "source-self").camera.range!.end[axis]).toBe(2);
        expect(camera(f.owner, "owner-external").camera.range).toEqual(
          camera(f.source, "source-self").camera.range,
        );
      });
    },
  );

  test("updates external references on full-width cell insertion and invalidates partial shifts", () => {
    for (const partial of [false, true]) {
      const f = fixture();
      roundtrip(
        f.session,
        createInsertCellsCommand(
          f.source.id,
          {
            start: { row: 1, column: partial ? 3 : 2 },
            end: { row: 1, column: partial ? 3 : 4 },
          },
          "down",
        ),
        () => {
          expect(camera(f.owner, "owner-external").camera.range).toEqual(
            partial
              ? null
              : {
                  start: { row: 3, column: 2 },
                  end: { row: 5, column: 4 },
                },
          );
          expect(camera(f.source, "source-external").camera.range).toEqual(
            drawing("original").camera.range,
          );
        },
      );
    }
  });

  test("moves a whole cell source and invalidates a deleted source with atomic undo", () => {
    const f = fixture();
    roundtrip(
      f.session,
      createMoveCellRangeCommand(f.source.id, drawing("original").camera.range!, {
        row: 7,
        column: 7,
      }),
      () => {
        expect(camera(f.owner, "owner-external").camera.range).toEqual({
          start: { row: 7, column: 7 },
          end: { row: 9, column: 9 },
        });
      },
    );
    const g = fixture();
    roundtrip(
      g.session,
      createDeleteCellsCommand(g.source.id, drawing("original").camera.range!, "up"),
      () => {
        expect(camera(g.owner, "owner-external").camera.range).toBeNull();
      },
    );
  });

  test("turns deleted-sheet sources into REF ranges without changing their IDs and restores them on undo", () => {
    const f = fixture();
    roundtrip(f.session, createDeleteSheetCommand(f.session.workbook, f.source.id), () => {
      expect(f.session.workbook.sheets.has(f.source.id)).toBe(false);
      expect(camera(f.owner, "owner-external").camera).toEqual({
        sheetId: f.source.id,
        range: null,
        gridLines: true,
      });
      expect(camera(f.owner, "owner-legacy").camera.range).toEqual(
        drawing("original").camera.range,
      );
      expect(camera(f.owner, "owner-other").camera.sheetId).toBe(f.other.id);
    });
  });

  test("remaps copied self-sheet IDs while retaining external IDs and invalidated ranges", () => {
    const f = fixture();
    f.source.drawings!.push({
      ...drawing("broken-self", f.source.id),
      camera: { sheetId: f.source.id, range: null, gridLines: false },
    });
    const command = createDuplicateSheetCommand(f.session.workbook, f.source.id, {
      id: "copy",
      name: "Copy",
    });
    roundtrip(f.session, command, () => {
      const copied = f.session.workbook.sheets.get("copy")!;
      expect(camera(copied, "source-self").camera.sheetId).toBe("copy");
      expect(camera(copied, "source-legacy").camera.sheetId ?? copied.id).toBe("copy");
      expect(camera(copied, "source-external").camera.sheetId).toBe(f.other.id);
      expect(camera(copied, "broken-self").camera).toEqual({
        sheetId: "copy",
        range: null,
        gridLines: false,
      });
      expect(camera(copied, "source-self").camera.range).not.toBe(
        camera(f.source, "source-self").camera.range,
      );
      expect(camera(f.source, "source-self").camera.sheetId).toBe(f.source.id);
    });
  });
});
