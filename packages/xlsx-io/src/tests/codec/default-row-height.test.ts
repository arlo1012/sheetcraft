import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getDefaultRowHeight,
  getRowHeight,
  setCellContent,
  setCellStyle,
  setRowHeight,
  setSheetDimensionHidden,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import {
  EMU_PER_PIXEL,
  nativeDrawingAnchor,
  readNativeChartGeometry,
} from "../../drawing-geometry.js";

const worksheetPath = "xl/worksheets/sheet1.xml";
const sheetXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)[worksheetPath]!);
function patchSheet(bytes: Uint8Array, change: (xml: string) => string): Uint8Array {
  const archive = unzipSync(bytes);
  archive[worksheetPath] = strToU8(change(strFromU8(archive[worksheetPath]!)));
  return zipSync(archive);
}
function expectMixedRows(sheet: Sheet) {
  expect(getDefaultRowHeight(sheet)).toBe(20);
  expect([...sheet.rowHeights]).toEqual([
    [1, 24],
    [4, 24],
  ]);
  expect([...sheet.hiddenRows!]).toEqual([3, 4]);
  expect(getRowHeight(sheet, 0)).toBe(20);
  expect(getRowHeight(sheet, 1)).toBe(24);
  expect(getRowHeight(sheet, 2)).toBe(20);
  expect(getRowHeight(sheet, 3)).toBe(0);
  expect(getRowHeight(sheet, 4)).toBe(0);
  expect(sheet.rowHeights.has(3)).toBe(false);
  expect(sheet.rowHeights.get(4)).toBe(24);
}

