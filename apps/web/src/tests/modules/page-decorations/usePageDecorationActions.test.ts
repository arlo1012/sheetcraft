import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import { createSetSheetPageDecorationCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
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
  beforeEach(() => {
    vi.mocked(prepareImageAsset).mockReset();
  });

  test.each(["independent", "remove"] as const)(
    "resolves background conflict with %s atomically and restores it on undo",
    async (resolution) => {
      vi.mocked(prepareImageAsset).mockResolvedValue(asset);
      const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
      const sheet = getActiveSheet(session.workbook);
      const watermark = { ...DEFAULT_SHEET_WATERMARK, text: "Confidential" };
      sheet.pageDecoration = { watermark };
      const actions = usePageDecorationActions({
        assetStore: createMemoryImageAssetStore(),
        getWorkbook: () => session.workbook,
        getSheet: () => sheet,
        flushPendingEdits: () => true,
        setDecoration: (id, decoration) => {
          executeWorkbookCommand(session, createSetSheetPageDecorationCommand(id, decoration));
        },
        setWatermarks: vi.fn(),
        setPresets: vi.fn(),
      });
      await actions.setBackgroundFile(file);
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(sheet.pageDecoration).toEqual({ watermark });
      await actions.setBackgroundFile(file, resolution);
      expect(sheet.pageDecoration).toEqual({
        backgroundAssetId: asset.id,
        ...(resolution === "independent"
          ? { watermark: { ...watermark, mode: "independent" } }
          : {}),
      });
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(sheet.pageDecoration).toEqual({ watermark });
      expect(session.history.undoStack).toHaveLength(0);
    },
  );

  test("failed background decoding never deletes an existing watermark", async () => {
    vi.mocked(prepareImageAsset).mockRejectedValue(new Error("decode failed"));
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(workbook);
    sheet.pageDecoration = { watermark: { ...DEFAULT_SHEET_WATERMARK, text: "Confidential" } };
    const setDecoration = vi.fn();
    const actions = usePageDecorationActions({
      assetStore: createMemoryImageAssetStore(),
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      flushPendingEdits: () => true,
      setDecoration,
      setWatermarks: vi.fn(),
      setPresets: vi.fn(),
    });
    await actions.setBackgroundFile(file, "remove");
    expect(setDecoration).not.toHaveBeenCalled();
    expect(actions.feedback.value).toBe("failed");
  });

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
