import { createHash, webcrypto } from "node:crypto";
import { createApp, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbookSession } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import {
  collectWorkbookImageAssetIds,
  useImageAssetUrls,
} from "../../../modules/image-assets/useImageAssetUrls";
import { readWorkbookBundleFile } from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { actualPng } from "../image-assets/image-header-fixtures";

const png = Buffer.from(actualPng).toString("base64");
const expectedId = `image-${createHash("sha256").update(actualPng).digest("hex")}`;
function paint(assetId: string) {
  return {
    kind: "picture" as const,
    assetId,
    opacity: 0.37,
    rotateWithShape: false,
    layout: {
      kind: "tile" as const,
      scaleX: 2,
      scaleY: 3,
      offsetXPt: 4,
      offsetYPt: 5,
      anchor: "top-right" as const,
      flip: "xy" as const,
    },
  };
}
function style(fillId: string, lineId: string): ShapeDetailedStyle {
  return {
    fill: { kind: "value", value: paint(fillId) },
    line: {
      kind: "value",
      value: {
        paint: {
          ...paint(lineId),
          layout: {
            kind: "stretch",
            offsetXRatio: -0.2,
            offsetYRatio: 0.1,
            widthRatio: 1.3,
            heightRatio: 0.8,
          },
        },
        widthPt: 2.5,
        compound: "double",
        dash: "long-dash",
        cap: "round",
        join: "bevel",
        miterLimit: 4,
      },
    },
  };
}
function fixture(mixed = false) {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook),
    drawing = createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 });
  drawing.shapeStyle = style("shape-fill", "shape-line");
  sheet.drawings = [drawing];
  if (mixed) {
    setCellContent(
      sheet,
      { row: 1, column: 1 },
      {
        kind: "image",
        image: { assetId: "picture-source", altText: "Cell picture" },
      },
    );
    sheet.floatingImages = [
      {
        id: "picture",
        assetId: "picture-source",
        altText: "Floating picture",
        anchor: { row: 2, column: 2 },
        offsetX: 0,
        offsetY: 0,
        width: 100,
        height: 80,
      },
    ];
  }
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
    snapshot = serializeWorkbook(workbook);
  return {
    workbook,
    snapshot,
    unchanged() {
      expect(serializeWorkbook(workbook)).toEqual(snapshot);
      expect(session.history.undoStack).toEqual([]);
      expect(session.history.redoStack).toEqual([]);
      expect(session.history.revision).toBe(0);
    },
  };
}
const portableImage = (id: string, data = png) => ({
  id,
  data,
  mimeType: "image/jpeg",
  width: 999,
  height: 999,
});
function bundle(snapshot: unknown, images: ReturnType<typeof portableImage>[]) {
  return {
    text: async () =>
      JSON.stringify({
        format: "sheetcraft-workbook",
        version: 1,
        snapshot,
        images,
      }),
  };
}
function decoding() {
  const url = {
    createObjectURL: vi.fn(() => "blob:synthetic-png"),
    revokeObjectURL: vi.fn(),
  };
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", url);
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
  return url;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shapeStyle portable resource ownership", () => {
  test("real PNG import remaps fill and line paint IDs while preserving geometry and ordinary picture sources", async () => {
    const f = fixture(true),
      store = createMemoryImageAssetStore();
    decoding();
    const imported = await readWorkbookBundleFile(
      bundle(f.snapshot, [
        portableImage("shape-fill"),
        portableImage("shape-line"),
        portableImage("picture-source"),
      ]),
      store,
    );
    const sheet = getActiveSheet(imported),
      drawing = sheet.drawings?.[0];
    expect(drawing).toEqual({
      ...getActiveSheet(f.workbook).drawings![0],
      shapeStyle: style(expectedId, expectedId),
    });
    expect(sheet.cells.get("1:1")?.content).toMatchObject({
      kind: "image",
      image: { assetId: expectedId, altText: "Cell picture" },
    });
    expect(sheet.floatingImages[0]).toMatchObject({
      id: "picture",
      assetId: expectedId,
      altText: "Floating picture",
      width: 100,
      height: 80,
    });
    expect(collectWorkbookImageAssetIds(imported)).toEqual(new Set([expectedId]));
    const saved = await store.get(expectedId);
    expect(saved).toMatchObject({ id: expectedId, mimeType: "image/png", width: 1, height: 1 });
    expect(new Uint8Array(await saved!.blob.arrayBuffer())).toEqual(actualPng);
    f.unchanged();
  });

  test.each(["shape-fill", "shape-line"])(
    "missing %s bytes reject before decode/storage and preserve the source document/history",
    async (missing) => {
      const f = fixture(),
        url = decoding(),
        store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
      await expect(
        readWorkbookBundleFile(
          bundle(
            f.snapshot,
            ["shape-fill", "shape-line"]
              .filter((id) => id !== missing)
              .map((id) => portableImage(id)),
          ),
          store,
        ),
      ).rejects.toMatchObject({ code: "missing-image" });
      expect(store.get).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
      expect(url.createObjectURL).not.toHaveBeenCalled();
      f.unchanged();
    },
  );

  test("plain snapshots with shape textures require a resource bundle", async () => {
    const f = fixture(),
      store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    await expect(
      readWorkbookBundleFile({ text: async () => JSON.stringify(f.snapshot) }, store),
    ).rejects.toMatchObject({ code: "missing-image" });
    expect(store.put).not.toHaveBeenCalled();
    f.unchanged();
  });

  test("one corrupt line texture prevents all storage writes and does not change the original workbook/history", async () => {
    const f = fixture(),
      store = { get: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    decoding();
    await expect(
      readWorkbookBundleFile(
        bundle(f.snapshot, [
          portableImage("shape-fill"),
          portableImage("shape-line", btoa("not image bytes")),
        ]),
        store,
      ),
    ).rejects.toMatchObject({ code: "invalid-images" });
    expect(store.put).not.toHaveBeenCalled();
    f.unchanged();
  });

  test("a conflicting content-derived asset rejects without overwriting storage or source history", async () => {
    const f = fixture(),
      store = {
        get: vi.fn(async () => ({
          id: expectedId,
          mimeType: "image/png",
          width: 1,
          height: 1,
          blob: new Blob(["different stored content"]),
        })),
        put: vi.fn(async () => {}),
      };
    decoding();
    await expect(
      readWorkbookBundleFile(
        bundle(f.snapshot, [portableImage("shape-fill"), portableImage("shape-line")]),
        store,
      ),
    ).rejects.toMatchObject({ code: "invalid-images" });
    expect(store.put).not.toHaveBeenCalled();
    f.unchanged();
  });
});

