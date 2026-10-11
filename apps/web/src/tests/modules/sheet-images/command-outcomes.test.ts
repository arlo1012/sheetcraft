import { ref } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createSetCellContentCommand,
  createSetFloatingImageCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getActiveSheet, setCellContent, type FloatingImage } from "@sheetcraft/core/workbook";
import {
  deserializeSheet,
  serializeSheet,
  serializeWorkbook,
} from "@sheetcraft/core/serialization";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
import { usePictureTools } from "../../../modules/sheet-images/usePictureTools";

vi.mock("../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
const file = new File(["source bytes"], "new.png", { type: "image/png" });
const source = { id: "original", blob: file, mimeType: "image/png", width: 400, height: 200 };
const smaller = new Blob(["x"], { type: "image/jpeg" });
const asset = { ...source, id: "replacement", blob: smaller, mimeType: "image/jpeg" };
function image(): FloatingImage {
  return {
    id: "picture",
    assetId: source.id,
    altText: "Original",
    anchor: { row: 1, column: 2 },
    offsetX: 3,
    offsetY: 7,
    width: 200,
    height: 100,
  };
}
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const store = createMemoryImageAssetStore();
  let reject = false;
  let refusedSnapshot: ReturnType<typeof serializeWorkbook> | undefined;
  const execute = vi.fn((command: WorkbookCommand) => {
    if (reject) {
      // Reproduce a real permission transition at the authoritative command
      // boundary; the initial Web preflight was legitimately allowed.
      sheet.properties.protected = true;
      refusedSnapshot = serializeWorkbook(session.workbook);
      try {
        return executeWorkbookCommand(session, command);
      } catch {
        return false;
      }
    }
    return executeWorkbookCommand(session, command);
  });
  const actions = useSheetImageActions({
    assetStore: store,
    getWorkbook: () => session.workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 3, column: 4 }),
    flushPendingEdits: () => true,
    execute,
    setCellImage: (value) =>
      execute(
        createSetCellContentCommand(value.sheetId, value.address, {
          kind: "image",
          image: { assetId: value.assetId, altText: value.altText, transform: value.transform },
        }),
      ),
    setFloatingImage: (value, sheetId) => execute(createSetFloatingImageCommand(sheetId, value)),
    convertCellImageToFloating: () => false,
  });
  const assertRefused = () => {
    expect(refusedSnapshot).toBeDefined();
    expect(serializeWorkbook(session.workbook)).toEqual(refusedSnapshot);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(0);
  };
  return { session, sheet, store, execute, actions, assertRefused, refuse: () => (reject = true) };
}
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(smaller);
});

