import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { attr, child, nodes, parseXml } from "../../pivot-xml.js";

const dollarText = "Budget $$ $& $` $' $1";
const currencyCases: readonly Readonly<{
  format: CellNumberFormat;
  code: string;
  text: string;
}>[] = [
  {
    format: { kind: "currency", currency: "USD", fractionDigits: 2 },
    code: "[$$-409]#,##0.00",
    text: "$1,234.50",
  },
  {
    format: {
      kind: "currency",
      currency: "USD",
      currencySymbol: "$",
      locale: "en-US",
      fractionDigits: 2,
    },
    code: "[$$-409]#,##0.00",
    text: "$1,234.50",
  },
  {
    format: {
      kind: "currency",
      currency: "CAD",
      currencySymbol: "$",
      locale: "en-CA",
      fractionDigits: 2,
    },
    code: "[$$-1009]#,##0.00",
    text: "$1,234.50",
  },
  {
    format: { kind: "currency", currency: "AUD", fractionDigits: 2 },
    code: "[$A$-C09]#,##0.00",
    text: "A$1,234.50",
  },
  {
    format: {
      kind: "currency",
      currency: "USD",
      currencySymbol: "$$",
      fractionDigits: 2,
    },
    code: '"$$"#,##0.00',
    text: "$$1,234.50",
  },
  {
    format: { kind: "custom", code: '"$$"#,##0.00' },
    code: '"$$"#,##0.00',
    text: "$$1,234.50",
  },
  {
    format: { kind: "custom", code: '"$& $` $\' $1"0.00' },
    code: '"$& $` $\' $1"0.00',
    text: "$& $` $' $11234.50",
  },
  {
    format: {
      kind: "accounting",
      currency: "USD",
      fractionDigits: 2,
      negativeStyle: "parentheses",
    },
    code: '_([$$-409]* #,##0.00_);_([$$-409]* \\(#,##0.00\\)_);_([$$-409]* "-"??_);_(@_)',
    text: " $1,234.50 ",
  },
  {
    format: { kind: "currency", currency: "CNY", fractionDigits: 2 },
    code: "[$¥-804]#,##0.00",
    text: "¥1,234.50",
  },
  {
    format: { kind: "currency", currency: "EUR", fractionDigits: 2 },
    code: "[$€-407]#,##0.00",
    text: "€1.234,50",
  },
];

