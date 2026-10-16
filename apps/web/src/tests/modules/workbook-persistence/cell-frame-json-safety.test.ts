import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { CellImage } from "@sheetcraft/core/cell-picture-frame";
import { assertExternalPictureGroupSupport } from "../../../modules/sheet-images/picture-document-support";
import {
  downloadWorkbookBundle,
  parseWorkbookJson,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { framedCellPicture } from "../sheet-images/cell-picture-fixture";
import { actualPng, pngChunk } from "../image-assets/image-header-fixtures";
import { setupGroupJsonBrowser } from "./group-json-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const workbook = createWorkbook({ id: "cell-safety", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const image = framedCellPicture();
  setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image });
  const cell = sheet.cells.get("3:2")!;
  if (cell.content?.kind !== "image") throw Error("fixture");
  return { workbook, sheet, cell, image: cell.content.image };
}
const store = () => ({ get: vi.fn(), put: vi.fn(), putAll: vi.fn() });

test.each([
  "unknown",
  "missing",
  "null",
  "conflicting",
  "overflow",
  "reflection",
  "inherited",
  "symbol",
  "cycle",
])("%s cell frame rejects before asset reads and download", async (kind) => {
  const f = fixture(),
    image = f.image;
  if (!image.frame) throw Error("fixture");
  if (kind === "unknown") Object.assign(image.frame, { kind: "future-cell-frame" });
  if (kind === "missing") Object.assign(image, { frame: undefined });
  if (kind === "null") Object.assign(image, { frame: null });
  if (kind === "conflicting") Object.assign(image.transform!, { rotation: 0 });
  if (kind === "overflow") image.frame.source.widthRatio = Number.MAX_VALUE;
  if (kind === "reflection") image.transform = { appearance: { reflection: true } };
  if (kind === "inherited") {
    const { frame, ...rest } = image;
    f.cell.content = {
      kind: "image",
      image: Object.assign(Object.create({ frame }), rest) as CellImage,
    };
  }
  if (kind === "symbol") Object.assign(image.frame, { [Symbol("unknown")]: 1 });
  if (kind === "cycle") Object.assign(image.transform!, { unknown: image.transform });
  const assets = store(),
    browser = setupGroupJsonBrowser();
  await expect(downloadWorkbookBundle(f.workbook, assets)).rejects.toThrow();
  expect(assets.get).not.toHaveBeenCalled();
  expect(assets.put).not.toHaveBeenCalled();
  expect(assets.putAll).not.toHaveBeenCalled();
  expect(browser.blobs).toHaveLength(0);
});

test.each(["content", "kind", "image", "frame", "source", "appearance", "point"])(
  "%s accessor rejects without invoking caller code",
  async (field) => {
    const f = fixture();
    const getter = vi.fn(() => {
      throw Error("getter ran");
    });
    const target =
      field === "content"
        ? f.cell
        : field === "kind" || field === "image"
          ? f.cell.content!
          : field === "frame"
            ? f.image
            : field === "source"
              ? f.image.frame!
              : field === "appearance"
                ? f.image.transform!
                : f.image.transform!.annotations![0]!.points[0]!;
    Object.defineProperty(target, field === "point" ? "x" : field, { get: getter });
    const assets = store();
    await expect(downloadWorkbookBundle(f.workbook, assets)).rejects.toThrow(/data field|accessor/);
    expect(getter).not.toHaveBeenCalled();
    expect(assets.get).not.toHaveBeenCalled();
    expect(assets.putAll).not.toHaveBeenCalled();
  },
);

test.each(["cell", "content", "image", "frame"])("nonordinary %s prototype rejects", (field) => {
  const f = fixture();
  const target =
    field === "cell"
      ? f.cell
      : field === "content"
        ? f.cell.content!
        : field === "image"
          ? f.image
          : f.image.frame!;
  Object.setPrototypeOf(target, {});
  expect(() => assertExternalPictureGroupSupport(f.workbook)).toThrow(/ordinary/);
});

test.each([-1, 1.5, 1048576])("invalid row %s is rejected before imported assets", async (row) => {
  const snapshot = serializeWorkbook(fixture().workbook);
  snapshot.sheets[0]!.cells[0]!.address.row = row;
  const assets = store();
  await expect(
    readWorkbookBundleFile(
      {
        text: async () =>
          JSON.stringify({ format: "sheetcraft-workbook", version: 1, snapshot, images: [] }),
      },
      assets,
    ),
  ).rejects.toMatchObject({ code: "invalid-snapshot" });
  expect(assets.get).not.toHaveBeenCalled();
  expect(assets.putAll).not.toHaveBeenCalled();
});

