import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  setColumnWidth,
  setDefaultColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame, type PictureFrameAnchor } from "@sheetcraft/core/picture-frame";
import { decodeXlsx, encodeXlsx } from "../../index.js";

const bytes = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const asset = { assetId: "identity", bytes, extension: "png" as const, width: 32, height: 32 };
const source = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
const modes = ["fixed", "move-only", "move-and-size", "legacy"] as const;
function fixture(mode: (typeof modes)[number], hidden: boolean) {
  const workbook = createWorkbook({ id: "identity", sheetId: "s", sheetName: "Identity" });
  const sheet = getActiveSheet(workbook);
  setDefaultColumnWidth(sheet, 67);
  setColumnWidth(sheet, 0, 73);
  setColumnWidth(sheet, 1, 91);
  setRowHeight(sheet, 0, 19);
  setRowHeight(sheet, 1, 27);
  setSheetDimensionHidden(sheet, "column", 1, hidden);
  setSheetDimensionHidden(sheet, "row", 1, hidden);
  const metrics = createPictureSheetMetrics(sheet);
  const origin = { column: { index: 2, offset: 5 }, row: { index: 3, offset: 6 } };
  const x = metrics.columns.visiblePrefix(2) + 5,
    y = metrics.rows.visiblePrefix(3) + 6;
  const anchor: PictureFrameAnchor =
    mode === "fixed"
      ? { mode, x, y, size: { width: 120, height: 80 } }
      : mode === "move-and-size"
        ? {
            mode,
            start: origin,
            end: { column: { index: 4, offset: 31 }, row: { index: 6, offset: 14 } },
          }
        : { mode: "move-only", origin, size: { width: 120, height: 80 } };
  const common = { id: "identity", assetId: "identity", altText: "No transforms" };
  const image: FloatingImage =
    mode === "legacy"
      ? { ...common, anchor: { row: 3, column: 2 }, offsetX: 5, offsetY: 6, width: 120, height: 80 }
      : { ...common, frame: { kind: "object-frame-v1", anchor, source, angleDeg: 0 } };
  sheet.floatingImages = [image];
  return { workbook, expected: { x, y }, anchor };
}
describe("coherent identity picture bbox origins", () => {
  test.each(modes)(
    "writes physical xfrm coordinates for %s with custom/default widths and hidden columns",
    async (mode) => {
      for (const hidden of [false, true]) {
        const f = fixture(mode, hidden);
        const encoded = await encodeXlsx(f.workbook, { images: [asset] });
        const drawing = strFromU8(unzipSync(encoded.bytes)["xl/drawings/drawing1.xml"]!);
        expect(drawing).toContain(
          `<a:off x="${Math.round(f.expected.x * 9525)}" y="${Math.round(f.expected.y * 9525)}"/>`,
        );
        expect(drawing).not.toContain("<a:srcRect");
        expect(drawing).not.toMatch(/<a:xfrm[^>]*(?:rot=|flipH=|flipV=)/);
        const decoded = await decodeXlsx(encoded.bytes);
        expect(
          decoded.report.issues.some((issue) => issue.code === "picture-geometry-approximated"),
        ).toBe(false);
        expect(decoded.images![0]!.bytes).toEqual(bytes);
        const sheet = getActiveSheet(decoded.workbook),
          image = sheet.floatingImages[0]!;
        if (!isFramedPictureObject(image)) throw Error("Expected an editable picture");
        expect(image.frame.anchor.mode).toBe(mode === "legacy" ? "move-only" : mode);
        const rect = resolvePictureFrame(image.frame, createPictureSheetMetrics(sheet)).rect;
        expect(rect.x).toBeCloseTo(f.expected.x, 8);
        expect(rect.y).toBeCloseTo(f.expected.y, 8);
        expect(image.frame.source).toEqual(source);
        expect(image.frame.angleDeg).toBe(0);
        expect(image.frame.flipHorizontal).toBeUndefined();
        expect(image.frame.flipVertical).toBeUndefined();
      }
    },
  );

  test("keeps historical zero-offset redundant transforms readable with an explicit warning", async () => {
    const f = fixture("move-only", true);
    const entries = unzipSync((await encodeXlsx(f.workbook, { images: [asset] })).bytes);
    entries["xl/drawings/drawing1.xml"] = strToU8(
      strFromU8(entries["xl/drawings/drawing1.xml"]!).replace(
        /<a:off x="\d+" y="\d+"\/>/,
        '<a:off x="0" y="0"/>',
      ),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(decoded.report.issues).toContainEqual(
      expect.objectContaining({ code: "picture-geometry-approximated", count: 1 }),
    );
    const sheet = getActiveSheet(decoded.workbook),
      image = sheet.floatingImages[0]!;
    if (!isFramedPictureObject(image)) throw Error("Expected native frame");
    expect(resolvePictureFrame(image.frame, createPictureSheetMetrics(sheet)).rect).toMatchObject(
      f.expected,
    );
    expect(decoded.images![0]!.bytes).toEqual(bytes);
  });
});
