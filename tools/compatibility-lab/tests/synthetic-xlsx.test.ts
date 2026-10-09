import {
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getColumnWidth,
  getRowHeight,
  setCellContent,
} from "@sheetcraft/core/workbook";
import {
  decodeXlsx,
  encodeXlsx,
  XlsxAbortError,
  XlsxCompatibilityError,
} from "@sheetcraft/xlsx-io";
import { describe, expect, test } from "vitest";
import {
  SYNTHETIC_FIXTURE_LABEL,
  createSyntheticWorkbook,
  createSyntheticWorkbookBuffer,
  readSyntheticWorkbook,
} from "../src/probes/synthetic-xlsx-fixture.js";

describe("public first-party XLSX regression probes", () => {
  test("roundtrips supported values, dates, formats, layout and formula source", async () => {
    const source = createSyntheticWorkbook();
    const encoded = await encodeXlsx(source);
    expect(encoded.report.issues).toEqual([]);
    const bytes = encoded.bytes;
    const original = new Uint8Array(bytes);
    const { workbook } = await readSyntheticWorkbook(bytes);
    const sheet = getActiveSheet(workbook);

    expect(SYNTHETIC_FIXTURE_LABEL).toBe("synthetic-not-excel-verified");
    expect(workbook.dateSystem).toBe("1904");
    expect(sheet.name).toBe("Synthetic Data");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes).toEqual(original);
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({ kind: "literal", value: 41 });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellStyle(sheet, { row: 1, column: 1 })?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A2+1" },
    });
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toMatchObject({
      bold: true,
      textColor: "#112233",
      fillColor: "#fde68a",
    });
    expect(getColumnWidth(sheet, 0)).toBe(126);
    expect(getColumnWidth(sheet, 1)).toBe(98);
    expect(getRowHeight(sheet, 3)).toBe(40);
    expect(sheet.filter).toEqual(getActiveSheet(source).filter);
    expect(sheet.freezePanes).toEqual({ rows: 1, columns: 1 });
    expect(sheet.mergedCells).toEqual(getActiveSheet(source).mergedCells);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toEqual({
      kind: "literal",
      value: "Merged synthetic note",
    });
    expect(getCellStyle(sheet, { row: 3, column: 1 })?.horizontalAlign).toBe("center");
  });

  test("discards imported cache provenance and recalculates from the restored source", async () => {
    const { workbook, report } = await readSyntheticWorkbook(await createSyntheticWorkbookBuffer());
    const sheet = getActiveSheet(workbook);
    const address = { row: 1, column: 2 };
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "formula-cache-discarded", count: 1 }),
      ]),
    );
    expect(createWorkbookEvaluator(workbook, sheet.id).getComputedValue(address)).toBe(42);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 42 });
    expect(createWorkbookEvaluator(workbook, sheet.id).getComputedValue(address)).toBe(43);
    expect(getCellContent(sheet, address)).toEqual({
      kind: "formula",
      formula: { source: "=A2+1" },
    });
  });

  test("reports a merge crossing a frozen boundary rather than silently claiming fidelity", async () => {
    const source = createSyntheticWorkbook();
    getActiveSheet(source).mergedCells = [
      { start: { row: 3, column: 0 }, end: { row: 3, column: 2 } },
    ];
    const { workbook, report } = await decodeXlsx((await encodeXlsx(source)).bytes);
    expect(getActiveSheet(workbook).mergedCells).toEqual([]);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "feature-omitted", locations: ["Synthetic Data!A4:C4"] }),
      ]),
    );
  });

  test("rejects invalid archives and honors cancellation at the public boundary", async () => {
    await expect(decodeXlsx(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      XlsxCompatibilityError,
    );
    await expect(
      decodeXlsx(await createSyntheticWorkbookBuffer(), { signal: { aborted: true } }),
    ).rejects.toBeInstanceOf(XlsxAbortError);
  });
});