describe("authoritative picture command outcomes", () => {
  test("pasting identical transformed cell content is an informational no-op", async () => {
    const f = fixture();
    await f.store.put(source);
    const picture = {
      ...image(),
      transform: { crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }, rotation: 90 as const },
    };
    setCellContent(f.sheet, { row: 3, column: 4 }, { kind: "image", image: picture });
    const before = serializeWorkbook(f.session.workbook);
    await f.actions.pasteFloatingImage(picture, "cell");
    expect(f.actions.feedback.value).toBe("image.unchanged");
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test.each([false, true])(
    "cell batch matching with one changed cell=%s remains atomic",
    async (changed) => {
      const f = fixture();
      vi.mocked(prepareImageAsset).mockResolvedValue(source);
      setCellContent(
        f.sheet,
        { row: 3, column: 4 },
        {
          kind: "image",
          image: { assetId: source.id, altText: file.name },
        },
      );
      setCellContent(
        f.sheet,
        { row: 4, column: 4 },
        {
          kind: "image",
          image: { assetId: changed ? "other" : source.id, altText: file.name },
        },
      );
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.insertFiles([file, file], "cell");
      expect(f.actions.feedback.value).toBe(changed ? "image.inserted" : "image.unchanged");
      expect(f.execute).toHaveBeenCalledTimes(changed ? 1 : 0);
      expect(f.session.history.undoStack).toHaveLength(changed ? 1 : 0);
      if (changed) expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );
  test.each(["cell", "floating"] as const)(
    "an extreme aspect ratio reports placement distinctly in %s mode",
    async (mode) => {
      const f = fixture();
      vi.mocked(prepareImageAsset).mockResolvedValue({ ...asset, width: 12000, height: 1 });
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.insertFile(file, mode);
      expect(f.actions.feedback.value).toBe(
        mode === "cell" ? "image.inserted" : "image.placementFailed",
      );
      expect(f.execute).toHaveBeenCalledTimes(mode === "cell" ? 1 : 0);
      expect(f.session.history.undoStack).toHaveLength(mode === "cell" ? 1 : 0);
      if (mode === "floating") expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );
  test("an unplaceable second batch picture does not commit or store the first", async () => {
    const f = fixture();
    vi.mocked(prepareImageAsset)
      .mockReset()
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce({ ...asset, id: "thin", width: 12000, height: 1 });
    const before = serializeWorkbook(f.session.workbook);
    await f.actions.insertFiles([file, file], "floating");
    expect(f.actions.feedback.value).toBe("image.placementFailed");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(await f.store.get(asset.id)).toBeUndefined();
  });

  test("successful insertion remains one reversible Core history transaction", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.actions.insertFile(file, "floating");
    const after = serializeWorkbook(f.session.workbook);
    expect(f.sheet.floatingImages).toHaveLength(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test.each(["cell", "floating"] as const)(
    "an identical %s source/state is accepted as unchanged without a command",
    async (mode) => {
      const f = fixture();
      vi.mocked(prepareImageAsset).mockResolvedValue(source);
      if (mode === "floating") f.sheet.floatingImages = [{ ...image(), altText: file.name }];
      else
        setCellContent(
          f.sheet,
          { row: 3, column: 4 },
          {
            kind: "image",
            image: { assetId: source.id, altText: file.name },
          },
        );
      const before = serializeWorkbook(f.session.workbook);
      await f.actions.insertFile(
        file,
        mode,
        undefined,
        mode === "floating" ? "picture" : undefined,
      );
      expect(f.actions.feedback.value).toBe("image.unchanged");
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test.each(["cell", "floating"] as const)(
    "a refused single %s insertion preserves the real document/history and never reports inserted",
    async (mode) => {
      const f = fixture();
      f.refuse();
      await f.actions.insertFile(file, mode);
      f.assertRefused();
      expect(f.actions.feedback.value).toBe("image.insertionFailed");
    },
  );
  test.each(["cell", "floating"] as const)(
    "a refused %s batch preserves the real document/history and never reports inserted",
    async (mode) => {
      const f = fixture();
      let count = 0;
      vi.mocked(prepareImageAsset).mockImplementation(async () => ({
        ...asset,
        id: `replacement-${count++}`,
      }));
      f.refuse();
      await f.actions.insertFiles([file, file], mode);
      f.assertRefused();
      expect(f.actions.feedback.value).toBe("image.insertionFailed");
    },
  );
  test("a refused compression retains the original pictures/history and returns failure", async () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    await f.store.put(source);
    const feedback = vi.fn();
    const tools = usePictureAssetTools({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getSelectedIds: () => ["picture"],
      assetStore: f.store,
      isBusy: () => false,
      execute: f.execute,
      feedback,
    });
    f.refuse();
    expect(await tools.compress({ all: false, format: "jpeg", maxSide: 400, quality: 0.8 })).toBe(
      false,
    );
    f.assertRefused();
    expect(feedback).toHaveBeenCalledWith("picture.assetFailed", true);
    expect(feedback).not.toHaveBeenCalledWith("picture.compressed");
  });
  test("a refused batch resize returns false without a history mutation", () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: ref(["picture"]),
      isBusy: () => false,
      execute: f.execute,
    });
    f.refuse();
    expect(tools.resizeMany({ width: 320, height: 180, locked: false, all: false })).toBe(false);
    expect(tools.sizeFeedback.value).toBe("picture.operationFailed");
    f.assertRefused();
  });
  test("invalid dimensions keep a distinct size validation message", () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: ref(["picture"]),
      isBusy: () => false,
      execute: f.execute,
    });
    expect(tools.resizeMany({ width: 0, height: 180, locked: false, all: false })).toBe(false);
    expect(tools.sizeFeedback.value).toBe("picture.invalidSize");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("an unchanged batch resize is accepted without creating history", () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: ref(["picture"]),
      isBusy: () => false,
      execute: f.execute,
    });
    expect(tools.resizeMany({ width: 200, height: 100, locked: false, all: false })).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("an old replacement decode cannot overwrite a newer source on the same picture ID", async () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    let finish!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = f.actions.insertFile(file, "floating", undefined, "picture");
    executeWorkbookCommand(
      f.session,
      createSetFloatingImageCommand(f.sheet.id, { ...image(), assetId: "newer-source" }),
    );
    const before = serializeWorkbook(f.session.workbook);
    finish(asset);
    await pending;
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(await f.store.get(asset.id)).toBeUndefined();
  });
  test.each(["decoding", "storage"] as const)(
    "an insertion cannot target a new Sheet instance restored with the same ID during %s",
    async (boundary) => {
      const f = fixture();
      let finish!: () => void;
      const waiting = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      if (boundary === "decoding")
        vi.mocked(prepareImageAsset).mockImplementation(async () => {
          entered();
          await waiting;
          return asset;
        });
      else {
        const put = f.store.put.bind(f.store);
        vi.spyOn(f.store, "put").mockImplementation(async (value) => {
          entered();
          await waiting;
          await put(value);
        });
      }
      const pending = f.actions.insertFile(file, "floating");
      await entry;
      const restored = deserializeSheet(serializeSheet(f.sheet));
      f.session.workbook.sheets.set(f.sheet.id, restored);
      const before = serializeWorkbook(f.session.workbook);
      finish();
      await pending;
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("the file picker retains the originally requested replacement source identity", async () => {
    const f = fixture();
    f.sheet.floatingImages = [image()];
    const input = document.createElement("input");
    input.type = "file";
    vi.spyOn(input, "click").mockImplementation(() => undefined);
    f.actions.fileInput.value = input;
    f.actions.requestReplace("picture");
    executeWorkbookCommand(
      f.session,
      createSetFloatingImageCommand(f.sheet.id, { ...image(), assetId: "newer-source" }),
    );
    const before = serializeWorkbook(f.session.workbook);
    Object.defineProperty(input, "files", { value: [file] });
    f.actions.onFileChange({ target: input } as unknown as Event);
    await Promise.resolve();
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
