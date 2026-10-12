import { beforeEach, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { usePictureDialogSessions } from "../../../modules/sheet-images/usePictureDialogSessions";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
import { planPictureBatchSize } from "../../../modules/sheet-images/picture-batch-size";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { asset, fixture, deferred } from "./useSheetImageActions/replacement-fixture";
vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
const small = new Blob(["x"], { type: "image/webp" }),
  compression = { maxSide: 400, quality: 0.8, format: "webp" as const, all: false },
  size = { width: 240, height: 90, locked: false, all: false };
beforeEach(() => {
  vi.mocked(prepareImageAsset)
    .mockReset()
    .mockResolvedValue({ ...asset, id: "small", mimeType: "image/webp", blob: small });
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(small);
});
async function setup(kind: "framed" | "group" | "owned") {
  const f = fixture(),
    rootId = kind === "framed" ? "framed" : f.leafPath[0]!;
  let path = kind === "owned" ? f.leafPath : null;
  let refused = false;
  await f.store.put({
    ...asset,
    id: "old",
    blob: new Blob(["original bytes"], { type: "image/png" }),
  });
  f.put.mockClear();
  const assetTools = usePictureAssetTools({
    getWorkbook: () => f.session.workbook,
    getSheet: () => f.sheet,
    getSelectedIds: () => [rootId],
    getSelectedPath: () => path,
    assetStore: f.store,
    isBusy: () => false,
    execute: f.execute,
    feedback: vi.fn(),
  });
  const resize = vi.fn(
    (settings: typeof size) =>
      !refused &&
      f.execute(
        createSetSheetFloatingImagesCommand(
          f.sheet.id,
          planPictureBatchSize(f.sheet.floatingImages, [rootId], path, settings, f.getContext()),
        ),
      ),
  );
  const dialogs = usePictureDialogSessions({
    getWorkbook: () => f.session.workbook,
    getSheet: () => f.sheet,
    getGeneration: () => 0,
    getSelectedIds: () => [rootId],
    getSelectedPath: () => path,
    getFrameContext: f.getContext,
    getSelectedImage: () => f.sheet.floatingImages.find((root) => root.id === rootId),
    isBusy: () => false,
    hasAsset: () => true,
    setImage: () => false,
    compress: assetTools.compress,
    resize,
    resizeFeedback: () => "picture.operationFailed",
  });
  return {
    ...f,
    dialogs,
    resize,
    setRefused: (value: boolean) => {
      refused = value;
    },
    changePath: () => {
      path = [rootId, "sibling"];
    },
  };
}
test.each(["framed", "group", "owned"] as const)(
  "%s compression and batch dialogs invoke real source/geometry operations",
  async (kind) => {
    const f = await setup(kind);
    f.dialogs.openCompression();
    expect(f.dialogs.compression.value).toBeDefined();
    expect(await f.dialogs.compression.value!.confirm(compression)).toBe(true);
    expect(f.dialogs.compression.value).toBeUndefined();
    f.dialogs.openBatchSize();
    expect(f.dialogs.batch.value?.image.width).toBeGreaterThan(0);
    expect(f.dialogs.batch.value!.confirm(size)).toBe(true);
    expect(f.dialogs.batch.value).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(2);
    f.scope.stop();
  },
);
test("owned dialog keeps rejected size settings, but an old exact leaf callback cannot act on another leaf", async () => {
  const f = await setup("owned");
  f.dialogs.openBatchSize();
  const batch = f.dialogs.batch.value!;
  f.setRefused(true);
  const before = serializeWorkbook(f.session.workbook);
  expect(batch.confirm(size)).toBe(false);
  expect(f.dialogs.batch.value).toBe(batch);
  expect(batch.error.value).toBeTruthy();
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.setRefused(false);
  f.changePath();
  expect(batch.confirm(size)).toBe(false);
  expect(f.resize).toHaveBeenCalledOnce();
  f.scope.stop();
});
test("closing a source-aware compression dialog revokes the pending conversion without storage or history", async () => {
  const f = await setup("owned"),
    waiting = deferred<Blob>();
  vi.mocked(convertPictureBlob).mockReturnValue(waiting.promise);
  f.dialogs.openCompression();
  const dialog = f.dialogs.compression.value!,
    before = serializeWorkbook(f.session.workbook);
  const running = dialog.confirm(compression);
  await vi.waitFor(() => expect(convertPictureBlob).toHaveBeenCalledOnce());
  dialog.close();
  waiting.resolve(small);
  expect(await running).toBe(false);
  expect(f.put).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.scope.stop();
});

test("replacing metric callbacks in-place revokes a captured geometry dialog", async () => {
  const f = await setup("owned");
  f.dialogs.openBatchSize();
  const dialog = f.dialogs.batch.value!;
  const before = serializeWorkbook(f.session.workbook);
  f.getContext()!.metrics.rows.visiblePrefix = (index) => index * 17;
  expect(dialog.confirm(size)).toBe(false);
  expect(f.resize).not.toHaveBeenCalled();
  expect(f.dialogs.batch.value).toBe(dialog);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.scope.stop();
});
