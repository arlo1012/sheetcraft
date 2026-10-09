import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { fromExcelNumberFormat, toExcelNumberFormat } from "../../number-format.js";

type BrowserWorkbook = {
  properties: { date1904?: boolean };
  addWorksheet: (name: string) => {
    getCell: (address: string) => { value: unknown; numFmt?: string };
  };
  xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> };
};
const ExcelJS = ExcelJSImport as unknown as { Workbook: new () => BrowserWorkbook };

const formats: readonly CellNumberFormat[] = [
  { kind: "number", fractionDigits: 2 },
  { kind: "percent", fractionDigits: 1, useGrouping: false },
  { kind: "currency", currency: "USD", fractionDigits: 2 },
  { kind: "accounting", currency: "CNY", fractionDigits: 2 },
  { kind: "date", code: "yyyy-mm-dd" },
  { kind: "time", code: "hh:mm:ss" },
  { kind: "fraction", code: "# ?/?" },
  { kind: "scientific", fractionDigits: 2 },
  { kind: "text" },
  { kind: "special", code: "[DBNum2]General" },
  { kind: "custom", code: "[Red][<=0]0.00;[Blue]0.00" },
];

describe("XLSX number formats", () => {
  test("roundtrips every supported category and an unformatted General cell", async () => {
    const workbook = createWorkbook({ id: "formats", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const [column, format] of formats.entries()) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value: 1234.5 });
      setCellStyle(sheet, { row: 0, column }, { numberFormat: format });
    }
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1234.5 });

    const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    const restored = getActiveSheet(decoded.workbook);
    for (const [column, format] of formats.entries()) {
      expect(getCellStyle(restored, { row: 0, column })?.numberFormat?.kind).toBe(format.kind);
    }
    expect(getCellStyle(restored, { row: 1, column: 0 })?.numberFormat).toBeUndefined();
    expect(decoded.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test.each(["1900", "1904"] as const)(
    "preserves date serial zero, serial sixty, and fractional serials in the %s system",
    async (dateSystem) => {
      const workbook = createWorkbook({ id: `dates-${dateSystem}`, sheetId: "sheet", dateSystem });
      const sheet = getActiveSheet(workbook);
      for (const [column, value] of [0, 60, 45234.123456789].entries()) {
        setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
        setCellStyle(
          sheet,
          { row: 0, column },
          { numberFormat: { kind: "date", code: "yyyy-mm-dd hh:mm:ss" } },
        );
      }

      const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
      const restored = getActiveSheet(decoded.workbook);
      expect(decoded.workbook.dateSystem).toBe(dateSystem);
      expect(getCellContent(restored, { row: 0, column: 0 })).toMatchObject({
        kind: "literal",
        value: 0,
      });
      expect(getCellContent(restored, { row: 0, column: 1 })).toMatchObject({
        kind: "literal",
        value: 60,
      });
      expect(getCellContent(restored, { row: 0, column: 2 })).toMatchObject({
        kind: "literal",
        value: 45234.123456789,
      });
      expect(decoded.report.issues).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "date-normalized" })]),
      );
    },
  );

  test("keeps valid conditional and DBNum codes instead of reporting them as omitted", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Formats");
    sheet.getCell("A1").value = 1;
    sheet.getCell("A1").numFmt = "[Red][<=0]0.00;[Blue]0.00";
    sheet.getCell("B1").value = 123;
    sheet.getCell("B1").numFmt = "[DBNum2]General";
    const bytes = await workbook.xlsx.writeBuffer();

    const decoded = await decodeXlsx(new Uint8Array(bytes));
    const restored = getActiveSheet(decoded.workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.numberFormat).toEqual({
      kind: "custom",
      code: "[Red][<=0]0.00;[Blue]0.00",
    });
    expect(getCellStyle(restored, { row: 0, column: 1 })?.numberFormat).toEqual({
      kind: "special",
      code: "[DBNum2]General",
    });
    expect(decoded.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test("roundtrips special WPS and portable codes without changing values", async () => {
    const formats: readonly Readonly<{ format: CellNumberFormat; value: number }>[] = [
      { format: { kind: "special", code: '0"."0,"万元"' }, value: 123_456 },
      { format: { kind: "special", code: "+0;-0;0" }, value: -123_456 },
      {
        format: {
          kind: "special",
          code: "[DBNum2][$RMB]General;[Red][DBNum2][$RMB]General",
        },
        value: -12.03,
      },
    ];
    const workbook = createWorkbook({ id: "special-xlsx", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const [column, { format, value }] of formats.entries()) {
      setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
      setCellStyle(sheet, { row: 0, column }, { numberFormat: format });
    }

    const decoded = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    const restored = getActiveSheet(decoded.workbook);
    for (const [column, { format, value }] of formats.entries()) {
      expect(getCellContent(restored, { row: 0, column })).toEqual({
        kind: "literal",
        value,
      });
      expect(getCellStyle(restored, { row: 0, column })?.numberFormat).toEqual(format);
    }
    expect(decoded.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "number-format-omitted" })]),
    );
  });

  test("downgrades compact Chinese upper formatting to portable DBNum2 on export", async () => {
    const workbook = createWorkbook({ id: "compact-upper", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 10 });
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        numberFormat: {
          kind: "special",
          code: "[DBNum2][$-804]General",
          chineseUpperStyle: "compact",
        },
      },
    );

    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual(
      expect.arrayContaining([
        {
          code: "number-format-degraded",
          severity: "warning",
          count: 1,
          locations: ["Sheet1!A1"],
        },
      ]),
    );

    const decoded = await decodeXlsx(encoded.bytes);
    const restored = getActiveSheet(decoded.workbook);
    expect(getCellContent(restored, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: 10,
    });
    expect(getCellStyle(restored, { row: 0, column: 0 })?.numberFormat).toEqual({
      kind: "special",
      code: "[DBNum2][$-804]General",
      locale: "zh-CN",
    });
  });

  test("classifies only canonical semantic codes and preserves noncanonical variants", () => {
    expect(fromExcelNumberFormat("[$USD]#,##0.00")).toEqual({
      kind: "currency",
      currency: "USD",
      fractionDigits: 2,
    });
    expect(fromExcelNumberFormat("0.00E-0")).toEqual({ kind: "custom", code: "0.00E-0" });
    expect(fromExcelNumberFormat('[DBNum2][$-804]yyyy"年"m"月"d"日"')).toEqual({
      kind: "date",
      code: '[DBNum2][$-804]yyyy"年"m"月"d"日"',
      locale: "zh-CN",
    });
    expect(fromExcelNumberFormat("[$-0409]hh:mm:ss")).toEqual({
      kind: "time",
      code: "[$-0409]hh:mm:ss",
      locale: "en-US",
    });
    expect(fromExcelNumberFormat("[$-0407]dddd, d. mmmm yyyy")).toEqual({
      kind: "date",
      code: "[$-0407]dddd, d. mmmm yyyy",
      locale: "de-DE",
    });
    expect(fromExcelNumberFormat("[$-41E]yyyy/mm/dd")).toEqual({
      kind: "date",
      code: "[$-41E]yyyy/mm/dd",
      locale: "th-TH",
    });
    expect(fromExcelNumberFormat("[$-804]aaaa")).toEqual({
      kind: "date",
      code: "[$-804]aaaa",
      locale: "zh-CN",
    });
    expect(fromExcelNumberFormat("[$-804]aaa")).toEqual({
      kind: "date",
      code: "[$-804]aaa",
      locale: "zh-CN",
    });
    expect(fromExcelNumberFormat("00000")).toEqual({ kind: "special", code: "00000" });
    expect(fromExcelNumberFormat("000000")).toEqual({ kind: "special", code: "000000" });
    expect(fromExcelNumberFormat('0"."0,"万元"')).toEqual({
      kind: "special",
      code: '0"."0,"万元"',
    });
    expect(fromExcelNumberFormat("+0;-0;0")).toEqual({ kind: "special", code: "+0;-0;0" });
    expect(fromExcelNumberFormat("[DBNum2][$RMB]General;[Red][DBNum2][$RMB]General")).toEqual({
      kind: "special",
      code: "[DBNum2][$RMB]General;[Red][DBNum2][$RMB]General",
    });
  });

  test("only reads supported locale prefixes from format tokens", () => {
    expect(fromExcelNumberFormat('"[$-0407]"yyyy-mm-dd')).toEqual({
      kind: "date",
      code: '"[$-0407]"yyyy-mm-dd',
    });
    expect(fromExcelNumberFormat("[$-DEAD]yyyy-mm-dd")).toEqual({
      kind: "date",
      code: "[$-DEAD]yyyy-mm-dd",
    });
  });

  test("keeps the original object shape for legacy currency prefixes", () => {
    expect(fromExcelNumberFormat("[$$-409]#,##0.00")).toEqual({
      kind: "currency",
      currency: "USD",
      fractionDigits: 2,
    });
    expect(fromExcelNumberFormat("[$£-809]#,##0")).toEqual({
      kind: "currency",
      currency: "GBP",
      fractionDigits: 0,
    });
    expect(fromExcelNumberFormat("[$A$-c09]#,##0.00")).toEqual({
      kind: "currency",
      currency: "AUD",
      fractionDigits: 2,
    });
  });

  test("roundtrips localized currency symbols with their XLSX locale", () => {
    const usDollar = "[$US$-409]#,##0.00";
    const canadianDollar = "[$$-1009]#,##0.00";
    const usDollarFormat: CellNumberFormat = {
      kind: "currency",
      currency: "USD",
      currencySymbol: "US$",
      locale: "en-US",
      fractionDigits: 2,
    };

    expect(fromExcelNumberFormat(usDollar)).toEqual(usDollarFormat);
    expect(toExcelNumberFormat(usDollarFormat)).toBe(usDollar);
    expect(fromExcelNumberFormat(canadianDollar)).toEqual({
      kind: "currency",
      currency: "CAD",
      currencySymbol: "$",
      locale: "en-CA",
      fractionDigits: 2,
    });
    expect(toExcelNumberFormat(fromExcelNumberFormat(canadianDollar) as CellNumberFormat)).toBe(
      canadianDollar,
    );
  });

  test("roundtrips localized accounting symbols and keeps ambiguous prefixes custom", () => {
    const accounting =
      '_([$US$-409]* #,##0.00_);_([$US$-409]* \\(#,##0.00\\)_);_([$US$-409]* "-"??_);_(@_)';
    const expected: CellNumberFormat = {
      kind: "accounting",
      currency: "USD",
      currencySymbol: "US$",
      locale: "en-US",
      fractionDigits: 2,
      negativeStyle: "parentheses",
    };

    expect(fromExcelNumberFormat(accounting)).toEqual(expected);
    expect(toExcelNumberFormat(expected)).toBe(accounting);
    expect(fromExcelNumberFormat("[$€-409]#,##0.00")).toEqual({
      kind: "custom",
      code: "[$€-409]#,##0.00",
    });
    expect(fromExcelNumberFormat("[$$-DEAD]#,##0.00")).toEqual({
      kind: "custom",
      code: "[$$-DEAD]#,##0.00",
    });
    expect(fromExcelNumberFormat("[$US$-0409]#,##0.00")).toEqual({
      kind: "custom",
      code: "[$US$-0409]#,##0.00",
    });
  });
});