describe("XLSX sparse worksheet default row heights", () => {
  test("keeps explicit 24px, drops explicit 20px and pins only materialized non-auto rows across two roundtrips", async () => {
    const workbook = createWorkbook({ id: "source-default-rows", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const row of [0, 1, 2, 8, 9, 9999])
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: `Row ${row}` });
    setRowHeight(sheet, 1, 48);
    setRowHeight(sheet, 2, 48);
    setSheetDimensionHidden(sheet, "row", 3, true);
    setSheetDimensionHidden(sheet, "row", 4, true);
    setCellStyle(sheet, { row: 5, column: 0 }, { fontSize: 12 });
    sheet.mergedCells.push(
      { start: { row: 6, column: 0 }, end: { row: 7, column: 1 } },
      { start: { row: 9, column: 0 }, end: { row: 9, column: 1 } },
    );
    setCellStyle(sheet, { row: 8, column: 0 }, { wrapText: true });
    setCellStyle(sheet, { row: 9, column: 0 }, { wrapText: true });
    // This source really carries explicit 18pt and 15pt rows on a 15pt default.
    // It is patched independently of Core's new baseline and import comparison.
    const source = patchSheet((await encodeXlsx(workbook)).bytes, (xml) =>
      xml
        .replace('defaultRowHeight="18"', 'defaultRowHeight="15"')
        .replace(/<row\b([^>]*)>/g, (row, attributes: string) => {
          const number = Number(attributes.match(/\br="(\d+)"/)?.[1]);
          return row.replace(/\bht="[^"]*"/, `ht="${[2, 5].includes(number) ? 18 : 15}"`);
        }),
    );
    let decoded = await decodeXlsx(source);
    expectMixedRows(getActiveSheet(decoded.workbook));
    expect(
      decoded.report.issues.filter((issue) => issue.code === "dimension-approximated"),
    ).toEqual([]);

    for (let pass = 0; pass < 2; pass += 1) {
      const before = serializeWorkbook(decoded.workbook);
      expect(before.version).toBe(87);
      const encoded = await encodeXlsx(decoded.workbook);
      const xml = sheetXml(encoded.bytes);
      expect(xml).toContain('defaultRowHeight="15"');
      const rows = [...xml.matchAll(/<row\b([^>]*)>/g)].map((match) => match[1]!);
      expect(rows).toHaveLength(11);
      for (const number of [1, 3, 4, 6, 7, 8, 10, 10000])
        expect(rows.find((row) => row.startsWith(` r="${number}"`))).toContain(
          'ht="15" customHeight="1"',
        );
      for (const number of [2, 5])
        expect(rows.find((row) => row.startsWith(` r="${number}"`))).toContain(
          'ht="18" customHeight="1"',
        );
      expect(rows.find((row) => row.startsWith(' r="9"'))).not.toMatch(
        /\b(?:ht|customHeight|bestFit)=/,
      );
      for (const number of [4, 5])
        expect(rows.find((row) => row.startsWith(` r="${number}"`))).toContain('hidden="1"');
      expect(serializeWorkbook(decoded.workbook)).toEqual(before);
      decoded = await decodeXlsx(encoded.bytes);
      expectMixedRows(getActiveSheet(decoded.workbook));
    }
  });

  test.each([
    ["15", 20, false],
    ["18", 24, false],
    ["12", 16, false],
    ["384", 512, false],
    ["15.75", 21, false],
    ["15.3", 20, true],
    ["15.6", 21, true],
    ["12.01", 16, true],
    ["384.75", 512, true],
    ["0", 16, true],
    ["-15", 16, true],
    ["600", 512, true],
    ["1e308", 512, true],
    ["NaN", 24, false],
    ["Infinity", 24, false],
    ["-Infinity", 24, false],
    ["invalid", 24, false],
    ["", 24, false],
    [undefined, 24, false],
  ] as const)(
    "normalizes native default %s to %s with precise reporting",
    async (native, pixels, approximated) => {
      const workbook = createWorkbook({ id: "native-default", sheetId: "sheet" });
      const source = patchSheet((await encodeXlsx(workbook)).bytes, (xml) =>
        xml.replace(
          /\bdefaultRowHeight="[^"]*"/,
          native === undefined ? "" : `defaultRowHeight="${native}"`,
        ),
      );
      const decoded = await decodeXlsx(source);
      const sheet = getActiveSheet(decoded.workbook);
      expect(getDefaultRowHeight(sheet)).toBe(pixels);
      expect([...sheet.rowHeights]).toEqual([]);
      const issues = decoded.report.issues.filter(
        (issue) => issue.code === "dimension-approximated",
      );
      expect(issues).toEqual(
        approximated
          ? [
              {
                code: "dimension-approximated",
                severity: "warning",
                count: 1,
                locations: [`${sheet.name}.defaultRowHeight`],
              },
            ]
          : [],
      );
      const encoded = await encodeXlsx(decoded.workbook);
      expect(sheetXml(encoded.bytes)).toContain(`defaultRowHeight="${(pixels * 3) / 4}"`);
      const again = await decodeXlsx(encoded.bytes);
      expect(getDefaultRowHeight(getActiveSheet(again.workbook))).toBe(pixels);
      expect(
        again.report.issues.filter((issue) => issue.code === "dimension-approximated"),
      ).toEqual([]);
    },
  );

  test("normalizes native chart markers with 20px defaults, explicit 24px and hidden rows", () => {
    const sheet = createSheet("Chart geometry", "sheet");
    sheet.defaultRowHeight = 20;
    setRowHeight(sheet, 1, 24);
    setSheetDimensionHidden(sheet, "row", 0, true);
    setSheetDimensionHidden(sheet, "row", 2, true);
    expect(nativeDrawingAnchor(sheet, 0, 0, 0, 45, 160, 96)).toEqual({
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 4, nativeRowOff: EMU_PER_PIXEL },
      ext: { width: 160, height: 96 },
    });
    expect(nativeDrawingAnchor(sheet, 0, 0, 0, 0, 160, 96).tl.nativeRow).toBe(1);
    const sparse = createSheet("Sparse chart", "sparse");
    sparse.defaultRowHeight = 20;
    const geometry = readNativeChartGeometry(
      sparse,
      "twoCellAnchor",
      {
        from: { col: "0", colOff: "0", row: "0", rowOff: "0" },
        to: { col: "1", colOff: "0", row: "1", rowOff: "0" },
      },
      {
        xfrm: {
          off: { "@_x": "0", "@_y": "1914525" },
          ext: { "@_cx": "1524000", "@_cy": "914400" },
        },
      },
    );
    expect(geometry).toEqual({
      anchor: { row: 10, column: 0 },
      offsetX: 0,
      offsetY: 1,
      width: 160,
      height: 96,
      approximated: true,
    });
    expect([...sparse.rowHeights]).toEqual([]);
  });
});
