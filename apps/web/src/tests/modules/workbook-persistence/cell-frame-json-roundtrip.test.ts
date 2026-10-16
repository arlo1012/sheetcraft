import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, getCellContent } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createConvertFloatingImageToCellCommand,
  createConvertCellImageToFloatingCommand,
  planFloatingPictureToCell,
} from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedCellImage } from "@sheetcraft/core/cell-picture-frame";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { collectWorkbookImageAssetIds } from "../../../modules/image-assets/useImageAssetUrls";
import {
  downloadWorkbookBundle,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { framedPicture } from "../sheet-images/framed-picture-fixture";
import { actualPng, pngChunk } from "../image-assets/image-header-fixtures";
import { setupGroupJsonBrowser } from "./group-json-fixture";

const secondPng = new Uint8Array([
  ...actualPng.slice(0, -12),
  ...pngChunk("tEXt", new TextEncoder().encode("Comment\0cell texture")),
  ...actualPng.slice(-12),
]);
const idFor = (bytes: Uint8Array) => `image-${createHash("sha256").update(bytes).digest("hex")}`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function convertedFixture() {
  const workbook = createWorkbook({ id: "cell-json", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
  sheet.rowHeights.set(1, 41);
  sheet.columnWidths.set(1, 100);
  const image = framedPicture();
  image.frame.anchor = {
    mode: "move-only",
    origin: { row: { index: 2, offset: 2 }, column: { index: 2, offset: 3 } },
    size: { width: 180, height: 90 },
  };
  image.frame.angleDeg = 37;
  image.frame.flipHorizontal = true;
  image.frame.flipVertical = true;
  image.frame.cropShape = { preset: "rightArrow", adjustments: { adj1: 40000 } };
  image.frame.source = { widthRatio: 1.2, heightRatio: 0.8, offsetXRatio: -0.2, offsetYRatio: 0.1 };
  image.altTitle = "Cell source title";
  image.locked = false;
  image.printObject = false;
  image.lockAspectRatio = false;
  const paint = {
    kind: "picture" as const,
    assetId: "fill",
    opacity: 0.7,
    rotateWithShape: true,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    },
  };
  image.transform = {
    appearance: {
      opacity: 0.6,
      detailedStyle: {
        fill: { kind: "value", value: paint },
        line: {
          kind: "value",
          value: {
            paint: { ...paint, assetId: "line" },
            widthPt: 1,
            compound: "single",
            dash: "solid",
            cap: "butt",
            join: "miter",
            miterLimit: 4,
          },
        },
      },
    },
    annotations: [
      {
        kind: "text",
        points: [{ x: 0.4, y: 0.3 }],
        color: "#123456",
        width: 0.01,
        text: "Mark",
        fontSize: 0.1,
      },
    ],
  };
  sheet.floatingImages = [image];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const before = serializeWorkbook(workbook);
  const plan = planFloatingPictureToCell(sheet, image.id)!;
  expect(plan.address).toEqual({ row: 1, column: 1 });
  expect(
    executeWorkbookCommand(session, createConvertFloatingImageToCellCommand(sheet.id, image.id)),
  ).toBe(true);
  const converted = serializeWorkbook(workbook);
  expect(converted.version).toBe(53);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(workbook)).toEqual(converted);
  // Hiding the owner after conversion must not rewrite its local reference size.
  sheet.hiddenRows!.add(1);
  sheet.hiddenColumns!.add(1);
  return { workbook, sheet, address: plan.address };
}

test("real conversion JSON preserves anchorless geometry, merged owner, hidden axes, resources and editable return", async () => {
  const { workbook, sheet, address } = convertedFixture();
  const browser = setupGroupJsonBrowser();
  const before = serializeWorkbook(workbook);
  const ids = collectWorkbookImageAssetIds(workbook);
  expect(ids.size).toBe(3);
  const source = createMemoryImageAssetStore(),
    destination = createMemoryImageAssetStore();
  const mapping = new Map<string, string>();
  for (const id of ids) {
    const bytes = id === "line" ? secondPng : actualPng;
    mapping.set(id, idFor(bytes));
    await source.put({ id, mimeType: "image/png", width: 1, height: 1, blob: new Blob([bytes]) });
  }
  await downloadWorkbookBundle(workbook, source);
  const portable = JSON.parse(await browser.blobs[0]!.text());
  expect(portable.snapshot).toEqual(before);
  const put = vi.spyOn(destination, "put"),
    putAll = vi.spyOn(destination, "putAll");
  const restored = await readWorkbookBundleFile(
    { text: async () => JSON.stringify(portable) },
    destination,
  );
  const expected = JSON.parse(JSON.stringify(before), (key, value: unknown) =>
    key === "assetId" ? mapping.get(value as string) : value,
  );
  expect(JSON.parse(JSON.stringify(serializeWorkbook(restored)))).toEqual(expected);
  expect(put).not.toHaveBeenCalled();
  expect(putAll).toHaveBeenCalledOnce();
  expect(putAll.mock.calls[0]![0]).toHaveLength(2);
  expect(collectWorkbookImageAssetIds(restored)).toEqual(new Set(mapping.values()));
  await readWorkbookBundleFile({ text: async () => JSON.stringify(portable) }, destination);
  expect(putAll).toHaveBeenCalledOnce();
  expect(serializeWorkbook(workbook)).toEqual(before);
  const returnedSheet = getActiveSheet(restored);
  const content = getCellContent(returnedSheet, address);
  if (content?.kind !== "image" || !isFramedCellImage(content.image)) throw Error("framed cell");
  expect(content.image.frame).not.toHaveProperty("anchor");
  expect(content.image).not.toHaveProperty("members");
  expect(content.image.frame.size).toEqual({ width: 180, height: 90 });
  expect(returnedSheet.hiddenRows).toEqual(sheet.hiddenRows);
  expect(returnedSheet.hiddenColumns).toEqual(sheet.hiddenColumns);
  returnedSheet.hiddenRows!.clear();
  returnedSheet.hiddenColumns!.clear();
  const session = createWorkbookSession({
    workbook: restored,
    idFactory: createSequentialIdFactory(),
  });
  const embedded = serializeWorkbook(restored);
  expect(
    executeWorkbookCommand(
      session,
      createConvertCellImageToFloatingCommand(returnedSheet.id, address, "returned", {
        width: 2,
        height: 2,
      }),
    ),
  ).toBe(true);
  expect(returnedSheet.floatingImages[0]).toMatchObject({
    frame: {
      source: content.image.frame.source,
      angleDeg: 37,
      flipHorizontal: true,
      flipVertical: true,
      cropShape: content.image.frame.cropShape,
    },
    transform: content.image.transform,
    lockAspectRatio: false,
    printObject: false,
    locked: false,
    altTitle: "Cell source title",
  });
  const floating = serializeWorkbook(restored);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(restored)).toEqual(embedded);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(restored)).toEqual(floating);
});
