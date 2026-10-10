import { createBuiltinTableStyles, resolveTableCellStyle } from "@sheetcraft/core/table-styles";
import { mergeCellStyle } from "@sheetcraft/core/style";
import { getActiveSheet, getCellStyle, getCellValue } from "@sheetcraft/core/workbook";
import { strToU8, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx } from "../../index.js";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const flags = 'showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"';

/**
 * Reduced WPS-authored Clear/None semantics: a real A1:C3 table with no
 * tableStyleInfo.name, B1 size 13 and C1 explicit RGB red. The original's
 * unrelated built-in styles are omitted; C2 is an added direct bold/fill control.
 * This literal fixture does not depend on the product writer or private files.
 */
function fixture(styleInfo: string): Uint8Array {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="book" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets><sheet name="Data" sheetId="1" r:id="sheet"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="sheet" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="styles" Type="${relationships}/styles" Target="styles.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${main}" xmlns:r="${relationships}"><dimension ref="A1:C3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>default</t></is></c><c r="B1" s="1" t="inlineStr"><is><t>size13</t></is></c><c r="C1" s="2" t="inlineStr"><is><t>color</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>alpha</t></is></c><c r="B2"><v>2</v></c><c r="C2" s="3"><v>12</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>beta</t></is></c><c r="B3"><v>3</v></c><c r="C3"><v>4</v></c></row></sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
    "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="table" Type="${relationships}/table" Target="../tables/table1.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${main}"><fonts count="4"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><charset val="134"/><scheme val="minor"/></font><font><sz val="13"/><color theme="1"/><name val="Calibri"/><charset val="134"/><scheme val="minor"/></font><font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/><charset val="134"/><scheme val="minor"/></font><font><b/><sz val="11"/><color rgb="FF112233"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFDD00"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><b/><color rgb="FF445566"/></font></dxf></dxfs><tableStyles count="1" defaultTableStyle="TableStyleMedium2"><tableStyle name="Named Control" table="1" count="1"><tableStyleElement type="headerRow" dxfId="0"/></tableStyle></tableStyles></styleSheet>`,
    "xl/tables/table1.xml": `<table xmlns="${main}" id="1" name="Table1" displayName="Table1" ref="A1:C3" totalsRowShown="0"><autoFilter ref="A1:C3"/><tableColumns count="3"><tableColumn id="1" name="default"/><tableColumn id="2" name="size13"/><tableColumn id="3" name="color"/></tableColumns>${styleInfo}</table>`,
  };
  return zipSync(
    Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])),
  );
}

describe("XLSX tables without a selected style", () => {
  test.each([
    ["absent style name", `<tableStyleInfo ${flags}/>`],
    ["absent tableStyleInfo", ""],
  ])("keeps %s unstyled without applying the new-table default", async (_name, info) => {
    const { workbook } = await decodeXlsx(fixture(info));
    const sheet = getActiveSheet(workbook);
    const table = sheet.tables![0]!;
    expect(table).toEqual({
      id: "1",
      name: "Table1",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      columns: [
        { id: "1", name: "default" },
        { id: "2", name: "size13" },
        { id: "3", name: "color" },
      ],
      style: { id: "table-none", name: "None", category: "custom", elements: {} },
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
        columns: [],
      },
    });
    expect(workbook.defaultTableStyleId).toBe("xlsx-excel-style-TableStyleMedium2");
    expect(
      [0, 1, 2].map((row) => [0, 1, 2].map((column) => getCellValue(sheet, { row, column }))),
    ).toEqual([
      ["default", "size13", "color"],
      ["alpha", 2, 12],
      ["beta", 3, 4],
    ]);
    for (const row of [0, 1, 2])
      for (const column of [0, 1, 2])
        expect(resolveTableCellStyle(table, { row, column })).toBeUndefined();
    const effectiveStyle = (row: number, column: number) =>
      mergeCellStyle(
        resolveTableCellStyle(table, { row, column }),
        getCellStyle(sheet, { row, column }) ?? {},
      );
    for (const column of [0, 1]) {
      expect(getCellStyle(sheet, { row: 0, column })?.bold).toBeUndefined();
      expect(effectiveStyle(0, column)?.textColor).toBe("#000000");
      expect(effectiveStyle(0, column)?.fillColor).toBeUndefined();
    }
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toMatchObject({ fontSize: 13 });
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toMatchObject({ textColor: "#ff0000" });
    expect(getCellStyle(sheet, { row: 0, column: 2 })?.bold).toBeUndefined();
    expect(effectiveStyle(0, 2)?.fillColor).toBeUndefined();
    expect(getCellStyle(sheet, { row: 1, column: 2 })).toMatchObject({
      bold: true,
      textColor: "#112233",
      fillColor: "#ffdd00",
    });
  });

  test("keeps an explicitly selected built-in style", async () => {
    const { workbook } = await decodeXlsx(
      fixture(`<tableStyleInfo name="TableStyleMedium2" ${flags}/>`),
    );
    expect(getActiveSheet(workbook).tables?.[0]?.style).toMatchObject({
      id: "xlsx-excel-style-TableStyleMedium2",
      elements: createBuiltinTableStyles().find((style) => style.id === "table-medium-2")!.elements,
    });
  });

  test("keeps an explicitly selected custom style", async () => {
    const { workbook } = await decodeXlsx(
      fixture(`<tableStyleInfo name="Named Control" ${flags}/>`),
    );
    expect(getActiveSheet(workbook).tables?.[0]?.style).toEqual({
      id: "xlsx-table-style-Named Control",
      name: "Named Control",
      category: "custom",
      elements: { headerRow: { style: { bold: true, textColor: "#445566" } } },
    });
  });

  test("keeps the existing fallback for an unknown explicit name", async () => {
    const { workbook } = await decodeXlsx(
      fixture(`<tableStyleInfo name="Unknown Control" ${flags}/>`),
    );
    expect(getActiveSheet(workbook).tables?.[0]?.style).toMatchObject({
      id: "xlsx-excel-style-Unknown Control",
      name: "Excel Unknown Control",
      elements: createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!.elements,
    });
  });
});
