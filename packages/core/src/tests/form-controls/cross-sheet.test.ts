// 未执行：待跨表窗体功能完成后统一验证。
import { describe, expect, test } from "vitest";
import type { FormControlType } from "../../form-controls.js";
import { getFormControlItems, getFormControlValue } from "../../form-controls.js";
import type { SheetControlDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  createWorkbookEvaluator,
} from "../../workbook.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createRenameSheetCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

function controlDrawing(type: FormControlType = "checkbox"): SheetControlDrawing {
  return {
    id: "control",
    kind: "control",
    name: "Choice",
    anchor: { row: 1, column: 1 },
    offsetX: 0,
    offsetY: 0,
    width: 220,
    height: 80,
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
    control: {
      type,
      label: "Choose",
      linkedCell: { row: 0, column: 0 },
      source: null,
      items: ["One", "Two"],
      min: 0,
      max: 10,
      step: 2,
      optionValue: 3,
      resetValue: null,
    },
  };
}

function fixture() {
  const session = createTestWorkbookSession();
  const workbook = session.workbook;
  const host = getActiveSheet(workbook),
    source = createSheet("Choices", "choices"),
    linked = createSheet("Results", "results");
  insertSheet(workbook, source);
  insertSheet(workbook, linked);
  const drawing = controlDrawing("list");
  drawing.control = {
    ...drawing.control,
    linkedSheetId: linked.id,
    linkedCell: { row: 2, column: 1 },
    sourceSheetId: source.id,
    source: { start: { row: 1, column: 2 }, end: { row: 2, column: 2 } },
    items: ["Do not fall back"],
  };
  host.drawings = [drawing];
  setCellContent(source, { row: 1, column: 2 }, { kind: "formula", formula: { source: "=1+1" } });
  setCellContent(source, { row: 2, column: 2 }, { kind: "literal", value: "Second" });
  setCellContent(linked, { row: 2, column: 1 }, { kind: "literal", value: 2 });
  const current = () => (host.drawings![0] as SheetControlDrawing).control;
  const evaluator = () => createWorkbookEvaluator(workbook, host.id);
  return { session, workbook, host, source, linked, current, evaluator };
}

describe("cross-sheet form control references", () => {
  test("evaluates the linked cell and item source on their independent target sheets after rename", () => {
    const f = fixture();
    expect(getFormControlItems(f.current(), f.evaluator())).toEqual(["2", "Second"]);
    expect(getFormControlValue(f.current(), f.evaluator())).toBe(2);
    executeWorkbookCommand(f.session, createRenameSheetCommand(f.source.id, "Renamed Choices"));
    expect(f.current().sourceSheetId).toBe(f.source.id);
    expect(getFormControlItems(f.current(), f.evaluator())).toEqual(["2", "Second"]);
  });

  test("inserting rows on a referenced sheet maps only its reference and undo restores it", () => {
    const f = fixture();
    const before = structuredClone(f.current());
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.linked.id, "row", 1));
    expect(f.current().linkedCell).toEqual({ row: 3, column: 1 });
    expect(f.current().source).toEqual(before.source);
    expect(getFormControlValue(f.current(), f.evaluator())).toBe(2);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 1));
    expect(f.current().source).toEqual({
      start: { row: 1, column: 3 },
      end: { row: 2, column: 3 },
    });
    expect(f.current().linkedCell).toEqual(before.linkedCell);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.host.id, "row", 0));
    expect(f.current()).toEqual(before);
  });

  test("deleting an externally linked row retains its sheet ID and never becomes a local control", () => {
    const f = fixture();
    const before = structuredClone(f.current());
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.linked.id, "row", 2));
    expect(f.current().linkedCell).toBeNull();
    expect(f.current().linkedSheetId).toBe(f.linked.id);
    expect(f.current().localValue).toBeUndefined();
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
  });

  test("deleting the full external source range preserves its identity without falling back to manual items", () => {
    const f = fixture();
    const before = structuredClone(f.current());
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "row", 1, 2));
    expect(f.current().sourceSheetId).toBe(f.source.id);
    expect(f.current().source).toBeNull();
    expect(getFormControlItems(f.current(), f.evaluator())).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
    expect(getFormControlItems(f.current(), f.evaluator())).toEqual(["2", "Second"]);
  });

  test.each(["source", "linked"] as const)(
    "deleting the %s sheet retains a broken external reference and undo restores it",
    (kind) => {
      const f = fixture();
      const before = structuredClone(f.current());
      executeWorkbookCommand(f.session, createDeleteSheetCommand(f.workbook, f[kind].id));
      if (kind === "source") {
        expect(f.current().sourceSheetId).toBe(f.source.id);
        expect(f.current().source).toBeNull();
        expect(getFormControlItems(f.current(), f.evaluator())).toEqual([]);
        expect(f.current().linkedCell).toEqual(before.linkedCell);
      } else {
        expect(f.current().linkedSheetId).toBe(f.linked.id);
        expect(f.current().linkedCell).toBeNull();
        expect(getFormControlValue(f.current(), f.evaluator())).toBeNull();
        expect(f.current().source).toEqual(before.source);
      }
      const broken = serializeWorkbook(f.workbook);
      expect(serializeWorkbook(deserializeWorkbook(broken))).toEqual(broken);
      undoWorkbookCommand(f.session);
      expect(f.current()).toEqual(before);
      expect(getFormControlItems(f.current(), f.evaluator())).toEqual(["2", "Second"]);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(broken);
    },
  );

  test("duplicating the host keeps external references while local references remain local", () => {
    const f = fixture();
    const local = controlDrawing("checkbox");
    local.id = "local";
    f.host.drawings!.push(local);
    executeWorkbookCommand(
      f.session,
      createDuplicateSheetCommand(f.workbook, f.host.id, { id: "copy", name: "Copy" }),
    );
    const copy = f.workbook.sheets.get("copy")!;
    const external = copy.drawings![0] as SheetControlDrawing;
    const copiedLocal = copy.drawings![1] as SheetControlDrawing;
    expect(external.control.linkedSheetId).toBe(f.linked.id);
    expect(external.control.sourceSheetId).toBe(f.source.id);
    expect(copiedLocal.control.linkedSheetId).toBeUndefined();
    expect(copiedLocal.control.linkedCell).toEqual(local.control.linkedCell);
    expect(external.control).not.toBe(f.current());
    undoWorkbookCommand(f.session);
    expect(f.workbook.sheets.has("copy")).toBe(false);
  });

  test("cross-sheet IDs require V110 and are rejected in V109", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(110);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 109 })).toThrow();
  });
});
