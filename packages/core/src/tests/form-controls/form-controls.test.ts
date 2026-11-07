// 未执行：按用户约定仅编写回归，待插入与打印功能完成后统一运行。
import { describe, expect, test } from "vitest";
import {
  normalizeFormControl,
  getFormControlItems,
  resolveFormControlValue,
  type SheetFormControl,
} from "../../form-controls.js";
import {
  mapDrawingSource,
  normalizeSheetDrawing,
  type SheetControlDrawing,
} from "../../sheet-drawings.js";
import { getActiveSheet, createSheetEvaluator, setCellContent } from "../../workbook.js";
import {
  createSetSheetDrawingsCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createInsertCellsCommand,
  createDeleteCellsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

function control(): SheetFormControl {
  return {
    type: "combo",
    label: "Choose",
    linkedCell: { row: 2, column: 2 },
    source: { start: { row: 2, column: 2 }, end: { row: 4, column: 2 } },
    items: ["One", "Two"],
    min: 0,
    max: 10,
    step: 2,
    optionValue: 3,
    resetValue: null,
  };
}
function drawing(): SheetControlDrawing {
  return {
    id: "control",
    kind: "control",
    name: "Choice",
    anchor: { row: 10, column: 10 },
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
    control: control(),
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()]));
  const current = () => (sheet.drawings![0] as SheetControlDrawing).control;
  return { session, sheet, current };
}
describe("form controls", () => {
  test("invalidates a mapped item source beyond the control limit", () => {
    const mapped = mapDrawingSource(drawing(), (range) =>
      range.start.row === range.end.row
        ? range
        : { start: { row: 0, column: 2 }, end: { row: 1000, column: 2 } },
    ) as SheetControlDrawing;
    expect(mapped.control.source).toBeNull();
    expect(mapped.control.linkedCell).toEqual(control().linkedCell);
    expect(() => normalizeSheetDrawing(mapped)).not.toThrow();
  });
  test.each([
    { type: "other" },
    { label: "a".repeat(1001) },
    { linkedCell: { row: -1, column: 0 } },
    { source: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } } },
    { source: { start: { row: 0, column: 0 }, end: { row: 1000, column: 0 } } },
    { items: [1] },
    { items: Array(1001).fill("a") },
    { min: 11 },
    { step: 0 },
    { max: Infinity },
    { resetValue: {} },
    { resetValue: NaN },
  ])("rejects malformed control fields", (patch) => {
    expect(() => normalizeFormControl({ ...control(), ...patch } as SheetFormControl)).toThrow();
  });
  test.each([
    "checkbox",
    "radio",
    "combo",
    "list",
    "spinner",
    "scrollbar",
    "button",
    "label",
    "group",
  ] as const)("accepts %s", (type) => {
    expect(normalizeFormControl({ ...control(), type }).type).toBe(type);
  });
  test.each([
    { type: "checkbox", localValue: false },
    { type: "radio", localValue: 3 },
    { type: "combo", localValue: 2 },
    { type: "list", localValue: 1 },
    { type: "spinner", localValue: 0 },
    { type: "scrollbar", localValue: 4 },
  ] as const)(
    "retains unlinked $type local state including false and zero",
    ({ type, localValue }) => {
      const original: SheetFormControl = { ...control(), type, linkedCell: null, localValue };
      expect(normalizeFormControl(original).localValue).toBe(localValue);
      expect(original.localValue).toBe(localValue);
    },
  );

  test.each(["button", "label", "group"] as const)(
    "drops inapplicable local state from %s",
    (type) => {
      const normalized = normalizeFormControl({
        ...control(),
        type,
        linkedCell: null,
        localValue: 2,
      });
      expect(normalized.localValue).toBeUndefined();
    },
  );

  test("a linked control takes its value from the cell and discards stale local state", () => {
    const normalized = normalizeFormControl({ ...control(), localValue: 2 });
    expect(normalized.linkedCell).toEqual(control().linkedCell);
    expect(normalized.localValue).toBeUndefined();
  });

  test.each(["text", null, NaN, Infinity, {}, []])(
    "rejects invalid unlinked local state %j",
    (localValue) => {
      expect(() =>
        normalizeFormControl({
          ...control(),
          linkedCell: null,
          localValue,
        } as SheetFormControl),
      ).toThrow();
    },
  );

  test.each([false, 0, 2] as const)(
    "round trips an unlinked control local value %s in V108 and rejects it in V107",
    (localValue) => {
      const f = fixture();
      const unlinked = drawing();
      unlinked.control = {
        ...unlinked.control,
        type: typeof localValue === "boolean" ? "checkbox" : "spinner",
        linkedCell: null,
        localValue,
      };
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [unlinked]));
      const before = structuredClone(unlinked);
      const snapshot = serializeWorkbook(f.session.workbook);
      expect(snapshot.version).toBe(108);
      expect(() => deserializeWorkbook({ ...snapshot, version: 107 })).toThrow();
      const restored = deserializeWorkbook(snapshot);
      expect(restored.sheets.get(f.sheet.id)!.drawings).toEqual([before]);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(serializeSheet(f.sheet)))).toEqual(
        serializeSheet(f.sheet),
      );
      expect(unlinked).toEqual(before);
    },
  );

  test("clones linked coordinates, source coordinates and explicit items", () => {
    const original = control();
    const clone = normalizeFormControl(original);
    clone.linkedCell!.row = 8;
    clone.source!.start.row = 8;
    clone.items[0] = "Other";
    expect(original).toEqual(control());
  });
  test("reads evaluated source values while preserving empty and error positions", () => {
    const f = fixture();
    setCellContent(
      f.sheet,
      { row: 2, column: 2 },
      { kind: "formula", formula: { source: "=1+1" } },
    );
    setCellContent(
      f.sheet,
      { row: 4, column: 2 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    expect(getFormControlItems(control(), createSheetEvaluator(f.sheet))).toEqual(["2", "", ""]);
    const explicit = { ...control(), source: null };
    const items = getFormControlItems(explicit, createSheetEvaluator(f.sheet));
    items[0] = "Other";
    expect(explicit.items[0]).toBe("One");
  });
  test("resolves checkbox, radio, reset button and passive values", () => {
    expect(resolveFormControlValue({ ...control(), type: "checkbox" }, true, 0)).toBe(true);
    expect(resolveFormControlValue({ ...control(), type: "checkbox" }, 1, 0)).toBeUndefined();
    expect(resolveFormControlValue({ ...control(), type: "radio" }, true, 0)).toBe(3);
    expect(resolveFormControlValue({ ...control(), type: "button" }, true, 0)).toBeNull();
    expect(resolveFormControlValue({ ...control(), type: "label" }, 1, 0)).toBeUndefined();
    expect(resolveFormControlValue({ ...control(), type: "group" }, 1, 0)).toBeUndefined();
  });
  test.each(["combo", "list"] as const)("validates one-based %s indexes", (type) => {
    for (const value of [0, 3, 1.5, "1", NaN])
      expect(resolveFormControlValue({ ...control(), type }, value, 2)).toBeUndefined();
    expect(resolveFormControlValue({ ...control(), type }, 2, 2)).toBe(2);
  });
  test.each(["spinner", "scrollbar"] as const)("bounds and snaps %s values to its step", (type) => {
    for (const value of [-1, 11, "2", NaN, Infinity])
      expect(resolveFormControlValue({ ...control(), type }, value, 0)).toBeUndefined();
    expect(resolveFormControlValue({ ...control(), type }, 3, 0)).toBe(4);
    expect(resolveFormControlValue({ ...control(), type }, 10, 0)).toBe(10);
  });
  test.each(["row", "column"] as const)(
    "updates both %s references on insert, delete, move and undo",
    (axis) => {
      const f = fixture();
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, axis, 1, 2));
      expect(f.current().linkedCell![axis]).toBe(4);
      expect(f.current().source!.start[axis]).toBe(4);
      undoWorkbookCommand(f.session);
      expect(f.current()).toEqual(control());
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, axis, 2, 3));
      expect(f.current().linkedCell).toBeNull();
      expect(f.current().source).toBeNull();
      undoWorkbookCommand(f.session);
      expect(f.current()).toEqual(control());
      executeWorkbookCommand(f.session, createMoveSheetAxisCommand(f.sheet.id, axis, 2, 3, 0));
      expect(f.current().linkedCell![axis]).toBe(0);
      expect(f.current().source!.start[axis]).toBe(0);
      undoWorkbookCommand(f.session);
      expect(f.current()).toEqual(control());
    },
  );
  test("updates both references for cell shifts and restores invalidated references", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createInsertCellsCommand(
        f.sheet.id,
        { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
        "down",
      ),
    );
    expect(f.current().linkedCell!.row).toBe(3);
    expect(f.current().source!.start.row).toBe(3);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(control());
    executeWorkbookCommand(
      f.session,
      createDeleteCellsCommand(f.sheet.id, control().source!, "up"),
    );
    expect(f.current().linkedCell).toBeNull();
    expect(f.current().source).toBeNull();
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(control());
  });
  test("round trips controls in the current format and rejects their payload in V29", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBeGreaterThanOrEqual(30);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 29 })).toThrow();
    const standalone = serializeSheet(f.sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
  });
});
