import { describe, expect, test, vi } from "vitest";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  insertSheet,
  setCellContent,
  type Cell,
} from "@sheetcraft/core/workbook";
import {
  cloneCellImage,
  type CellImage,
  type FramedCellImage,
} from "@sheetcraft/core/cell-picture-frame";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  applyWorkbookCommand,
  createConvertCellImageToFloatingCommand,
} from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { getPictureProperties } from "@sheetcraft/core/picture-properties";
import { useSheetImageActions } from "../../../../modules/sheet-images/useSheetImageActions";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";

const address = { row: 2, column: 3 };
const asset = {
  id: "source",
  mimeType: "image/png",
  width: 800,
  height: 400,
  blob: new Blob(["synthetic source"], { type: "image/png" }),
};
function framed(): FramedCellImage {
  return {
    assetId: asset.id,
    altText: "Description",
    altTitle: "Title",
    locked: true,
    printObject: false,
    lockAspectRatio: false,
    frame: {
      kind: "cell-picture-frame-v1",
      size: { width: 650, height: 420 },
      source: { widthRatio: 1.5, heightRatio: 2, offsetXRatio: -0.1, offsetYRatio: 0.2 },
      angleDeg: 37,
      flipHorizontal: true,
      cropShape: { preset: "ellipse" },
    },
    transform: {
      appearance: { brightness: 0.6, border: { color: "#FF0000", width: 2 } },
      annotations: [{ kind: "pen", color: "#0000FF", width: 0.02, points: [{ x: 0.1, y: 0.2 }] }],
    },
  };
}
function fixture(image: CellImage = framed()) {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  const other = createSheet("Other", "other");
  insertSheet(workbook, other);
  let active = sheet;
  let generation = 0;
  const store = createMemoryImageAssetStore();
  const convert = vi.fn<Parameters<typeof useSheetImageActions>[0]["convertCellImageToFloating"]>(
    () => true,
  );
  const flush = vi.fn(() => true);
  const actions = useSheetImageActions({
    assetStore: store,
    getWorkbook: () => workbook,
    getSheet: () => active,
    getGeneration: () => generation,
    getAddress: () => address,
    flushPendingEdits: flush,
    setCellImage: vi.fn(() => true),
    setFloatingImage: vi.fn(() => true),
    convertCellImageToFloating: convert,
  });
  setCellContent(sheet, address, { kind: "image", image });
  const write = (next: CellImage) => setCellContent(sheet, address, { kind: "image", image: next });
  const unlock = (target = address) => {
    const key = `${target.row}:${target.column}`;
    const cell: Cell = sheet.cells.get(key) ?? {};
    sheet.cells.set(key, { ...cell, style: { ...cell.style, unlocked: true } });
  };
  return {
    actions,
    sheet,
    store,
    convert,
    flush,
    write,
    unlock,
    changeGeneration: () => generation++,
    navigate: () => (active = other),
    replaceSheet: () => workbook.sheets.set(sheet.id, { ...sheet, cells: new Map(sheet.cells) }),
    replaceWorkbook: () => {
      workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
      active = getActiveSheet(workbook);
    },
    getWorkbook: () => workbook,
  };
}
function pendingAsset(store: ReturnType<typeof createMemoryImageAssetStore>) {
  let resolve!: (value: typeof asset) => void;
  const get = vi.spyOn(store, "get").mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  return { resolve, get };
}

