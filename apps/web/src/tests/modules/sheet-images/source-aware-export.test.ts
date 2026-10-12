import { beforeEach, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { usePictureAssetTools } from "../../../modules/sheet-images/usePictureAssetTools";
import { exportPictureSourceBlob } from "../../../modules/sheet-images/picture-source-export";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { downloadBlob } from "../../../shared/files/download";
import {
  fixture as sourceFixture,
  deferred,
  asset,
} from "./useSheetImageActions/replacement-fixture";

vi.mock("../../../modules/sheet-images/picture-source-export", () => ({
  exportPictureSourceBlob: vi.fn(),
}));
vi.mock("../../../modules/sheet-images/picture-asset-conversion", () => ({
  convertPictureBlob: vi.fn(),
}));
vi.mock("../../../shared/files/download", () => ({ downloadBlob: vi.fn() }));
const output = new Blob(["rendered"], { type: "image/png" });
beforeEach(() => {
  vi.mocked(exportPictureSourceBlob).mockReset().mockResolvedValue(output);
  vi.mocked(convertPictureBlob).mockReset().mockResolvedValue(output);
  vi.mocked(downloadBlob).mockReset();
});
async function fixture(kind: "framed" | "owned" | "legacy" = "framed") {
  const f = sourceFixture();
  let ids = [kind === "owned" ? f.leafPath[0]! : kind],
    path = kind === "owned" ? f.leafPath : null,
    generation = 0;
  const feedback = vi.fn();
  await f.store.put({ ...asset, id: "old" });
  f.put.mockClear();
  const tools = f.scope.run(() =>
    usePictureAssetTools({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getGeneration: () => generation,
      getSelectedIds: () => ids,
      getSelectedPath: () => path,
      getFrameContext: f.getContext,
      assetStore: f.store,
      isBusy: () => false,
      execute: f.execute,
      feedback,
    }),
  )!;
  return {
    ...f,
    tools,
    feedback,
    changePath: () => {
      path = [f.leafPath[0]!, "sibling"];
    },
    changeSelection: () => {
      ids = ["legacy"];
      path = null;
    },
    changeGeneration: () => {
      generation += 1;
    },
  };
}
test.each(["framed", "owned", "legacy"] as const)(
  "%s saves its actual source without changing workbook, assets or history",
  async (kind) => {
    const f = await fixture(kind),
      before = serializeWorkbook(f.session.workbook);
    await f.tools.exportPictures("png");
    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(f.feedback).toHaveBeenCalledWith("picture.exported");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    if (kind === "legacy") {
      expect(convertPictureBlob).toHaveBeenCalledOnce();
      expect(exportPictureSourceBlob).not.toHaveBeenCalled();
    } else {
      expect(exportPictureSourceBlob).toHaveBeenCalledOnce();
      expect(convertPictureBlob).not.toHaveBeenCalled();
      const presentation = vi.mocked(exportPictureSourceBlob).mock.calls[0]![1];
      expect(presentation.picture.assetId).toBe("old");
      expect(presentation.geometry.sourceRect).toBeDefined();
      expect(presentation.picture).not.toHaveProperty("anchor");
      if (kind === "owned") expect(presentation.picture.id).toBe(f.leafPath[1]);
    }
    expect(f.tools.busy.value).toBe(false);
    f.scope.stop();
  },
);
test.each(["path", "selection", "geometry", "metrics", "theme", "generation", "dispose"] as const)(
  "a late %s change cannot download an obsolete presentation or report success",
  async (change) => {
    const f = await fixture("owned"),
      waiting = deferred<Blob>();
    vi.mocked(exportPictureSourceBlob).mockReturnValue(waiting.promise);
    const running = f.tools.exportPictures("png");
    await vi.waitFor(() => expect(exportPictureSourceBlob).toHaveBeenCalledOnce());
    if (change === "path") f.changePath();
    if (change === "selection") f.changeSelection();
    if (change === "geometry") f.currentLeaf().frame.rect.widthRatio *= 1.2;
    if (change === "metrics") f.getContext()!.metrics.rows.visibleSize = () => 48;
    if (change === "theme") f.session.workbook.theme.name = "Later theme";
    if (change === "generation") f.changeGeneration();
    if (change === "dispose") f.scope.stop();
    waiting.resolve(output);
    await running;
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(f.feedback).not.toHaveBeenCalled();
    expect(f.tools.busy.value).toBe(false);
    f.scope.stop();
  },
);
test("All saves each real group leaf separately in the existing ZIP, not a fabricated group asset", async () => {
  const f = await fixture();
  await f.tools.exportPictures("png", true);
  expect(exportPictureSourceBlob).toHaveBeenCalledTimes(3);
  expect(convertPictureBlob).toHaveBeenCalledOnce();
  expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "pictures.zip");
  expect(f.feedback).toHaveBeenCalledWith("picture.exported");
  f.scope.stop();
});
test("a later leaf rendering failure prevents the whole download and leaves the document intact", async () => {
  const f = await fixture(),
    before = serializeWorkbook(f.session.workbook);
  vi.mocked(exportPictureSourceBlob)
    .mockResolvedValueOnce(output)
    .mockRejectedValueOnce(new Error("Missing fill"));
  await f.tools.exportPictures("png", true);
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetFailed", true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  f.scope.stop();
});
test("output count budget refuses before source reads, with no partial download", async () => {
  const f = await fixture(),
    group = f.currentGroup(),
    leaf = f.currentLeaf();
  group.members = Array.from({ length: 101 }, (_, index) => ({
    ...leaf,
    id: `leaf-${index}`,
  }));
  const read = vi.spyOn(f.store, "get");
  await f.tools.exportPictures("png", true);
  expect(read).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetActionTooLarge", true);
  f.scope.stop();
});
test("encoded source and output byte budgets prevent a partial ZIP download", async () => {
  const f = await fixture(),
    group = f.currentGroup(),
    leaf = f.currentLeaf();
  group.members = Array.from({ length: 9 }, (_, index) => ({
    ...leaf,
    id: `leaf-${index}`,
    assetId: `asset-${index}`,
  }));
  const oversized = new Blob(["oversized"]);
  Object.defineProperty(oversized, "size", { value: 65 * 1024 * 1024 });
  vi.spyOn(f.store, "get").mockResolvedValue({ ...asset, blob: oversized });
  await f.tools.exportPictures("png", true);
  expect(exportPictureSourceBlob).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetActionTooLarge", true);
  vi.mocked(f.store.get).mockResolvedValue({ ...asset, blob: asset.blob });
  vi.mocked(exportPictureSourceBlob).mockResolvedValue(oversized);
  f.feedback.mockClear();
  await f.tools.exportPictures("png");
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetActionTooLarge", true);
  f.scope.stop();
});
test("source-save pure shape admission runs before any current asset read or export request", async () => {
  const f = await fixture();
  const framed = f.sheet.floatingImages.find((p) => p.id === "framed")!;
  if (!("frame" in framed) || !framed.frame || "members" in framed)
    throw new Error("Expected frame source.");
  framed.frame.cropShape = {
    preset: "wedgeRectCallout",
    adjustments: { adj1: 2147483647, adj2: 0 },
  };
  framed.frame.anchor = { mode: "fixed", x: 0, y: 0, size: { width: 1000, height: 1000 } };
  const read = vi.spyOn(f.store, "get");
  await f.tools.exportPictures("png");
  expect(read).not.toHaveBeenCalled();
  expect(exportPictureSourceBlob).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(f.feedback).toHaveBeenCalledWith("picture.assetFailed", true);
  f.scope.stop();
});
