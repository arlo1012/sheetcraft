import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import type { PictureObject, StandalonePictureObject } from "@sheetcraft/core/picture-object";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
const source = {
  id: "original",
  blob: new Blob(["many source bytes"], { type: "image/png" }),
  mimeType: "image/png",
  width: 200,
  height: 100,
};
const smaller = new Blob(["x"], { type: "image/jpeg" });
const converted = { ...source, id: "compressed", blob: smaller, mimeType: "image/jpeg" };
const settings = { maxSide: 1920, quality: 0.8, format: "jpeg" as const, all: false };
const cleanups: Array<() => void> = [];
function requireStandalone(image: PictureObject): StandalonePictureObject {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const other = createSheet("Other", "other");
  insertSheet(session.workbook, other);
  const image: FloatingImage = {
    id: "picture",
    assetId: source.id,
    altText: "Synthetic",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
  };
  sheet.floatingImages = [image];
  const store = createMemoryImageAssetStore();
  await store.put(source);
  const put = vi.spyOn(store, "put");
  let active = sheet;
  let generation = 0;
  let continued = true;
  const scope = effectScope();
  const execute = vi.fn((command) => executeWorkbookCommand(session, command));
  const feedback = vi.fn();
  const tools = scope.run(() =>
    usePictureAssetTools({
      getWorkbook: () => session.workbook,
      getSheet: () => active,
      getGeneration: () => generation,
      getSelectedIds: () => [image.id],
      assetStore: store,
      isBusy: () => false,
      execute,
      feedback,
    }),
  )!;
  cleanups.push(() => scope.stop());
  return {
    session,
    sheet,
    store,
    put,
    tools,
    execute,
    feedback,
    scope,
    valid: () => continued,
    cancel: () => {
      continued = false;
    },
    navigate: () => {
      active = other;
      generation += 1;
    },
    visitBack: () => {
      active = sheet;
      generation += 1;
    },
  };
}
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(converted);
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(smaller);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe("picture compression owner cancellation", () => {
  test.each(["cancel", "sheet", "visit-back", "dispose"] as const)(
    "a late conversion after %s is discarded before decoding or storage",
    async (change) => {
      const f = await fixture();
      const pending = deferred<Blob>();
      vi.mocked(convertPictureBlob).mockReturnValue(pending.promise);
      const before = serializeWorkbook(f.session.workbook);
      const working = f.tools.compress(settings, f.valid);
      await vi.waitFor(() => expect(convertPictureBlob).toHaveBeenCalledTimes(1));
      if (change === "cancel") f.cancel();
      if (change === "sheet" || change === "visit-back") f.navigate();
      if (change === "visit-back") f.visitBack();
      if (change === "dispose") f.scope.stop();
      pending.resolve(smaller);
      expect(await working).toBe(false);
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.feedback).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.tools.busy.value).toBe(false);
    },
  );
  test("cancellation during compressed-asset preparation stops the first write", async () => {
    const f = await fixture();
    const pending = deferred<typeof converted>();
    vi.mocked(prepareImageAsset).mockReturnValue(pending.promise);
    const working = f.tools.compress(settings, f.valid);
    await vi.waitFor(() => expect(prepareImageAsset).toHaveBeenCalledTimes(1));
    f.cancel();
    pending.resolve(converted);
    expect(await working).toBe(false);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("an obsolete source-read failure does not publish into the next owner", async () => {
    const f = await fixture();
    const pending = deferred<typeof source>();
    vi.spyOn(f.store, "get").mockReturnValue(pending.promise);
    const working = f.tools.compress(settings, f.valid);
    f.cancel();
    pending.reject(new Error("old read failed"));
    expect(await working).toBe(false);
    expect(f.feedback).not.toHaveBeenCalled();
  });
  test("a cancelled all-picture write stops after the in-flight local asset and never commits", async () => {
    const f = await fixture();
    const second = { ...source, id: "second" };
    await f.store.put(second);
    f.sheet.floatingImages.push({
      ...f.sheet.floatingImages[0]!,
      id: "second-picture",
      assetId: second.id,
    });
    f.put.mockClear();
    vi.mocked(prepareImageAsset)
      .mockResolvedValueOnce(converted)
      .mockResolvedValueOnce({ ...converted, id: "second-compressed" });
    const pending = deferred<void>();
    f.put.mockImplementationOnce(() => pending.promise);
    const working = f.tools.compress({ ...settings, all: true }, f.valid);
    await vi.waitFor(() => expect(f.put).toHaveBeenCalledTimes(1));
    f.cancel();
    pending.resolve(undefined);
    expect(await working).toBe(false);
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages.map((image) => requireStandalone(image).assetId)).toEqual([
      source.id,
      second.id,
    ]);
    expect(f.feedback).not.toHaveBeenCalled();
  });
});