test.each(["future", "reflection", "overflow"])(
  "incoming %s model rejects before asset decoding/storage",
  async (kind) => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.workbook);
    const content = snapshot.sheets[0]!.cells[0]!.content;
    if (content?.kind !== "image" || !content.image.frame) throw Error("fixture");
    if (kind === "future") Object.assign(content.image.frame, { kind: "future-cell-frame" });
    if (kind === "reflection") content.image.transform = { appearance: { reflection: true } };
    if (kind === "overflow") content.image.frame.source.widthRatio = Number.MAX_VALUE;
    setupGroupJsonBrowser();
    const assets = store(),
      decode = vi.fn();
    vi.stubGlobal("Image", decode);
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              snapshot,
              images: [{ id: "cell-source", data: "bad" }],
            }),
        },
        assets,
      ),
    ).rejects.toMatchObject({ code: "invalid-snapshot" });
    expect(decode).not.toHaveBeenCalled();
    expect(assets.get).not.toHaveBeenCalled();
    expect(assets.putAll).not.toHaveBeenCalled();
  },
);

function resourceFixture() {
  const f = fixture();
  const paint = {
    kind: "picture" as const,
    assetId: "fill",
    opacity: 1,
    rotateWithShape: true,
    layout: {
      kind: "stretch" as const,
      offsetXRatio: 0,
      offsetYRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
    },
  };
  f.image.transform = {
    appearance: {
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
  };
  const second = new Uint8Array([
    ...actualPng.slice(0, -12),
    ...pngChunk("tEXt", new TextEncoder().encode("Comment\0different")),
    ...actualPng.slice(-12),
  ]);
  return {
    snapshot: serializeWorkbook(f.workbook),
    images: ["cell-source", "fill", "line"].map((id) => ({
      id,
      mimeType: "image/png",
      width: 1,
      height: 1,
      data: Buffer.from(id === "line" ? second : actualPng).toString("base64"),
    })),
  };
}

test.each(["cell-source", "fill", "line"])(
  "missing %s resource rejects before writes",
  async (missing) => {
    const f = resourceFixture(),
      assets = store();
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              ...f,
              images: f.images.filter((image) => image.id !== missing),
            }),
        },
        assets,
      ),
    ).rejects.toMatchObject({ code: "missing-image" });
    expect(assets.get).not.toHaveBeenCalled();
    expect(assets.putAll).not.toHaveBeenCalled();
  },
);

test.each(["no-atomic-store", "failed-batch", "bad-bytes", "duplicate-id", "collision"])(
  "%s never falls back to partial individual writes",
  async (kind) => {
    setupGroupJsonBrowser();
    const f = resourceFixture(),
      assets = store();
    if (kind === "no-atomic-store") Reflect.deleteProperty(assets, "putAll");
    if (kind === "failed-batch") assets.putAll.mockRejectedValue(new Error("storage"));
    if (kind === "bad-bytes") f.images[1]!.data = "bad";
    if (kind === "duplicate-id") f.images.push(f.images[0]!);
    if (kind === "collision") assets.get.mockResolvedValue({ blob: new Blob(["wrong bytes"]) });
    await expect(
      readWorkbookBundleFile(
        { text: async () => JSON.stringify({ format: "sheetcraft-workbook", version: 1, ...f }) },
        assets,
      ),
    ).rejects.toMatchObject({
      code: ["bad-bytes", "duplicate-id", "collision"].includes(kind)
        ? "invalid-images"
        : "image-storage-unavailable",
    });
    expect(assets.put).not.toHaveBeenCalled();
    if (kind === "failed-batch") expect(assets.putAll).toHaveBeenCalledOnce();
    else if (assets.putAll) expect(assets.putAll).not.toHaveBeenCalled();
  },
);

test("large derived local dimensions remain supported and old snapshot versions remain invalid", () => {
  const f = fixture();
  f.image.frame!.size.width = 100000;
  expect(() => assertExternalPictureGroupSupport(f.workbook)).not.toThrow();
  const snapshot = serializeWorkbook(f.workbook);
  expect(serializeWorkbook(parseWorkbookJson(JSON.stringify(snapshot)))).toEqual(snapshot);
  expect(() => parseWorkbookJson(JSON.stringify({ ...snapshot, version: 52 }))).toThrow(
    expect.objectContaining({ code: "invalid-snapshot" }),
  );
});
