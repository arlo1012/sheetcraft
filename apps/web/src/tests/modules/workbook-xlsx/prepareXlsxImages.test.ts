import { framedPicture } from "../sheet-images/framed-picture-fixture";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ImageAsset, ImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareXlsxImages } from "../../../modules/workbook-xlsx/prepareXlsxImages";

function imageAsset(id: string, mimeType = "image/png", width = 80, height = 40): ImageAsset {
  return {
    id,
    mimeType,
    width,
    height,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }),
  };
}

function imageSnapshot() {
  const workbook = createWorkbook({
    id: "workbook",
    sheetId: "sheet",
    sheetName: "Images",
  });
  return { workbook, sheet: getActiveSheet(workbook) };
}

function store(...assets: ImageAsset[]): ImageAssetStore & { get: ReturnType<typeof vi.fn> } {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    get: vi.fn(async (id: string) => byId.get(id)),
    put: vi.fn(async () => {}),
  };
}

function installRaster(width = 80, height = 40) {
  const context = {
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: (callback: BlobCallback) =>
      callback(new Blob([new Uint8Array([9, 8])], { type: "image/png" })),
  };
  class RasterImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", RasterImage);
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? canvas : createElement(tag)) as typeof document.createElement);
  return { canvas, context };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareXlsxImages", () => {
  test.each([
    ["cell", "suppressThemeEffects"],
    ["floating", "suppressThemeEffects"],
    ["cell", "detailedStyle"],
    ["floating", "detailedStyle"],
  ] as const)(
    "%s %s blocks before asset reads or any browser image preparation",
    async (kind, field) => {
      const { workbook, sheet } = imageSnapshot();
      const transform =
        field === "detailedStyle"
          ? { appearance: { detailedStyle: { fill: { kind: "none" as const } } } }
          : { appearance: { suppressThemeEffects: { outline: true as const } } };
      if (kind === "cell")
        setCellContent(
          sheet,
          { row: 1, column: 2 },
          { kind: "image", image: { assetId: "logo", altText: "Synthetic", transform } },
        );
      else
        sheet.floatingImages = [
          {
            id: "floating",
            assetId: "logo",
            altText: "Synthetic",
            anchor: { row: 0, column: 0 },
            offsetX: 0,
            offsetY: 0,
            width: 80,
            height: 40,
            transform,
          },
        ];
      const snapshot = serializeWorkbook(workbook),
        before = structuredClone(snapshot);
      const assets = store(imageAsset("logo")),
        urls = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() };
      const decode = vi.fn();
      vi.stubGlobal("URL", urls);
      vi.stubGlobal("Image", decode);
      const create = vi.spyOn(document, "createElement");
      await expect(prepareXlsxImages(snapshot, assets)).rejects.toMatchObject({
        name: "XlsxWorkerFailure",
        report: {
          issues: [
            {
              code: "feature-omitted",
              severity: "block",
              count: 1,
              locations: [
                kind === "cell"
                  ? `Images!C2.transform.appearance.${field}`
                  : `Images.floatingImages["floating"].transform.appearance.${field}`,
              ],
            },
          ],
        },
      });
      expect(assets.get).not.toHaveBeenCalled();
      expect(urls.createObjectURL).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(snapshot).toEqual(before);
      expect(serializeWorkbook(workbook)).toEqual(before);
    },
  );
  test("frame geometry is blocked before asset reads, decoding, URLs or raster preparation", async () => {
    const { workbook, sheet } = imageSnapshot();
    sheet.floatingImages = [framedPicture()];
    const assets = store(imageAsset("asset")),
      urls = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() };
    vi.stubGlobal("URL", urls);
    await expect(prepareXlsxImages(serializeWorkbook(workbook), assets)).rejects.toMatchObject({
      name: "XlsxWorkerFailure",
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: ['Images.floatingImages["framed"].frame'],
          },
        ],
      },
    });
    expect(assets.get).not.toHaveBeenCalled();
    expect(urls.createObjectURL).not.toHaveBeenCalled();
  });
  test("collects cell and floating references and deduplicates asset reads and variants", async () => {
    const { workbook, sheet } = imageSnapshot();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "image", image: { assetId: "logo", altText: "Logo" } },
    );
    setCellContent(
      sheet,
      { row: 1, column: 0 },
      { kind: "image", image: { assetId: "logo", altText: "Logo" } },
    );
    sheet.floatingImages.push({
      id: "floating",
      assetId: "logo",
      altText: "Logo",
      anchor: { row: 2, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 80,
      height: 40,
      transform: {
        crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
        rotation: 90,
      },
    });
    const assets = store(imageAsset("logo"));
    const urls = {
      createObjectURL: vi.fn(() => "blob:logo"),
      revokeObjectURL: vi.fn(),
    };
    vi.stubGlobal("URL", urls);
    const raster = installRaster();

    const result = await prepareXlsxImages(serializeWorkbook(workbook), assets);

    expect(assets.get).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      assetId: "logo",
      extension: "png",
      width: 80,
      height: 40,
    });
    expect(result[1]).toMatchObject({
      assetId: "logo",
      extension: "png",
      width: 40,
      height: 40,
    });
    expect(raster.context.drawImage).toHaveBeenCalledOnce();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:logo");
  });

  test.each([
    ["image/png", "png"],
    ["image/jpeg", "jpeg"],
    ["image/gif", "gif"],
  ] as const)(
    "keeps untransformed %s bytes in their original format",
    async (mimeType, extension) => {
      const { workbook, sheet } = imageSnapshot();
      setCellContent(
        sheet,
        { row: 0, column: 0 },
        { kind: "image", image: { assetId: "asset", altText: "Asset" } },
      );
      const result = await prepareXlsxImages(
        serializeWorkbook(workbook),
        store(imageAsset("asset", mimeType)),
      );

      expect(result[0]).toMatchObject({ extension, width: 80, height: 40 });
      expect(new Uint8Array(result[0]!.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    },
  );

  test("bakes WebP and normalized transforms into a cropped, rotated PNG", async () => {
    const { workbook, sheet } = imageSnapshot();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: {
          assetId: "webp",
          altText: "WebP",
          transform: {
            crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
            rotation: 90,
            flipHorizontal: true,
          },
        },
      },
    );
    const urls = {
      createObjectURL: vi.fn(() => "blob:webp"),
      revokeObjectURL: vi.fn(),
    };
    vi.stubGlobal("URL", urls);
    const raster = installRaster(100, 40);

    const result = await prepareXlsxImages(
      serializeWorkbook(workbook),
      store(imageAsset("webp", "image/webp", 100, 40)),
    );

    expect(result[0]).toMatchObject({
      extension: "png",
      width: 40,
      height: 50,
    });
    expect(result[0]?.transform).toEqual({
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      rotation: 90,
      flipHorizontal: true,
    });
    expect(raster.context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      25,
      0,
      50,
      40,
      0,
      0,
      50,
      40,
    );
    expect(raster.canvas).toMatchObject({ width: 0, height: 0 });
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:webp");
  });

  test("fails rather than omitting a missing store or image asset", async () => {
    const { workbook, sheet } = imageSnapshot();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "image", image: { assetId: "missing", altText: "Missing" } },
    );
    const snapshot = serializeWorkbook(workbook);

    await expect(prepareXlsxImages(snapshot, undefined)).rejects.toThrow(
      "cannot read image assets",
    );
    await expect(prepareXlsxImages(snapshot, store())).rejects.toThrow(
      "missing image asset missing",
    );
  });

  test("rejects immediately when an asset lookup is aborted", async () => {
    const { workbook, sheet } = imageSnapshot();
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "image", image: { assetId: "slow", altText: "Slow" } },
    );
    const controller = new AbortController();
    const pending = new Promise<ImageAsset | undefined>(() => {});
    const operation = prepareXlsxImages(
      serializeWorkbook(workbook),
      { get: () => pending, put: async () => {} },
      controller.signal,
    );
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });
});
