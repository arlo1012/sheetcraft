import {
  applyWorkbookCommand,
  createBuiltinTableStyles,
  createCreateTableCommand,
  createSetCellContentCommand,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  serializeWorkbook,
  type SheetTable,
} from "@sheetcraft/core";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { qualifyXlsxStructuredReferences } from "../../structured-reference-export.js";

function fixture() {
  const workbook = createWorkbook({ id: "local-table-export", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const table: SheetTable = {
    id: "sales",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 3 } },
    columns: ["item", "qty", "price", "amount"].map((name, index) => ({
      id: `column-${index + 1}`,
      name,
    })),
    style: createBuiltinTableStyles()[1]!,
    headerRow: true,
    totalRow: true,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  for (const [column, entry] of table.columns.entries())
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column },
        { kind: "literal", value: entry.name },
      ),
    );
  applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
  const qualify = (source: string, row = 1, column = 3) =>
    qualifyXlsxStructuredReferences(source, workbook, sheet.id, { row, column });
  return { workbook, sheet, table: sheet.tables![0]!, qualify };
}

describe("XLSX table-local structured reference qualification", () => {
  test.each([
    ["=[@qty]*[@price]", "=Sales[@qty]*Sales[@price]"],
    ["=([@qty])*(([@price]))", "=(Sales[@qty])*((Sales[@price]))"],
    ["=SUM([qty])", "=SUM(Sales[qty])"],
    ["=SUM([[qty]:[price]])", "=SUM(Sales[[qty]:[price]])"],
    ["=SUM([[#This Row],[qty]:[price]])", "=SUM(Sales[[#This Row],[qty]:[price]])"],
    ["=SUM([[#Data],[qty]])", "=SUM(Sales[[#Data],[qty]])"],
    ["=SUM([#All])", "=SUM(Sales[#All])"],
    ["=SUM([[#Headers],[qty]])", "=SUM(Sales[[#Headers],[qty]])"],
    ["=SUM([[#Totals],[qty]])", "=SUM(Sales[[#Totals],[qty]])"],
    ["=SUM([ [qty]:[price] ])", "=SUM(Sales[ [qty]:[price] ])"],
    ["=IF(TRUE,[@qty],Sales[@price])", "=IF(TRUE,Sales[@qty],Sales[@price])"],
    ["=Sales[qty]+Other[qty]+[@price]", "=Sales[qty]+Other[qty]+Sales[@price]"],
    ['="[@qty]"&"a""[@price]"&[@qty]', '="[@qty]"&"a""[@price]"&Sales[@qty]'],
    ["='O''Brien'!A1+[@qty]", "='O''Brien'!A1+Sales[@qty]"],
    ["='[@qty]'!A1+[@price]", "='[@qty]'!A1+Sales[@price]"],
    ["=Sheet1!A1+[@price]", "=Sheet1!A1+Sales[@price]"],
  ])("qualifies valid tokens in %s without rewriting surrounding source", (source, expected) => {
    const { qualify } = fixture();
    expect(qualify(source)).toBe(expected);
    expect(qualify(expected)).toBe(expected);
  });

  test("uses exact token spans for parenthesized references and preserves unknown columns", () => {
    const { qualify } = fixture();
    expect(qualify("=([@missing])+([@qty])")).toBe("=([@missing])+(Sales[@qty])");
  });

  test("preserves valid Unicode and nested special-character header spelling", () => {
    const { table, qualify } = fixture();
    table.name = "销量";
    table.columns[1]!.name = "数量";
    table.columns[2]!.name = "Unit, price";
    expect(qualify("=[@数量]*[@[Unit, price]]")).toBe("=销量[@数量]*销量[@[Unit, price]]");
  });

  test("does not invent a table or row context for unresolved references", () => {
    const { sheet, qualify } = fixture();
    expect(qualify("=[@qty]", 1, 4)).toBe("=[@qty]");
    expect(qualify("=[@qty]", 5, 3)).toBe("=[@qty]");
    expect(qualify("=[@qty]", 0, 3)).toBe("=[@qty]");
    expect(qualify("=[@qty]", 4, 3)).toBe("=[@qty]");
    sheet.tables = [];
    expect(qualify("=[@qty]")).toBe("=[@qty]");
  });

  test("preserves selectors whose table rows do not exist", () => {
    const { table, qualify } = fixture();
    table.headerRow = false;
    expect(qualify("=SUM([[#Headers],[qty]])")).toBe("=SUM([[#Headers],[qty]])");
    table.totalRow = false;
    expect(qualify("=SUM([[#Totals],[qty]])")).toBe("=SUM([[#Totals],[qty]])");
  });

  test("preserves unsupported, malformed, external, and escaped-header grammar", () => {
    const { table, qualify } = fixture();
    table.columns[1]!.name = "a]b";
    for (const source of [
      "=[@[a']b]]",
      "=[@a'[b]",
      "=['#qty]",
      "=[@'@qty]",
      "=[@O''Brien]",
      "=SUM([#Data])",
      "=SUM([])",
      "=[@qty",
      "=[@qty]+",
      "=[book.xlsx]Sheet1!A1+[@price]",
      "='[book.xlsx]Sheet1'!A1+[@qty]",
    ])
      expect(qualify(source)).toBe(source);
  });

  test("does not qualify ambiguous containing tables, duplicate names, or invalid imported names", () => {
    const { workbook, sheet, table, qualify } = fixture();
    const duplicate = { ...structuredClone(table), id: "duplicate", name: "Other" };
    sheet.tables!.push(duplicate);
    expect(qualify("=[@qty]")).toBe("=[@qty]");
    duplicate.range = { start: { row: 10, column: 0 }, end: { row: 14, column: 3 } };
    duplicate.name = "sales";
    expect(qualify("=[@qty]")).toBe("=[@qty]");
    sheet.tables!.pop();
    table.name = "Sales+1";
    expect(qualify("=[@qty]")).toBe("=[@qty]");
    table.name = "Sales";
    expect(
      qualifyXlsxStructuredReferences("=[@qty]", workbook, "unknown", { row: 1, column: 3 }),
    ).toBe("=[@qty]");
  });

  test.each([
    "A1",
    "a1",
    "XFD1048576",
    "R1C1",
    "r1048576c16384",
    "R0C0",
    "TRUE",
    "true",
    "FALSE",
    "False",
    "Sales.Table",
    "Sales+1",
    "Sales Name",
  ])("preserves imported table name %s rejected by Core validation", (name) => {
    const { workbook, sheet, table, qualify } = fixture();
    expect(() =>
      applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, { ...table, name })),
    ).toThrow();
    table.name = name;
    expect(qualify("=[@qty]*[@price]")).toBe("=[@qty]*[@price]");
  });

  test("does not normalize padded imported names or rebind names colliding with defined names", () => {
    const { workbook, sheet, table, qualify } = fixture();
    table.name = " Sales ";
    expect(qualify("=[@qty]")).toBe("=[@qty]");
    table.name = "Sales";
    workbook.definedNames.set("named-sales", {
      id: "named-sales",
      name: "sales",
      reference: {
        sheetId: sheet.id,
        start: { row: 1, column: 1 },
        end: { row: 3, column: 1 },
      },
    });
    expect(qualify("=[@qty]")).toBe("=[@qty]");
  });

  test("roundtrips recalculable qualified formulas and never mutates Core source or snapshot", async () => {
    const { workbook, sheet } = fixture();
    for (const [row, qty, price] of [
      [1, 2, 12],
      [2, 3, 4],
      [3, 3, 7],
    ]) {
      for (const [column, value] of [
        [1, qty!],
        [2, price!],
      ])
        applyWorkbookCommand(
          workbook,
          createSetCellContentCommand(
            sheet.id,
            { row: row!, column: column! },
            { kind: "literal", value: value! },
          ),
        );
      applyWorkbookCommand(
        workbook,
        createSetCellContentCommand(
          sheet.id,
          { row: row!, column: 3 },
          {
            kind: "formula",
            formula: { source: "=[@qty]*[@price]" },
          },
        ),
      );
    }
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 5, column: 3 },
        {
          kind: "formula",
          formula: { source: "=SUM(Sales[amount])" },
        },
      ),
    );
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(encoded.report.issues).toEqual([]);
    const sheetXml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
    expect(sheetXml.match(/<f>Sales\[@qty\]\*Sales\[@price\]<\/f>/g)).toHaveLength(3);
    expect(sheetXml).toMatch(
      /<c r="D2"[^>]*><f>Sales\[@qty\]\*Sales\[@price\]<\/f><v>24<\/v><\/c>/,
    );
    expect(sheetXml).toMatch(/<c r="D6"[^>]*><f>SUM\(Sales\[amount\]\)<\/f><v>57<\/v><\/c>/);
    const decoded = (await decodeXlsx(encoded.bytes)).workbook;
    const restored = getActiveSheet(decoded);
    expect(getCellContent(restored, { row: 1, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=Sales[@qty]*Sales[@price]" },
    });
    const evaluator = createWorkbookEvaluator(decoded, restored.id);
    expect([1, 2, 3, 5].map((row) => evaluator.getComputedValue({ row, column: 3 }))).toEqual([
      24, 12, 21, 57,
    ]);
    applyWorkbookCommand(
      decoded,
      createSetCellContentCommand(
        restored.id,
        { row: 1, column: 1 },
        { kind: "literal", value: 4 },
      ),
    );
    const edited = createWorkbookEvaluator(decoded, restored.id);
    expect(edited.getComputedValue({ row: 1, column: 3 })).toBe(48);
    expect(edited.getComputedValue({ row: 5, column: 3 })).toBe(81);
    expect(getCellContent(sheet, { row: 1, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=[@qty]*[@price]" },
    });
  });

  test("exports and imports an unresolved local reference outside the table unchanged", async () => {
    const { workbook, sheet } = fixture();
    const source = "=SUM([qty])";
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 6, column: 3 },
        {
          kind: "formula",
          formula: { source },
        },
      ),
    );
    const encoded = await encodeXlsx(workbook);
    expect(strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!)).toContain(
      "<f>SUM([qty])</f>",
    );
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(getCellContent(restored, { row: 6, column: 3 })).toEqual({
      kind: "formula",
      formula: { source },
    });
  });
});
