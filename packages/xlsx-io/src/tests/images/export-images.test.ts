import { inflateRawSync } from "node:zlib";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setColumnWidth,
  setRowHeight,
} from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { describe, expect, test } from "vitest";
import { encodeXlsx, type XlsxImageAsset } from "../../index.js";

const PNG_A = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const PNG_B = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);

function asset(
  assetId: string,
  bytes: Uint8Array,
  width: number,
  height: number,
  transform?: XlsxImageAsset["transform"],
): XlsxImageAsset {
  return { assetId, bytes, extension: "png", width, height, transform };
}

function entries(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const contentOffset = offset + 30 + nameLength + extraLength;
    const content = bytes.slice(contentOffset, contentOffset + compressedSize);
    entries.set(name, compression === 8 ? new Uint8Array(inflateRawSync(content)) : content);
    offset = contentOffset + compressedSize;
  }
  return entries;
}

function text(entries: ReadonlyMap<string, Uint8Array>, name: string): string {
  const value = entries.get(name);
  if (!value) throw new Error(`Missing XLSX entry: ${name}`);
  return new TextDecoder().decode(value);
}

describe("XLSX image export", () => {
  test("writes native cell media and fixed-size floating anchors without changing Core state", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } });
    setColumnWidth(sheet, 0, 100);
    setColumnWidth(sheet, 1, 80);
    setRowHeight(sheet, 0, 40);
    setRowHeight(sheet, 1, 60);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "cell", altText: "Cell" },
      },
    );
    sheet.floatingImages.push({
      id: "floating",
      assetId: "floating",
      altText: "Floating",
      anchor: { row: 2, column: 1 },
      offsetX: 3,
      offsetY: 4,
      width: 70,
      height: 35,
    });
    const before = serializeWorkbook(workbook);

    const result = await encodeXlsx(workbook, {
      images: [asset("cell", PNG_A, 400, 100), asset("floating", PNG_B, 100, 50)],
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
    const archive = entries(result.bytes);
    expect(archive.get("xl/media/image1.png")).toEqual(PNG_A);
    expect(archive.get("xl/media/image2.png")).toEqual(PNG_B);
    expect(text(archive, "xl/richData/_rels/richValueRel.xml.rels")).toContain(
      "../media/image1.png",
    );
    expect(text(archive, "xl/drawings/_rels/drawing1.xml.rels")).not.toContain(
      "../media/image1.png",
    );
    expect(text(archive, "xl/drawings/_rels/drawing1.xml.rels")).toContain("../media/image2.png");
    const drawing = text(archive, "xl/drawings/drawing1.xml");
    expect(drawing.match(/<xdr:oneCellAnchor>/g)).toHaveLength(1);
    expect(drawing).not.toContain("<xdr:twoCellAnchor");
    expect(drawing).not.toContain("editAs=");
    expect(drawing).toContain(
      '<xdr:from><xdr:col>1</xdr:col><xdr:colOff>28575</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="666750" cy="333375"/>',
    );
    expect(text(archive, "xl/worksheets/sheet1.xml")).toContain('defaultRowHeight="18"');
    expect(text(archive, "xl/worksheets/sheet1.xml")).toContain('defaultColWidth="13.7109375"');
    expect(text(archive, "xl/worksheets/sheet1.xml")).toMatch(
      /<c r="A1"[^>]* t="e" vm="1"><v>#VALUE!<\/v><\/c>/,
    );
  });

  test("deduplicates shared normalized variants while keeping distinct baked variants", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "shared", altText: "First", transform: { rotation: 0 } },
      },
    );
    sheet.floatingImages.push(
      {
        id: "same",
        assetId: "shared",
        altText: "Same",
        anchor: { row: 1, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 20,
        height: 20,
      },
      {
        id: "variant",
        assetId: "shared",
        altText: "Variant",
        anchor: { row: 2, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 20,
        height: 20,
        transform: { rotation: 90 },
      },
    );

    const result = await encodeXlsx(workbook, {
      images: [
        asset("shared", PNG_A, 20, 20),
        asset("shared", PNG_A, 20, 20, { rotation: 0 }),
        asset("shared", PNG_B, 20, 20, { rotation: 90 }),
      ],
    });
    const archive = entries(result.bytes);
    expect(
      [...archive.keys()].filter((name) => /^xl\/media\/image\d+\.png$/.test(name)),
    ).toHaveLength(2);
    expect(text(archive, "xl/drawings/drawing1.xml").match(/<xdr:oneCellAnchor>/g)).toHaveLength(2);
  });

  test("keeps physical size independent of custom and default dimensions", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setColumnWidth(sheet, 0, 100);
    setColumnWidth(sheet, 1, 80);
    setRowHeight(sheet, 0, 40);
    setRowHeight(sheet, 1, 60);
    sheet.floatingImages.push({
      id: "boundary",
      assetId: "boundary",
      altText: "Boundary",
      anchor: { row: 0, column: 0 },
      offsetX: 90,
      offsetY: 35,
      width: 200,
      height: 100,
    });

    const result = await encodeXlsx(workbook, { images: [asset("boundary", PNG_A, 20, 20)] });
    expect(text(entries(result.bytes), "xl/drawings/drawing1.xml")).toContain(
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>857250</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>333375</xdr:rowOff></xdr:from><xdr:ext cx="1905000" cy="952500"/>',
    );
  });

  test("fails for a missing referenced resource without mutating the workbook", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "missing", altText: "Missing" },
      },
    );
    const before = serializeWorkbook(workbook);

    await expect(encodeXlsx(workbook)).rejects.toThrow("Missing XLSX image resource");
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("rejects invalid dimensions for a referenced image", async () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "invalid", altText: "Invalid" },
      },
    );

    await expect(
      encodeXlsx(workbook, { images: [asset("invalid", PNG_A, 0, 10)] }),
    ).rejects.toThrow("Invalid XLSX image dimensions");
  });
});
