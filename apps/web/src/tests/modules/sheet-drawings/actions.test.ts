import { describe, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { applyWorkbookCommand, type WorkbookCommand } from "@idea10/core/commands";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";

function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  let sheet = getActiveSheet(workbook);
  let busy = false;
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const actions = useDrawingActions({
    getSheet: () => sheet,
    getAddress: () => ({ row: 2, column: 3 }),
    flush,
    execute,
    isBusy: () => busy,
    name: (kind) => kind,
  });
  return {
    actions,
    execute,
    flush,
    getSheet: () => sheet,
    busy: () => {
      busy = true;
    },
    switchSheet: () => {
      sheet = createSheet("Other", "other");
      workbook.sheets.set(sheet.id, sheet);
    },
  };
}

describe("drawing actions", () => {
  test.each(["shape", "textBox", "wordArt", "icon", "equation"] as const)(
    "inserts and confirms %s through one Core command",
    (kind) => {
      const f = fixture();
      f.actions.insert(kind);
      const draft = f.actions.editing.value!;
      expect(draft).toMatchObject({ kind, anchor: { row: 2, column: 3 }, name: kind });
      expect(f.execute).not.toHaveBeenCalled();
      f.actions.confirm({ ...draft, text: "Edited" });
      expect(f.getSheet().drawings).toEqual([{ ...draft, text: "Edited" }]);
      expect(f.actions.editing.value).toBeUndefined();
      expect(f.execute).toHaveBeenCalledTimes(1);
    },
  );

  test("updates existing drawings, preserves other drawings, and deletes by ID", () => {
    const f = fixture();
    f.actions.insert("shape");
    f.actions.confirm(f.actions.editing.value!);
    f.actions.insert("textBox");
    f.actions.confirm(f.actions.editing.value!);
    const [first, second] = f.getSheet().drawings!;
    if (!first || first.kind !== "shape") throw new Error("Expected a shape drawing.");
    f.actions.edit(first);
    f.actions.confirm({ ...first!, text: "Changed", width: 300 });
    expect(f.getSheet().drawings).toEqual([{ ...first!, text: "Changed", width: 300 }, second]);
    f.actions.update({ ...first!, id: "missing" });
    expect(f.getSheet().drawings).toHaveLength(2);
    f.actions.remove(first!.id);
    expect(f.getSheet().drawings).toEqual([second]);
  });

  test("cancels drafts without committing and rejects stale confirmations on another sheet", () => {
    const f = fixture();
    f.actions.insert("shape");
    const canceled = f.actions.editing.value!;
    f.actions.close();
    f.actions.confirm(canceled);
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.insert("shape");
    const stale = f.actions.editing.value!;
    f.switchSheet();
    f.actions.confirm(stale);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.getSheet().drawings ?? []).toEqual([]);
  });

  test.each(["protection", "busy"] as const)(
    "rejects confirm and edits after %s changes",
    (restriction) => {
      const f = fixture();
      f.actions.insert("shape");
      const draft = f.actions.editing.value!;
      if (restriction === "busy") f.busy();
      else f.getSheet().properties.protected = true;
      f.actions.confirm(draft);
      f.actions.update(draft);
      f.actions.remove(draft.id);
      f.actions.edit(draft);
      f.actions.insert("icon");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.editing.value).toBe(draft);
    },
  );

  test("does not open insert or edit when pending edits cannot be flushed", () => {
    const f = fixture();
    f.flush.mockReturnValue(false);
    f.actions.insert("shape");
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
