import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createBatchSetCellContentsCommand } from "@sheetcraft/core/commands";
import {
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
const file = new File(["synthetic"], "synthetic.png", { type: "image/png" });
const asset = { id: "source", blob: file, mimeType: "image/png", width: 20, height: 10 };
const scopes: ReturnType<typeof effectScope>[] = [];
function fixture() {
  let allowed = true;
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const store = createMemoryImageAssetStore();
  const scope = effectScope();
  scopes.push(scope);
  const execute = vi.fn(
    (command: Parameters<typeof executeWorkbookCommand>[1]) =>
      allowed && executeWorkbookCommand(session, command),
  );
  const actions = scope.run(() =>
    useSheetImageActions({
      assetStore: store,
      execute,
      getWorkbook: () => session.workbook,
      getSheet: () => sheet,
      getAddress: () => ({ row: 0, column: 0 }),
      flushPendingEdits: () => true,
      setCellImage: ({ sheetId, address, ...image }) =>
        execute(
          createBatchSetCellContentsCommand([
            { sheetId, address, content: { kind: "image", image } },
          ]),
        ),
      setFloatingImage: () => false,
      convertCellImageToFloating: () => false,
    }),
  )!;
  return {
    session,
    sheet,
    store,
    actions,
    execute,
    reject: () => {
      allowed = false;
    },
    allow: () => {
      allowed = true;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset));
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});
describe("local cell picture insertion confirmation", () => {
  test("a nonempty target is preserved until an explicit overwrite confirmation", async () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "original" });
    const before = serializeWorkbook(f.session.workbook);
    await f.actions.insertFile(file, "cell");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.insertionConfirmation.value?.occupiedTargetCount).toBe(1);
    f.actions.insertionConfirmation.value!.cancel();
    expect(f.actions.insertionConfirmation.value).toBeNull();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("a late decoder cannot overwrite a newly edited target", async () => {
    const f = fixture(),
      pending = deferred<typeof asset>();
    vi.mocked(prepareImageAsset).mockReturnValue(pending.promise);
    const task = f.actions.insertFile(file, "cell");
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "new edit" });
    const before = serializeWorkbook(f.session.workbook);
    pending.resolve(asset);
    await task;
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });
});

