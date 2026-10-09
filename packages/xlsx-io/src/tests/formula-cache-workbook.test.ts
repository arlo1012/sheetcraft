import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  applyWorkbookCommand,
  createAddSheetCommand,
  createCreateTableCommand,
  createSetCellContentCommand,
  createSetWorkbookDateSystemCommand,
  createUpsertDefinedNameCommand,
} from "@sheetcraft/core/commands";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { type CellContent } from "@sheetcraft/core/formula";
import { createWorkbook, createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";

function set(
  workbook: Workbook,
  sheetId: string,
  row: number,
  column: number,
  content: CellContent,
) {
  applyWorkbookCommand(workbook, createSetCellContentCommand(sheetId, { row, column }, content));
}

function formula(workbook: Workbook, sheetId: string, row: number, column: number, source: string) {
  set(workbook, sheetId, row, column, { kind: "formula", formula: { source } });
}

function fixture() {
  const workbook = createWorkbook({
    id: "formula-caches",
    sheetId: "input",
    sheetName: "Input Data",
  });
  applyWorkbookCommand(
    workbook,
    createAddSheetCommand(workbook, { id: "lab", name: "Formula Lab" }),
  );
  for (const [offset, amount] of [2, 3, 8].entries()) {
    set(workbook, "input", offset + 4, 0, { kind: "literal", value: `Item ${offset + 1}` });
    set(workbook, "input", offset + 4, 1, { kind: "literal", value: amount });
    set(workbook, "input", offset + 4, 2, { kind: "literal", value: [4, 3, 5][offset]! });
    set(workbook, "input", offset + 4, 3, {
      kind: "literal",
      value: offset === 1 ? "West" : "East",
    });
  }
  // Dependencies include formula cells, not just literal values in another sheet.
  formula(workbook, "input", 6, 1, "=B5*4");
  applyWorkbookCommand(
    workbook,
    createCreateTableCommand("input", {
      id: "input-table",
      name: "InputRows",
      range: { start: { row: 3, column: 0 }, end: { row: 6, column: 3 } },
      columns: ["Item", "Amount", "Price", "Region"].map((name) => ({ id: name, name })),
      style: createBuiltinTableStyles()[0]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  formula(workbook, "input", 4, 2, "=[@Amount]*2");
  for (const [name, reference, scopeSheetId] of [
    ["Amounts", "'Input Data'!$B$5:$B$7", undefined],
    ["ScopedAmount", "'Input Data'!$B$5:$B$7", undefined],
    ["ScopedAmount", "'Input Data'!$B$5", "lab"],
  ] as const)
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, { name, reference, scopeSheetId }),
    );
  const cases = [
    ["=SUM('Input Data'!B5:B7)", 13],
    ["=SUMPRODUCT('Input Data'!B5:B7,'Input Data'!C5:C7)", 57],
    ["='Input Data'!B5*2", 4],
    ["=SUM(Amounts)", 13],
    ["=SUM(ScopedAmount)", 2],
    ["=COUNTIF('Input Data'!D5:D7,\"East\")", 2],
    ["=SUMIF('Input Data'!D5:D7,\"East\",'Input Data'!B5:B7)", 10],
    ["=AVERAGE('Input Data'!B5:B7)", 13 / 3],
    ["=SUM(InputRows[Amount])", 13],
    ["=VLOOKUP(\"Item 1\",'Input Data'!A5:C7,3,FALSE)", 4],
    ["=IF(TRUE,SUM(Amounts),1/0)", 13],
  ] as const;
  for (const [row, [source]] of cases.entries()) formula(workbook, "lab", row, 1, source);
  formula(workbook, "input", 0, 5, "=SUM(ScopedAmount)");
  return { workbook, cases };
}

// Inspect actual OOXML independently of the native reader or workbook evaluator.
function rawCell(bytes: Uint8Array, sheetNumber: number, address: string) {
  const xml = strFromU8(unzipSync(bytes)[`xl/worksheets/sheet${sheetNumber}.xml`]!);
  const match = new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*>([\\s\\S]*?)<\\/c>`).exec(xml);
  expect(match, `${sheetNumber}!${address}`).not.toBeNull();
  return { xml: match![0], cache: /<v>([\s\S]*?)<\/v>/.exec(match![1]!)?.[1] };
}

describe("workbook-aware native formula caches", () => {
  test("writes qualified, named, structured and lazy formula results from one fresh workbook cycle", async () => {
    const { workbook, cases } = fixture();
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    for (const [row, [, expected]] of cases.entries())
      expect(Number(rawCell(encoded.bytes, 2, `B${row + 1}`).cache)).toBe(expected);
    expect(rawCell(encoded.bytes, 1, "C5").cache).toBe("4");
    expect(rawCell(encoded.bytes, 1, "F1").cache).toBe("13");
    expect(rawCell(encoded.bytes, 2, "B6").xml).toContain("COUNTIF(");
    expect(rawCell(encoded.bytes, 2, "B6").cache).toBe("2");
  });

  test("discards caches on decode and recomputes names, tables and dependent cross-sheet formulas after a Core edit", async () => {
    const { workbook, cases } = fixture();
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const sheetPath = "xl/worksheets/sheet2.xml";
    entries[sheetPath] = strToU8(
      strFromU8(entries[sheetPath]!).replace(/(<f>[\s\S]*?<\/f>)<v>[^<]*<\/v>/g, "$1<v>999999</v>"),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    const input = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === "Input Data",
    )!;
    const lab = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === "Formula Lab",
    )!;
    expect(decoded.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "formula-cache-discarded" })]),
    );
    const recomputed = createWorkbookEvaluator(decoded.workbook, lab.id);
    for (const [row, [, expected]] of cases.entries())
      expect(recomputed.getComputedValue({ row, column: 1 })).toBe(expected);
    set(decoded.workbook, input.id, 4, 1, { kind: "literal", value: 4 });
    set(decoded.workbook, input.id, 4, 3, { kind: "literal", value: "West" });
    const fresh = createWorkbookEvaluator(decoded.workbook, lab.id);
    expect(fresh.getComputedValue({ row: 0, column: 1 })).toBe(23);
    expect(fresh.getComputedValue({ row: 3, column: 1 })).toBe(23);
    expect(fresh.getComputedValue({ row: 4, column: 1 })).toBe(4);
    expect(fresh.getComputedValue({ row: 5, column: 1 })).toBe(1);
    expect(fresh.getComputedValue({ row: 8, column: 1 })).toBe(23);
    const reencoded = await encodeXlsx(decoded.workbook);
    expect(rawCell(reencoded.bytes, 2, "B1").cache).toBe("23");
    expect(rawCell(reencoded.bytes, 2, "B6").cache).toBe("1");
    expect(rawCell(reencoded.bytes, 1, "C5").cache).toBe("8");
  });

  test("follows unsafe dependencies across sheets, names, tables and arrays without caching masked failures", async () => {
    const { workbook } = fixture();
    formula(workbook, "input", 4, 1, "=UNKNOWN(1)");
    formula(workbook, "input", 6, 1, "=SUM(");
    const sources = [
      "=IFERROR('Input Data'!B5,0)",
      "=IFERROR(SUM('Input Data'!B5:B7),0)",
      "=IFERROR(SUM(Amounts),0)",
      "=IFERROR(SUM(InputRows[Amount]),0)",
      "=IFERROR(SUM(ScopedAmount),0)",
      "=IFERROR('Input Data'!B7,0)",
      "=IFERROR(MissingName,0)",
      "=IFERROR(SUM(MissingTable[Amount]),0)",
      "=IFERROR(SUM({UNKNOWN(1),2}),0)",
    ];
    for (const [row, source] of sources.entries()) formula(workbook, "lab", row + 20, 1, source);
    // A genuine workbook-spanning cycle also stays uncached even when IFERROR masks it.
    formula(workbook, "input", 9, 4, "='Formula Lab'!B30");
    formula(workbook, "lab", 29, 1, "=IFERROR('Input Data'!E10,0)");
    const encoded = await encodeXlsx(workbook);
    const issue = encoded.report.issues.find((issue) => issue.code === "formula-not-calculated")!;
    const uncalculated = Object.entries(unzipSync(encoded.bytes))
      .filter(([path]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
      .flatMap(([, bytes]) => [...strFromU8(bytes).matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)])
      .filter(([cell]) => cell.includes("<f>") && !cell.includes("<v>"));
    // Reports count every affected cell while keeping only ten sample locations.
    expect(issue.count).toBe(uncalculated.length);
    expect(issue.count).toBeGreaterThan(sources.length);
    expect(issue.locations).toContain("Input Data!B5");
    for (const row of [...sources.map((_, index) => index + 21), 30]) {
      expect(rawCell(encoded.bytes, 2, `B${row}`).cache).toBeUndefined();
    }
    expect(rawCell(encoded.bytes, 1, "E10").cache).toBeUndefined();
  });

  test("preserves intentional Excel error caches and the workbook's 1904 date system", async () => {
    const { workbook } = fixture();
    applyWorkbookCommand(workbook, createSetWorkbookDateSystemCommand("1904"));
    const cases = [
      ["=DATE(1904,1,2)", "1", undefined],
      ["=1/0", "#DIV/0!", "e"],
      ["=NA()", "#N/A", "e"],
      ["=#REF!", "#REF!", "e"],
      ["='Missing Sheet'!A1", "#REF!", "e"],
      ["=IF(TRUE,7,1/0)", "7", undefined],
      ['=IFERROR(1/0,"safe")', "safe", "str"],
    ] as const;
    for (const [row, [source]] of cases.entries()) formula(workbook, "lab", row + 20, 1, source);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    for (const [row, [, expected, type]] of cases.entries()) {
      const cell = rawCell(encoded.bytes, 2, `B${row + 21}`);
      expect(cell.cache).toBe(expected);
      if (type) expect(cell.xml).toContain(`t="${type}"`);
    }
    expect(strFromU8(unzipSync(encoded.bytes)["xl/workbook.xml"]!)).toContain('date1904="1"');
  });
});