describe("cell image conversion ownership", () => {
  test("uses stored local size for a framed image without natural-size fitting or raster writes", async () => {
    const image = framed();
    const f = fixture(image);
    await f.store.put(asset);
    const put = vi.spyOn(f.store, "put");
    await f.actions.convertCellImageToFloating(address);
    expect(f.convert).toHaveBeenCalledExactlyOnceWith({
      sheetId: f.sheet.id,
      address,
      imageId: expect.any(String),
      size: { width: 650, height: 420 },
    });
    expect(getCellContent(f.sheet, address)).toEqual({
      kind: "image",
      image: cloneCellImage(image),
    });
    expect(put).not.toHaveBeenCalled();
    expect(f.actions.feedback.value).toBe("image.convertedToFloating");
  });

  test.each([
    { width: 50000, height: 420 },
    { width: 0.5, height: 0.25 },
  ])(
    "passes only a legacy command placeholder while preserving derived reference size %s",
    async (size) => {
      const image = framed();
      image.frame.size = { ...size };
      const f = fixture(image);
      await f.store.put(asset);
      f.convert.mockImplementation(
        ({ sheetId, address: target, imageId, size: commandSize }) =>
          !!applyWorkbookCommand(
            f.getWorkbook(),
            createConvertCellImageToFloatingCommand(sheetId, target, imageId, commandSize),
          ),
      );
      await f.actions.convertCellImageToFloating(address);
      expect(f.convert.mock.calls[0]![0].size).toEqual({ width: 1, height: 1 });
      expect(f.actions.feedback.value).toBe("image.convertedToFloating");
      const converted = f.sheet.floatingImages[0]!;
      if (!isFramedPictureObject(converted)) throw new Error("Expected a framed floating result.");
      const geometry = resolvePictureFrame(converted.frame, createPictureSheetMetrics(f.sheet));
      expect(geometry.rect.width).toBeCloseTo(size.width);
      expect(geometry.rect.height).toBeCloseTo(size.height);
      expect(converted.frame.source).toEqual(image.frame.source);
      expect(converted.frame.angleDeg).toBe(image.frame.angleDeg);
      expect(converted.transform).toEqual(image.transform);
      expect(getCellContent(f.sheet, address)).toBeNull();
    },
  );

  test("allows an editable protected cell to transfer its locked picture without Edit objects", async () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.unlock();
    await f.store.put(asset);
    await f.actions.convertCellImageToFloating(address);
    expect(f.convert).toHaveBeenCalledOnce();
    const content = getCellContent(f.sheet, address);
    if (content?.kind !== "image") throw new Error("Expected a cell picture.");
    expect(getPictureProperties(content.image).locked).toBe(true);
  });

  test("Edit objects does not authorize removing a picture from a locked cell", async () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [], editObjects: true };
    const get = vi.spyOn(f.store, "get");
    await f.actions.convertCellImageToFloating(address);
    expect(f.flush).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(f.convert).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    "merged source requires every member editable: %s",
    async (allEditable) => {
      const f = fixture();
      const end = { row: address.row, column: address.column + 1 };
      f.sheet.mergedCells = [{ start: { ...address }, end }];
      f.sheet.properties.protected = true;
      f.unlock();
      if (allEditable) f.unlock(end);
      await f.store.put(asset);
      await f.actions.convertCellImageToFloating(end);
      expect(f.convert).toHaveBeenCalledTimes(allEditable ? 1 : 0);
      if (allEditable) expect(f.convert.mock.calls[0]![0].address).toEqual(address);
    },
  );

  test.each([
    ["size", (image: FramedCellImage): unknown => (image.frame.size.width += 1)],
    ["source", (image: FramedCellImage): unknown => (image.frame.source.offsetXRatio += 0.1)],
    ["angle", (image: FramedCellImage): unknown => (image.frame.angleDeg += 1)],
    ["flip", (image: FramedCellImage): unknown => (image.frame.flipHorizontal = false)],
    ["shape", (image: FramedCellImage): unknown => (image.frame.cropShape = { preset: "rect" })],
    ["title", (image: FramedCellImage): unknown => (image.altTitle = "New title")],
    ["lock", (image: FramedCellImage): unknown => (image.locked = false)],
    ["print", (image: FramedCellImage): unknown => (image.printObject = true)],
    ["aspect lock", (image: FramedCellImage): unknown => (image.lockAspectRatio = true)],
    [
      "appearance",
      (image: FramedCellImage): unknown => (image.transform!.appearance!.brightness = 0.8),
    ],
    [
      "annotation",
      (image: FramedCellImage): unknown => (image.transform!.annotations![0]!.points[0]!.x = 0.3),
    ],
  ] as const)("aborts a same-asset %s change during asset lookup", async (_name, change) => {
    const f = fixture();
    const pending = pendingAsset(f.store);
    const converting = f.actions.convertCellImageToFloating(address);
    const next = framed();
    change(next);
    f.write(next);
    pending.resolve(asset);
    await converting;
    expect(f.convert).not.toHaveBeenCalled();
    expect(getCellContent(f.sheet, address)).toEqual({
      kind: "image",
      image: cloneCellImage(next),
    });
    expect(f.actions.feedback.value).toBeUndefined();
    expect(f.actions.busy.value).toBe(false);
  });

  test("captures detached nested data rather than an alias that can change during lookup", async () => {
    const f = fixture();
    const pending = pendingAsset(f.store);
    const converting = f.actions.convertCellImageToFloating(address);
    const image = f.sheet.cells.get(`${address.row}:${address.column}`)!.content;
    if (image?.kind !== "image" || !image.image.frame) throw new Error("Expected a framed cell.");
    image.image.frame.source.widthRatio = 2.5;
    pending.resolve(asset);
    await converting;
    expect(f.convert).not.toHaveBeenCalled();
  });

  test.each(["add", "remove", "resize"] as const)(
    "aborts a relevant merge %s during asset lookup",
    async (change) => {
      const f = fixture();
      if (change !== "add")
        f.sheet.mergedCells = [
          { start: { ...address }, end: { row: address.row, column: address.column + 1 } },
        ];
      const pending = pendingAsset(f.store);
      const converting = f.actions.convertCellImageToFloating(address);
      f.sheet.mergedCells =
        change === "remove"
          ? []
          : [{ start: { ...address }, end: { row: address.row + 1, column: address.column + 1 } }];
      pending.resolve(asset);
      await converting;
      expect(f.convert).not.toHaveBeenCalled();
    },
  );

  test("aborts when the merged source loses write permission during lookup", async () => {
    const f = fixture();
    const end = { row: address.row, column: address.column + 1 };
    f.sheet.mergedCells = [{ start: { ...address }, end }];
    f.sheet.properties.protected = true;
    f.unlock();
    f.unlock(end);
    const pending = pendingAsset(f.store);
    const converting = f.actions.convertCellImageToFloating(address);
    f.sheet.cells.set(`${end.row}:${end.column}`, {});
    pending.resolve(asset);
    await converting;
    expect(f.convert).not.toHaveBeenCalled();
  });

  test.each(["generation", "sheet", "same-ID sheet", "workbook", "cancel", "dispose"] as const)(
    "aborts after owner %s changes during asset lookup",
    async (change) => {
      const f = fixture();
      const pending = pendingAsset(f.store);
      const converting = f.actions.convertCellImageToFloating(address);
      if (change === "generation") f.changeGeneration();
      if (change === "sheet") f.navigate();
      if (change === "same-ID sheet") f.replaceSheet();
      if (change === "workbook") f.replaceWorkbook();
      if (change === "cancel") f.actions.cancelPending();
      if (change === "dispose") f.actions.dispose();
      f.actions.reportFeedback("picture.noSmaller");
      pending.resolve(asset);
      await converting;
      expect(f.convert).not.toHaveBeenCalled();
      expect(f.actions.feedback.value).toBe("picture.noSmaller");
      expect(f.actions.busy.value).toBe(false);
    },
  );

  test.each([false, undefined, null, { accepted: true }, Promise.resolve(true)])(
    "only explicit synchronous true acknowledges a conversion: %s",
    async (result) => {
      const f = fixture();
      await f.store.put(asset);
      f.convert.mockReturnValueOnce(result as boolean);
      await f.actions.convertCellImageToFloating(address);
      expect(f.actions.feedback.value).toBe("image.convertFailed");
    },
  );

  test("checks the owner again after the callback before reporting success", async () => {
    const f = fixture();
    await f.store.put(asset);
    f.convert.mockImplementationOnce(() => {
      f.changeGeneration();
      f.actions.reportFeedback("picture.noSmaller");
      return true;
    });
    await f.actions.convertCellImageToFloating(address);
    expect(f.actions.feedback.value).toBe("picture.noSmaller");
  });
});