const files = [file, new File(["other"], "other.png", { type: "image/png" })];
test("accepted single overwrite is exactly one Undo/Redo transaction", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=1+2" } });
  const before = serializeWorkbook(f.session.workbook);
  await f.actions.insertFile(file, "cell");
  const dialog = f.actions.insertionConfirmation.value!;
  expect(await dialog.confirm()).toBe(true);
  expect(f.actions.insertionConfirmation.value).toBeNull();
  expect(f.session.history.undoStack).toHaveLength(1);
  const after = serializeWorkbook(f.session.workbook);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  expect(await dialog.confirm()).toBe(false);
});
test("blank single/batch targets insert directly, preserving atomic batch history", async () => {
  const single = fixture();
  await single.actions.insertFile(file, "cell");
  expect(single.actions.insertionConfirmation.value).toBeNull();
  expect(single.session.history.undoStack).toHaveLength(1);
  const batch = fixture();
  await batch.actions.insertFiles(files, "cell");
  expect(batch.actions.insertionConfirmation.value).toBeNull();
  expect(batch.session.history.undoStack).toHaveLength(1);
  expect(getCellContent(batch.sheet, { row: 1, column: 0 })?.kind).toBe("image");
  expect(undoWorkbookCommand(batch.session)).toBe(true);
  expect(batch.sheet.cells.size).toBe(0);
});
test("mixed blank/occupied batch prompts once and confirms the entire target set", async () => {
  const f = fixture();
  setCellContent(
    f.sheet,
    { row: 1, column: 0 },
    { kind: "literal", value: "keep until confirmed" },
  );
  const before = serializeWorkbook(f.session.workbook);
  await f.actions.insertFiles(files, "cell");
  const dialog = f.actions.insertionConfirmation.value!;
  expect(dialog.insertionTargets).toHaveLength(2);
  expect(dialog.occupiedTargetCount).toBe(1);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(await dialog.confirm()).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(getCellContent(f.sheet, { row: 0, column: 0 })?.kind).toBe("image");
  expect(getCellContent(f.sheet, { row: 1, column: 0 })?.kind).toBe("image");
  undoWorkbookCommand(f.session);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
});
test.each(["decode", "store", "confirm"] as const)(
  "a later batch target changing during %s rejects every write",
  async (phase) => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
    const pending = deferred<typeof asset>(),
      stored = deferred<void>();
    if (phase === "decode") vi.mocked(prepareImageAsset).mockReturnValueOnce(pending.promise);
    if (phase === "store") vi.spyOn(f.store, "put").mockReturnValueOnce(stored.promise);
    const task = f.actions.insertFiles(files, "cell");
    if (phase === "store") await vi.waitFor(() => expect(f.store.put).toHaveBeenCalled());
    if (phase === "confirm") await task;
    setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: "new target edit" });
    const before = serializeWorkbook(f.session.workbook);
    pending.resolve(asset);
    stored.resolve();
    await task;
    if (phase === "confirm")
      expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.actions.feedback.value).toBe("image.insertTargetsChanged");
  },
);
test("merge topology changes invalidate the pending single confirmation", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  await f.actions.insertFile(file, "cell");
  f.sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } });
  const before = serializeWorkbook(f.session.workbook);
  expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
});
test("merged tails are included in nonempty confirmation and batch placement skips merged rows", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: "tail" });
  f.sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } });
  await f.actions.insertFiles(files, "cell");
  const dialog = f.actions.insertionConfirmation.value!;
  expect(dialog.insertionTargets).toEqual([
    { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
    { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } },
  ]);
  expect(dialog.occupiedTargetCount).toBe(1);
  expect(await dialog.confirm()).toBe(true);
  expect(getCellContent(f.sheet, { row: 2, column: 0 })?.kind).toBe("image");
});
test("lost destination permissions reject the whole confirmed batch", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  await f.actions.insertFiles(files, "cell");
  f.sheet.properties.protected = true;
  const before = serializeWorkbook(f.session.workbook);
  expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.execute).not.toHaveBeenCalled();
});
test("style-only edits are retained while the unchanged content confirmation remains valid", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  await f.actions.insertFile(file, "cell");
  setCellStyle(f.sheet, { row: 0, column: 0 }, { bold: true });
  expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(true);
  expect(f.sheet.cells.get("0:0")?.style).toMatchObject({ bold: true });
});
test("a refused command preserves the confirmation and supports a safe retry", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  const before = serializeWorkbook(f.session.workbook);
  await f.actions.insertFiles(files, "cell");
  f.reject();
  const dialog = f.actions.insertionConfirmation.value!;
  expect(await dialog.confirm()).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.actions.insertionConfirmation.value?.error).toBe(true);
  expect(f.actions.insertionConfirmation.value?.errorReason).toBe("command");
  expect(f.actions.busy.value).toBe(false);
  f.allow();
  expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(1);
});
test("old confirm/cancel callbacks cannot consume a newer insertion session", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  await f.actions.insertFile(file, "cell");
  const old = f.actions.insertionConfirmation.value!;
  f.actions.cancelPending();
  await f.actions.insertFiles(files, "cell");
  const latest = f.actions.insertionConfirmation.value;
  expect(await old.confirm()).toBe(false);
  old.cancel();
  expect(f.actions.insertionConfirmation.value).toBe(latest);
  expect(f.execute).not.toHaveBeenCalled();
});
test("repeated confirm invokes a pending commit only once", async () => {
  const f = fixture();
  setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "old" });
  await f.actions.insertFiles(files, "cell");
  const pending = deferred<boolean>();
  f.execute.mockReturnValueOnce(pending.promise as unknown as boolean);
  const dialog = f.actions.insertionConfirmation.value!;
  const first = dialog.confirm();
  expect(await dialog.confirm()).toBe(false);
  expect(f.execute).toHaveBeenCalledOnce();
  pending.resolve(false);
  expect(await first).toBe(false);
  expect(f.session.history.undoStack).toHaveLength(0);
});
test("identical existing cell images remain a no-op without overwrite confirmation", async () => {
  const f = fixture();
  setCellContent(
    f.sheet,
    { row: 0, column: 0 },
    { kind: "image", image: { assetId: asset.id, altText: file.name } },
  );
  const before = serializeWorkbook(f.session.workbook);
  await f.actions.insertFile(file, "cell");
  expect(f.actions.insertionConfirmation.value).toBeNull();
  expect(f.actions.feedback.value).toBe("image.unchanged");
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
});
