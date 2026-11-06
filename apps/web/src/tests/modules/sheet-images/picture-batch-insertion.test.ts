// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { flushPromises } from "@vue/test-utils";
import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createBatchSetCellContentsCommand,
  createSetFloatingImageCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellContent,
  insertSheet,
  setCellContent,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
const files = ["a.png", "b.png", "c.png"].map(
  (name) => new File([name], name, { type: "image/png" }),
);
const assets = files.map((blob, index) => ({
  id: `batch-${index}`,
  blob,
  mimeType: "image/png",
  width: [100, 80, 140][index]!,
  height: [60, 120, 90][index]!,
}));
const scopes: ReturnType<typeof effectScope>[] = [];

beforeEach(() => {
  vi.mocked(prepareImageAsset)
    .mockReset()
    .mockImplementation(async (file) => {
      const asset = assets.find((candidate) => candidate.blob === file);
      if (!asset) throw new Error("Unexpected batch source.");
      return asset;
    });
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.restoreAllMocks();
});

function fixture(address: CellAddress = { row: 2, column: 3 }) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  let sheet = getActiveSheet(session.workbook);
  let generation = 0;
  const store = createMemoryImageAssetStore();
  const put = vi.spyOn(store, "put");
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() =>
    useSheetImageActions({
      assetStore: store,
      execute,
      getWorkbook: () => session.workbook,
      getSheet: () => sheet,
      getGeneration: () => generation,
      getAddress: () => address,
      flushPendingEdits: () => true,
      setCellImage: ({ sheetId, address: target, ...image }) =>
        execute(
          createBatchSetCellContentsCommand([
            { sheetId, address: target, content: { kind: "image", image } },
          ]),
        ),
      setFloatingImage: (image, sheetId) => execute(createSetFloatingImageCommand(sheetId, image)),
      convertCellImageToFloating: () => false,
    }),
  )!;
  const input = document.createElement("input");
  input.type = "file";
  vi.spyOn(input, "click").mockImplementation(() => {});
  actions.fileInput.value = input;
  return {
    session,
    actions,
    store,
    put,
    execute,
    get sheet() {
      return sheet;
    },
    async select(mode: "cell" | "floating", selected: readonly File[] = files) {
      await actions.requestInsert(mode);
      Object.defineProperty(input, "files", { configurable: true, value: selected });
      actions.onFileChange({ target: input } as unknown as Event);
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(session.workbook, sheet);
    },
    replaceSheet() {
      sheet = createSheet("Replacement", sheet.id);
      session.workbook.sheets.set(sheet.id, sheet);
    },
    replaceWorkbook() {
      session.workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
      sheet = getActiveSheet(session.workbook);
    },
    changeGeneration() {
      generation += 1;
    },
  };
}

