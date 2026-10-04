import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@idea10/core/workbook";
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
    });
    const pending = actions.setBackgroundFile(file);
    workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    resolve(asset);
    await pending;
    expect(setDecoration).not.toHaveBeenCalled();
    expect(actions.busy.value).toBe(false);
  });
});
