import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@idea10/core/workbook";
import { DEFAULT_SHEET_WATERMARK } from "@idea10/core/page-decoration";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { usePageDecorationActions } from "../../../modules/page-decorations/usePageDecorationActions";

vi.mock("../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
const file = new File(["PNG"], "background.png", { type: "image/png" });
const asset = { id: "asset-background", mimeType: "image/png", width: 8, height: 8, blob: file };

describe("page decoration image actions", () => {
  beforeEach(() => vi.mocked(prepareImageAsset).mockReset());

  test("does not apply a background to a replacement workbook after image decoding", async () => {
    let resolve!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const setDecoration = vi.fn();
    const actions = usePageDecorationActions({
      assetStore: createMemoryImageAssetStore(),
      getWorkbook: () => workbook,
      getSheet: () => getActiveSheet(workbook),
      getGeneration: () => 0,
      flushPendingEdits: () => true,
      setDecoration,
      setWatermarks: vi.fn(),
      setPresets: vi.fn(),
    });
    const pending = actions.setBackgroundFile(file);
    workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    resolve(asset);
    await pending;
    expect(setDecoration).not.toHaveBeenCalled();
    expect(actions.busy.value).toBe(false);
  });

  test("stores a custom watermark image before applying to all target sheets", async () => {
    vi.mocked(prepareImageAsset).mockResolvedValue(asset);
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const store = createMemoryImageAssetStore();
    const setWatermarks = vi.fn();
    const actions = usePageDecorationActions({
      assetStore: store,
      getWorkbook: () => workbook,
      getSheet: () => getActiveSheet(workbook),
      flushPendingEdits: () => true,
      setDecoration: vi.fn(),
      setWatermarks,
      setPresets: vi.fn(),
    });
    const watermark = {
      ...DEFAULT_SHEET_WATERMARK,
      text: "",
      image: { assetId: "preview", scale: null, washout: true, angle: 0 },
    };
    expect(
      await actions.applyWatermark(watermark, "workbook", file, { id: "custom", name: "Company" }),
    ).toBe(true);
    expect(await store.get(asset.id)).toBe(asset);
    const saved = { ...watermark, image: { ...watermark.image, assetId: asset.id } };
    expect(setWatermarks).toHaveBeenCalledWith([...workbook.sheets.keys()], saved, [
      { id: "custom", name: "Company", watermark: saved },
    ]);
    expect(watermark.image.assetId).toBe("preview");
  });

  test("cancelling a pending custom image leaves workbook state untouched", async () => {
    let resolve!: (value: typeof asset) => void;
    vi.mocked(prepareImageAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const setWatermarks = vi.fn();
    const actions = usePageDecorationActions({
      assetStore: createMemoryImageAssetStore(),
      getWorkbook: () => workbook,
      getSheet: () => getActiveSheet(workbook),
      flushPendingEdits: () => true,
      setDecoration: vi.fn(),
      setWatermarks,
      setPresets: vi.fn(),
    });
    const pending = actions.applyWatermark(
      {
        ...DEFAULT_SHEET_WATERMARK,
        image: { assetId: "preview", scale: null, washout: true, angle: 0 },
      },
      "sheet",
      file,
    );
    actions.cancelWatermark();
    resolve(asset);
    expect(await pending).toBe(false);
    expect(setWatermarks).not.toHaveBeenCalled();
  });
});