describe("picture batch insertion configuration", () => {
  test.each(["cell", "floating"] as const)(
    "commits %s pictures, ordered captions and row heights as one Undo/Redo transaction",
    async (mode) => {
      const f = fixture();
      f.sheet.defaultColumnWidth = 120;
      f.sheet.rowHeights.set(2, 40);
      const before = serializeWorkbook(f.session.workbook);
      await f.select(mode);
      await f.actions.confirmBatchInsertion({
        order: [2, 0, 1],
        arrangement: "horizontal",
        wrapAfter: 2,
        namePlacement: "after",
        rowHeight: 120,
      });

      for (const [index, address] of [
        { row: 3, column: 3 },
        { row: 3, column: 4 },
        { row: 5, column: 3 },
      ].entries())
        expect(getCellContent(f.sheet, address)).toEqual({
          kind: "literal",
          value: ["c", "a", "b"][index],
        });
      const addresses = [
        { row: 2, column: 3 },
        { row: 2, column: 4 },
        { row: 4, column: 3 },
      ];
      if (mode === "cell")
        for (const [index, address] of addresses.entries())
          expect(getCellContent(f.sheet, address)).toMatchObject({
            kind: "image",
            image: { assetId: ["batch-2", "batch-0", "batch-1"][index] },
          });
      else
        expect(f.sheet.floatingImages).toMatchObject(
          addresses.map((anchor, index) => ({
            anchor,
            assetId: ["batch-2", "batch-0", "batch-1"][index],
          })),
        );
      expect(f.sheet.rowHeights.get(2)).toBe(120);
      expect(f.sheet.rowHeights.get(4)).toBe(120);
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.calls[0]![0].type).toBe("insertPictureBatch");
      expect(f.session.history.undoStack).toHaveLength(1);
      const inserted = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(inserted);
    },
  );

  test("waits for caption overwrite approval and cancels without applying pictures or row heights", async () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 3, column: 4 }, { kind: "literal", value: "Keep this caption" });
    const before = serializeWorkbook(f.session.workbook);
    await f.select("cell");
    await f.actions.confirmBatchInsertion({
      order: [0, 1, 2],
      arrangement: "horizontal",
      namePlacement: "after",
      rowHeight: 120,
    });
    const confirmation = f.actions.insertionConfirmation.value!;
    expect(confirmation.occupiedTargetCount).toBe(1);
    expect(confirmation.insertionTargets).toHaveLength(6);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);

    confirmation.cancel();
    expect(await confirmation.confirm()).toBe(false);
    expect(f.actions.insertionConfirmation.value).toBeNull();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("retains a refused caption overwrite confirmation for an atomic successful retry", async () => {
    const f = fixture();
    const address = { row: 3, column: 3 };
    setCellContent(f.sheet, address, { kind: "literal", value: "Old caption" });
    const before = serializeWorkbook(f.session.workbook);
    await f.select("cell");
    await f.actions.confirmBatchInsertion({
      order: [0, 1, 2],
      arrangement: "horizontal",
      namePlacement: "after",
      rowHeight: 120,
    });
    f.execute.mockReturnValueOnce(false);
    expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
    expect(f.actions.insertionConfirmation.value).toMatchObject({
      error: true,
      errorReason: "command",
    });
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);

    expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(true);
    expect(f.actions.insertionConfirmation.value).toBeNull();
    expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "a" });
    expect(f.sheet.rowHeights.get(2)).toBe(120);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("retains captions and row fitting when the batch selection is reduced to one file", async () => {
    const f = fixture();
    f.sheet.defaultColumnWidth = 120;
    await f.select("floating");
    await f.actions.confirmBatchInsertion({
      order: [1],
      arrangement: "horizontal",
      namePlacement: "before",
      rowHeight: 100,
    });

    expect(getCellContent(f.sheet, { row: 2, column: 3 })).toEqual({ kind: "literal", value: "b" });
    expect(f.sheet.rowHeights.get(3)).toBe(100);
    expect(f.sheet.floatingImages).toMatchObject([
      {
        assetId: "batch-1",
        anchor: { row: 3, column: 3 },
        offsetX: 28,
        offsetY: 2,
        width: 64,
        height: 96,
      },
    ]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0].type).toBe("insertPictureBatch");
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each([
    { phase: "decode", change: "caption" },
    { phase: "decode", change: "row height" },
    { phase: "decode", change: "column width" },
    { phase: "store", change: "caption" },
    { phase: "store", change: "row height" },
    { phase: "store", change: "column width" },
  ] as const)(
    "refuses the entire batch when $change changes during $phase",
    async ({ phase, change }) => {
      const f = fixture();
      let finishDecode!: (value: (typeof assets)[number]) => void;
      let finishStore!: () => void;
      const decoded = new Promise<(typeof assets)[number]>((resolve) => {
        finishDecode = resolve;
      });
      const stored = new Promise<void>((resolve) => {
        finishStore = resolve;
      });
      if (phase === "decode") vi.mocked(prepareImageAsset).mockReturnValueOnce(decoded);
      else f.put.mockReturnValueOnce(stored);
      await f.select("cell");
      const pending = f.actions.confirmBatchInsertion({
        order: [0, 1, 2],
        arrangement: "horizontal",
        namePlacement: "after",
        rowHeight: 120,
      });
      if (phase === "store") {
        await flushPromises();
        expect(f.put).toHaveBeenCalledTimes(1);
      }
      if (change === "caption")
        setCellContent(
          f.sheet,
          { row: 3, column: 4 },
          { kind: "literal", value: "New user caption" },
        );
      else if (change === "row height") f.sheet.rowHeights.set(2, 88);
      else f.sheet.columnWidths.set(3, 140);
      const before = serializeWorkbook(f.session.workbook);
      finishDecode(assets[0]!);
      finishStore();
      await pending;

      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.actions.feedback.value).toBe("image.insertTargetsChanged");
      expect(f.actions.busy.value).toBe(false);
    },
  );

  test("does not overwrite a caption edited after its overwrite confirmation opened", async () => {
    const f = fixture();
    const address = { row: 3, column: 3 };
    setCellContent(f.sheet, address, { kind: "literal", value: "Original caption" });
    await f.select("cell");
    await f.actions.confirmBatchInsertion({
      order: [0, 1, 2],
      arrangement: "horizontal",
      namePlacement: "after",
      rowHeight: 120,
    });
    setCellContent(f.sheet, address, { kind: "literal", value: "Updated after prompt" });
    const before = serializeWorkbook(f.session.workbook);

    expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
    expect(f.actions.insertionConfirmation.value).toMatchObject({
      error: true,
      errorReason: "targets",
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each(["cell", "floating"] as const)(
    "stages %s files and cancels without decoding, storage or workbook writes",
    async (mode) => {
      const f = fixture();
      const before = serializeWorkbook(f.session.workbook);
      await f.select(mode);

      expect(f.actions.batchInsertion.value).toMatchObject({ files, mode });
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.busy.value).toBe(false);
      f.actions.cancelPending();
      await f.actions.confirmBatchInsertion({ order: [2, 0, 1], arrangement: "horizontal" });

      expect(f.actions.batchInsertion.value).toBeNull();
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test("confirms reordered cell images horizontally as one undoable Core command", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.select("cell");
    await f.actions.confirmBatchInsertion({ order: [2, 0, 1], arrangement: "horizontal" });

    expect(vi.mocked(prepareImageAsset).mock.calls.map(([file]) => file)).toEqual([
      files[2],
      files[0],
      files[1],
    ]);
    for (const [index, source] of [2, 0, 1].entries())
      expect(getCellContent(f.sheet, { row: 2, column: 3 + index })).toMatchObject({
        kind: "image",
        image: { assetId: assets[source]!.id, altText: files[source]!.name },
      });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.actions.batchInsertion.value).toBeNull();
    const inserted = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(inserted);
  });

  test("confirms the requested cell wrap count and ordering in one undoable history entry", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.select("cell");
    await f.actions.confirmBatchInsertion({
      order: [2, 0, 1],
      arrangement: "horizontal",
      wrapAfter: 2,
    });

    expect(getCellContent(f.sheet, { row: 2, column: 3 })).toMatchObject({
      kind: "image",
      image: { assetId: "batch-2" },
    });
    expect(getCellContent(f.sheet, { row: 2, column: 4 })).toMatchObject({
      kind: "image",
      image: { assetId: "batch-0" },
    });
    expect(getCellContent(f.sheet, { row: 3, column: 3 })).toMatchObject({
      kind: "image",
      image: { assetId: "batch-1" },
    });
    expect(getCellContent(f.sheet, { row: 2, column: 5 })).toBeNull();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    const inserted = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(inserted);
  });

  test("confirms reordered floating images with the chosen vertical spacing in one command", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.select("floating");
    await f.actions.confirmBatchInsertion({ order: [2, 0, 1], arrangement: "vertical" });

    expect(f.sheet.floatingImages).toMatchObject([
      { assetId: "batch-2", altText: "c.png", offsetX: 0, offsetY: 0, width: 140, height: 90 },
      { assetId: "batch-0", altText: "a.png", offsetX: 0, offsetY: 102, width: 100, height: 60 },
      { assetId: "batch-1", altText: "b.png", offsetX: 0, offsetY: 174, width: 80, height: 120 },
    ]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0].type).toBe("insertPictureBatch");
    expect(f.session.history.undoStack).toHaveLength(1);
    const inserted = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.floatingImages).toEqual([]);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(inserted);
  });

  test("skips the full merged-cell height when confirming a vertical cell batch", async () => {
    const f = fixture();
    f.sheet.mergedCells = [{ start: { row: 2, column: 3 }, end: { row: 4, column: 4 } }];
    await f.select("cell");
    await f.actions.confirmBatchInsertion({ order: [0, 1, 2], arrangement: "vertical" });

    for (const [index, row] of [2, 5, 6].entries())
      expect(getCellContent(f.sheet, { row, column: 3 })).toMatchObject({
        kind: "image",
        image: { assetId: `batch-${index}` },
      });
    expect(getCellContent(f.sheet, { row: 3, column: 3 })).toBeNull();
    expect(getCellContent(f.sheet, { row: 4, column: 3 })).toBeNull();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test.each(["switchSheet", "replaceSheet", "replaceWorkbook", "changeGeneration"] as const)(
    "rejects the staged batch after %s without decoding or writing",
    async (change) => {
      const f = fixture();
      await f.select("cell");
      f[change]();
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.confirmBatchInsertion({ order: [0, 1, 2], arrangement: "vertical" });

      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.batchInsertion.value).toBeNull();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test("cancels a confirmed batch while decoding without committing a late result", async () => {
    const f = fixture();
    let finish!: (asset: (typeof assets)[number]) => void;
    vi.mocked(prepareImageAsset).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await f.select("floating");
    const pending = f.actions.confirmBatchInsertion({
      order: [0, 1, 2],
      arrangement: "horizontal",
    });
    expect(f.actions.busy.value).toBe(true);
    f.actions.cancelPending();
    finish(assets[0]!);
    await pending;

    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toEqual([]);
    expect(f.actions.busy.value).toBe(false);
  });

  test.each([
    ["horizontal", { row: 0, column: MAX_SHEET_COLUMNS - 1 }],
    ["vertical", { row: MAX_SHEET_ROWS - 1, column: 0 }],
  ] as const)(
    "rejects a %s cell batch that cannot fit before decoding any source",
    async (arrangement, address) => {
      const f = fixture(address);
      await f.select("cell");
      await f.actions.confirmBatchInsertion({ order: [0, 1, 2], arrangement });
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.cells.size).toBe(0);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each([
    { order: [] },
    { order: [0, 0] },
    { order: [-1, 0] },
    { order: [3] },
    { order: [1.5] },
  ])("does not consume the draft for invalid order $order", async ({ order }) => {
    const f = fixture();
    await f.select("cell");
    const draft = f.actions.batchInsertion.value;
    await f.actions.confirmBatchInsertion({ order, arrangement: "vertical" });
    expect(f.actions.batchInsertion.value).toBe(draft);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each(["cell", "floating"] as const)(
    "keeps a single %s file on its existing direct insertion path",
    async (mode) => {
      const f = fixture();
      await f.select(mode, [files[0]!]);
      await flushPromises();
      expect(f.actions.batchInsertion.value).toBeNull();
      expect(f.execute).toHaveBeenCalledTimes(1);
      if (mode === "cell")
        expect(getCellContent(f.sheet, { row: 2, column: 3 })).toMatchObject({
          kind: "image",
          image: { assetId: "batch-0" },
        });
      else expect(f.sheet.floatingImages).toMatchObject([{ assetId: "batch-0" }]);
    },
  );
});
