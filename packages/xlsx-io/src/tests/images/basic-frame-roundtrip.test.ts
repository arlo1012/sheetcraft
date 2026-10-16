import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setColumnWidth,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedPictureObject, type FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import { decodeXlsx, encodeXlsx, type XlsxImageAsset } from "../../index.js";
import { nativeColumnFixture } from "../charts/native-column-fixture.js";

const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const asset: XlsxImageAsset = {
  assetId: "raster",
  bytes: png,
  extension: "png",
  width: 32,
  height: 32,
};
const anchors: PictureFrameAnchor[] = [
  {
    mode: "move-only",
    origin: { column: { index: 1, offset: 10 }, row: { index: 3, offset: 6 } },
    size: { width: 120, height: 80 },
  },
  {
    mode: "move-and-size",
    start: { column: { index: 4, offset: 10 }, row: { index: 3, offset: 6 } },
    end: { column: { index: 5, offset: 30 }, row: { index: 6, offset: 14 } },
  },
  { mode: "fixed", x: 710, y: 78, size: { width: 120, height: 80 } },
];
function fixture() {
  const workbook = createWorkbook({ id: "pictures", sheetId: "s", sheetName: "Pictures" }),
    sheet = getActiveSheet(workbook);
  for (let i = 0; i < 12; i++) setColumnWidth(sheet, i, 100);
  for (let i = 0; i < 25; i++) setRowHeight(sheet, i, 24);
  sheet.floatingImages = anchors.map((anchor, index): FramedFloatingImage => ({
    id: `picture-${index}`,
    assetId: asset.assetId,
    altText: `Alt ${index} & literal _x0041_`,
    frame: {
      kind: "object-frame-v1",
      anchor,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  }));
  sheet.pageDecoration = { backgroundAssetId: asset.assetId };
  return { workbook, sheet };
}
const drawingPart = "xl/drawings/drawing1.xml";
async function mutate(transform: (entries: Record<string, Uint8Array>) => void) {
  const { workbook } = fixture();
  const entries = unzipSync((await encodeXlsx(workbook, { images: [asset] })).bytes);
  transform(entries);
  return zipSync(entries);
}
describe("basic raster frames", () => {
  test("preserves interleaved native anchor paint order", async () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages = [
      sheet.floatingImages[2]!,
      sheet.floatingImages[0]!,
      { ...sheet.floatingImages[2]!, id: "another-fixed", altText: "Fourth" },
      sheet.floatingImages[1]!,
    ];
    const decoded = await decodeXlsx((await encodeXlsx(workbook, { images: [asset] })).bytes);
    expect(getActiveSheet(decoded.workbook).floatingImages.map((image) => image.altText)).toEqual(
      sheet.floatingImages.map((image) => image.altText),
    );
  });
  test("retains the measured physical frame from WPS fixed-position twoCell/editAs=absolute", async () => {
    // Extracted from WPS 12.1.2.29182.AK.preread.sw re-saving our synthetic
    // product-v1 export on 2026-10-15. No account or unrelated workbook data.
    const { workbook, sheet } = fixture();
    sheet.columnWidths.clear();
    sheet.floatingImages = [sheet.floatingImages[0]!];
    const entries = unzipSync((await encodeXlsx(workbook, { images: [asset] })).bytes);
    entries[drawingPart] = readFileSync(
      new URL("./fixtures/wps-fixed-picture.xml", import.meta.url),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    const restored = getActiveSheet(decoded.workbook).floatingImages[0]!;
    expect(isFramedPictureObject(restored) && restored.frame.anchor).toEqual(anchors[2]);
    expect(decoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        locations: expect.arrayContaining(['Pictures.floatingImages["xlsx-picture-1-4"].anchor']),
      }),
    );
    const encoded = await encodeXlsx(decoded.workbook, {
      images: decoded.images!.map((image) => ({ ...image, width: 32, height: 32 })),
    });
    expect(strFromU8(unzipSync(encoded.bytes)[drawingPart]!)).toContain(
      '<xdr:absoluteAnchor><xdr:pos x="6762750" y="742950"/>',
    );
  });
  test("retains all three native anchor modes, bytes, shared asset and background without mutating the source", async () => {
    const { workbook } = fixture(),
      before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook, { images: [asset] });
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(encoded.report.issues).toContainEqual({
      code: "style-omitted",
      severity: "warning",
      count: 3,
      locations: [0, 1, 2].map(
        (i) => `Pictures.floatingImages["picture-${i}"].inheritedThemeEffects`,
      ),
    });
    const entries = unzipSync(encoded.bytes),
      drawing = strFromU8(entries[drawingPart]!);
    expect(drawing.match(/<xdr:oneCellAnchor>/g)).toHaveLength(1);
    expect(drawing.match(/<xdr:twoCellAnchor>/g)).toHaveLength(1);
    expect(drawing.match(/<xdr:absoluteAnchor>/g)).toHaveLength(1);
    const decoded = await decodeXlsx(encoded.bytes),
      sheet = getActiveSheet(decoded.workbook);
    expect(
      decoded.report.issues
        .filter((issue) => issue.code === "dimension-approximated")
        .every((issue) => issue.locations.every((location) => /^Pictures![A-Z]+$/.test(location))),
    ).toBe(true);
    expect(
      decoded.report.issues.some((issue) => issue.code === "picture-geometry-approximated"),
    ).toBe(false);
    expect(decoded.images).toEqual([{ assetId: "xlsx-image-1", bytes: png, extension: "png" }]);
    expect(
      sheet.floatingImages.map((image) =>
        isFramedPictureObject(image) ? image.frame.anchor : null,
      ),
    ).toEqual(
      anchors.map((anchor) =>
        anchor.mode === "fixed" ? anchor : { ...anchor, offsetMode: "free-pixels" },
      ),
    );
    expect(sheet.floatingImages.map((image) => image.altText)).toEqual(
      [0, 1, 2].map((i) => `Alt ${i} & literal _x0041_`),
    );
    expect(
      sheet.floatingImages.every((image) => "assetId" in image && image.assetId === "xlsx-image-1"),
    ).toBe(true);
    expect(sheet.pageDecoration?.backgroundAssetId).toBe("xlsx-image-1");
    expect(
      sheet.floatingImages.map((image) => ("transform" in image ? image.transform : undefined)),
    ).toEqual(
      anchors.map(() => ({
        appearance: {
          suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
        },
      })),
    );
    const again = await encodeXlsx(decoded.workbook, {
      images: decoded.images!.map((image) => ({ ...image, width: 32, height: 32 })),
    });
    expect(again.report.issues).toEqual([]);
    expect(unzipSync(again.bytes)["xl/media/image1.png"]).toEqual(png);
    const third = await decodeXlsx(again.bytes);
    expect(getActiveSheet(third.workbook).floatingImages).toEqual(sheet.floatingImages);
  });
  test("consumes pictures and proven charts together in one worksheet drawing", async () => {
    const { workbook, sheet } = nativeColumnFixture();
    const pictures = fixture();
    sheet.floatingImages = [pictures.sheet.floatingImages[0]!];
    const decoded = await decodeXlsx((await encodeXlsx(workbook, { images: [asset] })).bytes);
    expect(getActiveSheet(decoded.workbook).floatingImages).toHaveLength(1);
    expect(getActiveSheet(decoded.workbook).drawings).toHaveLength(1);
    expect(decoded.images).toHaveLength(1);
  });
  test.each([
    [
      "negative crop / padding",
      (image: FramedFloatingImage) => {
        image.frame.source.widthRatio = 0.5;
      },
    ],
    [
      "appearance",
      (image: FramedFloatingImage) => {
        image.transform = {};
      },
    ],
    [
      "visibility",
      (image: FramedFloatingImage) => {
        image.hidden = true;
      },
    ],
    [
      "group",
      (image: FramedFloatingImage) => {
        image.groupId = "group";
      },
    ],
  ] as const)("blocks unsupported %s before missing resources", async (_name, change) => {
    const { workbook, sheet } = fixture();
    change(sheet.floatingImages[0] as FramedFloatingImage);
    await expect(encodeXlsx(workbook)).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: { issues: [expect.objectContaining({ code: "feature-omitted", severity: "block" })] },
    });
  });
  test.each([
    [
      "orphan media",
      (entries: Record<string, Uint8Array>) => {
        entries["xl/media/orphan.png"] = png;
      },
    ],
    [
      "orphan media outside the media directory",
      (entries: Record<string, Uint8Array>) => {
        entries["xl/unclaimed.png"] = png;
      },
    ],
    [
      "unconsumed image relationship to an otherwise consumed resource",
      (entries: Record<string, Uint8Array>) => {
        const path = "xl/_rels/workbook.xml.rels";
        entries[path] = strToU8(
          strFromU8(entries[path]!).replace(
            "</Relationships>",
            '<Relationship Id="unusedImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
          ),
        );
      },
    ],
    [
      "signature mismatch",
      (entries: Record<string, Uint8Array>) => {
        entries["xl/media/image1.png"] = new Uint8Array([1, 2, 3]);
      },
    ],
    [
      "unhandled shape",
      (entries: Record<string, Uint8Array>) => {
        entries[drawingPart] = strToU8(
          strFromU8(entries[drawingPart]!)
            .replace("<xdr:pic>", "<xdr:sp>")
            .replace("</xdr:pic>", "</xdr:sp>"),
        );
      },
    ],
    [
      "negative crop",
      (entries: Record<string, Uint8Array>) => {
        entries[drawingPart] = strToU8(
          strFromU8(entries[drawingPart]!).replace("<a:stretch>", '<a:srcRect l="-1"/><a:stretch>'),
        );
      },
    ],
    [
      "forged image namespace",
      (entries: Record<string, Uint8Array>) => {
        entries[drawingPart] = strToU8(
          strFromU8(entries[drawingPart]!).replace(
            'r:embed="rId1"',
            'xmlns:e="https://invalid.test" e:embed="rId1"',
          ),
        );
      },
    ],
    [
      "unused relationship",
      (entries: Record<string, Uint8Array>) => {
        const path = "xl/drawings/_rels/drawing1.xml.rels";
        entries[path] = strToU8(
          strFromU8(entries[path]!).replace(
            "</Relationships>",
            '<Relationship Id="unused" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>',
          ),
        );
      },
    ],
  ] as const)("blocks %s rather than dropping content", async (_name, change) => {
    await expect(decodeXlsx(await mutate(change))).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: { issues: [expect.objectContaining({ severity: "block" })] },
    });
  });
});
