// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellContent,
  createSheetEvaluator,
  insertSheet,
} from "@sheetcraft/core/workbook";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import { useFormControlActions } from "../../../modules/form-controls/useFormControlActions";
import { controlDrawing } from "./fixture";

function fixture() {
  let workbook = createWorkbook({ id: "controls", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const generation = ref(0);
  const revision = ref(0);
  let busy = false;
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    executeWorkbookCommand(session, command),
  );
  const actions = useFormControlActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getAddress: () => ({ row: 1, column: 1 }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => busy,
    flush,
    execute,
    name: (type) => type,
  });
  return {
    actions,
    generation,
    revision,
    execute,
    session,
    flush,
    get sheet() {
      return sheet;
    },
    setBusy() {
      busy = true;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    replaceSheet() {
      sheet = createSheet("Replaced", sheet.id);
      workbook.sheets.set(sheet.id, sheet);
      revision.value++;
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
  };
}
describe("form control actions", () => {
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
  ] as const)("opens and inserts the chosen %s control with its own defaults", (type) => {
    const f = fixture();

    f.actions.insert(type);

    const draft = f.actions.editing.value!;
    expect(draft).toMatchObject({
      name: type,
      anchor: { row: 1, column: 1 },
      width: 220,
      height: type === "list" || type === "group" ? 160 : 64,
      control: { type, label: type, linkedCell: null },
    });
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.confirm(draft, "", "");

    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]).toMatchObject({
      control: { type, linkedCell: null },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.error.value).toBe(false);
  });

  test.each(["combo", "list"] as const)(
    "ignores the obsolete source reference when changing a %s to a checkbox",
    (type) => {
      const f = fixture();
      const original = controlDrawing(type);
      original.control.source = { start: { row: 0, column: 2 }, end: { row: 1, column: 2 } };
      f.sheet.drawings = [original];
      f.actions.open(original);

      f.actions.confirm(
        { ...original, control: { ...original.control, type: "checkbox" } },
        "A1",
        "'Removed source sheet'!C1:C2",
      );

      expect(f.actions.error.value).toBe(false);
      expect(f.sheet.drawings).toHaveLength(1);
      expect(f.sheet.drawings![0]).toMatchObject({
        id: original.id,
        control: { type: "checkbox", linkedCell: { row: 0, column: 0 }, source: null, items: [] },
      });
      expect(f.execute).toHaveBeenCalledTimes(1);
    },
  );

  test.each(["label", "group"] as const)(
    "ignores an obsolete linked-cell reference when changing an interactive control to %s",
    (type) => {
      const f = fixture();
      const original = controlDrawing();
      f.sheet.drawings = [original];
      f.actions.open(original);

      f.actions.confirm(
        { ...original, control: { ...original.control, type } },
        "'Removed linked sheet'!A1",
        "not a range",
      );

      expect(f.actions.error.value).toBe(false);
      expect(f.sheet.drawings).toHaveLength(1);
      expect(f.sheet.drawings![0]).toMatchObject({
        id: original.id,
        control: { type, linkedCell: null, source: null, items: [] },
      });
      expect(f.execute).toHaveBeenCalledTimes(1);
    },
  );

  test("inserts and edits a control through Core without duplicates", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "A1", "");
    expect(f.sheet.drawings).toHaveLength(1);
    const drawing = f.sheet.drawings![0] as SheetControlDrawing;
    f.actions.open(drawing);
    f.actions.confirm(
      { ...drawing, control: { ...drawing.control, type: "combo", items: ["A", "B"] } },
      "B1",
      "C1:C2",
    );
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]).toMatchObject({
      id: drawing.id,
      control: {
        type: "combo",
        linkedCell: { row: 0, column: 1 },
        source: { start: { row: 0, column: 2 }, end: { row: 1, column: 2 } },
      },
    });
    expect(f.actions.editing.value).toBeUndefined();
  });
  test.each(["checkbox", "radio", "combo", "list", "spinner", "scrollbar", "button"] as const)(
    "adds an explicit linked cell to a newly created %s",
    (type) => {
      const f = fixture();
      f.actions.insert(type);
      expect(f.actions.editing.value!.control.linkedCell).toBeNull();
      f.actions.confirm(f.actions.editing.value!, "A1", "");
      expect((f.sheet.drawings![0] as SheetControlDrawing).control.linkedCell).toEqual({
        row: 0,
        column: 0,
      });
    },
  );

  test.each([
    { type: "checkbox", requested: true, expected: true },
    { type: "radio", requested: true, expected: 3 },
    { type: "combo", requested: 2, expected: 2 },
    { type: "list", requested: 2, expected: 2 },
    { type: "spinner", requested: 3, expected: 4 },
    { type: "scrollbar", requested: 3, expected: 4 },
  ] as const)(
    "stores unlinked $type interaction as one undoable drawing edit",
    ({ type, requested, expected }) => {
      const f = fixture();
      const initial = controlDrawing(type);
      initial.control.linkedCell = null;
      f.sheet.drawings = [initial];
      f.actions.change(initial.id, requested);
      expect((f.sheet.drawings![0] as SheetControlDrawing).control.localValue).toBe(expected);
      expect(f.sheet.cells.size).toBe(0);
      expect(f.execute).toHaveBeenCalledTimes(1);
      undoWorkbookCommand(f.session);
      expect((f.sheet.drawings![0] as SheetControlDrawing).control.localValue).toBeUndefined();
      expect(f.sheet.cells.size).toBe(0);
      redoWorkbookCommand(f.session);
      expect((f.sheet.drawings![0] as SheetControlDrawing).control.localValue).toBe(expected);
      expect(f.sheet.cells.size).toBe(0);
    },
  );

  test.each(["button", "label", "group"] as const)(
    "an unlinked %s cannot write to a worksheet cell",
    (type) => {
      const f = fixture();
      const drawing = controlDrawing(type);
      drawing.control.linkedCell = null;
      f.sheet.drawings = [drawing];
      f.actions.change(drawing.id, 0);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.cells.size).toBe(0);
      expect((f.sheet.drawings![0] as SheetControlDrawing).control.localValue).toBeUndefined();
    },
  );

  test("clearing an existing link retains the control value locally without changing the former linked cell", () => {
    const f = fixture();
    const drawing = controlDrawing("checkbox");
    f.sheet.drawings = [drawing];
    f.actions.change(drawing.id, true);
    f.actions.open(drawing);
    f.actions.confirm(f.actions.editing.value!, "", "");
    const current = f.sheet.drawings![0] as SheetControlDrawing;
    expect(current.control).toMatchObject({ linkedCell: null, localValue: true });
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: true,
    });
    undoWorkbookCommand(f.session);
    expect((f.sheet.drawings![0] as SheetControlDrawing).control.linkedCell).toEqual({
      row: 0,
      column: 0,
    });
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: true,
    });
  });

  test("rejects invalid unlinked item indexes before changing local state", () => {
    const f = fixture();
    const drawing = controlDrawing("combo");
    drawing.control.linkedCell = null;
    f.sheet.drawings = [drawing];
    for (const value of [0, 3, 1.5, "1", NaN]) f.actions.change(drawing.id, value);
    expect(f.execute).not.toHaveBeenCalled();
    expect((f.sheet.drawings![0] as SheetControlDrawing).control.localValue).toBeUndefined();
    expect(f.sheet.cells.size).toBe(0);
  });

  test("writes a linked literal as one undoable Core action", () => {
    const f = fixture();
    f.sheet.drawings = [controlDrawing()];
    f.actions.change("control", true);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: true,
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toBeNull();
    redoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: true,
    });
  });
  test.each(["combo", "list"] as const)("checks %s indexes before writing", (type) => {
    const f = fixture();
    f.sheet.drawings = [controlDrawing(type)];
    for (const value of [0, 3, 1.5, "1"]) f.actions.change("control", value);
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.change("control", 2);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 2 });
  });
  test.each(["spinner", "scrollbar"] as const)("checks and snaps %s numeric values", (type) => {
    const f = fixture();
    f.sheet.drawings = [controlDrawing(type)];
    for (const value of [-1, 11, NaN, "2"]) f.actions.change("control", value);
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.change("control", 3);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 4 });
  });
  test("rejects absent controls and locked linked cells", () => {
    const f = fixture();
    f.sheet.drawings = [controlDrawing()];
    f.actions.change("missing", true);
    expect(f.execute).not.toHaveBeenCalled();
    f.sheet.properties.protected = true;
    f.actions.change("control", true);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["switchSheet", "replaceWorkbook", "protection"] as const)(
    "rejects editor confirmation after %s",
    (change) => {
      const f = fixture();
      f.actions.open();
      const drawing = f.actions.editing.value!;
      if (change === "protection") f.sheet.properties.protected = true;
      else f[change]();
      f.actions.confirm(drawing, "A1", "");
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test.each([
    { type: "checkbox", linked: "A1:B1", source: "" },
    { type: "combo", linked: "A1", source: "B1:C2" },
    { type: "checkbox", linked: "'Missing sheet'!A1", source: "" },
  ] as const)("rejects invalid interactive control references", ({ type, linked, source }) => {
    const f = fixture();
    f.actions.open(undefined, type);
    f.actions.confirm(f.actions.editing.value!, linked, source);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
  });
  test("does not resurrect a deleted edit target", () => {
    const f = fixture();
    const drawing = controlDrawing();
    f.sheet.drawings = [drawing];
    f.actions.open(drawing);
    f.sheet.drawings = [];
    f.actions.confirm(drawing, "A1", "");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.editing.value).toBeUndefined();
  });

  test.each([false, true])("retains rejected execute=false draft, existing=%s", (existing) => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    if (existing) {
      f.actions.confirm(draft, "A1", "");
      f.actions.open(f.sheet.drawings![0] as SheetControlDrawing);
      draft = f.actions.editing.value!;
    }
    const before = f.sheet.drawings;
    f.execute.mockClear();
    f.execute.mockReturnValue(false);
    draft = { ...draft, name: "Rejected changes" };
    const original = f.actions.editing.value;
    f.actions.confirm(draft, "A1", "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toBe(before);
    expect(f.actions.editing.value).toBe(original);
  });

  test("retains a rejected draft for retry, then closes only after success", () => {
    const f = fixture();
    f.actions.open();
    const original = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    const draft = { ...original, name: "Retained changes" };
    f.execute.mockReturnValueOnce(false);
    captured.confirm(draft, "A1", "");
    expect(f.actions.editing.value).toBe(original);
    expect(f.sheet.drawings ?? []).toEqual([]);
    captured.confirm(draft, "A1", "");
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]!.name).toBe("Retained changes");
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft, "A1", "");
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  test("cancel after rejection invalidates captured confirm/close", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.execute.mockReturnValue(false);
    captured.confirm(draft, "A1", "");
    f.actions.close();
    f.execute.mockClear();
    captured.confirm(draft, "A1", "");
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("same-ID existing reopen rejects old callbacks without closing current dialog", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1", "");
    f.actions.open(f.sheet.drawings![0] as SheetControlDrawing);
    const captured = f.actions.dialog.value!;
    draft = f.actions.editing.value!;
    f.actions.open(f.sheet.drawings![0] as SheetControlDrawing);
    const current = f.actions.dialog.value!;
    expect(current.dialogId).not.toBe(captured.dialogId);
    f.execute.mockClear();
    captured.confirm(draft, "A1", "");
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(current);
    current.confirm({ ...draft, name: "Current changes" }, "A1", "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]!.name).toBe("Current changes");
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("a proven unchanged existing edit closes when executor reports no-op false", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1", "");
    f.actions.open(f.sheet.drawings![0] as SheetControlDrawing);
    draft = f.actions.editing.value!;
    const before = f.sheet.drawings;
    f.execute.mockReturnValue(false);
    f.actions.confirm(draft, "A1", "");
    expect(f.sheet.drawings).toBe(before);
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("does not resurrect a removed or same-ID replaced existing target", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1", "");
    f.actions.open(f.sheet.drawings![0] as SheetControlDrawing);
    draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.sheet.drawings = [{ ...f.sheet.drawings![0]!, name: "External replacement" }];
    f.execute.mockClear();
    captured.confirm(draft, "A1", "");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings![0]!.name).toBe("External replacement");
    expect(f.actions.editing.value).toBeUndefined();
  });
  test.each(["replaceSheet", "generation", "busy", "protection"])(
    "retains or invalidates confirmation safely after %s",
    (change) => {
      const f = fixture();
      f.actions.open();
      const draft = f.actions.editing.value!;
      const captured = f.actions.dialog.value!;
      if (change === "replaceSheet") f.replaceSheet();
      else if (change === "generation") f.generation.value++;
      else if (change === "busy") {
        f.setBusy();
      } else f.sheet.properties.protected = true;
      captured.confirm(draft, "A1", "");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.drawings ?? []).toEqual([]);
      if (change === "busy" || change === "protection") expect(f.actions.editing.value).toBe(draft);
      else expect(f.actions.editing.value).toBeUndefined();
    },
  );
  test("reentrant execute cannot confirm twice or open a replacement editor", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.execute.mockImplementationOnce(() => {
      captured.confirm(draft, "A1", "");
      f.actions.open();
      return false;
    });
    captured.confirm(draft, "A1", "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.dialog.value).toBe(captured);
    expect(f.sheet.drawings ?? []).toEqual([]);
  });
  test("a throwing executor leaves the current draft available for retry", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.execute.mockImplementationOnce(() => {
      throw new Error("Synthetic command failure");
    });
    try {
      f.actions.confirm(draft, "A1", "");
    } catch {
      /* Graphic actions retain existing propagation behavior. */
    }
    expect(f.actions.editing.value).toBe(draft);
    expect(f.sheet.drawings ?? []).toEqual([]);
    f.actions.confirm(draft, "A1", "");
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("reentrant flush retains the inner editor rather than publishing the outer one", () => {
    const f = fixture();
    let inner: typeof f.actions.dialog.value;
    f.flush.mockImplementationOnce(() => {
      f.actions.open();
      inner = f.actions.dialog.value;
      return true;
    });
    f.actions.open();
    expect(inner).toBeDefined();
    expect(f.actions.dialog.value).toBe(inner);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["replaceWorkbook", "protection"])("does not open after flush changes %s", (change) => {
    const f = fixture();
    f.flush.mockImplementationOnce(() => {
      if (change === "replaceWorkbook") f.replaceWorkbook();
      else f.sheet.properties.protected = true;
      return true;
    });
    f.actions.open();
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("scope disposal clears draft and rejects every retained callback", () => {
    const scope = effectScope();
    const f = scope.run(() => fixture())!;
    f.actions.open();
    const captured = f.actions.dialog.value!;
    const draft = f.actions.editing.value!;
    scope.stop();
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft, "A1", "");
    captured.close();
    f.actions.open();
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("reactive generation invalidates the dialog synchronously inside a scope", () => {
    const scope = effectScope();
    const f = scope.run(() => fixture())!;
    f.actions.open();
    const captured = f.actions.dialog.value!;
    const draft = f.actions.editing.value!;
    f.generation.value++;
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft, "A1", "");
    expect(f.execute).not.toHaveBeenCalled();
    scope.stop();
  });
});
