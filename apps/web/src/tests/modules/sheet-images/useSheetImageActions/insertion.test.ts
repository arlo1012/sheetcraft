import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type FloatingImage,
} from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { useSheetImageActions } from "../../../../modules/sheet-images/useSheetImageActions";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";

vi.mock("../../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
const file = new File(["PNG"], "diagram.png", { type: "image/png" });
const asset = { id: "asset", mimeType: "image/png", width: 800, height: 400, blob: file };
function existingImage(): FloatingImage {
  return {
    id: "existing-image",
    assetId: "original-asset",
    altText: "Original",
    anchor: { row: 5, column: 6 },
    offsetX: 17,
    offsetY: 23,
    width: 180,
    height: 95,
    transform: { crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 }, rotation: 90 },
  };
}
function fixture() {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const store = createMemoryImageAssetStore();
  const setCellImage = vi.fn();
  const setFloatingImage = vi.fn();
  const convertCellImageToFloating = vi.fn();
  const actions = useSheetImageActions({
    assetStore: store,
    getWorkbook: () => workbook,
    getSheet: () => getActiveSheet(workbook),
    getAddress: () => ({ row: 2, column: 3 }),
    flushPendingEdits: () => true,
    setCellImage,
    setFloatingImage,
    convertCellImageToFloating,
  });
  return {
    actions,
    store,
    setCellImage,
    setFloatingImage,
    convertCellImageToFloating,
    getWorkbook: () => workbook,
    replace: () => {
      workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    },
  };
}
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset();
});
describe("sheet image insertion", () => {
  test("replaces an image asset while retaining its identity, geometry, and edits", async () => {
    vi.mocked(prepareImageAsset).mockResolvedValue(asset);
    const f = fixture();
    const image = existingImage();
    const sheet = getActiveSheet(f.getWorkbook());
    sheet.floatingImages.push(image);
    f.setFloatingImage.mockImplementation(async (replacement) =>
      expect(await f.store.get(replacement.assetId)).toEqual(asset),
    );
    await f.actions.insertFile(file, "floating", undefined, image.id);
    expect(f.setFloatingImage).toHaveBeenCalledExactlyOnceWith(
      { ...image, assetId: asset.id, altText: file.name },
      sheet.id,
    );
    expect(f.setCellImage).not.toHaveBeenCalled();
  });

  test("does not recreate a replacement target deleted during image decoding", async () => {
    let resolve!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const f = fixture();
    const image = existingImage();
    const sheet = getActiveSheet(f.getWorkbook());
    sheet.floatingImages.push(image);
    const replacing = f.actions.insertFile(file, "floating", undefined, image.id);
    sheet.floatingImages = [];
    resolve(asset);
    await replacing;
    expect(f.setFloatingImage).not.toHaveBeenCalled();
    expect(sheet.floatingImages).toEqual([]);
    expect(f.actions.busy.value).toBe(false);
  });

  test.each(["decoding", "storage"] as const)(
    "keeps the original image when replacement %s fails",
    async (failure) => {
      const f = fixture();
      const image = existingImage();
      const sheet = getActiveSheet(f.getWorkbook());
      sheet.floatingImages.push(image);
      if (failure === "decoding")
        vi.mocked(prepareImageAsset).mockRejectedValue(new Error("decode"));
      else {
        vi.mocked(prepareImageAsset).mockResolvedValue(asset);
        vi.spyOn(f.store, "put").mockRejectedValue(new Error("quota"));
      }
      await f.actions.insertFile(file, "floating", undefined, image.id);
      expect(f.setFloatingImage).not.toHaveBeenCalled();
      expect(sheet.floatingImages).toEqual([image]);
      expect(image.assetId).toBe("original-asset");
      expect(f.actions.feedback.value).toBe("image.insertionFailed");
      expect(f.actions.busy.value).toBe(false);
    },
  );

  test.each(["protection", "workbook"] as const)(
    "cancels replacement when %s changes during decoding",
    async (change) => {
      let resolve!: (value: typeof asset) => void;
      vi.mocked(prepareImageAsset).mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const f = fixture();
      const image = existingImage();
      const sheet = getActiveSheet(f.getWorkbook());
      sheet.floatingImages.push(image);
      const replacing = f.actions.insertFile(file, "floating", undefined, image.id);
      if (change === "protection") sheet.properties.protected = true;
      else f.replace();
      resolve(asset);
      await replacing;
      expect(f.setFloatingImage).not.toHaveBeenCalled();
      expect(await f.store.get(asset.id)).toBeUndefined();
      expect(sheet.floatingImages).toEqual([image]);
      expect(f.actions.busy.value).toBe(false);
    },
  );

  test("opens the replacement picker only for an editable existing image", () => {
    const f = fixture();
    const image = existingImage();
    const sheet = getActiveSheet(f.getWorkbook());
    sheet.floatingImages.push(image);
    const input = document.createElement("input");
    input.type = "file";
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    f.actions.fileInput.value = input;
    f.actions.requestReplace("missing-image");
    expect(click).not.toHaveBeenCalled();
    f.actions.requestReplace(image.id);
    expect(click).toHaveBeenCalledTimes(1);
    sheet.properties.protected = true;
    f.actions.requestReplace(image.id);
    expect(click).toHaveBeenCalledTimes(1);
  });

  test("does not finish an image insertion after its target becomes protected", async () => {
    let resolve!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const f = fixture();
    const inserting = f.actions.insertFile(file, "cell");
    getActiveSheet(f.getWorkbook()).properties.protected = true;
    resolve(asset);
    await inserting;
    expect(f.setCellImage).not.toHaveBeenCalled();
    expect(await f.store.get(asset.id)).toBeUndefined();
    expect(f.actions.busy.value).toBe(false);
  });

  test("saves the asset before dispatching a cell-image edit", async () => {
    vi.mocked(prepareImageAsset).mockResolvedValue(asset);
    const f = fixture();
    f.setCellImage.mockImplementation(async ({ assetId }) =>
      expect(await f.store.get(assetId)).toEqual(asset),
    );
    await f.actions.insertFile(file, "cell");
    expect(f.setCellImage).toHaveBeenCalledWith({
      sheetId: getActiveSheet(f.getWorkbook()).id,
      address: { row: 2, column: 3 },
      assetId: "asset",
      altText: "diagram.png",
    });
    expect(f.setFloatingImage).not.toHaveBeenCalled();
  });
  test("fits the initial floating image while preserving its aspect ratio", async () => {
    vi.mocked(prepareImageAsset).mockResolvedValue(asset);
    const f = fixture();
    await f.actions.insertFile(file, "floating");
    expect(f.setFloatingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 400,
        height: 200,
        anchor: { row: 2, column: 3 },
        offsetX: 0,
        offsetY: 0,
      }),
      getActiveSheet(f.getWorkbook()).id,
    );
  });
  test("does not insert into a replacement workbook after delayed image decoding", async () => {
    let resolve!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const f = fixture();
    const inserting = f.actions.insertFile(file, "cell");
    f.replace();
    resolve(asset);
    await inserting;
    expect(f.setCellImage).not.toHaveBeenCalled();
    expect(f.actions.busy.value).toBe(false);
  });
  test("does not edit the document when storing its image fails", async () => {
    vi.mocked(prepareImageAsset).mockResolvedValue(asset);
    const f = fixture();
    vi.spyOn(f.store, "put").mockRejectedValue(new Error("quota"));
    await f.actions.insertFile(file, "cell");
    expect(f.setCellImage).not.toHaveBeenCalled();
    expect(f.actions.feedback.value).toBe("image.insertionFailed");
  });
  test("sizes a cropped and rotated cell image by its edited display aspect", async () => {
    const f = fixture();
    await f.store.put(asset);
    const sheet = getActiveSheet(f.getWorkbook());
    setCellContent(
      sheet,
      { row: 2, column: 3 },
      {
        kind: "image",
        image: {
          assetId: asset.id,
          altText: "",
          transform: { crop: { x: 0, y: 0, width: 0.5, height: 0.25 }, rotation: 90 },
        },
      },
    );
    await f.actions.convertCellImageToFloating({ row: 2, column: 3 });
    expect(f.convertCellImageToFloating).toHaveBeenCalledWith(
      expect.objectContaining({ size: { width: 75, height: 300 } }),
    );
  });

  test("pastes a copied floating image into the target cell without duplicating the object", async () => {
    const f = fixture();
    await f.store.put(asset);
    await f.actions.pasteFloatingImage(
      {
        id: "floating-image",
        assetId: asset.id,
        altText: "Diagram",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.75 }, rotation: 90 },
      },
      "cell",
    );
    expect(f.setCellImage).toHaveBeenCalledWith({
      sheetId: getActiveSheet(f.getWorkbook()).id,
      address: { row: 2, column: 3 },
      assetId: asset.id,
      altText: "Diagram",
      transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.75 }, rotation: 90 },
    });
    expect(f.setFloatingImage).not.toHaveBeenCalled();
  });
});
