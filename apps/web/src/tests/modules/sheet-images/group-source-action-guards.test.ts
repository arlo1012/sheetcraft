import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { downloadBlob } from "../../../shared/files/download";
import { fixture, group } from "./group-source-guard-fixture";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
vi.mock("../../../shared/files/download", () => ({ downloadBlob: vi.fn() }));
const settings = { format: "jpeg" as const, all: false, maxSide: 400, quality: 0.8 };
const file = new File(["image"], "source.png", { type: "image/png" });
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("source-only group resource guards", () => {
  test.each(["single", "mixed", "all"] as const)(
    "%s export and print reject before reads, conversion, download or popup",
    async (selection) => {
      const f = fixture();
      f.selectedIds.value =
        selection === "single" ? [f.container.id] : [f.image.id, f.container.id];
      const feedback = vi.fn();
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      const tools = usePictureAssetTools({
        getWorkbook: () => f.session.workbook,
        getSheet: () => f.sheet,
        getSelectedIds: () => f.selectedIds.value,
        assetStore: f.store,
        isBusy: () => false,
        execute: f.execute,
        feedback,
      });
      const before = serializeWorkbook(f.session.workbook);
      await tools.exportPictures("png", selection === "all");
      await tools.printPictures();
      expect(f.store.get).not.toHaveBeenCalled();
      expect(f.store.put).not.toHaveBeenCalled();
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(convertPictureBlob).not.toHaveBeenCalled();
      expect(downloadBlob).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(feedback).toHaveBeenCalledWith("picture.assetFailed", true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(tools.busy.value).toBe(false);
    },
  );
  test("a compression read returning after its source becomes a container cannot decode or store", async () => {
    const f = fixture();
    let finish!: (asset: typeof f.asset) => void;
    f.store.get.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const tools = usePictureAssetTools({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getSelectedIds: () => f.selectedIds.value,
      assetStore: f.store,
      isBusy: () => false,
      execute: f.execute,
      feedback: vi.fn(),
    });
    const working = tools.compress(settings);
    f.sheet.floatingImages[0] = group(f.image.id);
    finish(f.asset);
    expect(await working).toBe(false);
    expect(convertPictureBlob).not.toHaveBeenCalled();
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.store.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});

function actionFixture() {
  const f = fixture();
  const flush = vi.fn(() => true);
  const setFloatingImage = vi.fn(() => true);
  const setCellImage = vi.fn(() => true);
  const actions = useSheetImageActions({
    getWorkbook: () => f.session.workbook,
    getSheet: () => f.sheet,
    getAddress: () => ({ row: 0, column: 0 }),
    flushPendingEdits: flush,
    assetStore: f.store,
    execute: f.execute,
    setFloatingImage,
    setCellImage,
    convertCellImageToFloating: vi.fn(),
  });
  vi.mocked(prepareImageAsset).mockResolvedValue(f.asset);
  const input = document.createElement("input");
  input.type = "file";
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  actions.fileInput.value = input;
  return { ...f, actions, flush, setFloatingImage, setCellImage, input, click };
}
describe("source-only group image action guards", () => {
  test("replacement and single/mixed paste reject before picker, edit flush or source read", async () => {
    const f = actionFixture();
    const before = serializeWorkbook(f.session.workbook);
    await f.actions.requestReplace(f.container.id);
    await f.actions.insertFile(file, "floating", undefined, f.container.id);
    await f.actions.pasteFloatingImage(f.container);
    await f.actions.pasteFloatingImages([f.image, f.container], { row: 2, column: 3 });
    expect(f.click).not.toHaveBeenCalled();
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.store.get).not.toHaveBeenCalled();
    expect(f.store.put).not.toHaveBeenCalled();
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.setFloatingImage).not.toHaveBeenCalled();
    expect(f.setCellImage).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.feedback.value).toBe("clipboard.pasteRejected");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("a rejected container replacement keeps an already-open insertion request usable", async () => {
    const f = actionFixture();
    await f.actions.requestInsert("floating");
    const pickerKey = f.actions.pickerKey.value;
    await f.actions.requestReplace(f.container.id);
    expect(f.actions.pickerKey.value).toBe(pickerKey);
    expect(f.click).toHaveBeenCalledTimes(1);
    const data = new DataTransfer();
    data.items.add(file);
    Object.defineProperty(f.input, "files", { value: data.files });
    f.input.addEventListener("change", f.actions.onFileChange);
    f.input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(f.setFloatingImage).toHaveBeenCalledTimes(1));
    expect(f.store.put).toHaveBeenCalledTimes(1);
  });
  test("a source changing to a container during decode stops replacement before storage", async () => {
    const f = actionFixture();
    let finish!: (asset: typeof f.asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const working = f.actions.insertFile(file, "floating", undefined, f.image.id, f.image.assetId);
    f.sheet.floatingImages[0] = group(f.image.id);
    finish(f.asset);
    await working;
    expect(f.store.put).not.toHaveBeenCalled();
    expect(f.setFloatingImage).not.toHaveBeenCalled();
    expect(f.actions.busy.value).toBe(false);
  });
});
