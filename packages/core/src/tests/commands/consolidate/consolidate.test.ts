import { describe, expect, test } from "vitest";
import { createConsolidateCommand, analyzeConsolidate } from "../../../commands/consolidate.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../../history.js";
import {
  createSheet,
  getActiveSheet,
  getCellContent,
  insertSheet,
  MAX_SHEET_ROWS,
  setCellContent,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

const range = (startRow: number, startColumn: number, endRow: number, endColumn: number) => ({
  start: { row: startRow, column: startColumn },
  end: { row: endRow, column: endColumn },
});
const set = (
  sheet: ReturnType<typeof getActiveSheet>,
  row: number,
  column: number,
  value: string | number,
) => setCellContent(sheet, { row, column }, { kind: "literal", value });

describe("consolidate", () => {
  test("consolidates cross-sheet ranges by first-appearance row and column labels", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    ["", "Jan", "Feb"].forEach((value, column) => set(first, 0, column, value));
    set(first, 1, 0, "North");
    set(first, 1, 1, 2);
    set(first, 1, 2, 4);
    set(first, 2, 0, "South");
    set(first, 2, 1, 3);
    set(first, 2, 2, 5);
    ["", "Feb", "Mar"].forEach((value, column) => set(second, 0, column, value));
    set(second, 1, 0, "South");
    set(second, 1, 1, 7);
    set(second, 1, 2, 11);
    set(second, 2, 0, "East");
    set(second, 2, 1, 13);
    set(second, 2, 2, 17);
    const options = {
      sources: [
        { sheetId: first.id, range: range(0, 0, 2, 2) },
        { sheetId: second.id, range: range(0, 0, 2, 2) },
      ],
      destination: { sheetId: first.id, address: { row: 4, column: 0 } },
      function: "sum" as const,
      topRow: true,
      leftColumn: true,
      overwrite: false,
    };
    expect(analyzeConsolidate(session.workbook, options)).toMatchObject({
      rows: 4,
      columns: 4,
      numericValues: 8,
    });
    expect(
      executeWorkbookCommand(session, createConsolidateCommand(session.workbook, options)),
    ).toBe(true);
    expect(getCellContent(first, { row: 4, column: 1 })).toEqual({ kind: "literal", value: "Jan" });
    expect(getCellContent(first, { row: 4, column: 3 })).toEqual({ kind: "literal", value: "Mar" });
    expect(getCellContent(first, { row: 7, column: 0 })).toEqual({
      kind: "literal",
      value: "East",
    });
    expect(getCellContent(first, { row: 6, column: 2 })).toEqual({ kind: "literal", value: 12 });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(first, { row: 6, column: 2 })).toBeNull();
  });

  test("uses computed values and reads spill tails whose root is outside the selected range", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3,1,2,2)" } },
    );
    const base = {
      sources: [{ sheetId: sheet.id, range: range(1, 0, 2, 0) }],
      destination: { sheetId: sheet.id, address: { row: 0, column: 2 } },
      topRow: false,
      leftColumn: false,
      overwrite: false,
    };
    expect(analyzeConsolidate(session.workbook, { ...base, function: "sum" }).numericValues).toBe(
      2,
    );
    expect(
      executeWorkbookCommand(
        session,
        createConsolidateCommand(session.workbook, { ...base, function: "average" }),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({ kind: "literal", value: 4 });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({ kind: "literal", value: 6 });
  });

  test.each([
    ["sum", 5],
    ["counta", 2],
    ["count", 2],
    ["average", 2.5],
    ["product", 6],
    ["min", 2],
    ["max", 3],
    ["stdev", Math.SQRT1_2],
    ["stdevp", 0.5],
    ["var", 0.5],
    ["varp", 0.25],
  ] as const)("calculates %s across source ranges", (functionName, expected) => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    set(first, 0, 0, 2);
    set(second, 0, 0, 3);
    const command = createConsolidateCommand(session.workbook, {
      sources: [
        { sheetId: first.id, range: range(0, 0, 0, 0) },
        { sheetId: second.id, range: range(0, 0, 0, 0) },
      ],
      destination: { sheetId: first.id, address: { row: 0, column: 2 } },
      function: functionName,
      topRow: false,
      leftColumn: false,
      overwrite: false,
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(first, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: expected,
    });
  });

  test("returns DIV0 for under-sized sample or population dispersion", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    set(sheet, 0, 0, 2);
    set(sheet, 0, 1, "text");
    const base = {
      destination: { sheetId: sheet.id, address: { row: 2, column: 0 } },
      topRow: false,
      leftColumn: false,
      overwrite: false,
    };
    for (const [functionName, sources] of [
      ["stdev", [{ sheetId: sheet.id, range: range(0, 0, 0, 0) }]],
      ["var", [{ sheetId: sheet.id, range: range(0, 0, 0, 0) }]],
      ["stdevp", [{ sheetId: sheet.id, range: range(0, 1, 0, 1) }]],
      ["varp", [{ sheetId: sheet.id, range: range(0, 1, 0, 1) }]],
    ] as const) {
      const command = createConsolidateCommand(session.workbook, {
        ...base,
        sources,
        function: functionName,
      });
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
        kind: "error",
        error: { kind: "formula-error", code: "DIV0" },
      });
      expect(undoWorkbookCommand(session)).toBe(true);
    }
  });

  test("keeps count semantics while counta includes text, logical values, and errors", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const textSheet = createSheet("Text", "text");
    const logicalSheet = createSheet("Logical", "logical");
    const errorSheet = createSheet("Error", "error");
    insertSheet(session.workbook, textSheet);
    insertSheet(session.workbook, logicalSheet);
    insertSheet(session.workbook, errorSheet);
    set(first, 0, 0, 2);
    set(textSheet, 0, 0, "text");
    setCellContent(logicalSheet, { row: 0, column: 0 }, { kind: "literal", value: true });
    setCellContent(
      errorSheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    const sources = [first, textSheet, logicalSheet, errorSheet].map((sheet) => ({
      sheetId: sheet.id,
      range: range(0, 0, 0, 0),
    }));
    const base = {
      sources,
      destination: { sheetId: first.id, address: { row: 0, column: 2 } },
      topRow: false,
      leftColumn: false,
      overwrite: false,
    };
    for (const [functionName, expected] of [
      ["count", 1],
      ["counta", 4],
    ] as const) {
      const command = createConsolidateCommand(session.workbook, {
        ...base,
        function: functionName,
      });
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(getCellContent(first, { row: 0, column: 2 })).toEqual({
        kind: "literal",
        value: expected,
      });
      expect(undoWorkbookCommand(session)).toBe(true);
    }
    expect(analyzeConsolidate(session.workbook, { ...base, function: "sum" }).sample).toEqual([
      ["#DIV/0!"],
    ]);
    const command = createConsolidateCommand(session.workbook, { ...base, function: "sum" });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(first, { row: 0, column: 2 })).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "DIV0" },
    });
  });

  test("uses PRODUCT's multiplicative identity when a source position has no numeric values", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    set(sheet, 0, 0, "text");
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: true });
    const command = createConsolidateCommand(session.workbook, {
      sources: [{ sheetId: sheet.id, range: range(0, 0, 0, 1) }],
      destination: { sheetId: sheet.id, address: { row: 2, column: 0 } },
      function: "product",
      topRow: false,
      leftColumn: false,
      overwrite: false,
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual({ kind: "literal", value: 1 });
  });

  test.each([
    ["stdev", 1],
    ["stdevp", Math.sqrt(2 / 3)],
    ["var", 1],
    ["varp", 2 / 3],
  ] as const)("uses stable %s dispersion for large offsets", (functionName, expected) => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const sources = [1, 2, 3].map((offset, index) => {
      const sheet = index === 0 ? first : createSheet(`S${index}`, `s${index}`);
      if (index) insertSheet(session.workbook, sheet);
      set(sheet, 0, 0, 1_000_000_000_000 + offset);
      return { sheetId: sheet.id, range: range(0, 0, 0, 0) };
    });
    const command = createConsolidateCommand(session.workbook, {
      sources,
      destination: { sheetId: first.id, address: { row: 0, column: 2 } },
      function: functionName,
      topRow: false,
      leftColumn: false,
      overwrite: false,
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect((getCellContent(first, { row: 0, column: 2 }) as { value: number }).value).toBeCloseTo(
      expected,
      12,
    );
  });

  test("supports top-row-only and left-column-only label aggregation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    set(sheet, 0, 0, "Jan");
    set(sheet, 0, 1, "Feb");
    set(sheet, 1, 0, 2);
    set(sheet, 1, 1, 3);
    expect(
      analyzeConsolidate(session.workbook, {
        sources: [{ sheetId: sheet.id, range: range(0, 0, 1, 1) }],
        destination: { sheetId: sheet.id, address: { row: 3, column: 0 } },
        function: "sum",
        topRow: true,
        leftColumn: false,
        overwrite: false,
      }).sample,
    ).toEqual([
      ["Jan", "Feb"],
      [2, 3],
    ]);
    set(sheet, 3, 3, "North");
    set(sheet, 4, 3, "South");
    set(sheet, 3, 4, 4);
    set(sheet, 4, 4, 5);
    expect(
      analyzeConsolidate(session.workbook, {
        sources: [{ sheetId: sheet.id, range: range(3, 3, 4, 4) }],
        destination: { sheetId: sheet.id, address: { row: 6, column: 0 } },
        function: "sum",
        topRow: false,
        leftColumn: true,
        overwrite: false,
      }).sample,
    ).toEqual([
      ["North", 4],
      ["South", 5],
    ]);
  });

  test("clears stale cells in the full output rectangle only when overwrite is enabled", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    set(sheet, 0, 0, 4);
    set(sheet, 0, 1, "text");
    set(sheet, 2, 0, "old");
    set(sheet, 2, 1, "old");
    const base = {
      sources: [{ sheetId: sheet.id, range: range(0, 0, 0, 1) }],
      destination: { sheetId: sheet.id, address: { row: 2, column: 0 } },
      function: "sum" as const,
      topRow: false,
      leftColumn: false,
    };
    expect(() =>
      createConsolidateCommand(session.workbook, { ...base, overwrite: false }),
    ).toThrow();
    expect(
      executeWorkbookCommand(
        session,
        createConsolidateCommand(session.workbook, { ...base, overwrite: true }),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: 4 });
    expect(getCellContent(sheet, { row: 2, column: 1 })).toBeNull();
  });

  test("rejects invalid destinations before changing any cell", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    set(sheet, 0, 0, 1);
    set(sheet, 0, 2, "keep");
    const source = [{ sheetId: sheet.id, range: range(0, 0, 0, 0) }];
    const make = (destination: { row: number; column: number }) => ({
      sources: source,
      destination: { sheetId: sheet.id, address: destination },
      function: "sum" as const,
      topRow: false,
      leftColumn: false,
      overwrite: true,
    });
    sheet.properties.protected = true;
    expect(() => createConsolidateCommand(session.workbook, make({ row: 0, column: 2 }))).toThrow();
    sheet.properties.protected = false;
    sheet.mergedCells = [range(1, 2, 1, 3)];
    expect(() => createConsolidateCommand(session.workbook, make({ row: 1, column: 2 }))).toThrow();
    sheet.mergedCells = [];
    setCellContent(
      sheet,
      { row: 2, column: 2 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    expect(() => createConsolidateCommand(session.workbook, make({ row: 3, column: 2 }))).toThrow();
    expect(() =>
      createConsolidateCommand(session.workbook, make({ row: MAX_SHEET_ROWS, column: 0 })),
    ).toThrow();
    expect(() =>
      createConsolidateCommand(session.workbook, {
        ...make({ row: 5, column: 0 }),
        sources: [{ sheetId: sheet.id, range: range(0, 0, 100_000, 0) }],
      }),
    ).toThrow();
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: "keep",
    });
  });
});
