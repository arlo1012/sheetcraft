import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  applyWorkbookCommand,
  createSetCellContentCommand,
  createResizeTableCommand,
} from "@sheetcraft/core/commands";
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture(source: string | null = "=B2*2") {
  const workbook = createWorkbook({ id: "calc-native", sheetId: "data", sheetName: "Data" });
  const sheet = getActiveSheet(workbook);
  for (const [column, name] of ["Item", "Qty", "Result"].entries())
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value: name });
  for (let row = 1; row <= 3; row++) {
    setCellContent(
      sheet,
      { row, column: 0 },
      { kind: "literal", value: String.fromCharCode(64 + row) },
    );
    setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row + 1 });
  }
  sheet.tables = [
    {
      id: "t",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      columns: ["Item", "Qty", "Result"].map((name, index) => ({
        id: String(index + 1),
        name,
        ...(index === 2 && source !== null ? { calculatedColumnFormula: source } : {}),
      })),
      style: createBuiltinTableStyles()[1]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    },
  ];
  setCellContent(sheet, { row: 1, column: 2 }, { kind: "formula", formula: { source: "=B2*2" } });
  setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: 99 });
  return { workbook, sheet };
}
function xml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["xl/tables/table1.xml"]!);
}
async function nativeFormula(body: string) {
  const f = fixture(null);
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries["xl/tables/table1.xml"] = strToU8(
    strFromU8(entries["xl/tables/table1.xml"]!).replace(
      /<tableColumn id="3" name="Result"\/>/,
      `<tableColumn id="3" name="Result">${body}</tableColumn>`,
    ),
  );
  return decodeXlsx(zipSync(entries));
}
function restoredColumn(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  return getActiveSheet(result.workbook).tables![0]!.columns[2]!;
}

