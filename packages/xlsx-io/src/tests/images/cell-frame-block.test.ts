import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { CellImage } from "@sheetcraft/core/cell-picture-frame";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { assertSupportedXlsxImageAppearance, createXlsxImageExporter } from "../../image-export.js";

const location = "Synthetic!C4.frame";
const block = {
  name: "XlsxCompatibilityError",
  report: {
    issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [location] }],
  },
};

describe("paused source-bearing cell XLSX export", () => {
  test.each([
    undefined,
    null,
    {},
    {
      kind: "cell-picture-frame-v1",
      size: { width: 200, height: 100 },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
  ])("own frame presence blocks the whole workbook before resources: %j", async (frame) => {
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
    const sheet = getActiveSheet(workbook);
    sheet.cells.set("0:0", {
      content: { kind: "image", image: { assetId: "legacy", altText: "Earlier legacy picture" } },
    });
    sheet.cells.set("3:2", {
      content: {
        kind: "image",
        image: { assetId: "source", altText: "Framed", frame } as CellImage,
      },
    });
    const before = structuredClone(workbook);
    const resourceProvider = vi.fn(() => []);
    await expect(
      encodeXlsx(workbook, {
        get images() {
          return resourceProvider();
        },
      }),
    ).rejects.toMatchObject(block);
    expect(resourceProvider).not.toHaveBeenCalled();
    expect(workbook).toEqual(before);
  });

  test("presence guards never invoke a frame getter, including direct registration", async () => {
    const getter = vi.fn(() => {
      throw new Error("Must not inspect the frame value.");
    });
    const image = Object.defineProperty({ assetId: "source", altText: "Framed" }, "frame", {
      get: getter,
    }) as CellImage;
    expect(() => assertSupportedXlsxImageAppearance(image, "Synthetic!C4")).toThrow(
      XlsxCompatibilityError,
    );
    const target = { addImage: vi.fn(() => 0) };
    expect(() =>
      createXlsxImageExporter(target, undefined).registerCellImage(image, "Synthetic!C4"),
    ).toThrow(XlsxCompatibilityError);
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
    getActiveSheet(workbook).cells.set("3:2", { content: { kind: "image", image } });
    await expect(encodeXlsx(workbook)).rejects.toMatchObject(block);
    expect(getter).not.toHaveBeenCalled();
    expect(target.addImage).not.toHaveBeenCalled();
  });

  test("legacy cell media registration is unchanged", () => {
    const target = { addImage: vi.fn(() => 0) };
    const exporter = createXlsxImageExporter(target, {
      images: [
        {
          assetId: "source",
          bytes: new Uint8Array([137]),
          extension: "png",
          width: 200,
          height: 100,
        },
      ],
    });
    expect(
      exporter.registerCellImage({ assetId: "source", altText: "Legacy" }, "Synthetic!C4"),
    ).toEqual({ mediaFilename: "xl/media/image1.png", altText: "Legacy" });
    expect(target.addImage).toHaveBeenCalledOnce();
  });
});
