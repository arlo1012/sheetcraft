import { ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { type WorkbookCommand } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { usePictureTools } from "../../../../modules/sheet-images/usePictureTools";
import { useFloatingImageClipboard } from "../../../../modules/sheet-images/useFloatingImageClipboard";

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const images: FloatingImage[] = [0, 1].map((index) => ({
    id: `picture-${index}`,
    assetId: `asset-${index}`,
    groupId: "original-group",
    altText: "Synthetic",
    anchor: { row: 0, column: 0 },
    offsetX: index * 190,
    offsetY: index * 100,
    width: 100,
    height: 50,
  }));
  sheet.floatingImages = structuredClone(images);
  let currentSheet = sheet;
  let reject = false;
  let selection: FloatingImage[] | null = images;
  let refusedSnapshot: ReturnType<typeof serializeWorkbook> | undefined;
  const execute = vi.fn((command: WorkbookCommand) => {
    if (reject) {
      sheet.properties.protected = true;
      refusedSnapshot = serializeWorkbook(session.workbook);
    }
    try {
      return executeWorkbookCommand(session, command);
    } catch {
      return false;
    }
  });
  const tools = usePictureTools({
    getSheet: () => currentSheet,
    selectedIds: ref(images.map((image) => image.id)),
    isBusy: () => false,
    execute,
  });
  const write = vi.fn(async () => ({ localTokenWritten: true }));
  const onPaste = vi.fn();
  const onPasteMany = vi.fn();
  const onFeedback = vi.fn();
  const clipboard = useFloatingImageClipboard({
    getSheet: () => currentSheet,
    getRevision: () => session.history.revision,
    getSelectedImages: () => selection,
    clipboardPort: { write, read: vi.fn(async () => ({})) },
    onCopy: vi.fn(),
    onFeedback,
    onPaste,
    onPasteMany,
    onMove: (image) => tools.updateMany([image]),
    onMoveMany: tools.updateMany,
  });
  return {
    tools,
    clipboard,
    session,
    sheet,
    images,
    execute,
    write,
    onPaste,
    onPasteMany,
    onFeedback,
    setSheet: (next: typeof sheet) => {
      currentSheet = next;
    },
    setSelection: (next: typeof selection) => {
      selection = next;
    },
    refuse: () => {
      reject = true;
    },
    allow: () => {
      reject = false;
      sheet.properties.protected = false;
    },
    refusedSnapshot: () => refusedSnapshot,
  };
}

describe("picture clipboard authority", () => {
  test("an old successful move cannot consume a newer copy started inside its callback", async () => {
    const f = fixture();
    f.setSelection([f.images[0]!]);
    await f.clipboard.copy(f.images[0]!, "cut");
    const handler = vi.spyOn(f.tools, "updateMany").mockImplementation(() => {
      f.setSelection([f.images[1]!]);
      void f.clipboard.copy(f.images[1]!, "copy");
      return true;
    });
    f.clipboard.pastePending({ row: 3, column: 4 });
    handler.mockRestore();
    expect(f.clipboard.hasPending()).toBe(true);
    f.clipboard.pastePending({ row: 5, column: 6 });
    expect(f.onPaste).toHaveBeenCalledExactlyOnceWith(f.images[1], "floating", {
      row: 5,
      column: 6,
    });
  });
  test.each(["false", "throw"] as const)(
    "single move %s retains cut for a successful retry",
    async (failure) => {
      const f = fixture();
      f.setSelection([f.images[0]!]);
      await f.clipboard.copy(f.images[0]!, "cut");
      const before = serializeWorkbook(f.session.workbook);
      const reject = vi.spyOn(f.tools, "updateMany").mockImplementation(() => {
        if (failure === "throw") throw new Error("Synthetic refusal");
        return false;
      });
      f.clipboard.pastePending({ row: 3, column: 4 });
      expect(f.clipboard.hasPending()).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      reject.mockRestore();
      f.clipboard.pastePending({ row: 3, column: 4 });
      expect(f.clipboard.hasPending()).toBe(false);
      expect(f.session.history.undoStack).toHaveLength(1);
    },
  );

  test("same-position authorized no-op consumes cut without creating history", async () => {
    const f = fixture();
    f.setSelection([f.images[0]!]);
    Object.assign(f.images[0]!, { offsetX: 12, offsetY: 12 });
    Object.assign(f.sheet.floatingImages[0]!, { offsetX: 12, offsetY: 12 });
    await f.clipboard.copy(f.images[0]!, "cut");
    f.clipboard.pastePending({ row: 0, column: 0 });
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("replacement Sheet with the same id invalidates local cut authority", async () => {
    const f = fixture();
    await f.clipboard.copy(f.images[0]!, "cut");
    f.setSheet(getActiveSheet(createWorkbook({ id: "replacement-workbook", sheetId: f.sheet.id })));
    expect(f.clipboard.pastePending({ row: 3, column: 4 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("a rejected group move retains cut and source, then retries as one undoable transaction", async () => {
    const f = fixture();
    await f.clipboard.copy(f.images[0]!, "cut");
    f.refuse();
    expect(f.clipboard.pastePending({ row: 7, column: 8 })).toBe(true);
    expect(f.refusedSnapshot()).toBeDefined();
    expect(serializeWorkbook(f.session.workbook)).toEqual(f.refusedSnapshot());
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.onFeedback).toHaveBeenLastCalledWith("clipboard.pasteRejected");
    f.allow();
    const before = serializeWorkbook(f.session.workbook);
    f.clipboard.pastePending({ row: 7, column: 8 });
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.sheet.floatingImages.map((image) => [image.offsetX, image.offsetY])).toEqual([
      [12, 12],
      [202, 112],
    ]);
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });

  test("same image identifiers in an external transfer do not authorize a cut move", async () => {
    const f = fixture();
    await f.clipboard.copy(f.images[0]!, "cut");
    f.clipboard.paste(structuredClone(f.images[0]!), "floating", { row: 4, column: 5 });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.onPaste).toHaveBeenCalledOnce();
    expect(f.sheet.floatingImages).toEqual(f.images);
  });

  test("a copy snapshot remains available after changing sheets", async () => {
    const f = fixture();
    await f.clipboard.copy(f.images[0]!, "copy");
    const captured = structuredClone(f.images);
    f.images[1]!.offsetX = 999;
    f.setSheet(getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() })));
    expect(f.clipboard.pastePending({ row: 4, column: 5 })).toBe(true);
    expect(f.onPasteMany).toHaveBeenCalledExactlyOnceWith(captured, { row: 4, column: 5 });
  });

  test("unavailable geometry for any selected member rejects the complete copy", async () => {
    const f = fixture();
    f.setSelection(null);
    await f.clipboard.copy(f.images[0]!, "copy");
    expect(f.write).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.onFeedback).toHaveBeenLastCalledWith("image.copyFailed");
  });
});
