import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { readGeneratedTableTotalsCells, xlsxTableTotalsColumn } from "../../table-totals.js";

function fixture(headerRow = true, totalRow = true) {
  const workbook = createWorkbook({ id: "totals", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  const names = ["Label", "Sum", "Mean", "Custom", "Constant", "Blank"];
  names.forEach((name, column) =>
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value: name }),
  );
  for (const row of [1, 2])
    for (let column = 0; column < names.length; column++)
      setCellContent(sheet, { row, column }, { kind: "literal", value: row * 10 });
  sheet.tables = [
    {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 5 } },
      columns: names.map((name, index) => ({ id: String(index + 1), name })),
      style: createBuiltinTableStyles()[1]!,
      headerRow,
      totalRow,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: totalRow ? 2 : 3, column: 5 } },
        columns: [],
      },
    },
  ];
  setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "Total & <" });
  setCellContent(
    sheet,
    { row: 3, column: 1 },
    { kind: "formula", formula: { source: `=SUBTOTAL(109,B${headerRow ? 2 : 1}:B3)` } },
  );
  setCellContent(
    sheet,
    { row: 3, column: 2 },
    { kind: "formula", formula: { source: "=SUBTOTAL(101,C2:C3)" } },
  );
  setCellContent(
    sheet,
    { row: 3, column: 3 },
    { kind: "formula", formula: { source: "=SUM(D2:D3)+1" } },
  );
  setCellContent(sheet, { row: 3, column: 4 }, { kind: "literal", value: 99 });
  return { workbook, sheet };
}
function tableXml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["xl/tables/table1.xml"]!);
}

