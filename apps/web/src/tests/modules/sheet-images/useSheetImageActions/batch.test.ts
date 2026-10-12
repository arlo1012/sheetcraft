import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  type LegacyFloatingImage as FloatingImage,
} from "@sheetcraft/core/workbook";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  isLegacyPictureObject,
  type PictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { useSheetImageActions } from "../../../../modules/sheet-images/useSheetImageActions";
import {
  prepareImageAsset,
  ImageAssetError,
} from "../../../../modules/image-assets/prepareImageAsset";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";

vi.mock("../../../../modules/image-assets/prepareImageAsset", async (original) => ({
  ...(await original<object>()),
  prepareImageAsset: vi.fn(),
}));
const files = [
  new File(["a"], "a.png", { type: "image/png" }),
  new File(["b"], "b.png", { type: "image/png" }),
];
const assets = files.map((blob, index) => ({
  id: `asset-${index}`,
  blob,
  mimeType: "image/png",
  width: 800,
  height: 400,
}));
function requireStandalone(image: PictureObject): StandalonePictureObject {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
}
function requireLegacy(image: PictureObject): FloatingImage {
  if (!isLegacyPictureObject(image)) throw new Error("Expected a legacy picture.");
  return image;
}
function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  const store = createMemoryImageAssetStore();
  const execute = vi.fn((command: WorkbookCommand) => !!applyWorkbookCommand(workbook, command));
  const actions = useSheetImageActions({
    assetStore: store,
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 2, column: 3 }),
    flushPendingEdits: () => true,
    setCellImage: vi.fn(() => true),
    setFloatingImage: vi.fn(() => true),
    convertCellImageToFloating: vi.fn(() => true),
    execute,
  });
  return { actions, sheet, store, execute };
}
beforeEach(() => {
  vi.mocked(prepareImageAsset)
    .mockReset()
    .mockResolvedValueOnce(assets[0]!)
    .mockResolvedValueOnce(assets[1]!);
});

describe("batch picture insertion", () => {
  test.each(["cell", "floating"] as const)(
    "undefined does not acknowledge a %s batch",
    async (mode) => {
      const f = fixture();
      f.execute.mockReturnValueOnce(undefined as unknown as boolean);
      await f.actions.insertFiles(files, mode);
      expect(f.actions.feedback.value).toBe("image.insertionFailed");
      expect(f.execute).toHaveBeenCalledOnce();
    },
  );

  test("undefined does not acknowledge a copied picture group", async () => {
    const f = fixture();
    for (const asset of assets) await f.store.put(asset);
    f.execute.mockReturnValueOnce(undefined as unknown as boolean);
    await f.actions.pasteFloatingImages(
      assets.map((asset, index) => ({
        id: `copied-${index}`,
        assetId: asset.id,
        altText: "Copied",
        anchor: { row: 0, column: 0 },
        offsetX: index * 100,
        offsetY: 0,
        width: 100,
        height: 50,
      })),
      { row: 2, column: 3 },
    );
    expect(f.actions.feedback.value).toBe("image.insertionFailed");
    expect(f.execute).toHaveBeenCalledOnce();
  });

  test.each(["cell", "floating"] as const)(
    "inserts two %s images in a single document command",
    async (mode) => {
      const f = fixture();
      await f.actions.insertFiles(files, mode);
      expect(f.execute).toHaveBeenCalledTimes(1);
      for (const asset of assets) expect(await f.store.get(asset.id)).toEqual(asset);
      if (mode === "floating") {
        expect(f.sheet.floatingImages.map((image) => requireStandalone(image).assetId)).toEqual([
          "asset-0",
          "asset-1",
        ]);
        expect(
          f.sheet.floatingImages.map(requireLegacy).map((image) => [image.offsetX, image.offsetY]),
        ).toEqual([
          [0, 0],
          [24, 24],
        ]);
      } else {
        expect(getCellContent(f.sheet, { row: 2, column: 3 })).toMatchObject({
          kind: "image",
          image: { assetId: "asset-0" },
        });
        expect(getCellContent(f.sheet, { row: 3, column: 3 })).toMatchObject({
          kind: "image",
          image: { assetId: "asset-1" },
        });
      }
    },
  );

  test("preserves a typed pixel-limit failure from a batch without partial insertion", async () => {
    const f = fixture();
    vi.mocked(prepareImageAsset)
      .mockReset()
      .mockResolvedValueOnce(assets[0]!)
      .mockRejectedValueOnce(new ImageAssetError("pixel-limit"));
    await f.actions.insertFiles(files, "floating");
    expect(f.actions.feedback.value).toBe("image.tooManyPixels");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toEqual([]);
    expect(await f.store.get(assets[0]!.id)).toBeUndefined();
  });

  test("submits no command when the second image fails to decode", async () => {
    const f = fixture();
    vi.mocked(prepareImageAsset)
      .mockReset()
      .mockResolvedValueOnce(assets[0]!)
      .mockRejectedValueOnce(new Error("decode"));
    await f.actions.insertFiles(files, "floating");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toEqual([]);
    expect(await f.store.get(assets[0]!.id)).toBeUndefined();
    expect(f.actions.feedback.value).toBe("image.insertionFailed");
  });

  test.each(["cell", "floating"] as const)(
    "cancels %s batch insertion after protection changes",
    async (mode) => {
      const f = fixture();
      let finish!: (asset: (typeof assets)[number]) => void;
      vi.mocked(prepareImageAsset)
        .mockReset()
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }),
        );
      const pending = f.actions.insertFiles(files, mode);
      f.sheet.properties.protected = true;
      finish(assets[0]!);
      await pending;
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.busy.value).toBe(false);
    },
  );

  test("pastes a group with new image and group IDs while retaining relative offsets and edits", async () => {
    const f = fixture();
    for (const asset of assets) await f.store.put(asset);
    const images: FloatingImage[] = assets.map((asset, index) => ({
      id: `source-${index}`,
      assetId: asset.id,
      altText: "Group",
      groupId: "source-group",
      anchor: { row: 0, column: 0 },
      offsetX: 20 + index * 80,
      offsetY: 30 + index * 40,
      width: 100,
      height: 50,
      transform: { rotation: 90 },
    }));
    await f.actions.pasteFloatingImages(images, { row: 8, column: 9 });
    expect(f.execute).toHaveBeenCalledTimes(1);
    const pasted = f.sheet.floatingImages.map(requireStandalone);
    expect(new Set(pasted.map((image) => image.id)).size).toBe(2);
    expect(pasted.every((image) => !images.some((source) => source.id === image.id))).toBe(true);
    expect(pasted[0]!.groupId).toBeTruthy();
    expect(pasted[0]!.groupId).not.toBe("source-group");
    expect(pasted[1]!.groupId).toBe(pasted[0]!.groupId);
    for (const [index, image] of pasted.entries())
      expect(image).toMatchObject({
        ...images[index]!,
        id: image.id,
        groupId: image.groupId,
        anchor: { row: 8, column: 9 },
        offsetX: images[index]!.offsetX + 12,
        offsetY: images[index]!.offsetY + 12,
      });
  });
});
