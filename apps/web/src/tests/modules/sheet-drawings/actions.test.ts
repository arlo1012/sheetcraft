import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";

function fixture() {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  let sheet = getActiveSheet(workbook);
  let busy = false;
  const generation = ref(0);
  const revision = ref(0);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    applyWorkbookCommand(workbook, command),
  );
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getAddress: () => ({ row: 2, column: 3 }),
    flush,
    execute,
    isBusy: () => busy,
    name: (kind) => kind,
  });
  return {
    actions,
    generation,
    revision,
    execute,
    flush,
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    replaceSheet() {
      sheet = createSheet("Replaced", sheet.id);
      workbook.sheets.set(sheet.id, sheet);
      revision.value++;
    },
    replaceWorkbook: () => {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
      sheet = getActiveSheet(workbook);
    },
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

  test("acknowledged updates reject stale owners and false/throw before mutation, but acknowledge already applied changes", () => {
    const f = fixture();
    f.actions.insert("shape");
    f.actions.confirm(f.actions.editing.value!);
    const owner = f.getSheet().drawings![0]!;
    const next = { ...owner, name: "changed" };
    expect(f.actions.update(next, { ...owner })).toBe(false);
    expect(f.getSheet().drawings![0]).toBe(owner);
    f.execute.mockImplementation(() => false);
    expect(f.actions.update(next, owner)).toBe(false);
    f.execute.mockImplementation(() => {
      throw new Error("rejected");
    });
    expect(f.actions.update(next, owner)).toBe(false);
    f.execute.mockImplementation((command) => {
      applyWorkbookCommand(f.getWorkbook(), command);
      throw new Error("after mutation");
    });
    expect(f.actions.update(next, owner)).toBe(true);
    expect(f.getSheet().drawings![0]!.name).toBe("changed");
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

  test.each([false, true])("retains rejected execute=false draft, existing=%s", (existing) => {
    const f = fixture();
    f.actions.insert("shape");
    let draft = f.actions.editing.value!;
    if (existing) {
      f.actions.confirm(draft);
      const drawing = f.getSheet().drawings![0]!;
      if (drawing.kind !== "shape") throw new Error("Expected shape");
      f.actions.edit(drawing);
      draft = f.actions.editing.value!;
    }
    const before = f.getSheet().drawings;
    f.execute.mockClear();
    f.execute.mockReturnValue(false);
    draft = { ...draft, name: "Rejected changes" };
    const original = f.actions.editing.value;
    f.actions.confirm(draft);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.getSheet().drawings).toBe(before);
    expect(f.actions.editing.value).toBe(original);
  });

  test("rejects confirmation into a replacement workbook with the same sheet ID", () => {
    const f = fixture();
    f.actions.insert("shape");
    const draft = f.actions.editing.value!;
    f.replaceWorkbook();
    f.actions.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.getSheet().drawings ?? []).toEqual([]);
  });

  test("retains a rejected draft for retry, then closes only after success", () => {
    const f = fixture();
    f.actions.insert("shape");
    const original = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    const draft = { ...original, name: "Retained changes" };
    f.execute.mockReturnValueOnce(false);
    captured.confirm(draft);
    expect(f.actions.editing.value).toBe(original);
    expect(f.getSheet().drawings ?? []).toEqual([]);
    captured.confirm(draft);
    expect(f.getSheet().drawings).toHaveLength(1);
    expect(f.getSheet().drawings![0]!.name).toBe("Retained changes");
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  test("cancel after rejection invalidates captured confirm/close", () => {
    const f = fixture();
    f.actions.insert("shape");
    const draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.execute.mockReturnValue(false);
    captured.confirm(draft);
    f.actions.close();
    f.execute.mockClear();
    captured.confirm(draft);
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("same-ID existing reopen rejects old callbacks without closing current dialog", () => {
    const f = fixture();
    f.actions.insert("shape");
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft);
    {
      const saved = f.getSheet().drawings![0]!;
      if (saved.kind !== "shape") throw new Error("Expected shape");
      f.actions.edit(saved);
    }
    const captured = f.actions.dialog.value!;
    draft = f.actions.editing.value!;
    {
      const saved = f.getSheet().drawings![0]!;
      if (saved.kind !== "shape") throw new Error("Expected shape");
      f.actions.edit(saved);
    }
    const current = f.actions.dialog.value!;
    expect(current.dialogId).not.toBe(captured.dialogId);
    f.execute.mockClear();
    captured.confirm(draft);
    captured.close();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(current);
    current.confirm({ ...draft, name: "Current changes" });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.getSheet().drawings).toHaveLength(1);
    expect(f.getSheet().drawings![0]!.name).toBe("Current changes");
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("a proven unchanged existing edit closes when executor reports no-op false", () => {
    const f = fixture();
    f.actions.insert("shape");
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft);
    {
      const saved = f.getSheet().drawings![0]!;
      if (saved.kind !== "shape") throw new Error("Expected shape");
      f.actions.edit(saved);
    }
    draft = f.actions.editing.value!;
    const before = f.getSheet().drawings;
    f.execute.mockReturnValue(false);
    f.actions.confirm(draft);
    expect(f.getSheet().drawings).toBe(before);
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("does not resurrect a removed or same-ID replaced existing target", () => {
    const f = fixture();
    f.actions.insert("shape");
    let draft = f.actions.editing.value!;
    f.actions.confirm(draft);
    {
      const saved = f.getSheet().drawings![0]!;
      if (saved.kind !== "shape") throw new Error("Expected shape");
      f.actions.edit(saved);
    }
    draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.getSheet().drawings = [{ ...f.getSheet().drawings![0]!, name: "External replacement" }];
    f.execute.mockClear();
    captured.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.getSheet().drawings![0]!.name).toBe("External replacement");
    expect(f.actions.editing.value).toBeUndefined();
  });
  test.each(["replaceSheet", "generation", "busy", "protection"])(
    "retains or invalidates confirmation safely after %s",
    (change) => {
      const f = fixture();
      f.actions.insert("shape");
      const draft = f.actions.editing.value!;
      const captured = f.actions.dialog.value!;
      if (change === "replaceSheet") f.replaceSheet();
      else if (change === "generation") f.generation.value++;
      else if (change === "busy") {
        f.busy();
      } else f.getSheet().properties.protected = true;
      captured.confirm(draft);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.getSheet().drawings ?? []).toEqual([]);
      if (change === "busy" || change === "protection") expect(f.actions.editing.value).toBe(draft);
      else expect(f.actions.editing.value).toBeUndefined();
    },
  );
  test("reentrant execute cannot confirm twice or open a replacement editor", () => {
    const f = fixture();
    f.actions.insert("shape");
    const draft = f.actions.editing.value!;
    const captured = f.actions.dialog.value!;
    f.execute.mockImplementationOnce(() => {
      captured.confirm(draft);
      f.actions.insert("shape");
      return false;
    });
    captured.confirm(draft);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.dialog.value).toBe(captured);
    expect(f.getSheet().drawings ?? []).toEqual([]);
  });
  test("a throwing executor leaves the current draft available for retry", () => {
    const f = fixture();
    f.actions.insert("shape");
    const draft = f.actions.editing.value!;
    f.execute.mockImplementationOnce(() => {
      throw new Error("Synthetic command failure");
    });
    try {
      f.actions.confirm(draft);
    } catch {
      /* Graphic actions retain existing propagation behavior. */
    }
    expect(f.actions.editing.value).toBe(draft);
    expect(f.getSheet().drawings ?? []).toEqual([]);
    f.actions.confirm(draft);
    expect(f.getSheet().drawings).toHaveLength(1);
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("reentrant flush retains the inner editor rather than publishing the outer one", () => {
    const f = fixture();
    let inner: typeof f.actions.dialog.value;
    f.flush.mockImplementationOnce(() => {
      f.actions.insert("shape");
      inner = f.actions.dialog.value;
      return true;
    });
    f.actions.insert("shape");
    expect(inner).toBeDefined();
    expect(f.actions.dialog.value).toBe(inner);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["replaceWorkbook", "protection"])("does not open after flush changes %s", (change) => {
    const f = fixture();
    f.flush.mockImplementationOnce(() => {
      if (change === "replaceWorkbook") f.replaceWorkbook();
      else f.getSheet().properties.protected = true;
      return true;
    });
    f.actions.insert("shape");
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("scope disposal clears draft and rejects every retained callback", () => {
    const scope = effectScope();
    const f = scope.run(() => fixture())!;
    f.actions.insert("shape");
    const captured = f.actions.dialog.value!;
    const draft = f.actions.editing.value!;
    scope.stop();
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft);
    captured.close();
    f.actions.insert("shape");
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("reactive generation invalidates the dialog synchronously inside a scope", () => {
    const scope = effectScope();
    const f = scope.run(() => fixture())!;
    f.actions.insert("shape");
    const captured = f.actions.dialog.value!;
    const draft = f.actions.editing.value!;
    f.generation.value++;
    expect(f.actions.editing.value).toBeUndefined();
    captured.confirm(draft);
    expect(f.execute).not.toHaveBeenCalled();
    scope.stop();
  });
});

describe("shape gallery text-box ownership", () => {
  test("failed target preparation retains existing editor and all local draft ownership", () => {
    const f = fixture();
    f.actions.insert("shape");
    const old = f.actions.dialog.value!;
    f.flush.mockReturnValue(false);
    expect(f.actions.requestTextBox("vertical", old)).toBe(false);
    expect(f.actions.dialog.value).toBe(old);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("explicit vertical request replaces only after success, and stale handlers cannot switch new draft", () => {
    const f = fixture();
    f.actions.insert("shape");
    const old = f.actions.dialog.value!;
    expect(f.actions.requestTextBox("vertical", old)).toBe(true);
    const next = f.actions.dialog.value!;
    expect(next).not.toBe(old);
    expect(next.initial).toMatchObject({
      kind: "textBox",
      shapeText: { layout: { direction: "vertical-rl" } },
    });
    expect(f.actions.requestTextBox("horizontal", old)).toBe(false);
    expect(f.actions.dialog.value).toBe(next);
    expect(f.execute).not.toHaveBeenCalled();
    next.confirm(next.initial);
    expect(f.getSheet().drawings?.[0]).toMatchObject({
      kind: "textBox",
      shapeText: { layout: { direction: "vertical-rl" } },
    });
  });
  test("a failed repeated request cannot masquerade as successful because old draft is a text box", () => {
    const f = fixture();
    f.actions.insert("textBox");
    const old = f.actions.dialog.value!;
    f.flush.mockReturnValue(false);
    expect(f.actions.requestTextBox("vertical", old)).toBe(false);
    expect(f.actions.dialog.value).toBe(old);
  });
});
