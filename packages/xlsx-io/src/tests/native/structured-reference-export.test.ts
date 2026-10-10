import {
  applyWorkbookCommand,
  createAddSheetCommand,
  createBuiltinTableStyles,
  createCreateTableCommand,
  createSetCellContentCommand,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  serializeWorkbook,
  resolveTableReferenceBounds,
  type SheetTable,
} from "@sheetcraft/core";
import { getFormulaAst, type FormulaExpression } from "@sheetcraft/core/formula";
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
    ["=[@qty]*[@price]", "=Sales[[#This Row],[qty]]*Sales[[#This Row],[price]]"],
    ["=([@qty])*(([@price]))", "=(Sales[[#This Row],[qty]])*((Sales[[#This Row],[price]]))"],
    ["=SUM([qty])", "=SUM(Sales[qty])"],
    ["=SUM([[qty]:[price]])", "=SUM(Sales[[qty]:[price]])"],
    ["=SUM([[#This Row],[qty]:[price]])", "=SUM(Sales[[#This Row],[qty]:[price]])"],
    ["=SUM([[#Data],[qty]])", "=SUM(Sales[[#Data],[qty]])"],
    ["=SUM([#All])", "=SUM(Sales[#All])"],
    ["=SUM([[#Headers],[qty]])", "=SUM(Sales[[#Headers],[qty]])"],
    ["=SUM([[#Totals],[qty]])", "=SUM(Sales[[#Totals],[qty]])"],
    ["=SUM([ [qty]:[price] ])", "=SUM(Sales[ [qty]:[price] ])"],
    [
      "=IF(TRUE,[@qty],Sales[@price])",
      "=IF(TRUE,Sales[[#This Row],[qty]],Sales[[#This Row],[price]])",
    ],
    ["=Sales[qty]+Other[qty]+[@price]", "=Sales[qty]+Other[qty]+Sales[[#This Row],[price]]"],
    ['="[@qty]"&"a""[@price]"&[@qty]', '="[@qty]"&"a""[@price]"&Sales[[#This Row],[qty]]'],
    ["='O''Brien'!A1+[@qty]", "='O''Brien'!A1+Sales[[#This Row],[qty]]"],
    ["='[@qty]'!A1+[@price]", "='[@qty]'!A1+Sales[[#This Row],[price]]"],
    ["=Sheet1!A1+[@price]", "=Sheet1!A1+Sales[[#This Row],[price]]"],
    ["=SALES[@qty]", "=SALES[[#This Row],[qty]]"],
    ["=Sales[ @ [qty] ]", "=Sales[[#This Row],[qty]]"],
  ])("qualifies valid tokens in %s without rewriting surrounding source", (source, expected) => {
    const { qualify } = fixture();
    expect(qualify(source)).toBe(expected);
    expect(qualify(expected)).toBe(expected);
  });

  test("uses exact token spans for parenthesized references and preserves unknown columns", () => {
    const { qualify } = fixture();
    expect(qualify("=([@missing])+([@qty])")).toBe("=([@missing])+(Sales[[#This Row],[qty]])");
  });

  test("preserves valid Unicode and nested special-character header spelling", () => {
    const { table, qualify } = fixture();
    table.name = "销量";
    table.columns[1]!.name = "数量";
    table.columns[2]!.name = "Unit, price";
    expect(qualify("=[@数量]*[@[Unit, price]]")).toBe(
      "=销量[[#This Row],[数量]]*销量[[#This Row],[Unit, price]]",
    );
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

  test("canonicalizes explicitly qualified references outside the table without inventing a local context", () => {
    const { workbook, qualify } = fixture();
    expect(qualify("=Sales[@qty]+[@price]", 1, 4)).toBe("=Sales[[#This Row],[qty]]+[@price]");
    expect(qualify("=Sales[@qty]", 5, 4)).toBe("=Sales[@qty]");
    expect(qualify("=Missing[@qty]", 1, 4)).toBe("=Missing[@qty]");
    for (const address of [
      { row: 1, column: -1 },
      { row: 1.5, column: 4 },
      { row: 1, column: 16_384 },
    ])
      expect(qualifyXlsxStructuredReferences("=Sales[@qty]", workbook, "sheet", address)).toBe(
        "=Sales[@qty]",
      );
    expect(
      qualifyXlsxStructuredReferences("=Sales[@qty]", workbook, "missing-sheet", {
        row: 1,
        column: 4,
      }),
    ).toBe("=Sales[@qty]");
  });

  test("retains the explicit table target inside another table and on another sheet", () => {
    const { workbook, sheet, table, qualify } = fixture();
    const other: SheetTable = {
      ...structuredClone(table),
      id: "other",
      name: "Other",
      range: { start: { row: 0, column: 5 }, end: { row: 4, column: 8 } },
    };
    applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, other));
    expect(qualify("=Sales[@qty]+[@price]", 1, 8)).toBe(
      "=Sales[[#This Row],[qty]]+Other[[#This Row],[price]]",
    );
    applyWorkbookCommand(
      workbook,
      createAddSheetCommand(workbook, { id: "second", name: "Second" }),
    );
    expect(
      qualifyXlsxStructuredReferences("=Sales[@qty]", workbook, "second", { row: 1, column: 0 }),
    ).toBe("=Sales[[#This Row],[qty]]");
    // Ambiguous surrounding tables cannot rebind a local token, but an explicit
    // globally unique table name still resolves to its established target.
    sheet.tables!.push({ ...structuredClone(other), id: "overlap", name: "Overlap" });
    expect(qualify("=Sales[@qty]+[@price]", 1, 8)).toBe("=Sales[[#This Row],[qty]]+[@price]");
    sheet.tables!.push({ ...structuredClone(table), id: "duplicate-sales" });
    expect(qualify("=Sales[@qty]", 1, 8)).toBe("=Sales[@qty]");
  });

  test("canonical replacements retain the exact Core scope and resolved target", () => {
    const { workbook, sheet, qualify } = fixture();
    const source = "=([@qty])*Sales[@price]+SUM([[#This Row],[qty]:[price]])";
    const qualified = qualify(source);
    function targets(text: string) {
      const expression = getFormulaAst(text)!.expression;
      const result: Array<{
        scope: string;
        bounds: ReturnType<typeof resolveTableReferenceBounds>;
      }> = [];
      function visit(item: FormulaExpression) {
        if (item.kind === "structured-reference")
          result.push({
            scope: item.reference.scope,
            bounds: resolveTableReferenceBounds(workbook, sheet.id, item.reference, {
              row: 1,
              column: 3,
            }),
          });
        else if (item.kind === "binary") {
          visit(item.left);
          visit(item.right);
        } else if (item.kind === "unary") visit(item.operand);
        else if (item.kind === "function") item.args.forEach(visit);
      }
      visit(expression);
      return result;
    }
    expect(qualified).toBe(
      "=(Sales[[#This Row],[qty]])*Sales[[#This Row],[price]]+SUM(Sales[[#This Row],[qty]:[price]])",
    );
    expect(targets(qualified)).toEqual(targets(source));
    expect(targets(qualified).every((target) => target.bounds !== null)).toBe(true);
  });

  test("preserves unsupported @ header escape spellings even when Core accepts their literal text", () => {
    const { table, qualify } = fixture();
    for (const name of ["O'Brien", "O''Brien", "'@qty", "qty#count"]) {
      table.columns[1]!.name = name;
      const local = `=[@${name}]`;
      const explicit = `=Sales[@${name}]`;
      expect(qualify(local)).toBe(local);
      expect(qualify(explicit)).toBe(explicit);
    }
  });

  test("preserves @ range shorthand because Core does not reliably model its this-row scope", () => {
    const { workbook, sheet, table, qualify } = fixture();
    const source = "=SUM([@[qty]:[price]])";
    const expression = getFormulaAst(source)!.expression;
    expect(expression.kind).toBe("function");
    if (expression.kind !== "function") throw new Error("Expected the Core function AST.");
    const argument = expression.args[0]!;
    expect(argument.kind).toBe("structured-reference");
    if (argument.kind !== "structured-reference")
      throw new Error("Expected the Core reference AST.");
    expect(argument.reference.scope).toBe("data");
    expect(argument.reference.columns.map((column) => column.name)).toEqual(["@[qty]", "price"]);
    expect(
      resolveTableReferenceBounds(workbook, sheet.id, argument.reference, { row: 1, column: 3 }),
    ).toBeNull();
    for (const formula of [source, "=Sales[@[qty]:[price]]", "=SUM([[@qty]:[price]])"])
      expect(qualify(formula)).toBe(formula);
    // A contrived literal header can make this mis-modeled Core range resolve.
    // Export still must not reinterpret it as an Excel this-row range.
    table.columns[1]!.name = "@[qty]";
    expect(
      resolveTableReferenceBounds(workbook, sheet.id, argument.reference, { row: 1, column: 3 }),
    ).toEqual({
      sheetId: sheet.id,
      start: { row: 1, column: 1 },
      end: { row: 3, column: 2 },
    });
    expect(qualify(source)).toBe(source);
    table.columns[1]!.name = "qty";
    expect(qualify("=SUM([[#This Row],[qty]:[price]])")).toBe(
      "=SUM(Sales[[#This Row],[qty]:[price]])",
    );
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
    expect(
      sheetXml.match(/<f>Sales\[\[#This Row\],\[qty\]\]\*Sales\[\[#This Row\],\[price\]\]<\/f>/g),
    ).toHaveLength(3);
    expect(sheetXml).toMatch(
      /<c r="D2"[^>]*><f>Sales\[\[#This Row\],\[qty\]\]\*Sales\[\[#This Row\],\[price\]\]<\/f><v>24<\/v><\/c>/,
    );
    expect(sheetXml).toMatch(/<c r="D6"[^>]*><f>SUM\(Sales\[amount\]\)<\/f><v>57<\/v><\/c>/);
    const decoded = (await decodeXlsx(encoded.bytes)).workbook;
    const restored = getActiveSheet(decoded);
    expect(getCellContent(restored, { row: 1, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=Sales[[#This Row],[qty]]*Sales[[#This Row],[price]]" },
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
