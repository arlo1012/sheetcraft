import { getActiveSheet, getCellStyle } from "@sheetcraft/core/workbook";
import { mergeCellStyle } from "@sheetcraft/core/style";
import { resolveTableCellStyle } from "@sheetcraft/core/table-styles";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readXlsxTableMetadata } from "../../table-styles.js";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const name = "TableStylePreset1_Accent1";
const expectedElements = {
  wholeTable: {
    style: {
      textColor: "#254061",
      borderTop: { style: "thin", color: "#4f81bd" },
      borderBottom: { style: "thin", color: "#4f81bd" },
    },
  },
  headerRow: {
    style: {
      bold: true,
      textColor: "#376092",
      borderTop: { style: "thin", color: "#4f81bd" },
      borderBottom: { style: "medium", color: "#4f81bd" },
    },
  },
  totalRow: {
    style: { bold: true, textColor: "#376092", borderTop: { style: "thin", color: "#4f81bd" } },
  },
  firstColumn: { style: { bold: true, textColor: "#376092" } },
  lastColumn: { style: { bold: true, textColor: "#376092" } },
  firstRowStripe: { style: { fillColor: "#dce6f2" } },
  firstColumnStripe: { style: { fillColor: "#cccccc" } },
};

/**
 * Literal reduction of a WPS app-saved/reopened A1:F3 table. Retains its seven
 * native DXFs, omitted table availability, pivot=0, actual theme and six direct
 * font controls. Unrelated gallery styles/print settings are removed. The
 * original SHA256 is 06c409c2e21d1a5ce37b111f19fa403b3e2127e8e2d42be17ae871f761bfe3db.
 */