describe("literal dollar text in XLSX formats", () => {
  test.each([false, true])(
    "preserves currency codes and their public display with named styles: %s",
    async (withNamedStyles) => {
      const workbook = createWorkbook({ id: "dollar-export", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      for (const [row, { format }] of currencyCases.entries()) {
        setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: 1234.5 });
        setCellStyle(sheet, { row, column: 0 }, { numberFormat: format });
      }
      if (withNamedStyles)
        workbook.cellStyles = [
          {
            id: "dollar-named",
            name: "Dollar format",
            category: "custom",
            style: {
              fontFamily: "Arial",
              numberFormat: { kind: "currency", currency: "USD", fractionDigits: 3 },
            },
          },
        ];

      const encoded = await encodeXlsx(workbook);
      const archive = unzipSync(encoded.bytes);
      const stylesXml = strFromU8(archive["xl/styles.xml"]!);
      expect(XMLValidator.validate(stylesXml)).toBe(true);
      const styles = child(parseXml(archive["xl/styles.xml"]), "styleSheet");
      const codes = new Map(
        nodes(child(styles, "numFmts").numFmt).map((format) => [
          Number(attr(format, "numFmtId")),
          attr(format, "formatCode"),
        ]),
      );
      const xfs = nodes(child(styles, "cellXfs").xf);
      const rows = nodes(
        child(child(parseXml(archive["xl/worksheets/sheet1.xml"]), "worksheet"), "sheetData").row,
      );
      const decoded = await decodeXlsx(encoded.bytes);
      const restored = getActiveSheet(decoded.workbook);
      for (const [row, { code, text }] of currencyCases.entries()) {
        const cell = nodes(rows[row]!.c)[0]!;
        const xf = xfs[Number(attr(cell, "s"))]!;
        expect(codes.get(Number(attr(xf, "numFmtId")))).toBe(code);
        expect(formatCellNumberValue(1234.5, { kind: "custom", code }).text).toBe(text);
        const importedFormat = getCellStyle(restored, { row, column: 0 })?.numberFormat;
        expect(importedFormat).toBeDefined();
        expect(formatCellNumberValue(1234.5, importedFormat).text).toBe(text);
      }
      expect(encoded.report.issues).toEqual([]);
      expect(decoded.report.issues).toEqual([]);
      if (withNamedStyles) {
        expect([...codes.values()]).toContain("[$$-409]#,##0.000");
        expect(decoded.workbook.cellStyles?.[0]).toMatchObject({
          name: "Dollar format",
          style: {
            fontFamily: "Arial",
            numberFormat: { kind: "currency", currency: "USD", fractionDigits: 3 },
          },
        });
      }
    },
  );

  test("keeps dollar substitution tokens literal in named-style and font names", async () => {
    const workbook = createWorkbook({ id: "literal-style-text", sheetId: "sheet" });
    workbook.cellStyles = [
      {
        id: "literal-dollar",
        name: dollarText,
        category: "custom",
        style: { fontFamily: dollarText },
      },
    ];
    const encoded = await encodeXlsx(workbook);
    expect(XMLValidator.validate(strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!))).toBe(true);
    const decoded = await decodeXlsx(encoded.bytes);
    expect(decoded.workbook.cellStyles?.[0]).toMatchObject({
      name: dollarText,
      style: { fontFamily: dollarText },
    });
  });

  test.each([false, true])(
    "preserves differential currency formats and formula text with table styles: %s",
    async (withTableStyles) => {
      const workbook = createWorkbook({ id: "dollar-dxf", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
      const formula = '=A1="$$ $& $` $\' $1"';
      sheet.conditionalFormats = currencyCases.map(({ format }, index) => ({
        id: `dollar-${index}`,
        ranges: [range],
        anchor: range.start,
        condition: { kind: "formula", formula },
        style: { numberFormat: format, fontFamily: dollarText },
      }));
      if (withTableStyles)
        workbook.tableStyles = [
          {
            id: "dollar-table",
            name: dollarText,
            category: "custom",
            elements: { wholeTable: { style: { fontFamily: dollarText } } },
          },
        ];

      const encoded = await encodeXlsx(workbook);
      const archive = unzipSync(encoded.bytes);
      for (const part of ["xl/styles.xml", "xl/worksheets/sheet1.xml"])
        expect(XMLValidator.validate(strFromU8(archive[part]!)), part).toBe(true);
      const styles = child(parseXml(archive["xl/styles.xml"]), "styleSheet");
      const rawCodes = nodes(child(styles, "dxfs").dxf)
        .map((dxf) => attr(child(dxf, "numFmt"), "formatCode"))
        .filter(Boolean);
      expect(rawCodes).toEqual([...new Set(currencyCases.map(({ code }) => code))]);
      const decoded = await decodeXlsx(encoded.bytes);
      const rules = getActiveSheet(decoded.workbook).conditionalFormats;
      expect(rules).toHaveLength(currencyCases.length);
      for (const [index, { text }] of currencyCases.entries()) {
        expect(rules?.[index]?.condition).toEqual({ kind: "formula", formula });
        expect(rules?.[index]?.style.fontFamily).toBe(dollarText);
        const format = rules?.[index]?.style.numberFormat;
        expect(format).toBeTruthy();
        expect(formatCellNumberValue(1234.5, format || undefined).text).toBe(text);
      }
      if (withTableStyles)
        expect(decoded.workbook.tableStyles?.[0]).toMatchObject({
          name: dollarText,
          elements: { wholeTable: { style: { fontFamily: dollarText } } },
        });
    },
  );
});
