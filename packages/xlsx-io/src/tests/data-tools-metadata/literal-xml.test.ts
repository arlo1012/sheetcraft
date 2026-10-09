import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in cell text when rewriting hidden rows", async () => {
  const workbook = createWorkbook({ id: "literal-hidden-row", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const content = { kind: "literal" as const, value: "Cost $$ | $& | $` | $' | $1 | $2" };
  const formula = { kind: "formula" as const, formula: { source: `="${content.value}"` } };
  setCellContent(sheet, { row: 0, column: 0 }, content);
  setCellContent(sheet, { row: 1, column: 0 }, formula);
  (sheet.hiddenRows ??= new Set()).add(2);
  const encoded = await encodeXlsx(workbook);
  const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(xml).toContain("Cost $$ | $&amp; | $` | $&apos; | $1 | $2");
  expect(xml.match(/<sheetData\b/g)).toHaveLength(1);
  const decoded = await decodeXlsx(encoded.bytes);
  const restored = getActiveSheet(decoded.workbook);
  expect(getCellContent(restored, { row: 0, column: 0 })).toEqual(content);
  expect(getCellContent(restored, { row: 1, column: 0 })).toEqual(formula);
  expect(restored.hiddenRows?.has(2)).toBe(true);
});

test.each(["worksheet", "table"])(
  "preserves replacement tokens in %s text/color filters",
  async (owner) => {
    const workbook = createWorkbook({ id: "literal-color-filter", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const value = "Cost $$ | $& | $` | $' | $1 | $2";
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      columns: [
        { column: 0, allowedValues: [{ kind: "string", value }] },
        {
          column: 1,
          allowedValues: [],
          condition: { kind: "color", target: "fill", color: "#ff0000" },
        },
      ],
    };
    if (owner === "table") {
      sheet.tables = [
        {
          id: "colors",
          name: "Colors",
          range: sheet.filter.range,
          columns: [
            { id: "text", name: "Text" },
            { id: "color", name: "Color" },
          ],
          style: createBuiltinTableStyles()[0]!,
          headerRow: true,
          totalRow: false,
          firstColumn: false,
          lastColumn: false,
          bandedRows: true,
          bandedColumns: false,
          filterButton: true,
          filter: sheet.filter,
        },
      ];
      sheet.filter = null;
    }
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Text" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Color" });
    setCellStyle(sheet, { row: 1, column: 1 }, { fillColor: "#ff0000" });
    const encoded = await encodeXlsx(workbook);
    const path = owner === "table" ? "xl/tables/table1.xml" : "xl/worksheets/sheet1.xml";
    const xml = strFromU8(unzipSync(encoded.bytes)[path]!);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('val="Cost $$ | $&amp; | $` | $&apos; | $1 | $2"');
    const decoded = await decodeXlsx(encoded.bytes);
    const restored = getActiveSheet(decoded.workbook);
    const filter = owner === "table" ? restored.tables?.[0]?.filter : restored.filter;
    expect(filter?.columns[0]?.allowedValues).toEqual([{ kind: "string", value }]);
  },
);

test("keeps existing currency DXFs literal when allocating a color-filter style", async () => {
  const workbook = createWorkbook({ id: "literal-color-dxf", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const range = { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } };
  const format = { kind: "currency" as const, currency: "USD", fractionDigits: 2 };
  sheet.conditionalFormats = [
    {
      id: "currency",
      ranges: [range],
      anchor: range.start,
      condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
      style: { numberFormat: format },
    },
  ];
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
    columns: [
      {
        column: 0,
        allowedValues: [],
        condition: { kind: "color", target: "fill", color: "#ff0000" },
      },
    ],
  };
  const encoded = await encodeXlsx(workbook);
  const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
  expect(XMLValidator.validate(styles)).toBe(true);
  expect(styles).toContain('formatCode="[$$-409]#,##0.00"');
  const decoded = await decodeXlsx(encoded.bytes);
  expect(getActiveSheet(decoded.workbook).conditionalFormats?.[0]?.style.numberFormat).toEqual(
    format,
  );
});
