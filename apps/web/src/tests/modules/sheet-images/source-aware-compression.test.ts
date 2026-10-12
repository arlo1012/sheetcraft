import { beforeEach, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import {
  fixture as sourceFixture,
  deferred,
  asset,
} from "./useSheetImageActions/replacement-fixture";
vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
const smaller = new Blob(["x"], { type: "image/webp" }),
  settings = { format: "webp" as const, all: false, maxSide: 400, quality: 0.8 };
beforeEach(() => {
  vi.mocked(prepareImageAsset)
    .mockReset()
    .mockResolvedValue({ ...asset, id: "compressed", mimeType: "image/webp", blob: smaller });
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(smaller);
});
async function fixture(kind: "framed" | "owned" | "group") {
  const f = sourceFixture(),
    rootId = kind === "framed" ? "framed" : f.leafPath[0]!;
  let path = kind === "owned" ? f.leafPath : null;
  const feedback = vi.fn();
  await f.store.put({
    ...asset,
    id: "old",
    blob: new Blob(["original source bytes"], { type: "image/png" }),
  });
  f.put.mockClear();
  const tools = usePictureAssetTools({
    getWorkbook: () => f.session.workbook,
    getSheet: () => f.sheet,
    getSelectedIds: () => [rootId],
    getSelectedPath: () => path,
    assetStore: f.store,
    isBusy: () => false,
    execute: f.execute,
    feedback,
  });
  return {
    ...f,
    tools,
    feedback,
    rootId,
    changePath: () => {
      path = [f.leafPath[0]!, "sibling"];
    },
  };
}
test.each(["framed", "owned", "group"] as const)(
  "%s compression uses actual sources and one exact reversible transaction",
  async (kind) => {
    const f = await fixture(kind),
      before = serializeWorkbook(f.session.workbook);
    expect(await f.tools.compress(settings)).toBe(true);
    expect(convertPictureBlob).toHaveBeenCalledOnce();
    const after = serializeWorkbook(f.session.workbook);
    expect(after).not.toEqual(before);
    expect(f.execute).toHaveBeenCalledOnce();
    if (kind === "owned") expect(f.currentGroup().members[1]).toMatchObject({ assetId: "old" });
    if (kind !== "framed") expect(f.currentLeaf().assetId).toBe("compressed");
    else expect(f.currentFramed().assetId).toBe("compressed");
    expect(f.feedback).toHaveBeenCalledWith("picture.compressed");
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    f.scope.stop();
  },
);
test.each(["path", "lock", "asset", "owner"] as const)(
  "late %s changes cannot write a compressed source into another owner",
  async (change) => {
    const f = await fixture("owned"),
      waiting = deferred<Blob>();
    vi.mocked(convertPictureBlob).mockReturnValue(waiting.promise);
    const running = f.tools.compress(settings);
    await vi.waitFor(() => expect(convertPictureBlob).toHaveBeenCalledOnce());
    if (change === "path") f.changePath();
    if (change === "lock") {
      f.sheet.properties.protected = true;
      f.currentGroup().locked = true;
    }
    if (change === "asset") f.currentLeaf().assetId = "later-source";
    if (change === "owner") f.currentGroup().members.reverse();
    const before = serializeWorkbook(f.session.workbook);
    waiting.resolve(smaller);
    expect(await running).toBe(false);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.scope.stop();
  },
);

test("oversized distinct-source batches reject before resource reads or decoder calls", async () => {
  const f = await fixture("group"),
    group = f.currentGroup(),
    template = f.currentLeaf();
  group.members = Array.from({ length: 101 }, (_, index) => ({
    ...template,
    id: `member-${index}`,
    assetId: `asset-${index}`,
  }));
  const read = vi.spyOn(f.store, "get"),
    before = serializeWorkbook(f.session.workbook);
  expect(await f.tools.compress(settings)).toBe(false);
  expect(read).not.toHaveBeenCalled();
  expect(convertPictureBlob).not.toHaveBeenCalled();
  expect(f.put).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetActionTooLarge", true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.scope.stop();
});
test("aggregate byte budget stops before any asset write and retains all document sources", async () => {
  const f = await fixture("group"),
    group = f.currentGroup(),
    template = f.currentLeaf();
  group.members = Array.from({ length: 9 }, (_, index) => ({
    ...template,
    id: `member-${index}`,
    assetId: `asset-${index}`,
  }));
  const bytes = new Blob([new Uint8Array(8 * 1024 * 1024)], { type: "image/png" });
  vi.spyOn(f.store, "get").mockImplementation(async (id) => ({ ...asset, id, blob: bytes }));
  const before = serializeWorkbook(f.session.workbook);
  expect(await f.tools.compress(settings)).toBe(false);
  expect(convertPictureBlob).toHaveBeenCalledTimes(8);
  expect(f.put).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetActionTooLarge", true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  f.scope.stop();
});
