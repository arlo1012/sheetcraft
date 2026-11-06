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
import { getActiveSheet, getCellContent, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { analyzePictureNameMatches } from "../../../modules/sheet-images/picture-name-matching";
import type { PictureBatchInsertion } from "../../../modules/sheet-images/picture-batch-layout";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
const files = ["alpha.png", "missing.png", "beta.jpg"].map(
  (name) => new File([name], name, { type: "image/png" }),
);
const assets = files.map((blob, index) => ({
  id: `name-asset-${index}`,
  blob,
  mimeType: "image/png",
  width: 100,
  height: 60,
}));
const nameRange = { start: { row: 2, column: 2 }, end: { row: 4, column: 2 } };
const scopes: ReturnType<typeof effectScope>[] = [];
beforeEach(() => {
  vi.mocked(prepareImageAsset)
    .mockReset()
    .mockImplementation(async (file) => {
      const asset = assets.find((candidate) => candidate.blob === file);
      if (!asset) throw new Error("Unexpected matching source");
      return asset;
    });
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  sheet.defaultColumnWidth = 120;
  setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: " alpha " });
  setCellContent(
    sheet,
    { row: 3, column: 2 },
    { kind: "formula", formula: { source: '="beta.jpg"' } },
  );
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
      getAddress: () => ({ row: 0, column: 0 }),
      flushPendingEdits: () => true,
      setCellImage: ({ sheetId, address, ...image }) =>
        execute(
          createBatchSetCellContentsCommand([
            { sheetId, address, content: { kind: "image", image } },
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
    sheet,
    store,
    put,
    execute,
    actions,
    async select(mode: "cell" | "floating" = "cell") {
      await actions.requestInsert(mode);
      Object.defineProperty(input, "files", { value: files, configurable: true });
      actions.onFileChange({ target: input } as unknown as Event);
    },
  };
}
function configuration(
  f: ReturnType<typeof fixture>,
  order = [2, 1, 0],
  rowHeight?: number,
): PictureBatchInsertion {
  const plan = analyzePictureNameMatches(
    f.session.workbook,
    f.sheet.id,
    order.map((index) => files[index]!.name),
    nameRange,
    "vertical",
    "before",
  );
  return {
    order,
    arrangement: "vertical",
    namePlacement: "before",
    rowHeight,
    nameMatch: { range: nameRange, fingerprint: plan.fingerprint },
  };
}

describe("inserting pictures at existing names", () => {
  test.each(["cell", "floating"] as const)(
    "inserts only matched %s files in requested order while preserving names and one Undo/Redo transaction",
    async (mode) => {
      const f = fixture();
      const originalNames = [
        getCellContent(f.sheet, { row: 2, column: 2 }),
        getCellContent(f.sheet, { row: 3, column: 2 }),
      ];
      const before = serializeWorkbook(f.session.workbook);
      await f.select(mode);
      await f.actions.confirmBatchInsertion(configuration(f, [2, 1, 0], 100));

      expect(vi.mocked(prepareImageAsset).mock.calls.map(([file]) => file)).toEqual([
        files[2],
        files[0],
      ]);
      expect(f.put.mock.calls.map(([asset]) => asset.id)).toEqual(["name-asset-2", "name-asset-0"]);
      expect(await f.store.get("name-asset-1")).toBeUndefined();
      if (mode === "cell") {
        expect(getCellContent(f.sheet, { row: 3, column: 3 })).toMatchObject({
          kind: "image",
          image: { assetId: "name-asset-2" },
        });
        expect(getCellContent(f.sheet, { row: 2, column: 3 })).toMatchObject({
          kind: "image",
          image: { assetId: "name-asset-0" },
        });
      } else
        expect(f.sheet.floatingImages).toMatchObject([
          { assetId: "name-asset-2", anchor: { row: 3, column: 3 } },
          { assetId: "name-asset-0", anchor: { row: 2, column: 3 } },
        ]);
      expect([
        getCellContent(f.sheet, { row: 2, column: 2 }),
        getCellContent(f.sheet, { row: 3, column: 2 }),
      ]).toEqual(originalNames);
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

  test.each(["changed source", "duplicate source", "no remaining matches"] as const)(
    "keeps the batch for review after %s without decoding or writing",
    async (change) => {
      const f = fixture();
      await f.select();
      const batch = f.actions.batchInsertion.value;
      let payload = configuration(f);
      if (change === "changed source")
        setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "renamed" });
      else if (change === "duplicate source") {
        setCellContent(f.sheet, { row: 4, column: 2 }, { kind: "literal", value: "alpha" });
        payload = configuration(f);
      } else {
        setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "unrelated" });
        setCellContent(f.sheet, { row: 3, column: 2 }, { kind: "literal", value: "unrelated too" });
        payload = configuration(f);
      }
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.confirmBatchInsertion(payload);
      expect(f.actions.batchInsertion.value).toBe(batch);
      expect(f.actions.batchError.value).toBe("image.batchMatchChanged");
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("reads protected names selected after an editable starting cell without writing the name cells", async () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = {
      editableRanges: [
        {
          name: "Starting cell",
          range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
        {
          name: "Picture destinations",
          range: { start: { row: 2, column: 3 }, end: { row: 3, column: 3 } },
        },
      ],
      editObjects: true,
    };
    const names = [
      getCellContent(f.sheet, { row: 2, column: 2 }),
      getCellContent(f.sheet, { row: 3, column: 2 }),
    ];
    await f.select();
    await f.actions.confirmBatchInsertion(configuration(f));
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(getCellContent(f.sheet, { row: 2, column: 3 })?.kind).toBe("image");
    expect(getCellContent(f.sheet, { row: 3, column: 3 })?.kind).toBe("image");
    expect([
      getCellContent(f.sheet, { row: 2, column: 2 }),
      getCellContent(f.sheet, { row: 3, column: 2 }),
    ]).toEqual(names);
  });

  test("retains matching and custom row height when the user keeps a single file", async () => {
    const f = fixture();
    await f.select();
    await f.actions.confirmBatchInsertion(configuration(f, [2], 110));
    expect(prepareImageAsset).toHaveBeenCalledExactlyOnceWith(files[2]);
    expect(getCellContent(f.sheet, { row: 3, column: 3 })).toMatchObject({
      kind: "image",
      image: { assetId: "name-asset-2" },
    });
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: '="beta.jpg"' },
    });
    expect(f.sheet.rowHeights.get(3)).toBe(110);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0].type).toBe("insertPictureBatch");
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each(["decode", "store", "overwrite confirmation"] as const)(
    "rechecks name fingerprints during %s and preserves later source edits",
    async (phase) => {
      const f = fixture();
      if (phase === "overwrite confirmation")
        setCellContent(
          f.sheet,
          { row: 3, column: 3 },
          { kind: "literal", value: "Occupied destination" },
        );
      let finishDecode!: (asset: (typeof assets)[number]) => void;
      let finishStore!: () => void;
      const decoded = new Promise<(typeof assets)[number]>((resolve) => {
        finishDecode = resolve;
      });
      const stored = new Promise<void>((resolve) => {
        finishStore = resolve;
      });
      if (phase === "decode") vi.mocked(prepareImageAsset).mockReturnValueOnce(decoded);
      if (phase === "store") f.put.mockReturnValueOnce(stored);
      await f.select();
      const pending = f.actions.confirmBatchInsertion(configuration(f));
      if (phase === "store") {
        await flushPromises();
        expect(f.put).toHaveBeenCalledTimes(1);
      }
      if (phase === "overwrite confirmation") await pending;
      setCellContent(
        f.sheet,
        { row: 2, column: 2 },
        { kind: "literal", value: "Renamed while pending" },
      );
      const before = serializeWorkbook(f.session.workbook);
      finishDecode(assets[2]!);
      finishStore();
      await pending;
      if (phase === "overwrite confirmation")
        expect(await f.actions.insertionConfirmation.value!.confirm()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.actions.feedback.value).toBe("image.batchMatchChanged");
    },
  );
});