describe("explicit native calculated-column templates", () => {
  test("writes producer-shaped metadata, preserves actual exceptions, and inherits after public roundtrip", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    const encoded = await encodeXlsx(f.workbook);
    expect(xml(encoded.bytes)).toContain(
      '<tableColumn id="3" name="Result"><calculatedColumnFormula>B2*2</calculatedColumnFormula></tableColumn>',
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    const decoded = await decodeXlsx(encoded.bytes);
    expect(decoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
    expect(restoredColumn(decoded).calculatedColumnFormula).toBe("=B2*2");
    const sheet = getActiveSheet(decoded.workbook);
    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 99 });
    expect(getCellContent(sheet, { row: 3, column: 2 })).toBeNull();
    applyWorkbookCommand(
      decoded.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 4, column: 1 },
        { kind: "literal", value: 5 },
        { inputIntent: "manual" },
      ),
    );
    expect(getCellContent(sheet, { row: 4, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=B5*2" },
    });
  });
  test("never infers a template from uniform member formulas", async () => {
    const f = fixture(null);
    for (let row = 1; row <= 3; row++)
      setCellContent(
        f.sheet,
        { row, column: 2 },
        { kind: "formula", formula: { source: `=B${row + 1}*2` } },
      );
    const encoded = await encodeXlsx(f.workbook);
    expect(xml(encoded.bytes)).not.toContain("calculatedColumnFormula");
    expect(restoredColumn(await decodeXlsx(encoded.bytes)).calculatedColumnFormula).toBeUndefined();
  });
  test.each([
    "=B2*2",
    "=[@Qty]*2",
    "=SUM(B2:B4)",
    "=SUM(Sales[Qty])",
    '=CONCAT("x & <",B2)',
    "=IF(B2>0,B2*2,0)",
    "=IF(B2>0,B2*2,#N/A)",
    '=IF(B2>0,"a & < b", "c")',
  ])("keeps the bounded scalar family %s", async (source) => {
    const f = fixture(source);
    const result = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(restoredColumn(result).calculatedColumnFormula).toBe(
      source.includes("[@Qty]")
        ? "=Sales[[#This Row],[Qty]]*2"
        : source.startsWith("=CONCAT(")
          ? source.replace("=CONCAT(", "=_xlfn.CONCAT(")
          : source,
    );
  });
  test("keeps empty-string, zero, error and boolean members without filling on import", async () => {
    const f = fixture();
    const values = [
      { kind: "literal", value: "" },
      { kind: "literal", value: 0 },
      { kind: "error", error: { kind: "formula-error", code: "NA" } },
      { kind: "literal", value: false },
    ] as const;
    applyWorkbookCommand(
      f.workbook,
      createResizeTableCommand(f.sheet.id, "t", {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 2 },
      }),
    );
    values.forEach((value, index) => setCellContent(f.sheet, { row: index + 1, column: 2 }, value));
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    const sheet = getActiveSheet(decoded.workbook);
    values.forEach((value, index) =>
      expect(getCellContent(sheet, { row: index + 1, column: 2 })).toEqual(value),
    );
    expect(restoredColumn(decoded).calculatedColumnFormula).toBe("=B2*2");
  });
  test.each([
    "<calculatedColumnFormula>B2*2</calculatedColumnFormula>",
    '<calculatedColumnFormula array="0">=B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula array="false" xml:space="preserve"><![CDATA[B2*2]]></calculatedColumnFormula>',
    '<s:calculatedColumnFormula xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main">B2*2</s:calculatedColumnFormula>',
  ])("reads native text/CDATA/namespace and scalar flag: %s", async (body) => {
    expect(restoredColumn(await nativeFormula(body)).calculatedColumnFormula).toBe("=B2*2");
  });
  test.each([
    '<calculatedColumnFormula array="1">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula array="bogus">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula mystery="1">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula xmlnsUnknown="not-a-namespace">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula xmlns:x="urn:unknown" x:array="0">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula xml:space="bogus">B2*2</calculatedColumnFormula>',
    '<calculatedColumnFormula xmlns="urn:unknown">B2*2</calculatedColumnFormula>',
    '<x:calculatedColumnFormula xmlns:x="urn:unknown">B2*2</x:calculatedColumnFormula>',
    "<calculatedColumnFormula/>",
    "<calculatedColumnFormula>B2*</calculatedColumnFormula>",
    "<calculatedColumnFormula>B2*2</calculatedColumnFormula><calculatedColumnFormula>B2*3</calculatedColumnFormula>",
  ])("omits unsupported native metadata with located warning: %s", async (body) => {
    const result = await nativeFormula(body);
    expect(restoredColumn(result).calculatedColumnFormula).toBeUndefined();
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        severity: "warning",
        locations: expect.arrayContaining([expect.stringContaining("calculatedColumnFormula")]),
      }),
    );
    expect(getCellContent(getActiveSheet(result.workbook), { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: 99,
    });
  });
  test.each([
    "=IF(B2>0,B2:B4,0)",
    "=INDEX(B2:B4,0)",
    "=OtherTable[@Qty]",
    "=SUM(SEQUENCE(3))",
    "=ABS([@Qty])",
    "=MissingName",
    "=B2#",
    "={1,2}",
    "=B2:B4*2",
    "=Sales[Qty]*2",
    "=SUM(-B2:B4)",
    "=ABS([@Qty]*2)",
    "=#SPILL!",
    "=IF(B2>0,0,#SPILL!)",
  ])("warns and omits unproved template %s without changing cells", async (source) => {
    const f = fixture(source);
    const before = serializeWorkbook(f.workbook);
    const encoded = await encodeXlsx(f.workbook);
    expect(xml(encoded.bytes)).not.toContain("calculatedColumnFormula");
    expect(encoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        severity: "warning",
        locations: expect.arrayContaining([expect.stringContaining("calculatedColumnFormula")]),
      }),
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    const result = await nativeFormula(
      `<calculatedColumnFormula>${source.slice(1)}</calculatedColumnFormula>`,
    );
    expect(restoredColumn(result).calculatedColumnFormula).toBeUndefined();
    expect(getCellContent(getActiveSheet(result.workbook), { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: 99,
    });
  });
  test("validates namespaces by column identity with mixed prefixed siblings", async () => {
    const f = fixture(null);
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/tables/table1.xml"] = strToU8(
      strFromU8(entries["xl/tables/table1.xml"]!)
        .replace(
          "<table xmlns=",
          '<table xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns=',
        )
        .replace('<tableColumn id="2" name="Qty"/>', '<s:tableColumn id="2" name="Qty"/>')
        .replace(
          '<tableColumn id="3" name="Result"/>',
          '<tableColumn id="3" name="Result"><s:calculatedColumnFormula>B2*2</s:calculatedColumnFormula></tableColumn>',
        ),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(
      getActiveSheet(decoded.workbook).tables![0]!.columns.map((column) => column.name),
    ).toEqual(["Item", "Qty", "Result"]);
    expect(restoredColumn(decoded).calculatedColumnFormula).toBe("=B2*2");
  });
  test("does not keep a template with a foreign layout attribute as its canonical anchor", async () => {
    const f = fixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/tables/table1.xml"] = strToU8(
      strFromU8(entries["xl/tables/table1.xml"]!).replace(
        "<table xmlns=",
        '<table xmlns:x="urn:unknown" x:headerRowCount="0" xmlns=',
      ),
    );
    const result = await decodeXlsx(zipSync(entries));
    expect(restoredColumn(result).calculatedColumnFormula).toBeUndefined();
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: expect.arrayContaining([expect.stringContaining("calculatedColumnFormula")]),
      }),
    );
    expect(getCellContent(getActiveSheet(result.workbook), { row: 2, column: 2 })).toEqual({
      kind: "literal",
      value: 99,
    });
  });
  test.each(["#SPILL!", "IF(B2>0,0,#SPILL!)"])(
    "omits the growth-blocking SPILL error in native template %s",
    async (source) => {
      const result = await nativeFormula(
        `<calculatedColumnFormula>${source}</calculatedColumnFormula>`,
      );
      expect(restoredColumn(result).calculatedColumnFormula).toBeUndefined();
      const sheet = getActiveSheet(result.workbook);
      expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 99 });
      applyWorkbookCommand(
        result.workbook,
        createResizeTableCommand(sheet.id, sheet.tables![0]!.id, {
          start: { row: 0, column: 0 },
          end: { row: 4, column: 2 },
        }),
      );
      expect(getCellContent(sheet, { row: 4, column: 2 })).toBeNull();
    },
  );
  test("keeps an actual SPILL error exception while dropping the unproved SPILL template", async () => {
    const f = fixture("=#SPILL!");
    setCellContent(
      f.sheet,
      { row: 2, column: 2 },
      {
        kind: "error",
        error: { kind: "formula-error", code: "SPILL" },
      },
    );
    const result = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(restoredColumn(result).calculatedColumnFormula).toBeUndefined();
    expect(getCellContent(getActiveSheet(result.workbook), { row: 2, column: 2 })).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "SPILL" },
    });
  });
  test("reports the existing prefixed-filter boundary without claiming filter preservation", async () => {
    const f = fixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/tables/table1.xml"] = strToU8(
      strFromU8(entries["xl/tables/table1.xml"]!)
        .replace(
          "<table xmlns=",
          '<table xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns=',
        )
        .replace(
          '<autoFilter ref="A1:C4"></autoFilter>',
          '<s:autoFilter ref="A1:C4"><s:filterColumn colId="1"><s:filters><s:filter val="3"/></s:filters></s:filterColumn></s:autoFilter>',
        ),
    );
    const result = await decodeXlsx(zipSync(entries));
    expect(restoredColumn(result).calculatedColumnFormula).toBe("=B2*2");
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: "feature-omitted", locations: ["Sales.filterNamespace"] }),
    );
  });
  test("keeps an explicit template even when every member is an exception", async () => {
    const f = fixture();
    for (let row = 1; row <= 3; row++)
      setCellContent(f.sheet, { row, column: 2 }, { kind: "literal", value: 99 });
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(restoredColumn(decoded).calculatedColumnFormula).toBe("=B2*2");
    for (let row = 1; row <= 3; row++)
      expect(getCellContent(getActiveSheet(decoded.workbook), { row, column: 2 })).toEqual({
        kind: "literal",
        value: 99,
      });
  });
  test("keeps offset/header-off canonical anchors and appends without touching total rows", async () => {
    const f = fixture("=E6*2");
    const table = f.sheet.tables![0]!;
    table.range = { start: { row: 5, column: 3 }, end: { row: 8, column: 5 } };
    table.headerRow = false;
    table.totalRow = true;
    setCellContent(
      f.sheet,
      { row: 8, column: 5 },
      { kind: "formula", formula: { source: "=SUM(F6:F8)+1" } },
    );
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(restoredColumn(decoded).calculatedColumnFormula).toBe("=E6*2");
    expect(getActiveSheet(decoded.workbook).tables![0]).toMatchObject({
      headerRow: false,
      totalRow: true,
      range: table.range,
    });
    expect(getCellContent(getActiveSheet(decoded.workbook), { row: 8, column: 5 })).toMatchObject({
      formula: { source: "=SUM(F6:F8)+1" },
    });
  });
  test("reports real unsupported table properties rather than warning for every supported part", async () => {
    const f = fixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/tables/table1.xml"] = strToU8(
      strFromU8(entries["xl/tables/table1.xml"]!)
        .replace('name="Result"', 'name="Result" dataDxfId="0"')
        .replace("</table>", '<extLst><ext uri="urn:unknown"/></extLst></table>'),
    );
    const result = await decodeXlsx(zipSync(entries));
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: ["Sales.tableMetadata", "Sales[Result].columnMetadata"],
      }),
    );
    expect(restoredColumn(result).calculatedColumnFormula).toBe("=B2*2");
  });
  test("writes calculated metadata before the exact custom total formula", async () => {
    const f = fixture();
    f.sheet.tables![0]!.totalRow = true;
    setCellContent(f.sheet, { row: 3, column: 1 }, null);
    setCellContent(
      f.sheet,
      { row: 3, column: 2 },
      { kind: "formula", formula: { source: "=SUM(C2:C3)+1" } },
    );
    const text = xml((await encodeXlsx(f.workbook)).bytes);
    expect(text).toContain(
      "<calculatedColumnFormula>B2*2</calculatedColumnFormula><totalsRowFormula>SUM(C2:C3)+1</totalsRowFormula>",
    );
  });
});
