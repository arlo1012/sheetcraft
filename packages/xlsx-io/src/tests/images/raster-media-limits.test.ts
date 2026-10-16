import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { collectNativeChartParts } from "../../chart-package-parts.js";
import {
  inspectXlsxRasterMedia,
  MAX_XLSX_IMAGE_ASSETS,
  MAX_XLSX_IMAGE_BYTES,
  MAX_XLSX_PICTURE_OBJECTS,
  MAX_XLSX_TOTAL_IMAGE_BYTES,
} from "../../picture-reader.js";

const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const drawing = "xl/drawings/drawing1.xml";
const drawingRels = "xl/drawings/_rels/drawing1.xml.rels";
const relationship = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

async function base() {
  const workbook = createWorkbook({ id: "media", sheetId: "s" });
  getActiveSheet(workbook).floatingImages.push({
    id: "image",
    assetId: "image",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 0, y: 0, size: { width: 10, height: 10 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  });
  return unzipSync(
    (
      await encodeXlsx(workbook, {
        images: [
          {
            assetId: "image",
            bytes: png,
            width: 1,
            height: 1,
            extension: "png",
          },
        ],
      })
    ).bytes,
  );
}

function repeat(entries: Record<string, Uint8Array>, count: number, distinctAssets: boolean) {
  const xml = strFromU8(entries[drawing]!);
  const anchor = xml.match(/<xdr:absoluteAnchor>.*?<\/xdr:absoluteAnchor>/s)![0];
  entries[drawing] = strToU8(
    xml.replace(
      anchor,
      Array.from({ length: count }, (_, index) =>
        anchor
          .replace('id="1" name="Picture 1"', `id="${index + 1}" name="Picture ${index + 1}"`)
          .replace('r:embed="rId1"', `r:embed="rId${distinctAssets ? index + 1 : 1}"`),
      ).join(""),
    ),
  );
  if (!distinctAssets) return;
  const rels = strFromU8(entries[drawingRels]!);
  const original = rels.match(/<Relationship\s[^>]+\/>/)![0];
  entries[drawingRels] = strToU8(
    rels.replace(
      original,
      Array.from(
        { length: count },
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="${relationship}" Target="../media/image${index + 1}.png"/>`,
      ).join(""),
    ),
  );
  for (let i = 0; i < count; i++) entries[`xl/media/image${i + 1}.png`] = png;
}

describe("native raster resource boundaries", () => {
  test.each([
    ["png", "image/png", png],
    ["jpeg", "image/jpeg", new Uint8Array([255, 216, 255, 224])],
    [
      "gif",
      "image/gif",
      new Uint8Array(Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")),
    ],
  ] as const)(
    "checks %s signatures against declared MIME before runtime decoding",
    (extension, mime, bytes) => {
      expect(inspectXlsxRasterMedia(bytes, mime, "synthetic")).toBe(extension);
      expect(() => inspectXlsxRasterMedia(bytes, "image/svg+xml", "synthetic")).toThrow();
      expect(() => inspectXlsxRasterMedia(bytes.subarray(0, 2), mime, "synthetic")).toThrow();
    },
  );
  test("rejects over-budget encoded bytes independently of a browser decoder", () => {
    const bytes = new Uint8Array(MAX_XLSX_IMAGE_BYTES + 1);
    bytes.set(png);
    expect(() => inspectXlsxRasterMedia(bytes, "image/png", "large.png")).toThrowError(
      expect.objectContaining({
        report: { issues: [expect.objectContaining({ code: "archive-limit" })] },
      }),
    );
  });
  test.each([
    ["asset count", MAX_XLSX_IMAGE_ASSETS + 1, true],
    ["object count", MAX_XLSX_PICTURE_OBJECTS + 1, false],
  ] as const)("bounds %s without allocating decoded pixels", async (_name, count, distinct) => {
    const entries = await base();
    repeat(entries, count, distinct);
    await expect(
      collectNativeChartParts(entries, async (part) => entries[part]),
    ).rejects.toMatchObject({
      report: { issues: [expect.objectContaining({ code: "archive-limit", severity: "block" })] },
    });
  });
  test("bounds total distinct image bytes while repeated parts stay deduplicated", async () => {
    const entries = await base();
    repeat(entries, 4, true);
    for (let i = 1; i <= 4; i++) {
      const bytes = new Uint8Array(MAX_XLSX_TOTAL_IMAGE_BYTES / 4 + 1);
      bytes.set(png);
      entries[`xl/media/image${i}.png`] = bytes;
    }
    await expect(
      collectNativeChartParts(entries, async (part) => entries[part]),
    ).rejects.toMatchObject({
      report: { issues: [expect.objectContaining({ code: "archive-limit" })] },
    });
  });
  test.each(["external", "traversal", "duplicate-id", "wrong-mime", "rich-data"] as const)(
    "rejects unpreservable %s relationships/content before returning a workbook",
    async (mode) => {
      const entries = await base();
      const rels = strFromU8(entries[drawingRels]!);
      if (mode === "external")
        entries[drawingRels] = strToU8(
          rels.replace(
            'Target="../media/image1.png"',
            'Target="https://invalid.test/image.png" TargetMode="External"',
          ),
        );
      if (mode === "traversal")
        entries[drawingRels] = strToU8(rels.replace("../media/image1.png", "../%2e%2e/image.png"));
      if (mode === "duplicate-id")
        entries[drawingRels] = strToU8(
          rels.replace(
            "</Relationships>",
            rels.match(/<Relationship\s[^>]+\/>/)![0] + "</Relationships>",
          ),
        );
      if (mode === "wrong-mime")
        entries["[Content_Types].xml"] = strToU8(
          strFromU8(entries["[Content_Types].xml"]!).replace(
            'ContentType="image/png"',
            'ContentType="image/jpeg"',
          ),
        );
      if (mode === "rich-data") entries["xl/richData/rdrichvalue.xml"] = strToU8("<rvData/>");
      await expect(decodeXlsx(zipSync(entries))).rejects.toMatchObject({
        name: "XlsxCompatibilityError",
        report: {
          issues: expect.arrayContaining([expect.objectContaining({ severity: "block" })]),
        },
      });
    },
  );
});
