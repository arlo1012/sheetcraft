import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { readExternalFixture } from "./external-fixtures.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getRowHeight,
} from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx } from "../index.js";

describe("XLSX codec loss and sparse-state handling", () => {
  test("retains dimension-only rows and blank styled cells", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-sparse-styles"));
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getRowHeight(sheet, 8)).toBe(40);
    expect(getCellContent(sheet, { row: 4, column: 2 })).toBeNull();
    expect(getCellStyle(sheet, { row: 4, column: 2 })).toMatchObject({ bold: true });
  });

  test("reports unsupported style fields, retains date formats, and restores shared formula children", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-shared-formulas"));
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

  test("omits font names beyond the codec limit while preserving font sizes accepted by Core", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-invalid-font"));
    const sheet = [...result.workbook.sheets.values()][0]!;
    // Core accepts every positive integer size; the codec limits font names to 80 characters.
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({ fontSize: 200 });
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "style-omitted" })]),
    );
  });

  test("does not report Excel's explicit no-fill style as a loss", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-explicit-no-fill"));
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "style-omitted", locations: ["Data!A1"] }),
      ]),
    );
  });

  test("reports malformed number format codes as omitted", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-malformed-number-format"));
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.numberFormat).toBeUndefined();
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test("preserves workbook active-tab identity", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-active-tab"));
    expect(result.workbook.sheets.get(result.workbook.activeSheetId)?.name).toBe("Second");
  });

  test("does not report invisible diagonal borders as a loss", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-invisible-diagonal"));
    expect(result.report.issues).toEqual([]);
    const style = getCellStyle(getActiveSheet(result.workbook), { row: 0, column: 0 });
    expect(style?.borderDiagonalUp).toBeUndefined();
    expect(style?.borderDiagonalDown).toBeUndefined();
  });

  test("resolves theme-colored visible borders instead of omitting them", async () => {
    const result = await decodeXlsx(await readExternalFixture("codec-unsupported-borders"));
    const style = getCellStyle(getActiveSheet(result.workbook), { row: 0, column: 0 });
    expect(style).toMatchObject({
      borderTop: { style: "thin", color: "#000000" },
      borderDiagonalUp: { style: "thick", color: "#000000" },
    });
    expect(result.report.issues).toEqual([]);
  });

  test("counts each cell with an unresolved visible border only once", async () => {
    const entries = unzipSync(await readExternalFixture("codec-unsupported-borders"));
    for (const name of Object.keys(entries)) if (name.endsWith("/")) delete entries[name];
    entries["xl/styles.xml"] = strToU8(
      strFromU8(entries["xl/styles.xml"]!).replace(/<color theme="1"\/>/g, '<color theme="99"/>'),
    );
    const result = await decodeXlsx(zipSync(entries));
    expect(result.report.issues).toEqual([
      { code: "style-omitted", severity: "warning", count: 1, locations: ["Data!A1"] },
    ]);
  });
});
