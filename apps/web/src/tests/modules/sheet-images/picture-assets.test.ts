import { framedPicture } from "./framed-picture-fixture";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
const sourceBlob = new Blob(["original picture bytes"], { type: "image/png" });
const smaller = new Blob(["small"], { type: "image/jpeg" });
const source = { id: "original", blob: sourceBlob, mimeType: "image/png", width: 800, height: 400 };
const compressed = {
  id: "compressed",
  blob: smaller,
  mimeType: "image/jpeg",
  width: 400,
  height: 200,
};
const settings = { all: false, format: "jpeg" as const, maxSide: 400, quality: 0.8 };
function picture(id: string): FloatingImage {
  return {
    id,
    assetId: source.id,
    altText: id,
    anchor: { row: 2, column: 3 },
    offsetX: 17,
    offsetY: 23,
    width: 180,
    height: 95,
    transform: {
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      rotation: 90,
      appearance: { brightness: 1.2 },
    },
  };
}
async function fixture() {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.floatingImages = [picture("a"), picture("b"), picture("untouched")];
  const store = createMemoryImageAssetStore();
  await store.put(source);
  const feedback = vi.fn();
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const tools = usePictureAssetTools({
    getWorkbook: () => workbook,
    getSheet: () => getActiveSheet(workbook),
    getSelectedIds: () => ["a", "b"],
    assetStore: store,
    isBusy: () => false,
    execute,
    feedback,
  });
  return {
    tools,
    sheet,
    store,
    execute,
    feedback,
    replaceWorkbook: () => {
      workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    },
  };
}
beforeEach(() => {
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(smaller);
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(compressed);
});

describe("picture asset compression", () => {
  test("frame downloads stay gated and a missing real source fails compression without writes", async () => {
    const f = await fixture();
    f.sheet.floatingImages[0] = { ...framedPicture(), id: "a" };
    const read = vi.spyOn(f.store, "get"),
      put = vi.spyOn(f.store, "put"),
      popup = vi.spyOn(window, "open");
    await f.tools.exportPictures("png");
    await f.tools.printPictures();
    expect(read).not.toHaveBeenCalled();
    expect(await f.tools.compress(settings)).toBe(false);
    expect(read).toHaveBeenCalledExactlyOnceWith("asset");
    expect(put).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
    expect(convertPictureBlob).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("stores the shared compressed asset before one collection command and preserves picture edits", async () => {
    const f = await fixture();
    const before = structuredClone(f.sheet.floatingImages);
    let persisted = false;
    const put = f.store.put.bind(f.store);
    vi.spyOn(f.store, "put").mockImplementation(async (asset) => {
      await put(asset);
      persisted = asset.id === compressed.id;
    });
    const apply = f.execute.getMockImplementation()!;
    f.execute.mockImplementation((command) => {
      expect(command.type).toBe("setSheetFloatingImages");
      expect(persisted).toBe(true);
      return apply(command);
    });
    expect(await f.tools.compress(settings)).toBe(true);
    expect(convertPictureBlob).toHaveBeenCalledExactlyOnceWith(
      sourceBlob,
      undefined,
      "jpeg",
      400,
      0.8,
    );
    expect(prepareImageAsset).toHaveBeenCalledExactlyOnceWith(smaller);
    expect(f.execute).toHaveBeenCalledExactlyOnceWith({
      type: "setSheetFloatingImages",
      sheetId: f.sheet.id,
      images: before.map((image) =>
        image.id === "untouched" ? image : { ...image, assetId: compressed.id },
      ),
    });
    expect(f.feedback).toHaveBeenCalledWith("picture.compressed");
    expect(f.sheet.floatingImages).toEqual(
      before.map((image) =>
        image.id === "untouched" ? image : { ...image, assetId: compressed.id },
      ),
    );
    expect(f.tools.busy.value).toBe(false);
  });

  test("keeps original assets and avoids a command when the converted blob is larger", async () => {
    const f = await fixture();
    const before = structuredClone(f.sheet.floatingImages);
    vi.mocked(convertPictureBlob).mockResolvedValue(new Blob(["x".repeat(sourceBlob.size + 1)]));
    expect(await f.tools.compress(settings)).toBe(true);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toEqual(before);
    expect(f.feedback).toHaveBeenCalledWith("picture.noSmaller");
  });

  test.each(["workbook", "protection", "deletion"] as const)(
    "does not modify pictures after %s changes during decoding",
    async (change) => {
      const f = await fixture();
      let entered!: () => void;
      const decoding = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let finish!: (asset: typeof compressed) => void;
      vi.mocked(prepareImageAsset).mockImplementation(() => {
        entered();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const pending = f.tools.compress(settings);
      await decoding;
      if (change === "workbook") f.replaceWorkbook();
      if (change === "protection") f.sheet.properties.protected = true;
      if (change === "deletion")
        f.sheet.floatingImages = f.sheet.floatingImages.filter((image) => image.id !== "a");
      const remaining = structuredClone(f.sheet.floatingImages);
      finish(compressed);
      expect(await pending).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(await f.store.get(compressed.id)).toBeUndefined();
      expect(f.sheet.floatingImages).toEqual(remaining);
      expect(f.tools.busy.value).toBe(false);
    },
  );

  test.each(["conversion", "decoding", "storage"] as const)(
    "reports %s failures without editing pictures",
    async (failure) => {
      const f = await fixture();
      const before = structuredClone(f.sheet.floatingImages);
      if (failure === "conversion")
        vi.mocked(convertPictureBlob).mockRejectedValue(new Error("convert"));
      if (failure === "decoding")
        vi.mocked(prepareImageAsset).mockRejectedValue(new Error("decode"));
      if (failure === "storage") vi.spyOn(f.store, "put").mockRejectedValue(new Error("quota"));
      expect(await f.tools.compress(settings)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.floatingImages).toEqual(before);
      expect(f.feedback).toHaveBeenCalledWith("picture.assetFailed", true);
      expect(f.tools.busy.value).toBe(false);
    },
  );
});
