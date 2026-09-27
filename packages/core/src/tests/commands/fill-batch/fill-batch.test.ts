import { describe, expect, test } from "vitest";
import {
  createFillBlanksCommand,
  createFillCurrentDateCommand,
  createInsertCellTextCommand,
} from "../../../commands/fill-batch.js";
import { DataFillError } from "../../../commands/fill-common.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../../history.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

const range = (row: number, column: number, endRow = row, endColumn = column) => ({
  start: { row, column },
  end: { row: endRow, column: endColumn },
});

describe("batch data fill", () => {
  test("fills only blank literal cells, carries false and zero, and leaves a formula empty result", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: false });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "formula", formula: { source: '=""' } });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: 0 });
    const command = createFillBlanksCommand(session.workbook, sheet.id, range(0, 0, 3, 0), {
      mode: "up",
    });
    expect(command.changes).toHaveLength(1);
    expect(command.changes[0]).toMatchObject({
      address: { row: 1, column: 0 },
      content: { kind: "literal", value: false },
    });
    executeWorkbookCommand(session, command);
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: '=""' },
    });
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({ kind: "literal", value: 0 });
  });

  test("uses an adjacent boundary seed and propagates in the requested direction", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "seed" });
    const command = createFillBlanksCommand(session.workbook, sheet.id, range(1, 0, 3, 0), {
      mode: "up",
    });
    expect(command.changes.map((change) => change.content)).toEqual([
      { kind: "literal", value: "seed" },
      { kind: "literal", value: "seed" },
      { kind: "literal", value: "seed" },
    ]);
  });

  test("keeps a formula seed's calculated number type instead of copying its formula text", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=2+3" } });
    expect(
      createFillBlanksCommand(session.workbook, sheet.id, range(1, 0), { mode: "up" }).changes[0]
        ?.content,
    ).toEqual({ kind: "literal", value: 5 });
  });

  test("inserts Unicode text into computed formula values without treating results as formulas", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: '="A😀B"' } },
    );
    const command = createInsertCellTextCommand(session.workbook, sheet.id, range(0, 0), {
      position: "index",
      from: "left",
      index: 2,
      text: "=X",
    });
    expect(command.changes[0]?.content).toEqual({ kind: "literal", value: "A😀=XB" });
  });

  test("always prefixes or suffixes for start/end regardless of index direction", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "text" });
    expect(
      createInsertCellTextCommand(session.workbook, sheet.id, range(0, 0), {
        position: "start",
        from: "right",
        index: 99,
        text: "<",
      }).changes[0]?.content,
    ).toEqual({ kind: "literal", value: "<text" });
    expect(
      createInsertCellTextCommand(session.workbook, sheet.id, range(0, 0), {
        position: "end",
        from: "left",
        index: 0,
        text: ">",
      }).changes[0]?.content,
    ).toEqual({ kind: "literal", value: "text>" });
  });

  test("inserts into the formatted display text rather than an unpadded numeric value", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 12 });
    setCellStyle(sheet, { row: 0, column: 0 }, { numberFormat: { kind: "custom", code: "0000" } });
    expect(
      createInsertCellTextCommand(session.workbook, sheet.id, range(0, 0), {
        position: "end",
        from: "left",
        index: 0,
        text: "!",
      }).changes[0]?.content,
    ).toEqual({ kind: "literal", value: "0012!" });
  });

  test("writes date serials in each date system, preserves remaining style, and undoes once", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, fillColor: "#ffffff" });
    const command = createFillCurrentDateCommand(session.workbook, sheet.id, range(0, 0), {
      year: 1900,
      month: 1,
      day: 1,
      format: "yyyy-mm-dd",
    });
    executeWorkbookCommand(session, command);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 1 });
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toMatchObject({
      bold: true,
      fillColor: "#ffffff",
      numberFormat: { kind: "custom", code: "yyyy-mm-dd" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
    session.workbook.dateSystem = "1904";
    expect(
      createFillCurrentDateCommand(session.workbook, sheet.id, range(0, 1), {
        year: 1904,
        month: 1,
        day: 1,
        format: "m/d",
      }).changes[0]?.content,
    ).toEqual({ kind: "literal", value: 0 });
  });

  test("rejects protected and hidden targets before producing changes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.properties.protected = true;
    expect(() =>
      createInsertCellTextCommand(session.workbook, sheet.id, range(0, 0), {
        position: "start",
        from: "left",
        index: 0,
        text: "x",
      }),
    ).toThrow(DataFillError);
    sheet.properties.protected = false;
    sheet.hiddenRows = new Set([0]);
    expect(() =>
      createFillBlanksCommand(session.workbook, sheet.id, range(0, 0), {
        mode: "value",
        value: "x",
      }),
    ).toThrow(/hidden/i);
    sheet.hiddenRows = new Set();
    expect(() =>
      createFillBlanksCommand(session.workbook, sheet.id, range(0, 0), {
        mode: "value",
        value: Number.NaN,
      }),
    ).toThrow(/value/i);
  });

  test("shared preflight rejects merged cells, spill tails, filtered rows, and oversized ranges", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const fill = (target: ReturnType<typeof range>) =>
      createFillBlanksCommand(session.workbook, sheet.id, target, { mode: "value", value: "x" });
    sheet.mergedCells = [range(0, 0, 0, 1)];
    expect(() => fill(range(0, 0))).toThrow(/merged/i);
    sheet.mergedCells = [];
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    // A1 is outside target A2, but A2 is the formula's dynamic-array projection.
    expect(() => fill(range(1, 0))).toThrow(/dynamic-array/i);
    setCellContent(sheet, { row: 0, column: 0 }, null);
    sheet.filter = {
      range: range(0, 0, 2, 0),
      columns: [],
      advanced: { uniqueOnly: false, hiddenRows: [{ start: 1, end: 1 }] },
    };
    expect(() => fill(range(1, 0))).toThrow(/hidden/i);
    sheet.filter = null;
    expect(() => fill(range(0, 0, 100_000, 0))).toThrow(/at most/i);
  });
});
