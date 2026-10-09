import { createWorkbook } from "@sheetcraft/core/workbook";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { encodeXlsx } from "../../index.js";
import type { NativeSheetData, NativeWorkbookData } from "../../native/model.js";
import { NativeWorkbook } from "../../native/workbook.js";
import { writeNativeWorkbook } from "../../native/writer.js";

function workbookWithNames(names: string[]): NativeWorkbookData {
  const sheets: NativeSheetData[] = names.map((name) => ({
    name,
    properties: {},
    rows: new Map(),
    columns: new Map(),
    merges: [],
    images: [],
  }));
  return { properties: {}, calcProperties: { fullCalcOnLoad: true }, sheets, images: [] };
}

describe("native XLSX worksheet titles", () => {
  test.each([
    "",
    "   ",
    "Data*2026",
    "Data?2026",
    "Data:2026",
    "Data\\2026",
    "Data/2026",
    "Data[2026",
    "Data]2026",
    "'Data",
    "Data'",
    "History",
    "hIsToRy",
    "A".repeat(32),
    "📊".repeat(16),
    "Data\u0001",
  ])("rejects incompatible title %j through both writer entry points", (name) => {
    expect(() => new NativeWorkbook().addWorksheet(name)).toThrow(/XLSX worksheet name/);
    expect(() => writeNativeWorkbook(workbookWithNames([name]))).toThrow(/XLSX worksheet name/);
  });

  test("rejects case-insensitive duplicates before generating a package", () => {
    const workbook = new NativeWorkbook();
    workbook.addWorksheet("Data");
    expect(() => workbook.addWorksheet("dAtA")).toThrow(/unique/);
    expect(workbook.worksheets).toHaveLength(1);
    expect(() => writeNativeWorkbook(workbookWithNames(["Data", "dAtA"]))).toThrow(/unique/);
  });

  test("preserves valid Unicode titles, internal apostrophes, and XML escaping", async () => {
    const name = `${"📊".repeat(15)}中`;
    const workbook = new NativeWorkbook();
    workbook.addWorksheet(name);
    workbook.addWorksheet("数据 & O'Brien");
    const entries = unzipSync(await workbook.xlsx.writeBuffer());
    const xml = strFromU8(entries["xl/workbook.xml"]!);
    expect(xml).toContain(`name="${name}"`);
    expect(xml).toContain('name="数据 &amp; O&apos;Brien"');
  });

  test("fails public export clearly instead of returning an incompatible workbook", async () => {
    const workbook = createWorkbook({
      id: "invalid-title",
      sheetId: "sheet",
      sheetName: "Data/2026",
    });
    await expect(encodeXlsx(workbook)).rejects.toThrow(
      /XLSX worksheet name contains an invalid character/,
    );
  });
});
