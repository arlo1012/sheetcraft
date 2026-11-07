// 未执行：待跨表主数据与锚记功能完成后统一验证。
import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, type Unzipped } from "fflate/browser";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellSparkline,
  getCellSparkline,
} from "@sheetcraft/core/workbook";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { readXlsxSparklines } from "../../sparklines.js";
const definition = (sourceSheetId?: string): CellSparkline => ({
  type: "line",
  sourceSheetId,
  source: {
    start: { row: 0, column: 0, columnAbsolute: true },
    end: { row: 0, column: 2, rowAbsolute: true },
  },
  groupId: "shared",
  color: "#2563eb",
  negativeColor: "#ff0000",
  markers: false,
  axis: false,
  showHidden: false,
  empty: "gap",
});
function nativeEntries(members: string): Unzipped {
  return {
    "xl/workbook.xml": strToU8(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Host" sheetId="1" r:id="rId1"/><sheet name="External Data" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="line"><x14:colorSeries rgb="FF2563EB"/><x14:sparklines>${members}</x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext></extLst></worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    ),
  };
}
describe("native sparkline main-data references", () => {
  test("writes each grouped member's own xm:f sheet and mixed anchors and imports stable IDs", async () => {
    const workbook = createWorkbook({ id: "main", sheetId: "host", sheetName: "Host" }),
      host = getActiveSheet(workbook);
    const external = createSheet("External Data", "external");
    insertSheet(workbook, external);
    const first = definition(external.id),
      second = definition();
    delete second.sourceSheetId;
    second.source = {
      start: { row: 1, column: 0, rowAbsolute: true, columnAbsolute: true },
      end: { row: 1, column: 2 },
    };
    setCellSparkline(host, { row: 0, column: 4 }, first);
    setCellSparkline(host, { row: 1, column: 4 }, second);
    const encoded = await encodeXlsx(workbook),
      entries = unzipSync(encoded.bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    const formulas = [...xml.matchAll(/<xm:f>([^<]+)<\/xm:f>/g)].map((match) =>
      match[1]!.replaceAll("&apos;", "'"),
    );
    expect(formulas).toEqual(["'External Data'!$A1:C$1", "Host!$A$2:C2"]);
    const omitted = vi.fn();
    const native = readXlsxSparklines(entries, [host.name, external.name], omitted)[0]!;
    expect(native.get("E1")).toMatchObject({ sourceSheetId: "xlsx-sheet-2", source: first.source });
    expect(native.get("E2")?.sourceSheetId).toBeUndefined();
    expect(native.get("E2")?.source).toEqual(second.source);
    expect(native.get("E1")?.groupId).toBe(native.get("E2")?.groupId);
    expect(omitted).not.toHaveBeenCalled();
    const restored = (await decodeXlsx(encoded.bytes)).workbook;
    const restoredHost = [...restored.sheets.values()].find((s) => s.name === "Host")!;
    const restoredSource = [...restored.sheets.values()].find((s) => s.name === external.name)!;
    expect(getCellSparkline(restoredHost, { row: 0, column: 4 })).toMatchObject({
      sourceSheetId: restoredSource.id,
      source: first.source,
    });
  });
  test("reads native per-member references without sharing the first member's sheet or anchors", () => {
    const entries = nativeEntries(
      `<x14:sparkline><xm:f>'External Data'!$A1:C$1</xm:f><xm:sqref>E1</xm:sqref></x14:sparkline><x14:sparkline><xm:f>Host!A$2:$C2</xm:f><xm:sqref>E2</xm:sqref></x14:sparkline>`,
    );
    const native = readXlsxSparklines(entries, ["Host", "External Data"])[0]!;
    expect(native.get("E1")).toMatchObject({
      sourceSheetId: "xlsx-sheet-2",
      source: definition().source,
    });
    expect(native.get("E2")?.sourceSheetId).toBeUndefined();
    expect(native.get("E2")?.source).toEqual({
      start: { row: 1, column: 0, rowAbsolute: true },
      end: { row: 1, column: 2, columnAbsolute: true },
    });
  });
  test("Excel's missing member formula imports as a broken source without dropping the member", () => {
    const omitted = vi.fn();
    const entries = nativeEntries(
      "<x14:sparkline><xm:sqref>E1</xm:sqref></x14:sparkline><x14:sparkline><xm:f>Host!A2:C2</xm:f><xm:sqref>E2</xm:sqref></x14:sparkline>",
    );
    const native = readXlsxSparklines(entries, ["Host", "External Data"], omitted)[0]!;
    expect(native.get("E1")?.source).toBeNull();
    expect(native.get("E1")).toBeDefined();
    expect(native.get("E2")?.source).toEqual({
      start: { row: 1, column: 0 },
      end: { row: 1, column: 2 },
    });
    expect(omitted).not.toHaveBeenCalled();
  });
});
