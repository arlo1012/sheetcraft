import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@idea10/core/workbook";
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
function fixture() {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const store = createMemoryImageAssetStore();
  const setCellImage = vi.fn();
  const setFloatingImage = vi.fn();
  const actions = useSheetImageActions({
    assetStore: store,
    getWorkbook: () => workbook,
    getSheet: () => getActiveSheet(workbook),
    getAddress: () => ({ row: 2, column: 3 }),
    flushPendingEdits: () => true,
    setCellImage,
    setFloatingImage,
  });
  return {
    actions,
    store,
    setCellImage,
    setFloatingImage,
    getWorkbook: () => workbook,
    replace: () => {
      workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    },
  };
}
beforeEach(() => vi.mocked(prepareImageAsset).mockReset());
describe("sheet image insertion", () => {
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
});