function fixture(
  availability = 'pivot="0"',
  options: { defaultName?: boolean; noStyleName?: boolean; accent?: string } = {},
): Uint8Array {
  const labels = ["Default13", "Size18", "RGBblack", "ThemeDark1", "RGBred", "Reset20242c"];
  const cells = (row: number) =>
    labels
      .map((label, index) => {
        const style = [1, 2, 3, 4, 5, 1][index];
        return `<c r="${String.fromCharCode(65 + index)}${row}" s="${style}" t="inlineStr"><is><t>${label}</t></is></c>`;
      })
      .join("");
  const fonts = [
    '<sz val="11"/><color rgb="FF20242C"/>',
    '<sz val="13"/><color rgb="FF20242C"/>',
    '<sz val="18"/><color rgb="FF20242C"/>',
    '<sz val="13"/><color rgb="FF000000"/>',
    '<sz val="13"/><color theme="1"/>',
    '<sz val="13"/><color rgb="FFFF0000"/>',
  ]
    .map((font) => `<font>${font}<name val="Calibri"/><charset val="134"/></font>`)
    .join("");
  const xfs = [0, 1, 2, 3, 4, 5]
    .map(
      (font) =>
        `<xf numFmtId="0" fontId="${font}" fillId="0" borderId="0" xfId="0"${font ? ' applyFont="1"' : ""}/>`,
    )
    .join("");
  const colors = {
    dk1: "000000",
    lt1: "FFFFFF",
    dk2: "1F1F1F",
    lt2: "EEEEEE",
    accent1: options.accent ?? "4F81BD",
    accent2: "C0504D",
    accent3: "9BBB59",
    accent4: "8064A2",
    accent5: "4BACC6",
    accent6: "F79646",
  };
  const theme = Object.entries(colors)
    .map(([slot, color]) => `<a:${slot}><a:srgbClr val="${color}"/></a:${slot}>`)
    .join("");
  const parts = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="book" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets><sheet name="FontReset" sheetId="1" r:id="sheet"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="sheet" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="styles" Type="${relationships}/styles" Target="styles.xml"/><Relationship Id="theme" Type="${relationships}/theme" Target="theme/theme1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${main}" xmlns:r="${relationships}"><dimension ref="A1:F6"/><sheetData><row r="1">${cells(1)}</row><row r="2"><c r="A2"><v>1</v></c></row><row r="3"><c r="A3"><v>11</v></c></row><row r="6">${cells(6)}</row></sheetData><tableParts count="1"><tablePart r:id="table"/></tableParts></worksheet>`,
    "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships xmlns="${packageRelationships}"><Relationship Id="table" Type="${relationships}/table" Target="../tables/table1.xml"/></Relationships>`,
    "xl/theme/theme1.xml": `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office">${theme}</a:clrScheme></a:themeElements></a:theme>`,
    "xl/styles.xml": `<styleSheet xmlns="${main}"><fonts count="6">${fonts}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="7"><dxf><fill><patternFill patternType="solid"><fgColor theme="1" tint="0.799981688894314"/><bgColor theme="4" tint="0.799981688894314"/></patternFill></fill></dxf><dxf><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.799981688894314"/><bgColor theme="4" tint="0.799981688894314"/></patternFill></fill></dxf><dxf><font><b val="1"/><color theme="4" tint="-0.249977111117893"/></font></dxf><dxf><font><b val="1"/><color theme="4" tint="-0.249977111117893"/></font></dxf><dxf><font><b val="1"/><color theme="4" tint="-0.249977111117893"/></font><border><top style="thin"><color theme="4"/></top></border></dxf><dxf><font><b val="1"/><color theme="4" tint="-0.249977111117893"/></font><border><top style="thin"><color theme="4"/></top><bottom style="medium"><color theme="4"/></bottom></border></dxf><dxf><font><color theme="4" tint="-0.499984740745262"/></font><border><top style="thin"><color theme="4"/></top><bottom style="thin"><color theme="4"/></bottom></border></dxf></dxfs><tableStyles count="1"${options.defaultName ? ` defaultTableStyle="${name}"` : ""}><tableStyle name="${name}" ${availability} count="7"><tableStyleElement type="wholeTable" dxfId="6"/><tableStyleElement type="headerRow" dxfId="5"/><tableStyleElement type="totalRow" dxfId="4"/><tableStyleElement type="firstColumn" dxfId="3"/><tableStyleElement type="lastColumn" dxfId="2"/><tableStyleElement type="firstRowStripe" dxfId="1"/><tableStyleElement type="firstColumnStripe" dxfId="0"/></tableStyle></tableStyles></styleSheet>`,
    "xl/tables/table1.xml": `<table xmlns="${main}" id="1" name="FontResetControls" displayName="FontResetControls" ref="A1:F3"><tableColumns count="6">${labels.map((label, index) => `<tableColumn id="${index + 1}" name="${label}"/>`).join("")}</tableColumns><tableStyleInfo${options.noStyleName ? "" : ` name="${name}"`} showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
  };
  return zipSync(
    Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])),
  );
}

function lowercaseColors<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/#[0-9A-F]{6}/g, (color) => color.toLowerCase()),
  ) as T;
}

describe("XLSX table-style schema defaults and WPS definitions", () => {
  test.each([
    ["omitted", 'pivot="0"', true],
    ["one", 'table="1" pivot="0"', true],
    ["true", 'table="true" pivot="false"', true],
    ["zero", 'table="0" pivot="0"', false],
    ["false", 'table="false" pivot="false"', false],
  ])(
    "uses the actual referenced DXF with %s table availability",
    async (_label, attrs, available) => {
      const { workbook } = await decodeXlsx(fixture(attrs));
      const table = getActiveSheet(workbook).tables![0]!;
      expect(table.style).toEqual({
        id: `xlsx-table-style-${name}`,
        name,
        category: "custom",
        elements: expectedElements,
      });
      expect(lowercaseColors(workbook.tableStyles)).toEqual(available ? [table.style] : []);
      expect(workbook.defaultTableStyleId).toBeUndefined();
      expect(workbook.pivotTableStyles).toEqual([]);
    },
  );

  test.each([
    ["omitted", 'table="0"', true],
    ["one", 'table="0" pivot="1"', true],
    ["true", 'table="false" pivot="true"', true],
    ["zero", 'table="0" pivot="0"', false],
    ["false", 'table="false" pivot="false"', false],
  ])("applies the same schema default to %s pivot availability", (_label, attrs, available) => {
    const metadata = readXlsxTableMetadata(fixture(attrs));
    expect(metadata.tableStyles).toEqual([]);
    expect(lowercaseColors(metadata.pivotTableStyles)).toEqual(
      available
        ? [
            {
              id: `xlsx-pivot-table-style-${name}`,
              name,
              category: "custom",
              elements: expectedElements,
            },
          ]
        : [],
    );
  });

  test("does not invent a fallback or select a hidden definition for a nameless table", async () => {
    const { workbook } = await decodeXlsx(
      fixture('table="false" pivot="false"', { defaultName: true, noStyleName: true }),
    );
    expect(getActiveSheet(workbook).tables![0]!.style).toEqual({
      id: "table-none",
      name: "None",
      category: "custom",
      elements: {},
    });
    expect(workbook.tableStyles).toEqual([]);
    expect(workbook.defaultTableStyleId).toBe(`xlsx-table-style-${name}`);
  });

  test("resolves table DXFs from the workbook palette instead of the Office fallback", async () => {
    const { workbook } = await decodeXlsx(fixture('pivot="0"', { accent: "808080" }));
    const elements = getActiveSheet(workbook).tables![0]!.style.elements;
    expect(elements.headerRow!.style).toMatchObject({
      textColor: "#606060",
      borderTop: { style: "thin", color: "#808080" },
      borderBottom: { style: "medium", color: "#808080" },
    });
    expect(elements.wholeTable!.style.textColor).toBe("#404040");
    expect(elements.firstRowStripe!.style.fillColor).toBe("#e6e6e6");
    // Table DXFs are materialized RGB; direct cell theme intent stays live.
    expect(elements.headerRow!.style.textColorTheme).toBeUndefined();
    expect(getCellStyle(getActiveSheet(workbook), { row: 0, column: 3 })?.textColorTheme).toEqual({
      slot: "dark1",
    });
  });

  test("roundtrips all seven native elements and keeps default/reset versus direct-color intent", async () => {
    const { workbook } = await decodeXlsx(fixture());
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain(`name="${name}"`);
    const styles = strFromU8(entries["xl/styles.xml"]!);
    expect(styles).toContain(`tableStyle name="${name}" pivot="0" table="1" count="7"`);
    expect(styles).toContain('rgb="FF376092"');
    expect(styles).toContain('rgb="FFDCE6F2"');
    const restored = (await decodeXlsx(encoded.bytes)).workbook;
    const sheet = getActiveSheet(restored);
    const table = sheet.tables![0]!;
    expect(table.style.elements).toEqual(expectedElements);
    for (const row of [0, 5]) {
      for (const column of [0, 1, 5]) {
        const style = getCellStyle(sheet, { row, column });
        expect(style?.textColor).toBeUndefined();
        const effective = mergeCellStyle(
          resolveTableCellStyle(table, { row, column }),
          style ?? {},
        );
        expect(effective?.textColor).toBe(row === 0 ? "#376092" : undefined);
      }
      expect(getCellStyle(sheet, { row, column: 1 })?.fontSize).toBe(18);
      expect(getCellStyle(sheet, { row, column: 2 })?.textColor).toBe("#000000");
      expect(getCellStyle(sheet, { row, column: 3 })?.textColorTheme).toEqual({ slot: "dark1" });
      expect(getCellStyle(sheet, { row, column: 4 })?.textColor).toBe("#ff0000");
    }
  });
});
