import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { collectWorkbookImageAssetIds } from "../../../modules/image-assets/useImageAssetUrls";
import {
  downloadWorkbookBundle,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { actualPng, pngChunk } from "../image-assets/image-header-fixtures";
import { groupJsonFixture, setupGroupJsonBrowser } from "./group-json-fixture";

const secondPng = new Uint8Array([
  ...actualPng.slice(0, -12),
  ...pngChunk("tEXt", new TextEncoder().encode("Comment\0group texture")),
  ...actualPng.slice(-12),
]);
const idFor = (bytes: Uint8Array) => `image-${createHash("sha256").update(bytes).digest("hex")}`;
const anchors: PictureFrameAnchor[] = [
  { mode: "fixed", x: 40, y: 10, size: { width: 120, height: 80 } },
  {
    mode: "move-only",
    origin: { column: { index: 2, offset: 4 }, row: { index: 3, offset: 2 } },
    offsetMode: "free-pixels",
    size: { width: 120, height: 80 },
  },
  {
    mode: "move-and-size",
    start: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    end: { column: { index: 4, offset: 0 }, row: { index: 8, offset: 0 } },
  },
];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(anchors)(
  "owned group JSON retains its complete local tree with $mode root",
  async (anchor) => {
    const { workbook } = groupJsonFixture(anchor),
      browser = setupGroupJsonBrowser();
    const before = serializeWorkbook(workbook),
      ids = collectWorkbookImageAssetIds(workbook);
    expect(ids).toEqual(new Set(["synthetic-asset", "paint", "line", "asset"]));
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
    expect(portable.images).toHaveLength(ids.size);
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
    for (const bytes of [actualPng, secondPng])
      expect(
        new Uint8Array(await (await destination.get(idFor(bytes)))!.blob.arrayBuffer()),
      ).toEqual(bytes);
    expect(serializeWorkbook(workbook)).toEqual(before);
    const index = browser.blobs.length;
    await downloadWorkbookBundle(restored, destination);
    const again = JSON.parse(await browser.blobs[index]!.text());
    expect(again.snapshot).toEqual(expected);
    expect(again.images).toHaveLength(2);
    await readWorkbookBundleFile({ text: async () => JSON.stringify(again) }, destination);
    expect(putAll).toHaveBeenCalledOnce();
  },
);

test.each(["synthetic-asset", "paint", "line"])(
  "missing hidden descendant resource %s rejects without writes",
  async (missing) => {
    const { workbook } = groupJsonFixture();
    const images = [...collectWorkbookImageAssetIds(workbook)]
      .filter((id) => id !== missing)
      .map((id) => ({
        id,
        mimeType: "image/png",
        width: 1,
        height: 1,
        data: Buffer.from(actualPng).toString("base64"),
      }));
    const store = { get: vi.fn(), put: vi.fn(), putAll: vi.fn() };
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              snapshot: serializeWorkbook(workbook),
              images,
            }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "missing-image" });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.putAll).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  },
);

test.each(["duplicate-source-id", "existing-collision", "no-atomic-store", "failed-batch"])(
  "group import %s fails without individual writes",
  async (kind) => {
    setupGroupJsonBrowser();
    const { workbook } = groupJsonFixture();
    const images = [...collectWorkbookImageAssetIds(workbook)].map((id) => ({
      id,
      mimeType: "image/png",
      width: 1,
      height: 1,
      data: Buffer.from(id === "line" ? secondPng : actualPng).toString("base64"),
    }));
    if (kind === "duplicate-source-id") images.push(images[0]!);
    const get = vi.fn(async () =>
      kind === "existing-collision"
        ? {
            id: idFor(actualPng),
            mimeType: "image/png",
            width: 1,
            height: 1,
            blob: new Blob(["wrong"]),
          }
        : undefined,
    );
    const put = vi.fn(async () => {}),
      putAll = vi.fn(async () => {
        throw Error("transaction aborted");
      });
    const store = { get, put, ...(kind === "no-atomic-store" ? {} : { putAll }) };
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              snapshot: serializeWorkbook(workbook),
              images,
            }),
        },
        store,
      ),
    ).rejects.toMatchObject({
      code:
        kind === "duplicate-source-id" || kind === "existing-collision"
          ? "invalid-images"
          : "image-storage-unavailable",
    });
    expect(put).not.toHaveBeenCalled();
    if (kind === "failed-batch") expect(putAll).toHaveBeenCalledOnce();
    else expect(putAll).not.toHaveBeenCalled();
  },
);
