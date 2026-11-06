// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import { useCameraActions } from "../../../modules/camera/useCameraActions";

function fixture() {
  let workbook = createWorkbook({ id: "camera", sheetId: "first" });
  let sheet = getActiveSheet(workbook);
  let busy = false;
  const generation = ref(0);
  const revision = ref(0);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    applyWorkbookCommand(workbook, command),
  );
  const actions = useCameraActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }),
    isBusy: () => busy,
    flush,
    execute,
    name: () => "Camera",
  });
  return {
    actions,
    generation,
    revision,
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
    replaceSheet() {
      sheet = createSheet("Replaced", sheet.id);
      workbook.sheets.set(sheet.id, sheet);
      revision.value++;
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
  test.each([
    { baseline: undefined, expected: 72 },
    { baseline: 20, expected: 60 },
    { baseline: 24, expected: 72 },
  ])("uses the initial source row height baseline $baseline", ({ baseline, expected }) => {
    const f = fixture();
    f.sheet.defaultRowHeight = baseline;
    f.actions.open();
    expect(f.actions.editing.value?.height).toBe(expected);
    expect(f.sheet.rowHeights.size).toBe(0);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("sizes a new camera from the visible selected rows and columns", () => {
    const f = fixture();
    f.sheet.columnWidths.set(0, 140);
    f.sheet.columnWidths.set(1, 60);
    f.sheet.rowHeights.set(0, 32);
    f.sheet.rowHeights.set(1, 48);
    f.sheet.rowHeights.set(2, 72);
    f.sheet.hiddenRows = new Set([1]);
    f.sheet.hiddenColumns = new Set([1]);

    f.actions.open();

    expect(f.actions.editing.value).toMatchObject({ width: 140, height: 104 });
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("recomputes a new camera's size from the source chosen at confirmation", () => {
    const f = fixture();
    f.sheet.defaultColumnWidth = 80;
    f.sheet.defaultRowHeight = 20;
    f.sheet.columnWidths.set(3, 150);
    f.sheet.columnWidths.set(4, 200);
    f.sheet.columnWidths.set(5, 250);
    f.sheet.rowHeights.set(4, 55);
    f.sheet.rowHeights.set(5, 45);
    f.actions.open();
    const draft = f.actions.editing.value!;
    expect(draft).toMatchObject({ width: 160, height: 60 });

    f.actions.confirm(draft, "D5:F6");

    expect(f.sheet.drawings![0]).toMatchObject({
      width: 600,
      height: 100,
      camera: { range: { start: { row: 4, column: 3 }, end: { row: 5, column: 5 } } },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test("retains the dimensions of an existing camera when its source changes", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    const original = f.sheet.drawings![0] as SheetCameraDrawing;
    const resized = { ...original, width: 340, height: 180 };
    f.sheet.drawings = [resized];
    f.sheet.columnWidths.set(3, 700);
    f.sheet.columnWidths.set(4, 700);
    f.sheet.rowHeights.set(4, 500);
    f.actions.open(resized);

    f.actions.confirm(f.actions.editing.value!, "D5:E5");

    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]).toMatchObject({
      id: resized.id,
      width: 340,
      height: 180,
      camera: { range: { start: { row: 4, column: 3 }, end: { row: 4, column: 4 } } },
    });
  });

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

  test.each([false, true])("retains rejected execute=false draft, existing=%s", (existing) => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    if (existing) {
      f.actions.confirm(draft, "A1:B3");
      f.actions.open(f.sheet.drawings![0] as SheetCameraDrawing);
      draft = f.actions.editing.value!;
    }
    const before = f.sheet.drawings;
    f.execute.mockClear();
    f.execute.mockReturnValue(false);
    draft = { ...draft, name: "Rejected changes" };
    const original = f.actions.editing.value;
    f.actions.confirm(draft, "A1:B3");
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
    captured.confirm(draft, "A1:B3");
    expect(f.actions.editing.value).toBe(original);
    expect(f.sheet.drawings ?? []).toEqual([]);
    captured.confirm(draft, "A1:B3");
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]!.name).toBe("Retained changes");
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft, "A1:B3");
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  test("cancel after rejection invalidates captured confirm/close", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.execute.mockReturnValue(false);
    captured.confirm(draft, "A1:B3");
    f.actions.close();
    f.execute.mockClear();
    captured.confirm(draft, "A1:B3");
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("same-ID existing reopen rejects old callbacks without closing current dialog", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1:B3");
    f.actions.open(f.sheet.drawings![0] as SheetCameraDrawing);
    const captured = f.actions.dialog.value!;
    draft = f.actions.editing.value!;
    f.actions.open(f.sheet.drawings![0] as SheetCameraDrawing);
    const current = f.actions.dialog.value!;
    expect(current.dialogId).not.toBe(captured.dialogId);
    f.execute.mockClear();
    captured.confirm(draft, "A1:B3");
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(current);
    current.confirm({ ...draft, name: "Current changes" }, "A1:B3");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]!.name).toBe("Current changes");
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("a proven unchanged existing edit closes when executor reports no-op false", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1:B3");
    f.actions.open(f.sheet.drawings![0] as SheetCameraDrawing);
    draft = f.actions.editing.value!;
    const before = f.sheet.drawings;
    f.execute.mockReturnValue(false);
    f.actions.confirm(draft, "A1:B3");
    expect(f.sheet.drawings).toBe(before);
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("does not resurrect a removed or same-ID replaced existing target", () => {
    const f = fixture();
    f.actions.open();
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft, "A1:B3");
    f.actions.open(f.sheet.drawings![0] as SheetCameraDrawing);
    draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.sheet.drawings = [{ ...f.sheet.drawings![0]!, name: "External replacement" }];
    f.execute.mockClear();
    captured.confirm(draft, "A1:B3");
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
      captured.confirm(draft, "A1:B3");
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
      captured.confirm(draft, "A1:B3");
      f.actions.open();
      return false;
    });
    captured.confirm(draft, "A1:B3");
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
      f.actions.confirm(draft, "A1:B3");
    } catch {
      /* Graphic actions retain existing propagation behavior. */
    }
    expect(f.actions.editing.value).toBe(draft);
    expect(f.sheet.drawings ?? []).toEqual([]);
    f.actions.confirm(draft, "A1:B3");
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
    captured.confirm(draft, "A1:B3");
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
    captured.confirm(draft, "A1:B3");
    expect(f.execute).not.toHaveBeenCalled();
    scope.stop();
  });
});