test("removing shape texture URLs retains unrelated picture texture URLs until their own owner unmounts", async () => {
  const f = fixture(true),
    workbook = ref(f.workbook),
    sheet = getActiveSheet(workbook.value),
    store = createMemoryImageAssetStore(),
    ids = ["shape-fill", "shape-line", "picture-source", "picture-fill", "picture-line"];
  const content = sheet.cells.get("1:1")!.content;
  if (content?.kind !== "image") throw Error("Expected picture fixture");
  content.image.transform = {
    appearance: { detailedStyle: style("picture-fill", "picture-line") },
  };
  for (const id of ids)
    await store.put({
      id,
      mimeType: "image/png",
      width: 1,
      height: 1,
      blob: new Blob([actualPng], { type: "image/png" }),
    });
  let sequence = 0;
  const url = {
    createObjectURL: vi.fn(() => `blob:texture-${++sequence}`),
    revokeObjectURL: vi.fn(),
  };
  vi.stubGlobal("URL", url);
  let resources!: ReturnType<typeof useImageAssetUrls>;
  const app = createApp({
    setup() {
      resources = useImageAssetUrls(() => workbook.value, store);
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
  try {
    await flushPromises();
    expect(resources.urls.value.size).toBe(5);
    const previous = new Map(resources.urls.value);
    sheet.drawings = [];
    await nextTick();
    await flushPromises();
    expect(new Set(resources.urls.value.keys())).toEqual(
      new Set(["picture-source", "picture-fill", "picture-line"]),
    );
    for (const id of ["shape-fill", "shape-line"])
      expect(url.revokeObjectURL).toHaveBeenCalledWith(previous.get(id));
    for (const id of ["picture-source", "picture-fill", "picture-line"]) {
      expect(resources.urls.value.get(id)).toBe(previous.get(id));
      expect(url.revokeObjectURL).not.toHaveBeenCalledWith(previous.get(id));
    }
    expect(resources.missing.value.size).toBe(0);
    app.unmount();
    for (const id of ["picture-source", "picture-fill", "picture-line"])
      expect(url.revokeObjectURL).toHaveBeenCalledWith(previous.get(id));
    expect(url.createObjectURL).toHaveBeenCalledTimes(5);
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(5);
  } finally {
    app.unmount();
  }
});
