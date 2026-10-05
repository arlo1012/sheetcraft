import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import type { WorkbookCommand } from "@idea10/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellContent,
  createSheetEvaluator,
  insertSheet,
} from "@idea10/core/workbook";
import type { SheetControlDrawing } from "@idea10/core/sheet-drawings";
import { useFormControlActions } from "../../../modules/form-controls/useFormControlActions";
import { controlDrawing } from "./fixture";

function fixture() {
  let workbook = createWorkbook({ id: "controls", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const actions = useFormControlActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 1, column: 1 }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => false,
    flush,
    execute,
    name: (type) => type,
  });
  return {
    actions,
    execute,
    session,
    flush,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
  };
}
describe("form control actions", () => {
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
    { linked: "A1:B1", source: "" },
    { linked: "A1", source: "B1:C2" },
    { linked: "", source: "" },
  ])("rejects invalid interactive control references", ({ linked, source }) => {
    const f = fixture();
    f.actions.open();
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
});