describe("native table totals metadata matches actual cells", () => {
  test.each(["SUBTOTAL(109,Sales[Sum])", "SUBTOTAL(109,[Sum])", "SUBTOTAL(109,Sales['#Sum])"])(
    "does not guess identity from unresolved final structured formula: %s",
    (formula) => {
      const f = fixture();
      const table = f.sheet.tables![0]!;
      if (formula.includes("'#Sum")) table.columns[1]!.name = "'#Sum";
      const cells = readGeneratedTableTotalsCells(
        `<worksheet><row r="4"><c r="B4"><f>${formula}</f><v>30</v></c></row></worksheet>`,
        [table],
      );
      expect(xlsxTableTotalsColumn(f.sheet, table, 1, cells)).toEqual({
        attributes: ' totalsRowFunction="custom"',
        body: `<totalsRowFormula>${formula.replace(/'/g, "&apos;")}</totalsRowFormula>`,
      });
    },
  );
  test.each([true, false])(
    "writes mixed totals without changing cells/cache or treating all columns as sum (headers=%s)",
    async (headerRow) => {
      const f = fixture(headerRow);
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      const xml = tableXml(encoded.bytes);
      expect(xml).toContain('name="Label" totalsRowLabel="Total &amp; &lt;"');
      expect(xml).toContain('name="Sum" totalsRowFunction="sum"');
      expect(xml).toContain(
        'name="Mean" totalsRowFunction="custom"><totalsRowFormula>SUBTOTAL(101,C2:C3)</totalsRowFormula>',
      );
      expect(xml).toContain(
        'name="Custom" totalsRowFunction="custom"><totalsRowFormula>SUM(D2:D3)+1</totalsRowFormula>',
      );
      expect(xml).toContain('name="Constant"/>');
      expect(xml).toContain('name="Blank"/>');
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
      for (const column of [0, 1, 2, 3, 4, 5])
        expect(getCellContent(restored, { row: 3, column })).toEqual(
          getCellContent(f.sheet, { row: 3, column }),
        );
      expect(
        tableXml((await encodeXlsx((await decodeXlsx(encoded.bytes)).workbook)).bytes),
      ).toContain('totalsRowFunction="sum"');
    },
  );
  test("does not infer totals metadata when the table has no total row", async () => {
    const f = fixture(true, false);
    const xml = tableXml((await encodeXlsx(f.workbook)).bytes);
    expect(xml).not.toMatch(/totalsRowFunction|totalsRowFormula|totalsRowLabel/);
  });
  test.each(["=SUBTOTAL(109,B2:B2)", "=SUBTOTAL(9,B2:B3)", "=SUBTOTAL(109,C2:C3)"])(
    "keeps a noncanonical SUBTOTAL as its exact custom formula: %s",
    async (source) => {
      const f = fixture();
      setCellContent(f.sheet, { row: 3, column: 1 }, { kind: "formula", formula: { source } });
      expect(tableXml((await encodeXlsx(f.workbook)).bytes)).toContain(
        `name="Sum" totalsRowFunction="custom"><totalsRowFormula>${source.slice(1)}</totalsRowFormula>`,
      );
    },
  );
  test("does not mark a different worksheet's equal coordinate range as own sum", async () => {
    const f = fixture();
    setCellContent(
      f.sheet,
      { row: 3, column: 1 },
      { kind: "formula", formula: { source: "=SUBTOTAL(109,Elsewhere!B2:B3)" } },
    );
    expect(tableXml((await encodeXlsx(f.workbook)).bytes)).toContain(
      'name="Sum" totalsRowFunction="custom"><totalsRowFormula>SUBTOTAL(109,Elsewhere!B2:B3)</totalsRowFormula>',
    );
  });
  test("recognizes a single data cell in an offset table without inventing a range", async () => {
    const f = fixture();
    const table = f.sheet.tables![0]!;
    table.range = { start: { row: 5, column: 3 }, end: { row: 7, column: 8 } };
    table.filter = null;
    const cells = readGeneratedTableTotalsCells(
      '<worksheet><row r="8"><c r="E8"><f>SUBTOTAL(109,$E$7)</f><v>10</v></c></row></worksheet>',
      [table],
    );
    expect(xlsxTableTotalsColumn(f.sheet, table, 1, cells)).toEqual({
      attributes: ' totalsRowFunction="sum"',
      body: "",
    });
  });
  test("keeps filtered and hidden-row worksheet formula/cache unchanged", async () => {
    const f = fixture();
    f.sheet.tables![0]!.filter!.columns = [
      { column: 0, allowedValues: [{ kind: "number", value: 10 }] },
    ];
    f.sheet.hiddenRows = new Set([1]);
    const encoded = await encodeXlsx(f.workbook);
    expect(tableXml(encoded.bytes)).toContain('name="Sum" totalsRowFunction="sum"');
    const worksheet = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain("<f>SUBTOTAL(109,B2:B3)</f>");
    expect(worksheet).toContain('hidden="1"');
  });
  test("reads native label/sum/blank column roles and derives metadata from imported actual formulas", async () => {
    const f = fixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    // Reproducible standard table roles observed in the WPS producer, with no producer binary.
    entries["xl/tables/table1.xml"] = strToU8(
      `<?xml version="1.0"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Sales" displayName="Sales" ref="A1:F4" totalsRowCount="1"><autoFilter ref="A1:F3"/><tableColumns count="6"><tableColumn id="1" name="Label" totalsRowLabel="Total &amp; &lt;"/><tableColumn id="2" name="Sum" totalsRowFunction="sum"/><tableColumn id="3" name="Mean"/><tableColumn id="4" name="Custom"/><tableColumn id="5" name="Constant"/><tableColumn id="6" name="Blank"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/></table>`,
    );
    const decoded = await decodeXlsx(zipSync(entries));
    const imported = getActiveSheet(decoded.workbook);
    expect(imported.tables![0]!.totalRow).toBe(true);
    expect(getCellContent(imported, { row: 3, column: 0 })).toEqual({
      kind: "literal",
      value: "Total & <",
    });
    const next = tableXml((await encodeXlsx(decoded.workbook)).bytes);
    expect(next).toContain('name="Sum" totalsRowFunction="sum"');
    expect(next).toContain('name="Mean" totalsRowFunction="custom"');
    expect(next).toContain('name="Constant"/>');
  });
  test.each(["=SUBTOTAL(109,Sales[Sum])", "=SUBTOTAL(109,[Sum])"])(
    "preserves qualified structured totals as custom without guessing native identity: %s",
    async (source) => {
      const f = fixture();
      setCellContent(f.sheet, { row: 3, column: 1 }, { kind: "formula", formula: { source } });
      expect(tableXml((await encodeXlsx(f.workbook)).bytes)).toContain(
        'name="Sum" totalsRowFunction="custom"><totalsRowFormula>SUBTOTAL(109,Sales[Sum])</totalsRowFormula>',
      );
    },
  );
  test("uses exact escaped worksheet formula text for custom expressions", async () => {
    const f = fixture();
    setCellContent(
      f.sheet,
      { row: 3, column: 3 },
      {
        kind: "formula",
        formula: { source: "=IF(D2<10,1,2)" },
      },
    );
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain(
      "<totalsRowFormula>IF(D2&lt;10,1,2)</totalsRowFormula>",
    );
    expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain("<f>IF(D2&lt;10,1,2)</f>");
  });
  test.each([
    ["Total\u0001", "Total_x0001_"],
    ["_x0041_", "_x005F_x0041_"],
  ])(
    "uses the same OOXML text encoding as the real totals cell: %s",
    async (label, encodedLabel) => {
      const f = fixture();
      setCellContent(f.sheet, { row: 3, column: 0 }, { kind: "literal", value: label });
      const encoded = await encodeXlsx(f.workbook);
      const entries = unzipSync(encoded.bytes);
      expect(strFromU8(entries["xl/tables/table1.xml"]!)).toContain(
        `totalsRowLabel="${encodedLabel}"`,
      );
      expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain(`>${encodedLabel}</t>`);
      const decoded = await decodeXlsx(encoded.bytes);
      expect(getCellContent(getActiveSheet(decoded.workbook), { row: 3, column: 0 })).toEqual({
        kind: "literal",
        value: label,
      });
      expect(tableXml((await encodeXlsx(decoded.workbook)).bytes)).toContain(
        `totalsRowLabel="${encodedLabel}"`,
      );
    },
  );
});
