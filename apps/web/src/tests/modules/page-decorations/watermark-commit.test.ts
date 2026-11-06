// 未执行：按用户要求仅编写测试，不运行检查。
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSheet, getActiveSheet, insertSheet } from "@sheetcraft/core/workbook";
import {
  DEFAULT_SHEET_WATERMARK,
  type SheetWatermark,
  type WatermarkPreset,
} from "@sheetcraft/core/page-decoration";
import { createSetSheetsWatermarkCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { usePageDecorationActions } from "../../../modules/page-decorations/usePageDecorationActions";

vi.mock("../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));

const watermark: SheetWatermark = { ...DEFAULT_SHEET_WATERMARK, text: "Confidential" };
const file = new File(["PNG"], "watermark.png", { type: "image/png" });

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const second = createSheet("Second", "second");
  insertSheet(session.workbook, second);
  sheet.pageDecoration = { backgroundAssetId: "background-first" };
  second.pageDecoration = { backgroundAssetId: "background-second" };
  const setWatermarks = vi.fn(
    (ids: string[], value: SheetWatermark | undefined, presets?: readonly WatermarkPreset[]) =>
      executeWorkbookCommand(session, createSetSheetsWatermarkCommand(ids, value, presets)),
  );
  const actions = usePageDecorationActions({
    assetStore: createMemoryImageAssetStore(),
    getWorkbook: () => session.workbook,
    getSheet: () => sheet,
    flushPendingEdits: () => true,
    setDecoration: vi.fn(),
    setWatermarks,
    setPresets: vi.fn(),
  });
  return { session, sheet, second, setWatermarks, actions };
}

beforeEach(() => vi.mocked(prepareImageAsset).mockReset());

describe("watermark commit outcomes", () => {
  test("keeps a rejected change open and permits a successful retry without losing backgrounds", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    f.setWatermarks.mockReturnValueOnce(false);
    expect(await f.actions.applyWatermark(watermark, "workbook")).toBe(false);
    expect(f.actions.feedback.value).toBe("failed");
    expect(f.actions.busy.value).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(await f.actions.applyWatermark(watermark, "workbook")).toBe(true);
    expect(f.actions.feedback.value).toBeUndefined();
    expect(f.actions.busy.value).toBe(false);
    expect(f.setWatermarks).toHaveBeenCalledTimes(2);
    expect(f.sheet.pageDecoration).toEqual({ backgroundAssetId: "background-first", watermark });
    expect(f.second.pageDecoration).toEqual({ backgroundAssetId: "background-second", watermark });
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("accepts a real Core no-op across every target sheet and the preset catalog without adding history", async () => {
    const f = fixture();
    f.sheet.pageDecoration = { ...f.sheet.pageDecoration, watermark };
    f.second.pageDecoration = { ...f.second.pageDecoration, watermark };
    f.session.workbook.watermarkPresets = [{ id: "company", name: "Company", watermark }];
    const before = serializeWorkbook(f.session.workbook);
    expect(
      await f.actions.applyWatermark(watermark, "workbook", undefined, {
        id: "company",
        name: "Company",
      }),
    ).toBe(true);
    expect(f.actions.feedback.value).toBeUndefined();
    expect(f.actions.busy.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("does not treat a matching active sheet as a no-op when another target differs", async () => {
    const f = fixture();
    f.sheet.pageDecoration = { ...f.sheet.pageDecoration, watermark };
    f.second.pageDecoration = {
      ...f.second.pageDecoration,
      watermark: { ...watermark, text: "Different" },
    };
    const before = serializeWorkbook(f.session.workbook);
    f.setWatermarks.mockReturnValue(false);
    expect(await f.actions.applyWatermark(watermark, "workbook")).toBe(false);
    expect(f.actions.feedback.value).toBe("failed");
    expect(f.actions.busy.value).toBe(false);
    expect(f.setWatermarks).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("rejects a changed preset even when every target already has the requested watermark", async () => {
    const f = fixture();
    f.sheet.pageDecoration = { ...f.sheet.pageDecoration, watermark };
    f.second.pageDecoration = { ...f.second.pageDecoration, watermark };
    f.session.workbook.watermarkPresets = [{ id: "company", name: "Old name", watermark }];
    const before = serializeWorkbook(f.session.workbook);
    f.setWatermarks.mockReturnValue(false);
    expect(
      await f.actions.applyWatermark(watermark, "workbook", undefined, {
        id: "company",
        name: "New name",
      }),
    ).toBe(false);
    expect(f.actions.feedback.value).toBe("failed");
    expect(f.actions.busy.value).toBe(false);
    expect(f.setWatermarks).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each(["cancel", "replace workbook", "change generation"] as const)(
    "ignores a pending resource failure after %s",
    async (transition) => {
      let reject!: (reason: Error) => void;
      vi.mocked(prepareImageAsset).mockReturnValue(
        new Promise((_, fail) => {
          reject = fail;
        }),
      );
      let session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
      let generation = 0;
      const original = session.workbook;
      const before = serializeWorkbook(original);
      const setWatermarks = vi.fn().mockReturnValue(false);
      const actions = usePageDecorationActions({
        assetStore: createMemoryImageAssetStore(),
        getWorkbook: () => session.workbook,
        getSheet: () => getActiveSheet(session.workbook),
        getGeneration: () => generation,
        flushPendingEdits: () => true,
        setDecoration: vi.fn(),
        setWatermarks,
        setPresets: vi.fn(),
      });
      const pending = actions.applyWatermark(
        {
          ...watermark,
          image: { assetId: "preview", scale: null, washout: true, angle: 0 },
        },
        "sheet",
        file,
      );
      expect(actions.busy.value).toBe(true);
      if (transition === "cancel") actions.cancelWatermark();
      else if (transition === "replace workbook")
        session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
      else generation++;
      const currentBefore = serializeWorkbook(session.workbook);
      reject(new Error("resource failed after leaving the dialog"));
      expect(await pending).toBe(false);
      expect(actions.feedback.value).toBeUndefined();
      expect(actions.busy.value).toBe(false);
      expect(setWatermarks).not.toHaveBeenCalled();
      expect(serializeWorkbook(original)).toEqual(before);
      expect(serializeWorkbook(session.workbook)).toEqual(currentBefore);
      expect(session.history.undoStack).toHaveLength(0);
    },
  );
});
