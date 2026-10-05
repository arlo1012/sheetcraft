import { describe, expect, test, vi } from "vitest";
import { applyWorkbookCommand, type WorkbookCommand } from "@idea10/core/commands";
import { createWorkbook, createSheet, getActiveSheet, insertSheet } from "@idea10/core/workbook";
import type { SheetCameraDrawing } from "@idea10/core/sheet-drawings";
import { useCameraActions } from "../../../modules/camera/useCameraActions";

function fixture() {
  let workbook = createWorkbook({ id: "camera", sheetId: "first" });
  let sheet = getActiveSheet(workbook);
  let busy = false;
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const actions = useCameraActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }),
    isBusy: () => busy,
    flush,
    execute,
    name: () => "Camera",
  });
  return {
    actions,
    execute,
    flush,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    addOtherSheet() {
      insertSheet(workbook, createSheet("Other", "other"));
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
    setBusy() {
      busy = true;
    },
  };
}

describe("camera actions", () => {
  test("inserts and edits a camera through Core without adding a duplicate", () => {
    const f = fixture();
    f.actions.open();
    expect(f.execute).not.toHaveBeenCalled();
    const draft = f.actions.editing.value!;
    expect(draft.anchor).toEqual({ row: 0, column: 0 });
    f.actions.confirm(draft, "A1:B3");
    expect(f.sheet.drawings).toHaveLength(1);
    const drawing = f.sheet.drawings![0] as SheetCameraDrawing;
    expect(drawing.camera.range).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 1 },
    });
    f.actions.open(drawing);
    f.actions.confirm(
      { ...drawing, name: "Updated", camera: { ...drawing.camera, gridLines: false } },
      "C4:D6",
    );
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]).toMatchObject({
      id: drawing.id,
      name: "Updated",
      camera: {
        gridLines: false,
        range: { start: { row: 3, column: 2 }, end: { row: 5, column: 3 } },
      },
    });
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).toHaveBeenCalledTimes(2);
  });

  test.each(["invalid", "A1:C4000", "'Unknown'!A1:B3"])("rejects invalid source %s", (source) => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, source);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBeDefined();
  });

  test("rejects a source from another sheet", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.addOtherSheet();
    f.actions.confirm(draft, "Other!A1:B3");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
  });

  test.each(["switchSheet", "replaceWorkbook", "setBusy", "protection"] as const)(
    "rejects confirmation after %s",
    (change) => {
      const f = fixture();
      f.actions.open();
      const draft = f.actions.editing.value!;
      if (change === "protection") f.sheet.properties.protected = true;
      else f[change]();
      f.actions.confirm(draft, "A1:B3");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.drawings ?? []).toEqual([]);
    },
  );

  test("does not resurrect an edited camera deleted while its editor is open", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    const drawing = f.sheet.drawings![0] as SheetCameraDrawing;
    f.actions.open(drawing);
    f.sheet.drawings = [];
    f.execute.mockClear();
    f.actions.confirm(drawing, "A1:B3");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings).toEqual([]);
    expect(f.actions.editing.value).toBeUndefined();
  });

  test("does not open when flushing the active cell edit fails", () => {
    const f = fixture();
    f.flush.mockReturnValue(false);
    f.actions.open();
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
