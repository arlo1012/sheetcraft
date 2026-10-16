import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { collectWorkbookImageAssetIds } from "../../../modules/image-assets/useImageAssetUrls";
import { assertExternalPictureGroupSupport } from "../../../modules/sheet-images/picture-document-support";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  downloadWorkbookBundle,
  parseWorkbookJson,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { framedPicture } from "../sheet-images/framed-picture-fixture";
import { pictureGroup } from "../sheet-images/picture-group-fixture";
import { actualPng, pngChunk } from "../image-assets/image-header-fixtures";

const secondPng = new Uint8Array([
  ...actualPng.slice(0, -12),
  ...pngChunk("tEXt", new TextEncoder().encode("Comment\0distinct texture")),
  ...actualPng.slice(-12),
]);
const secondId = `image-${createHash("sha256").update(secondPng).digest("hex")}`;
const expectedId = `image-${createHash("sha256").update(actualPng).digest("hex")}`;
const anchors: PictureFrameAnchor[] = [
  { mode: "fixed", x: 194, y: 74, size: { width: 159, height: 200 } },
  {
    mode: "move-only",
    origin: { column: { index: 4, offset: 1 }, row: { index: 20, offset: 1 } },
    offsetMode: "free-pixels",
    size: { width: 159, height: 200 },
  },
  {
    mode: "move-and-size",
    start: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    end: { column: { index: 4, offset: 0 }, row: { index: 8, offset: 0 } },
  },
];
function style(id: string): PictureDetailedStyle {
  const paint = {
    kind: "picture" as const,
    assetId: id,
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
  return {
    fill: { kind: "value", value: paint },
    line: {
      kind: "value",
      value: {
        paint: { ...paint },
        widthPt: 1,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    },
  };
}
function fixture(anchor: PictureFrameAnchor = anchors[1]!) {
  const workbook = createWorkbook({ id: "json", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const image = framedPicture();
  image.frame.anchor = anchor;
  image.frame.angleDeg = 0;
  image.transform = {
    appearance: {
      suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
      detailedStyle: style("picture-paint"),
    },
  };
  image.hidden = true;
  image.altTitle = "native PNG";
  image.locked = true;
  image.printObject = false;
  sheet.floatingImages = [image];
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    {
      kind: "image",
      image: {
        assetId: "cell",
        altText: "cell",
        transform: { appearance: { detailedStyle: style("cell-paint") } },
      },
    },
  );
  const shape = createGraphicDrawing("text", "textBox", "网页新增文本🙂", { row: 2, column: 1 });
  shape.shapeStyle = style("shape-paint");
  shape.shapeText!.style = style("glyph-paint");
  shape.shapeText!.characterRuns = [{ start: 6, end: 8, ...style("run-paint") }];
  sheet.drawings = [shape];
  const watermark = {
    ...DEFAULT_SHEET_WATERMARK,
    image: { assetId: "watermark", scale: null, washout: true, angle: 0 },
  };
  sheet.pageDecoration = { backgroundAssetId: "background", watermark };
  workbook.watermarkPresets = [
    {
      id: "preset",
      name: "logo",
      watermark: { ...watermark, image: { ...watermark.image, assetId: "preset" } },
    },
  ];
  return workbook;
}
function setupBrowser() {
  const blobs: Blob[] = [];
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:json-test";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1;
      naturalHeight = 1;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return { blobs, click };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("standalone canonical picture portable JSON", () => {
  test.each(anchors)(
    "roundtrips every field and all resources with $mode geometry",
    async (anchor) => {
      const workbook = fixture(anchor),
        before = serializeWorkbook(workbook),
        browser = setupBrowser();
      const ids = collectWorkbookImageAssetIds(workbook);
      expect(ids).toEqual(
        new Set([
          "asset",
          "picture-paint",
          "cell",
          "cell-paint",
          "shape-paint",
          "glyph-paint",
          "run-paint",
          "watermark",
          "background",
          "preset",
        ]),
      );
      const source = createMemoryImageAssetStore();
      const expectedIds = new Map(
        [...ids].map((id) => [
          id,
          anchor.mode === "fixed" && id.endsWith("paint") ? secondId : expectedId,
        ]),
      );
      for (const id of ids)
        await source.put({
          id,
          mimeType: "image/png",
          width: 1,
          height: 1,
          blob: new Blob([expectedIds.get(id) === secondId ? secondPng : actualPng]),
        });
      await downloadWorkbookBundle(workbook, source);
      expect(browser.click).toHaveBeenCalledOnce();
      const portable = JSON.parse(await browser.blobs[0]!.text());
      expect(portable.snapshot).toEqual(before);
      expect(new Set(portable.images.map((item: { id: string }) => item.id))).toEqual(ids);
      const destination = createMemoryImageAssetStore();
      await destination.put({
        id: "unrelated",
        mimeType: "image/png",
        width: 1,
        height: 1,
        blob: new Blob([actualPng]),
      });
      const imported = await readWorkbookBundleFile(
        { text: async () => JSON.stringify(portable) },
        destination,
      );
      const expected = JSON.parse(JSON.stringify(before), (key, value: unknown) =>
        key === "assetId" || key === "backgroundAssetId" ? expectedIds.get(value as string) : value,
      );
      expect(JSON.parse(JSON.stringify(serializeWorkbook(imported)))).toEqual(expected);
      expect(collectWorkbookImageAssetIds(imported)).toEqual(new Set(expectedIds.values()));
      expect(new Uint8Array(await (await destination.get(expectedId))!.blob.arrayBuffer())).toEqual(
        actualPng,
      );
      if (anchor.mode === "fixed")
        expect(new Uint8Array(await (await destination.get(secondId))!.blob.arrayBuffer())).toEqual(
          secondPng,
        );
      expect(await destination.get("unrelated")).toBeDefined();
      expect(serializeWorkbook(workbook)).toEqual(before);
      const previousBlobs = browser.blobs.length;
      await downloadWorkbookBundle(imported, destination);
      const again = JSON.parse(await browser.blobs[previousBlobs]!.text());
      expect(again.images).toHaveLength(new Set(expectedIds.values()).size);
      expect(again.snapshot).toEqual(expected);
    },
  );

  test("missing referenced paint bytes reject before storage writes", async () => {
    const workbook = fixture(),
      snapshot = serializeWorkbook(workbook),
      browser = setupBrowser();
    const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    const images = [...collectWorkbookImageAssetIds(workbook)]
      .filter((id) => id !== "picture-paint")
      .map((id) => ({
        id,
        mimeType: "image/png",
        width: 1,
        height: 1,
        data: Buffer.from(actualPng).toString("base64"),
      }));
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "missing-image" });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(browser.blobs).toEqual([]);
  });

  test.each([undefined, null, {}, { kind: "future-frame" }])(
    "invalid frame %j rejects before assets",
    async (frame) => {
      const workbook = fixture(),
        image = getActiveSheet(workbook).floatingImages[0]!;
      Object.assign(image, { frame });
      const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
      await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow();
      expect(store.get).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    },
  );

  test.each(["entry-getter", "filter", "iterator", "sparse"])(
    "rejects unsafe %s arrays without executing caller code",
    (kind) => {
      const workbook = fixture(),
        images = getActiveSheet(workbook).floatingImages;
      const called = vi.fn(() => {
        throw Error("must not execute");
      });
      if (kind === "entry-getter")
        Object.defineProperty(images, "0", { get: called, enumerable: true });
      if (kind === "filter") Object.defineProperty(images, "filter", { value: called });
      if (kind === "iterator") Object.defineProperty(images, Symbol.iterator, { value: called });
      if (kind === "sparse") delete images[0];
      expect(() => assertExternalPictureGroupSupport(workbook)).toThrow();
      expect(called).not.toHaveBeenCalled();
    },
  );

  test("split emoji runs reject before writes", async () => {
    const snapshot = serializeWorkbook(fixture());
    const drawing = snapshot.sheets[0]!.drawings![0]!;
    if (drawing.kind !== "textBox") throw Error("fixture");
    drawing.shapeText!.characterRuns = [{ start: 6, end: 7, color: "#ff0000" }];
    const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images: [] }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "invalid-snapshot" });
    expect(store.put).not.toHaveBeenCalled();
  });

  test("inherited picture accessors are rejected without execution", () => {
    const workbook = fixture(),
      image = getActiveSheet(workbook).floatingImages[0]!;
    const getter = vi.fn(() => {
      throw Error("must not run");
    });
    Object.setPrototypeOf(image, Object.defineProperty({}, "assetId", { get: getter }));
    delete (image as { assetId?: string }).assetId;
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/own data records/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("nested annotations getters reject without execution", () => {
    const workbook = fixture(),
      image = getActiveSheet(workbook).floatingImages[0]!;
    const getter = vi.fn(() => {
      throw Error("must not run");
    });
    Object.defineProperty(image.transform!, "annotations", { get: getter, enumerable: true });
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/own data fields/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("cyclic canonical data rejects before normalization", () => {
    const workbook = fixture(),
      image = getActiveSheet(workbook).floatingImages[0]!;
    Object.assign(image.transform!, { annotations: [image.transform] });
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/cycle/);
  });

  test("frame accessors are rejected without execution", () => {
    const workbook = fixture(),
      getter = vi.fn(() => {
        throw Error("must not run");
      });
    Object.defineProperty(getActiveSheet(workbook).floatingImages[0]!, "frame", { get: getter });
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/own data fields/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("owned groups and cell frames still reject before writes", async () => {
    for (const kind of ["group", "cell"]) {
      const workbook = fixture();
      if (kind === "group") getActiveSheet(workbook).floatingImages.push(pictureGroup());
      else {
        const cell = getActiveSheet(workbook).cells.get("0:0")!;
        if (cell.content?.kind !== "image") throw Error("fixture");
        Object.assign(cell.content.image, { frame: {} });
      }
      const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
      await expect(downloadWorkbookBundle(workbook, store)).rejects.toMatchObject({
        code: "unsupported-picture-frame",
      });
      expect(store.get).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    }
  });

  test("invalid incoming frame rejects without writes", async () => {
    const snapshot = serializeWorkbook(fixture());
    Object.assign(snapshot.sheets[0]!.floatingImages[0]!, { frame: { kind: "future-frame" } });
    const store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images: [] }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "invalid-snapshot" });
    expect(store.put).not.toHaveBeenCalled();
    expect(() => parseWorkbookJson(JSON.stringify(snapshot))).toThrow();
  });
});
