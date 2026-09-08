import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { getActiveSheet, getCellContent, getCellStyle, getRowHeight } from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx } from "../index.js";

const ExcelJS = ExcelJSImport as unknown as { Workbook: new () => any };

async function bytesFor(configure: (workbook: any, sheet: any) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  configure(workbook, sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}

describe("XLSX codec loss and sparse-state handling", () => {
  test("retains dimension-only rows and blank styled cells", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getRow(9).height = 30;
        sheet.getCell("C5").font = { bold: true };
      }),
    );
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getRowHeight(sheet, 8)).toBe(40);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toBeNull();
    expect(getCellStyle(sheet, { row: 4, column: 2 })).toMatchObject({ bold: true });
  });

  test("reports unsupported style fields, retains date formats, and restores shared formula children", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = 1;
        sheet.getCell("A1").font = { bold: true };
        sheet.getCell("A1").border = { top: { style: "thin" } };
        sheet.getCell("B1").numFmt = "yyyy-mm-dd";
        sheet.fillFormula("C1:C3", "A1*2", [2, 2, 2], "shared");
      }),
    );
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getCellContent(sheet, { row: 1, column: 2 })).toMatchObject({
      kind: "formula",
      formula: { source: "=A2*2" },
    });
    expect(getCellStyle(sheet, { row: 0, column: 1 })?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "style-omitted" })]),
    );
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test("omits font values outside Core's accepted range instead of rejecting the workbook", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = "large";
        sheet.getCell("A1").font = { name: "x".repeat(81), size: 200 };
      }),
    );
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toBeUndefined();
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "style-omitted" })]),
    );
  });

  test("does not report Excel's explicit no-fill style as a loss", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = "plain";
        sheet.getCell("A1").fill = { type: "pattern", pattern: "none" };
      }),
    );
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "style-omitted", locations: ["Data!A1"] }),
      ]),
    );
  });

  test("reports malformed number format codes as omitted", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = 1;
        sheet.getCell("A1").numFmt = "not-a-format";
      }),
    );
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.numberFormat).toBeUndefined();
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test("preserves workbook active-tab identity", async () => {
    const result = await decodeXlsx(
      await bytesFor((workbook) => {
        workbook.addWorksheet("Second");
        workbook.views = [{ activeTab: 1 }];
      }),
    );
    expect(result.workbook.sheets.get(result.workbook.activeSheetId)?.name).toBe("Second");
  });

  test("does not report invisible diagonal borders as a loss", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = "plain";
        sheet.getCell("A1").border = {
          diagonal: { style: "thin", color: { argb: "FF112233" }, up: false, down: false },
        };
      }),
    );
    expect(result.report.issues).toEqual([]);
    const style = getCellStyle(getActiveSheet(result.workbook), { row: 0, column: 0 });
    expect(style?.borderDiagonalUp).toBeUndefined();
    expect(style?.borderDiagonalDown).toBeUndefined();
  });

  test("counts each cell with an unsupported visible border only once", async () => {
    const result = await decodeXlsx(
      await bytesFor((_workbook, sheet) => {
        sheet.getCell("A1").value = "unsupported";
        sheet.getCell("A1").border = {
          top: { style: "thin", color: { theme: 1 } },
          diagonal: { style: "thick", color: { theme: 1 }, up: true },
        };
      }),
    );
    expect(result.report.issues).toEqual([
      { code: "style-omitted", severity: "warning", count: 1, locations: ["Data!A1"] },
    ]);
  });
});
